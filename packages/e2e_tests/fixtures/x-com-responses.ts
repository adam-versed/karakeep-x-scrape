/**
 * Test fixtures for X.com/Twitter Apify responses
 * These fixtures provide realistic mock data for testing the Apify integration
 */

import type {
  ApifyErrorResponse,
  ApifyXResponse,
} from "@karakeep/shared/types/apify";

/**
 * Single tweet response with basic text content
 */
export const SINGLE_TWEET_RESPONSE: ApifyXResponse = {
  id: "1234567890123456789",
  tweetId: "1234567890123456789",
  text: "Just launched our new product! 🚀 Excited to share this journey with all of you. Check it out at example.com",
  fullText:
    "Just launched our new product! 🚀 Excited to share this journey with all of you. Check it out at example.com",
  author: {
    userName: "techfounder",
    username: "techfounder",
    name: "Alex Chen",
    displayName: "Alex Chen",
    profileImageUrl:
      "https://pbs.twimg.com/profile_images/1234567890/profile_normal.jpg",
    profilePicture:
      "https://pbs.twimg.com/profile_images/1234567890/profile_normal.jpg",
    followers: 15243,
    followersCount: 15243,
    isVerified: true,
    verified: true,
  },
  likes: 342,
  favoriteCount: 342,
  likeCount: 342,
  retweets: 89,
  retweetCount: 89,
  replies: 24,
  replyCount: 24,
  viewCount: 8521,
  views: 8521,
  createdAt: "2024-01-15T14:30:00.000Z",
  date: "2024-01-15T14:30:00.000Z",
  timestamp: "2024-01-15T14:30:00.000Z",
  url: "https://x.com/techfounder/status/1234567890123456789",
  twitterUrl: "https://twitter.com/techfounder/status/1234567890123456789",
  tweetUrl: "https://x.com/techfounder/status/1234567890123456789",
  lang: "en",
  source:
    '<a href="https://mobile.twitter.com" rel="nofollow">Twitter Web App</a>',
  scraped_at: "2024-01-15T15:00:00.000Z",
  source_type: "tweet",
  source_target: "https://x.com/techfounder/status/1234567890123456789",
};

/**
 * Thread/conversation response with multiple connected tweets
 */
export const THREAD_RESPONSE: ApifyXResponse = {
  id: "1234567890123456790",
  tweetId: "1234567890123456790",
  text: "1/ Let me explain why distributed systems are fascinating. A thread 🧵",
  fullText:
    "1/ Let me explain why distributed systems are fascinating. A thread 🧵",
  author: {
    userName: "devexplainer",
    username: "devexplainer",
    name: "Sarah Johnson",
    displayName: "Sarah Johnson 👩‍💻",
    profileImageUrl:
      "https://pbs.twimg.com/profile_images/9876543210/profile_normal.jpg",
    profilePicture:
      "https://pbs.twimg.com/profile_images/9876543210/profile_normal.jpg",
    followers: 45678,
    followersCount: 45678,
    isVerified: false,
    verified: false,
  },
  likes: 1234,
  favoriteCount: 1234,
  retweets: 567,
  retweetCount: 567,
  replies: 89,
  replyCount: 89,
  viewCount: 25000,
  views: 25000,
  createdAt: "2024-01-14T10:00:00.000Z",
  url: "https://x.com/devexplainer/status/1234567890123456790",
  isThread: true,
  conversationId: "1234567890123456790",
  thread: [
    {
      id: "1234567890123456791",
      tweetId: "1234567890123456791",
      text: "2/ First, let's talk about the CAP theorem. You can only have 2 out of 3: Consistency, Availability, and Partition tolerance.",
      author: {
        userName: "devexplainer",
        username: "devexplainer",
        name: "Sarah Johnson",
        displayName: "Sarah Johnson 👩‍💻",
      },
      likes: 890,
      retweets: 234,
      replies: 45,
      createdAt: "2024-01-14T10:01:00.000Z",
      inReplyToStatusId: "1234567890123456790",
      conversationId: "1234567890123456790",
    },
    {
      id: "1234567890123456792",
      tweetId: "1234567890123456792",
      text: "3/ In practice, partition tolerance is non-negotiable. Networks fail. So you're really choosing between consistency and availability.",
      author: {
        userName: "devexplainer",
        username: "devexplainer",
        name: "Sarah Johnson",
        displayName: "Sarah Johnson 👩‍💻",
      },
      likes: 756,
      retweets: 189,
      replies: 23,
      createdAt: "2024-01-14T10:02:00.000Z",
      inReplyToStatusId: "1234567890123456791",
      conversationId: "1234567890123456790",
    },
    {
      id: "1234567890123456793",
      tweetId: "1234567890123456793",
      text: "4/ Examples:\n- Cassandra: AP (Available, Partition-tolerant)\n- MongoDB: CP (Consistent, Partition-tolerant)\n- Traditional RDBMS: CA (but really just C when partitions happen)",
      author: {
        userName: "devexplainer",
        username: "devexplainer",
        name: "Sarah Johnson",
        displayName: "Sarah Johnson 👩‍💻",
      },
      likes: 623,
      retweets: 156,
      replies: 34,
      createdAt: "2024-01-14T10:03:00.000Z",
      inReplyToStatusId: "1234567890123456792",
      conversationId: "1234567890123456790",
    },
  ],
  lang: "en",
  scraped_at: "2024-01-14T12:00:00.000Z",
};

