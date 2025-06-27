/**
 * Utility functions for X.com (Twitter) URL handling and content processing
 */

/**
 * Check if a URL is an X.com/Twitter URL
 */
export function isXComUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    return hostname === 'x.com' || 
           hostname === 'twitter.com' ||
           hostname === 'www.x.com' ||
           hostname === 'www.twitter.com' ||
           hostname === 'mobile.x.com' ||
           hostname === 'mobile.twitter.com';
  } catch {
    return false;
  }
}

/**
 * Extract tweet ID from X.com/Twitter URL
 */
export function extractTweetId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    
    // Look for status path: /username/status/tweetId
    const statusIndex = pathParts.indexOf('status');
    if (statusIndex !== -1 && statusIndex + 1 < pathParts.length) {
      const tweetId = pathParts[statusIndex + 1];
      // Remove any query parameters
      return tweetId.split('?')[0];
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract username from X.com/Twitter URL
 */
export function extractUsername(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
    
    // First path segment should be username (unless it's a special path)
    if (pathParts.length > 0) {
      const firstPart = pathParts[0];
      
      // Skip special paths
      const specialPaths = ['i', 'home', 'explore', 'notifications', 'messages', 'bookmarks', 'settings'];
      if (!specialPaths.includes(firstPart)) {
        return firstPart;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if URL is a thread/conversation
 */
export function isThreadUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    
    // Check for conversation ID in query params
    const searchParams = urlObj.searchParams;
    if (searchParams.has('s')) {
      // Thread indicator in URL
      return true;
    }
    
    // Check for thread indicators in hash
    if (urlObj.hash.includes('thread')) {
      return true;
    }
    
    // For now, assume any status URL might be part of a thread
    return urlObj.pathname.includes('/status/');
  } catch {
    return false;
  }
}

/**
 * Normalize X.com URL (convert twitter.com to x.com, remove tracking params)
 */
export function normalizeXComUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // Convert twitter.com to x.com
    if (urlObj.hostname.includes('twitter.com')) {
      urlObj.hostname = urlObj.hostname.replace('twitter.com', 'x.com');
    }
    
    // Remove mobile prefix
    if (urlObj.hostname.startsWith('mobile.')) {
      urlObj.hostname = urlObj.hostname.replace('mobile.', '');
    }
    
    // Remove common tracking parameters
    const trackingParams = ['s', 't', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    trackingParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    
    // Remove hash if it's just tracking
    if (urlObj.hash.match(/^#[a-zA-Z0-9_-]*$/)) {
      urlObj.hash = '';
    }
    
    return urlObj.toString();
  } catch {
    return url; // Return original if parsing fails
  }
}

/**
 * Check if URL points to a specific tweet vs profile/other
 */
export function isTweetUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.includes('/status/');
  } catch {
    return false;
  }
}

/**
 * Generate a descriptive title for X.com content
 */
export function generateXContentTitle(
  username: string, 
  displayName?: string, 
  isThread?: boolean,
  tweetId?: string
): string {
  const name = displayName || username;
  const threadText = isThread ? ' (Thread)' : '';
  const idText = tweetId ? ` - ${tweetId}` : '';
  
  return `${name} (@${username})${threadText}${idText}`;
}

/**
 * Extract hashtags from text content
 */
export function extractHashtags(text: string): string[] {
  const hashtagRegex = /#[\w]+/g;
  const matches = text.match(hashtagRegex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extract mentions from text content
 */
export function extractMentions(text: string): string[] {
  const mentionRegex = /@[\w]+/g;
  const matches = text.match(mentionRegex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Clean up tweet text (remove t.co links, fix encoding issues)
 */
export function cleanTweetText(text: string): string {
  let cleaned = text;
  
  // Remove t.co links (they're usually redundant with media/quote tweets)
  cleaned = cleaned.replace(/https:\/\/t\.co\/[\w]+/g, '').trim();
  
  // Fix common encoding issues
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");
  
  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}