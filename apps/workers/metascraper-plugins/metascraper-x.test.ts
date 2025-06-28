/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test, vi } from "vitest";

import type { ProcessedXContent } from "@karakeep/shared/types/apify";
import { isXComUrl } from "@karakeep/shared/utils/xcom";

import metascraperX from "./metascraper-x";

// Mock the X.com URL utility
vi.mock("@karakeep/shared/utils/xcom", () => ({
  isXComUrl: vi.fn(),
}));

// Mock the logger
vi.mock("@karakeep/shared/logger", () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("metascraper-x plugin", () => {
  const plugin = metascraperX();

  // Helper function to safely call rule functions
  const callRule = (ruleName: keyof typeof plugin, context: any) => {
    const rule = plugin[ruleName];
    if (typeof rule === "function") {
      return rule(context);
    }
    if (
      Array.isArray(rule) &&
      rule.length > 0 &&
      typeof rule[0] === "function"
    ) {
      return rule[0](context);
    }
    return undefined;
  };

  // Mock DOM with jQuery-like interface
  const createMockDom = () => {
    const mockElement = {
      text: vi.fn(() => "Mock Title"),
      attr: vi.fn((attrName: string) => {
        const attrs: Record<string, string> = {
          content: "Mock content",
          lang: "en",
        };
        return attrs[attrName];
      }),
    };

    const mockDom = vi.fn((selector: string) => {
      if (selector === "title") {
        return { text: vi.fn(() => "X Post Title") };
      }
      if (selector === 'meta[property="og:description"]') {
        return { attr: vi.fn(() => "OG Description") };
      }
      if (selector === 'meta[name="twitter:description"]') {
        return { attr: vi.fn(() => "Twitter Description") };
      }
      if (selector === 'meta[name="description"]') {
        return { attr: vi.fn(() => "Meta Description") };
      }
      if (selector === 'meta[property="og:title"]') {
        return { attr: vi.fn(() => "Test User on X: This is a tweet") };
      }
      if (selector === 'meta[property="og:image"]') {
        return { attr: vi.fn(() => "https://example.com/og-image.jpg") };
      }
      if (selector === 'meta[name="twitter:image"]') {
        return { attr: vi.fn(() => "https://example.com/twitter-image.jpg") };
      }
      if (selector === 'meta[property="article:published_time"]') {
        return { attr: vi.fn(() => "2023-12-01T10:00:00Z") };
      }
      if (selector === "html") {
        return { attr: vi.fn(() => "en") };
      }
      return mockElement;
    });

    // Add minimal CheerioAPI properties to satisfy TypeScript
    return Object.assign(mockDom, {
      _root: {},
      _options: {},
      fn: {},
      load: vi.fn(),
      html: vi.fn(),
      xml: vi.fn(),
      text: vi.fn(),
      parseHTML: vi.fn(),
      root: vi.fn(),
      contains: vi.fn(),
      merge: vi.fn(),
    }) as any;
  };

  describe("plugin configuration", () => {
    test("has correct package name", () => {
      expect(plugin.pkgName).toBe("metascraper-x");
    });

    test("has test function", () => {
      expect(typeof plugin.test).toBe("function");
    });
  });

  describe("test function", () => {
    test("calls isXComUrl with correct URL", () => {
      vi.mocked(isXComUrl).mockReturnValue(true);

      const result = plugin.test!({
        url: "https://x.com/user/status/123",
        htmlDom: createMockDom(),
      });

      expect(isXComUrl).toHaveBeenCalledWith("https://x.com/user/status/123");
      expect(result).toBe(true);
    });
  });

  describe("title extraction", () => {
    test("uses Apify data when available", () => {
      const apifyData: ProcessedXContent = {
        title: "Elon Musk (@elonmusk)",
        content: "Test tweet content",
        author: "Elon Musk",
        authorUsername: "elonmusk",
      };

      const context = {
        url: "https://x.com/elonmusk/status/123",
        htmlDom: createMockDom(),
        apifyData,
      };

      const result = callRule("title", context);
      expect(result).toBe("Elon Musk (@elonmusk)");
    });

    test("falls back to HTML title when Apify data unavailable", () => {
      const mockDom = vi.fn((selector) => {
        if (selector === "title") {
          return { text: vi.fn(() => "User Tweet Title") };
        }
        return { text: vi.fn(() => ""), attr: vi.fn(() => "") };
      });

      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: mockDom,
      };

      const result = callRule("title", context);
      expect(result).toBe("User Tweet Title");
    });

    test("uses URL as last resort when HTML title contains X", () => {
      const mockDom = vi.fn((selector) => {
        if (selector === "title") {
          return { text: vi.fn(() => "X") };
        }
        return { text: vi.fn(() => ""), attr: vi.fn(() => "") };
      });

      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: mockDom,
      };

      const result = callRule("title", context);
      expect(result).toBe("X Post - https://x.com/user/status/123");
    });
  });

  describe("description extraction", () => {
    test("uses Apify data content when available", () => {
      const apifyData: ProcessedXContent = {
        title: "Test Title",
        content: "This is the tweet content from Apify",
        author: "Test User",
        authorUsername: "testuser",
      };

      const context = {
        url: "https://x.com/testuser/status/123",
        htmlDom: createMockDom(),
        apifyData,
      };

      const result = callRule("description", context);
      expect(result).toBe("This is the tweet content from Apify");
    });

    test("falls back to OG description when Apify data unavailable", () => {
      const mockDom = vi.fn((selector) => {
        if (selector === 'meta[property="og:description"]') {
          return { attr: vi.fn(() => "OG Description Content") };
        }
        return { attr: vi.fn(() => "") };
      });

      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: mockDom,
      };

      const result = callRule("description", context);
      expect(result).toBe("OG Description Content");
    });

    test("falls back to Twitter description when OG unavailable", () => {
      const mockDom = vi.fn((selector) => {
        if (selector === 'meta[property="og:description"]') {
          return { attr: vi.fn(() => "") };
        }
        if (selector === 'meta[name="twitter:description"]') {
          return { attr: vi.fn(() => "Twitter Description Content") };
        }
        return { attr: vi.fn(() => "") };
      });

      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: mockDom,
      };

      const result = callRule("description", context);
      expect(result).toBe("Twitter Description Content");
    });

    test("falls back to meta description as last resort", () => {
      const mockDom = vi.fn((selector) => {
        if (selector === 'meta[property="og:description"]') {
          return { attr: vi.fn(() => "") };
        }
        if (selector === 'meta[name="twitter:description"]') {
          return { attr: vi.fn(() => "") };
        }
        if (selector === 'meta[name="description"]') {
          return { attr: vi.fn(() => "Meta Description Content") };
        }
        return { attr: vi.fn(() => "") };
      });

      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: mockDom,
      };

      const result = callRule("description", context);
      expect(result).toBe("Meta Description Content");
    });
  });

  describe("author extraction", () => {
    test("uses Apify data author when available", () => {
      const apifyData: ProcessedXContent = {
        title: "Test Title",
        content: "Test content",
        author: "John Doe",
        authorUsername: "johndoe",
      };

      const context = {
        url: "https://x.com/johndoe/status/123",
        htmlDom: createMockDom(),
        apifyData,
      };

      const result = callRule("author", context);
      expect(result).toBe("John Doe");
    });

    test("extracts author from OG title when Apify data unavailable", () => {
      const mockDom = vi.fn((selector) => {
        if (selector === 'meta[property="og:title"]') {
          return {
            attr: vi.fn(() => "Jane Smith on X: Check out this amazing tweet!"),
          };
        }
        return { attr: vi.fn(() => "") };
      });

      const context = {
        url: "https://x.com/janesmith/status/123",
        htmlDom: mockDom,
      };

      const result = callRule("author", context);
      expect(result).toBe("Jane Smith");
    });

    test("returns undefined when author cannot be extracted", () => {
      const mockDom = vi.fn(() => {
        return { attr: vi.fn(() => "") };
      });

      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: mockDom,
      };

      const result = callRule("author", context);
      expect(result).toBeUndefined();
    });
  });

  describe("image extraction", () => {
    test("uses first media item from Apify data when available", () => {
      const apifyData: ProcessedXContent = {
        title: "Test Title",
        content: "Test content",
        author: "Test User",
        authorUsername: "testuser",
        media: [
          {
            type: "image",
            url: "https://example.com/tweet-image.jpg",
          },
          {
            type: "video",
            url: "https://example.com/tweet-video.mp4",
          },
        ],
        authorProfilePic: "https://example.com/profile.jpg",
      };

      const context = {
        url: "https://x.com/testuser/status/123",
        htmlDom: createMockDom(),
        apifyData,
      };

      const result = callRule("image", context);
      expect(result).toBe("https://example.com/tweet-image.jpg");
    });

    test("uses author profile picture when no media available", () => {
      const apifyData: ProcessedXContent = {
        title: "Test Title",
        content: "Test content",
        author: "Test User",
        authorUsername: "testuser",
        authorProfilePic: "https://example.com/profile.jpg",
      };

      const context = {
        url: "https://x.com/testuser/status/123",
        htmlDom: createMockDom(),
        apifyData,
      };

      const result = callRule("image", context);
      expect(result).toBe("https://example.com/profile.jpg");
    });

    test("falls back to OG image when Apify data unavailable", () => {
      const mockDom = vi.fn((selector) => {
        if (selector === 'meta[property="og:image"]') {
          return { attr: vi.fn(() => "https://example.com/og-fallback.jpg") };
        }
        return { attr: vi.fn(() => "") };
      });

      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: mockDom,
      };

      const result = callRule("image", context);
      expect(result).toBe("https://example.com/og-fallback.jpg");
    });

    test("falls back to Twitter image when OG image unavailable", () => {
      const mockDom = vi.fn((selector) => {
        if (selector === 'meta[property="og:image"]') {
          return { attr: vi.fn(() => "") };
        }
        if (selector === 'meta[name="twitter:image"]') {
          return {
            attr: vi.fn(() => "https://example.com/twitter-fallback.jpg"),
          };
        }
        return { attr: vi.fn(() => "") };
      });

      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: mockDom,
      };

      const result = callRule("image", context);
      expect(result).toBe("https://example.com/twitter-fallback.jpg");
    });
  });

  describe("date extraction", () => {
    test("uses Apify data publishedAt when available", () => {
      const publishedDate = new Date("2023-12-01T15:30:00Z");
      const apifyData: ProcessedXContent = {
        title: "Test Title",
        content: "Test content",
        author: "Test User",
        authorUsername: "testuser",
        publishedAt: publishedDate,
      };

      const context = {
        url: "https://x.com/testuser/status/123",
        htmlDom: createMockDom(),
        apifyData,
      };

      const result = callRule("date", context);
      expect(result).toBe("2023-12-01T15:30:00.000Z");
    });

    test("falls back to article published time meta tag", () => {
      const mockDom = vi.fn((selector) => {
        if (selector === 'meta[property="article:published_time"]') {
          return { attr: vi.fn(() => "2023-12-01T10:00:00Z") };
        }
        return { attr: vi.fn(() => "") };
      });

      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: mockDom,
      };

      const result = callRule("date", context);
      expect(result).toBe("2023-12-01T10:00:00Z");
    });

    test("returns undefined when date cannot be extracted", () => {
      const mockDom = vi.fn(() => {
        return { attr: vi.fn(() => "") };
      });

      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: mockDom,
      };

      const result = callRule("date", context);
      expect(result).toBeUndefined();
    });
  });

  describe("publisher extraction", () => {
    test("always returns X as publisher", () => {
      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: createMockDom(),
      };

      const result = callRule("publisher", context);
      expect(result).toBe("X (formerly Twitter)");
    });

    test("returns X as publisher even with Apify data", () => {
      const apifyData: ProcessedXContent = {
        title: "Test Title",
        content: "Test content",
        author: "Test User",
        authorUsername: "testuser",
      };

      const context = {
        url: "https://x.com/testuser/status/123",
        htmlDom: createMockDom(),
        apifyData,
      };

      const result = callRule("publisher", context);
      expect(result).toBe("X (formerly Twitter)");
    });
  });

  describe("language extraction", () => {
    test("extracts language from HTML lang attribute", () => {
      const mockDom = vi.fn((selector) => {
        if (selector === "html") {
          return { attr: vi.fn(() => "es") };
        }
        return { attr: vi.fn(() => "") };
      });

      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: mockDom,
      };

      const result = callRule("lang", context);
      expect(result).toBe("es");
    });

    test("defaults to English when lang attribute unavailable", () => {
      const mockDom = vi.fn(() => {
        return { attr: vi.fn(() => "") };
      });

      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: mockDom,
      };

      const result = callRule("lang", context);
      expect(result).toBe("en");
    });
  });

  describe("authorUsername extraction", () => {
    test("extracts author username from Apify data", () => {
      const apifyData: ProcessedXContent = {
        title: "Test Title",
        content: "Test content",
        author: "Test User",
        authorUsername: "testuser123",
      };

      const context = {
        url: "https://x.com/testuser123/status/123",
        htmlDom: createMockDom(),
        apifyData,
      };

      const result = callRule("authorUsername", context);
      expect(result).toBe("testuser123");
    });

    test("returns undefined when Apify data unavailable", () => {
      const context = {
        url: "https://x.com/user/status/123",
        htmlDom: createMockDom(),
      };

      const result = callRule("authorUsername", context);
      expect(result).toBeUndefined();
    });
  });

  describe("integration scenarios", () => {
    test("handles complete Apify data scenario", () => {
      const apifyData: ProcessedXContent = {
        title: "Complete User (@completeuser)",
        content: "This is a complete tweet with all data #testing @mention",
        author: "Complete User",
        authorUsername: "completeuser",
        authorProfilePic: "https://example.com/complete-profile.jpg",
        publishedAt: new Date("2023-12-01T12:00:00Z"),
        media: [
          {
            type: "image",
            url: "https://example.com/complete-image.jpg",
            width: 1200,
            height: 800,
          },
        ],
        hashtags: ["#testing"],
        mentions: ["@mention"],
        metrics: {
          likes: 100,
          retweets: 50,
          replies: 25,
        },
      };

      const context = {
        url: "https://x.com/completeuser/status/123",
        htmlDom: createMockDom(),
        apifyData,
      };

      expect(callRule("title", context)).toBe("Complete User (@completeuser)");
      expect(callRule("description", context)).toBe(
        "This is a complete tweet with all data #testing @mention",
      );
      expect(callRule("author", context)).toBe("Complete User");
      expect(callRule("authorUsername", context)).toBe("completeuser");
      expect(callRule("image", context)).toBe(
        "https://example.com/complete-image.jpg",
      );
      expect(callRule("date", context)).toBe("2023-12-01T12:00:00.000Z");
      expect(callRule("publisher", context)).toBe("X (formerly Twitter)");
    });

    test("handles fallback scenario with no Apify data", () => {
      const mockDom = vi.fn((selector) => {
        const selectors: Record<string, unknown> = {
          title: { text: vi.fn(() => "Fallback Tweet Title") },
          'meta[property="og:description"]': {
            attr: vi.fn(() => "Fallback description"),
          },
          'meta[property="og:title"]': {
            attr: vi.fn(() => "Fallback User on X: Tweet content"),
          },
          'meta[property="og:image"]': {
            attr: vi.fn(() => "https://example.com/fallback-image.jpg"),
          },
          'meta[property="article:published_time"]': {
            attr: vi.fn(() => "2023-12-01T08:00:00Z"),
          },
          html: { attr: vi.fn(() => "en") },
        };
        return (
          selectors[selector] || {
            text: vi.fn(() => ""),
            attr: vi.fn(() => ""),
          }
        );
      });

      const context = {
        url: "https://x.com/fallbackuser/status/123",
        htmlDom: mockDom,
      };

      expect(callRule("title", context)).toBe("Fallback Tweet Title");
      expect(callRule("description", context)).toBe("Fallback description");
      expect(callRule("author", context)).toBe("Fallback User");
      expect(callRule("image", context)).toBe(
        "https://example.com/fallback-image.jpg",
      );
      expect(callRule("date", context)).toBe("2023-12-01T08:00:00Z");
      expect(callRule("publisher", context)).toBe("X (formerly Twitter)");
      expect(callRule("lang", context)).toBe("en");
      expect(callRule("authorUsername", context)).toBeUndefined();
    });
  });
});
