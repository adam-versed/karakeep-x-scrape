# Karakeep Extension Plan: X.com Scraping Integration

## Executive Summary

This document outlines the plan to extend Karakeep with enhanced X.com (Twitter) scraping capabilities using Apify, leveraging code from the x-design-trends project located at `/Users/adamjackson/LocalDev/x-design-trends`. The goal is to create a public-facing bookmark repository where administrators can add bookmarks (including X.com threads) via browser extension/API, while the public can view them in read-only mode.

## Project Paths
- **Karakeep**: `/Users/adamjackson/karakeep-app/source`
- **X-Design-Trends**: `/Users/adamjackson/LocalDev/x-design-trends`

## Current Karakeep Architecture Analysis

### Core Technologies
- **Frontend**: Next.js 14 with App Router, React 18, Tailwind CSS
- **Backend**: tRPC, Drizzle ORM, SQLite
- **Authentication**: NextAuth with API key support
- **Workers**: Background job processing with liteque
- **Scraping**: Playwright for web scraping, metascraper for metadata extraction

### Key Components

#### 1. Database Schema (`/Users/adamjackson/karakeep-app/source/packages/db/schema.ts`)
- **bookmarkLists** table has a `public` boolean field (line 341) for public sharing
- **apiKeys** table supports Bearer token authentication
- **bookmarkLinks** stores scraped content including `htmlContent` and `content`

#### 2. Scraping System (`/Users/adamjackson/karakeep-app/source/apps/workers/workers/crawlerWorker.ts`)
- Uses Playwright for browser automation
- Metascraper plugins for content extraction
- Supports screenshots and full-page archiving
- Background job processing via queues

#### 3. Public Access (`/Users/adamjackson/karakeep-app/source/packages/trpc/routers/publicBookmarks.ts`)
- Public procedures for fetching list metadata and contents
- No authentication required for public lists
- Available at `/public/lists/[listId]`

#### 4. Authentication System
- **API Keys**: `/Users/adamjackson/karakeep-app/source/packages/trpc/auth.ts` - Bearer token authentication
- **Context Creation**: `/Users/adamjackson/karakeep-app/source/apps/web/server/api/client.ts` - Handles both session and API key auth
- **Middleware**: `/Users/adamjackson/karakeep-app/source/packages/trpc/index.ts` - `authedProcedure` for protected routes

#### 5. Browser Extension (`/Users/adamjackson/karakeep-app/source/apps/browser-extension/`)
- Context menu integration for quick bookmarking
- Supports link, text, and image bookmarking
- Communicates with backend via API

## X-Design-Trends Components to Reuse

### 1. Apify Integration (`/Users/adamjackson/LocalDev/x-design-trends/src/services/ScrapingService.ts`)
```typescript
// Key components to copy:
- ApifyClient initialization (lines 10-20)
- runApifyActor method (lines 50-120)
- Error handling and retry logic
- Response parsing for X.com content
```

### 2. Configuration (`/Users/adamjackson/LocalDev/x-design-trends/src/services/ConfigService.ts`)
```typescript
// Configuration patterns to adopt:
- APIFY_API_KEY environment variable
- Scraping targets configuration
- Error webhook handling
```

### 3. Types and Interfaces
```typescript
// From /Users/adamjackson/LocalDev/x-design-trends/src/types/:
- ScrapedPost interface
- ApifyResponse types
- Error handling types
```

## Implementation Plan

### Phase 1: Environment Setup

#### 1.1 Add Environment Variables
```bash
# In Karakeep's .env file
APIFY_API_KEY=your_apify_api_key
APIFY_X_SCRAPER_ACTOR_ID=apify/twitter-scraper
ENABLE_ENHANCED_X_SCRAPING=true
```

#### 1.2 Update Configuration
**File**: `/Users/adamjackson/karakeep-app/source/packages/shared/config.ts`
```typescript
// Add to serverConfig
scraping: {
  apify: {
    apiKey: process.env.APIFY_API_KEY,
    xScraperActorId: process.env.APIFY_X_SCRAPER_ACTOR_ID || 'apify/twitter-scraper',
    enabled: process.env.ENABLE_ENHANCED_X_SCRAPING === 'true'
  }
}
```

### Phase 2: Apify Integration

#### 2.1 Create Apify Service
**New File**: `/Users/adamjackson/karakeep-app/source/packages/shared/services/apifyService.ts`
```typescript
// Copy and adapt from x-design-trends:
// - /Users/adamjackson/LocalDev/x-design-trends/src/services/ScrapingService.ts (lines 10-150)
// Key modifications:
// - Remove design-specific filtering
// - Add thread reconstruction logic
// - Return format compatible with Karakeep's bookmark structure
```

