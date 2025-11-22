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

import { Env, NoteRecord, VectorMetadata, CreateDocumentInput } from './types';
import { createLogger } from './utils/logger';
import { DocumentStore } from './utils/document-store';

type Note = {
	id: string;
	text: string;
}

type Params = {
	text: string;
	title?: string;
	contentType?: string;
	metadata?: Record<string, unknown>;
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

// Helper function to safely parse JSON sources
function parseSourcesSafely(sources: string | null): Array<{ id: string; text: string }> | undefined {
	if (!sources) return undefined;
	try {
		return JSON.parse(sources);
	} catch {
		return undefined;
	}
}

const app = new Hono<{ Bindings: Env }>()
app.use(cors())

// Documents endpoints
app.get('/documents', async (c) => {
	const logger = createLogger({ endpoint: 'GET /documents' });
	logger.info('Listing documents');

	try {
		const docStore = new DocumentStore(c.env, logger);
		const documents = await docStore.listDocuments();

		logger.info('Documents retrieved', { count: documents.length });
		return c.json({ documents, count: documents.length });
	} catch (error) {
		logger.error('Failed to list documents', error instanceof Error ? error : new Error(String(error)));
		return c.json({ error: 'Failed to list documents' }, 500);
	}
});

app.get('/documents/:id', async (c) => {
	const logger = createLogger({ endpoint: 'GET /documents/:id' });
	const { id } = c.req.param();

	logger.info('Retrieving document', { documentId: id });

	try {
		const docStore = new DocumentStore(c.env, logger);
		const document = await docStore.getDocument(id);

		if (!document) {
			logger.warn('Document not found', { documentId: id });
			return c.json({ error: 'Document not found' }, 404);
		}

		logger.info('Document retrieved', { documentId: id, chunkCount: document.chunks.length });
		return c.json(document);
	} catch (error) {
		logger.error('Failed to retrieve document', error instanceof Error ? error : new Error(String(error)), { documentId: id });
		return c.json({ error: 'Failed to retrieve document' }, 500);
	}
});

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
	const logger = createLogger({ endpoint: 'POST /notes' });
	logger.info('Received note creation request');

	// Validation constants
	const MAX_CONTENT_SIZE = 25 * 1024 * 1024; // 25 MiB (KV limit)
	const MAX_TITLE_LENGTH = 1000;

	const { text, title, contentType, metadata } = await c.req.json();

	// Validate text presence
	if (!text) {
		logger.warn('Missing text in request');
		return c.json({ error: "Missing text" }, 400);
	}

	// Validate content size (account for JSON serialization overhead with 20% safety margin)
	const estimatedSize = Math.ceil(new TextEncoder().encode(text).length * 1.2);
	if (estimatedSize > MAX_CONTENT_SIZE) {
		logger.warn('Content exceeds size limit', {
			size: estimatedSize,
			limit: MAX_CONTENT_SIZE
		});
		return c.json({
			error: `Content too large. Maximum size: ${MAX_CONTENT_SIZE} bytes (${Math.round(MAX_CONTENT_SIZE / 1024 / 1024)} MiB)`
		}, 400);
	}

	// Validate title length
	if (title && title.length > MAX_TITLE_LENGTH) {
		logger.warn('Title exceeds length limit', {
			length: title.length,
			limit: MAX_TITLE_LENGTH
		});
		return c.json({
			error: `Title too long. Maximum length: ${MAX_TITLE_LENGTH} characters`
		}, 400);
	}

	// Validate metadata is a proper object (not null, not array)
	if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))) {
		logger.warn('Invalid metadata type', { type: typeof metadata, isArray: Array.isArray(metadata) });
		return c.json({ error: "Metadata must be an object" }, 400);
	}

	const params: Params = {
		text,
		title: title || 'Untitled Document',
		contentType: contentType || 'text/plain',
		metadata: metadata || {},
	};

	logger.info('Creating workflow instance', {
		title: params.title,
		contentSize: estimatedSize,
		hasMetadata: !!Object.keys(params.metadata || {}).length
	});

	const instance = await c.env.RAG_WORKFLOW.create({ params });

	logger.info('Workflow created successfully', { instanceId: instance.id });
	return c.json({ message: "Created document", workflowId: instance.id }, 201);
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
		sources: parseSourcesSafely(msg.sources)
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
	const now = Math.floor(Date.now() / 1000);
	history.push({
		id: userMessageId,
		conversation_id: conversationId,
		role: 'user',
		content: message,
		sources: null,
		created_at: now
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
		const model: string = "@cf/meta/llama-3.1-8b-instruct";
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
	const logger = createLogger({ endpoint: 'GET /' });
	const question = c.req.query('text') || "What is the square root of 9?"

	logger.info('Received query', { question });
	logger.startTimer('query');

	// Generate embeddings for the question
	logger.debug('Generating embeddings for question');
	const embeddings = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [question] }) as { data: number[][] }
	const vectors = embeddings.data[0]
	logger.debug('Embeddings generated', { vectorDimensions: vectors.length });

	// Query vector index for similar content
	logger.debug('Querying vector index', { topK: 3 });
	const vectorQuery = await c.env.VECTOR_INDEX.query(vectors, { topK: 3, returnMetadata: true });
	logger.info('Vector query complete', { matchCount: vectorQuery.matches.length });

	const docStore = new DocumentStore(c.env, logger);

	// Retrieve notes and document metadata
	let notes: string[] = []
	let sources: Array<{ documentId: string; title: string; chunkText: string; similarity: number }> = []

	if (vectorQuery.matches.length > 0) {
		const noteIds = vectorQuery.matches.map(m => m.id);
		logger.debug('Retrieving notes', { noteIds });

		const noteRecords = await docStore.getNotesByIds(noteIds);
		notes = noteRecords.map(note => note.text);

		// Get document metadata for sources (batched query to avoid N+1 problem)
		const documentIds = [...new Set(noteRecords.map(n => n.document_id))];
		logger.debug('Retrieving document metadata', { documentIds, count: documentIds.length });

		// Batch query for all unique document IDs
		const placeholders = documentIds.map(() => '?').join(',');
		const docResults = await c.env.DATABASE
			.prepare(`SELECT id, title FROM documents WHERE id IN (${placeholders})`)
			.bind(...documentIds)
			.all<{ id: string; title: string }>();

		// Build document lookup map for O(1) access
		const docMap = new Map(
			(docResults.results || []).map(doc => [doc.id, doc])
		);
		logger.debug('Document metadata retrieved', { requested: documentIds.length, found: docMap.size });

		// Build sources array using the lookup map (no database calls in loop)
		for (const match of vectorQuery.matches) {
			const note = noteRecords.find(n => n.id === match.id);
			if (note) {
				const docResult = docMap.get(note.document_id);
				if (docResult) {
					sources.push({
						documentId: docResult.id,
						title: docResult.title,
						chunkText: note.text,
						similarity: match.score,
					});
				}
			}
		}

		logger.info('Retrieved context', { noteCount: notes.length, sourceCount: sources.length });
	} else {
		logger.info('No matching context found');
	}

	const contextMessage = notes.length
		? `Context:\n${notes.map(note => `- ${note}`).join("\n")}`
		: ""

	const systemPrompt = `When answering the question or responding, use the context provided, if it is provided and relevant.`

	let modelUsed: string = ""
	let response: AiTextGenerationOutput | Anthropic.Message

	logger.debug('Generating AI response');
	logger.startTimer('ai-generation');

	if (c.env.ANTHROPIC_API_KEY) {
		const anthropic = new Anthropic({
			apiKey: c.env.ANTHROPIC_API_KEY
		})

		const model = c.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001"
		modelUsed = model
		logger.debug('Using Anthropic Claude', { model });

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
		const model = "@cf/meta/llama-3.1-8b-instruct"
		modelUsed = model
		logger.debug('Using Workers AI', { model });

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

	logger.endTimer('ai-generation');

	if (response) {
		c.header('x-model-used', modelUsed)
		c.header('x-source-count', sources.length.toString())

		logger.endTimer('query', { success: true, modelUsed, sourceCount: sources.length });

		// Extract response text with type safety
		const responseText = typeof response === 'object' && response !== null && 'response' in response && typeof response.response === 'string'
			? response.response
			: '';
		if (sources.length > 0) {
			c.header('x-sources', JSON.stringify(sources));
		}

		return c.text(responseText)
	} else {
		logger.error('Failed to generate response', new Error('No response from AI'));
		logger.endTimer('query', { success: false });
		return c.text("We were unable to generate output", 500)
	}
})

