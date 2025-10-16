import crypto from "crypto";
import path from "path";
import { z } from "zod";
import { promises as dns } from "dns";
import { isIPv4, isIPv6 } from "net";

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

/**
 * Securely compares two strings using constant-time comparison to prevent timing attacks
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns True if strings are equal, false otherwise
 */
export function timingSafeStringCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  try {
    const bufferA = Buffer.from(a, "utf8");
    const bufferB = Buffer.from(b, "utf8");
    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch {
    return false;
  }
}

/**
 * Validates and sanitizes an asset ID to prevent path traversal attacks
 * @param assetId - The asset ID to validate
 * @returns The sanitized asset ID
 * @throws Error if asset ID is invalid or contains dangerous characters
 */
export function validateAssetId(assetId: string): string {
  // Asset IDs should be alphanumeric with hyphens/underscores only
  const assetIdPattern = /^[a-zA-Z0-9_-]+$/;
  
  if (!assetIdPattern.test(assetId)) {
    throw new Error("Invalid asset ID: contains illegal characters");
  }
  
  // Prevent path traversal attempts
  if (assetId.includes("..") || assetId.includes("/") || assetId.includes("\\")) {
    throw new Error("Invalid asset ID: contains path traversal characters");
  }
  
  // Limit length to reasonable bounds
  if (assetId.length > 255) {
    throw new Error("Invalid asset ID: too long");
  }
  
  return assetId;
}

/**
 * Validates and sanitizes a user ID to prevent path traversal attacks
 * @param userId - The user ID to validate
 * @returns The sanitized user ID
 * @throws Error if user ID is invalid
 */
export function validateUserId(userId: string): string {
  // User IDs should be UUIDs or similar alphanumeric strings
  const userIdPattern = /^[a-zA-Z0-9_-]+$/;
  
  if (!userIdPattern.test(userId)) {
    throw new Error("Invalid user ID: contains illegal characters");
  }
  
  // Prevent path traversal attempts
  if (userId.includes("..") || userId.includes("/") || userId.includes("\\")) {
    throw new Error("Invalid user ID: contains path traversal characters");
  }
  
  // Limit length to reasonable bounds
  if (userId.length > 255) {
    throw new Error("Invalid user ID: too long");
  }
  
  return userId;
}

/**
 * Safely constructs a file path by validating and sanitizing all components
 * @param basePath - The base directory path
 * @param ...pathSegments - Path segments to join
 * @returns The safely constructed path
 * @throws Error if any path segment is invalid
 */
export function safePathJoin(basePath: string, ...pathSegments: string[]): string {
  // Validate each path segment
  for (const segment of pathSegments) {
    if (segment.includes("..") || segment.includes("/") || segment.includes("\\")) {
      throw new Error("Invalid path segment: contains path traversal characters");
    }
    
    // Ensure no null bytes
    // eslint-disable-next-line no-control-regex
    if (/\0/.test(segment)) {
      throw new Error("Invalid path segment: contains null bytes");
    }
  }
  
  // Use path.join for safe construction
  const fullPath = path.join(basePath, ...pathSegments);
  
  // Ensure the resulting path is still within the base directory
  const resolved = path.resolve(fullPath);
  const resolvedBase = path.resolve(basePath);
  
  if (!resolved.startsWith(resolvedBase)) {
    throw new Error("Invalid path: outside of base directory");
  }
  
  return fullPath;
}

/**
 * Checks if an IP address is in a private/internal network range
 * @param ip - The IP address to check
 * @returns True if the IP is in a private range, false otherwise
 */
