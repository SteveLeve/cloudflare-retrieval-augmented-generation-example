import type { TextBlock } from '@anthropic-ai/sdk/resources';
import Anthropic from '@anthropic-ai/sdk';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { methodOverride } from 'hono/method-override'

// @ts-expect-error
import notes from './notes.html'
// @ts-expect-error
import ui from './ui.html'
// @ts-expect-error
import write from './write.html'
// @ts-expect-error
import chat from './chat.html'

type Env = {
	AI: Ai;
	ANTHROPIC_API_KEY: string;
	DATABASE: D1Database;
	ENABLE_TEXT_SPLITTING: boolean | undefined;
	RAG_WORKFLOW: Workflow;
	VECTOR_INDEX: VectorizeIndex
};

type Note = {
	id: string;
	text: string;
}

type Params = {
	text: string;
};

type Conversation = {
	id: string;
	created_at: number;
}

type Message = {
	id: string;
	conversation_id: string;
	role: 'user' | 'assistant';
	content: string;
	sources: string | null;
	created_at: number;
}

type ChatMessage = {
	role: 'user' | 'assistant';
	content: string;
	sources?: Array<{ id: string; text: string }>;
}

const app = new Hono<{ Bindings: Env }>()
app.use(cors())

app.get('/notes.json', async (c) => {
	const query = `SELECT * FROM notes`
	const { results } = await c.env.DATABASE.prepare(query).all()
	return c.json(results);
})

app.get('/notes', async (c) => {
	return c.html(notes);
})

app.use('/notes/:id', methodOverride({ app }))
app.delete('/notes/:id', async (c) => {
	const { id } = c.req.param();
	const query = `DELETE FROM notes WHERE id = ?`
	await c.env.DATABASE.prepare(query).bind(id).run()
	await c.env.VECTOR_INDEX.deleteByIds([id])
	return c.redirect('/notes')
})

app.post('/notes', async (c) => {
	const { text } = await c.req.json();
	if (!text) return c.text("Missing text", 400);
	await c.env.RAG_WORKFLOW.create({ params: { text } })
	return c.text("Created note", 201);
})

app.get('/ui', async (c) => {
	return c.html(ui);
})

app.get('/write', async (c) => {
	return c.html(write);
})

// Chat UI
app.get('/chat', async (c) => {
	return c.html(chat);
})

// Create new conversation
app.post('/chat/conversations', async (c) => {
	const id = crypto.randomUUID();
	const query = `INSERT INTO conversations (id) VALUES (?) RETURNING *`;
	const { results } = await c.env.DATABASE.prepare(query).bind(id).run<Conversation>();
	if (!results || results.length === 0) return c.text('Failed to create conversation', 500);
	return c.json(results[0]);
})

// Get conversation history
app.get('/chat/conversations/:id', async (c) => {
	const { id } = c.req.param();
	const query = `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`;
	const { results } = await c.env.DATABASE.prepare(query).bind(id).all<Message>();

	const messages: ChatMessage[] = results.map(msg => ({
		role: msg.role,
		content: msg.content,
		sources: msg.sources ? (() => {
			try {
				return JSON.parse(msg.sources);
			} catch {
				return undefined;
			}
		})() : undefined
	}));

	return c.json(messages);
})

// Send message and get response
app.post('/chat/conversations/:id/messages', async (c) => {
	const { id: conversationId } = c.req.param();
	const { message } = await c.req.json<{ message: string }>();

	if (!message) return c.text("Missing message", 400);

	// Check if conversation exists
	const conv = await c.env.DATABASE.prepare('SELECT id FROM conversations WHERE id = ?').bind(conversationId).first();
	if (!conv) return c.text('Conversation not found', 404);

	// Get conversation history for context (before inserting new message)
	const historyQuery = `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`;
	const { results: history } = await c.env.DATABASE.prepare(historyQuery).bind(conversationId).all<Message>();

	// Save user message
	const userMessageId = crypto.randomUUID();
	await c.env.DATABASE.prepare(
		`INSERT INTO messages (id, conversation_id, role, content, sources) VALUES (?, ?, ?, ?, ?)`
	).bind(userMessageId, conversationId, 'user', message, null).run();

	// Append the new user message to the history array
	const now = new Date().toISOString();
	history.push({
		id: userMessageId,
		conversation_id: conversationId,
		role: 'user',
		content: message,
		sources: null,
		created_at: now as any
	});

	// Generate embeddings for the user's message
	const embeddings = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [message] }) as { data: number[][] };
	const vectors = embeddings.data[0];

	// Query vector index for relevant notes
	const vectorQuery = await c.env.VECTOR_INDEX.query(vectors, { topK: 3 });
	const matchingIds = vectorQuery.matches.map(m => m.id).filter(Boolean);

	let retrievedNotes: Note[] = [];
	if (matchingIds.length > 0) {
		const placeholders = matchingIds.map(() => '?').join(',');
		const query = `SELECT * FROM notes WHERE id IN (${placeholders})`;
		const { results } = await c.env.DATABASE.prepare(query).bind(...matchingIds).all<Note>();
		retrievedNotes = results || [];
	}

	// Build context from retrieved notes
	const contextMessage = retrievedNotes.length
		? `Retrieved Documents:\n${retrievedNotes.map((note, idx) => `[${idx + 1}] (ID: ${note.id})\n${note.text}`).join("\n\n")}`
		: "No relevant documents found in the knowledge base.";

	// System prompt for document-constrained responses
	const systemPrompt = `You are a helpful AI assistant that answers questions based ONLY on the information provided in the retrieved documents.

IMPORTANT RULES:
1. You must ONLY use information from the "Retrieved Documents" section provided below
2. If no relevant documents are found, or if the documents don't contain information to answer the question, you MUST say "I don't have enough information in the knowledge base to answer that question."
3. When you use information from a document, you MUST cite it by including the document ID in your response like this: [ID: <document-id>]
4. Do NOT use any external knowledge or make assumptions beyond what's in the retrieved documents
5. Be concise and factual in your responses

${contextMessage}`;

	let modelUsed: string = "";
	let assistantMessage: string = "";

	// Build conversation messages for the AI
	const conversationMessages = history.map(msg => ({
		role: msg.role as 'user' | 'assistant',
		content: msg.content
	}));

	if (c.env.ANTHROPIC_API_KEY) {
		const anthropic = new Anthropic({
			apiKey: c.env.ANTHROPIC_API_KEY
		});

		const model = "claude-3-5-sonnet-latest";
		modelUsed = model;

		const response = await anthropic.messages.create({
			max_tokens: 2048,
			model,
			messages: conversationMessages,
			system: systemPrompt
		});

		assistantMessage = (response.content as TextBlock[]).map(content => content.text).join("\n");
	} else {
		const model = "@cf/meta/llama-3.1-8b-instruct" as any;
		modelUsed = model;

		const response = await c.env.AI.run(
			model,
			{
				messages: [
					{ role: 'system', content: systemPrompt },
					...conversationMessages
				]
			}
		) as AiTextGenerationOutput;

		assistantMessage = response.response || "Unable to generate response";
	}

	// Save assistant message with sources
	const assistantMessageId = crypto.randomUUID();
	const sources = retrievedNotes.length > 0 ? JSON.stringify(retrievedNotes.map(n => ({ id: n.id, text: n.text }))) : null;

	await c.env.DATABASE.prepare(
		`INSERT INTO messages (id, conversation_id, role, content, sources) VALUES (?, ?, ?, ?, ?)`
	).bind(assistantMessageId, conversationId, 'assistant', assistantMessage, sources).run();

	// Return the assistant's response with sources
	const responseData: ChatMessage = {
		role: 'assistant',
		content: assistantMessage,
		sources: retrievedNotes.length > 0 ? retrievedNotes.map(n => ({ id: n.id, text: n.text })) : undefined
	};

	c.header('x-model-used', modelUsed);
	return c.json(responseData);
})

