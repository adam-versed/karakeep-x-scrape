import { eq } from "drizzle-orm";
import { DequeuedJob, Runner } from "liteque";

import type { ZInferenceRequest } from "@karakeep/shared/queues";
import { db } from "@karakeep/db";
import { bookmarks } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import { InferenceClientFactory } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import {
  InferenceQueue,
  zInferenceRequestSchema,
} from "@karakeep/shared/queues";

import { descriptionBatchCollector } from "./descriptionBatchCollector";
import { runDescriptionEnhancement } from "./descriptionEnhancement";
import { runSummarization } from "./summarize";
import { runTagging } from "./tagging";

async function attemptMarkStatus(
  jobData: object | undefined,
  status: "success" | "failure",
) {
  if (!jobData) {
    return;
  }
  try {
    const request = zInferenceRequestSchema.parse(jobData);

    // Skip status updates for description enhancement - it's a fire-and-forget operation
    if (request.type === "enhance-description") {
      return;
    }

    await db
      .update(bookmarks)
      .set({
        ...(request.type === "summarize"
          ? { summarizationStatus: status }
          : {}),
        ...(request.type === "tag" ? { taggingStatus: status } : {}),
      })
      .where(eq(bookmarks.id, request.bookmarkId));
  } catch (e) {
    logger.error(
      `Something went wrong when marking the inference status: ${e}`,
    );
  }
}

export class InferenceWorker {
  static build() {
    logger.info("Starting inference worker ...");
    const worker = new Runner<ZInferenceRequest>(
      InferenceQueue,
      {
        run: runInference,
        onComplete: async (job) => {
          const jobId = job.id;
          logger.info(`[inference][${jobId}] Completed successfully`);
          await attemptMarkStatus(job.data, "success");
        },
        onError: async (job) => {
          const jobId = job.id;
          logger.error(
            `[inference][${jobId}] inference job failed: ${job.error}\n${job.error.stack}`,
          );
          if (job.numRetriesLeft == 0) {
            await attemptMarkStatus(job?.data, "failure");
          }
        },
      },
      {
        concurrency: 1,
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.inference.jobTimeoutSec,
      },
    );

    return worker;
  }
}

async function runInference(job: DequeuedJob<ZInferenceRequest>) {
  const jobId = job.id;

  const inferenceClient = InferenceClientFactory.build();
  if (!inferenceClient) {
    logger.debug(
      `[inference][${jobId}] No inference client configured, nothing to do now`,
    );
    return;
  }

  const request = zInferenceRequestSchema.safeParse(job.data);
  if (!request.success) {
    throw new Error(
      `[inference][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
  }

  const { bookmarkId } = request.data;
  switch (request.data.type) {
    case "summarize":
      await runSummarization(bookmarkId, job, inferenceClient);
      break;
    case "tag":
      await runTagging(bookmarkId, job, inferenceClient);
      break;
    case "enhance-description": {
      // Check if batch processing is enabled and route accordingly
      const source = request.data.source || "crawler";

      if (
        serverConfig.batchDescriptionEnhancement.enabled &&
        source !== "api"
      ) {
        // Add to batch collector instead of processing immediately
        await descriptionBatchCollector.addBookmark(bookmarkId, source);
        logger.info(
          `[inference][${jobId}] Added bookmark ${bookmarkId} to batch collector (source: ${source})`,
        );
      } else {
        // Process individually (API sources or batch disabled)
        await runDescriptionEnhancement(bookmarkId, job, inferenceClient);
      }
      break;
    }
    default:
      throw new Error(`Unknown inference type: ${request.data.type}`);
  }
}
