import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { InferenceDescriptionBatchQueue } from "@karakeep/shared/queues";

interface PendingBookmark {
  bookmarkId: string;
  timestamp: number;
}

export class DescriptionBatchCollector {
  private pendingBookmarks = new Map<string, PendingBookmark>();
  private batchTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private readonly batchSize: number;
  private readonly batchTimeoutMs: number;
  private readonly maxEnqueueRetries = 3;
  private readonly retryBaseDelayMs: number;

  constructor() {
    this.batchSize = serverConfig.batchDescriptionEnhancement.batchSize;
    this.batchTimeoutMs =
      serverConfig.batchDescriptionEnhancement.batchTimeoutMs;
    this.retryBaseDelayMs = Math.min(this.batchTimeoutMs, 5000);
  }

  async addBookmark(
    bookmarkId: string,
    source: "admin" | "api" | "crawler",
  ): Promise<void> {
    // API sources should never get here (handled by inference worker)
    if (source === "api") {
      logger.warn(
        `[DescriptionBatchCollector] Received API source bookmark ${bookmarkId}, this should not happen`,
      );
      return;
    }

    // Admin sources are already batched by the admin router, so this shouldn't happen
    if (source === "admin") {
      logger.warn(
        `[DescriptionBatchCollector] Received admin source bookmark ${bookmarkId}, this should be handled by admin router`,
      );
      return;
    }

    // Crawler sources get collected and batched with timeout
    this.pendingBookmarks.set(bookmarkId, {
      bookmarkId,
      timestamp: Date.now(),
    });

    // Check if we've reached batch size
    if (this.pendingBookmarks.size >= this.batchSize) {
      // Clear timer before flushing to prevent race condition
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      await this.flushBatch(source);
      return;
    }

    // Start timer if not already running
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(async () => {
        await this.flushBatch(source);
      }, this.batchTimeoutMs);
    }
  }

  private async flushBatch(
    source: "admin" | "crawler",
    attempt = 0,
    retryBookmarkIds?: string[],
  ): Promise<void> {
    if (attempt === 0 && this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    let bookmarkIds: string[];
    if (retryBookmarkIds) {
      bookmarkIds = retryBookmarkIds;
    } else {
      if (this.pendingBookmarks.size === 0) {
        return;
      }
      bookmarkIds = Array.from(this.pendingBookmarks.values()).map(
        (b) => b.bookmarkId,
      );
      this.pendingBookmarks.clear();
    }

    if (bookmarkIds.length === 0) {
      return;
    }

    try {
      await InferenceDescriptionBatchQueue.enqueue({
        bookmarkIds,
        source,
      });

      logger.info(
        `[DescriptionBatchCollector] Enqueued batch of ${bookmarkIds.length} bookmarks for description enhancement (source: ${source})`,
      );
    } catch (error) {
      logger.error(
        `[DescriptionBatchCollector] Failed to enqueue batch of ${bookmarkIds.length} bookmarks (attempt ${attempt + 1}): ${error}`,
      );

      if (attempt < this.maxEnqueueRetries) {
        const backoffDelay = this.retryBaseDelayMs * Math.pow(2, attempt);
        logger.warn(
          `[DescriptionBatchCollector] Retrying enqueue in ${backoffDelay}ms (attempt ${
            attempt + 2
          }/${this.maxEnqueueRetries + 1})`,
        );
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.flushBatch(source, attempt + 1, bookmarkIds);
        }, backoffDelay);
        return;
      }

      logger.error(
        `[DescriptionBatchCollector] Exhausted retries for batch of bookmark IDs: ${bookmarkIds.join(
          ", ",
        )}. Re-queueing into pending cache for future flush.`,
      );
      for (const bookmarkId of bookmarkIds) {
        this.pendingBookmarks.set(bookmarkId, {
          bookmarkId,
          timestamp: Date.now(),
        });
      }
      if (!this.batchTimer) {
        this.batchTimer = setTimeout(async () => {
          await this.flushBatch(source);
        }, this.batchTimeoutMs);
      }
    }
  }

  // Called when shutting down to ensure pending bookmarks are processed
  async shutdown(): Promise<void> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.pendingBookmarks.size > 0) {
      await this.flushBatch("crawler");
    }
  }
}

// Singleton instance
export const descriptionBatchCollector = new DescriptionBatchCollector();
