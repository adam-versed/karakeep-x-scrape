import * as dns from "dns";
import { Browser, BrowserContext } from "playwright";
import { chromium } from "playwright-extra";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

interface ContextPoolItem {
  context: BrowserContext;
  inUse: boolean;
  lastUsed: Date;
}

class BrowserPool {
  private browser: Browser | null = null;
  private contextPool: ContextPoolItem[] = [];
  private maxContexts = 5; // Maximum number of contexts to pool
  private reconnecting = false;
  private initializationPromise: Promise<void> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1000; // 1 second
  private waitingResolvers: ((context: BrowserContext | null) => void)[] = [];

  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize();
    return this.initializationPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      this.browser = await this.startBrowserInstance();
      if (this.browser) {
        this.browser.on("disconnected", () => {
          logger.warn(
            "[BrowserPool] Browser disconnected, will attempt to reconnect",
          );
          this.reconnect();
        });
      }
    } catch (error) {
      logger.error("[BrowserPool] Failed to initialize browser:", error);
      throw error;
    }
  }

  private async startBrowserInstance(): Promise<Browser | null> {
    if (serverConfig.crawler.browserWebSocketUrl) {
      logger.info(
        `[BrowserPool] Connecting to existing browser websocket: ${serverConfig.crawler.browserWebSocketUrl}`,
      );
      return await chromium.connect(serverConfig.crawler.browserWebSocketUrl, {
        slowMo: 100,
        timeout: 5000,
      });
    } else if (serverConfig.crawler.browserWebUrl) {
      logger.info(
        `[BrowserPool] Connecting to existing browser: ${serverConfig.crawler.browserWebUrl}`,
      );

      const webUrl = new URL(serverConfig.crawler.browserWebUrl);
      const { address } = await dns.promises.lookup(webUrl.hostname);
      webUrl.hostname = address;

      return await chromium.connectOverCDP(webUrl.toString(), {
        slowMo: 100,
        timeout: 5000,
      });
    } else {
      logger.info("[BrowserPool] Running in browserless mode");
      return null;
    }
  }

  private async reconnect(): Promise<void> {
    if (this.reconnecting) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(
        `[BrowserPool] Maximum reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping reconnection attempts.`,
      );
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;

    try {
      // Clean up existing contexts
      await this.cleanup();

      // Exponential backoff with jitter
      const delay = Math.min(
        this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
        30000, // Cap at 30 seconds
      );
      const jitter = Math.random() * 0.1 * delay; // Add up to 10% jitter
      const totalDelay = delay + jitter;

      logger.info(
        `[BrowserPool] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(totalDelay)}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, totalDelay));

      // Reinitialize browser
      this.browser = await this.startBrowserInstance();

      if (this.browser) {
        // Reset attempt counter on successful reconnection
        this.reconnectAttempts = 0;
        logger.info("[BrowserPool] Successfully reconnected browser");

        this.browser.on("disconnected", () => {
          logger.warn(
            "[BrowserPool] Browser disconnected, will attempt to reconnect",
          );
          this.reconnect();
        });
      }
    } catch (error) {
      logger.error(
        `[BrowserPool] Failed to reconnect browser (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}):`,
        error,
      );

      // If we haven't reached max attempts, schedule another retry
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => this.reconnect(), 100); // Small delay before next attempt
      }
    } finally {
      this.reconnecting = false;
    }
  }

  async acquireContext(): Promise<BrowserContext | null> {
    if (!this.browser) {
      if (serverConfig.crawler.browserConnectOnDemand) {
        try {
          this.browser = await this.startBrowserInstance();
        } catch (error) {
          logger.error(
            "[BrowserPool] Failed to create browser on demand:",
            error,
          );
          return null;
        }
      } else {
        logger.warn("[BrowserPool] No browser available");
        return null;
      }
    }

    // Look for an available context in the pool
    const availableContext = this.contextPool.find((item) => !item.inUse);

    if (availableContext) {
      availableContext.inUse = true;
      availableContext.lastUsed = new Date();
      return availableContext.context;
    }

    // Create new context if pool not at capacity
    if (this.contextPool.length < this.maxContexts) {
      try {
        if (!this.browser) {
          logger.error(
            "[BrowserPool] Browser instance is null, cannot create new context",
          );
          return null;
        }

        const context = await this.browser.newContext({
          viewport: { width: 1440, height: 900 },
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        });

        const poolItem: ContextPoolItem = {
          context,
          inUse: true,
          lastUsed: new Date(),
        };

        this.contextPool.push(poolItem);
        return context;
      } catch (error) {
        logger.error("[BrowserPool] Failed to create new context:", error);
        return null;
      }
    }

    // Pool at capacity, wait for a context to become available
    logger.warn(
      "[BrowserPool] Context pool at capacity, waiting for available context",
    );

    return await new Promise<BrowserContext | null>((resolve) => {
      this.waitingResolvers.push(resolve);
    });
  }

  async releaseContext(context: BrowserContext): Promise<void> {
    const poolItem = this.contextPool.find((item) => item.context === context);

    if (poolItem) {
      const nextResolver = this.waitingResolvers.shift();
      if (nextResolver) {
        poolItem.inUse = true;
        poolItem.lastUsed = new Date();
        nextResolver(poolItem.context);
        return;
      }

      poolItem.inUse = false;
      poolItem.lastUsed = new Date();
    } else {
      // Context not in pool, close it
      try {
        await context.close();
      } catch (error) {
        logger.error("[BrowserPool] Failed to close context:", error);
      }
    }
  }

  async cleanup(): Promise<void> {
    // Close all contexts
    const closePromises = this.contextPool.map(async (item) => {
      try {
        await item.context.close();
      } catch (error) {
        logger.error(
          "[BrowserPool] Failed to close context during cleanup:",
          error,
        );
      }
    });

    await Promise.allSettled(closePromises);
    this.contextPool = [];

    // Resolve any pending waiters so they don't hang indefinitely
    while (this.waitingResolvers.length > 0) {
      const resolver = this.waitingResolvers.shift();
      if (resolver) {
        resolver(null);
      }
    }
  }

  async close(): Promise<void> {
    await this.cleanup();

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        logger.error("[BrowserPool] Failed to close browser:", error);
      }
      this.browser = null;
    }
  }

  // Cleanup unused contexts periodically
  async cleanupOldContexts(): Promise<void> {
    const now = new Date();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    const contextsToRemove = this.contextPool.filter(
      (item) => !item.inUse && now.getTime() - item.lastUsed.getTime() > maxAge,
    );

    for (const item of contextsToRemove) {
      try {
        await item.context.close();
        const index = this.contextPool.indexOf(item);
        if (index > -1) {
          this.contextPool.splice(index, 1);
        }
      } catch (error) {
        logger.error("[BrowserPool] Failed to close old context:", error);
      }
    }
  }
}

// Export singleton instance
export const browserPool = new BrowserPool();
