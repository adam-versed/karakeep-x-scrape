import { ApifyClient } from "apify-client";

import type {
  ApifyXResponse,
  ProcessedXContent,
  ScrapedPost,
} from "../types/apify.js";
import serverConfig from "../config.js";
import logger from "../logger.js";
import { isApifyError } from "../types/apify.js";
import { isXComUrl } from "../utils/xcom.js";

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

    // Handle entities media (Twitter API format)
    if (item.entities?.media) {
      item.entities.media.forEach((mediaItem) => {
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

          // Extract highest quality video URL if available
          if (
            mediaItem.video_info.variants &&
            mediaItem.video_info.variants.length > 0
          ) {
            const bestVariant = mediaItem.video_info.variants
              .filter((v) => v.content_type?.includes("video"))
              .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            if (bestVariant?.url) {
              mediaEntry.url = bestVariant.url;
            }
          }
        }

        // Add dimensions if available
        if (mediaItem.sizes?.large) {
          mediaEntry.width = mediaItem.sizes.large.w;
          mediaEntry.height = mediaItem.sizes.large.h;
        } else if (mediaItem.sizes?.medium) {
          mediaEntry.width = mediaItem.sizes.medium.w;
          mediaEntry.height = mediaItem.sizes.medium.h;
        }

        // Add thumbnail for videos
        if (type === "video" || type === "gif") {
          mediaEntry.thumbnailUrl = url; // Original URL serves as thumbnail
        }

        media.push(mediaEntry);
      });
    }

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

          // Extract highest quality video URL if available
          if (
            mediaItem.video_info.variants &&
            mediaItem.video_info.variants.length > 0
          ) {
            const bestVariant = mediaItem.video_info.variants
              .filter((v) => v.content_type?.includes("video"))
              .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            if (bestVariant?.url) {
              mediaEntry.url = bestVariant.url;
            }
          }
        }

        // Add dimensions if available, prefer large size
        if (mediaItem.sizes?.large) {
          mediaEntry.width = mediaItem.sizes.large.w;
          mediaEntry.height = mediaItem.sizes.large.h;
        } else if (mediaItem.sizes?.medium) {
          mediaEntry.width = mediaItem.sizes.medium.w;
          mediaEntry.height = mediaItem.sizes.medium.h;
        }

        // Add thumbnail for videos
        if (type === "video" || type === "gif") {
          mediaEntry.thumbnailUrl = url; // Original URL serves as thumbnail
        }

        media.push(mediaEntry);
      });
    }

    // Deduplicate media by URL
    const uniqueMedia = media.filter(
      (item, index, arr) =>
        arr.findIndex((other) => other.url === item.url) === index,
    );

    return uniqueMedia.length > 0 ? uniqueMedia : undefined;
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

    // Include media from quoted post for better searchability
    const quotedMedia = post.quotedPost?.media?.map((m) => ({
      type: m.type === "photo" ? ("image" as const) : ("video" as const),
      url: m.url,
      thumbnailUrl: m.thumbnailUrl,
      width: m.width,
      height: m.height,
      duration: m.duration,
    }));

    // Combine media arrays, avoiding duplicates
    const allMedia = [...(media || []), ...(quotedMedia || [])];
    const uniqueMedia = allMedia.filter(
      (item, index, arr) =>
        arr.findIndex((other) => other.url === item.url) === index,
    );

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
      media: uniqueMedia.length > 0 ? uniqueMedia : undefined,
      thread,
      quotedPost,
      metrics: post.metrics,
      hashtags: post.hashtags,
      mentions: post.mentions,
    };
  }

  /**
   * Create basic HTML content from post text with embedded media
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

    // Add media if present
    if (post.media && post.media.length > 0) {
      html += '<div class="x-media">';
      post.media.forEach((mediaItem) => {
        if (mediaItem.type === "photo") {
          html += `<img src="${mediaItem.url}" alt="Post image" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 8px;" loading="lazy" />`;
        } else if (mediaItem.type === "video") {
          html += `<video controls style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 8px;">`;
          html += `<source src="${mediaItem.url}" />`;
          if (mediaItem.thumbnailUrl) {
            html += `<img src="${mediaItem.thumbnailUrl}" alt="Video thumbnail" style="max-width: 100%; height: auto;" />`;
          }
          html += `Your browser does not support the video tag.</video>`;
        } else if (mediaItem.type === "gif") {
          // GIFs can be displayed as images or videos depending on format
          if (
            mediaItem.url.includes(".mp4") ||
            mediaItem.url.includes("video")
          ) {
            html += `<video autoplay loop muted style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 8px;">`;
            html += `<source src="${mediaItem.url}" />`;
            if (mediaItem.thumbnailUrl) {
              html += `<img src="${mediaItem.thumbnailUrl}" alt="GIF thumbnail" style="max-width: 100%; height: auto;" />`;
            }
            html += `</video>`;
          } else {
            html += `<img src="${mediaItem.url}" alt="GIF" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 8px;" loading="lazy" />`;
          }
        }
      });
      html += "</div>";
    }

    // Add quoted post if present
    if (post.quotedPost) {
      const quotedHtml = this.createHtmlContent(post.quotedPost);
      html += `<div class="quoted-post" style="border: 2px solid #1d9bf0; border-radius: 8px; padding: 12px; margin: 12px 0; background-color: transparent;">${quotedHtml}</div>`;
    }

    // Add link to original post
    if (post.url) {
      html += `<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e1e8ed;"><a href="${post.url}" target="_blank" rel="noopener noreferrer" style="color: #1d9bf0; text-decoration: none; font-size: 14px;">View original post on X →</a></div>`;
    }

    return `<div class="x-post">${html}</div>`;
  }

  /**
   * Check if a URL is an X.com/Twitter URL
   */
  private isXUrl(url: string): boolean {
    return isXComUrl(url);
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
