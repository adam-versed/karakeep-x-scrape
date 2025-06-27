import type { Rules } from "metascraper";
import { isXComUrl } from "@karakeep/shared/utils/xcom";
import logger from "@karakeep/shared/logger";
import type { ProcessedXContent } from "@karakeep/shared/types/apify";

/**
 * This is a metascraper plugin for X.com (Twitter) content.
 * It provides enhanced metadata extraction when Apify data is available,
 * and falls back to standard HTML parsing otherwise.
 * 
 * When Apify data is present (injected by the crawler worker), this plugin
 * will use the rich metadata from the Apify scraping results instead of
 * trying to parse the heavily obfuscated X.com HTML.
 * 
 * This plugin enhances the following fields:
 * - title: Uses author name and handle
 * - description: Uses the tweet text content
 * - author: Uses the tweet author's display name
 * - image: Uses profile picture or first media item
 * - date: Uses the tweet's creation date
 * - publisher: Always "X (formerly Twitter)"
 * 
 * For thread content, it also provides a custom 'thread' field
 * containing the full thread structure.
 */

const test = ({ url }: { url: string }): boolean => isXComUrl(url);

interface MetascraperContext {
  url: string;
  htmlDom?: any;
  apifyData?: ProcessedXContent; // Injected by crawler worker
}

const metascraperX = () => {
  const rules: Rules = {
    pkgName: "metascraper-x",
    test,
    
    title: ({ url, htmlDom, apifyData }: MetascraperContext) => {
      if (apifyData) {
        return apifyData.title;
      }
      
      // Fallback: try to extract from HTML
      // X.com uses dynamic content, so this might not work well
      const title = htmlDom?.('title').text();
      if (title && !title.includes('X')) {
        return title;
      }
      
      // Last resort: use URL
      return `X Post - ${url}`;
    },

    description: ({ apifyData, htmlDom }: MetascraperContext) => {
      if (apifyData) {
        return apifyData.content;
      }
      
      // Fallback: try common meta tags
      const ogDescription = htmlDom?.('meta[property="og:description"]').attr('content');
      const twitterDescription = htmlDom?.('meta[name="twitter:description"]').attr('content');
      const metaDescription = htmlDom?.('meta[name="description"]').attr('content');
      
      return ogDescription || twitterDescription || metaDescription;
    },

    author: ({ apifyData, htmlDom }: MetascraperContext) => {
      if (apifyData) {
        return apifyData.author;
      }
      
      // Fallback: try meta tags
      const ogTitle = htmlDom?.('meta[property="og:title"]').attr('content');
      if (ogTitle && ogTitle.includes('on X:')) {
        // Extract author from "Author Name on X: tweet content"
        return ogTitle.split(' on X:')[0];
      }
      
      return undefined;
    },

    image: ({ apifyData, htmlDom }: MetascraperContext) => {
      if (apifyData) {
        // Use first media item if available, otherwise author profile pic
        if (apifyData.media && apifyData.media.length > 0) {
          return apifyData.media[0].url;
        }
        if (apifyData.authorProfilePic) {
          return apifyData.authorProfilePic;
        }
      }
      
      // Fallback: try standard meta tags
      const ogImage = htmlDom?.('meta[property="og:image"]').attr('content');
      const twitterImage = htmlDom?.('meta[name="twitter:image"]').attr('content');
      
      return ogImage || twitterImage;
    },

    date: ({ apifyData, htmlDom }: MetascraperContext) => {
      if (apifyData?.publishedAt) {
        return apifyData.publishedAt.toISOString();
      }
      
      // Fallback: try to find date in meta tags or structured data
      const ogDate = htmlDom?.('meta[property="article:published_time"]').attr('content');
      if (ogDate) {
        return ogDate;
      }
      
      return undefined;
    },

    publisher: ({ apifyData }: MetascraperContext) => {
      // Always return X as publisher for X.com URLs
      return "X (formerly Twitter)";
    },

    lang: ({ apifyData, htmlDom }: MetascraperContext) => {
      // Try to get language from HTML lang attribute
      const htmlLang = htmlDom?.('html').attr('lang');
      return htmlLang || 'en';
    },

    // Custom field for author username (as string)
    authorUsername: ({ apifyData }: MetascraperContext) => {
      return apifyData?.authorUsername || undefined;
    },
  };

  return rules;
};

export default metascraperX;