#### 2.2 Create X.com Metascraper Plugin
**New File**: `/Users/adamjackson/karakeep-app/source/apps/workers/metascraper-plugins/metascraper-x.ts`
```typescript
import type { ApifyXResponse } from '@karakeep/shared/types/apify';

export default () => {
  return {
    author: async ({ url, html, apifyData }: { url: string, html: string, apifyData?: ApifyXResponse }) => {
      if (apifyData?.author) {
        return apifyData.author.name;
      }
      // Fallback to HTML parsing
    },
    thread: async ({ url, html, apifyData }: { url: string, html: string, apifyData?: ApifyXResponse }) => {
      if (apifyData?.thread) {
        return reconstructThread(apifyData.thread);
      }
      return null;
    }
  };
};
```

### Phase 3: Crawler Worker Enhancement

#### 3.1 Modify Crawler Worker
**File**: `/Users/adamjackson/karakeep-app/source/apps/workers/workers/crawlerWorker.ts`

**Add after line 820** (in `runCrawler` function):
```typescript
// Check if URL is X.com and enhanced scraping is enabled
if (serverConfig.scraping.apify.enabled && isXComUrl(url)) {
  const apifyResult = await crawlXComWithApify(url, userId, jobId, bookmarkId, job.abortSignal);
  if (apifyResult) {
    // Use Apify result instead of regular crawling
    await processApifyResult(apifyResult, bookmarkId, userId);
    return;
  }
  // Fall back to regular crawling if Apify fails
}
```

**Add helper functions**:
```typescript
function isXComUrl(url: string): boolean {
  const urlObj = new URL(url);
  return urlObj.hostname === 'x.com' || urlObj.hostname === 'twitter.com';
}

async function crawlXComWithApify(
  url: string, 
  userId: string, 
  jobId: string, 
  bookmarkId: string,
  abortSignal: AbortSignal
) {
  // Implementation using ApifyService
  // Copy logic from x-design-trends ScrapingService
}
```

### Phase 4: Public Interface Enhancement

#### 4.1 Public List Display
**No changes needed** - Existing public list functionality at `/public/lists/[listId]` is already sufficient

#### 4.2 RSS Feed Enhancement
**File**: `/Users/adamjackson/karakeep-app/source/packages/api/routes/rss.ts`
- Ensure X.com content is properly formatted in RSS feeds
- Include thread content in feed items

### Phase 5: API Security

#### 5.1 Bookmark Creation Restrictions
**Already implemented** via `authedProcedure` in tRPC routers

#### 5.2 API Key Scoping
**No changes needed** - Existing API key system already provides proper authentication

## Detailed File Mappings

### From x-design-trends to Karakeep

| x-design-trends File | Karakeep Destination | Purpose |
|---------------------|---------------------|----------|
| `/Users/adamjackson/LocalDev/x-design-trends/src/services/ScrapingService.ts` | `/Users/adamjackson/karakeep-app/source/packages/shared/services/apifyService.ts` | Apify API integration |
| `/Users/adamjackson/LocalDev/x-design-trends/src/types/index.ts` (ScrapedPost) | `/Users/adamjackson/karakeep-app/source/packages/shared/types/apify.ts` | Type definitions |
| `/Users/adamjackson/LocalDev/x-design-trends/config/scraping-targets.json` | Not needed | Karakeep scrapes on-demand |
| Error handling patterns from ScrapingService | Integrate into crawler worker | Robust error handling |

### Code to Copy from x-design-trends

1. **Apify Client Setup** (`/Users/adamjackson/LocalDev/x-design-trends/src/services/ScrapingService.ts:10-20`)
```typescript
const client = new ApifyClient({
  token: this.config.apifyApiKey,
});
```

2. **Actor Execution** (`/Users/adamjackson/LocalDev/x-design-trends/src/services/ScrapingService.ts:50-120`)
```typescript
const run = await client.actor(APIFY_TWITTER_ACTOR_ID).call(input, {
  timeout: 300, // 5 minutes
});
```

3. **Response Processing** (`/Users/adamjackson/LocalDev/x-design-trends/src/services/ScrapingService.ts:130-200`)
- Tweet parsing logic
- Thread reconstruction
- Error handling

4. **Type Definitions to Copy**
From `/Users/adamjackson/LocalDev/x-design-trends/src/types/index.ts`:
```typescript
export interface ScrapedPost {
  id: string;
  text: string;
  author: {
    username: string;
    name: string;
    profilePicture?: string;
  };
  createdAt: string;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    views?: number;
  };
  media?: Array<{
    type: 'photo' | 'video' | 'gif';
    url: string;
    thumbnailUrl?: string;
  }>;
  isThread?: boolean;
  threadPosts?: ScrapedPost[];
  quotedPost?: ScrapedPost;
  url: string;
}
```