export class RAGWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const env = this.env
		const { text, title = 'Untitled Document', contentType = 'text/plain', metadata = {} } = event.payload;

		const logger = createLogger({ workflow: 'RAGWorkflow', title });
		logger.info('Starting RAG workflow', {
			textLength: text.length,
			title,
			contentType
		});

		// Step 1: Generate document ID and store full document
		const documentId = await step.do('create document', async () => {
			const docId = crypto.randomUUID();
			logger.info('Generated document ID', { documentId: docId });

			const docStore = new DocumentStore(env, logger);
			const input: CreateDocumentInput = {
				content: text,
				title,
				contentType,
				metadata,
			};

			await docStore.createDocument(input, docId);
			logger.info('Document created successfully', { documentId: docId });

			return docId;
		});

		// Step 2: Split text into chunks if enabled
		let texts: string[] = [text]
		if (env.ENABLE_TEXT_SPLITTING === 'true') {
			texts = await step.do('split text', async () => {
				logger.info('Starting text splitting');
				const splitter = new RecursiveCharacterTextSplitter({
					// These can be customized to change the chunking size
					//chunkSize: 1000,
					//chunkOverlap: 200,
				});
				const output = await splitter.createDocuments([text]);
				const chunks = output.map(doc => doc.pageContent);
				logger.info('Text splitting complete', { chunkCount: chunks.length });
				return chunks;
			})
		}

		logger.info('Processing chunks', { totalChunks: texts.length });

		// Step 3: Process each chunk
		for (const index in texts) {
			const chunkText = texts[index]
			const chunkIndex = parseInt(index);
			logger.debug('Processing chunk', { chunkIndex, textLength: chunkText.length });

			const noteRecord = await step.do(`create note record ${chunkIndex}/${texts.length}`, async () => {
				const noteId = crypto.randomUUID()
				logger.debug('Creating note record', { noteId, chunkIndex, documentId });

				const note: NoteRecord = {
					id: noteId,
					document_id: documentId,
					text: chunkText,
					chunk_index: chunkIndex,
				};

				const docStore = new DocumentStore(env, logger);
				await docStore.createNote(note);
				logger.debug('Note record created', { noteId, chunkIndex });

				return note;
			})

			const embedding = await step.do(`generate embedding ${chunkIndex}/${texts.length}`, async () => {
				logger.debug('Generating embedding', { noteId: noteRecord.id, chunkIndex });

				const embeddings = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
					text: [chunkText]
				}) as { data: number[][] }

				const values = embeddings.data[0]
				if (!values) {
					logger.error('Failed to generate embedding', undefined, { noteId: noteRecord.id, chunkIndex });
					throw new Error("Failed to generate vector embedding")
				}

				logger.debug('Embedding generated', {
					noteId: noteRecord.id,
					chunkIndex,
					vectorDimensions: values.length
				});

				return values
			})

			await step.do(`insert vector ${chunkIndex}/${texts.length}`, async () => {
				logger.debug('Inserting vector', { noteId: noteRecord.id, chunkIndex });

				const vectorMetadata: VectorMetadata = {
					document_id: documentId,
					note_id: noteRecord.id,
					chunk_index: chunkIndex,
				};

				await env.VECTOR_INDEX.upsert([
					{
						id: noteRecord.id,
						values: embedding,
						metadata: vectorMetadata,
					}
				]);

				logger.debug('Vector inserted', { noteId: noteRecord.id, chunkIndex });
			})
		}

		// Step 4: Update document chunk count
		await step.do('update chunk count', async () => {
			logger.info('Updating document chunk count', { documentId, chunkCount: texts.length });

			const docStore = new DocumentStore(env, logger);
			await docStore.updateChunkCount(documentId, texts.length);

			logger.info('Chunk count updated', { documentId, chunkCount: texts.length });
		});

		logger.info('RAG workflow completed successfully', {
			documentId,
			chunkCount: texts.length
		});
	}
}

export default app
