import { promises as fs } from "fs";
import * as path from "node:path";
import * as os from "os";
import { PlaywrightBlocker } from "@ghostery/adblocker-playwright";
import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import { eq } from "drizzle-orm";
import { execa } from "execa";
import { JSDOM, VirtualConsole } from "jsdom";
import { DequeuedJob, Runner } from "liteque";
import metascraper from "metascraper";
import metascraperAmazon from "metascraper-amazon";
import metascraperAuthor from "metascraper-author";
import metascraperDate from "metascraper-date";
import metascraperDescription from "metascraper-description";
import metascraperImage from "metascraper-image";
import metascraperLogo from "metascraper-logo-favicon";
import metascraperPublisher from "metascraper-publisher";
import metascraperTitle from "metascraper-title";
import metascraperTwitter from "metascraper-twitter";
import metascraperUrl from "metascraper-url";
import fetch from "node-fetch";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { withTimeout } from "utils";
import { getBookmarkDetails, updateAsset } from "workerUtils";

import type { ZCrawlLinkRequest } from "@karakeep/shared/queues";
import type { ProcessedXContent } from "@karakeep/shared/types/apify";
import { db } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
} from "@karakeep/db/schema";
import {
  ASSET_TYPES,
  getAssetSize,
  IMAGE_ASSET_TYPES,
  newAssetId,
  readAsset,
  saveAsset,
  saveAssetFromFile,
  silentDeleteAsset,
  SUPPORTED_UPLOAD_ASSET_TYPES,
} from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import {
  AssetPreprocessingQueue,
  InferenceQueue,
  LinkCrawlerQueue,
  triggerSearchReindex,
  triggerVideoWorker,
  triggerWebhook,
  zCrawlLinkRequestSchema,
} from "@karakeep/shared/queues";
import { ApifyService } from "@karakeep/shared/services/apifyService";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { isXComUrl } from "@karakeep/shared/utils/xcom";

import metascraperReddit from "../metascraper-plugins/metascraper-reddit";
import metascraperX from "../metascraper-plugins/metascraper-x";
import { browserPool } from "../utils/browserPool";

const metascraperParser = metascraper([
  metascraperDate({
    dateModified: true,
    datePublished: true,
  }),
  metascraperAmazon(),
  metascraperReddit(),
  metascraperX(), // Enhanced X.com support
  metascraperAuthor(),
  metascraperPublisher(),
  metascraperTitle(),
  metascraperDescription(),
  metascraperTwitter(),
  metascraperImage(),
  metascraperLogo(),
  metascraperUrl(),
]);

let globalBlocker: PlaywrightBlocker | undefined;

// Browser management is now handled by browserPool

export class CrawlerWorker {
  static async build() {
    chromium.use(StealthPlugin());
    if (serverConfig.crawler.enableAdblocker) {
      try {
        logger.info("[crawler] Loading adblocker ...");
        globalBlocker = await PlaywrightBlocker.fromPrebuiltFull(fetch, {
          path: path.join(os.tmpdir(), "karakeep_adblocker.bin"),
          read: fs.readFile,
          write: fs.writeFile,
        });
      } catch (e) {
        logger.error(
          `[crawler] Failed to load adblocker. Will not be blocking ads: ${e}`,
        );
      }
    }
    // Initialize browser pool
    try {
      await browserPool.initialize();
      logger.info("[Crawler] Browser pool initialized successfully");
    } catch (error) {
      logger.error("[Crawler] Failed to initialize browser pool:", error);
    }

    logger.info("Starting crawler worker ...");
    const worker = new Runner<ZCrawlLinkRequest>(
      LinkCrawlerQueue,
      {
        run: withTimeout(
          runCrawler,
          /* timeoutSec */ serverConfig.crawler.jobTimeoutSec,
        ),
        onComplete: async (job) => {
          const jobId = job.id;
          logger.info(`[Crawler][${jobId}] Completed successfully`);
          const bookmarkId = job.data.bookmarkId;
          if (bookmarkId) {
            await changeBookmarkStatus(bookmarkId, "success");
          }
        },
        onError: async (job) => {
          const jobId = job.id;
          logger.error(
            `[Crawler][${jobId}] Crawling job failed: ${job.error}\n${job.error.stack}`,
          );
          const bookmarkId = job.data?.bookmarkId;
          if (bookmarkId && job.numRetriesLeft == 0) {
            await changeBookmarkStatus(bookmarkId, "failure");
          }
        },
      },
      {
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.crawler.jobTimeoutSec,
        concurrency: serverConfig.crawler.numWorkers,
      },
    );

    return worker;
  }
}

