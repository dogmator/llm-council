/**
 * API client for the LLM Council backend.
 */

import type {
  Conversation,
  ConversationMetadata,
  SendMessageRequest,
  SendMessageResponse,
  SSEEvent,
  SSEEventType,
} from '@llm-council/shared';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';

export const api = {
  /**
   * List all conversations.
   */
  async listConversations(): Promise<ConversationMetadata[]> {
    const response = await fetch(`${API_BASE}/api/conversations`);
    if (!response.ok) {
      throw new Error('Failed to list conversations');
    }
    return response.json() as Promise<ConversationMetadata[]>;
  },

  /**
   * Create a new conversation.
   */
  async createConversation(): Promise<Conversation> {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error('Failed to create conversation');
    }
    return response.json() as Promise<Conversation>;
  },

  /**
   * Get a specific conversation.
   */
  async getConversation(conversationId: string): Promise<Conversation> {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`);
    if (!response.ok) {
      throw new Error('Failed to get conversation');
    }
    return response.json() as Promise<Conversation>;
  },

  /**
   * Send a message in a conversation.
   */
  async sendMessage(
    conversationId: string,
    content: string
  ): Promise<SendMessageResponse> {
    const request: SendMessageRequest = { content };
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to send message');
    }
    return response.json() as Promise<SendMessageResponse>;
  },

  /**
   * Send a message and receive streaming updates.
   * @param conversationId - The conversation ID
   * @param content - The message content
   * @param onEvent - Callback function for each event: (eventType, event) => void
   * @returns Promise that resolves when streaming is complete
   */
  async sendMessageStream(
    conversationId: string,
    content: string,
    onEvent: (eventType: SSEEventType, event: SSEEvent) => void
  ): Promise<void> {
    const request: SendMessageRequest = { content };
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data) as SSEEvent;
            onEvent(event.type, event);
          } catch (e) {
            console.error('Failed to parse SSE event:', e);
          }
        }
      }
    }
  },
};


