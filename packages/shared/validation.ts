import { z } from "zod";

/**
 * URL validation schema that ensures URLs are properly formatted
 * and don't contain malicious characters
 */
export const zSafeUrlSchema = z
  .string()
  .url({ message: "Invalid URL format" })
  .refine(
    (url) => {
      // Check for potentially dangerous characters
      const dangerousChars = /[;&|`$(){}[\]<>]/;
      return !dangerousChars.test(url);
    },
    {
      message: "URL contains potentially dangerous characters",
    },
  )
  .refine(
    (url) => {
      // Ensure protocol is http or https
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    },
    {
      message: "URL must use http or https protocol",
    },
  );

/**
 * Sanitizes and validates a URL string
 * @param url - The URL string to validate
 * @returns The validated URL string
 * @throws Error if URL is invalid or contains dangerous characters
 */
export function validateAndSanitizeUrl(url: string): string {
  try {
    return zSafeUrlSchema.parse(url);
  } catch (error) {
    throw new Error(
      `Invalid URL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Sanitizes command line arguments to prevent injection attacks
 * @param args - Array of command line arguments
 * @returns Sanitized array of arguments
 */
export function sanitizeCommandArgs(args: string[]): string[] {
  return args.map((arg) => {
    // Remove potentially dangerous characters
    const sanitized = arg.replace(/[;&|`$(){}[\]<>]/g, "");
    // Ensure no null bytes
    // eslint-disable-next-line no-control-regex
    return sanitized.replace(/\0/g, "");
  });
}

/**
 * Validates that a string is safe for use in command line execution
 * @param str - The string to validate
 * @returns True if safe, false otherwise
 */
export function isSafeCommandArg(str: string): boolean {
  // Check for shell metacharacters
  // eslint-disable-next-line no-control-regex
  const dangerousChars = /[;&|`$(){}[\]<>\0]/;
  return !dangerousChars.test(str);
}