type DBAssetType = typeof assets.$inferInsert;

async function changeBookmarkStatus(
  bookmarkId: string,
  crawlStatus: "success" | "failure",
) {
  await db
    .update(bookmarkLinks)
    .set({
      crawlStatus,
    })
    .where(eq(bookmarkLinks.id, bookmarkId));
}

/**
 * This provides some "basic" protection from malicious URLs. However, all of those
 * can be easily circumvented by pointing dns of origin to localhost, or with
 * redirects.
 */
function validateUrl(url: string) {
  const urlParsed = new URL(url);
  if (urlParsed.protocol != "http:" && urlParsed.protocol != "https:") {
    throw new Error(`Unsupported URL protocol: ${urlParsed.protocol}`);
  }

  if (["localhost", "127.0.0.1", "0.0.0.0"].includes(urlParsed.hostname)) {
    throw new Error(`Link hostname rejected: ${urlParsed.hostname}`);
  }
}

async function browserlessCrawlPage(
  jobId: string,
  url: string,
  abortSignal: AbortSignal,
) {
  logger.info(
    `[Crawler][${jobId}] Running in browserless mode. Will do a plain http request to "${url}". Screenshots will be disabled.`,
  );
  const response = await fetch(url, {
    signal: AbortSignal.any([AbortSignal.timeout(5000), abortSignal]),
  });
  logger.info(
    `[Crawler][${jobId}] Successfully fetched the content of "${url}". Status: ${response.status}, Size: ${response.size}`,
  );
  return {
    htmlContent: await response.text(),
    statusCode: response.status,
    screenshot: undefined,
    url: response.url,
  };
}

async function crawlPage(
  jobId: string,
  url: string,
  abortSignal: AbortSignal,
): Promise<{
  htmlContent: string;
  screenshot: Buffer | undefined;
  statusCode: number;
  url: string;
}> {
  // Acquire a browser context from the pool
  const context = await browserPool.acquireContext();

  if (!context) {
    logger.info(
      `[Crawler][${jobId}] No browser context available, falling back to browserless mode`,
    );
    return browserlessCrawlPage(jobId, url, abortSignal);
  }

  try {
    // Create a new page in the context
    const page = await context.newPage();

    // Apply ad blocking if available
    if (globalBlocker) {
      await globalBlocker.enableBlockingInPage(page);
    }

    // Navigate to the target URL
    logger.info(`[Crawler][${jobId}] Navigating to "${url}"`);
    const response = await page.goto(url, {
      timeout: serverConfig.crawler.navigateTimeoutSec * 1000,
      waitUntil: "domcontentloaded",
    });

    logger.info(
      `[Crawler][${jobId}] Successfully navigated to "${url}". Waiting for the page to load ...`,
    );

    // Wait until network is relatively idle or timeout after 5 seconds
    await Promise.race([
      page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => ({})),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);

    logger.info(`[Crawler][${jobId}] Finished waiting for the page to load.`);

    // Extract content from the page
    const htmlContent = await page.content();
    logger.info(`[Crawler][${jobId}] Successfully fetched the page content.`);

    // Take a screenshot if configured
    let screenshot: Buffer | undefined = undefined;
    if (serverConfig.crawler.storeScreenshot) {
      try {
        screenshot = await Promise.race<Buffer>([
          page.screenshot({
            // If you change this, you need to change the asset type in the store function.
            type: "png",
            fullPage: serverConfig.crawler.fullPageScreenshot,
          }),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  "TIMED_OUT, consider increasing CRAWLER_SCREENSHOT_TIMEOUT_SEC",
                ),
              serverConfig.crawler.screenshotTimeoutSec * 1000,
            ),
          ),
        ]);
        logger.info(
          `[Crawler][${jobId}] Finished capturing page content and a screenshot. FullPageScreenshot: ${serverConfig.crawler.fullPageScreenshot}`,
        );
      } catch (e) {
        logger.warn(
          `[Crawler][${jobId}] Failed to capture the screenshot. Reason: ${e}`,
        );
      }
    }

    return {
      htmlContent,
      statusCode: response?.status() ?? 0,
      screenshot,
      url: page.url(),
    };
  } finally {
    // Release the context back to the pool
    await browserPool.releaseContext(context);
  }
}

