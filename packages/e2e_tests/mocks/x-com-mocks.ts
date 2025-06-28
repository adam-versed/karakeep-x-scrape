import type { ApifyClient } from "apify-client";
import type { SqliteQueue } from "liteque";
import type { Mock } from "vitest";
import { expect, vi } from "vitest";

import type { ZCrawlLinkRequest } from "@karakeep/shared/queues";
import type {
  ApifyRunInfo,
  ApifyScrapingConfig,
  ApifyXResponse,
  ProcessedXContent,
} from "@karakeep/shared/types/apify";

import { X_COM_TEST_FIXTURES } from "../fixtures/x-com-responses";

/**
 * Comprehensive mock strategy implementation for X.com/Twitter Apify testing
 * Provides mock factories, service mocks, queue mocks, and test utilities
 */

/**
 * Mock response configuration for different test scenarios
 */
export interface MockScenarioConfig {
  /** Type of scenario to simulate */
  scenario:
    | "success"
    | "rate_limit"
    | "api_failure"
    | "auth_error"
    | "timeout"
    | "empty_results";
  /** Custom response data (for success scenarios) */
  responseData?: ApifyXResponse | ApifyXResponse[];
  /** Delay in milliseconds to simulate API latency */
  delay?: number;
  /** Whether to throw an error instead of returning error response */
  shouldThrow?: boolean;
  /** Custom error message */
  errorMessage?: string;
  /** Number of times this response should be returned before changing */
  repeatCount?: number;
}

/**
 * Mock configuration for asset downloading
 */
export interface MockAssetConfig {
  /** Whether asset download should succeed */
  shouldSucceed: boolean;
  /** Mock asset content */
  content?: Buffer | string;
  /** Content type for the asset */
  contentType?: string;
  /** Download delay in milliseconds */
  delay?: number;
  /** Error to throw on failure */
  error?: Error;
}

/**
 * Global mock state manager
 */
class MockStateManager {
  private scenarios = new Map<string, MockScenarioConfig>();
  private assetConfigs = new Map<string, MockAssetConfig>();
  private callCounts = new Map<string, number>();
  private queuedJobs = new Map<string, unknown[]>();

  reset() {
    this.scenarios.clear();
    this.assetConfigs.clear();
    this.callCounts.clear();
    this.queuedJobs.clear();
  }

  setScenario(key: string, config: MockScenarioConfig) {
    this.scenarios.set(key, config);
    this.callCounts.set(key, 0);
  }

  getScenario(key: string): MockScenarioConfig | undefined {
    const config = this.scenarios.get(key);
    if (config && config.repeatCount !== undefined) {
      const count = this.callCounts.get(key) || 0;
      this.callCounts.set(key, count + 1);
      if (count >= config.repeatCount) {
        return undefined; // Scenario expired
      }
    }
    return config;
  }

  setAssetConfig(url: string, config: MockAssetConfig) {
    this.assetConfigs.set(url, config);
  }

  getAssetConfig(url: string): MockAssetConfig | undefined {
    return this.assetConfigs.get(url);
  }

  addQueuedJob(queueName: string, job: unknown) {
    const jobs = this.queuedJobs.get(queueName) || [];
    jobs.push(job);
    this.queuedJobs.set(queueName, jobs);
  }

  getQueuedJobs(queueName: string): unknown[] {
    return this.queuedJobs.get(queueName) || [];
  }

  clearQueues() {
    this.queuedJobs.clear();
  }
}

// Global mock state instance
export const mockState = new MockStateManager();

/**
 * Create a mock ApifyClient instance
 */
export function createMockApifyClient(): {
  client: ApifyClient;
  mocks: {
    actor: Mock;
    call: Mock;
    dataset: Mock;
    listItems: Mock;
  };
} {
  const listItemsMock = vi.fn();
  const datasetMock = vi.fn();
  const callMock = vi.fn();
  const actorMock = vi.fn();

  // Setup mock chain
  datasetMock.mockReturnValue({
    listItems: listItemsMock,
  });

  actorMock.mockReturnValue({
    call: callMock,
  });

  const client = {
    actor: actorMock,
    dataset: datasetMock,
  } as unknown as ApifyClient;

  return {
    client,
    mocks: {
      actor: actorMock,
      call: callMock,
      dataset: datasetMock,
      listItems: listItemsMock,
    },
  };
}

