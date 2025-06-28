# X.com Scraping Manual Testing Guide

This guide provides step-by-step instructions for manually validating the X.com scraping functionality.

## Prerequisites

1. **Environment Setup**:
   - Ensure `.env` file contains valid `APIFY_API_KEY` and `APIFY_X_SCRAPER_ACTOR_ID`
   - Set `ENABLE_ENHANCED_X_SCRAPING=true`
   - Karakeep development environment running (`pnpm dev`)

2. **Test Data**:
   - Use real X.com URLs (avoid private/protected accounts)
   - Prepare URLs for different content types (see test cases below)

## Test Cases

### 1. Single Tweet Scraping

**Objective**: Verify basic tweet scraping functionality

**Test URLs** (examples - replace with current URLs):
- Text-only tweet: `https://x.com/username/status/1234567890123456789`
- Tweet with hashtags: `https://x.com/username/status/1234567890123456789`
- Tweet with mentions: `https://x.com/username/status/1234567890123456789`

**Steps**:
1. Navigate to Karakeep web interface
2. Create new bookmark with X.com URL
3. Wait for crawling to complete
4. Verify bookmark shows enhanced metadata
5. Check content includes author, engagement metrics, proper formatting

**Expected Results**:
- ✅ Enhanced metadata from Apify (author, likes, retweets, replies)
- ✅ Proper text formatting with hashtags/mentions preserved
- ✅ Correct timestamp and author information
- ✅ Fallback to regular crawling if Apify fails

### 2. Thread/Conversation Scraping

**Objective**: Verify thread detection and content extraction

**Test URLs**:
- Long thread: `https://x.com/username/status/1234567890123456789`
- Reply chain: `https://x.com/username/status/1234567890123456789`

**Steps**:
1. Create bookmark with thread URL
2. Wait for crawling completion
3. Verify thread content is captured
4. Check thread relationship information

**Expected Results**:
- ✅ Multiple tweets in thread captured
- ✅ Thread order preserved
- ✅ Reply relationships maintained
- ✅ Complete conversation context

### 3. Quoted Tweet and Retweet Scraping

**Objective**: Verify handling of quoted tweets and retweets

**Test URLs**:
- Quoted tweet: `https://x.com/username/status/1234567890123456789`
- Retweet with comment: `https://x.com/username/status/1234567890123456789`

**Steps**:
1. Create bookmark with quoted/retweeted content
2. Verify both original and quoting content captured
3. Check attribution is correct

**Expected Results**:
- ✅ Original tweet content preserved
- ✅ Quote/retweet commentary captured
- ✅ Proper attribution to both authors
- ✅ Engagement metrics for both tweets

### 4. Media-Rich Tweets

**Objective**: Verify image and video handling

**Test URLs**:
- Tweet with images: `https://x.com/username/status/1234567890123456789`
- Tweet with video: `https://x.com/username/status/1234567890123456789`
- Tweet with GIF: `https://x.com/username/status/1234567890123456789`

**Steps**:
1. Create bookmark with media tweet
2. Verify media assets are downloaded
3. Check asset association with bookmark
4. Verify thumbnail generation

**Expected Results**:
- ✅ Images downloaded and stored as assets
- ✅ Video thumbnails generated
- ✅ GIFs preserved correctly
- ✅ Media properly associated with bookmark

### 5. Browser Extension Testing

**Objective**: Verify X.com scraping works via browser extension

**Steps**:
1. Install Karakeep browser extension (if available)
2. Navigate to X.com tweet
3. Use extension to bookmark tweet
4. Verify enhanced scraping occurs

**Expected Results**:
- ✅ Extension successfully creates bookmark
- ✅ Enhanced metadata captured via Apify
- ✅ Same quality as direct URL input

### 6. API Direct Calls

**Objective**: Test X.com scraping via API endpoints

**Steps**:
1. Use API client (curl, Postman, etc.)
2. POST to `/api/v1/bookmarks` with X.com URL
3. Monitor crawling job completion
4. GET bookmark data to verify enhancement

**Example API Call**:
```bash
curl -X POST http://localhost:3000/api/v1/bookmarks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"type": "link", "url": "https://x.com/username/status/1234567890123456789"}'
```