/**
 * Media-rich tweet with images and video
 */
export const MEDIA_RICH_TWEET_RESPONSE: ApifyXResponse = {
  id: "1234567890123456794",
  text: "Behind the scenes of our latest photoshoot! 📸✨ Full video on our YouTube channel.",
  author: {
    userName: "creativestudio",
    name: "Creative Studio Co.",
    profileImageUrl:
      "https://pbs.twimg.com/profile_images/5432109876/profile_normal.jpg",
    followers: 89234,
    isVerified: true,
  },
  likes: 2456,
  retweets: 432,
  replies: 67,
  viewCount: 45678,
  createdAt: "2024-01-13T16:45:00.000Z",
  url: "https://x.com/creativestudio/status/1234567890123456794",
  photos: [
    "https://pbs.twimg.com/media/F1234567890ABCDE.jpg",
    "https://pbs.twimg.com/media/F2345678901BCDEF.jpg",
    "https://pbs.twimg.com/media/F3456789012CDEFG.jpg",
  ],
  videos: [
    "https://video.twimg.com/ext_tw_video/1234567890/pu/vid/1280x720/abcdefghijklmnop.mp4",
  ],
  media: [
    {
      url: "https://pbs.twimg.com/media/F1234567890ABCDE.jpg",
      type: "photo",
    },
    {
      url: "https://pbs.twimg.com/media/F2345678901BCDEF.jpg",
      type: "photo",
    },
    {
      url: "https://pbs.twimg.com/media/F3456789012CDEFG.jpg",
      type: "photo",
    },
    {
      url: "https://video.twimg.com/ext_tw_video/1234567890/pu/vid/1280x720/abcdefghijklmnop.mp4",
      type: "video",
      thumbnailUrl:
        "https://pbs.twimg.com/ext_tw_video_thumb/1234567890/pu/img/abcdefghijklmnop.jpg",
    },
  ],
  extendedEntities: {
    media: [
      {
        media_url_https: "https://pbs.twimg.com/media/F1234567890ABCDE.jpg",
        media_url: "http://pbs.twimg.com/media/F1234567890ABCDE.jpg",
        type: "photo",
        sizes: {
          thumb: { w: 150, h: 150 },
          small: { w: 680, h: 453 },
          medium: { w: 1200, h: 800 },
          large: { w: 2048, h: 1365 },
        },
      },
      {
        media_url_https: "https://pbs.twimg.com/media/F2345678901BCDEF.jpg",
        media_url: "http://pbs.twimg.com/media/F2345678901BCDEF.jpg",
        type: "photo",
        sizes: {
          thumb: { w: 150, h: 150 },
          small: { w: 680, h: 453 },
          medium: { w: 1200, h: 800 },
          large: { w: 2048, h: 1365 },
        },
      },
      {
        media_url_https: "https://pbs.twimg.com/media/F3456789012CDEFG.jpg",
        media_url: "http://pbs.twimg.com/media/F3456789012CDEFG.jpg",
        type: "photo",
        sizes: {
          thumb: { w: 150, h: 150 },
          small: { w: 680, h: 453 },
          medium: { w: 1200, h: 800 },
          large: { w: 2048, h: 1365 },
        },
      },
      {
        media_url_https:
          "https://pbs.twimg.com/ext_tw_video_thumb/1234567890/pu/img/abcdefghijklmnop.jpg",
        type: "video",
        video_info: {
          duration_millis: 30000,
          aspect_ratio: [16, 9],
          variants: [
            {
              content_type: "video/mp4",
              url: "https://video.twimg.com/ext_tw_video/1234567890/pu/vid/1280x720/abcdefghijklmnop.mp4",
              bitrate: 2176000,
            },
            {
              content_type: "video/mp4",
              url: "https://video.twimg.com/ext_tw_video/1234567890/pu/vid/640x360/abcdefghijklmnop.mp4",
              bitrate: 832000,
            },
            {
              content_type: "video/mp4",
              url: "https://video.twimg.com/ext_tw_video/1234567890/pu/vid/320x180/abcdefghijklmnop.mp4",
              bitrate: 256000,
            },
          ],
        },
      },
    ],
  },
  lang: "en",
  scraped_at: "2024-01-13T18:00:00.000Z",
};

