/**
 * Fastify backend for LLM Council.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
  BACKEND_PORT,
  BACKEND_HOST,
  CORS_ORIGINS,
  LOG_LEVEL,
} from './config.js';
import { logger } from './logger.js';
import {
  createConversation,
  getConversation,
  listConversations,
  addUserMessage,
  addAssistantMessage,
  updateConversationTitle,
  exportConversation,
  getChatStats,
} from './storage.js';
import {
  runFullCouncil,
  generateConversationTitle,
  stage1CollectResponses,
  stage2CollectRankings,
  stage3SynthesizeFinal,
  calculateAggregateRankings,
} from './council.js';
import { OptimizedSSEStream } from './stream-optimizer.js';
import { closeHttpClient } from './http-client.js';

// Create Fastify instance
const app = Fastify({
  logger: {
    level: LOG_LEVEL,
  },
});

// Request/Response schemas using Zod
const CreateConversationRequestSchema = z.object({});

const SendMessageRequestSchema = z.object({
  content: z.string().min(1, 'Message content cannot be empty'),
});

// Startup hook
app.addHook('onReady', async () => {
  logger.info('LLM Council API starting up...');
  logger.info(`CORS enabled for: ${CORS_ORIGINS.join(', ')}`);
});

// Shutdown hook
app.addHook('onClose', async () => {
  logger.info('LLM Council API shutting down...');
});

/**
 * Health check endpoint.
 */
app.get('/', async () => {
  logger.info('Health check endpoint accessed');
  return { status: 'ok', service: 'LLM Council API' };
});

/**
 * List all conversations (metadata only).
 */
app.get('/api/conversations', async () => {
  return await listConversations();
});

/**
 * Create a new conversation.
 */
app.post('/api/conversations', async (request) => {
  // Validate request (empty object)
  CreateConversationRequestSchema.parse(request.body);

  const conversationId = randomUUID();
  const conversation = await createConversation(conversationId);
  return conversation;
});

/**
 * Get a specific conversation with all its messages.
 */
app.get<{ Params: { conversation_id: string } }>(
  '/api/conversations/:conversation_id',
  async (request, reply) => {
    const { conversation_id: conversationId } = request.params;
    const conversation = await getConversation(conversationId);
    if (conversation === null) {
      return reply.code(404).send({ error: 'Conversation not found' });
    }
    return conversation;
  }
);

/**
 * Send a message and run the 3-stage council process.
 * Returns the complete response with all stages.
 */
app.post<{ Params: { conversation_id: string }; Body: { content: string } }>(
  '/api/conversations/:conversation_id/message',
  async (request, reply) => {
    const { conversation_id: conversationId } = request.params;
    const body = SendMessageRequestSchema.parse(request.body);

    // Check if conversation exists
    const conversation = await getConversation(conversationId);
    if (conversation === null) {
      return reply.code(404).send({ error: 'Conversation not found' });
    }

    // Check if this is the first message
    const isFirstMessage = conversation.messages.length === 0;

    // Add user message
    await addUserMessage(conversationId, body.content);

    // If this is the first message, generate a title
    if (isFirstMessage) {
      const title = await generateConversationTitle(body.content);
      await updateConversationTitle(conversationId, title);
    }

    // Run the 3-stage council process
    const [stage1Results, stage2Results, stage3Result, metadata] = await runFullCouncil(body.content);

    // Add assistant message with all stages
    await addAssistantMessage(conversationId, stage1Results, stage2Results, stage3Result);

    // Return the complete response with metadata
    return {
      stage1: stage1Results,
      stage2: stage2Results,
      stage3: stage3Result,
      metadata,
    };
  }
);

/**
 * Send a message and stream the 3-stage council process.
 * Returns Server-Sent Events as each stage completes.
 */
app.post<{ Params: { conversation_id: string }; Body: { content: string } }>(
  '/api/conversations/:conversation_id/message/stream',
  async (request, reply) => {
    const { conversation_id: conversationId } = request.params;
    const body = SendMessageRequestSchema.parse(request.body);

    // Check if conversation exists
    const conversation = await getConversation(conversationId);
    if (conversation === null) {
      return reply.code(404).send({ error: 'Conversation not found' });
    }

    // Check if this is the first message
    const isFirstMessage = conversation.messages.length === 0;

    // Set headers for SSE
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    // Use optimized SSE stream with backpressure handling
    const stream = new OptimizedSSEStream(reply.raw);

    try {
      // Add user message
      await addUserMessage(conversationId, body.content);

      // Start title generation in parallel (don't await yet)
      let titlePromise: Promise<string> | null = null;
      if (isFirstMessage) {
        titlePromise = generateConversationTitle(body.content);
      }

      // Stage 1: Collect responses
      await stream.writeEvent('stage1_start', {});
      const stage1Results = await stage1CollectResponses(body.content);
      await stream.writeEvent('stage1_complete', stage1Results);

      // Stage 2: Collect rankings
      await stream.writeEvent('stage2_start', {});
      const [stage2Results, labelToModel] = await stage2CollectRankings(body.content, stage1Results);
      const aggregateRankings = calculateAggregateRankings(stage2Results, labelToModel);
      await stream.writeEvent('stage2_complete', {
        data: stage2Results,
        metadata: { label_to_model: labelToModel, aggregate_rankings: aggregateRankings },
      });

      // Stage 3: Synthesize final answer
      await stream.writeEvent('stage3_start', {});
      const stage3Result = await stage3SynthesizeFinal(body.content, stage1Results, stage2Results);
      await stream.writeEvent('stage3_complete', stage3Result);

      // Wait for title generation if it was started
      if (titlePromise) {
        const title = await titlePromise;
        await updateConversationTitle(conversationId, title);
        await stream.writeEvent('title_complete', { title });
      }

      // Save complete assistant message
      await addAssistantMessage(conversationId, stage1Results, stage2Results, stage3Result);

      // Send completion event
      await stream.writeEvent('complete', {});
    } catch (error) {
      // Send error event
      const errorMessage = error instanceof Error ? error.message : String(error);
      await stream.writeEvent('error', { message: errorMessage });
    } finally {
      // Close stream
      await stream.close();
    }
  }
);

/**
 * Get statistics about all conversations.
 */
app.get('/api/chats/stats', async () => {
  return await getChatStats();
});

/**
 * Export a conversation as formatted text.
 */
app.get<{ Params: { conversation_id: string } }>(
  '/api/chats/:conversation_id/export',
  async (request, reply) => {
    const { conversation_id: conversationId } = request.params;
    const exported = await exportConversation(conversationId);
    if (exported === null) {
      return reply.code(404).send({ error: 'Conversation not found' });
    }

    return { conversation_id: conversationId, exported_text: exported }; // API contract uses snake_case
  }
);

/**
 * Debug endpoint to show chat storage information.
 */
app.get('/api/chats/debug', async () => {
  const stats = await getChatStats();
  const conversations = await listConversations();

  return {
    storage_stats: stats,
    conversations: conversations.slice(0, 5), // Show first 5 conversations
    total_conversations_found: conversations.length,
  };
});

// Start server
const start = async () => {
  try {
    // Register CORS
    await app.register(cors, {
      origin: CORS_ORIGINS,
      credentials: true,
      methods: ['*'],
      allowedHeaders: ['*'],
    });

    await app.listen({ port: BACKEND_PORT, host: BACKEND_HOST });
    logger.info(`Server listening on http://${BACKEND_HOST}:${BACKEND_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await closeHttpClient();
  await app.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await closeHttpClient();
  await app.close();
  process.exit(0);
});

start();
