# X.com Mocks Usage Examples

This document demonstrates how to use the comprehensive X.com mock strategy implementation.

## Basic Usage

### Setting up a Simple Mock Scenario

```typescript
import { 
  setupTestScenario, 
  cleanupMocks,
  X_COM_TEST_FIXTURES 
} from '../mocks/x-com-mocks';

describe('X.com Integration Tests', () => {
  afterEach(() => {
    cleanupMocks();
  });

  it('should handle successful tweet scraping', async () => {
    const scenario = setupTestScenario({
      apifyScenario: {
        scenario: 'success',
        responseData: X_COM_TEST_FIXTURES.singleTweet,
        delay: 100
      }
    });

    // Your test code here
    const result = await scenario.simulateApifyCall({
      urls: ['https://x.com/testuser/status/123']
    });

    expect(result.status).toBe('SUCCEEDED');
  });
});
```

### Testing Different Response Types

```typescript
it('should handle thread responses', async () => {
  const scenario = setupTestScenario({
    apifyScenario: {
      scenario: 'success',
      responseData: X_COM_TEST_FIXTURES.thread,
    }
  });

  // Test thread processing
  // ...
});

it('should handle media-rich tweets', async () => {
  const scenario = setupTestScenario({
    apifyScenario: {
      scenario: 'success',
      responseData: X_COM_TEST_FIXTURES.mediaRich,
    }
  });

  // Test media handling
  // ...
});
```

### Testing Error Scenarios

```typescript
it('should handle rate limiting', async () => {
  const scenario = setupTestScenario({
    apifyScenario: {
      scenario: 'rate_limit',
      delay: 50
    }
  });

  // Test should handle rate limit gracefully
  // ...
});

it('should handle API failures', async () => {
  const scenario = setupTestScenario({
    apifyScenario: {
      scenario: 'api_failure',
      shouldThrow: true,
      errorMessage: 'Custom API error'
    }
  });

  // Test error handling
  // ...
});
```

## Advanced Usage

### Custom Response Generation

```typescript
import { testDataGenerators } from '../mocks/x-com-mocks';

it('should handle custom thread lengths', async () => {
  const customThread = testDataGenerators.generateThread(5);
  
  const scenario = setupTestScenario({
    apifyScenario: {
      scenario: 'success',
      responseData: customThread,
    }
  });

  // Test with custom 5-tweet thread
  // ...
});

it('should handle media tweets', async () => {
  const mediaTweet = testDataGenerators.generateMediaTweet({
    images: 3,
    videos: 1
  });
  
  const scenario = setupTestScenario({
    apifyScenario: {
      scenario: 'success',
      responseData: mediaTweet,
    }
  });

  // Test media processing
  // ...
});
```

### Asset Download Mocking

```typescript
it('should mock asset downloads', async () => {
  const assetConfigs = new Map();
  assetConfigs.set('https://pbs.twimg.com/media/test.jpg', {
    shouldSucceed: true,
    content: Buffer.from('fake image data'),
    contentType: 'image/jpeg',
    delay: 100
  });
  
  const scenario = setupTestScenario({
    apifyScenario: { scenario: 'success' },
    assetDownloads: assetConfigs
  });

  const asset = await scenario.downloadAsset('https://pbs.twimg.com/media/test.jpg');
  expect(asset.contentType).toBe('image/jpeg');
});
```

### Queue Operation Testing

```typescript
import { assertionHelpers } from '../mocks/x-com-mocks';

it('should verify queue operations', async () => {
  const scenario = setupTestScenario({
    apifyScenario: { scenario: 'success' }
  });

  // Simulate some operation that should enqueue a job
  await scenario.queues.LinkCrawlerQueue.enqueue({
    bookmarkId: 'test-bookmark',
    runInference: true
  });

  // Assert the job was enqueued
  assertionHelpers.assertJobEnqueued(
    scenario.queues.LinkCrawlerQueue,
    { bookmarkId: 'test-bookmark' }
  );
});
```

## Performance Testing

```typescript
import { performanceUtils } from '../mocks/x-com-mocks';

it('should test performance under load', async () => {
  const monitor = performanceUtils.createPerformanceMonitor();
  const scenario = setupTestScenario({
    apifyScenario: { scenario: 'success' }
  });

  // Wrap mock to monitor performance
  monitor.wrapMock(scenario.apifyMocks.call);

  // Run multiple operations
  for (let i = 0; i < 10; i++) {
    await scenario.simulateApifyCall();
  }

  const stats = monitor.getStats();
  expect(stats?.avg).toBeLessThan(200); // Average should be under 200ms
});
```

## Network Instability Testing

```typescript
import { advancedScenarios } from '../mocks/x-com-mocks';

it('should handle network instability', async () => {
  const scenario = setupTestScenario({
    apifyScenario: { scenario: 'success' }
  });

  // Set up 30% failure rate
  advancedScenarios.networkInstability(scenario.apifyMocks, 0.3);

  let successCount = 0;
  let failureCount = 0;

  // Try multiple operations
  for (let i = 0; i < 20; i++) {
    try {
      await scenario.simulateApifyCall();
      successCount++;
    } catch {
      failureCount++;
    }
  }

  // Should have some mix of successes and failures
  expect(successCount).toBeGreaterThan(0);
  expect(failureCount).toBeGreaterThan(0);
});
```

## Integration Testing

```typescript
import { integrationHelpers } from '../mocks/x-com-mocks';

it('should test full integration flow', async () => {
  const scenario = integrationHelpers.createIntegrationScenario({
    apifyResponses: [X_COM_TEST_FIXTURES.singleTweet],
    expectedQueueJobs: [
      { queueName: 'LinkCrawlerQueue', job: { bookmarkId: 'test' } }
    ],
    expectedAssetDownloads: ['https://pbs.twimg.com/media/test.jpg'],
    expectedExternalCalls: ['https://external-api.com/data']
  });

  // Run your integration test
  // ... your test code ...

  // Assert all expected calls were made
  scenario.assertExpectedCalls();
});
```

## Mock Service Configuration

```typescript
import { createMockApifyService, configureApifyServiceMock } from '../mocks/x-com-mocks';

it('should configure service behavior', async () => {
  const service = createMockApifyService();
  
  const urlResponses = new Map();
  urlResponses.set('https://x.com/user1/status/1', mockProcessedContent1);
  urlResponses.set('https://x.com/user2/status/2', mockProcessedContent2);
  
  configureApifyServiceMock(service, {
    scrapeXUrl: {
      responses: urlResponses,
      defaultResponse: null,
      throwOnUrls: ['https://x.com/error/status/123']
    }
  });

  // Test specific URL behavior
  const result1 = await service.scrapeXUrl('https://x.com/user1/status/1');
  expect(result1).toEqual(mockProcessedContent1);

  // Test error URL
  await expect(service.scrapeXUrl('https://x.com/error/status/123'))
    .rejects.toThrow('Failed to scrape');
});
```

## Cleanup

Always clean up mocks after each test:

```typescript
import { cleanupMocks } from '../mocks/x-com-mocks';

afterEach(() => {
  cleanupMocks();
});
```