/**
 * Quoted tweet response
 */
export const QUOTED_TWEET_RESPONSE: ApifyXResponse = {
  id: "1234567890123456795",
  text: "This is exactly what I've been saying! The future of web development is moving in this direction.",
  author: {
    userName: "webdevguru",
    name: "Mike Thompson",
    profileImageUrl:
      "https://pbs.twimg.com/profile_images/7654321098/profile_normal.jpg",
    followers: 23456,
    isVerified: false,
  },
  likes: 567,
  retweets: 123,
  replies: 34,
  viewCount: 12345,
  createdAt: "2024-01-12T09:30:00.000Z",
  url: "https://x.com/webdevguru/status/1234567890123456795",
  isQuote: true,
  quotedStatus: {
    id: "1234567890123456789",
    text: "Server components are changing how we think about React applications. Here's why:",
    author: {
      userName: "reactexpert",
      name: "Emma Davis",
      profileImageUrl:
        "https://pbs.twimg.com/profile_images/8765432109/profile_normal.jpg",
      followers: 45678,
      isVerified: true,
    },
    likes: 2345,
    retweets: 567,
    replies: 89,
    createdAt: "2024-01-11T15:00:00.000Z",
    url: "https://x.com/reactexpert/status/1234567890123456789",
  },
  quotedTweet: {
    id: "1234567890123456789",
    text: "Server components are changing how we think about React applications. Here's why:",
    author: {
      userName: "reactexpert",
      name: "Emma Davis",
      profileImageUrl:
        "https://pbs.twimg.com/profile_images/8765432109/profile_normal.jpg",
      followers: 45678,
      isVerified: true,
    },
    likes: 2345,
    retweets: 567,
    replies: 89,
    createdAt: "2024-01-11T15:00:00.000Z",
    url: "https://x.com/reactexpert/status/1234567890123456789",
  },
  lang: "en",
  scraped_at: "2024-01-12T10:00:00.000Z",
};

/**
 * Retweet response
 */
export const RETWEET_RESPONSE: ApifyXResponse = {
  id: "1234567890123456796",
  text: "RT @originalauthor: Breaking: Major breakthrough in quantum computing announced today! This could revolutionize encryption and drug discovery. 🔬💻",
  author: {
    userName: "techreporter",
    name: "Tech News Daily",
    profileImageUrl:
      "https://pbs.twimg.com/profile_images/9876543210/profile_normal.jpg",
    followers: 123456,
    isVerified: true,
  },
  likes: 234,
  retweets: 56,
  replies: 12,
  createdAt: "2024-01-11T18:45:00.000Z",
  url: "https://x.com/techreporter/status/1234567890123456796",
  isRetweet: true,
  retweetedStatus: {
    id: "1234567890123456797",
    text: "Breaking: Major breakthrough in quantum computing announced today! This could revolutionize encryption and drug discovery. 🔬💻",
    author: {
      userName: "originalauthor",
      name: "Quantum Research Lab",
      profileImageUrl:
        "https://pbs.twimg.com/profile_images/1122334455/profile_normal.jpg",
      followers: 56789,
      isVerified: true,
    },
    likes: 4567,
    retweets: 1234,
    replies: 234,
    createdAt: "2024-01-11T16:00:00.000Z",
    url: "https://x.com/originalauthor/status/1234567890123456797",
  },
  lang: "en",
  scraped_at: "2024-01-11T19:00:00.000Z",
};