function isPrivateIP(ip: string): boolean {
  if (isIPv4(ip)) {
    const octets = ip.split('.').map(Number);
    
    // 10.0.0.0/8 (10.0.0.0 - 10.255.255.255)
    if (octets[0] === 10) {
      return true;
    }
    
    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
      return true;
    }
    
    // 192.168.0.0/16 (192.168.0.0 - 192.168.255.255)
    if (octets[0] === 192 && octets[1] === 168) {
      return true;
    }
    
    // 127.0.0.0/8 (localhost)
    if (octets[0] === 127) {
      return true;
    }
    
    // 169.254.0.0/16 (link-local)
    if (octets[0] === 169 && octets[1] === 254) {
      return true;
    }
    
    // 224.0.0.0/4 (multicast)
    if (octets[0] >= 224 && octets[0] <= 239) {
      return true;
    }
    
    // 240.0.0.0/4 (reserved)
    if (octets[0] >= 240 && octets[0] <= 255) {
      return true;
    }
    
    return false;
  }
  
  if (isIPv6(ip)) {
    const normalizedIP = ip.toLowerCase();
    
    // ::1 (IPv6 localhost)
    if (normalizedIP === '::1') {
      return true;
    }
    
    // fe80::/10 (link-local)
    if (normalizedIP.startsWith('fe80:')) {
      return true;
    }
    
    // fc00::/7 (unique local)
    if (normalizedIP.startsWith('fc') || normalizedIP.startsWith('fd')) {
      return true;
    }
    
    // ::ffff:0:0/96 (IPv4-mapped IPv6)
    if (normalizedIP.startsWith('::ffff:')) {
      const ipv4Part = normalizedIP.substring(7);
      if (isIPv4(ipv4Part)) {
        return isPrivateIP(ipv4Part);
      }
    }
    
    return false;
  }
  
  return false;
}

/**
 * Validates a URL against SSRF attacks by checking for private IP addresses
 * @param url - The URL string to validate
 * @returns Promise that resolves to the validated URL string
 * @throws Error if URL targets private/internal networks
 */
export async function validateUrlForSSRF(url: string): Promise<string> {
  // First validate the URL format
  const validatedUrl = validateAndSanitizeUrl(url);
  const parsedUrl = new URL(validatedUrl);
  
  // Check if hostname is already an IP address
  if (isIPv4(parsedUrl.hostname) || isIPv6(parsedUrl.hostname)) {
    if (isPrivateIP(parsedUrl.hostname)) {
      throw new Error(`URL ${url} targets private/internal network address`);
    }
    return validatedUrl;
  }
  
  // Check for localhost variants
  if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === 'local') {
    throw new Error(`URL ${url} targets localhost`);
  }
  
  try {
    // Resolve hostname to IP addresses
    const addresses = await dns.resolve(parsedUrl.hostname, 'ANY');
    
    // Check all resolved addresses
    for (const record of addresses) {
      let ip: string | undefined;
      
      // Extract IP from different record types
      if (record.type === 'A') {
        ip = record.address;
      } else if (record.type === 'AAAA') {
        ip = record.address;
      } else if (record.type === 'CNAME') {
        // For CNAME records, we need to resolve the canonical name
        try {
          const cnameAddresses = await dns.resolve(record.value, 'ANY');
          for (const cnameRecord of cnameAddresses) {
            if (cnameRecord.type === 'A' && isPrivateIP(cnameRecord.address)) {
              throw new Error(`URL ${url} resolves to private IP via CNAME: ${cnameRecord.address}`);
            }
            if (cnameRecord.type === 'AAAA' && isPrivateIP(cnameRecord.address)) {
              throw new Error(`URL ${url} resolves to private IP via CNAME: ${cnameRecord.address}`);
            }
          }
        } catch {
          // If CNAME resolution fails, continue with other records
          continue;
        }
      }
      
      if (ip && isPrivateIP(ip)) {
        throw new Error(`URL ${url} resolves to private/internal IP address: ${ip}`);
      }
    }
    
    return validatedUrl;
  } catch (error) {
    if (error instanceof Error && error.message.includes('private')) {
      throw error;
    }
    // DNS resolution failed - could be a sign of DNS rebinding attack
    throw new Error(`Failed to resolve hostname for URL ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
