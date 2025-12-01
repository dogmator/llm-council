/**
 * JSON-based storage for conversations.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { DATA_DIR } from './config.js';
import { logger } from './logger.js';
import { isNotNull } from './utils.js';

export interface Conversation {
  id: string;
  created_at: string;
  title: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content?: string;
    stage1?: unknown[];
    stage2?: unknown[];
    stage3?: unknown;
    timestamp?: string;
  }>;
}

export interface ConversationMetadata {
  id: string;
  created_at: string;
  title: string;
  message_count: number;
}

/**
 * Ensure the data directory exists.
 */
async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    logger.error(`Failed to create data directory: ${error}`);
    throw error;
  }
}

/**
 * Get the file path for a conversation.
 */
function getConversationPath(conversationId: string): string {
  return join(DATA_DIR, `${conversationId}.json`);
}

/**
 * Create a new conversation.
 *
 * @param conversationId - Unique identifier for the conversation
 * @returns New conversation dict
 */
export async function createConversation(conversationId: string): Promise<Conversation> {
  logger.info(`Creating new conversation: ${conversationId}`);
  await ensureDataDir();

  const conversation: Conversation = {
    id: conversationId,
    created_at: new Date().toISOString(),
    title: 'New Conversation',
    messages: [],
  };

  // Save to file
  const path = getConversationPath(conversationId);
  await fs.writeFile(path, JSON.stringify(conversation, null, 2), 'utf-8');

  logger.info(`Conversation ${conversationId} saved to ${path}`);
  return conversation;
}

/**
 * Load a conversation from storage.
 *
 * @param conversationId - Unique identifier for the conversation
 * @returns Conversation dict or null if not found
 */
export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const path = getConversationPath(conversationId);

  try {
    const data = await fs.readFile(path, 'utf-8');
    return JSON.parse(data) as Conversation;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Save a conversation to storage.
 *
 * @param conversation - Conversation dict to save
 */
async function saveConversation(conversation: Conversation): Promise<void> {
  await ensureDataDir();

  const path = getConversationPath(conversation.id);
  await fs.writeFile(path, JSON.stringify(conversation, null, 2), 'utf-8');
}

/**
 * List all conversations (metadata only).
 *
 * @returns List of conversation metadata dicts
 */
export async function listConversations(): Promise<ConversationMetadata[]> {
  logger.info('Listing all conversations');
  await ensureDataDir();

  const conversations: ConversationMetadata[] = [];

  try {
    const files = await fs.readdir(DATA_DIR);

    // Process files in parallel for better performance
    const filePromises = files
      .filter((filename) => filename.endsWith('.json'))
      .map(async (filename) => {
        const path = join(DATA_DIR, filename);
        try {
          const data = await fs.readFile(path, 'utf-8');
          const conv = JSON.parse(data) as Conversation;
          return {
            id: conv.id,
            created_at: conv.created_at,
            title: conv.title || 'New Conversation',
            message_count: conv.messages?.length || 0,
          };
        } catch (error) {
          logger.error(`Error reading conversation file ${filename}: ${error}`);
          return null;
        }
      });

    const results = await Promise.all(filePromises);
    conversations.push(...results.filter(isNotNull));

    // Sort by creation time, newest first
    conversations.sort((a, b) => b.created_at.localeCompare(a.created_at));

    logger.info(`Found ${conversations.length} conversations`);
    return conversations;
  } catch (error) {
    logger.error(`Error listing conversations: ${error}`);
    return [];
  }
}

/**
 * Add a user message to a conversation.
 *
 * @param conversationId - Conversation identifier
 * @param content - User message content
 */
export async function addUserMessage(conversationId: string, content: string): Promise<void> {
  logger.info(`Adding user message to conversation ${conversationId}: ${content.substring(0, 100)}...`);
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  conversation.messages.push({
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
  });

  await saveConversation(conversation);
  logger.info(`User message added to conversation ${conversationId}`);
}

/**
 * Add an assistant message with all 3 stages to a conversation.
 *
 * @param conversationId - Conversation identifier
 * @param stage1 - List of individual model responses
 * @param stage2 - List of model rankings
 * @param stage3 - Final synthesized response
 */
export async function addAssistantMessage(
  conversationId: string,
  stage1: unknown[],
  stage2: unknown[],
  stage3: unknown
): Promise<void> {
  logger.info(`Adding assistant message to conversation ${conversationId}`);
  logger.info(`Stage 1 responses: ${stage1.length} models`);
  logger.info(`Stage 2 rankings: ${stage2.length} models`);
  logger.info(`Stage 3 chairman: ${(stage3 as { model?: string })?.model || 'Unknown'}`);

  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  conversation.messages.push({
    role: 'assistant',
    stage1,
    stage2,
    stage3,
    timestamp: new Date().toISOString(),
  });

  await saveConversation(conversation);
  logger.info(`Assistant message added to conversation ${conversationId}`);
}

/**
 * Update the title of a conversation.
 *
 * @param conversationId - Conversation identifier
 * @param title - New title for the conversation
 */
export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  logger.info(`Updating conversation ${conversationId} title to: ${title}`);
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  conversation.title = title;
  await saveConversation(conversation);
  logger.info(`Conversation ${conversationId} title updated`);
}

