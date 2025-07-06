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
  private readonly batchSize: number;
  private readonly batchTimeoutMs: number;

  constructor() {
    this.batchSize = serverConfig.batchDescriptionEnhancement.batchSize;
    this.batchTimeoutMs =
      serverConfig.batchDescriptionEnhancement.batchTimeoutMs;
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

  private async flushBatch(source: "admin" | "crawler"): Promise<void> {
    // Clear timer first to prevent race conditions
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Check if there are any bookmarks to process
    if (this.pendingBookmarks.size === 0) {
      return;
    }

    // Extract bookmark IDs
    const bookmarkIds = Array.from(this.pendingBookmarks.values()).map(
      (b) => b.bookmarkId,
    );
    this.pendingBookmarks.clear();

    // Enqueue batch job
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
        `[DescriptionBatchCollector] Failed to enqueue batch of ${bookmarkIds.length} bookmarks: ${error}`,
      );
      
      // TODO: Implement retry mechanism or fallback to individual processing
      // For now, log the failed bookmark IDs for potential manual recovery
      logger.warn(
        `[DescriptionBatchCollector] Lost batch of bookmark IDs: ${bookmarkIds.join(', ')}`
      );
      
      // Description enhancement is not critical, so we continue without throwing
    }
  }

  // Called when shutting down to ensure pending bookmarks are processed
  async shutdown(): Promise<void> {
    if (this.pendingBookmarks.size > 0) {
      await this.flushBatch("crawler");
    }
  }
}

// Singleton instance
export const descriptionBatchCollector = new DescriptionBatchCollector();
