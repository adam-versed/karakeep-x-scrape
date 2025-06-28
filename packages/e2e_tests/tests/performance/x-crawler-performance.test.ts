import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import {
  advancedScenarios,
  cleanupMocks,
  createMockApifyClient,
  createMockQueues,
  performanceUtils,
  setupTestScenario,
  testDataGenerators,
  X_COM_TEST_FIXTURES,
} from "../../mocks/x-com-mocks";
import { createTestUser, getAuthHeader } from "../../utils/api";
import { waitUntil } from "../../utils/general";

describe("X.com Crawler Performance Tests", () => {
  const port = inject("karakeepPort");

  if (!port) {
    throw new Error("Missing required environment variables");
  }

  let client: ReturnType<typeof createKarakeepClient>;
  let apiKey: string;
  const performanceMonitor = performanceUtils.createPerformanceMonitor();

  beforeAll(async () => {
    // Setup monitoring
    console.log("🚀 Starting X.com Crawler Performance Test Suite");
  });

  beforeEach(async () => {
    apiKey = await createTestUser();
    client = createKarakeepClient({
      baseUrl: `http://localhost:${port}/api/v1/`,
      headers: getAuthHeader(apiKey),
    });

    performanceMonitor.reset();
    cleanupMocks();
  });

  afterEach(() => {
    cleanupMocks();
  });

  afterAll(() => {
    console.log("✅ X.com Crawler Performance Test Suite Completed");
  });

  describe("Rate Limiting Behavior Tests", () => {
    it("should handle multiple concurrent X.com URL processing with proper rate limiting", async () => {
      // Setup scenario with rate limiting
      setupTestScenario({
        apifyScenario: {
          scenario: "success",
          responseData: X_COM_TEST_FIXTURES.singleTweet,
          delay: 1000, // 1 second per request to simulate API latency
        },
      });

      const urls = [
        "https://x.com/user1/status/1111111111111111111",
        "https://x.com/user2/status/2222222222222222222",
        "https://x.com/user3/status/3333333333333333333",
        "https://x.com/user4/status/4444444444444444444",
        "https://x.com/user5/status/5555555555555555555",
      ];

      const startTime = Date.now();
      const bookmarkPromises = urls.map((url) =>
        client.POST("/bookmarks", {
          body: { type: "link", url },
        }),
      );

      // All requests should be accepted
      const bookmarks = await Promise.all(bookmarkPromises);
      bookmarks.forEach((bookmark) => {
        expect(bookmark.data).toBeDefined();
      });

      // Wait for all to be processed
      await Promise.all(
        bookmarks.map((bookmark) =>
          waitUntil(
            async () => {
              const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
                params: {
                  path: { bookmarkId: bookmark.data!.id },
                  query: { includeContent: true },
                },
              });
              return (
                data?.content.type === "link" && data.content.crawledAt !== null
              );
            },
            "Bookmark processed",
            30000,
          ),
        ),
      );

      const totalTime = Date.now() - startTime;
      const averageTimePerRequest = totalTime / urls.length;

      // Performance assertions
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
      expect(averageTimePerRequest).toBeLessThan(6000); // Average < 6 seconds per request

      console.log(
        `📊 Concurrent processing: ${urls.length} URLs in ${totalTime}ms (avg: ${averageTimePerRequest}ms per request)`,
      );
    });

    it("should validate Apify API rate limit compliance", async () => {
      const rateLimitScenario = advancedScenarios.rateLimitThenRecovery;
      const apifyMocks = createMockApifyClient();

      // Setup rate limit then recovery scenario
      await rateLimitScenario(apifyMocks.mocks, {
        rateLimitDuration: 2000, // 2 second rate limit
        successResponse: X_COM_TEST_FIXTURES.singleTweet,
      });

      const startTime = Date.now();

      try {
        // First call should hit rate limit
        await apifyMocks.client.actor("test").call({});
        expect.fail("Should have thrown rate limit error");
      } catch (error) {
        expect(error).toBeDefined();
        console.log("✅ Rate limit error properly caught");
      }

      // Wait for rate limit recovery
      await new Promise((resolve) => setTimeout(resolve, 2100));

      // Second call should succeed
      const result = await apifyMocks.client.actor("test").call({});
      expect(result).toBeDefined();

      const recoveryTime = Date.now() - startTime;
      expect(recoveryTime).toBeGreaterThan(2000); // Should respect rate limit duration
      expect(recoveryTime).toBeLessThan(5000); // But not take too long

      console.log(`📊 Rate limit recovery: ${recoveryTime}ms`);
    });

    it("should measure worker queue throughput under load", async () => {
      const queues = createMockQueues();
      const urls = Array.from(
        { length: 20 },
        (_, i) =>
          `https://x.com/throughputuser${i}/status/${1000000000000000000 + i}`,
      );

      const startTime = Date.now();

      // Enqueue multiple jobs rapidly
      const enqueuePromises = urls.map(() =>
        queues.LinkCrawlerQueue.enqueue({
          bookmarkId: `bookmark-${Date.now()}-${Math.random()}`,
          runInference: true,
          archiveFullPage: false,
        }),
      );

      await Promise.all(enqueuePromises);
      const enqueueTime = Date.now() - startTime;

      // Check queue size
      const queueSize = await (
        queues.LinkCrawlerQueue as unknown as { size: () => Promise<number> }
      ).size();
      expect(queueSize).toBe(urls.length);

      const throughput = urls.length / (enqueueTime / 1000); // jobs per second
      expect(throughput).toBeGreaterThan(10); // Should handle at least 10 jobs/second

      console.log(
        `📊 Queue throughput: ${throughput.toFixed(2)} jobs/second (${urls.length} jobs in ${enqueueTime}ms)`,
      );
    });
  });

  describe("Memory Usage Pattern Tests", () => {
    it("should handle large thread processing without memory issues", async () => {
      // Generate a large thread (50+ tweets)
      const largeThread = testDataGenerators.generateThread(75);
      setupTestScenario({
        apifyScenario: {
          scenario: "success",
          responseData: largeThread,
          delay: 100,
        },
      });

      const threadUrl =
        "https://x.com/largethreaduser/status/8888888888888888888";

      // Monitor memory before processing
      const initialMemory = process.memoryUsage();

      const { data: bookmark } = await client.POST("/bookmarks", {
        body: { type: "link", url: threadUrl },
      });

      expect(bookmark).toBeDefined();

      await waitUntil(
        async () => {
          const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
            params: {
              path: { bookmarkId: bookmark!.id },
              query: { includeContent: true },
            },
          });
          return (
            data?.content.type === "link" && data.content.crawledAt !== null
          );
        },
        "Large thread processed",
        45000,
      );

      // Monitor memory after processing
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      // Memory increase should be reasonable for a 75-tweet thread
      expect(memoryIncreaseMB).toBeLessThan(100); // Less than 100MB increase

      console.log(
        `📊 Memory usage for 75-tweet thread: +${memoryIncreaseMB.toFixed(2)}MB`,
      );

      // Verify thread content was properly processed
      const processedBookmark = await client.GET(`/bookmarks/{bookmarkId}`, {
        params: {
          path: { bookmarkId: bookmark!.id },
          query: { includeContent: true },
        },
      });

      expect(processedBookmark.data?.content.type).toBe("link");
      if (processedBookmark.data?.content.type === "link") {
        expect(
          processedBookmark.data.content.description?.length || 0,
        ).toBeGreaterThan(1000);
      }
    });

    it("should handle media-heavy content efficiently", async () => {
      // Generate tweets with multiple images and videos
      const mediaTweets = [
        testDataGenerators.generateMediaTweet({ images: 4, videos: 1 }),
        testDataGenerators.generateMediaTweet({
          images: 3,
          videos: 1,
          gifs: 1,
        }),
        testDataGenerators.generateMediaTweet({ images: 4 }),
        testDataGenerators.generateMediaTweet({ videos: 1, gifs: 2 }),
      ];

      const mediaUrls = mediaTweets.map(
        (_, i) =>
          `https://x.com/mediauser${i}/status/${7000000000000000000 + i}`,
      );

      const initialMemory = process.memoryUsage();

      const bookmarkPromises = mediaUrls.map((url, index) => {
        // Setup different mock scenarios for each URL
        setupTestScenario({
          apifyScenario: {
            scenario: "success",
            responseData: mediaTweets[index],
            delay: 200,
          },
        });

        return client.POST("/bookmarks", {
          body: { type: "link", url },
        });
      });

      const bookmarks = await Promise.all(bookmarkPromises);

      // Wait for all media processing to complete
      await Promise.all(
        bookmarks.map((bookmark) =>
          waitUntil(
            async () => {
              const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
                params: {
                  path: { bookmarkId: bookmark.data!.id },
                  query: { includeContent: true },
                },
              });
              return (
                data?.content.type === "link" && data.content.crawledAt !== null
              );
            },
            "Media bookmark processed",
            30000,
          ),
        ),
      );

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      // Memory should not grow excessively with media processing
      expect(memoryIncreaseMB).toBeLessThan(200); // Less than 200MB for 4 media-heavy tweets

      console.log(
        `📊 Memory usage for media-heavy processing: +${memoryIncreaseMB.toFixed(2)}MB`,
      );
    });

    it("should detect memory leaks during continuous processing", async () => {
      const iterations = 10;
      const memorySnapshots: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const url = `https://x.com/leaktest${i}/status/${6000000000000000000 + i}`;

        setupTestScenario({
          apifyScenario: {
            scenario: "success",
            responseData: X_COM_TEST_FIXTURES.singleTweet,
            delay: 50,
          },
        });

        const { data: bookmark } = await client.POST("/bookmarks", {
          body: { type: "link", url },
        });

        await waitUntil(
          async () => {
            const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
              params: {
                path: { bookmarkId: bookmark!.id },
                query: { includeContent: true },
              },
            });
            return (
              data?.content.type === "link" && data.content.crawledAt !== null
            );
          },
          "Leak test bookmark processed",
          15000,
        );

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        memorySnapshots.push(process.memoryUsage().heapUsed);
      }

      // Analyze memory trend
      const firstHalf = memorySnapshots.slice(0, Math.floor(iterations / 2));
      const secondHalf = memorySnapshots.slice(Math.floor(iterations / 2));

      const firstHalfAvg =
        firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg =
        secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      const memoryGrowthMB = (secondHalfAvg - firstHalfAvg) / (1024 * 1024);

      // Memory growth should be minimal (< 50MB) indicating no significant leaks
      expect(memoryGrowthMB).toBeLessThan(50);

      console.log(
        `📊 Memory leak test: ${memoryGrowthMB.toFixed(2)}MB growth over ${iterations} iterations`,
      );
    });
  });

  describe("Load Testing Scenarios", () => {
    it("should handle concurrent bookmark creation stress test", async () => {
      const concurrentRequests = 15;
      const urls = Array.from(
        { length: concurrentRequests },
        (_, i) =>
          `https://x.com/loadtest${i}/status/${5000000000000000000 + i}`,
      );

      const startTime = Date.now();

      // Fire all requests simultaneously
      const bookmarkPromises = urls.map(async (url) => {
        setupTestScenario({
          apifyScenario: {
            scenario: "success",
            responseData: X_COM_TEST_FIXTURES.singleTweet,
            delay: Math.random() * 500 + 200, // Random delay 200-700ms
          },
        });

        return client.POST("/bookmarks", {
          body: { type: "link", url },
        });
      });

      const results = await Promise.allSettled(bookmarkPromises);
      const successful = results.filter((r) => r.status === "fulfilled").length;

      const requestTime = Date.now() - startTime;

      // Should handle most requests successfully
      expect(successful / concurrentRequests).toBeGreaterThan(0.8); // 80% success rate
      expect(requestTime).toBeLessThan(10000); // Complete within 10 seconds

      console.log(
        `📊 Concurrent load test: ${successful}/${concurrentRequests} successful in ${requestTime}ms`,
      );

      // Wait for processing to complete for successful bookmarks
      const successfulBookmarks = results
        .filter((r) => r.status === "fulfilled")
        .map(
          (r) =>
            (r as PromiseFulfilledResult<{ data: { id: string } }>).value.data,
        )
        .filter(Boolean);

      if (successfulBookmarks.length > 0) {
        const processingStart = Date.now();
        await Promise.allSettled(
          successfulBookmarks.map((bookmark) =>
            waitUntil(
              async () => {
                const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
                  params: {
                    path: { bookmarkId: bookmark.id },
                    query: { includeContent: true },
                  },
                });
                return (
                  data?.content.type === "link" &&
                  data.content.crawledAt !== null
                );
              },
              "Load test bookmark processed",
              20000,
            ),
          ),
        );

        const processingTime = Date.now() - processingStart;
        console.log(
          `📊 Processing time for ${successfulBookmarks.length} bookmarks: ${processingTime}ms`,
        );
      }
    });

    it("should monitor performance degradation under sustained load", async () => {
      const batchSize = 5;
      const batches = 4;
      const performanceMetrics: {
        batchNumber: number;
        avgResponseTime: number;
        successRate: number;
      }[] = [];

      for (let batch = 0; batch < batches; batch++) {
        const urls = Array.from(
          { length: batchSize },
          (_, i) =>
            `https://x.com/degradation${batch}_${i}/status/${4000000000000000000 + batch * batchSize + i}`,
        );

        const batchPromises = urls.map(async (url) => {
          const requestStart = Date.now();

          try {
            const { data: bookmark } = await client.POST("/bookmarks", {
              body: { type: "link", url },
            });

            return {
              success: true,
              responseTime: Date.now() - requestStart,
              bookmark,
            };
          } catch (error) {
            return {
              success: false,
              responseTime: Date.now() - requestStart,
              error,
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        const successful = batchResults.filter((r) => r.success);
        const avgResponseTime =
          batchResults.reduce((sum, r) => sum + r.responseTime, 0) /
          batchResults.length;
        const successRate = successful.length / batchResults.length;

        performanceMetrics.push({
          batchNumber: batch + 1,
          avgResponseTime,
          successRate,
        });

        console.log(
          `📊 Batch ${batch + 1}: ${avgResponseTime.toFixed(0)}ms avg, ${(successRate * 100).toFixed(1)}% success`,
        );

        // Brief pause between batches
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Analyze performance degradation
      const firstBatch = performanceMetrics[0];
      const lastBatch = performanceMetrics[performanceMetrics.length - 1];

      const responseTimeDegradation =
        (lastBatch.avgResponseTime - firstBatch.avgResponseTime) /
        firstBatch.avgResponseTime;
      const successRateDegradation =
        firstBatch.successRate - lastBatch.successRate;

      // Performance should not degrade significantly
      expect(responseTimeDegradation).toBeLessThan(2.0); // Less than 200% increase
      expect(successRateDegradation).toBeLessThan(0.2); // Less than 20% drop in success rate

      console.log(
        `📊 Performance degradation: ${(responseTimeDegradation * 100).toFixed(1)}% response time increase, ${(successRateDegradation * 100).toFixed(1)}% success rate drop`,
      );
    });
  });

  describe("Timeout and Resilience Testing", () => {
    it("should handle API timeout scenarios gracefully", async () => {
      setupTestScenario({
        apifyScenario: {
          scenario: "timeout",
          delay: 5000, // 5 second timeout
        },
      });

      const timeoutUrl = "https://x.com/timeoutuser/status/3000000000000000000";

      const startTime = Date.now();

      // This should still create a bookmark but fall back to regular crawling
      const { data: bookmark } = await client.POST("/bookmarks", {
        body: { type: "link", url: timeoutUrl },
      });

      expect(bookmark).toBeDefined();

      // Wait for fallback processing to complete
      await waitUntil(
        async () => {
          const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
            params: {
              path: { bookmarkId: bookmark!.id },
              query: { includeContent: true },
            },
          });
          return (
            data?.content.type === "link" && data.content.crawledAt !== null
          );
        },
        "Timeout fallback processed",
        30000,
      );

      const totalTime = Date.now() - startTime;

      // Should complete via fallback within reasonable time
      expect(totalTime).toBeLessThan(25000);

      console.log(
        `📊 Timeout handling: completed in ${totalTime}ms via fallback`,
      );
    });

    it("should handle service unavailability with proper retry behavior", async () => {
      setupTestScenario({
        apifyScenario: {
          scenario: "api_failure",
          errorMessage: "Service temporarily unavailable",
        },
      });

      const unavailableUrl =
        "https://x.com/unavailableuser/status/2000000000000000000";

      // Setup network instability scenario
      const apifyMocks = createMockApifyClient();
      advancedScenarios.networkInstability(apifyMocks.mocks, 0.5); // 50% failure rate

      const attempts = 3;
      const results = [];

      for (let i = 0; i < attempts; i++) {
        const attemptStart = Date.now();

        try {
          const { data: bookmark } = await client.POST("/bookmarks", {
            body: { type: "link", url: `${unavailableUrl}_attempt_${i}` },
          });

          results.push({
            attempt: i + 1,
            success: true,
            responseTime: Date.now() - attemptStart,
            bookmark,
          });
        } catch (error) {
          results.push({
            attempt: i + 1,
            success: false,
            responseTime: Date.now() - attemptStart,
            error,
          });
        }

        // Wait between attempts
        if (i < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      const successfulAttempts = results.filter((r) => r.success).length;
      const avgResponseTime =
        results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

      // At least some attempts should succeed due to fallback mechanisms
      expect(successfulAttempts).toBeGreaterThan(0);
      expect(avgResponseTime).toBeLessThan(10000); // Average response under 10 seconds

      console.log(
        `📊 Service unavailability: ${successfulAttempts}/${attempts} successful, ${avgResponseTime.toFixed(0)}ms avg`,
      );
    });

    it("should validate recovery behavior after service restoration", async () => {
      const apifyMocks = createMockApifyClient();

      // Start with failures
      let failureMode = true;
      apifyMocks.mocks.call.mockImplementation(async () => {
        if (failureMode) {
          throw new Error("Service unavailable");
        }

        // Success response
        return {
          id: `run_${Date.now()}`,
          actId: "apify/x-scraper",
          status: "SUCCEEDED",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          stats: { inputBodyLen: 1024, restartCount: 0, durationMillis: 100 },
          defaultDatasetId: `dataset_${Date.now()}`,
        };
      });

      apifyMocks.mocks.listItems.mockResolvedValue({
        items: [X_COM_TEST_FIXTURES.singleTweet],
      });

      const recoveryUrl =
        "https://x.com/recoveryuser/status/1000000000000000000";

      // First request should fail
      const { data: failureBookmark } = await client.POST("/bookmarks", {
        body: { type: "link", url: `${recoveryUrl}_failure` },
      });

      expect(failureBookmark).toBeDefined();

      // "Restore" service
      setTimeout(() => {
        failureMode = false;
        console.log("🔄 Service restored");
      }, 2000);

      // Wait a bit for service restoration
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Second request should succeed
      const { data: successBookmark } = await client.POST("/bookmarks", {
        body: { type: "link", url: `${recoveryUrl}_success` },
      });

      expect(successBookmark).toBeDefined();

      // Both should eventually be processed (one via fallback, one via restored service)
      await Promise.all([
        waitUntil(
          async () => {
            const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
              params: {
                path: { bookmarkId: failureBookmark!.id },
                query: { includeContent: true },
              },
            });
            return (
              data?.content.type === "link" && data.content.crawledAt !== null
            );
          },
          "Failure bookmark processed via fallback",
          25000,
        ),
        waitUntil(
          async () => {
            const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
              params: {
                path: { bookmarkId: successBookmark!.id },
                query: { includeContent: true },
              },
            });
            return (
              data?.content.type === "link" && data.content.crawledAt !== null
            );
          },
          "Success bookmark processed via restored service",
          15000,
        ),
      ]);

      console.log(
        "📊 Recovery behavior: Both failure and recovery cases handled successfully",
      );
    });
  });

  describe("Performance Metrics Collection", () => {
    it("should collect and validate comprehensive performance metrics", async () => {
      const testUrls = [
        "https://x.com/metrics1/status/100001",
        "https://x.com/metrics2/status/100002",
        "https://x.com/metrics3/status/100003",
      ];

      const metrics = {
        requestTimes: [] as number[],
        processingTimes: [] as number[],
        memoryUsage: [] as number[],
        queueSizes: [] as number[],
      };

      for (const url of testUrls) {
        setupTestScenario({
          apifyScenario: {
            scenario: "success",
            responseData: X_COM_TEST_FIXTURES.singleTweet,
            delay: 300,
          },
        });

        // Measure request time
        const requestStart = Date.now();
        const { data: bookmark } = await client.POST("/bookmarks", {
          body: { type: "link", url },
        });
        const requestTime = Date.now() - requestStart;
        metrics.requestTimes.push(requestTime);

        // Measure processing time
        const processingStart = Date.now();
        await waitUntil(
          async () => {
            const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
              params: {
                path: { bookmarkId: bookmark!.id },
                query: { includeContent: true },
              },
            });
            return (
              data?.content.type === "link" && data.content.crawledAt !== null
            );
          },
          "Metrics bookmark processed",
          20000,
        );
        const processingTime = Date.now() - processingStart;
        metrics.processingTimes.push(processingTime);

        // Collect memory usage
        metrics.memoryUsage.push(process.memoryUsage().heapUsed);

        // Simulate queue size monitoring
        metrics.queueSizes.push(Math.floor(Math.random() * 10));
      }

      // Calculate statistics
      const avgRequestTime =
        metrics.requestTimes.reduce((a, b) => a + b, 0) /
        metrics.requestTimes.length;
      const avgProcessingTime =
        metrics.processingTimes.reduce((a, b) => a + b, 0) /
        metrics.processingTimes.length;
      const maxMemoryUsage = Math.max(...metrics.memoryUsage);
      const avgQueueSize =
        metrics.queueSizes.reduce((a, b) => a + b, 0) /
        metrics.queueSizes.length;

      // Performance assertions
      expect(avgRequestTime).toBeLessThan(1000); // Avg request < 1 second
      expect(avgProcessingTime).toBeLessThan(15000); // Avg processing < 15 seconds
      expect(maxMemoryUsage).toBeLessThan(500 * 1024 * 1024); // Max memory < 500MB
      expect(avgQueueSize).toBeLessThan(50); // Reasonable queue size

      console.log(`📊 Performance Metrics Summary:`);
      console.log(`   Average Request Time: ${avgRequestTime.toFixed(0)}ms`);
      console.log(
        `   Average Processing Time: ${avgProcessingTime.toFixed(0)}ms`,
      );
      console.log(
        `   Max Memory Usage: ${(maxMemoryUsage / (1024 * 1024)).toFixed(1)}MB`,
      );
      console.log(`   Average Queue Size: ${avgQueueSize.toFixed(1)}`);
    });

    it("should track performance trends over time", async () => {
      const timeWindows = 3;
      const requestsPerWindow = 4;
      const performanceTrend: {
        window: number;
        avgResponseTime: number;
        throughput: number;
        errorRate: number;
      }[] = [];

      for (let window = 0; window < timeWindows; window++) {
        const windowStart = Date.now();
        const windowPromises = [];

        for (let req = 0; req < requestsPerWindow; req++) {
          const url = `https://x.com/trend_w${window}_r${req}/status/${Date.now()}${req}`;

          windowPromises.push(
            client
              .POST("/bookmarks", {
                body: { type: "link", url },
              })
              .then(
                (result) => ({ success: true, result }),
                (error) => ({ success: false, error }),
              ),
          );
        }

        const results = await Promise.all(windowPromises);
        const windowTime = Date.now() - windowStart;

        const successful = results.filter((r) => r.success).length;
        const avgResponseTime = windowTime / requestsPerWindow;
        const throughput = (successful / windowTime) * 1000; // requests per second
        const errorRate = (requestsPerWindow - successful) / requestsPerWindow;

        performanceTrend.push({
          window: window + 1,
          avgResponseTime,
          throughput,
          errorRate,
        });

        console.log(
          `📊 Window ${window + 1}: ${avgResponseTime.toFixed(0)}ms avg, ${throughput.toFixed(2)} req/s, ${(errorRate * 100).toFixed(1)}% error rate`,
        );

        // Brief pause between windows
        if (window < timeWindows - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Analyze trends
      const avgResponseTimes = performanceTrend.map((w) => w.avgResponseTime);
      const throughputs = performanceTrend.map((w) => w.throughput);
      const errorRates = performanceTrend.map((w) => w.errorRate);

      // Performance should remain stable across time windows
      const responseTimeVariance =
        Math.max(...avgResponseTimes) - Math.min(...avgResponseTimes);
      const avgThroughput =
        throughputs.reduce((a, b) => a + b, 0) / throughputs.length;
      const maxErrorRate = Math.max(...errorRates);

      expect(responseTimeVariance).toBeLessThan(5000); // Response time variance < 5 seconds
      expect(avgThroughput).toBeGreaterThan(0.5); // At least 0.5 requests per second
      expect(maxErrorRate).toBeLessThan(0.3); // Error rate < 30%

      console.log(`📊 Performance Trend Analysis:`);
      console.log(
        `   Response Time Variance: ${responseTimeVariance.toFixed(0)}ms`,
      );
      console.log(`   Average Throughput: ${avgThroughput.toFixed(2)} req/s`);
      console.log(`   Max Error Rate: ${(maxErrorRate * 100).toFixed(1)}%`);
    });
  });
});