/**
 * Configure ApifyClient mock for a specific scenario
 */
export async function configureApifyMockScenario(
  mocks: ReturnType<typeof createMockApifyClient>["mocks"],
  config: MockScenarioConfig,
): Promise<void> {
  const {
    scenario,
    responseData,
    delay = 100,
    shouldThrow,
    errorMessage,
  } = config;

  // Add realistic delay
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  switch (scenario) {
    case "success": {
      const runId = `run_${Date.now()}`;
      const datasetId = `dataset_${Date.now()}`;

      // Mock successful actor run
      const runInfo: ApifyRunInfo = {
        id: runId,
        actId: "apify/x-scraper",
        status: "SUCCEEDED",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        stats: {
          inputBodyLen: 1024,
          restartCount: 0,
          durationMillis: delay,
        },
        defaultDatasetId: datasetId,
      };

      mocks.call.mockResolvedValueOnce(runInfo);

      // Mock dataset results
      const items = Array.isArray(responseData)
        ? responseData
        : [responseData || X_COM_TEST_FIXTURES.singleTweet];
      mocks.listItems.mockResolvedValueOnce({ items });
      break;
    }

    case "rate_limit": {
      if (shouldThrow) {
        mocks.call.mockRejectedValueOnce(
          new Error(errorMessage || "Rate limit exceeded"),
        );
      } else {
        mocks.call.mockRejectedValueOnce(X_COM_TEST_FIXTURES.rateLimitError);
      }
      break;
    }

    case "api_failure": {
      if (shouldThrow) {
        mocks.call.mockRejectedValueOnce(
          new Error(errorMessage || "API request failed"),
        );
      } else {
        mocks.call.mockRejectedValueOnce(X_COM_TEST_FIXTURES.apiFailureError);
      }
      break;
    }

    case "auth_error": {
      if (shouldThrow) {
        mocks.call.mockRejectedValueOnce(
          new Error(errorMessage || "Authentication failed"),
        );
      } else {
        mocks.call.mockRejectedValueOnce(X_COM_TEST_FIXTURES.authError);
      }
      break;
    }

    case "timeout": {
      mocks.call.mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Actor run timed out")), delay),
          ),
      );
      break;
    }

    case "empty_results": {
      const runInfo: ApifyRunInfo = {
        id: `run_${Date.now()}`,
        actId: "apify/x-scraper",
        status: "SUCCEEDED",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        stats: {
          inputBodyLen: 1024,
          restartCount: 0,
          durationMillis: delay,
        },
        defaultDatasetId: `dataset_${Date.now()}`,
      };

      mocks.call.mockResolvedValueOnce(runInfo);
      mocks.listItems.mockResolvedValueOnce({ items: [] });
      break;
    }
  }
}

/**
 * Create a mock ApifyService instance
 */
export function createMockApifyService(mockClient?: ApifyClient) {
  return {
    scrapeXUrl: vi.fn(),
    scrapeMultipleUrls: vi.fn(),
    getStatus: vi.fn().mockReturnValue({
      enabled: true,
      configured: true,
      actorId: "apify/x-scraper",
    }),
    isEnabled: vi.fn().mockReturnValue(true),
    _mockClient: mockClient, // Expose for testing
  };
}

/**
 * Configure ApifyService mock for specific behavior
 */
export function configureApifyServiceMock(
  service: ReturnType<typeof createMockApifyService>,
  config: {
    scrapeXUrl?: {
      responses: Map<string, ProcessedXContent | null>;
      defaultResponse?: ProcessedXContent | null;
      throwOnUrls?: string[];
    };
    scrapeMultipleUrls?: {
      response: (ProcessedXContent | null)[];
    };
  },
) {
  if (config.scrapeXUrl) {
    service.scrapeXUrl.mockImplementation(async (url: string) => {
      // Check if should throw
      if (config.scrapeXUrl?.throwOnUrls?.includes(url)) {
        throw new Error(`Failed to scrape ${url}`);
      }

      // Check specific URL response
      const response = config.scrapeXUrl?.responses.get(url);
      if (response !== undefined) {
        return response;
      }

      // Return default response
      return config.scrapeXUrl?.defaultResponse || null;
    });
  }

  if (config.scrapeMultipleUrls) {
    service.scrapeMultipleUrls.mockResolvedValue(
      config.scrapeMultipleUrls.response,
    );
  }
}

