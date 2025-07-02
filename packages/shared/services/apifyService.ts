import { ApifyClient } from "apify-client";

import type {
  ApifyXResponse,
  ProcessedXContent,
  ScrapedPost,
} from "../types/apify.js";
import serverConfig from "../config.js";
import logger from "../logger.js";
import { isApifyError } from "../types/apify.js";

// Use the default logger for now

export class ApifyService {
  private client: ApifyClient;
  private actorId: string;

  constructor() {
    if (!serverConfig.scraping.apify.apiKey) {
      throw new Error("APIFY_API_KEY not configured");
    }

    this.client = new ApifyClient({
      token: serverConfig.scraping.apify.apiKey,
    });

    this.actorId = serverConfig.scraping.apify.xScraperActorId;
    logger.info(`Initialized ApifyService with actor: ${this.actorId}`);
  }

  /**
   * Main method to scrape X.com content from a URL
   */
  async scrapeXUrl(url: string): Promise<ProcessedXContent | null> {
    if (!this.isXUrl(url)) {
      throw new Error(`Invalid X.com URL: ${url}`);
    }

    logger.info(`Starting scrape for URL: ${url}`);

    try {
      // Use correct input format for apidojo/twitter-scraper-lite
      const config = {
        startUrls: [url],
        maxItems: 50, // Limit results for threads
      };

      const results = await this.runApifyActor(config);

      if (results.length === 0) {
        logger.warn(`No results found for URL: ${url}`);
        return null;
      }

      // Process the main post (first result)
      const processed = this.transformToKarakeepFormat(results[0], results);
      logger.info(`Successfully scraped URL: ${url}`);

      return processed;
    } catch (error) {
      logger.error(`Failed to scrape URL ${url}:`, error);
      throw error;
    }
  }

  /**
   * Scrape multiple URLs at once
   */
  async scrapeMultipleUrls(
    urls: string[],
  ): Promise<(ProcessedXContent | null)[]> {
    const results: (ProcessedXContent | null)[] = [];

    for (const url of urls) {
      try {
        const result = await this.scrapeXUrl(url);
        results.push(result);

        // Rate limiting between requests
        await this.delay(2000);
      } catch (error) {
        logger.error(`Failed to scrape URL ${url}:`, error);
        results.push(null);
      }
    }

    return results;
  }