async function extractMetadata(
  htmlContent: string,
  url: string,
  jobId: string,
  apifyData?: ProcessedXContent, // Optional Apify data for enhanced extraction
) {
  logger.info(
    `[Crawler][${jobId}] Will attempt to extract metadata from page ...`,
  );
  const meta = await metascraperParser({
    url,
    html: htmlContent,
    // We don't want to validate the URL again as we've already done it by visiting the page.
    // This was added because URL validation fails if the URL ends with a question mark (e.g. empty query params).
    validateUrl: false,
    ...(apifyData && { apifyData }), // Pass Apify data if available
  });
  logger.info(`[Crawler][${jobId}] Done extracting metadata from the page.`);
  return meta;
}

function extractReadableContent(
  htmlContent: string,
  url: string,
  jobId: string,
) {
  logger.info(
    `[Crawler][${jobId}] Will attempt to extract readable content ...`,
  );
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(htmlContent, { url, virtualConsole });
  const readableContent = new Readability(dom.window.document).parse();
  if (!readableContent || typeof readableContent.content !== "string") {
    return null;
  }

  const window = new JSDOM("").window;
  const purify = DOMPurify(window);
  const purifiedHTML = purify.sanitize(readableContent.content);

  logger.info(`[Crawler][${jobId}] Done extracting readable content.`);
  return {
    content: purifiedHTML,
    textContent: readableContent.textContent,
  };
}

async function storeScreenshot(
  screenshot: Buffer | undefined,
  userId: string,
  jobId: string,
) {
  if (!serverConfig.crawler.storeScreenshot) {
    logger.info(
      `[Crawler][${jobId}] Skipping storing the screenshot as per the config.`,
    );
    return null;
  }
  if (!screenshot) {
    logger.info(
      `[Crawler][${jobId}] Skipping storing the screenshot as it's empty.`,
    );
    return null;
  }
  const assetId = newAssetId();
  const contentType = "image/png";
  const fileName = "screenshot.png";
  await saveAsset({
    userId,
    assetId,
    metadata: { contentType, fileName },
    asset: screenshot,
  });
  logger.info(
    `[Crawler][${jobId}] Stored the screenshot as assetId: ${assetId}`,
  );
  return { assetId, contentType, fileName, size: screenshot.byteLength };
}

