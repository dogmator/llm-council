/**
 * OpenRouter API client with retry logic, caching, and connection pooling.
 */

import {
  OPENROUTER_API_KEY,
  OPENROUTER_API_URL,
  DEFAULT_TIMEOUT,
  CHAIRMAN_TIMEOUT,
  TITLE_GENERATION_TIMEOUT,
} from './config.js';
import { logger } from './logger.js';
import { withRetry } from './retry.js';
import { optimizedFetch } from './http-client.js';
import { responseCache, getResponseCacheKey } from './cache.js';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ModelResponse {
  content: string | null;
  reasoning_details?: unknown;
}

/**
 * Query a single model via OpenRouter API with retry, caching, and connection pooling.
 *
 * @param model - OpenRouter model identifier (e.g., "openai/gpt-4o")
 * @param messages - List of message dicts with 'role' and 'content'
 * @param timeout - Request timeout in seconds (optional, uses DEFAULT_TIMEOUT if not provided)
 * @param useCache - Whether to use cache (default: true)
 * @returns Response dict with 'content' and optional 'reasoning_details', or null if failed
 */
export async function queryModel(
  model: string,
  messages: Message[],
  timeout?: number,
  useCache = true
): Promise<ModelResponse | null> {
  const requestTimeout = timeout ?? DEFAULT_TIMEOUT;

  // Check cache first
  if (useCache) {
    const cacheKey = getResponseCacheKey(model, messages);
    const cached = responseCache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for model ${model}`);
      return JSON.parse(cached) as ModelResponse;
    }
  }

  logger.info(`Querying model: ${model}`);
  logger.debug(`Messages: ${JSON.stringify(messages)}`);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/llm-council', // Optional: for OpenRouter analytics
  };

  const payload = {
    model,
    messages,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeout * 1000);

  // Use retry logic with circuit breaker
  const result = await withRetry(
    async () => {
      const response = await optimizedFetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const statusCode = response.status;
      logger.info(`Response status: ${statusCode}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const error = new Error(`HTTP ${statusCode}: ${errorText.substring(0, 500)}`);
        (error as Error & { statusCode?: number }).statusCode = statusCode;
        throw error;
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content?: string | null; reasoning_details?: unknown } }>;
      };
      const message = data.choices[0]?.message;

      if (!message) {
        throw new Error('No message in response');
      }

      const modelResponse: ModelResponse = {
        content: message.content ?? null,
        reasoning_details: message.reasoning_details,
      };

      // Cache successful response
      if (useCache) {
        const cacheKey = getResponseCacheKey(model, messages);
        responseCache.set(cacheKey, JSON.stringify(modelResponse));
      }

      logger.info(`Successfully got response from ${model}`);
      return modelResponse;
    },
    `openrouter:${model}`,
    {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      retryableErrors: [429, 500, 502, 503, 504, 'AbortError', 'ECONNRESET', 'ETIMEDOUT'],
    }
  );

  clearTimeout(timeoutId);
  return result;
}

/**
 * Query multiple models in parallel with optimized connection pooling.
 *
 * @param models - List of OpenRouter model identifiers
 * @param messages - List of message dicts to send to each model
 * @param useCache - Whether to use cache (default: true)
 * @returns Dict mapping model identifier to response dict (or null if failed)
 */
export async function queryModelsParallel(
  models: string[],
  messages: Message[],
  useCache = true
): Promise<Record<string, ModelResponse | null>> {
  // Create tasks for all models
  const tasks = models.map((model) => queryModel(model, messages, undefined, useCache));

  // Wait for all to complete
  const responses = await Promise.all(tasks);

  // Map models to their responses
  const result: Record<string, ModelResponse | null> = {};
  for (let i = 0; i < models.length; i++) {
    result[models[i]] = responses[i] ?? null;
  }

  return result;
}

// Export timeout constants for use in other modules
export { CHAIRMAN_TIMEOUT, TITLE_GENERATION_TIMEOUT };
