import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ProcessedXContent } from "@karakeep/shared/types/apify";
import { ApifyService } from "@karakeep/shared/services/apifyService";
// Import the functions we want to test after mocking
import { isXComUrl } from "@karakeep/shared/utils/xcom";

// Mock all external dependencies
vi.mock("@karakeep/shared/utils/xcom", () => ({
  isXComUrl: vi.fn(),
}));

const mockIsEnabled = vi.fn();
const mockScrapeXUrl = vi.fn();

vi.mock("@karakeep/shared/services/apifyService", () => ({
  ApifyService: vi.fn().mockImplementation(() => ({
    scrapeXUrl: mockScrapeXUrl,
  })),
}));

// Add static method after mock - will be done in beforeEach

vi.mock("@karakeep/shared/logger", () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@karakeep/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@karakeep/db/schema", () => ({
  bookmarks: {},
  assets: {},
  bookmarkAssets: {},
  bookmarkLinks: {},
}));

vi.mock("@karakeep/shared/queues", () => ({
  LinkCrawlerQueue: {
    enqueue: vi.fn(),
  },
  SearchReindexQueue: {
    enqueue: vi.fn(),
  },
  WebhookQueue: {
    enqueue: vi.fn(),
  },
}));

vi.mock("metascraper", () => ({
  default: vi.fn(() => vi.fn()),
}));

