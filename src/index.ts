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
import documents from './documents.html'

import { Env, NoteRecord, VectorMetadata, DocumentRecord, CreateDocumentInput } from './types';
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

	const { text, title, contentType, metadata } = await c.req.json();
	if (!text) {
		logger.warn('Missing text in request');
		return c.text("Missing text", 400);
	}

	const params: Params = {
		text,
		title: title || 'Untitled Document',
		contentType: contentType || 'text/plain',
		metadata: metadata || {},
	};

	logger.info('Creating workflow instance', { title: params.title });
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

app.get('/documents/ui', async (c) => {
	return c.html(documents);
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

		// Get document metadata for sources
		const documentIds = [...new Set(noteRecords.map(n => n.document_id))];
		logger.debug('Retrieving document metadata', { documentIds });

		for (const match of vectorQuery.matches) {
			const note = noteRecords.find(n => n.id === match.id);
			if (note) {
				const docResult = await c.env.DATABASE
					.prepare('SELECT id, title FROM documents WHERE id = ?')
					.bind(note.document_id)
					.first<{ id: string; title: string }>();

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

		const model = "claude-3-5-sonnet-latest"
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
		const model = "@cf/meta/llama-3.1-8b-instruct" as any
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

		// Return text response with source information in header
		const responseText = (response as any).response;
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
		if (env.ENABLE_TEXT_SPLITTING) {
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