/**
 * Create a mock queue instance
 */
export function createMockQueue<T = unknown>(
  queueName: string,
): SqliteQueue<T> {
  return {
    enqueue: vi.fn().mockImplementation(async (job: T) => {
      mockState.addQueuedJob(queueName, job);
      return { id: `job_${Date.now()}`, status: "pending" };
    }),
    dequeue: vi.fn(),
    deleteJob: vi.fn(),
    getJob: vi.fn(),
    listJobs: vi.fn().mockImplementation(async () => {
      return mockState.getQueuedJobs(queueName);
    }),
    size: vi.fn().mockImplementation(async () => {
      return mockState.getQueuedJobs(queueName).length;
    }),
    clear: vi.fn().mockImplementation(async () => {
      mockState.clearQueues();
    }),
  } as unknown as SqliteQueue<T>;
}

/**
 * Create mock queue implementations for all Karakeep queues
 */
export function createMockQueues() {
  return {
    LinkCrawlerQueue: createMockQueue<ZCrawlLinkRequest>("link_crawler"),
    SearchIndexingQueue: createMockQueue("search_indexing"),
    OpenAIQueue: createMockQueue("openai"),
    WebhookQueue: createMockQueue("webhook"),
    RuleEngineQueue: createMockQueue("rule_engine"),
  };
}

/**
 * Mock asset download utility
 */
export async function mockAssetDownload(
  url: string,
  config?: MockAssetConfig,
): Promise<{ content: Buffer; contentType: string }> {
  const assetConfig = config ||
    mockState.getAssetConfig(url) || {
      shouldSucceed: true,
      content: Buffer.from("mock asset content"),
      contentType: "image/jpeg",
      delay: 50,
    };

  // Simulate download delay
  if (assetConfig.delay && assetConfig.delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, assetConfig.delay));
  }

  if (!assetConfig.shouldSucceed) {
    throw assetConfig.error || new Error(`Failed to download asset: ${url}`);
  }

  return {
    content:
      typeof assetConfig.content === "string"
        ? Buffer.from(assetConfig.content)
        : assetConfig.content || Buffer.from("default mock content"),
    contentType: assetConfig.contentType || "application/octet-stream",
  };
}

/**
 * Mock external URL fetching
 */
export async function mockExternalUrlFetch(
  url: string,
  options?: {
    status?: number;
    headers?: Record<string, string>;
    body?: string;
    delay?: number;
    shouldFail?: boolean;
  },
): Promise<Response> {
  const {
    status = 200,
    headers = { "content-type": "text/html" },
    body = "<html><body>Mock content</body></html>",
    delay = 50,
    shouldFail = false,
  } = options || {};

  // Simulate network delay
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  if (shouldFail) {
    throw new Error(`Network request failed for ${url}`);
  }

  return new Response(body, {
    status,
    headers: new Headers(headers),
  });
}

/**
 * Helper to setup a complete test scenario
 */
export function setupTestScenario(config: {
  apifyScenario?: MockScenarioConfig;
  queueBehavior?: {
    shouldEnqueue?: boolean;
    enqueueFails?: boolean;
  };
  assetDownloads?: Map<string, MockAssetConfig>;
  externalUrls?: Map<string, Parameters<typeof mockExternalUrlFetch>[1]>;
}) {
  // Reset all mocks
  mockState.reset();

  // Setup Apify scenario
  if (config.apifyScenario) {
    mockState.setScenario("default", config.apifyScenario);
  }

  // Setup asset downloads
  if (config.assetDownloads) {
    config.assetDownloads.forEach((assetConfig, url) => {
      mockState.setAssetConfig(url, assetConfig);
    });
  }

  // Create mocked instances
  const apifyMocks = createMockApifyClient();
  const apifyService = createMockApifyService(apifyMocks.client);
  const queues = createMockQueues();

  // Configure queue behavior
  if (config.queueBehavior?.enqueueFails) {
    Object.values(queues).forEach((queue) => {
      (queue.enqueue as Mock).mockRejectedValue(
        new Error("Queue operation failed"),
      );
    });
  }

  return {
    apifyClient: apifyMocks.client,
    apifyMocks: apifyMocks.mocks,
    apifyService,
    queues,
    mockState,
    // Utility functions bound to this scenario
    async simulateApifyCall(config?: ApifyScrapingConfig) {
      const scenario = mockState.getScenario("default") || {
        scenario: "success",
      };
      await configureApifyMockScenario(apifyMocks.mocks, scenario);
      return apifyMocks.client.actor("test").call(config || {});
    },
    async downloadAsset(url: string) {
      return mockAssetDownload(url);
    },
    async fetchUrl(url: string) {
      const urlConfig = config.externalUrls?.get(url);
      return mockExternalUrlFetch(url, urlConfig);
    },
  };
}

