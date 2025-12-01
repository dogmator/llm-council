/**
 * Optimized SSE streaming with backpressure handling and chunking.
 */

import type { ServerResponse } from 'http';
import { logger } from './logger.js';

interface StreamOptions {
  highWaterMark?: number; // Buffer size before backpressure
  chunkSize?: number; // Size of each chunk in bytes
  flushInterval?: number; // Flush interval in milliseconds
}

/**
 * Optimized SSE stream writer with backpressure handling.
 */
export class OptimizedSSEStream {
  private response: ServerResponse;
  private buffer: string[] = [];
  private bufferSize = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly highWaterMark: number;
  private readonly chunkSize: number;
  private readonly flushInterval: number;
  private isClosed = false;

  constructor(response: ServerResponse, options: StreamOptions = {}) {
    this.response = response;
    this.highWaterMark = options.highWaterMark ?? 16384; // 16KB default
    this.chunkSize = options.chunkSize ?? 8192; // 8KB chunks
    this.flushInterval = options.flushInterval ?? 100; // 100ms flush interval

    // Set up periodic flushing
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Write data to stream with backpressure handling.
   */
  async write(data: string): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.buffer.push(data);
    this.bufferSize += Buffer.byteLength(data, 'utf8');

    // Check backpressure
    if (this.bufferSize >= this.highWaterMark) {
      await this.flush();
    }
  }

  /**
   * Flush buffered data to response.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.isClosed) {
      return;
    }

    try {
      // Write in chunks to avoid blocking
      while (this.buffer.length > 0) {
        const chunk: string[] = [];
        let chunkSize = 0;

        // Collect chunk
        while (this.buffer.length > 0 && chunkSize < this.chunkSize) {
          const item = this.buffer.shift()!;
          chunk.push(item);
          chunkSize += Buffer.byteLength(item, 'utf8');
        }

        // Write chunk
        const chunkData = chunk.join('');
        const canContinue = this.response.write(chunkData);

        if (!canContinue) {
          // Backpressure: wait for drain event
          await new Promise<void>((resolve) => {
            this.response.once('drain', resolve);
          });
        }
      }

      this.bufferSize = 0;
    } catch (error) {
      logger.error(`Error flushing SSE stream: ${error}`);
      this.close();
    }
  }

  /**
   * Close the stream.
   */
  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush remaining data
    await this.flush();

    // End response
    try {
      this.response.end();
    } catch (error) {
      logger.error(`Error closing SSE stream: ${error}`);
    }
  }

  /**
   * Write SSE event.
   */
  async writeEvent(type: string, data: unknown): Promise<void> {
    const event = `data: ${JSON.stringify({ type, data })}\n\n`;
    await this.write(event);
  }
}