/**
 * Tweet with hashtags and mentions
 */
export const HASHTAGS_MENTIONS_TWEET_RESPONSE: ApifyXResponse = {
  id: "1234567890123456798",
  text: "Had an amazing time at #WebSummit2024 with @techleader and @startupfounder! The keynote on #AI and #MachineLearning was mind-blowing. Can't wait for next year! 🎉",
  fullText:
    "Had an amazing time at #WebSummit2024 with @techleader and @startupfounder! The keynote on #AI and #MachineLearning was mind-blowing. Can't wait for next year! 🎉",
  author: {
    userName: "conferencegoer",
    username: "conferencegoer",
    name: "Jessica Park",
    displayName: "Jessica Park",
    profileImageUrl:
      "https://pbs.twimg.com/profile_images/2233445566/profile_normal.jpg",
    followers: 3456,
    isVerified: false,
  },
  likes: 123,
  retweets: 34,
  replies: 12,
  viewCount: 2345,
  createdAt: "2024-01-10T20:15:00.000Z",
  url: "https://x.com/conferencegoer/status/1234567890123456798",
  hashtags: ["WebSummit2024", "AI", "MachineLearning"],
  entities: {
    hashtags: [
      { text: "WebSummit2024" },
      { text: "AI" },
      { text: "MachineLearning" },
    ],
    user_mentions: [
      { screen_name: "techleader" },
      { screen_name: "startupfounder" },
    ],
  },
  lang: "en",
  scraped_at: "2024-01-10T21:00:00.000Z",
};

/**
 * Rate limit error response
 */
export const RATE_LIMIT_ERROR_RESPONSE: ApifyErrorResponse = {
  error: {
    type: "rate_limit_exceeded",
    message: "Rate limit exceeded. Please try again in 15 minutes.",
    statusCode: 429,
  },
};

/**
 * API failure error response
 */
export const API_FAILURE_ERROR_RESPONSE: ApifyErrorResponse = {
  error: {
    type: "api_error",
    message:
      "Failed to fetch data from X.com API. The service might be temporarily unavailable.",
    statusCode: 503,
  },
};

/**
 * Authentication error response
 */
export const AUTH_ERROR_RESPONSE: ApifyErrorResponse = {
  error: {
    type: "authentication_error",
    message: "Invalid API key or authentication credentials.",
    statusCode: 401,
  },
};

/**
 * Tweet with missing author fields (edge case)
 */
export const MISSING_AUTHOR_FIELDS_RESPONSE: ApifyXResponse = {
  id: "1234567890123456799",
  text: "Testing edge case handling when author data is incomplete",
  // Author object exists but missing some fields
  author: {
    userName: "unknownuser",
    // Missing: name, profileImageUrl, followers, isVerified
  },
  likes: 5,
  retweets: 1,
  // Missing: replies, viewCount
  createdAt: "2024-01-09T12:00:00.000Z",
  url: "https://x.com/unknownuser/status/1234567890123456799",
  lang: "en",
  scraped_at: "2024-01-09T13:00:00.000Z",
};

/**
 * Tweet with author fields at root level (alternative response format)
 */
export const ROOT_LEVEL_AUTHOR_RESPONSE: ApifyXResponse = {
  id: "1234567890123456800",
  text: "Sometimes the API returns author info at the root level instead of nested",
  // No author object, fields at root level
  username: "rootleveluser",
  displayName: "Root Level User",
  userName: "rootleveluser",
  likes: 45,
  retweets: 12,
  replies: 3,
  createdAt: "2024-01-08T14:30:00.000Z",
  url: "https://x.com/rootleveluser/status/1234567890123456800",
  lang: "en",
  scraped_at: "2024-01-08T15:00:00.000Z",
};

/**
 * Tweet with malformed/missing content (edge case)
 */