/**
 * Test data generators
 */
export const testDataGenerators = {
  /**
   * Generate a realistic thread of tweets
   */
  generateThread(length: number): ApifyXResponse[] {
    const baseId = Date.now();
    const thread: ApifyXResponse[] = [];

    for (let i = 0; i < length; i++) {
      thread.push({
        id: `${baseId + i}`,
        text: `Thread post ${i + 1}/${length}: This is part of a longer discussion...`,
        author: {
          userName: "threadauthor",
          name: "Thread Author",
          followers: 10000,
          isVerified: true,
        },
        likes: Math.floor(Math.random() * 1000),
        retweets: Math.floor(Math.random() * 100),
        replies: Math.floor(Math.random() * 50),
        createdAt: new Date(Date.now() - i * 60000).toISOString(),
        url: `https://x.com/threadauthor/status/${baseId + i}`,
        conversationId: `${baseId}`,
        inReplyToStatusId: i > 0 ? `${baseId + i - 1}` : undefined,
      });
    }

    thread[0].isThread = true;
    thread[0].thread = thread.slice(1);

    return thread;
  },

  /**
   * Generate a tweet with specific media configuration
   */
  generateMediaTweet(mediaConfig: {
    images?: number;
    videos?: number;
    gifs?: number;
  }): ApifyXResponse {
    const media: {
      url: string;
      type: "photo" | "video" | "gif";
      thumbnailUrl?: string;
    }[] = [];
    const photos: string[] = [];
    const videos: string[] = [];

    // Add images
    for (let i = 0; i < (mediaConfig.images || 0); i++) {
      const url = `https://pbs.twimg.com/media/test_image_${i}.jpg`;
      photos.push(url);
      media.push({
        url,
        type: "photo" as const,
      });
    }

    // Add videos
    for (let i = 0; i < (mediaConfig.videos || 0); i++) {
      const url = `https://video.twimg.com/ext_tw_video/test_video_${i}/vid.mp4`;
      videos.push(url);
      media.push({
        url,
        type: "video" as const,
        thumbnailUrl: `https://pbs.twimg.com/ext_tw_video_thumb/test_video_${i}/img.jpg`,
      });
    }

    // Add GIFs
    for (let i = 0; i < (mediaConfig.gifs || 0); i++) {
      const url = `https://video.twimg.com/tweet_video/test_gif_${i}.mp4`;
      videos.push(url);
      media.push({
        url,
        type: "gif" as const,
      });
    }

    return {
      id: `${Date.now()}`,
      text: "Check out this media content!",
      author: {
        userName: "mediauser",
        name: "Media User",
      },
      photos,
      videos,
      media,
      likes: 100,
      retweets: 20,
      createdAt: new Date().toISOString(),
      url: `https://x.com/mediauser/status/${Date.now()}`,
    };
  },

  /**
   * Generate a malformed response for edge case testing
   */
  generateMalformedResponse(): Partial<ApifyXResponse> {
    const variants: Partial<ApifyXResponse>[] = [
      { id: "" }, // Empty ID
      { text: null as unknown as string }, // Null text
      { author: {} }, // Empty author
      { createdAt: "invalid-date" }, // Invalid date
      { likes: -1 }, // Negative metrics
      { media: [null, undefined, ""] as unknown as ApifyXResponse["media"] }, // Invalid media
    ];

    return variants[Math.floor(Math.random() * variants.length)];
  },
};

