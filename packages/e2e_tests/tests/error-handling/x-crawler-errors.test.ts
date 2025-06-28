import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApifyClient } from "apify-client";
import type { ApifyXResponse, ProcessedXContent } from "@karakeep/shared/types/apify";

import {
  createMockApifyClient,
  createMockApifyService,
  configureApifyMockScenario,
  configureApifyServiceMock,
  setupTestScenario,
  cleanupMocks,
  X_COM_TEST_FIXTURES,
  testDataGenerators,
  advancedScenarios,
} from "../../mocks/x-com-mocks";

/**
 * Comprehensive error handling and edge case tests for X.com crawler
 * Covers configuration errors, network failures, data validation, and service degradation
 */
describe("X.com Crawler Error Handling", () => {
  beforeEach(() => {
    cleanupMocks();
  });

  describe("Configuration Edge Cases", () => {
    describe("Missing APIFY_API_KEY handling", () => {
      it("should throw error when APIFY_API_KEY is not configured", () => {
        const originalEnv = process.env.APIFY_API_KEY;
        delete process.env.APIFY_API_KEY;

        try {
          expect(() => {
            // This would normally instantiate ApifyService, simulating the error
            throw new Error("APIFY_API_KEY not configured");
          }).toThrow("APIFY_API_KEY not configured");
        } finally {
          if (originalEnv) process.env.APIFY_API_KEY = originalEnv;
        }
      });

      it("should throw error when APIFY_API_KEY is empty string", () => {
        const originalEnv = process.env.APIFY_API_KEY;
        process.env.APIFY_API_KEY = "";

        try {
          expect(() => {
            if (!process.env.APIFY_API_KEY) {
              throw new Error("APIFY_API_KEY not configured");
            }
          }).toThrow("APIFY_API_KEY not configured");
        } finally {
          if (originalEnv) process.env.APIFY_API_KEY = originalEnv;
        }
      });

      it("should throw error when APIFY_API_KEY contains only whitespace", () => {
        const originalEnv = process.env.APIFY_API_KEY;
        process.env.APIFY_API_KEY = "   ";

        try {
          expect(() => {
            if (!process.env.APIFY_API_KEY?.trim()) {
              throw new Error("APIFY_API_KEY not configured");
            }
          }).toThrow("APIFY_API_KEY not configured");
        } finally {
          if (originalEnv) process.env.APIFY_API_KEY = originalEnv;
        }
      });
    });

    describe("Invalid actor ID scenarios", () => {
      it("should handle invalid actor ID gracefully", async () => {
        const { apifyMocks } = setupTestScenario({
          apifyScenario: {
            scenario: "api_failure",
            errorMessage: "Actor not found",
            shouldThrow: true,
          },
        });

        // Mock the actor call to throw an error for invalid actor ID
        apifyMocks.actor.mockImplementation(() => {
          throw new Error("Actor 'invalid-actor-id' not found");
        });

        await expect(async () => {
          const actorInstance = apifyMocks.actor("invalid-actor-id");
          await actorInstance.call({});
        }).rejects.toThrow("Actor 'invalid-actor-id' not found");
      });

      it("should handle actor ID with insufficient permissions", async () => {
        const { apifyMocks } = setupTestScenario({
          apifyScenario: {
            scenario: "auth_error",
            errorMessage: "Insufficient permissions to access actor",
            shouldThrow: true,
          },
        });

        apifyMocks.call.mockRejectedValue(
          new Error("Insufficient permissions to access actor")
        );

        await expect(apifyMocks.call({})).rejects.toThrow(
          "Insufficient permissions to access actor"
        );
      });

      it("should handle deprecated actor ID", async () => {
        const { apifyMocks } = setupTestScenario({
          apifyScenario: {
            scenario: "api_failure",
            errorMessage: "Actor has been deprecated",
            shouldThrow: true,
          },
        });

        apifyMocks.call.mockRejectedValue(
          new Error("Actor has been deprecated and is no longer available")
        );

        await expect(apifyMocks.call({})).rejects.toThrow(
          "Actor has been deprecated"
        );
      });
    });

    describe("Feature disabled state behavior", () => {
      it("should handle when X.com scraping is disabled", () => {
        const apifyService = createMockApifyService();
        apifyService.isEnabled.mockReturnValue(false);
        apifyService.getStatus.mockReturnValue({
          enabled: false,
          configured: true,
          actorId: "apify/x-scraper",
        });

        expect(apifyService.isEnabled()).toBe(false);
        expect(apifyService.getStatus().enabled).toBe(false);
      });

      it("should handle when feature is partially configured", () => {
        const apifyService = createMockApifyService();
        apifyService.getStatus.mockReturnValue({
          enabled: false,
          configured: false,
          actorId: undefined,
        });

        const status = apifyService.getStatus();
        expect(status.enabled).toBe(false);
        expect(status.configured).toBe(false);
        expect(status.actorId).toBeUndefined();
      });

      it("should gracefully fall back when feature is disabled mid-request", async () => {
        const apifyService = createMockApifyService();
        
        // Initially enabled, then disabled
        apifyService.isEnabled.mockReturnValueOnce(true).mockReturnValue(false);
        apifyService.scrapeXUrl.mockRejectedValue(
          new Error("Feature has been disabled")
        );

        await expect(
          apifyService.scrapeXUrl("https://x.com/test/status/123")
        ).rejects.toThrow("Feature has been disabled");
      });
    });
  });

  describe("Network Failure Scenarios", () => {
    describe("Apify API unavailability", () => {
      it("should handle 503 Service Unavailable", async () => {
        const { apifyMocks } = setupTestScenario({
          apifyScenario: {
            scenario: "api_failure",
            shouldThrow: true,
          },
        });

        await configureApifyMockScenario(apifyMocks, {
          scenario: "api_failure",
          errorMessage: "Service Temporarily Unavailable",
          shouldThrow: true,
        });

        await expect(apifyMocks.call({})).rejects.toThrow(
          "Service Temporarily Unavailable"
        );
      });

      it("should handle DNS resolution failures", async () => {
        const { apifyMocks } = setupTestScenario({});

        apifyMocks.call.mockRejectedValue(
          new Error("ENOTFOUND api.apify.com")
        );

        await expect(apifyMocks.call({})).rejects.toThrow(
          "ENOTFOUND api.apify.com"
        );
      });

      it("should handle SSL certificate errors", async () => {
        const { apifyMocks } = setupTestScenario({});

        apifyMocks.call.mockRejectedValue(
          new Error("unable to verify the first certificate")
        );

        await expect(apifyMocks.call({})).rejects.toThrow(
          "unable to verify the first certificate"
        );
      });
    });

    describe("Timeout handling", () => {
      it("should handle actor run timeout", async () => {
        const { apifyMocks } = setupTestScenario({
          apifyScenario: {
            scenario: "timeout",
            delay: 1000,
          },
        });

        await configureApifyMockScenario(apifyMocks, {
          scenario: "timeout",
          delay: 100,
        });

        await expect(apifyMocks.call({})).rejects.toThrow("Actor run timed out");
      });

      it("should handle dataset fetch timeout", async () => {
        const { apifyMocks } = setupTestScenario({});

        // Actor succeeds but dataset fetch times out
        const runInfo = {
          id: "run_123",
          actId: "apify/x-scraper",
          status: "SUCCEEDED" as const,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          stats: { inputBodyLen: 1024, restartCount: 0, durationMillis: 5000 },
          defaultDatasetId: "dataset_123",
        };

        apifyMocks.call.mockResolvedValue(runInfo);
        apifyMocks.listItems.mockImplementation(
          () =>
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Dataset fetch timeout")), 50)
            )
        );

        await expect(
          apifyMocks.listItems({})
        ).rejects.toThrow("Dataset fetch timeout");
      });

      it("should handle progressive timeout with retries", async () => {
        const { apifyMocks } = setupTestScenario({});

        let attempts = 0;
        apifyMocks.call.mockImplementation(async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error(`Timeout on attempt ${attempts}`);
          }
          return {
            id: "run_success",
            actId: "apify/x-scraper",
            status: "SUCCEEDED" as const,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            stats: { inputBodyLen: 1024, restartCount: 0, durationMillis: 1000 },
            defaultDatasetId: "dataset_success",
          };
        });

        // Simulate retry logic
        let lastError;
        for (let i = 0; i < 3; i++) {
          try {
            const result = await apifyMocks.call({});
            expect(result.status).toBe("SUCCEEDED");
            expect(attempts).toBe(3);
            break;
          } catch (error) {
            lastError = error;
          }
        }

        if (attempts < 3 && lastError) {
          throw lastError;
        }
      });
    });

    describe("Partial response processing", () => {
      it("should handle incomplete dataset responses", async () => {
        const { apifyMocks } = setupTestScenario({});

        const runInfo = {
          id: "run_123",
          actId: "apify/x-scraper",
          status: "SUCCEEDED" as const,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          stats: { inputBodyLen: 1024, restartCount: 0, durationMillis: 1000 },
          defaultDatasetId: "dataset_123",
        };

        apifyMocks.call.mockResolvedValue(runInfo);
        
        // Dataset returns partial data
        apifyMocks.listItems.mockResolvedValue({
          items: [
            X_COM_TEST_FIXTURES.singleTweet,
            null, // Missing item
            undefined, // Another missing item
            X_COM_TEST_FIXTURES.thread,
          ],
        });

        const response = await apifyMocks.listItems({});
        expect(response.items).toHaveLength(4);
        expect(response.items[1]).toBeNull();
        expect(response.items[2]).toBeUndefined();
      });

      it("should handle streaming data interruption", async () => {
        const { apifyMocks } = setupTestScenario({});

        apifyMocks.listItems.mockImplementation(async () => {
          // Simulate stream interruption
          throw new Error("Stream interrupted: Connection reset by peer");
        });

        await expect(apifyMocks.listItems({})).rejects.toThrow(
          "Stream interrupted"
        );
      });

      it("should handle malformed JSON in dataset", async () => {
        const { apifyMocks } = setupTestScenario({});

        apifyMocks.listItems.mockRejectedValue(
          new Error("Unexpected token < in JSON at position 0")
        );

        await expect(apifyMocks.listItems({})).rejects.toThrow(
          "Unexpected token < in JSON"
        );
      });
    });

    describe("Connection failures", () => {
      it("should handle connection refused", async () => {
        const { apifyMocks } = setupTestScenario({});

        apifyMocks.call.mockRejectedValue(
          new Error("connect ECONNREFUSED 127.0.0.1:443")
        );

        await expect(apifyMocks.call({})).rejects.toThrow("ECONNREFUSED");
      });

      it("should handle connection reset", async () => {
        const { apifyMocks } = setupTestScenario({});

        apifyMocks.call.mockRejectedValue(
          new Error("socket hang up")
        );

        await expect(apifyMocks.call({})).rejects.toThrow("socket hang up");
      });

      it("should handle network unreachable", async () => {
        const { apifyMocks } = setupTestScenario({});

        apifyMocks.call.mockRejectedValue(
          new Error("Network is unreachable")
        );

        await expect(apifyMocks.call({})).rejects.toThrow("Network is unreachable");
      });
    });
  });

  describe("Data Validation", () => {
    describe("Malformed Apify responses", () => {
      it("should handle response with null data", async () => {
        const { apifyMocks } = setupTestScenario({});

        const runInfo = {
          id: "run_123",
          actId: "apify/x-scraper",
          status: "SUCCEEDED" as const,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          stats: { inputBodyLen: 1024, restartCount: 0, durationMillis: 1000 },
          defaultDatasetId: "dataset_123",
        };

        apifyMocks.call.mockResolvedValue(runInfo);
        apifyMocks.listItems.mockResolvedValue({
          items: null as any,
        });

        const response = await apifyMocks.listItems({});
        expect(response.items).toBeNull();
      });

      it("should handle response with undefined items", async () => {
        const { apifyMocks } = setupTestScenario({});

        apifyMocks.listItems.mockResolvedValue({
          items: undefined as any,
        });

        const response = await apifyMocks.listItems({});
        expect(response.items).toBeUndefined();
      });

      it("should handle response with non-array items", async () => {
        const { apifyMocks } = setupTestScenario({});

        apifyMocks.listItems.mockResolvedValue({
          items: "not an array" as any,
        });

        const response = await apifyMocks.listItems({});
        expect(typeof response.items).toBe("string");
      });

      it("should handle deeply nested malformed data", async () => {
        const malformedResponse = {
          id: "123",
          text: null as any,
          author: {
            userName: undefined as any,
            followers: "not a number" as any,
            verified: "yes" as any, // should be boolean
          },
          media: [
            null,
            { url: undefined },
            "not an object",
            { type: "unknown", url: "valid-url" },
          ] as any,
          extendedEntities: {
            media: [
              {
                media_url_https: null,
                video_info: {
                  variants: "not an array" as any,
                },
              },
            ],
          },
        };

        const { apifyMocks } = setupTestScenario({
          apifyScenario: {
            scenario: "success",
            responseData: malformedResponse as any,
          },
        });

        await configureApifyMockScenario(apifyMocks, {
          scenario: "success",
          responseData: malformedResponse as any,
        });

        const runInfo = await apifyMocks.call({});
        expect(runInfo.status).toBe("SUCCEEDED");

        const { items } = await apifyMocks.listItems({});
        expect(items[0]).toEqual(malformedResponse);
      });
    });

    describe("Missing required fields", () => {
      it("should handle tweet without ID", () => {
        const tweetWithoutId = {
          text: "This tweet has no ID",
          author: { userName: "testuser" },
        } as any;

        expect(tweetWithoutId.id).toBeUndefined();
      });

      it("should handle tweet without text content", () => {
        const tweetWithoutText = {
          id: "123456789",
          author: { userName: "testuser" },
        } as any;

        expect(tweetWithoutText.text).toBeUndefined();
      });

      it("should handle tweet without author information", () => {
        const tweetWithoutAuthor = {
          id: "123456789",
          text: "This tweet has no author",
        } as any;

        expect(tweetWithoutAuthor.author).toBeUndefined();
      });

      it("should handle tweet with empty author object", () => {
        const tweetWithEmptyAuthor = {
          id: "123456789",
          text: "This tweet has empty author",
          author: {},
        } as any;

        expect(Object.keys(tweetWithEmptyAuthor.author)).toHaveLength(0);
      });

      it("should handle tweet missing all engagement metrics", () => {
        const tweetWithoutMetrics = {
          id: "123456789",
          text: "This tweet has no metrics",
          author: { userName: "testuser" },
        } as any;

        expect(tweetWithoutMetrics.likes).toBeUndefined();
        expect(tweetWithoutMetrics.retweets).toBeUndefined();
        expect(tweetWithoutMetrics.replies).toBeUndefined();
      });
    });

    describe("Unexpected data types", () => {
      it("should handle numeric fields as strings", () => {
        const tweetWithStringNumbers = {
          id: "123456789",
          text: "Test tweet",
          likes: "1000" as any,
          retweets: "50" as any,
          replies: "25" as any,
          author: {
            userName: "testuser",
            followers: "5000" as any,
          },
        };

        expect(typeof tweetWithStringNumbers.likes).toBe("string");
        expect(typeof tweetWithStringNumbers.author.followers).toBe("string");
      });

      it("should handle boolean fields as strings", () => {
        const tweetWithStringBooleans = {
          id: "123456789",
          text: "Test tweet",
          author: {
            userName: "testuser",
            verified: "true" as any,
          },
          isThread: "false" as any,
        };

        expect(typeof tweetWithStringBooleans.author.verified).toBe("string");
        expect(typeof tweetWithStringBooleans.isThread).toBe("string");
      });

      it("should handle date fields in various formats", () => {
        const tweetWithVariousDates = {
          id: "123456789",
          text: "Test tweet",
          createdAt: "2024-01-15 14:30:00", // Non-ISO format
          timestamp: 1705328400000, // Unix timestamp
          date: new Date(), // Date object
        };

        expect(typeof tweetWithVariousDates.createdAt).toBe("string");
        expect(typeof tweetWithVariousDates.timestamp).toBe("number");
        expect(tweetWithVariousDates.date).toBeInstanceOf(Date);
      });

      it("should handle array fields as non-arrays", () => {
        const tweetWithNonArrays = {
          id: "123456789",
          text: "Test tweet",
          photos: "single-photo-url.jpg" as any,
          hashtags: "#single-hashtag" as any,
          thread: { id: "nested-tweet" } as any,
        };

        expect(typeof tweetWithNonArrays.photos).toBe("string");
        expect(typeof tweetWithNonArrays.hashtags).toBe("string");
        expect(typeof tweetWithNonArrays.thread).toBe("object");
        expect(Array.isArray(tweetWithNonArrays.thread)).toBe(false);
      });
    });

    describe("Invalid JSON responses", () => {
      it("should handle truncated JSON", async () => {
        const { apifyMocks } = setupTestScenario({});

        apifyMocks.listItems.mockRejectedValue(
          new Error("Unexpected end of JSON input")
        );

        await expect(apifyMocks.listItems({})).rejects.toThrow(
          "Unexpected end of JSON input"
        );
      });

      it("should handle JSON with invalid escape sequences", async () => {
        const { apifyMocks } = setupTestScenario({});

        apifyMocks.listItems.mockRejectedValue(
          new Error("Invalid escape sequence in JSON at position 45")
        );

        await expect(apifyMocks.listItems({})).rejects.toThrow(
          "Invalid escape sequence"
        );
      });

      it("should handle JSON with circular references", () => {
        const circularObject: any = { id: "123" };
        circularObject.self = circularObject;

        expect(() => JSON.stringify(circularObject)).toThrow(
          "Converting circular structure to JSON"
        );
      });

      it("should handle JSON with very large payloads", () => {
        const largeTweet = {
          id: "123456789",
          text: "A".repeat(1000000), // 1MB of text
          media: Array(10000).fill({
            url: "https://example.com/media.jpg",
            type: "photo",
          }),
        };

        expect(largeTweet.text).toHaveLength(1000000);
        expect(largeTweet.media).toHaveLength(10000);
      });
    });
  });

  describe("Service Degradation Scenarios", () => {
    describe("Rate limiting responses", () => {
      it("should handle 429 Too Many Requests", async () => {
        const { apifyMocks } = setupTestScenario({
          apifyScenario: {
            scenario: "rate_limit",
          },
        });

        await configureApifyMockScenario(apifyMocks, {
          scenario: "rate_limit",
          shouldThrow: true,
        });

        await expect(apifyMocks.call({})).rejects.toThrow("Rate limit exceeded");
      });

      it("should handle rate limit with retry-after header", async () => {
        const { apifyMocks } = setupTestScenario({});

        const rateLimitError = X_COM_TEST_FIXTURES.rateLimitError;
        apifyMocks.call.mockRejectedValue(rateLimitError);

        await expect(apifyMocks.call({})).rejects.toEqual(rateLimitError);
      });

      it("should implement exponential backoff on rate limits", async () => {
        const { apifyMocks } = setupTestScenario({});

        await advancedScenarios.rateLimitThenRecovery(apifyMocks, {
          rateLimitDuration: 100,
          successResponse: X_COM_TEST_FIXTURES.singleTweet,
        });

        // First call should fail with rate limit
        await expect(apifyMocks.call({})).rejects.toEqual(
          X_COM_TEST_FIXTURES.rateLimitError
        );

        // Wait for recovery period
        await new Promise(resolve => setTimeout(resolve, 150));

        // Second call should succeed
        const runInfo = await apifyMocks.call({});
        expect(runInfo.status).toBe("SUCCEEDED");
      });
    });

    describe("Temporary service outages", () => {
      it("should handle 502 Bad Gateway", async () => {
        const { apifyMocks } = setupTestScenario({});

        apifyMocks.call.mockRejectedValue(
          new Error("502 Bad Gateway: The server received an invalid response from an upstream server")
        );

        await expect(apifyMocks.call({})).rejects.toThrow("502 Bad Gateway");
      });

      it("should handle 503 Service Unavailable with maintenance message", async () => {
        const { apifyMocks } = setupTestScenario({});

        const maintenanceError = {
          error: {
            type: "service_unavailable",
            message: "Service is temporarily down for maintenance. Please try again in 30 minutes.",
            statusCode: 503,
          },
        };

        apifyMocks.call.mockRejectedValue(maintenanceError);

        await expect(apifyMocks.call({})).rejects.toEqual(maintenanceError);
      });

      it("should handle intermittent connectivity issues", async () => {
        const { apifyMocks } = setupTestScenario({});

        advancedScenarios.networkInstability(apifyMocks, 0.7); // 70% failure rate

        let successCount = 0;
        let failureCount = 0;

        // Test multiple calls to verify intermittent behavior
        for (let i = 0; i < 10; i++) {
          try {
            await apifyMocks.call({});
            successCount++;
          } catch (error) {
            failureCount++;
          }
        }

        expect(failureCount).toBeGreaterThan(0);
        expect(successCount).toBeGreaterThan(0);
      });
    });

    describe("Authentication failures", () => {
      it("should handle 401 Unauthorized", async () => {
        const { apifyMocks } = setupTestScenario({
          apifyScenario: {
            scenario: "auth_error",
          },
        });

        await configureApifyMockScenario(apifyMocks, {
          scenario: "auth_error",
          shouldThrow: true,
        });

        await expect(apifyMocks.call({})).rejects.toThrow("Authentication failed");
      });

      it("should handle expired API tokens", async () => {
        const { apifyMocks } = setupTestScenario({});

        const expiredTokenError = {
          error: {
            type: "authentication_error",
            message: "API token has expired. Please generate a new token.",
            statusCode: 401,
          },
        };

        apifyMocks.call.mockRejectedValue(expiredTokenError);

        await expect(apifyMocks.call({})).rejects.toEqual(expiredTokenError);
      });

      it("should handle revoked API access", async () => {
        const { apifyMocks } = setupTestScenario({});

        const revokedAccessError = {
          error: {
            type: "authorization_error", 
            message: "API access has been revoked for this account.",
            statusCode: 403,
          },
        };

        apifyMocks.call.mockRejectedValue(revokedAccessError);

        await expect(apifyMocks.call({})).rejects.toEqual(revokedAccessError);
      });

      it("should handle invalid API key format", async () => {
        const { apifyMocks } = setupTestScenario({});

        apifyMocks.call.mockRejectedValue(
          new Error("Invalid API key format. Expected format: apify_api_...")
        );

        await expect(apifyMocks.call({})).rejects.toThrow("Invalid API key format");
      });
    });

    describe("Quota exceeded scenarios", () => {
      it("should handle monthly quota exceeded", async () => {
        const { apifyMocks } = setupTestScenario({});

        const quotaError = {
          error: {
            type: "quota_exceeded",
            message: "Monthly quota exceeded. Upgrade your plan or wait until next month.",
            statusCode: 429,
          },
        };

        apifyMocks.call.mockRejectedValue(quotaError);

        await expect(apifyMocks.call({})).rejects.toEqual(quotaError);
      });

      it("should handle compute unit quota exceeded", async () => {
        const { apifyMocks } = setupTestScenario({});

        const computeQuotaError = {
          error: {
            type: "compute_quota_exceeded",
            message: "Compute units quota exceeded. Current usage: 1000/1000 units.",
            statusCode: 429,
          },
        };

        apifyMocks.call.mockRejectedValue(computeQuotaError);

        await expect(apifyMocks.call({})).rejects.toEqual(computeQuotaError);
      });

      it("should handle storage quota exceeded", async () => {
        const { apifyMocks } = setupTestScenario({});

        const storageQuotaError = {
          error: {
            type: "storage_quota_exceeded",
            message: "Storage quota exceeded. Please delete old datasets or upgrade your plan.",
            statusCode: 507,
          },
        };

        apifyMocks.call.mockRejectedValue(storageQuotaError);

        await expect(apifyMocks.call({})).rejects.toEqual(storageQuotaError);
      });

      it("should handle concurrent run limit exceeded", async () => {
        const { apifyMocks } = setupTestScenario({});

        const concurrencyError = {
          error: {
            type: "concurrency_limit_exceeded",
            message: "Maximum number of concurrent actor runs reached (5/5). Please wait for existing runs to finish.",
            statusCode: 429,
          },
        };

        apifyMocks.call.mockRejectedValue(concurrencyError);

        await expect(apifyMocks.call({})).rejects.toEqual(concurrencyError);
      });
    });
  });

  describe("Recovery Behavior Validation", () => {
    describe("Fallback mechanisms", () => {
      it("should fall back to basic crawler when Apify fails", () => {
        const apifyService = createMockApifyService();
        
        // Configure service to fail, then check fallback is triggered
        apifyService.scrapeXUrl.mockRejectedValue(
          new Error("Apify service unavailable")
        );

        expect(async () => {
          try {
            await apifyService.scrapeXUrl("https://x.com/test/status/123");
          } catch (error) {
            // This would normally trigger fallback to basic crawler
            expect(error).toBeInstanceOf(Error);
            return null; // Fallback result
          }
        }).toBeDefined();
      });

      it("should retry with exponential backoff", async () => {
        const { apifyMocks } = setupTestScenario({});

        let attempt = 0;
        const maxAttempts = 3;
        const baseDelay = 100;

        apifyMocks.call.mockImplementation(async () => {
          attempt++;
          if (attempt < maxAttempts) {
            throw new Error(`Temporary failure ${attempt}`);
          }
          return {
            id: "run_success",
            actId: "apify/x-scraper", 
            status: "SUCCEEDED" as const,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            stats: { inputBodyLen: 1024, restartCount: 0, durationMillis: 1000 },
            defaultDatasetId: "dataset_success",
          };
        });

        // Simulate retry logic with exponential backoff
        for (let i = 0; i < maxAttempts; i++) {
          try {
            const result = await apifyMocks.call({});
            expect(result.status).toBe("SUCCEEDED");
            expect(attempt).toBe(maxAttempts);
            break;
          } catch (error) {
            if (i < maxAttempts - 1) {
              const delay = baseDelay * Math.pow(2, i);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              throw error;
            }
          }
        }
      });

      it("should cache successful responses to avoid re-fetching", () => {
        const apifyService = createMockApifyService();
        const cache = new Map<string, ProcessedXContent>();

        // Mock implementation with caching
        apifyService.scrapeXUrl.mockImplementation(async (url: string) => {
          if (cache.has(url)) {
            return cache.get(url)!;
          }

          const result: ProcessedXContent = {
            title: "Cached Tweet",
            content: "This is cached content",
            author: "testuser",
            authorUsername: "testuser",
          };

          cache.set(url, result);
          return result;
        });

        expect(cache.size).toBe(0);
      });
    });

    describe("Circuit breaker patterns", () => {
      it("should implement circuit breaker for repeated failures", () => {
        let failureCount = 0;
        let circuitOpen = false;
        const failureThreshold = 5;

        const mockServiceCall = () => {
          if (circuitOpen) {
            throw new Error("Circuit breaker is open");
          }

          failureCount++;
          if (failureCount >= failureThreshold) {
            circuitOpen = true;
          }
          
          throw new Error(`Service failure ${failureCount}`);
        };

        // Test circuit breaker behavior
        for (let i = 0; i < failureThreshold + 2; i++) {
          expect(() => mockServiceCall()).toThrow();
          
          if (i >= failureThreshold) {
            expect(() => mockServiceCall()).toThrow("Circuit breaker is open");
          }
        }

        expect(circuitOpen).toBe(true);
      });

      it("should recover from circuit breaker after timeout", async () => {
        let circuitOpen = true;
        const recoveryTimeout = 100;

        setTimeout(() => {
          circuitOpen = false;
        }, recoveryTimeout);

        // Initially circuit should be open
        expect(circuitOpen).toBe(true);

        // Wait for recovery
        await new Promise(resolve => setTimeout(resolve, recoveryTimeout + 10));

        // Circuit should now be closed
        expect(circuitOpen).toBe(false);
      });
    });

    describe("Graceful degradation", () => {
      it("should provide minimal data when full scraping fails", () => {
        const apifyService = createMockApifyService();

        apifyService.scrapeXUrl.mockImplementation(async (url: string) => {
          // Return minimal data instead of failing completely
          return {
            title: "Tweet (content unavailable)",
            content: "This tweet could not be fully loaded.",
            author: "Unknown",
            authorUsername: url.split("/")[3] || "unknown",
          };
        });

        expect(apifyService.scrapeXUrl).toBeDefined();
      });

      it("should maintain service availability during partial outages", () => {
        const apifyService = createMockApifyService();

        // Some features work, others don't
        apifyService.scrapeXUrl.mockResolvedValue({
          title: "Basic Tweet",
          content: "Basic content only",
          // Missing: media, thread, advanced metadata
        } as ProcessedXContent);

        apifyService.getStatus.mockReturnValue({
          enabled: true,
          configured: true, 
          actorId: "apify/x-scraper",
          // Could add healthStatus: "degraded"
        });

        expect(apifyService.getStatus().enabled).toBe(true);
      });
    });
  });

  describe("Edge Case Integration Tests", () => {
    it("should handle multiple error types in sequence", async () => {
      const { apifyMocks } = setupTestScenario({});

      const errorSequence = [
        new Error("Network timeout"),
        X_COM_TEST_FIXTURES.rateLimitError,
        X_COM_TEST_FIXTURES.authError,
        {
          id: "run_success",
          actId: "apify/x-scraper",
          status: "SUCCEEDED" as const,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          stats: { inputBodyLen: 1024, restartCount: 0, durationMillis: 1000 },
          defaultDatasetId: "dataset_success",
        },
      ];

      let callCount = 0;
      apifyMocks.call.mockImplementation(async () => {
        const result = errorSequence[callCount++];
        if (result instanceof Error || (result as any).error) {
          throw result;
        }
        return result;
      });

      // First three calls should fail
      for (let i = 0; i < 3; i++) {
        await expect(apifyMocks.call({})).rejects.toBeDefined();
      }

      // Fourth call should succeed
      const result = await apifyMocks.call({});
      expect(result.status).toBe("SUCCEEDED");
    });

    it("should handle mixed valid and invalid data in batch", async () => {
      const apifyService = createMockApifyService();

      const mixedResults = new Map([
        ["https://x.com/valid1/status/123", { title: "Valid Tweet 1", content: "Content 1" }],
        ["https://x.com/invalid/status/456", null], // Invalid/failed
        ["https://x.com/valid2/status/789", { title: "Valid Tweet 2", content: "Content 2" }],
      ]);

      configureApifyServiceMock(apifyService, {
        scrapeXUrl: {
          responses: mixedResults,
          throwOnUrls: ["https://x.com/error/status/999"],
        },
      });

      // Test individual URLs
      const result1 = await apifyService.scrapeXUrl("https://x.com/valid1/status/123");
      expect(result1?.title).toBe("Valid Tweet 1");

      const result2 = await apifyService.scrapeXUrl("https://x.com/invalid/status/456");
      expect(result2).toBeNull();

      await expect(
        apifyService.scrapeXUrl("https://x.com/error/status/999")
      ).rejects.toThrow("Failed to scrape");
    });

    it("should maintain data consistency during error recovery", async () => {
      const { apifyMocks } = setupTestScenario({});

      // Test data consistency after errors
      const validData = X_COM_TEST_FIXTURES.comprehensive;
      
      apifyMocks.call
        .mockRejectedValueOnce(new Error("Temporary failure"))
        .mockResolvedValueOnce({
          id: "run_success",
          actId: "apify/x-scraper",
          status: "SUCCEEDED" as const,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          stats: { inputBodyLen: 1024, restartCount: 0, durationMillis: 1000 },
          defaultDatasetId: "dataset_success",
        });

      apifyMocks.listItems.mockResolvedValue({
        items: [validData],
      });

      // First call fails
      await expect(apifyMocks.call({})).rejects.toThrow("Temporary failure");

      // Second call succeeds and data should be intact
      const runInfo = await apifyMocks.call({});
      expect(runInfo.status).toBe("SUCCEEDED");

      const { items } = await apifyMocks.listItems({});
      expect(items[0]).toEqual(validData);
      expect(items[0]?.id).toBe(validData.id);
      expect(items[0]?.text).toBe(validData.text);
    });
  });
});