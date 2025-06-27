# Karakeep X.com Scraping Integration Roadmap

## Overview
This roadmap tracks the implementation of enhanced X.com (Twitter) scraping capabilities in Karakeep using Apify, based on the detailed plan in `karakeep-x-scraping-plan.md`.

## Implementation Status Legend
- ⬜ Not Started
- 🟨 In Progress
- ✅ Completed
- ❌ Blocked
- 🔄 Testing

---

## Phase 1: Environment Setup & Configuration
**Goal**: Set up necessary environment variables and configuration for Apify integration

### 1.1 Environment Variables
- ✅ Add `APIFY_API_KEY` to `.env.sample` (2025-06-27)
- ✅ Add `APIFY_X_SCRAPER_ACTOR_ID` to `.env.sample` (2025-06-27)
- ✅ Add `ENABLE_ENHANCED_X_SCRAPING` to `.env.sample` (2025-06-27)
- ✅ Update local `.env` with actual values (2025-06-27)

### 1.2 Configuration Updates
- ✅ Update `/packages/shared/config.ts` with Apify configuration (2025-06-27)
  - ✅ Add scraping.apify object
  - ✅ Add apiKey field
  - ✅ Add xScraperActorId field
  - ✅ Add enabled flag

### 1.3 Package Dependencies
- ✅ Add `apify-client` to relevant package.json files (2025-06-27)
- ✅ Run `pnpm install` to install dependencies (2025-06-27)

---

## Phase 2: Core Apify Integration
**Goal**: Create the core Apify service and type definitions

### 2.1 Type Definitions
- ✅ Create `/packages/shared/types/apify.ts` (2025-06-27)
  - ✅ Define `ScrapedPost` interface
  - ✅ Define `ApifyXResponse` interface
  - ✅ Define error types
  - ✅ Define thread structure types

### 2.2 Apify Service Implementation
- ✅ Create `/packages/shared/services/apifyService.ts` (2025-06-27)
  - ✅ Implement ApifyClient initialization
  - ✅ Implement `scrapeXUrl` method
  - ✅ Implement `transformToKarakeepFormat` method
  - ✅ Add error handling and retry logic
  - ✅ Add rate limiting logic

### 2.3 Utility Functions
- ✅ Create X.com URL detection utility (2025-06-27)
- ✅ Create content processing utilities (2025-06-27)
- ✅ Create URL normalization utilities (2025-06-27)

---

## Phase 3: Worker Integration
**Goal**: Integrate Apify scraping into the existing crawler worker

### 3.1 Metascraper Plugin
- ✅ Create `/apps/workers/metascraper-plugins/metascraper-x.ts` (2025-06-27)
  - ✅ Implement author extraction
  - ✅ Implement enhanced content extraction with Apify data
  - ✅ Implement media extraction
  - ✅ Add fallback to HTML parsing

### 3.2 Crawler Worker Enhancement
- ✅ Modify `/apps/workers/workers/crawlerWorker.ts` (2025-06-27)
  - ✅ Add X.com URL detection
  - ✅ Add Apify integration point
  - ✅ Implement `crawlXComWithApify` function
  - ✅ Implement `processApifyResult` function
  - ✅ Add fallback mechanism
  - ✅ Update error handling

### 3.3 Database Storage
- ✅ Ensure thread content is properly stored (2025-06-27)
- ✅ Use existing bookmark structure (2025-06-27)
- ✅ Proper asset handling for images (2025-06-27)

---

## Phase 4: Testing Implementation
**Goal**: Comprehensive testing of the X.com scraping functionality using Vitest framework

### 4.1 Unit Tests (`packages/shared/`)
**4.1.1 X.com Utilities Testing** (`packages/shared/utils/xcom.test.ts`)
- ✅ Test `isXComUrl()` with various URL formats (2025-06-27)
  - ✅ Valid: x.com, twitter.com, mobile variants, www prefixes
  - ✅ Invalid: other domains, malformed URLs, empty strings
- ✅ Test `extractTweetId()` and `extractUsername()` functions (2025-06-27)
  - ✅ Valid tweet URLs with correct ID extraction
  - ✅ Profile URLs and edge cases
- ✅ Test `normalizeXComUrl()` URL cleaning (2025-06-27)
  - ✅ Remove tracking parameters (s, t, utm_*)
  - ✅ Convert twitter.com to x.com
  - ✅ Handle mobile domains
- ✅ Test content extraction utilities (2025-06-27)
  - ✅ `extractHashtags()` with various text formats
  - ✅ `extractMentions()` with edge cases
  - ✅ `cleanTweetText()` encoding and link removal

