import { describe, expect, it } from "vitest";

import {
  cleanTweetText,
  extractHashtags,
  extractMentions,
  extractTweetId,
  extractUsername,
  generateXContentTitle,
  isThreadUrl,
  isTweetUrl,
  isXComUrl,
  normalizeXComUrl,
} from "./xcom";

describe("X.com URL utilities", () => {
  describe("isXComUrl", () => {
    it("should identify valid X.com URLs", () => {
      expect(isXComUrl("https://x.com/username/status/123")).toBe(true);
      expect(isXComUrl("https://twitter.com/username/status/123")).toBe(true);
      expect(isXComUrl("https://www.x.com/username")).toBe(true);
      expect(isXComUrl("https://www.twitter.com/username")).toBe(true);
      expect(isXComUrl("https://mobile.x.com/username")).toBe(true);
      expect(isXComUrl("https://mobile.twitter.com/username")).toBe(true);
    });

    it("should reject invalid URLs", () => {
      expect(isXComUrl("https://facebook.com/username")).toBe(false);
      expect(isXComUrl("https://github.com/username")).toBe(false);
      expect(isXComUrl("https://example.com")).toBe(false);
      expect(isXComUrl("not-a-url")).toBe(false);
    });
  });

  describe("extractTweetId", () => {
    it("should extract tweet ID from status URLs", () => {
      expect(extractTweetId("https://x.com/username/status/1234567890")).toBe(
        "1234567890",
      );
      expect(
        extractTweetId("https://twitter.com/user/status/9876543210"),
      ).toBe("9876543210");
      expect(
        extractTweetId("https://x.com/username/status/123?s=20&t=abc"),
      ).toBe("123");
    });

    it("should return null for non-status URLs", () => {
      expect(extractTweetId("https://x.com/username")).toBe(null);
      expect(extractTweetId("https://x.com/home")).toBe(null);
      expect(extractTweetId("invalid-url")).toBe(null);
    });
  });

  describe("extractUsername", () => {
    it("should extract username from profile URLs", () => {
      expect(extractUsername("https://x.com/username")).toBe("username");
      expect(extractUsername("https://twitter.com/testuser")).toBe("testuser");
      expect(extractUsername("https://x.com/user/status/123")).toBe("user");
    });

    it("should skip special paths", () => {
      expect(extractUsername("https://x.com/home")).toBe(null);
      expect(extractUsername("https://x.com/explore")).toBe(null);
      expect(extractUsername("https://x.com/notifications")).toBe(null);
      expect(extractUsername("https://x.com/messages")).toBe(null);
      expect(extractUsername("https://x.com/bookmarks")).toBe(null);
      expect(extractUsername("https://x.com/settings")).toBe(null);
      expect(extractUsername("https://x.com/i/events")).toBe(null);
    });

    it("should return null for invalid URLs", () => {
      expect(extractUsername("invalid-url")).toBe(null);
    });
  });

  describe("isThreadUrl", () => {
    it("should identify thread indicators", () => {
      expect(isThreadUrl("https://x.com/user/status/123?s=20")).toBe(true);
      expect(isThreadUrl("https://x.com/user/status/123#thread")).toBe(true);
      expect(isThreadUrl("https://x.com/user/status/123")).toBe(true); // Any status URL might be a thread
    });

    it("should return false for non-thread URLs", () => {
      expect(isThreadUrl("https://x.com/username")).toBe(false);
      expect(isThreadUrl("invalid-url")).toBe(false);
    });
  });

  describe("isTweetUrl", () => {
    it("should identify tweet URLs", () => {
      expect(isTweetUrl("https://x.com/user/status/123")).toBe(true);
      expect(isTweetUrl("https://twitter.com/user/status/456")).toBe(true);
    });

    it("should return false for non-tweet URLs", () => {
      expect(isTweetUrl("https://x.com/username")).toBe(false);
      expect(isTweetUrl("https://x.com/explore")).toBe(false);
      expect(isTweetUrl("invalid-url")).toBe(false);
    });
  });

  describe("normalizeXComUrl", () => {
    it("should convert twitter.com to x.com", () => {
      expect(normalizeXComUrl("https://twitter.com/user/status/123")).toBe(
        "https://x.com/user/status/123",
      );
      expect(normalizeXComUrl("https://www.twitter.com/user")).toBe(
        "https://www.x.com/user",
      );
    });

    it("should remove mobile prefix", () => {
      expect(normalizeXComUrl("https://mobile.x.com/user/status/123")).toBe(
        "https://x.com/user/status/123",
      );
      expect(normalizeXComUrl("https://mobile.twitter.com/user")).toBe(
        "https://x.com/user",
      );
    });

    it("should remove tracking parameters", () => {
      const url = "https://x.com/user/status/123?s=20&t=abc&utm_source=share";
      expect(normalizeXComUrl(url)).toBe("https://x.com/user/status/123");
    });

    it("should remove tracking hash", () => {
      expect(normalizeXComUrl("https://x.com/user/status/123#abc123")).toBe(
        "https://x.com/user/status/123",
      );
    });

    it("should preserve meaningful hash", () => {
      expect(
        normalizeXComUrl("https://x.com/user/status/123#thread-2"),
      ).toBe("https://x.com/user/status/123#thread-2");
    });

    it("should return original URL if parsing fails", () => {
      expect(normalizeXComUrl("invalid-url")).toBe("invalid-url");
    });
  });

  describe("generateXContentTitle", () => {
    it("should generate title with username and display name", () => {
      expect(generateXContentTitle("username", "Display Name")).toBe(
        "Display Name (@username)",
      );
    });

    it("should use username if no display name", () => {
      expect(generateXContentTitle("username")).toBe("username (@username)");
    });

    it("should include thread indicator", () => {
      expect(generateXContentTitle("user", "Name", true)).toBe(
        "Name (@user) (Thread)",
      );
    });

    it("should include tweet ID", () => {
      expect(generateXContentTitle("user", "Name", false, "123")).toBe(
        "Name (@user) - 123",
      );
    });

    it("should include both thread and ID", () => {
      expect(generateXContentTitle("user", "Name", true, "123")).toBe(
        "Name (@user) (Thread) - 123",
      );
    });
  });
});

