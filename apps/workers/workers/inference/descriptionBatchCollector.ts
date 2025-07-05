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
    if (this.pendingBookmarks.size === 0) {
      return;
    }

    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
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
        `[DescriptionBatchCollector] Failed to enqueue batch: ${error}`,
      );
      // In case of failure, we lose these bookmarks - they won't get descriptions
      // This is acceptable as description enhancement is not critical
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
