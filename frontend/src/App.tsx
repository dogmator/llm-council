import { useState, useEffect } from 'react';
import type {
  Conversation,
  ConversationMetadata,
  ConversationMessage,
  SSEEvent,
  SSEEventType,
} from '@llm-council/shared';
import Sidebar from './components/layout/Sidebar';
import ChatInterface from './components/layout/ChatInterface';
import { api } from './api';
import './App.css';

function App() {
  const [conversations, setConversations] = useState<ConversationMetadata[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Load conversations on mount
  useEffect(() => {
    void loadConversations();
  }, []);

  // Load conversation details when selected
  useEffect(() => {
    if (currentConversationId) {
      void loadConversation(currentConversationId);
    }
  }, [currentConversationId]);

  const loadConversations = async (): Promise<void> => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadConversation = async (id: string): Promise<void> => {
    try {
      const conv = await api.getConversation(id);
      // Normalize message data to ensure arrays are always arrays
      if (conv && conv.messages) {
        conv.messages = conv.messages.map((msg): ConversationMessage => {
          if (msg.role === 'assistant') {
            return {
              ...msg,
              stage1: Array.isArray(msg.stage1) ? msg.stage1 : [],
              stage2: Array.isArray(msg.stage2) ? msg.stage2 : [],
              stage3: msg.stage3 ?? null,
              metadata: msg.metadata ?? {},
              loading: {
                stage1: false,
                stage2: false,
                stage3: false,
              },
            };
          }
          return msg;
        });
      }
      setCurrentConversation(conv);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const handleNewConversation = async (): Promise<void> => {
    try {
      const newConv = await api.createConversation();
      setConversations([
        { id: newConv.id, created_at: newConv.created_at, title: newConv.title, message_count: 0 },
        ...conversations,
      ]);
      setCurrentConversationId(newConv.id);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSelectConversation = (id: string): void => {
    setCurrentConversationId(id);
  };

  const handleSendMessage = async (content: string): Promise<void> => {
    if (!currentConversationId) return;

    setIsLoading(true);
    try {
      // Optimistically add user message to UI
      const userMessage: ConversationMessage = { role: 'user', content };
      setCurrentConversation((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          messages: [...prev.messages, userMessage],
        };
      });

      // Create a partial assistant message that will be updated progressively
      const assistantMessage: ConversationMessage = {
        role: 'assistant',
        stage1: [],
        stage2: [],
        stage3: null,
        metadata: {},
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
      };

      // Add the partial assistant message
      setCurrentConversation((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          messages: [...prev.messages, assistantMessage],
        };
      });

      // Send message with streaming
      await api.sendMessageStream(currentConversationId, content, (eventType: SSEEventType, event: SSEEvent) => {
        switch (eventType) {
          case 'stage1_start':
            setCurrentConversation((prev) => {
              if (!prev) return null;
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (lastMsg && lastMsg.loading) {
                lastMsg.loading.stage1 = true;
              }
              return { ...prev, messages };
            });
            break;

          case 'stage1_complete':
            setCurrentConversation((prev) => {
              if (!prev) return null;
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (lastMsg && Array.isArray(event.data)) {
                lastMsg.stage1 = event.data;
              }
              if (lastMsg && lastMsg.loading) {
                lastMsg.loading.stage1 = false;
              }
              return { ...prev, messages };
            });
            break;

          case 'stage2_start':
            setCurrentConversation((prev) => {
              if (!prev) return null;
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (lastMsg && lastMsg.loading) {
                lastMsg.loading.stage2 = true;
              }
              return { ...prev, messages };
            });
            break;

          case 'stage2_complete':
            setCurrentConversation((prev) => {
              if (!prev) return null;
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (lastMsg) {
                // Ensure stage2 is always an array
                lastMsg.stage2 = Array.isArray(event.data) ? event.data : [];
                lastMsg.metadata = event.metadata ?? {};
                if (lastMsg.loading) {
                  lastMsg.loading.stage2 = false;
                }
              }
              return { ...prev, messages };
            });
            break;

          case 'stage3_start':
            setCurrentConversation((prev) => {
              if (!prev) return null;
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (lastMsg && lastMsg.loading) {
                lastMsg.loading.stage3 = true;
              }
              return { ...prev, messages };
            });
            break;

          case 'stage3_complete':
            setCurrentConversation((prev) => {
              if (!prev) return null;
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (lastMsg) {
                lastMsg.stage3 = (event.data as { model: string; response: string }) ?? null;
                if (lastMsg.loading) {
                  lastMsg.loading.stage3 = false;
                }
              }
              return { ...prev, messages };
            });
            break;

          case 'title_complete':
            // Reload conversations to get updated title
            void loadConversations();
            break;

          case 'complete':
            // Stream complete, reload conversations list
            void loadConversations();
            setIsLoading(false);
            break;

          case 'error':
            console.error('Stream error:', event.message);
            setIsLoading(false);
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      // Remove optimistic messages on error
      setCurrentConversation((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          messages: prev.messages.slice(0, -2),
        };
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />
      <ChatInterface
        conversation={currentConversation}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
      />
    </div>
  );
}

export default App;