**Expected Results**:
- ✅ API accepts X.com URLs
- ✅ Enhanced scraping triggered
- ✅ Response includes enriched metadata

### 7. Public List Display

**Objective**: Verify X.com content displays correctly in public lists

**Steps**:
1. Create public list containing X.com bookmarks
2. Navigate to public list URL
3. Verify tweet content displays properly
4. Check formatting and media rendering

**Expected Results**:
- ✅ Tweet content properly formatted
- ✅ Author attribution visible
- ✅ Media displays correctly
- ✅ Engagement metrics shown (if configured)

### 8. Mobile View Compatibility

**Objective**: Ensure X.com content works on mobile devices

**Steps**:
1. Access Karakeep on mobile device/responsive view
2. Navigate to bookmarks with X.com content
3. Verify readability and functionality
4. Test bookmark creation from mobile

**Expected Results**:
- ✅ Content readable on mobile screens
- ✅ Media scales appropriately
- ✅ Touch interactions work correctly
- ✅ Mobile bookmark creation functional

### 9. RSS Feed Generation

**Objective**: Verify X.com content included in RSS feeds

**Steps**:
1. Configure RSS feed for list with X.com bookmarks
2. Access RSS feed URL
3. Verify X.com content appears in feed
4. Check XML formatting and content structure

**Expected Results**:
- ✅ X.com bookmarks appear in RSS feed
- ✅ Enhanced content included in feed items
- ✅ Media URLs properly referenced
- ✅ Valid RSS XML structure

## Error Scenarios Testing

### Fallback Behavior
1. **Apify Service Disabled**: Set `ENABLE_ENHANCED_X_SCRAPING=false`, verify regular crawling
2. **Invalid API Key**: Use invalid `APIFY_API_KEY`, verify fallback occurs
3. **Rate Limiting**: Trigger rate limits, verify proper handling
4. **Network Issues**: Simulate network failures, verify resilience

### Edge Cases
1. **Private/Protected Tweets**: Test with protected accounts
2. **Deleted Tweets**: Test with non-existent tweet IDs
3. **Suspended Accounts**: Test with suspended user content
4. **Invalid URLs**: Test with malformed X.com URLs

## Performance Testing

### Load Testing
1. **Concurrent Requests**: Create multiple X.com bookmarks simultaneously
2. **Large Threads**: Test with very long conversation threads
3. **Media-Heavy Content**: Test tweets with multiple images/videos

### Memory Monitoring
1. Monitor memory usage during large thread processing
2. Check for memory leaks with repeated operations
3. Verify garbage collection effectiveness

## Validation Checklist

- [ ] Single tweet scraping functional
- [ ] Thread scraping captures full conversations
- [ ] Quoted tweets and retweets handled correctly
- [ ] Media content downloaded and stored
- [ ] Browser extension integration works
- [ ] API endpoints process X.com URLs correctly
- [ ] Public lists display X.com content properly
- [ ] Mobile view compatible and functional
- [ ] RSS feeds include X.com bookmark content
- [ ] Fallback behavior works when Apify unavailable
- [ ] Error scenarios handled gracefully
- [ ] Performance acceptable under load

## Troubleshooting

### Common Issues

1. **Apify API Errors**:
   - Check API key validity
   - Verify actor ID is correct
   - Monitor rate limits

2. **Content Not Enhanced**:
   - Confirm `ENABLE_ENHANCED_X_SCRAPING=true`
   - Check worker logs for errors
   - Verify URL format is correct

3. **Missing Media**:
   - Check asset storage configuration
   - Verify download permissions
   - Monitor storage space

4. **Poor Performance**:
   - Check Apify response times
   - Monitor worker queue depth
   - Verify database performance

### Debug Commands

```bash
# Check worker logs
pnpm workers

# Verify configuration
pnpm --filter @karakeep/shared test

# Check database state
pnpm db:studio

# Monitor queue status
# (Check worker dashboard if available)
```

## Reporting Results

For each test case, document:
- ✅/❌ Pass/Fail status
- Any unexpected behavior
- Performance observations
- Screenshots for UI tests
- Error messages encountered

Create issues for any failures with:
- Test case details
- Steps to reproduce
- Expected vs actual behavior
- Environment information
- Relevant logs/screenshots