/**
 * Assertion helpers for testing
 */
export const assertionHelpers = {
  /**
   * Assert that a job was enqueued with expected properties
   */
  assertJobEnqueued(
    queue: SqliteQueue<unknown>,
    expectedJob: Partial<unknown>,
  ) {
    expect(queue.enqueue).toHaveBeenCalled();
    const calls = (queue.enqueue as Mock).mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall).toMatchObject(expectedJob);
  },

  /**
   * Assert that Apify was called with expected config
   */
  assertApifyCalled(
    mocks: ReturnType<typeof createMockApifyClient>["mocks"],
    expectedConfig: Partial<ApifyScrapingConfig>,
  ) {
    expect(mocks.call).toHaveBeenCalled();
    const calls = mocks.call.mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall).toMatchObject(expectedConfig);
  },

  /**
   * Assert processed content matches expected structure
   */
  assertProcessedContent(
    content: ProcessedXContent | null,
    expectations: {
      hasTitle?: boolean;
      hasContent?: boolean;
      hasAuthor?: boolean;
      mediaCount?: number;
      isThread?: boolean;
      threadLength?: number;
    },
  ) {
    expect(content).not.toBeNull();
    if (!content) return;

    if (expectations.hasTitle) {
      expect(content.title).toBeTruthy();
    }
    if (expectations.hasContent) {
      expect(content.content).toBeTruthy();
    }
    if (expectations.hasAuthor) {
      expect(content.author).toBeTruthy();
      expect(content.authorUsername).toBeTruthy();
    }
    if (expectations.mediaCount !== undefined) {
      expect(content.media?.length || 0).toBe(expectations.mediaCount);
    }
    if (expectations.isThread) {
      expect(content.thread).toBeTruthy();
      if (expectations.threadLength !== undefined) {
        expect(content.thread?.length || 0).toBe(expectations.threadLength);
      }
    }
  },
};

/**
 * Advanced mock scenarios for complex testing
 */
