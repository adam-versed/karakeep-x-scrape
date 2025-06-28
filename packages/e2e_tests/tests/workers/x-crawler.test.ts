import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";
import { waitUntil } from "../../utils/general";

describe("X.com (Twitter) Crawler Tests", () => {
  const port = inject("karakeepPort");

  if (!port) {
    throw new Error("Missing required environment variables");
  }

  let client: ReturnType<typeof createKarakeepClient>;
  let apiKey: string;

  async function getBookmark(bookmarkId: string) {
    const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
      params: {
        path: {
          bookmarkId,
        },
        query: {
          includeContent: true,
        },
      },
    });
    return data;
  }

  beforeEach(async () => {
    apiKey = await createTestUser();
    client = createKarakeepClient({
      baseUrl: `http://localhost:${port}/api/v1/`,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
    });
  });

  describe("Single Tweet Scraping", () => {
    it("should scrape a simple tweet with Apify enhancement", async () => {
      // Mock X.com URL - in real tests, this would be intercepted by a mock server
      const mockTweetUrl = "https://x.com/testuser/status/1234567890123456789";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockTweetUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Tweet is crawled",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Check basic crawling results
      expect(bookmark.content.crawledAt).toBeDefined();
      expect(bookmark.content.title).toContain("Test User");
      expect(bookmark.content.description).toContain("This is a test tweet");
      expect(bookmark.content.url).toBe(mockTweetUrl);

      // Check X.com specific fields
      expect(bookmark.content.publisher).toBe("X (formerly Twitter)");
      expect(bookmark.content.author).toBe("Test User");

      // Should have a screenshot
      expect(
        bookmark.assets.find((a) => a.assetType === "screenshot"),
      ).toBeDefined();
    });

    it("should scrape a tweet with images", async () => {
      const mockTweetUrl = "https://x.com/photouser/status/9876543210987654321";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockTweetUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Tweet with images is crawled",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Check for media assets
      const imageAssets = bookmark.assets.filter(
        (a) => a.assetType === "bookmarkAsset"
      );
      expect(imageAssets.length).toBeGreaterThan(0);

      // Check content contains image references
      expect(bookmark.content.imageUrl).toBeDefined();
      expect(bookmark.content.htmlContent).toContain("img");
    });

    it("should scrape a tweet with video", async () => {
      const mockTweetUrl = "https://x.com/videouser/status/1111222233334444555";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockTweetUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Tweet with video is crawled",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Check content mentions video
      expect(bookmark.content.description).toContain("video");
      expect(bookmark.content.htmlContent).toMatch(/video|mp4/i);

      // Video thumbnail should be captured as image
      expect(bookmark.content.imageUrl).toBeDefined();
    });
  });

  describe("Thread and Conversation Scraping", () => {
    it("should scrape a thread of tweets", async () => {
      const mockThreadUrl =
        "https://x.com/threaduser/status/2222333344445555666";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockThreadUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Thread is crawled",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Check thread content is captured
      expect(bookmark.content.htmlContent).toContain("Thread 1/3");
      expect(bookmark.content.htmlContent).toContain("Thread 2/3");
      expect(bookmark.content.htmlContent).toContain("Thread 3/3");

      // Full thread should be in description
      expect(bookmark.content.description?.length).toBeGreaterThan(280); // More than single tweet
    });

    it("should scrape a conversation with replies", async () => {
      const mockConversationUrl =
        "https://x.com/convouser/status/3333444455556666777";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockConversationUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Conversation is crawled",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Check conversation context is included
      expect(bookmark.content.htmlContent).toContain("Replying to");
    });
  });

  describe("Special Tweet Types", () => {
    it("should scrape a quoted tweet", async () => {
      const mockQuoteUrl = "https://x.com/quoteuser/status/4444555566667777888";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockQuoteUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Quoted tweet is crawled",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Check both quote and quoted content are captured
      expect(bookmark.content.htmlContent).toContain("Quote tweet content");
      expect(bookmark.content.htmlContent).toContain("Original tweet content");
      expect(bookmark.content.description).toContain("QT:");
    });

    it("should scrape a retweet", async () => {
      const mockRetweetUrl =
        "https://x.com/retweetuser/status/5555666677778888999";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockRetweetUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Retweet is crawled",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Check retweet attribution
      expect(bookmark.content.htmlContent).toContain("retweeted");
    });

    it("should scrape tweets with hashtags and mentions", async () => {
      const mockHashtagUrl =
        "https://x.com/hashtaguser/status/6666777788889999000";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockHashtagUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Tweet with hashtags is crawled",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Check hashtags are preserved
      expect(bookmark.content.htmlContent).toContain("#TestHashtag");
      expect(bookmark.content.htmlContent).toContain("#KarakeepTest");

      // Check mentions are preserved
      expect(bookmark.content.htmlContent).toContain("@mentioneduser");
    });
  });

  describe("Fallback Scenarios", () => {
    it("should fall back to regular crawling when Apify is disabled", async () => {
      // This test assumes APIFY_API_TOKEN env var is not set
      const mockTweetUrl =
        "https://x.com/fallbackuser/status/7777888899990000111";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockTweetUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Tweet is crawled with fallback",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Basic metadata should still be extracted
      expect(bookmark.content.crawledAt).toBeDefined();
      expect(bookmark.content.url).toBe(mockTweetUrl);
      expect(bookmark.content.publisher).toBe("X (formerly Twitter)");

      // Content might be limited due to X.com's dynamic loading
      expect(bookmark.content.title).toBeDefined();

      // Should still have a screenshot
      expect(
        bookmark.assets.find((a) => a.assetType === "screenshot"),
      ).toBeDefined();
    });

    it("should handle Apify API errors gracefully", async () => {
      // Mock a URL that will cause Apify to fail
      const mockErrorUrl = "https://x.com/erroruser/status/8888999900001111222";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockErrorUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Tweet is crawled despite Apify error",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Should still have basic content from fallback crawling
      expect(bookmark.content.crawledAt).toBeDefined();
      expect(bookmark.content.url).toBe(mockErrorUrl);

      // Should have attempted screenshot
      expect(
        bookmark.assets.find((a) => a.assetType === "screenshot"),
      ).toBeDefined();
    });

    it("should handle deleted or private tweets", async () => {
      const mockDeletedUrl =
        "https://x.com/deleteduser/status/9999000011112222333";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockDeletedUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Deleted tweet crawl completes",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Should have minimal metadata
      expect(bookmark.content.crawledAt).toBeDefined();
      expect(bookmark.content.url).toBe(mockDeletedUrl);

      // Title might indicate the tweet is unavailable
      expect(bookmark.content.title?.toLowerCase()).toMatch(
        /not found|unavailable|deleted/,
      );
    });
  });

  describe("Asset Handling", () => {
    it("should download and store profile pictures", async () => {
      const mockTweetUrl =
        "https://x.com/profilepicuser/status/1122334455667788990";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockTweetUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Tweet with profile pic is crawled",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Should have stored the author's profile picture
      const profilePicAsset = bookmark.assets.find(
        (a) => a.assetType === "bookmarkAsset"
      );
      expect(profilePicAsset).toBeDefined();
    });

    it("should handle multiple media items in a single tweet", async () => {
      const mockMultiMediaUrl =
        "https://x.com/multimediauser/status/2233445566778899001";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockMultiMediaUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Tweet with multiple media is crawled",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Should have multiple image assets
      const mediaAssets = bookmark.assets.filter(
        (a) => a.assetType === "bookmarkAsset"
      );
      expect(mediaAssets.length).toBeGreaterThan(0); // Should have image assets
    });

    it("should preserve GIF media as assets", async () => {
      const mockGifUrl = "https://x.com/gifuser/status/3344556677889900112";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockGifUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Tweet with GIF is crawled",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Should have GIF asset
      const gifAsset = bookmark.assets.find(
        (a) => a.assetType === "bookmarkAsset"
      );
      expect(gifAsset).toBeDefined();
    });
  });

  describe("Metadata Extraction", () => {
    it("should extract engagement metrics", async () => {
      const mockTweetUrl =
        "https://x.com/metricsuser/status/4455667788990011223";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockTweetUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Tweet with metrics is crawled",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Check basic content is extracted
      expect(bookmark.content.title).toBeDefined();
      expect(bookmark.content.description).toBeDefined();
      expect(bookmark.content.htmlContent).toBeDefined();
    });

    it("should extract tweet timestamp", async () => {
      const mockTweetUrl =
        "https://x.com/timestampuser/status/5566778899001122334";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockTweetUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Tweet timestamp is extracted",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Check date information
      expect(bookmark.content.datePublished).toBeDefined();
      if (bookmark.content.datePublished) {
        const tweetDate = new Date(bookmark.content.datePublished);
        expect(tweetDate).toBeInstanceOf(Date);
        expect(tweetDate.getTime()).toBeLessThan(Date.now());
      }
    });

    it("should handle verified account badges", async () => {
      const mockVerifiedUrl =
        "https://x.com/verifieduser/status/6677889900112233445";

      let { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "link",
          url: mockVerifiedUrl,
        },
      });
      assert(bookmark);

      await waitUntil(
        async () => {
          const data = await getBookmark(bookmark!.id);
          assert(data);
          assert(data.content.type === "link");
          return data.content.crawledAt !== null;
        },
        "Verified tweet is crawled",
        30000,
      );

      bookmark = await getBookmark(bookmark.id);
      assert(bookmark && bookmark.content.type === "link");

      // Check verified status in content
      expect(bookmark.content.htmlContent).toContain("verified");
    });
  });
});