## Testing Strategy

### 1. Unit Tests
- Test X.com URL detection
- Mock Apify responses
- Verify thread reconstruction

### 2. Integration Tests
- Test full scraping pipeline with X.com URLs
- Verify public/private access controls
- Test API key authentication

### 3. Manual Testing Checklist
- [ ] Add X.com bookmark via browser extension
- [ ] Verify thread content is fully captured
- [ ] Check public list displays thread properly
- [ ] Test with various X.com content types (single tweet, thread, quoted tweets)
- [ ] Verify fallback to regular scraping if Apify fails

## Configuration Examples

### Development Setup
```bash
# .env.local
APIFY_API_KEY=apify_api_xxx
DATABASE_URL=file:./dev.db
NEXTAUTH_URL=http://localhost:3000
```

### Production Deployment
```bash
# Environment variables
APIFY_API_KEY=apify_api_production_xxx
ENABLE_ENHANCED_X_SCRAPING=true
# Rate limiting
APIFY_MAX_REQUESTS_PER_MINUTE=10
```

## Specific Code Examples

### Example: Apify Service Implementation
Based on `/Users/adamjackson/LocalDev/x-design-trends/src/services/ScrapingService.ts`:

```typescript
// /Users/adamjackson/karakeep-app/source/packages/shared/services/apifyService.ts

import { ApifyClient } from 'apify-client';
import serverConfig from '@karakeep/shared/config';
import logger from '@karakeep/shared/logger';

const APIFY_TWITTER_ACTOR_ID = 'apify/twitter-scraper';

export class ApifyService {
  private client: ApifyClient;

  constructor() {
    this.client = new ApifyClient({
      token: serverConfig.scraping.apify.apiKey,
    });
  }

  async scrapeXThread(url: string): Promise<ScrapedPost | null> {
    try {
      const input = {
        urls: [url],
        includeThread: true,
        maxTweets: 50,
      };

      const run = await this.client.actor(APIFY_TWITTER_ACTOR_ID).call(input, {
        timeout: 300, // 5 minutes
      });

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
      
      if (items.length === 0) {
        return null;
      }

      return this.transformApifyResponse(items[0]);
    } catch (error) {
      logger.error(`Failed to scrape X.com URL ${url}:`, error);
      return null;
    }
  }

  private transformApifyResponse(apifyData: any): ScrapedPost {
    // Transform Apify response to Karakeep format
    // Implementation based on x-design-trends ScrapingService
  }
}
```

## Potential Challenges and Solutions

### 1. Rate Limiting
**Challenge**: Apify has usage limits
**Solution**: Implement caching and rate limiting in ApifyService

### 2. Cost Management
**Challenge**: Apify charges per actor run
**Solution**: 
- Cache results in Karakeep's database
- Only use Apify for X.com URLs
- Implement daily/monthly limits

### 3. Content Formatting
**Challenge**: X.com threads need special formatting
**Solution**: Create custom renderer for thread content in bookmark preview

## Migration Path

### For Existing Karakeep Users
1. Deploy update with feature flag disabled
2. Test with small group of users
3. Enable for all users
4. Optionally re-crawl existing X.com bookmarks

### For New Installations
1. Include Apify configuration in setup
2. Document API key requirements
3. Provide setup wizard for configuration

## Maintenance Considerations

1. **Apify Actor Updates**: Monitor for Twitter scraper actor updates
2. **X.com API Changes**: Be prepared to update scraping logic
3. **Cost Monitoring**: Implement usage tracking and alerts
4. **Error Monitoring**: Set up alerts for scraping failures

## Quick Reference: Key Files to Modify

1. **Configuration**: `/Users/adamjackson/karakeep-app/source/packages/shared/config.ts`
2. **Crawler Worker**: `/Users/adamjackson/karakeep-app/source/apps/workers/workers/crawlerWorker.ts`
3. **New Apify Service**: `/Users/adamjackson/karakeep-app/source/packages/shared/services/apifyService.ts`
4. **New Types**: `/Users/adamjackson/karakeep-app/source/packages/shared/types/apify.ts`
5. **New Metascraper Plugin**: `/Users/adamjackson/karakeep-app/source/apps/workers/metascraper-plugins/metascraper-x.ts`

## Conclusion

This implementation extends Karakeep with powerful X.com scraping capabilities while maintaining its clean architecture and security model. By reusing proven code from x-design-trends and leveraging Karakeep's existing public list functionality, we can deliver this feature with minimal complexity and maximum reliability.

The implementation preserves Karakeep's existing architecture while adding targeted enhancements for X.com content, ensuring that regular bookmarking functionality remains unaffected while providing superior support for Twitter/X content.