app.get('/', async (c) => {
	const question = c.req.query('text') || "What is the square root of 9?"

	const embeddings = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [question] }) as { data: number[][] }
	const vectors = embeddings.data[0]

	const vectorQuery = await c.env.VECTOR_INDEX.query(vectors, { topK: 3 });
	const vecId = vectorQuery.matches[0]?.id

	let notes: string[] = []
	if (vecId) {
		const query = `SELECT * FROM notes WHERE id = ?`
		const { results } = await c.env.DATABASE.prepare(query).bind(vecId).all<Note>()
		if (results) notes = results.map(note => note.text)
	}

	const contextMessage = notes.length
		? `Context:\n${notes.map(note => `- ${note}`).join("\n")}`
		: ""

	const systemPrompt = `When answering the question or responding, use the context provided, if it is provided and relevant.`

	let modelUsed: string = ""
	let response: AiTextGenerationOutput | Anthropic.Message

	if (c.env.ANTHROPIC_API_KEY) {
		const anthropic = new Anthropic({
			apiKey: c.env.ANTHROPIC_API_KEY
		})

		const model = "claude-3-5-sonnet-latest"
		modelUsed = model

		const message = await anthropic.messages.create({
			max_tokens: 1024,
			model,
			messages: [
				{ role: 'user', content: question }
			],
			system: [systemPrompt, notes ?? contextMessage].join(" ")
		})

		response = {
			response: (message.content as TextBlock[]).map(content => content.text).join("\n")
		}
	} else {
		const model = "@cf/meta/llama-3.1-8b-instruct" as any
		modelUsed = model

		response = await c.env.AI.run(
			model,
			{
				messages: [
					...(notes.length ? [{ role: 'system', content: contextMessage }] : []),
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: question }
				]
			}
		) as AiTextGenerationOutput
	}

	if (response) {
		c.header('x-model-used', modelUsed)
		return c.text((response as any).response)
	} else {
		return c.text("We were unable to generate output", 500)
	}
})

export class RAGWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const env = this.env
		const { text } = event.payload;
		let texts: string[] = [text]

		if (env.ENABLE_TEXT_SPLITTING) {
			texts = await step.do('split text', async () => {
				const splitter = new RecursiveCharacterTextSplitter({
					// These can be customized to change the chunking size
					//chunkSize: 1000,
					//chunkOverlap: 200,
				});
				const output = await splitter.createDocuments([text]);
				return output.map(doc => doc.pageContent);
			})

			console.log("RecursiveCharacterTextSplitter generated ${texts.length} chunks")
		}

		for (const index in texts) {
			const text = texts[index]
			const record = await step.do(`create database record: ${index}/${texts.length}`, async () => {
				const id = crypto.randomUUID()
				const query = "INSERT INTO notes (id, text) VALUES (?, ?) RETURNING *"

				const { results } = await env.DATABASE.prepare(query)
					.bind(id, text)
					.run<Note>()

				const record = results[0]
				if (!record) throw new Error("Failed to create note")
				return record;
			})

			const embedding = await step.do(`generate embedding: ${index}/${texts.length}`, async () => {
				const embeddings = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [text] }) as { data: number[][] }
				const values = embeddings.data[0]
				if (!values) throw new Error("Failed to generate vector embedding")
				return values
			})

			await step.do(`insert vector: ${index}/${texts.length}`, async () => {
				return env.VECTOR_INDEX.upsert([
					{
						id: record.id.toString(),
						values: embedding,
					}
				]);
			})
		}
	}
}

export default app