async function downloadAndStoreFile(
  url: string,
  userId: string,
  jobId: string,
  fileType: string,
  abortSignal: AbortSignal,
) {
  try {
    logger.info(`[Crawler][${jobId}] Downloading ${fileType} from "${url}"`);
    const response = await fetch(url, {
      signal: abortSignal,
    });
    if (!response.ok) {
      throw new Error(`Failed to download ${fileType}: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const assetId = newAssetId();

    const contentType = response.headers.get("content-type");
    if (!contentType) {
      throw new Error("No content type in the response");
    }

    await saveAsset({
      userId,
      assetId,
      metadata: { contentType },
      asset: Buffer.from(buffer),
    });

    logger.info(
      `[Crawler][${jobId}] Downloaded ${fileType} as assetId: ${assetId}`,
    );

    return { assetId, userId, contentType, size: buffer.byteLength };
  } catch (e) {
    logger.error(
      `[Crawler][${jobId}] Failed to download and store ${fileType}: ${e}`,
    );
    return null;
  }
}

async function downloadAndStoreImage(
  url: string,
  userId: string,
  jobId: string,
  abortSignal: AbortSignal,
) {
  if (!serverConfig.crawler.downloadBannerImage) {
    logger.info(
      `[Crawler][${jobId}] Skipping downloading the image as per the config.`,
    );
    return null;
  }
  return downloadAndStoreFile(url, userId, jobId, "image", abortSignal);
}

async function archiveWebpage(
  html: string,
  url: string,
  userId: string,
  jobId: string,
  abortSignal: AbortSignal,
) {
  logger.info(`[Crawler][${jobId}] Will attempt to archive page ...`);
  const assetId = newAssetId();
  const assetPath = `/tmp/${assetId}`;

  await execa({
    input: html,
    cancelSignal: abortSignal,
  })("monolith", ["-", "-Ije", "-t", "5", "-b", url, "-o", assetPath]);

  const contentType = "text/html";

  await saveAssetFromFile({
    userId,
    assetId,
    assetPath,
    metadata: {
      contentType,
    },
  });

  logger.info(
    `[Crawler][${jobId}] Done archiving the page as assetId: ${assetId}`,
  );

  return {
    assetId,
    contentType,
    size: await getAssetSize({ userId, assetId }),
  };
}

async function getContentType(
  url: string,
  jobId: string,
  abortSignal: AbortSignal,
): Promise<string | null> {
  try {
    logger.info(
      `[Crawler][${jobId}] Attempting to determine the content-type for the url ${url}`,
    );
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.any([AbortSignal.timeout(5000), abortSignal]),
    });
    const contentType = response.headers.get("content-type");
    logger.info(
      `[Crawler][${jobId}] Content-type for the url ${url} is "${contentType}"`,
    );
    return contentType;
  } catch (e) {
    logger.error(
      `[Crawler][${jobId}] Failed to determine the content-type for the url ${url}: ${e}`,
    );
    return null;
  }
}

/**
 * Downloads the asset from the URL and transforms the linkBookmark to an assetBookmark
 * @param url the url the user provided
 * @param assetType the type of the asset we're downloading
 * @param userId the id of the user
 * @param jobId the id of the job for logging
 * @param bookmarkId the id of the bookmark
 */
async function handleAsAssetBookmark(
  url: string,
  assetType: "image" | "pdf",
  userId: string,
  jobId: string,
  bookmarkId: string,
  abortSignal: AbortSignal,
) {
  const downloaded = await downloadAndStoreFile(
    url,
    userId,
    jobId,
    assetType,
    abortSignal,
  );
  if (!downloaded) {
    return;
  }
  const fileName = path.basename(new URL(url).pathname);
  await db.transaction(async (trx) => {
    await updateAsset(
      undefined,
      {
        id: downloaded.assetId,
        bookmarkId,
        userId,
        assetType: AssetTypes.BOOKMARK_ASSET,
        contentType: downloaded.contentType,
        size: downloaded.size,
        fileName,
      },
      trx,
    );
    await trx.insert(bookmarkAssets).values({
      id: bookmarkId,
      assetType,
      assetId: downloaded.assetId,
      content: null,
      fileName,
      sourceUrl: url,
    });
    // Switch the type of the bookmark from LINK to ASSET
    await trx
      .update(bookmarks)
      .set({ type: BookmarkTypes.ASSET })
      .where(eq(bookmarks.id, bookmarkId));
    await trx.delete(bookmarkLinks).where(eq(bookmarkLinks.id, bookmarkId));
  });
  await AssetPreprocessingQueue.enqueue({
    bookmarkId,
    fixMode: false,
  });
}

async function crawlAndParseUrl(
  url: string,
  userId: string,
  jobId: string,
  bookmarkId: string,
  oldScreenshotAssetId: string | undefined,
  oldImageAssetId: string | undefined,
  oldFullPageArchiveAssetId: string | undefined,
  precrawledArchiveAssetId: string | undefined,
  archiveFullPage: boolean,
  abortSignal: AbortSignal,
) {
  let result: {
    htmlContent: string;
    screenshot: Buffer | undefined;
    statusCode: number | null;
    url: string;
  };

  if (precrawledArchiveAssetId) {
    logger.info(
      `[Crawler][${jobId}] The page has been precrawled. Will use the precrawled archive instead.`,
    );
    const asset = await readAsset({
      userId,
      assetId: precrawledArchiveAssetId,
    });
    result = {
      htmlContent: asset.asset.toString(),
      screenshot: undefined,
      statusCode: 200,
      url,
    };
  } else {
    result = await crawlPage(jobId, url, abortSignal);
  }
  abortSignal.throwIfAborted();

  const { htmlContent, screenshot, statusCode, url: browserUrl } = result;

  const [meta, readableContent, screenshotAssetInfo] = await Promise.all([
    extractMetadata(htmlContent, browserUrl, jobId),
    extractReadableContent(htmlContent, browserUrl, jobId),
    storeScreenshot(screenshot, userId, jobId),
  ]);
  abortSignal.throwIfAborted();
  let imageAssetInfo: DBAssetType | null = null;
  if (meta.image) {
    const downloaded = await downloadAndStoreImage(
      meta.image,
      userId,
      jobId,
      abortSignal,
    );
    if (downloaded) {
      imageAssetInfo = {
        id: downloaded.assetId,
        bookmarkId,
        userId,
        assetType: AssetTypes.LINK_BANNER_IMAGE,
        contentType: downloaded.contentType,
        size: downloaded.size,
      };
    }
  }
  abortSignal.throwIfAborted();

  const parseDate = (date: string | undefined) => {
    if (!date) {
      return null;
    }
    try {
      return new Date(date);
    } catch {
      return null;
    }
  };

  // TODO(important): Restrict the size of content to store
  await db.transaction(async (txn) => {
    await txn
      .update(bookmarkLinks)
      .set({
        title: meta.title,
        description: meta.description,
        // Don't store data URIs as they're not valid URLs and are usually quite large
        imageUrl: meta.image?.startsWith("data:") ? null : meta.image,
        favicon: meta.logo,
        content: readableContent?.textContent,
        htmlContent: readableContent?.content,
        crawledAt: new Date(),
        crawlStatusCode: statusCode,
        author: meta.author,
        publisher: meta.publisher,
        datePublished: parseDate(meta.datePublished),
        dateModified: parseDate(meta.dateModified),
      })
      .where(eq(bookmarkLinks.id, bookmarkId));

    if (screenshotAssetInfo) {
      await updateAsset(
        oldScreenshotAssetId,
        {
          id: screenshotAssetInfo.assetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.LINK_SCREENSHOT,
          contentType: screenshotAssetInfo.contentType,
          size: screenshotAssetInfo.size,
          fileName: screenshotAssetInfo.fileName,
        },
        txn,
      );
    }
    if (imageAssetInfo) {
      await updateAsset(oldImageAssetId, imageAssetInfo, txn);
    }
  });

  // Delete the old assets if any
  await Promise.all([
    silentDeleteAsset(userId, oldScreenshotAssetId),
    silentDeleteAsset(userId, oldImageAssetId),
  ]);

  return async () => {
    if (
      !precrawledArchiveAssetId &&
      (serverConfig.crawler.fullPageArchive || archiveFullPage)
    ) {
      const {
        assetId: fullPageArchiveAssetId,
        size,
        contentType,
      } = await archiveWebpage(
        htmlContent,
        browserUrl,
        userId,
        jobId,
        abortSignal,
      );

      await db.transaction(async (txn) => {
        await updateAsset(
          oldFullPageArchiveAssetId,
          {
            id: fullPageArchiveAssetId,
            bookmarkId,
            userId,
            assetType: AssetTypes.LINK_FULL_PAGE_ARCHIVE,
            contentType,
            size,
            fileName: null,
          },
          txn,
        );
      });
      if (oldFullPageArchiveAssetId) {
        silentDeleteAsset(userId, oldFullPageArchiveAssetId);
      }
    }
  };
}

/**
 * Enhanced X.com crawling using Apify
 */
async function crawlXComWithApify(
  url: string,
  userId: string,
  jobId: string,
  _bookmarkId: string,
  _abortSignal: AbortSignal,
) {
  if (!ApifyService.isEnabled()) {
    logger.warn(
      `[Crawler][${jobId}] Apify is not enabled, falling back to regular crawling`,
    );
    return null;
  }

  try {
    logger.info(`[Crawler][${jobId}] Using Apify to scrape X.com URL: ${url}`);

    const apifyService = new ApifyService();
    const apifyResult = await apifyService.scrapeXUrl(url);

    if (!apifyResult) {
      logger.warn(
        `[Crawler][${jobId}] Apify returned no results for URL: ${url}`,
      );
      return null;
    }

    logger.info(
      `[Crawler][${jobId}] Successfully scraped X.com content via Apify`,
    );

    return apifyResult;
  } catch (error) {
    logger.error(
      `[Crawler][${jobId}] Failed to scrape X.com URL with Apify: ${error}`,
    );
    // Return null to allow fallback to regular crawling
    return null;
  }
}

/**
 * Process Apify results and update bookmark
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function processApifyResult(
  apifyData: ProcessedXContent,
  url: string,
  userId: string,
  jobId: string,
  bookmarkId: string,
  abortSignal: AbortSignal,
) {
  logger.info(
    `[Crawler][${jobId}] Processing Apify results for bookmark ${bookmarkId}`,
  );

  try {
    // Create a minimal HTML structure for compatibility
    const htmlContent =
      apifyData.htmlContent ||
      `
      <html>
        <head>
          <title>${escapeHtml(apifyData.title || "X Post")}</title>
          <meta property="og:title" content="${escapeHtml(apifyData.title || "")}" />
          <meta property="og:description" content="${escapeHtml(apifyData.content || "")}" />
          <meta property="og:image" content="${escapeHtml(apifyData.authorProfilePic || "")}" />
          <meta name="author" content="${escapeHtml(apifyData.author || "")}" />
        </head>
        <body>
          <div class="x-post">
            ${escapeHtml(apifyData.content || "")}
          </div>
        </body>
      </html>
    `;

    // Extract metadata using the enhanced metascraper with Apify data
    const meta = await extractMetadata(htmlContent, url, jobId, apifyData);

    // Use Apify content for readable text
    const readableContent = apifyData.content || "";

    // Handle media if present
    let imageAssetInfo: DBAssetType | null = null;
    if (apifyData.media && apifyData.media.length > 0) {
      // Use first image as the main image
      const firstImage = apifyData.media.find(
        (m: NonNullable<ProcessedXContent["media"]>[0]) => m.type === "image",
      );
      if (firstImage) {
        try {
          const downloaded = await downloadAndStoreImage(
            firstImage.url,
            userId,
            jobId,
            abortSignal,
          );
          if (downloaded) {
            imageAssetInfo = {
              id: downloaded.assetId,
              bookmarkId,
              userId,
              assetType: AssetTypes.LINK_BANNER_IMAGE,
              contentType: downloaded.contentType,
              size: downloaded.size,
            };
          }
        } catch (error) {
          logger.warn(
            `[Crawler][${jobId}] Failed to download image from Apify result: ${error}`,
          );
        }
      }
    }

    // Update the bookmark with extracted data in a transaction
    await db.transaction(async (txn) => {
      await txn
        .update(bookmarkLinks)
        .set({
          title: meta.title || apifyData.title,
          description: meta.description || apifyData.content,
          imageUrl: imageAssetInfo ? null : apifyData.authorProfilePic || null, // Use profile pic if no downloaded image
          content: readableContent,
          htmlContent: htmlContent,
          crawledAt: new Date(),
          author: meta.author || apifyData.author,
          publisher: meta.publisher || "X (formerly Twitter)",
          datePublished: apifyData.publishedAt || undefined,
        })
        .where(eq(bookmarkLinks.id, bookmarkId));

      // Update asset associations if we downloaded an image
      if (imageAssetInfo) {
        await updateAsset(undefined, imageAssetInfo, txn);
      }
    });

    logger.info(
      `[Crawler][${jobId}] Successfully processed Apify results for bookmark ${bookmarkId}`,
    );

    return true;
  } catch (error) {
    logger.error(
      `[Crawler][${jobId}] Failed to process Apify results: ${error}`,
    );
    throw error;
  }
}

async function runCrawler(job: DequeuedJob<ZCrawlLinkRequest>) {
  const jobId = job.id ?? "unknown";

  const request = zCrawlLinkRequestSchema.safeParse(job.data);
  if (!request.success) {
    logger.error(
      `[Crawler][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
    return;
  }

  const { bookmarkId, archiveFullPage } = request.data;
  const {
    url,
    userId,
    screenshotAssetId: oldScreenshotAssetId,
    imageAssetId: oldImageAssetId,
    fullPageArchiveAssetId: oldFullPageArchiveAssetId,
    precrawledArchiveAssetId,
  } = await getBookmarkDetails(bookmarkId);

  logger.info(
    `[Crawler][${jobId}] Will crawl "${url}" for link with id "${bookmarkId}"`,
  );
  validateUrl(url);

  const contentType = await getContentType(url, jobId, job.abortSignal);

  // Link bookmarks get transformed into asset bookmarks if they point to a supported asset instead of a webpage
  const isPdf = contentType === ASSET_TYPES.APPLICATION_PDF;

  if (isPdf) {
    await handleAsAssetBookmark(
      url,
      "pdf",
      userId,
      jobId,
      bookmarkId,
      job.abortSignal,
    );
  } else if (
    contentType &&
    IMAGE_ASSET_TYPES.has(contentType) &&
    SUPPORTED_UPLOAD_ASSET_TYPES.has(contentType)
  ) {
    await handleAsAssetBookmark(
      url,
      "image",
      userId,
      jobId,
      bookmarkId,
      job.abortSignal,
    );
  } else {
    // Check if URL is X.com and enhanced scraping is enabled
    if (isXComUrl(url) && ApifyService.isEnabled()) {
      try {
        const apifyResult = await crawlXComWithApify(
          url,
          userId,
          jobId,
          bookmarkId,
          job.abortSignal,
        );

        if (apifyResult) {
          // Use Apify result instead of regular crawling
          await processApifyResult(
            apifyResult,
            url,
            userId,
            jobId,
            bookmarkId,
            job.abortSignal,
          );

          // Skip the regular crawling and archival logic
          const archivalLogic = async () => {
            // No additional archival needed for Apify results
            logger.info(
              `[Crawler][${jobId}] Skipping archival for Apify-processed X.com content`,
            );
          };

          // Enqueue inference jobs (if not set, assume it's true for backward compatibility)
          if (job.data.runInference !== false) {
            await InferenceQueue.enqueue({
              bookmarkId,
              type: "tag",
              source: "crawler",
            });
            await InferenceQueue.enqueue({
              bookmarkId,
              type: "summarize",
              source: "crawler",
            });
            // Enhance description for better bookmark list display
            await InferenceQueue.enqueue({
              bookmarkId,
              type: "enhance-description",
              source: "crawler",
            });
          }

          // Update the search index
          await triggerSearchReindex(bookmarkId);

          // Trigger a webhook
          await triggerWebhook(bookmarkId, "crawled");

          // Do the archival as a separate last step (no-op for Apify results)
          await archivalLogic();

          return; // Exit early, we're done
        }
      } catch (error) {
        logger.error(
          `[Crawler][${jobId}] X.com Apify processing failed, falling back to regular crawling: ${error}`,
        );
        // Fall through to regular crawling
      }
    }

    // Regular crawling logic (for non-X.com URLs or when Apify fails)
    const archivalLogic = await crawlAndParseUrl(
      url,
      userId,
      jobId,
      bookmarkId,
      oldScreenshotAssetId,
      oldImageAssetId,
      oldFullPageArchiveAssetId,
      precrawledArchiveAssetId,
      archiveFullPage,
      job.abortSignal,
    );

    // Enqueue inference jobs (if not set, assume it's true for backward compatibility)
    if (job.data.runInference !== false) {
      await InferenceQueue.enqueue({
        bookmarkId,
        type: "tag",
        source: "crawler",
      });
      await InferenceQueue.enqueue({
        bookmarkId,
        type: "summarize",
        source: "crawler",
      });
      // Enhance description for better bookmark list display
      await InferenceQueue.enqueue({
        bookmarkId,
        type: "enhance-description",
        source: "crawler",
      });
    }

    // Update the search index
    await triggerSearchReindex(bookmarkId);

    // Trigger a potential download of a video from the URL
    await triggerVideoWorker(bookmarkId, url);

    // Trigger a webhook
    await triggerWebhook(bookmarkId, "crawled");

    // Do the archival as a separate last step as it has the potential for failure
    await archivalLogic();
  }
}