export const advancedScenarios = {
  /**
   * Simulate a rate limit that recovers after delay
   */
  async rateLimitThenRecovery(
    mocks: ReturnType<typeof createMockApifyClient>["mocks"],
    options: {
      rateLimitDuration: number;
      successResponse?: ApifyXResponse;
    },
  ) {
    // First call: rate limit
    mocks.call.mockRejectedValueOnce(X_COM_TEST_FIXTURES.rateLimitError);

    // Second call after delay: success
    setTimeout(() => {
      const runInfo: ApifyRunInfo = {
        id: `run_${Date.now()}`,
        actId: "apify/x-scraper",
        status: "SUCCEEDED",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        stats: { inputBodyLen: 1024, restartCount: 0, durationMillis: 100 },
        defaultDatasetId: `dataset_${Date.now()}`,
      };
      mocks.call.mockResolvedValueOnce(runInfo);
      mocks.listItems.mockResolvedValueOnce({
        items: [options.successResponse || X_COM_TEST_FIXTURES.singleTweet],
      });
    }, options.rateLimitDuration);
  },

  /**
   * Simulate partial failures in batch processing
   */
  batchProcessingWithFailures(
    service: ReturnType<typeof createMockApifyService>,
    urlResults: Map<string, ProcessedXContent | Error>,
  ) {
    service.scrapeMultipleUrls.mockImplementation(async (urls: string[]) => {
      const results: (ProcessedXContent | null)[] = [];

      for (const url of urls) {
        const result = urlResults.get(url);
        if (result instanceof Error) {
          results.push(null);
        } else {
          results.push(result || null);
        }
        // Simulate processing delay
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      return results;
    });
  },

  /**
   * Simulate network instability with intermittent failures
   */
  networkInstability(
    mocks: ReturnType<typeof createMockApifyClient>["mocks"],
    failureRate = 0.3,
  ) {
    mocks.call.mockImplementation(async () => {
      if (Math.random() < failureRate) {
        throw new Error("Network error: Connection timeout");
      }

      const runInfo: ApifyRunInfo = {
        id: `run_${Date.now()}`,
        actId: "apify/x-scraper",
        status: "SUCCEEDED",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        stats: { inputBodyLen: 1024, restartCount: 0, durationMillis: 100 },
        defaultDatasetId: `dataset_${Date.now()}`,
      };
      return runInfo;
    });

    mocks.listItems.mockImplementation(async () => {
      if (Math.random() < failureRate) {
        throw new Error("Network error: Failed to fetch dataset");
      }
      return { items: [X_COM_TEST_FIXTURES.singleTweet] };
    });
  },
};

/**
 * Performance testing utilities
 */
export const performanceUtils = {
  /**
   * Create a scenario with configurable latency
   */
  createLatencyScenario(baseLatency: number, variance = 0.2) {
    return {
      getDelay: () => {
        const min = baseLatency * (1 - variance);
        const max = baseLatency * (1 + variance);
        return Math.floor(Math.random() * (max - min) + min);
      },
    };
  },

  /**
   * Monitor mock call performance
   */
  createPerformanceMonitor() {
    const callTimes: number[] = [];

    return {
      wrapMock: (mockFn: Mock) => {
        return mockFn.mockImplementation(async (...args: unknown[]) => {
          const start = Date.now();
          try {
            const result = await mockFn.getMockImplementation()?.(...args);
            return result;
          } finally {
            callTimes.push(Date.now() - start);
          }
        });
      },
      getStats: () => {
        if (callTimes.length === 0) return null;

        const sorted = [...callTimes].sort((a, b) => a - b);
        return {
          count: callTimes.length,
          min: Math.min(...callTimes),
          max: Math.max(...callTimes),
          avg: callTimes.reduce((a, b) => a + b, 0) / callTimes.length,
          median: sorted[Math.floor(sorted.length / 2)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
        };
      },
      reset: () => {
        callTimes.length = 0;
      },
    };
  },
};

/**
 * Integration testing helpers
 */
export const integrationHelpers = {
  /**
   * Create a complete integration test scenario
   */
  createIntegrationScenario(options: {
    apifyResponses: ApifyXResponse[];
    expectedQueueJobs: { queueName: string; job: unknown }[];
    expectedAssetDownloads: string[];
    expectedExternalCalls: string[];
  }) {
    const scenario = setupTestScenario({
      apifyScenario: {
        scenario: "success",
        responseData: options.apifyResponses,
      },
    });

    // Track expected calls
    const tracker = {
      queueJobs: [] as unknown[],
      assetDownloads: [] as string[],
      externalCalls: [] as string[],
    };

    // Wrap functions to track calls
    const originalEnqueue = scenario.queues.LinkCrawlerQueue.enqueue;
    scenario.queues.LinkCrawlerQueue.enqueue = vi
      .fn()
      .mockImplementation(async (job) => {
        tracker.queueJobs.push({ queueName: "LinkCrawlerQueue", job });
        return originalEnqueue(job);
      });

    const originalDownload = scenario.downloadAsset;
    scenario.downloadAsset = vi.fn().mockImplementation(async (url) => {
      tracker.assetDownloads.push(url);
      return originalDownload(url);
    });

    const originalFetch = scenario.fetchUrl;
    scenario.fetchUrl = vi.fn().mockImplementation(async (url) => {
      tracker.externalCalls.push(url);
      return originalFetch(url);
    });

    return {
      ...scenario,
      tracker,
      assertExpectedCalls: () => {
        expect(tracker.queueJobs).toEqual(
          expect.arrayContaining(options.expectedQueueJobs),
        );
        expect(tracker.assetDownloads).toEqual(
          expect.arrayContaining(options.expectedAssetDownloads),
        );
        expect(tracker.externalCalls).toEqual(
          expect.arrayContaining(options.expectedExternalCalls),
        );
      },
    };
  },
};

/**
 * Cleanup function to reset all mocks
 */
export function cleanupMocks() {
  mockState.reset();
  vi.clearAllMocks();
}

/**
 * Export all test fixtures for convenience
 */
export { X_COM_TEST_FIXTURES };

// Re-export types from shared packages for convenience
export type {
  ApifyXResponse,
  ProcessedXContent,
  ApifyScrapingConfig,
} from "@karakeep/shared/types/apify";

// Local types are already exported above
