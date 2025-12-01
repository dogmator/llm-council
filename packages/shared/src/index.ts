/**
 * Shared types and interfaces for LLM Council
 * Used by both backend and frontend
 */

/**
 * Message role types
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Message interface for API communication
 */
export interface Message {
  role: MessageRole;
  content: string;
}

/**
 * Conversation message (stored in database)
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content?: string;
  stage1?: Stage1Result[];
  stage2?: Stage2Result[];
  stage3?: Stage3Result | null;
  metadata?: CouncilMetadata;
  timestamp?: string;
  loading?: {
    stage1: boolean;
    stage2: boolean;
    stage3: boolean;
  };
}

/**
 * Full conversation with all messages
 */
export interface Conversation {
  id: string;
  created_at: string;
  title: string;
  messages: ConversationMessage[];
}

/**
 * Conversation metadata (for listing)
 */
export interface ConversationMetadata {
  id: string;
  created_at: string;
  title: string;
  message_count: number;
}

/**
 * Stage 1: Individual model responses
 */
export interface Stage1Result {
  model: string;
  response: string;
}

/**
 * Stage 2: Peer rankings
 */
export interface Stage2Result {
  model: string;
  ranking: string;
  parsed_ranking: string[];
}

/**
 * Stage 3: Final synthesis
 */
export interface Stage3Result {
  model: string;
  response: string;
}

/**
 * Aggregate ranking result
 */
export interface AggregateRanking {
  model: string;
  average_rank: number;
  rankings_count: number;
}

/**
 * Council metadata (label mapping and aggregate rankings)
 */
export interface CouncilMetadata {
  label_to_model: Record<string, string>;
  aggregate_rankings: AggregateRanking[];
}

/**
 * API Response for sending a message (non-streaming)
 */
export interface SendMessageResponse {
  stage1: Stage1Result[];
  stage2: Stage2Result[];
  stage3: Stage3Result;
  metadata: CouncilMetadata;
}

/**
 * SSE Event types
 */
export type SSEEventType =
  | 'stage1_start'
  | 'stage1_complete'
  | 'stage2_start'
  | 'stage2_complete'
  | 'stage3_start'
  | 'stage3_complete'
  | 'title_complete'
  | 'complete'
  | 'error';

/**
 * SSE Event payload
 */
export interface SSEEvent {
  type: SSEEventType;
  data?: unknown;
  metadata?: CouncilMetadata;
  message?: string;
  title?: string;
}

/**
 * Request body for sending a message
 */
export interface SendMessageRequest {
  content: string;
}

/**
 * Request body for creating a conversation
 */
export interface CreateConversationRequest {
  // Empty for now, but can be extended
}

/**
 * Chat statistics
 */
export interface ChatStats {
  total_conversations: number;
  total_messages: number;
  oldest_conversation?: string;
  newest_conversation?: string;
}

/**
 * Export conversation format
 */
export interface ExportedConversation {
  conversation_id: string;
  exported_text: string;
}


