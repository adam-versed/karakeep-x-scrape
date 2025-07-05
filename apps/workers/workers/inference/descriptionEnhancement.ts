import { eq } from "drizzle-orm";
import { DequeuedJob } from "liteque";
import { z } from "zod";

import type { InferenceClient } from "@karakeep/shared/inference";
import type { ZInferenceRequest } from "@karakeep/shared/queues";
import { db } from "@karakeep/db";
import { bookmarkLinks, bookmarks } from "@karakeep/db/schema";
import logger from "@karakeep/shared/logger";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

const descriptionResponseSchema = z.object({
  description: z.string().min(1).max(100),
});

async function fetchBookmarkForEnhancement(bookmarkId: string) {
  return await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: {
      link: true,
      text: true,
      asset: true,
      tagsOnBookmarks: {
        with: {
          tag: true,
        },
      },
    },
  });
}

function buildDescriptionPrompt(
  bookmark: NonNullable<
    Awaited<ReturnType<typeof fetchBookmarkForEnhancement>>
  >,
) {
  const tags = bookmark.tagsOnBookmarks.map((t) => t.tag.name).join(", ");

  if (bookmark.type === BookmarkTypes.LINK && bookmark.link) {
    const { title, description, content, url, author, publisher } =
      bookmark.link;

    // Check if this is an X.com post
    const isXPost = url.includes("x.com") || url.includes("twitter.com");

    return `Generate a neutral, factual description (MAXIMUM 100 characters - this is a hard limit) that objectively describes what this content is about.

URL: ${url}
Title: ${title || ""}
Author: ${author || ""}
Publisher: ${publisher || ""}
Current Description: ${description || ""}
Content Tags: ${tags || "No tags"}
${isXPost ? "Platform: X (formerly Twitter)" : ""}

Content Preview: ${content?.substring(0, 500) || description || ""}

Requirements:
1. Start directly with the product/topic name - no prefixes like "Announcement of", "Post about", etc.
2. Use "like" not "based" when comparing to other tools (e.g., "Figma-like" not "Figma-based")
3. Be completely neutral and objective - no promotional language  
4. Focus on what the content IS, not what it does or claims to do
5. Avoid words like "revolutionize", "amazing", "best", exclamation marks
6. Use factual, descriptive language
7. CRITICAL: Keep under 100 characters total - count carefully

Examples:
- Bad: "Announcement of MagicPath, a Figma-based design tool"
- Good: "MagicPath, a Figma-like AI design tool with chat interface"
- Bad: "Post about amazing new AI breakthrough!"  
- Good: "Research on large language model training techniques"

Respond with JSON: {"description": "your description here"}`;
  }

  if (bookmark.type === BookmarkTypes.TEXT && bookmark.text) {
    return `Generate a concise, informative description (max 100 chars) for this text note.

Content: ${bookmark.text.text?.substring(0, 500) || ""}
Tags: ${tags || "No tags"}

Requirements:
1. Summarize the main idea or purpose
2. Be specific about the content
3. Use natural language

Respond with JSON: {"description": "your description here"}`;
  }

  if (bookmark.type === BookmarkTypes.ASSET && bookmark.asset) {
    return `Generate a concise, informative description (max 100 chars) for this file.

File Name: ${bookmark.asset.fileName || "Unknown"}
Type: ${bookmark.asset.assetType}
Tags: ${tags || "No tags"}
${bookmark.asset.content ? `Content Preview: ${bookmark.asset.content.substring(0, 500)}` : ""}

Requirements:
1. Describe what the file contains
2. Be specific about the content type and purpose
3. Use natural language

Respond with JSON: {"description": "your description here"}`;
  }

  throw new Error("Unsupported bookmark type for description enhancement");
}

export async function runDescriptionEnhancement(
  bookmarkId: string,
  job: DequeuedJob<ZInferenceRequest>,
  inferenceClient: InferenceClient,
) {
  const jobId = job.id;

  const bookmark = await fetchBookmarkForEnhancement(bookmarkId);
  if (!bookmark) {
    throw new Error(
      `[inference][${jobId}] Bookmark with id ${bookmarkId} not found`,
    );
  }

  // Only enhance link bookmarks for now
  if (bookmark.type !== BookmarkTypes.LINK || !bookmark.link) {
    logger.info(
      `[inference][${jobId}] Skipping description enhancement for non-link bookmark ${bookmarkId}`,
    );
    return;
  }

  logger.info(
    `[inference][${jobId}] Starting description enhancement for bookmark ${bookmarkId}`,
  );

  try {
    const prompt = buildDescriptionPrompt(bookmark);
    const response = await inferenceClient.inferFromText(prompt, {
      schema: descriptionResponseSchema,
      abortSignal: job.abortSignal,
    });

    const parsedResponse = JSON.parse(response.response);

    // Handle case where AI generates description longer than 100 chars
    if (parsedResponse.description && parsedResponse.description.length > 100) {
      logger.warn(
        `[inference][${jobId}] Generated description too long (${parsedResponse.description.length} chars), truncating to 100`,
      );
      parsedResponse.description = parsedResponse.description
        .substring(0, 100)
        .trim();
    }

    const result = descriptionResponseSchema.parse(parsedResponse);

    logger.info(
      `[inference][${jobId}] Generated description for bookmark ${bookmarkId}: "${result.description}" (used ${response.totalTokens} tokens)`,
    );

    // Update the bookmark's description
    await db
      .update(bookmarkLinks)
      .set({
        description: result.description,
      })
      .where(eq(bookmarkLinks.id, bookmarkId));

    logger.info(
      `[inference][${jobId}] Successfully updated description for bookmark ${bookmarkId}`,
    );
  } catch (error) {
    // Handle rate limiting and quota errors gracefully
    if (error instanceof Error && error.message.includes("429")) {
      logger.warn(
        `[inference][${jobId}] Rate limited by Gemini API for bookmark ${bookmarkId}, skipping description enhancement`,
      );
      return; // Skip this job, don't throw error
    }

    if (
      error instanceof Error &&
      (error.message.includes("quota") || error.message.includes("exhausted"))
    ) {
      logger.warn(
        `[inference][${jobId}] API quota exhausted for bookmark ${bookmarkId}, skipping description enhancement`,
      );
      return; // Skip this job, don't throw error
    }

    logger.error(
      `[inference][${jobId}] Failed to enhance description for bookmark ${bookmarkId}: ${error}`,
    );
    throw error;
  }
}