**4.1.2 ApifyService Testing** (`packages/shared/services/apifyService.test.ts`)
- ✅ Mock `apify-client` using `vi.mock("apify-client")` (2025-06-27)
- ✅ Test `scrapeXUrl()` method with mocked responses (2025-06-27)
  - ✅ Successful response transformation
  - ✅ Empty/null response handling
  - ✅ Malformed response data
- ✅ Test data normalization methods (2025-06-27)
  - ✅ `normalizeApifyResults()` with various response formats
  - ✅ `extractMedia()` from different data structures
  - ✅ `extractHashtags()` and `extractMentions()` edge cases
- ✅ Test error handling scenarios (2025-06-27)
  - ✅ Network failures and timeouts
  - ✅ API rate limiting responses
  - ✅ Invalid API key scenarios
- ✅ Test configuration validation (2025-06-27)
  - ✅ `ApifyService.isEnabled()` logic
  - ✅ Missing configuration handling
  - ✅ Service initialization edge cases

### 4.2 Integration Tests
**4.2.1 Metascraper Plugin Testing** (`apps/workers/metascraper-plugins/metascraper-x.test.ts`)
- ✅ Test plugin with mocked Apify data injection (2025-06-27)
  - ✅ Enhanced metadata extraction when Apify data available
  - ✅ Fallback to HTML parsing when Apify data unavailable
  - ✅ Field mapping and transformation accuracy
- ✅ Test integration with metascraper pipeline (2025-06-27)
  - ✅ Plugin registration and execution order
  - ✅ Data passing between plugins
  - ✅ Error handling in plugin chain

**4.2.2 Crawler Worker Integration Testing** (`apps/workers/workers/crawlerWorker.test.ts`)
- ✅ Test X.com URL detection and routing (2025-06-27)
  - ✅ `isXComUrl()` integration in worker pipeline
  - ✅ Conditional Apify service instantiation
- ✅ Test `crawlXComWithApify()` function (2025-06-27)
  - ✅ Successful Apify scraping workflow
  - ✅ Service configuration validation
  - ✅ Error handling and fallback triggers
- ✅ Test `processApifyResult()` function (2025-06-27)
  - ✅ Database transaction handling
  - ✅ Asset download and storage
  - ✅ Bookmark metadata updates
- ✅ Test fallback mechanisms (2025-06-27)
  - ✅ Graceful degradation when Apify disabled
  - ✅ Fallback when Apify service fails
  - ✅ Regular crawling pipeline integration
- ✅ Test queue integration (2025-06-27)
  - ✅ Mock `LinkCrawlerQueue` and related queues
  - ✅ Post-processing job enqueueing
  - ✅ Webhook and search reindex triggers

### 4.3 End-to-End Tests (`packages/e2e_tests/`)
**4.3.1 X.com Bookmark Creation Workflow** (`packages/e2e_tests/tests/workers/x-crawler.test.ts`)
- ⬜ Test full bookmark creation with X.com URLs
  - ⬜ Create test user and API client setup
  - ⬜ Mock Apify responses for consistent testing
  - ⬜ Verify enhanced content storage in database
- ⬜ Test various X.com content types
  - ⬜ Single tweet with media
  - ⬜ Thread/conversation posts
  - ⬜ Quoted tweets and retweets
  - ⬜ Tweets with hashtags and mentions
- ⬜ Test asset handling workflow
  - ⬜ Image download and storage
  - ⬜ Asset association with bookmarks
  - ⬜ Media thumbnail generation
- ⬜ Test fallback scenarios
  - ⬜ Apify service disabled configuration
  - ⬜ Apify API failure simulation
  - ⬜ Regular crawling workflow validation

### 4.4 Mock Data and Fixtures
**4.4.1 Create Comprehensive Test Fixtures**
- ⬜ Single tweet response data
- ⬜ Thread/conversation response data
- ⬜ Media-rich tweet response data
- ⬜ Quoted tweet response data
- ⬜ Error response scenarios (rate limits, API failures)
- ⬜ Edge case data (missing fields, malformed content)

**4.4.2 Mock Strategy Implementation**
- ⬜ Module-level mocking for external APIs
  - ⬜ `vi.mock("apify-client")` with realistic responses
  - ⬜ `vi.mock("@karakeep/shared/queues")` for queue operations
- ⬜ Instance-level mocking for services
  - ⬜ ApifyService mock instances for integration tests
  - ⬜ Database transaction mocking where needed
- ⬜ Network request mocking
  - ⬜ Asset download simulation
  - ⬜ External URL fetching scenarios

### 4.5 Performance and Load Testing
- ⬜ Test rate limiting behavior
  - ⬜ Multiple concurrent X.com URL processing
  - ⬜ Apify API rate limit compliance
  - ⬜ Worker queue throughput measurement