describe("Text processing utilities", () => {
  describe("extractHashtags", () => {
    it("should extract hashtags from text", () => {
      const text = "Check out this #awesome #project on #GitHub!";
      expect(extractHashtags(text)).toEqual(["#awesome", "#project", "#GitHub"]);
    });

    it("should remove duplicates", () => {
      const text = "#test #example #test again";
      expect(extractHashtags(text)).toEqual(["#test", "#example"]);
    });

    it("should return empty array if no hashtags", () => {
      expect(extractHashtags("No hashtags here")).toEqual([]);
    });

    it("should handle hashtags with numbers", () => {
      const text = "#web3 #2024trends #ai2024";
      expect(extractHashtags(text)).toEqual(["#web3", "#2024trends", "#ai2024"]);
    });
  });

  describe("extractMentions", () => {
    it("should extract mentions from text", () => {
      const text = "Hello @alice and @bob, check this out @charlie!";
      expect(extractMentions(text)).toEqual(["@alice", "@bob", "@charlie"]);
    });

    it("should remove duplicates", () => {
      const text = "@user mentioned @example and @user again";
      expect(extractMentions(text)).toEqual(["@user", "@example"]);
    });

    it("should return empty array if no mentions", () => {
      expect(extractMentions("No mentions here")).toEqual([]);
    });

    it("should handle mentions with numbers and underscores", () => {
      const text = "Contact @user_123 or @test2024";
      expect(extractMentions(text)).toEqual(["@user_123", "@test2024"]);
    });
  });

  describe("cleanTweetText", () => {
    it("should remove t.co links", () => {
      const text = "Check this out https://t.co/abc123 awesome!";
      expect(cleanTweetText(text)).toBe("Check this out awesome!");
    });

    it("should decode HTML entities", () => {
      const text = "Tom &amp; Jerry say &quot;Hello&quot; &lt;world&gt;";
      expect(cleanTweetText(text)).toBe('Tom & Jerry say "Hello" <world>');
    });

    it("should handle apostrophes", () => {
      const text = "It&#39;s working!";
      expect(cleanTweetText(text)).toBe("It's working!");
    });

    it("should remove extra whitespace", () => {
      const text = "Too    much   space   here";
      expect(cleanTweetText(text)).toBe("Too much space here");
    });

    it("should handle complex text with multiple issues", () => {
      const text =
        "Check   this  &amp; that https://t.co/xyz123   &quot;amazing&quot;   content!";
      expect(cleanTweetText(text)).toBe('Check this & that "amazing" content!');
    });

    it("should preserve empty string", () => {
      expect(cleanTweetText("")).toBe("");
    });

    it("should handle text with only whitespace", () => {
      expect(cleanTweetText("   ")).toBe("");
    });
  });
});