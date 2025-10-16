import { eq, inArray } from "drizzle-orm";
import { DequeuedJob } from "liteque";
import { z } from "zod";

import type { InferenceClient } from "@karakeep/shared/inference";
import type { ZInferenceDescriptionBatchRequest } from "@karakeep/shared/queues";
import { db } from "@karakeep/db";
import { bookmarkLinks, bookmarks } from "@karakeep/db/schema";
import logger from "@karakeep/shared/logger";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

const batchResponseSchema = z.object({
  descriptions: z.record(z.string(), z.string().max(100)),
});

interface BookmarkForEnhancement {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  content: string | null;
  author: string | null;
  publisher: string | null;
  tags: string[];
}

async function fetchBookmarksForEnhancement(
  bookmarkIds: string[],
): Promise<BookmarkForEnhancement[]> {
  const bookmarksData = await db.query.bookmarks.findMany({
    where: inArray(bookmarks.id, bookmarkIds),
    with: {
      link: true,
      tagsOnBookmarks: {
        with: {
          tag: true,
        },
      },
    },
  });

  return bookmarksData
    .filter((b) => b.type === BookmarkTypes.LINK && b.link)
    .map((b) => ({
      id: b.id,
      url: b.link!.url,
      title: b.link!.title,
      description: b.link!.description,
      content: b.link!.htmlContent,
      author: b.link!.author,
      publisher: b.link!.publisher,
      tags: b.tagsOnBookmarks.map((t) => t.tag.name),
    }));
}

function buildBatchPrompt(bookmarksToEnhance: BookmarkForEnhancement[]) {
  const bookmarkData = bookmarksToEnhance.map((bookmark) => {
    const isXPost =
      bookmark.url.includes("x.com") || bookmark.url.includes("twitter.com");

    return {
      id: bookmark.id,
      url: bookmark.url,
      title: bookmark.title || "",
      author: bookmark.author || "",
      publisher: bookmark.publisher || "",
      currentDescription: bookmark.description || "",
      tags: bookmark.tags.join(", ") || "No tags",
      isXPost,
      contentPreview: (
        bookmark.content?.substring(0, 300) ||
        bookmark.description ||
        ""
      ).trim(),
    };
  });

  return `Generate neutral, factual descriptions (MAXIMUM 100 characters each) for these bookmarks:

${JSON.stringify(bookmarkData, null, 2)}

Requirements:
1. Start directly with the product/topic name - no prefixes like "Announcement of", "Post about", etc.
2. Use "like" not "based" when comparing to other tools (e.g., "Figma-like" not "Figma-based")
3. Be completely neutral and objective - no promotional language
4. Focus on what the content IS, not what it does or claims to do
5. Avoid words like "revolutionize", "amazing", "best", exclamation marks
6. Use factual, descriptive language
7. CRITICAL: Keep each description under 100 characters total
8. For X posts: Focus on the topic being discussed, not who posted it
9. Return ALL bookmark IDs, even if you can't generate a good description

Examples:
- Bad: "Announcement of MagicPath, a Figma-based design tool"
- Good: "MagicPath, a Figma-like AI design tool with chat interface"

Return JSON: {"descriptions": {"bookmarkId1": "description1", "bookmarkId2": "description2", ...}}
Include an entry for EVERY bookmark ID provided, even if the description is minimal.`;
}

export async function runBatchDescriptionEnhancement(
  batchRequest: ZInferenceDescriptionBatchRequest,
  job: DequeuedJob<ZInferenceDescriptionBatchRequest>,
  inferenceClient: InferenceClient,
) {
  const jobId = job.id;
  const { bookmarkIds, source } = batchRequest;

  logger.info(
    `[inference][${jobId}] Starting batch description enhancement for ${bookmarkIds.length} bookmarks (source: ${source})`,
  );

  try {
    // Fetch all bookmarks
    const bookmarksToEnhance = await fetchBookmarksForEnhancement(bookmarkIds);

    if (bookmarksToEnhance.length === 0) {
      logger.warn(
        `[inference][${jobId}] No link bookmarks found in batch of ${bookmarkIds.length} bookmarks`,
      );
      return;
    }

    logger.info(
      `[inference][${jobId}] Processing ${bookmarksToEnhance.length} link bookmarks out of ${bookmarkIds.length} total`,
    );

    // Build batch prompt
    const prompt = buildBatchPrompt(bookmarksToEnhance);

    // Call inference API
    const response = await inferenceClient.inferFromText(prompt, {
      schema: batchResponseSchema,
      abortSignal: job.abortSignal,
    });

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(response.response);
    } catch (parseError) {
      logger.error(
        `[inference][${jobId}] Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
      );
      throw new Error("Invalid JSON response from inference API");
    }

    // Validate and clean descriptions
    const cleanedDescriptions: Record<string, string> = {};
    for (const [bookmarkId, description] of Object.entries(
      parsedResponse.descriptions,
    )) {
      if (typeof description === "string") {
        // Truncate if needed
        const cleanedDesc =
          description.length > 100
            ? description.substring(0, 100).trim()
            : description.trim();

        if (cleanedDesc.length > 0) {
          cleanedDescriptions[bookmarkId] = cleanedDesc;
        }
      }
    }

    const result = batchResponseSchema.parse({
      descriptions: cleanedDescriptions,
    });

    logger.info(
      `[inference][${jobId}] Generated ${Object.keys(result.descriptions).length} descriptions out of ${bookmarksToEnhance.length} bookmarks (used ${response.totalTokens} tokens)`,
    );

    // Update all bookmarks with their descriptions in a transaction
    await db.transaction(async (tx) => {
      for (const [bookmarkId, description] of Object.entries(result.descriptions)) {
        await tx
          .update(bookmarkLinks)
          .set({ description })
          .where(eq(bookmarkLinks.id, bookmarkId));
      }
    });

    // Log missing descriptions
    const missingIds = bookmarksToEnhance
      .map((b) => b.id)
      .filter((id) => !result.descriptions[id]);

    if (missingIds.length > 0) {
      logger.warn(
        `[inference][${jobId}] Failed to generate descriptions for ${missingIds.length} bookmarks: ${missingIds.join(", ")}`,
      );
    }

    logger.info(
      `[inference][${jobId}] Successfully updated ${Object.keys(result.descriptions).length} bookmark descriptions`,
    );
  } catch (error) {
    // Handle rate limiting and quota errors gracefully
    if (error instanceof Error && error.message.includes("429")) {
      logger.warn(
        `[inference][${jobId}] Rate limited by API for batch of ${bookmarkIds.length} bookmarks, skipping batch enhancement`,
      );
      return; // Skip this job, don't throw error
    }

    if (
      error instanceof Error &&
      (error.message.includes("quota") || error.message.includes("exhausted"))
    ) {
      logger.warn(
        `[inference][${jobId}] API quota exhausted for batch of ${bookmarkIds.length} bookmarks, skipping batch enhancement`,
      );
      return; // Skip this job, don't throw error
    }

    logger.error(
      `[inference][${jobId}] Failed to enhance descriptions for batch of ${bookmarkIds.length} bookmarks: ${error}`,
    );
    throw error;
  }
}