/**
 * Export a conversation as formatted text.
 *
 * @param conversationId - Conversation identifier
 * @returns Formatted text of the conversation or null if not found
 */
export async function exportConversation(conversationId: string): Promise<string | null> {
  logger.info(`Exporting conversation ${conversationId}`);
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    logger.warn(`Conversation ${conversationId} not found for export`);
    return null;
  }

  const lines: string[] = [];
  lines.push(`Conversation: ${conversation.title}`);
  lines.push(`ID: ${conversation.id}`);
  lines.push(`Created: ${conversation.created_at}`);
  lines.push('='.repeat(50));

  for (const msg of conversation.messages) {
    lines.push(`\n[${msg.role.toUpperCase()}] ${msg.timestamp || ''}`);
    if (msg.role === 'user') {
      lines.push(msg.content || '');
    } else if (msg.role === 'assistant') {
      lines.push('=== STAGE 1: Individual Responses ===');
      for (const response of (msg.stage1 || []) as Array<{ model?: string; response?: string }>) {
        lines.push(`\nModel: ${response.model || 'Unknown'}`);
        lines.push(response.response || '');
      }

      lines.push('\n=== STAGE 2: Peer Rankings ===');
      for (const ranking of (msg.stage2 || []) as Array<{ model?: string; ranking?: string }>) {
        lines.push(`\nModel: ${ranking.model || 'Unknown'}`);
        lines.push(ranking.ranking || '');
      }

      lines.push('\n=== STAGE 3: Final Synthesis ===');
      const stage3 = (msg.stage3 || {}) as { model?: string; response?: string };
      lines.push(`Chairman: ${stage3.model || 'Unknown'}`);
      lines.push(stage3.response || 'No response');
    }

    lines.push('-'.repeat(30));
  }

  const result = lines.join('\n');
  logger.info(`Conversation ${conversationId} exported (${result.length} characters)`);
  return result;
}

/**
 * Get statistics about all conversations.
 *
 * @returns Dictionary with chat statistics
 */
export async function getChatStats(): Promise<{
  total_conversations: number;
  total_messages: number;
  total_user_messages: number;
  total_assistant_messages: number;
  storage_location: string;
  oldest_conversation: string | null;
  newest_conversation: string | null;
}> {
  logger.info('Getting chat statistics');
  const conversations = await listConversations();

  let totalMessages = 0;
  let totalUserMessages = 0;
  let totalAssistantMessages = 0;

  for (const conv of conversations) {
    totalMessages += conv.message_count;
    const fullConv = await getConversation(conv.id);
    if (fullConv) {
      for (const msg of fullConv.messages) {
        if (msg.role === 'user') {
          totalUserMessages += 1;
        } else if (msg.role === 'assistant') {
          totalAssistantMessages += 1;
        }
      }
    }
  }

  const stats = {
    total_conversations: conversations.length,
    total_messages: totalMessages,
    total_user_messages: totalUserMessages,
    total_assistant_messages: totalAssistantMessages,
    storage_location: DATA_DIR,
    oldest_conversation: conversations.length > 0 ? conversations[conversations.length - 1].created_at : null,
    newest_conversation: conversations.length > 0 ? conversations[0].created_at : null,
  };

  logger.info(`Chat stats: ${JSON.stringify(stats)}`);
  return stats;
}