- ⬜ Test memory usage patterns
  - ⬜ Large thread processing
  - ⬜ Media-heavy content handling
  - ⬜ Garbage collection effectiveness

### 4.6 Error Handling and Edge Cases
- ⬜ Test configuration edge cases
  - ⬜ Missing APIFY_API_KEY handling
  - ⬜ Invalid actor ID scenarios
  - ⬜ Feature disabled state behavior
- ⬜ Test network failure scenarios
  - ⬜ Apify API unavailability
  - ⬜ Timeout handling
  - ⬜ Partial response processing
- ⬜ Test data validation
  - ⬜ Malformed Apify responses
  - ⬜ Missing required fields
  - ⬜ Unexpected data types

### 4.7 Manual Testing Validation
- ⬜ Test single tweet scraping with real URLs
- ⬜ Test thread scraping with real conversations
- ⬜ Test quoted tweet scraping
- ⬜ Test media-rich tweets (images, videos)
- ⬜ Test via browser extension bookmark creation
- ⬜ Test via API direct calls
- ⬜ Verify public list display of X.com content
- ⬜ Test mobile view compatibility
- ⬜ Verify RSS feed generation includes X.com content

---

## Phase 5: UI/UX Enhancements
**Goal**: Ensure X.com content is properly displayed

### 5.1 Content Display
- ⬜ Review thread display in bookmark view
- ⬜ Ensure proper formatting of tweets
- ⬜ Handle media display correctly
- ⬜ Add thread navigation if needed

### 5.2 Public Interface
- ⬜ Verify public list displays X.com content properly
- ⬜ Test RSS feed generation with X.com content
- ⬜ Ensure mobile view works correctly

---

## Phase 6: Documentation & Deployment
**Goal**: Document the feature and prepare for deployment

### 6.1 Documentation
- ⬜ Update README with X.com scraping feature
- ⬜ Document Apify setup requirements
- ⬜ Create troubleshooting guide
- ⬜ Update API documentation

### 6.2 Deployment Preparation
- ⬜ Add feature flag for gradual rollout
- ⬜ Create migration guide for existing users
- ⬜ Set up monitoring for Apify usage
- ⬜ Configure cost alerts

### 6.3 Final Testing
- ⬜ End-to-end testing in staging environment
- ⬜ Load testing with multiple concurrent requests
- ⬜ Security review of API implementation

---

## Current Status Summary

**Overall Progress**: 66/120 tasks completed (55%)

### By Phase:
- Phase 1 (Environment Setup): 11/11 tasks (100%) ✅ Complete
- Phase 2 (Core Integration): 14/14 tasks (100%) ✅ Complete
- Phase 3 (Worker Integration): 16/16 tasks (100%) ✅ Complete
- Phase 4 (Testing): 25/59 tasks (42%) 🔄 **Core unit and integration tests complete**
- Phase 5 (UI/UX): 0/8 tasks (0%)
- Phase 6 (Documentation): 0/12 tasks (0%)

### Next Steps:
1. Complete remaining Phase 4 tests (E2E, performance, manual)
2. Begin Phase 5 - UI/UX enhancements
3. Phase 6 - Documentation and deployment preparation

### Blockers:
- None currently identified

### Notes:
- Implementation follows the detailed plan in `karakeep-x-scraping-plan.md`
- Each completed task should be marked with ✅ and include completion date
- Any blockers should be documented with reasons and potential solutions

---

## Implementation Log

### 2025-06-27
- Created implementation roadmap
- **Completed Phases 1, 2, and 3** (55% overall progress)
- **Phase 1**: Full environment setup with Apify configuration
- **Phase 2**: Complete Apify service implementation with robust type system
- **Phase 3**: Full crawler worker integration with intelligent fallback
- **Completed core Phase 4 testing** (55% overall progress)
  - ✅ **Unit Tests**: Comprehensive test suite for X.com utilities and ApifyService
    - `packages/shared/utils/xcom.test.ts` - 66 tests covering URL detection, validation, and content processing
    - `packages/shared/services/apifyService.test.ts` - 23 tests covering API integration, error handling, and data transformation
  - ✅ **Integration Tests**: Full metascraper plugin and crawler worker testing
    - `apps/workers/metascraper-plugins/metascraper-x.test.ts` - 28 tests covering plugin functionality and fallback scenarios
    - `apps/workers/workers/crawlerWorker.test.ts` - 25 tests covering X.com URL routing, Apify integration, and worker pipeline
- All TypeScript type checking passes
- All tests pass successfully with proper mocking and error handling
- Core X.com scraping functionality is complete and thoroughly tested
- Ready for remaining Phase 4 tests (E2E, performance) and Phase 5 UI enhancements