  /**
   * Run the Apify actor with the given configuration
   */
  private async runApifyActor(config: {
    startUrls: string[];
    maxItems: number;
  }): Promise<ScrapedPost[]> {
    try {
      logger.debug("Running Apify actor with config:", config);

      // Run the Actor and wait for it to finish
      const run = await this.client.actor(this.actorId).call(config, {
        timeout: 300, // 5 minutes
      });

      logger.debug(`Actor run completed with ID: ${run.id}`);

      // Retry logic for delayed dataset results
      let items: ApifyXResponse[] = [];
      const maxRetries = 3;
      const retryDelay = 5000; // 5 seconds

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Fetch results from the run's dataset
        const result = await this.client
          .dataset(run.defaultDatasetId)
          .listItems();

        items = result.items as ApifyXResponse[];
        logger.debug(
          `Attempt ${attempt + 1}: Retrieved ${items.length} items from dataset`,
        );

        // If we got results, break out of retry loop
        if (items.length > 0) {
          break;
        }

        // If not the last attempt, wait before retrying
        if (attempt < maxRetries - 1) {
          logger.debug(
            `No items found, waiting ${retryDelay}ms before retry...`,
          );
          await this.delay(retryDelay);
        }
      }

      if (items.length === 0) {
        logger.warn(`No items retrieved after ${maxRetries} attempts`);
      }

      // Transform Apify results to normalized format
      return this.normalizeApifyResults(items);
    } catch (error) {
      if (isApifyError(error)) {
        logger.error(
          `Apify API error: ${error.error.type} - ${error.error.message}`,
        );
        throw new Error(`Apify scraping failed: ${error.error.message}`);
      }

      logger.error("Apify actor run failed:", error);
      throw error;
    }
  }

  /**
   * Normalize Apify results to consistent ScrapedPost format
   */
  private normalizeApifyResults(results: ApifyXResponse[]): ScrapedPost[] {
    return results
      .map((item) => this.normalizeApifyItem(item))
      .filter((post): post is ScrapedPost => post !== null);
  }

  /**
   * Normalize a single Apify result item
   */
  private normalizeApifyItem(item: ApifyXResponse): ScrapedPost | null {
    // Extract ID (try multiple field names)
    const id = item.id || item.tweetId || "";
    if (!id) {
      logger.warn("Skipping item without ID");
      return null;
    }

    // Extract text content
    const text = item.text || item.fullText || "";
    if (!text || text.trim().length === 0) {
      logger.warn(`Skipping item ${id} without text content`);
      return null;
    }

    // Extract author information
    const author = {
      username:
        item.author?.userName ||
        item.author?.username ||
        item.username ||
        item.userName ||
        "",
      name:
        item.author?.name || item.author?.displayName || item.displayName || "",
      profilePicture:
        item.author?.profileImageUrl || item.author?.profilePicture,
      verified: item.author?.isVerified || item.author?.verified || false,
      followers: item.author?.followers || item.author?.followersCount,
    };

    // Extract engagement metrics
    const metrics = {
      likes: item.likes || item.favoriteCount || item.likeCount || 0,
      retweets: item.retweets || item.retweetCount || 0,
      replies: item.replies || item.replyCount || 0,
      views: item.viewCount || item.views,
      bookmarks: item.bookmarkCount,
      quotes: item.quoteCount,
    };

    // Extract media
    const media = this.extractMedia(item);

    // Extract timestamps
    const createdAt = item.createdAt || item.date || item.timestamp || "";

    // Extract URL
    const url = item.url || item.twitterUrl || item.tweetUrl || "";

    // Extract hashtags and mentions
    const hashtags = this.extractHashtags(item);
    const mentions = this.extractMentions(item);

    // Handle thread
    const isThread = Boolean(
      item.isThread || (item.thread && item.thread.length > 0),
    );
    const threadPosts = item.thread
      ? item.thread
          .map((t) => this.normalizeApifyItem(t))
          .filter((p): p is ScrapedPost => p !== null)
      : undefined;

    // Handle quoted post
    const quotedItem = item.quotedStatus || item.quotedTweet || item.quote;
    const quotedPost = quotedItem
      ? this.normalizeApifyItem(quotedItem) || undefined
      : undefined;

    return {
      id,
      text: text.trim(),
      author,
      createdAt,
      metrics,
      media,
      isThread,
      threadPosts,
      quotedPost,
      url,
      hashtags: hashtags.length > 0 ? hashtags : undefined,
      mentions: mentions.length > 0 ? mentions : undefined,
    };
  }

  /**
   * Extract media from Apify response
   */
  private extractMedia(item: ApifyXResponse): ScrapedPost["media"] {
    const media: NonNullable<ScrapedPost["media"]> = [];

    // Handle photos/images
    const photos = item.photos || item.images || [];
    photos.forEach((url) => {
      if (typeof url === "string") {
        media.push({
          type: "photo",
          url,
        });
      }
    });

    // Handle videos
    const videos = item.videos || [];
    videos.forEach((url) => {
      if (typeof url === "string") {
        media.push({
          type: "video",
          url,
        });
      }
    });

    // Handle extended entities (Twitter API format)
    if (item.extendedEntities?.media) {
      item.extendedEntities.media.forEach((mediaItem) => {
        const url = mediaItem.media_url_https || mediaItem.media_url;
        if (!url) return;

        const type =
          mediaItem.type === "video"
            ? "video"
            : mediaItem.type === "animated_gif"
              ? "gif"
              : "photo";

        const mediaEntry: NonNullable<ScrapedPost["media"]>[0] = {
          type,
          url,
        };

        // Add video metadata if available
        if (type === "video" && mediaItem.video_info) {
          mediaEntry.duration = mediaItem.video_info.duration_millis
            ? Math.round(mediaItem.video_info.duration_millis / 1000)
            : undefined;
        }

        // Add dimensions if available
        if (mediaItem.sizes?.large) {
          mediaEntry.width = mediaItem.sizes.large.w;
          mediaEntry.height = mediaItem.sizes.large.h;
        }

        media.push(mediaEntry);
      });
    }

    return media.length > 0 ? media : undefined;
  }

  /**
   * Extract hashtags from various fields
   */
  private extractHashtags(item: ApifyXResponse): string[] {
    const hashtags: string[] = [];

    // Direct hashtags field
    if (item.hashtags) {
      hashtags.push(...item.hashtags);
    }

    // From entities
    if (item.entities?.hashtags) {
      item.entities.hashtags.forEach((tag) => {
        if (tag.text) {
          hashtags.push(`#${tag.text}`);
        }
      });
    }

    // Extract from text content as fallback
    const text = item.text || item.fullText || "";
    const hashtagMatches = text.match(/#\w+/g);
    if (hashtagMatches) {
      hashtags.push(...hashtagMatches);
    }

    // Remove duplicates and return
    return [...new Set(hashtags)];
  }

  /**
   * Extract mentions from various fields
   */
  private extractMentions(item: ApifyXResponse): string[] {
    const mentions: string[] = [];

    // From entities
    if (item.entities?.user_mentions) {
      item.entities.user_mentions.forEach((mention) => {
        if (mention.screen_name) {
          mentions.push(`@${mention.screen_name}`);
        }
      });
    }

    // Extract from text content as fallback
    const text = item.text || item.fullText || "";
    const mentionMatches = text.match(/@\w+/g);
    if (mentionMatches) {
      mentions.push(...mentionMatches);
    }

    // Remove duplicates and return
    return [...new Set(mentions)];
  }

  /**
   * Transform ScrapedPost to Karakeep's ProcessedXContent format
   */
  private transformToKarakeepFormat(
    post: ScrapedPost,
    allPosts: ScrapedPost[],
  ): ProcessedXContent {
    // Create HTML content from text with basic formatting
    const htmlContent = this.createHtmlContent(post);

    // Transform media to Karakeep format
    const media = post.media?.map((m) => ({
      type: m.type === "photo" ? ("image" as const) : ("video" as const),
      url: m.url,
      thumbnailUrl: m.thumbnailUrl,
      width: m.width,
      height: m.height,
      duration: m.duration,
    }));

    // Handle thread content
    const thread =
      post.isThread && post.threadPosts
        ? post.threadPosts.map((p) =>
            this.transformToKarakeepFormat(p, allPosts),
          )
        : undefined;

    // Handle quoted post
    const quotedPost = post.quotedPost
      ? this.transformToKarakeepFormat(post.quotedPost, allPosts)
      : undefined;

    return {
      title: `${post.author.name} (@${post.author.username})`,
      content: post.text,
      htmlContent,
      author: post.author.name,
      authorUsername: post.author.username,
      authorProfilePic: post.author.profilePicture,
      publishedAt: post.createdAt ? new Date(post.createdAt) : undefined,
      media,
      thread,
      quotedPost,
      metrics: post.metrics,
      hashtags: post.hashtags,
      mentions: post.mentions,
    };
  }

  /**
   * Create basic HTML content from post text
   */
  private createHtmlContent(post: ScrapedPost): string {
    let html = post.text;

    // Convert URLs to links
    html = html.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank">$1</a>',
    );

    // Convert hashtags to spans with class
    html = html.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');

    // Convert mentions to spans with class
    html = html.replace(/@(\w+)/g, '<span class="mention">@$1</span>');

    // Convert line breaks
    html = html.replace(/\n/g, "<br>");

    return `<div class="x-post">${html}</div>`;
  }

  /**
   * Check if a URL is an X.com/Twitter URL
   */
  private isXUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return (
        urlObj.hostname === "x.com" ||
        urlObj.hostname === "twitter.com" ||
        urlObj.hostname === "www.x.com" ||
        urlObj.hostname === "www.twitter.com"
      );
    } catch {
      return false;
    }
  }

  /**
   * Simple delay utility for rate limiting
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if Apify integration is enabled and configured
   */
  static isEnabled(): boolean {
    return (
      serverConfig.scraping.apify.enabled &&
      Boolean(serverConfig.scraping.apify.apiKey)
    );
  }

  /**
   * Get service health status
   */
  getStatus() {
    return {
      enabled: ApifyService.isEnabled(),
      configured: Boolean(serverConfig.scraping.apify.apiKey),
      actorId: this.actorId,
    };
  }
}
