/**
 * In-memory cache with TTL and LRU eviction.
 */

import { logger } from './logger.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
}

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly ttl: number;
  private readonly maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.ttl = options.ttl ?? 300000; // Default 5 minutes
    this.maxSize = options.maxSize ?? 1000;
  }

  set(key: string, value: T, customTtl?: number): void {
    const now = Date.now();
    const ttl = customTtl ?? this.ttl;

    // Evict expired entries if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictExpired();
      // If still full, evict least recently used
      if (this.cache.size >= this.maxSize) {
        this.evictLRU();
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: now + ttl,
      lastAccessed: now,
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();

    // Check if expired
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Update last accessed time
    entry.lastAccessed = now;
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    this.evictExpired();
    return this.cache.size;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      logger.debug(`Evicted LRU cache entry: ${lruKey}`);
    }
  }

  getStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.size(),
      maxSize: this.maxSize,
      hitRate: 0, // Could be implemented with hit/miss tracking
    };
  }
}

// Global caches
export const responseCache = new LRUCache<string>({
  ttl: 3600000, // 1 hour for LLM responses
  maxSize: 500,
});

export const titleCache = new LRUCache<string>({
  ttl: 86400000, // 24 hours for titles
  maxSize: 1000,
});

export const conversationCache = new LRUCache<unknown>({
  ttl: 300000, // 5 minutes for conversation metadata
  maxSize: 200,
});

/**
 * Generate cache key for LLM response.
 */
export function getResponseCacheKey(model: string, messages: unknown[]): string {
  const messagesHash = JSON.stringify(messages).slice(0, 200);
  return `response:${model}:${messagesHash}`;
}

/**
 * Generate cache key for conversation title.
 */
export function getTitleCacheKey(query: string): string {
  return `title:${query.slice(0, 100)}`;
}

/**
 * Clear all caches (useful for testing or memory management).
 */
export function clearAllCaches(): void {
  responseCache.clear();
  titleCache.clear();
  conversationCache.clear();
  logger.info('All caches cleared');
}


