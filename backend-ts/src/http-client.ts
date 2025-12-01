/**
 * Optimized HTTP client with request deduplication.
 * Uses undici's fetch which already has connection pooling.
 */

import { fetch } from 'undici';
import type { Response } from 'undici';
import { logger } from './logger.js';

// Request deduplication cache (for identical concurrent requests)
const pendingRequests = new Map<string, Promise<Response>>();

/**
 * Generate cache key for request deduplication.
 */
function getRequestKey(url: string, body: string | undefined, method: string | undefined): string {
  const bodyHash = body ? body.slice(0, 100) : '';
  return `${url}:${method || 'GET'}:${bodyHash}`;
}

/**
 * Optimized fetch with request deduplication.
 * Undici's fetch already uses connection pooling internally.
 */
export async function optimizedFetch(
  url: string | URL,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  } = {}
): Promise<Response> {
  const urlString = typeof url === 'string' ? url : url.toString();
  const requestKey = getRequestKey(urlString, options.body, options.method);

  // Check if identical request is already pending
  const pendingRequest = pendingRequests.get(requestKey);
  if (pendingRequest) {
    logger.debug(`Deduplicating request: ${requestKey}`);
    // Clone the response for concurrent requests
    const response = await pendingRequest;
    return response.clone();
  }

  // Create new request using undici's fetch (which has built-in connection pooling)
  const requestPromise = fetch(urlString, {
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body,
    signal: options.signal,
  }).finally(() => {
    // Remove from pending requests after completion
    pendingRequests.delete(requestKey);
  });

  // Store pending request
  pendingRequests.set(requestKey, requestPromise);

  return requestPromise;
}

/**
 * Cleanup function to clear pending requests.
 */
export async function closeHttpClient(): Promise<void> {
  pendingRequests.clear();
  logger.info('HTTP client cleaned up');
}
