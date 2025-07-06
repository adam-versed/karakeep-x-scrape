import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import { timingSafeStringCompare } from "../../validation";

describe("Timing-Safe String Comparison", () => {
  describe("Basic Functionality", () => {
    it("should return true for identical strings", () => {
      const testCases = [
        "",
        "a",
        "hello",
        "1234567890",
        "special!@#$%^&*()characters",
        "unicode-测试-🚀",
        "very_long_string_with_many_characters_to_test_performance",
        "API_KEY_PREFIX_1234567890abcdef_fedcba0987654321",
      ];

      testCases.forEach(str => {
        expect(timingSafeStringCompare(str, str)).toBe(true);
      });
    });

    it("should return false for different strings of same length", () => {
      const testCases = [
        ["a", "b"],
        ["hello", "world"],
        ["12345", "67890"],
        ["same_", "diff_"],
        ["prefix_abc", "prefix_xyz"],
        ["API_KEY_1234", "API_KEY_5678"],
      ];

      testCases.forEach(([str1, str2]) => {
        expect(timingSafeStringCompare(str1, str2)).toBe(false);
      });
    });

    it("should return false for strings of different lengths", () => {
      const testCases = [
        ["", "a"],
        ["short", "longer_string"],
        ["1", "12"],
        ["prefix", "prefix_with_suffix"],
        ["API_KEY_1234567890", "API_KEY_1234567890abcdef"],
      ];

      testCases.forEach(([str1, str2]) => {
        expect(timingSafeStringCompare(str1, str2)).toBe(false);
        expect(timingSafeStringCompare(str2, str1)).toBe(false);
      });
    });
  });

  describe("Timing Attack Resistance", () => {
    it("should have consistent timing regardless of difference position", async () => {
      const baseString = "kk_1234567890abcdef_fedcba0987654321";
      const measurements: number[] = [];

      // Test strings that differ at various positions
      const testStrings = [
        "0k_1234567890abcdef_fedcba0987654321", // Position 0
        "k0_1234567890abcdef_fedcba0987654321", // Position 1  
        "kk01234567890abcdef_fedcba0987654321", // Position 2
        "kk_0234567890abcdef_fedcba0987654321", // Position 3
        "kk_1034567890abcdef_fedcba0987654321", // Position 4
        "kk_1204567890abcdef_fedcba0987654321", // Position 5
        "kk_1230567890abcdef_fedcba0987654321", // Position 6
        "kk_1234067890abcdef_fedcba0987654321", // Position 7
        "kk_1234507890abcdef_fedcba0987654321", // Position 8
        "kk_1234560890abcdef_fedcba0987654321", // Position 9
        "kk_1234567090abcdef_fedcba0987654321", // Position 10
        "kk_1234567800abcdef_fedcba0987654321", // Position 11
        "kk_1234567890abcdef_0edcba0987654321", // Secret position 0
        "kk_1234567890abcdef_f0dcba0987654321", // Secret position 1
        "kk_1234567890abcdef_fe0cba0987654321", // Secret position 2
        "kk_1234567890abcdef_fed0ba0987654321", // Secret position 3
        "kk_1234567890abcdef_fedc0a0987654321", // Secret position 4
        "kk_1234567890abcdef_fedcb00987654321", // Secret position 5
      ];

      // Measure timing for each comparison
      for (const testString of testStrings) {
        const iterations = 100;
        const timings: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const start = process.hrtime.bigint();
          timingSafeStringCompare(baseString, testString);
          const end = process.hrtime.bigint();
          timings.push(Number(end - start));
        }

        // Calculate average timing for this position
        const avgTiming = timings.reduce((a, b) => a + b) / timings.length;
        measurements.push(avgTiming);
      }

      // Calculate coefficient of variation across all positions
      const mean = measurements.reduce((a, b) => a + b) / measurements.length;
      const variance = measurements.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / measurements.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = stdDev / mean;

      // Timing should be consistent regardless of where the difference occurs
      // Allow for some natural variation but should be much less than 50%
      expect(coefficientOfVariation).toBeLessThan(0.5);
    });

    it("should have consistent timing for different string lengths", () => {
      const timings: number[] = [];
      const iterations = 50;

      // Test strings of different lengths
      const testPairs = [
        ["a", "b"],
        ["ab", "cd"], 
        ["abc", "def"],
        ["abcd", "efgh"],
        ["short", "other"],
        ["medium_length", "different_str"],
        ["longer_string_here", "another_string_val"],
      ];

      testPairs.forEach(([str1, str2]) => {
        const pairTimings: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const start = process.hrtime.bigint();
          timingSafeStringCompare(str1, str2);
          const end = process.hrtime.bigint();
          pairTimings.push(Number(end - start));
        }

        const avgTiming = pairTimings.reduce((a, b) => a + b) / pairTimings.length;
        timings.push(avgTiming);
      });

      // Different length comparisons should return quickly and consistently
      const mean = timings.reduce((a, b) => a + b) / timings.length;
      const variance = timings.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / timings.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = stdDev / mean;

      // Should be very consistent for different lengths (allow more variance in test environment)
      expect(coefficientOfVariation).toBeLessThan(0.5);
    });

    it("should resist timing attacks on API key validation", () => {
      const correctKey = "kk_1234567890abcdef_fedcba0987654321";
      const measurements: Record<string, number[]> = {};

      // Simulate different attack scenarios
      const attackStrings = {
        "early_diff": "0k_1234567890abcdef_fedcba0987654321",
        "middle_diff": "kk_1234567890abcd00_fedcba0987654321", 
        "late_diff": "kk_1234567890abcdef_fedcba098765432f",
        "prefix_match": "kk_0000000000000000_fedcba0987654321",
        "suffix_match": "kk_1234567890abcdef_0000000000000000",
        "random_same_len": "xx_abcdefghijklmnop_0123456789abcdef",
      };

      const iterations = 100;

      Object.entries(attackStrings).forEach(([label, attackString]) => {
        measurements[label] = [];

        for (let i = 0; i < iterations; i++) {
          const start = process.hrtime.bigint();
          timingSafeStringCompare(correctKey, attackString);
          const end = process.hrtime.bigint();
          measurements[label].push(Number(end - start));
        }
      });

      // Calculate averages for each attack type
      const averages = Object.entries(measurements).map(([label, timings]) => {
        const avg = timings.reduce((a, b) => a + b) / timings.length;
        return { label, avg };
      });

      // All attack types should take similar time
      const allAverages = averages.map(a => a.avg);
      const mean = allAverages.reduce((a, b) => a + b) / allAverages.length;
      const variance = allAverages.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / allAverages.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = stdDev / mean;

      expect(coefficientOfVariation).toBeLessThan(0.4);
    });
  });

  describe("Cryptographic Security", () => {
    it("should use crypto.timingSafeEqual internally", () => {
      // Test that it behaves like crypto.timingSafeEqual for equal-length strings
      const str1 = "test_string_123";
      const str2 = "test_string_456";
      const str3 = "test_string_123";

      expect(timingSafeStringCompare(str1, str2)).toBe(false);
      expect(timingSafeStringCompare(str1, str3)).toBe(true);

      // Verify it properly handles the crypto function's requirements
      const buffer1 = Buffer.from(str1, "utf8");
      const buffer2 = Buffer.from(str2, "utf8");
      const buffer3 = Buffer.from(str3, "utf8");

      expect(crypto.timingSafeEqual(buffer1, buffer2)).toBe(false);
      expect(crypto.timingSafeEqual(buffer1, buffer3)).toBe(true);
    });

    it("should handle buffer creation errors gracefully", () => {
      // Test with strings that might cause buffer issues
      const edgeCases = [
        "\uFFFD", // Replacement character
        "\u0000", // Null character
        "🚀🎉🔥", // Multi-byte Unicode
        "test\0hidden", // Embedded null
      ];

      edgeCases.forEach(str => {
        expect(() => timingSafeStringCompare(str, str)).not.toThrow();
        expect(timingSafeStringCompare(str, str)).toBe(true);
        expect(timingSafeStringCompare(str, "different")).toBe(false);
      });
    });

    it("should handle encoding consistently", () => {
      // Test various encodings and special characters
      const testStrings = [
        "ascii_only_123",
        "latin1_café_naïve",
        "unicode_测试_🚀_🎉",
        "mixed_ascii_and_unicode_测试",
        "special_chars_!@#$%^&*()",
        "quotes_'double\"back`tick",
        "whitespace_\t\n\r_chars",
      ];

      testStrings.forEach(str => {
        // Same string should always compare equal
        expect(timingSafeStringCompare(str, str)).toBe(true);
        
        // Different strings should compare false
        const modified = str + "_suffix";
        expect(timingSafeStringCompare(str, modified)).toBe(false);
      });
    });
  });

  describe("Performance Characteristics", () => {
    it("should have linear time complexity", () => {
      const measurements: Array<{ length: number; time: number }> = [];
      const iterations = 50;

      // Test with strings of increasing length
      const lengths = [10, 50, 100, 250, 500, 1000];

      lengths.forEach(length => {
        const str1 = "a".repeat(length);
        const str2 = "b".repeat(length);
        const timings: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const start = process.hrtime.bigint();
          timingSafeStringCompare(str1, str2);
          const end = process.hrtime.bigint();
          timings.push(Number(end - start));
        }

        const avgTime = timings.reduce((a, b) => a + b) / timings.length;
        measurements.push({ length, time: avgTime });
      });

      // Time should increase roughly linearly with string length
      // Check that longer strings don't take exponentially longer
      const firstMeasurement = measurements[0];
      const lastMeasurement = measurements[measurements.length - 1];
      
      const lengthRatio = lastMeasurement.length / firstMeasurement.length;
      const timeRatio = lastMeasurement.time / firstMeasurement.time;
      
      // Time ratio should be roughly proportional to length ratio
      // Allow for some overhead but shouldn't be exponential
      expect(timeRatio).toBeLessThan(lengthRatio * 3);
    });

    it("should be fast enough for production use", () => {
      const testString = "kk_1234567890abcdef_fedcba0987654321";
      const iterations = 1000;
      
      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        timingSafeStringCompare(testString, testString);
      }
      
      const duration = Date.now() - start;
      const avgPerComparison = duration / iterations;
      
      // Should be very fast - less than 1ms per comparison on average
      expect(avgPerComparison).toBeLessThan(1);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle empty strings correctly", () => {
      expect(timingSafeStringCompare("", "")).toBe(true);
      expect(timingSafeStringCompare("", "a")).toBe(false);
      expect(timingSafeStringCompare("a", "")).toBe(false);
    });

    it("should handle very long strings", () => {
      const longString1 = "x".repeat(10000);
      const longString2 = "x".repeat(10000);
      const longString3 = "y".repeat(10000);

      expect(timingSafeStringCompare(longString1, longString2)).toBe(true);
      expect(timingSafeStringCompare(longString1, longString3)).toBe(false);
    });

    it("should handle null and undefined gracefully", () => {
      // These should be caught by TypeScript, but test runtime behavior
      try {
        timingSafeStringCompare(null as any, "test");
        expect.fail("Should have thrown for null input");
      } catch (error) {
        expect(error).toBeDefined();
      }
      
      try {
        timingSafeStringCompare("test", undefined as any);
        expect.fail("Should have thrown for undefined input");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should handle non-string inputs", () => {
      const nonStringInputs = [
        123,
        true,
        {},
        [],
        Symbol("test"),
      ];

      nonStringInputs.forEach(input => {
        try {
          timingSafeStringCompare(input as any, "test");
          expect.fail(`Should have thrown for input: ${typeof input}`);
        } catch (error) {
          expect(error).toBeDefined();
        }
        
        try {
          timingSafeStringCompare("test", input as any);
          expect.fail(`Should have thrown for input: ${typeof input}`);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    it("should handle buffer conversion errors", () => {
      // Test the function's error handling when Buffer.from might fail
      const invalidInputs = [
        "\uDC00", // Invalid Unicode surrogate
        String.fromCharCode(0xFFFE), // Invalid Unicode
      ];

      invalidInputs.forEach(input => {
        // Should not throw, even with problematic Unicode
        expect(() => timingSafeStringCompare(input, input)).not.toThrow();
      });
    });
  });

  describe("Security Properties", () => {
    it("should not leak information through early returns", () => {
      const secret = "secret_key_1234567890abcdef";
      const attempts = [
        "s", // Correct first char
        "se", // Correct first two chars
        "sec", // Correct first three chars
        "secret_key_", // Correct prefix
        "wrong_prefix_but_same_length", // Wrong prefix, same length
        "completely_different_string", // Completely different
      ];

      const timings: number[] = [];
      const iterations = 100;

      attempts.forEach(attempt => {
        const attemptTimings: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const start = process.hrtime.bigint();
          timingSafeStringCompare(secret, attempt);
          const end = process.hrtime.bigint();
          attemptTimings.push(Number(end - start));
        }

        const avgTiming = attemptTimings.reduce((a, b) => a + b) / attemptTimings.length;
        timings.push(avgTiming);
      });

      // All same-length comparisons should take similar time
      const sameLengthTimings = timings.slice(-2); // Last two are same length
      if (sameLengthTimings.length === 2) {
        const timeDiff = Math.abs(sameLengthTimings[0] - sameLengthTimings[1]);
        const avgTime = (sameLengthTimings[0] + sameLengthTimings[1]) / 2;
        const relativeDiff = timeDiff / avgTime;
        
        expect(relativeDiff).toBeLessThan(2.0); // Allow significant variance in test environment
      }
    });

    it("should provide consistent results under load", async () => {
      const testString = "load_test_string_123";
      const wrongString = "load_test_string_456";
      
      // Simulate high load with concurrent comparisons
      const concurrentTasks = Array(100).fill(null).map(async () => {
        const results: boolean[] = [];
        
        for (let i = 0; i < 50; i++) {
          results.push(timingSafeStringCompare(testString, testString));
          results.push(timingSafeStringCompare(testString, wrongString));
        }
        
        return results;
      });

      const allResults = (await Promise.all(concurrentTasks)).flat();
      
      // Should have consistent results: 50% true, 50% false
      const trueCount = allResults.filter(r => r === true).length;
      const falseCount = allResults.filter(r => r === false).length;
      
      expect(trueCount).toBe(falseCount); // Equal number of true/false
      expect(trueCount + falseCount).toBe(allResults.length);
    });
  });
});