export const MALFORMED_CONTENT_RESPONSE: ApifyXResponse = {
  id: "1234567890123456801",
  // Missing: text field
  author: {
    userName: "malformedtweet",
    name: "Malformed Tweet User",
  },
  // Missing most engagement metrics
  likes: 0,
  createdAt: "2024-01-07T10:00:00.000Z",
  url: "https://x.com/malformedtweet/status/1234567890123456801",
  scraped_at: "2024-01-07T11:00:00.000Z",
};

/**
 * Tweet with all possible field variations (comprehensive test case)
 */
export const COMPREHENSIVE_RESPONSE: ApifyXResponse = {
  // Multiple ID formats
  id: "1234567890123456802",
  tweetId: "1234567890123456802",

  // Multiple text formats
  text: "Short version of the tweet",
  fullText:
    "This is the full version of the tweet with more content that might have been truncated in the short version. #ComprehensiveTest @testuser",

  // Complete author object
  author: {
    userName: "comprehensiveuser",
    username: "comprehensiveuser",
    name: "Comprehensive Test User",
    displayName: "Comprehensive Test User ✓",
    profileImageUrl:
      "https://pbs.twimg.com/profile_images/1234567890/profile_400x400.jpg",
    profilePicture:
      "https://pbs.twimg.com/profile_images/1234567890/profile_400x400.jpg",
    followers: 123456,
    followersCount: 123456,
    isVerified: true,
    verified: true,
  },

  // All engagement metric variations
  likes: 999,
  favoriteCount: 999,
  likeCount: 999,
  retweets: 333,
  retweetCount: 333,
  replies: 111,
  replyCount: 111,
  viewCount: 55555,
  views: 55555,

  // All URL formats
  url: "https://x.com/comprehensiveuser/status/1234567890123456802",
  twitterUrl:
    "https://twitter.com/comprehensiveuser/status/1234567890123456802",
  tweetUrl: "https://x.com/comprehensiveuser/status/1234567890123456802",

  // All timestamp formats
  createdAt: "2024-01-06T08:30:00.000Z",
  date: "2024-01-06T08:30:00.000Z",
  timestamp: "2024-01-06T08:30:00.000Z",

  // Reply/thread information
  isReply: true,
  inReplyToStatusId: "1234567890123456700",
  conversationId: "1234567890123456600",

  // Language and source
  lang: "en",
  source:
    '<a href="https://mobile.twitter.com" rel="nofollow">Twitter for iPhone</a>',

  // Scraping metadata
  scraped_at: "2024-01-06T09:00:00.000Z",
  source_type: "tweet",
  source_target: "https://x.com/comprehensiveuser/status/1234567890123456802",

  // Entities
  entities: {
    hashtags: [{ text: "ComprehensiveTest" }],
    user_mentions: [{ screen_name: "testuser" }],
  },
  hashtags: ["ComprehensiveTest"],
};

/**
 * Empty/null response (edge case)
 */
export const EMPTY_RESPONSE: ApifyXResponse = {
  // Minimal valid response with mostly empty/null values
  id: "",
  scraped_at: "2024-01-05T12:00:00.000Z",
};

/**
 * Collection of all test fixtures for easy import
 */
export const X_COM_TEST_FIXTURES = {
  singleTweet: SINGLE_TWEET_RESPONSE,
  thread: THREAD_RESPONSE,
  mediaRich: MEDIA_RICH_TWEET_RESPONSE,
  quotedTweet: QUOTED_TWEET_RESPONSE,
  retweet: RETWEET_RESPONSE,
  hashtagsMentions: HASHTAGS_MENTIONS_TWEET_RESPONSE,
  rateLimitError: RATE_LIMIT_ERROR_RESPONSE,
  apiFailureError: API_FAILURE_ERROR_RESPONSE,
  authError: AUTH_ERROR_RESPONSE,
  missingAuthorFields: MISSING_AUTHOR_FIELDS_RESPONSE,
  rootLevelAuthor: ROOT_LEVEL_AUTHOR_RESPONSE,
  malformedContent: MALFORMED_CONTENT_RESPONSE,
  comprehensive: COMPREHENSIVE_RESPONSE,
  empty: EMPTY_RESPONSE,
};
