/**
 * Retry logic with exponential backoff and circuit breaker pattern.
 */

import { logger } from './logger.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: Array<number | string>;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly halfOpenTimeout: number;

  constructor(
    failureThreshold = 5,
    resetTimeout = 60000, // 1 minute
    halfOpenTimeout = 30000 // 30 seconds
  ) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.halfOpenTimeout = halfOpenTimeout;
  }

  canExecute(): boolean {
    const now = Date.now();

    if (this.state === 'open') {
      if (now - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
        logger.info('Circuit breaker: transitioning to half-open');
        return true;
      }
      return false;
    }

    if (this.state === 'half-open') {
      if (now - this.lastFailureTime > this.halfOpenTimeout) {
        this.state = 'closed';
        this.failures = 0;
        logger.info('Circuit breaker: transitioning to closed (recovered)');
      }
    }

    return true;
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.failures = 0;
      logger.info('Circuit breaker: recovered, transitioning to closed');
    } else if (this.state === 'closed') {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  recordFailure(): void {
    this.failures += 1;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold && this.state !== 'open') {
      this.state = 'open';
      logger.warn(`Circuit breaker: opened after ${this.failures} failures`);
    }
  }

  getState(): CircuitBreakerState {
    return {
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      state: this.state,
    };
  }
}

// Per-model circuit breakers
const circuitBreakers = new Map<string, CircuitBreaker>();

function getCircuitBreaker(key: string): CircuitBreaker {
  if (!circuitBreakers.has(key)) {
    circuitBreakers.set(key, new CircuitBreaker());
  }
  return circuitBreakers.get(key)!;
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable.
 */
function isRetryableError(error: unknown, retryableErrors: Array<number | string>): boolean {
  if (error instanceof Error) {
    // Network errors are retryable
    if (error.name === 'AbortError' || error.name === 'TypeError') {
      return true;
    }

    // Check for HTTP status codes
    const statusMatch = error.message.match(/\b(\d{3})\b/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      return retryableErrors.includes(status) || (status >= 500 && status < 600);
    }

    // Check for error names
    return retryableErrors.some((err) => error.name.includes(String(err)));
  }

  return false;
}

/**
 * Execute function with retry logic, exponential backoff, and circuit breaker.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  key: string,
  options: RetryOptions = {}
): Promise<T | null> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    retryableErrors = [429, 500, 502, 503, 504, 'AbortError', 'ECONNRESET', 'ETIMEDOUT'],
  } = options;

  const circuitBreaker = getCircuitBreaker(key);

  // Check circuit breaker
  if (!circuitBreaker.canExecute()) {
    logger.warn(`Circuit breaker is open for ${key}, skipping execution`);
    return null;
  }

  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      // Check if error is retryable
      if (!isRetryableError(error, retryableErrors)) {
        logger.error(`Non-retryable error for ${key}: ${error}`);
        circuitBreaker.recordFailure();
        return null;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        logger.error(`Max retries (${maxRetries}) reached for ${key}: ${error}`);
        circuitBreaker.recordFailure();
        return null;
      }

      logger.warn(`Attempt ${attempt + 1}/${maxRetries + 1} failed for ${key}, retrying in ${delay}ms: ${error}`);

      // Wait with exponential backoff
      await sleep(Math.min(delay, maxDelay));
      delay *= backoffMultiplier;
    }
  }

  circuitBreaker.recordFailure();
  return null;
}

/**
 * Get circuit breaker state for monitoring.
 */
export function getCircuitBreakerState(key: string): CircuitBreakerState | null {
  const breaker = circuitBreakers.get(key);
  return breaker ? breaker.getState() : null;
}

