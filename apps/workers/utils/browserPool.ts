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

    this.reconnecting = true;

    try {
      // Clean up existing contexts
      await this.cleanup();

      // Wait a bit before reconnecting
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Reinitialize browser
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
      logger.error("[BrowserPool] Failed to reconnect browser:", error);
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
        const context = await this.browser!.newContext({
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
    return null;
  }

  async releaseContext(context: BrowserContext): Promise<void> {
    const poolItem = this.contextPool.find((item) => item.context === context);

    if (poolItem) {
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