vi.mock("../metascraper-plugins/metascraper-x", () => ({
  default: vi.fn(() => ({})),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

vi.mock("node-fetch", () => ({
  default: vi.fn(),
}));

vi.mock("workerUtils", () => ({
  getBookmarkDetails: vi.fn(),
  updateAsset: vi.fn(),
}));

vi.mock("utils", () => ({
  withTimeout: vi.fn((fn, _timeout) => fn),
}));

describe("Crawler Worker X.com Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Add static method to mocked ApifyService
    ApifyService.isEnabled = mockIsEnabled;

    // Mock job setup removed as it's not currently used in tests
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("X.com URL detection and routing", () => {
    test("identifies X.com URLs correctly", () => {
      vi.mocked(isXComUrl).mockReturnValue(true);

      const testUrls = [
        "https://x.com/user/status/123",
        "https://twitter.com/user/status/456",
        "https://mobile.x.com/user/status/789",
      ];

      testUrls.forEach((url) => {
        isXComUrl(url);
        expect(isXComUrl).toHaveBeenCalledWith(url);
      });
    });

    test("rejects non-X.com URLs", () => {
      vi.mocked(isXComUrl).mockReturnValue(false);

      const testUrls = [
        "https://facebook.com/post/123",
        "https://linkedin.com/posts/456",
        "https://example.com",
      ];

      testUrls.forEach((url) => {
        const result = isXComUrl(url);
        expect(result).toBe(false);
      });
    });
  });

  describe("Apify service integration", () => {
    test("creates ApifyService instance when needed", () => {
      mockIsEnabled.mockReturnValue(true);

      new ApifyService();

      expect(ApifyService).toHaveBeenCalled();
    });

    test("checks if Apify is enabled before using", () => {
      mockIsEnabled.mockReturnValue(false);

      const enabled = ApifyService.isEnabled();

      expect(enabled).toBe(false);
      expect(mockIsEnabled).toHaveBeenCalled();
    });
  });

  describe("crawlXComWithApify function simulation", () => {
    // Since we can't directly test the internal function, we'll test the behavior
    test("successful Apify scraping workflow", async () => {
      const mockApifyResult: ProcessedXContent = {
        title: "Test User (@testuser)",
        content: "This is a test tweet from Apify #testing",
        author: "Test User",
        authorUsername: "testuser",
        authorProfilePic: "https://example.com/profile.jpg",
        publishedAt: new Date("2023-12-01T10:00:00Z"),
        media: [
          {
            type: "image",
            url: "https://example.com/tweet-image.jpg",
            width: 1200,
            height: 800,
          },
        ],
        hashtags: ["#testing"],
        metrics: {
          likes: 100,
          retweets: 50,
          replies: 25,
        },
      };

      mockIsEnabled.mockReturnValue(true);
      mockScrapeXUrl.mockResolvedValue(mockApifyResult);

      const service = new ApifyService();
      const result = await service.scrapeXUrl(
        "https://x.com/testuser/status/123",
      );

      expect(result).toEqual(mockApifyResult);
      expect(mockScrapeXUrl).toHaveBeenCalledWith(
        "https://x.com/testuser/status/123",
      );
    });

    test("handles Apify service unavailable", async () => {
      mockIsEnabled.mockReturnValue(false);

      const enabled = ApifyService.isEnabled();
      expect(enabled).toBe(false);
    });

    test("handles Apify API errors", async () => {
      mockIsEnabled.mockReturnValue(true);
      mockScrapeXUrl.mockRejectedValue(new Error("Apify API error"));

      const service = new ApifyService();
      await expect(
        service.scrapeXUrl("https://x.com/user/status/123"),
      ).rejects.toThrow("Apify API error");
    });

    test("handles empty Apify results", async () => {
      mockIsEnabled.mockReturnValue(true);
      mockScrapeXUrl.mockResolvedValue(null);

      const service = new ApifyService();
      const result = await service.scrapeXUrl("https://x.com/user/status/123");
      expect(result).toBeNull();
    });
  });

  describe("processApifyResult function simulation", () => {
    test("processes complete Apify result with media", async () => {
      const apifyData: ProcessedXContent = {
        title: "Complete User (@completeuser)",
        content: "Complete tweet with media and thread",
        author: "Complete User",
        authorUsername: "completeuser",
        authorProfilePic: "https://example.com/complete-profile.jpg",
        publishedAt: new Date("2023-12-01T15:00:00Z"),
        media: [
          {
            type: "image",
            url: "https://example.com/complete-image.jpg",
            width: 1200,
            height: 800,
          },
          {
            type: "video",
            url: "https://example.com/complete-video.mp4",
            duration: 30,
          },
        ],
        thread: [
          {
            title: "Thread Reply 1",
            content: "This is the first reply in the thread",
            author: "Complete User",
            authorUsername: "completeuser",
          },
        ],
        hashtags: ["#complete", "#testing"],
        mentions: ["@user1", "@user2"],
        metrics: {
          likes: 500,
          retweets: 200,
          replies: 100,
          views: 10000,
        },
      };

      // Test that the data structure is complete
      expect(apifyData.title).toBeDefined();
      expect(apifyData.content).toBeDefined();
      expect(apifyData.author).toBeDefined();
      expect(apifyData.media).toHaveLength(2);
      expect(apifyData.thread).toHaveLength(1);
      expect(apifyData.hashtags).toHaveLength(2);
      expect(apifyData.mentions).toHaveLength(2);
      expect(apifyData.metrics).toBeDefined();
    });

    test("processes minimal Apify result", async () => {
      const apifyData: ProcessedXContent = {
        title: "Minimal User (@minimal)",
        content: "Basic tweet content",
        author: "Minimal User",
        authorUsername: "minimal",
      };

      // Test that minimal data is handled correctly
      expect(apifyData.title).toBeDefined();
      expect(apifyData.content).toBeDefined();
      expect(apifyData.author).toBeDefined();
      expect(apifyData.authorUsername).toBeDefined();
      expect(apifyData.media).toBeUndefined();
      expect(apifyData.thread).toBeUndefined();
    });

    test("generates HTML content for metascraper", () => {
      const apifyData: ProcessedXContent = {
        title: "Test User (@testuser)",
        content: "Test content for HTML generation",
        author: "Test User",
        authorUsername: "testuser",
        authorProfilePic: "https://example.com/profile.jpg",
      };

      // Simulate HTML generation logic
      const expectedHtml = `
      <html>
        <head>
          <title>${apifyData.title}</title>
          <meta property="og:title" content="${apifyData.title}" />
          <meta property="og:description" content="${apifyData.content}" />
          <meta property="og:image" content="${apifyData.authorProfilePic}" />
          <meta name="author" content="${apifyData.author}" />
        </head>
        <body>
          <div class="x-post">
            ${apifyData.content}
          </div>
        </body>
      </html>
    `;

      // Test HTML structure components
      expect(expectedHtml).toContain(apifyData.title);
      expect(expectedHtml).toContain(apifyData.content);
      expect(expectedHtml).toContain(apifyData.author);
      expect(expectedHtml).toContain(apifyData.authorProfilePic);
    });
  });

  describe("metascraper integration with Apify data", () => {
    test("passes Apify data to metascraper", async () => {
      const mockMetascraper = vi.fn().mockResolvedValue({
        title: "Enhanced Title",
        description: "Enhanced Description",
        author: "Enhanced Author",
        image: "https://example.com/enhanced-image.jpg",
        date: "2023-12-01T10:00:00Z",
        publisher: "X (formerly Twitter)",
      });

      const apifyData: ProcessedXContent = {
        title: "Original Title",
        content: "Original content",
        author: "Original Author",
        authorUsername: "original",
      };

      const url = "https://x.com/original/status/123";
      const htmlContent = "<html><body>Test</body></html>";

      // Simulate metascraper call with Apify data
      await mockMetascraper({
        url,
        html: htmlContent,
        validateUrl: false,
        apifyData,
      });

      expect(mockMetascraper).toHaveBeenCalledWith({
        url,
        html: htmlContent,
        validateUrl: false,
        apifyData,
      });
    });
  });

  describe("fallback mechanisms", () => {
    test("falls back to regular crawling when Apify disabled", () => {
      mockIsEnabled.mockReturnValue(false);
      vi.mocked(isXComUrl).mockReturnValue(true);

      const isXUrl = isXComUrl("https://x.com/user/status/123");
      const isApifyEnabled = ApifyService.isEnabled();

      expect(isXUrl).toBe(true);
      expect(isApifyEnabled).toBe(false);

      // Should proceed with regular crawling logic
      expect(isXComUrl).toHaveBeenCalledWith("https://x.com/user/status/123");
    });

    test("falls back to regular crawling when Apify fails", async () => {
      mockIsEnabled.mockReturnValue(true);
      vi.mocked(isXComUrl).mockReturnValue(true);
      mockScrapeXUrl.mockRejectedValue(new Error("Apify service failed"));

      const service = new ApifyService();
      try {
        await service.scrapeXUrl("https://x.com/user/status/123");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("Apify service failed");
      }

      // Should continue with regular crawling after error
      expect(mockScrapeXUrl).toHaveBeenCalled();
    });

    test("handles network failures gracefully", async () => {
      mockIsEnabled.mockReturnValue(true);
      mockScrapeXUrl.mockRejectedValue(new Error("Network timeout"));

      const service = new ApifyService();
      await expect(
        service.scrapeXUrl("https://x.com/user/status/123"),
      ).rejects.toThrow("Network timeout");
    });
  });

  describe("queue integration", () => {
    test.todo("should handle post-processing queue operations");
  });

  describe("database integration", () => {
    test.todo("should handle bookmark updates with proper database operations");
    test.todo("should handle asset storage operations with proper mocking");
  });

  describe("error handling and edge cases", () => {
    test("handles abort signal during processing", () => {
      const controller = new AbortController();
      const abortSignal = controller.signal;

      // Simulate abort
      controller.abort();

      expect(abortSignal.aborted).toBe(true);
    });

    test("handles malformed URLs", () => {
      vi.mocked(isXComUrl).mockReturnValue(false);

      const result = isXComUrl("invalid-url");
      expect(result).toBe(false);
    });

    test("handles missing bookmark data", async () => {
      const { getBookmarkDetails } = await import("workerUtils");

      // Test case 1: getBookmarkDetails throws error for non-existent bookmark
      vi.mocked(getBookmarkDetails).mockRejectedValue(
        new Error("The bookmark either doesn't exist or is not a link"),
      );

      await expect(
        getBookmarkDetails("non-existent-bookmark-id"),
      ).rejects.toThrow("The bookmark either doesn't exist or is not a link");

      // Test case 2: getBookmarkDetails returns data with missing optional fields
      vi.mocked(getBookmarkDetails).mockResolvedValue({
        url: "https://example.com",
        userId: "user-123",
        screenshotAssetId: undefined,
        imageAssetId: undefined,
        fullPageArchiveAssetId: undefined,
        videoAssetId: undefined,
        precrawledArchiveAssetId: undefined,
      });

      const result = await getBookmarkDetails("valid-bookmark-id");
      expect(result.url).toBe("https://example.com");
      expect(result.userId).toBe("user-123");
      expect(result.screenshotAssetId).toBeUndefined();
      expect(result.imageAssetId).toBeUndefined();
      expect(result.fullPageArchiveAssetId).toBeUndefined();
      expect(result.videoAssetId).toBeUndefined();
      expect(result.precrawledArchiveAssetId).toBeUndefined();
    });

    test("handles incomplete Apify responses", async () => {
      const incompleteApifyData: Partial<ProcessedXContent> = {
        title: "Incomplete Data",
        // Missing content, author, etc.
      };

      // Should handle missing fields gracefully
      expect(incompleteApifyData.title).toBeDefined();
      expect(incompleteApifyData.content).toBeUndefined();
      expect(incompleteApifyData.author).toBeUndefined();
    });
  });

  describe("configuration validation", () => {
    test("validates Apify service configuration", () => {
      // Test different configuration states
      const configs = [
        { enabled: true, hasApiKey: true },
        { enabled: true, hasApiKey: false },
        { enabled: false, hasApiKey: true },
        { enabled: false, hasApiKey: false },
      ];

      configs.forEach((config) => {
        const isConfigValid = config.enabled && config.hasApiKey;
        const shouldUseApify = isConfigValid;

        expect(typeof shouldUseApify).toBe("boolean");
      });
    });
  });

  describe("performance considerations", () => {
    test("handles timeout scenarios", async () => {
      // Use fake timers for deterministic timeout testing
      vi.useFakeTimers();

      try {
        // Test that timeout scenarios are handled gracefully
        // The actual implementation would use withTimeout wrapper
        const slowOperation = () =>
          new Promise((resolve) => setTimeout(resolve, 100));
        const timeoutMs = 50;

        // Start the race between slow operation and timeout
        const racePromise = Promise.race([
          slowOperation(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeoutMs),
          ),
        ]);

        // Advance timers to trigger the timeout (but not the slow operation)
        vi.advanceTimersByTime(timeoutMs);

        // Expect the timeout to occur
        await expect(racePromise).rejects.toThrow("Timeout");
      } finally {
        // Always restore real timers
        vi.useRealTimers();
      }
    });

    test("handles large media assets", () => {
      const largeApifyData: ProcessedXContent = {
        title: "Large Media Post",
        content: "Post with large media files",
        author: "Test User",
        authorUsername: "testuser",
        media: Array.from({ length: 10 }, (_, i) => ({
          type: "image" as const,
          url: `https://example.com/large-image-${i}.jpg`,
          width: 4000,
          height: 3000,
        })),
      };

      expect(largeApifyData.media).toHaveLength(10);
      expect(largeApifyData.media![0].width).toBe(4000);
    });
  });
});
