/**
 * Type definitions for Apify X.com (Twitter) scraping integration
 */

/**
 * Represents a scraped post from X.com with normalized data structure
 */
export interface ScrapedPost {
  id: string;
  text: string;
  author: {
    username: string;
    name: string;
    profilePicture?: string;
    verified?: boolean;
    followers?: number;
  };
  createdAt: string;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    views?: number;
    bookmarks?: number;
    quotes?: number;
  };
  media?: {
    type: "photo" | "video" | "gif";
    url: string;
    thumbnailUrl?: string;
    duration?: number; // for videos, in seconds
    width?: number;
    height?: number;
  }[];
  isThread?: boolean;
  threadPosts?: ScrapedPost[];
  quotedPost?: ScrapedPost;
  url: string;
  hashtags?: string[];
  mentions?: string[];
}

/**
 * Raw response from Apify Twitter scraper actor
 * Contains various optional fields that need normalization
 */
export interface ApifyXResponse {
  // ID fields (different actors use different field names)
  id?: string;
  tweetId?: string;

  // Text content
  text?: string;
  fullText?: string;

  // Author information (different structures)
  author?: {
    userName?: string;
    username?: string;
    name?: string;
    displayName?: string;
    profileImageUrl?: string;
    profilePicture?: string;
    followers?: number;
    followersCount?: number;
    isVerified?: boolean;
    verified?: boolean;
  };
  // Some responses have author fields at root level
  username?: string;
  displayName?: string;
  userName?: string;

  // Engagement metrics (various naming conventions)
  likes?: number;
  favoriteCount?: number;
  likeCount?: number;
  retweets?: number;
  retweetCount?: number;
  replies?: number;
  replyCount?: number;
  viewCount?: number;
  views?: number;
  bookmarkCount?: number;
  quoteCount?: number;

  // Media arrays
  photos?: string[];
  images?: string[];
  videos?: string[];
  media?: (string | MediaItem)[];

  // Extended entities (Twitter API format)
  extendedEntities?: {
    media?: {
      media_url_https?: string;
      media_url?: string;
      type?: string;
      video_info?: {
        duration_millis?: number;
        aspect_ratio?: number[];
        variants?: {
          content_type?: string;
          url?: string;
          bitrate?: number;
        }[];
      };
      sizes?: Record<
        string,
        {
          w: number;
          h: number;
        }
      >;
    }[];
  };

  // Timestamps
  createdAt?: string;
  date?: string;
  timestamp?: string;

  // URLs
  url?: string;
  twitterUrl?: string;
  tweetUrl?: string;

  // Thread information
  isThread?: boolean;
  isReply?: boolean;
  inReplyToStatusId?: string;
  conversationId?: string;
  thread?: ApifyXResponse[];

  // Quote tweet
  isQuote?: boolean;
  quotedStatus?: ApifyXResponse;
  quotedTweet?: ApifyXResponse;
  quote?: ApifyXResponse;
  quoteId?: string;

  // Hashtags and mentions
  hashtags?: string[];
  entities?: {
    hashtags?: { text: string }[];
    user_mentions?: { screen_name: string }[];
  };

  // Metadata
  lang?: string;
  isRetweet?: boolean;
  retweetedStatus?: ApifyXResponse;
  source?: string;

  // Custom fields for tracking
  scraped_at?: string;
  source_type?: string;
  source_target?: string;
}

/**
 * Media item structure that may appear in some responses
 */
interface MediaItem {
  url: string;
  type?: "photo" | "video" | "gif";
  thumbnailUrl?: string;
}

/**
 * Configuration for Apify scraping requests
 */
export interface ApifyScrapingConfig {
  urls?: string[];
  handles?: string[];
  searchTerms?: string[];
  maxTweets?: number;
  includeThread?: boolean;
  includeReplies?: boolean;
  includeRetweets?: boolean;
  includeQuoteTweets?: boolean;
  startDate?: string;
  endDate?: string;
  minLikes?: number;
  minRetweets?: number;
  onlyVerified?: boolean;
  onlyWithMedia?: boolean;
  language?: string;
}

/**
 * Error response from Apify
 */
export interface ApifyErrorResponse {
  error: {
    type: string;
    message: string;
    statusCode?: number;
  };
}

/**
 * Apify actor run metadata
 */
export interface ApifyRunInfo {
  id: string;
  actId: string;
  status:
    | "READY"
    | "RUNNING"
    | "SUCCEEDED"
    | "FAILED"
    | "TIMED_OUT"
    | "ABORTED";
  statusMessage?: string;
  startedAt: string;
  finishedAt?: string;
  stats: {
    inputBodyLen: number;
    restartCount: number;
    durationMillis: number;
  };
  defaultDatasetId: string;
}

/**
 * Result of processing Apify data for Karakeep
 */
export interface ProcessedXContent {
  title: string;
  content: string;
  htmlContent?: string;
  author?: string;
  authorUsername?: string;
  authorProfilePic?: string;
  publishedAt?: Date;
  media?: {
    type: "image" | "video";
    url: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
    duration?: number; // for videos
  }[];
  thread?: ProcessedXContent[];
  quotedPost?: ProcessedXContent;
  metrics?: {
    likes: number;
    retweets: number;
    replies: number;
    views?: number;
    bookmarks?: number;
    quotes?: number;
  };
  hashtags?: string[];
  mentions?: string[];
}

/**
 * Type guard to check if response is an error
 */
export function isApifyError(
  response: unknown,
): response is ApifyErrorResponse {
  return (
    response !== null && typeof response === "object" && "error" in response
  );
}

/**
 * Type guard to check if media item is an object
 */
export function isMediaItem(item: string | MediaItem): item is MediaItem {
  return typeof item === "object" && "url" in item;
}
