import { DequeuedJob, Runner } from "liteque";

import type { ZInferenceDescriptionBatchRequest } from "@karakeep/shared/queues";
import serverConfig from "@karakeep/shared/config";
import { InferenceClientFactory } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import {
  InferenceDescriptionBatchQueue,
  zInferenceDescriptionBatchRequestSchema,
} from "@karakeep/shared/queues";

import { runBatchDescriptionEnhancement } from "./descriptionBatchEnhancement";

export class DescriptionBatchWorker {
  static build() {
    logger.info("Starting description batch worker ...");
    const worker = new Runner<ZInferenceDescriptionBatchRequest>(
      InferenceDescriptionBatchQueue,
      {
        run: runBatchInference,
        onComplete: async (job) => {
          const jobId = job.id;
          logger.info(`[batch-inference][${jobId}] Completed successfully`);
        },
        onError: async (job) => {
          const jobId = job.id;
          logger.error(
            `[batch-inference][${jobId}] Batch job failed: ${job.error}\n${job.error.stack}`,
          );
        },
      },
      {
        concurrency: 1, // Process one batch at a time to avoid overwhelming the API
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.inference.jobTimeoutSec * 2, // Double timeout for batches
      },
    );

    return worker;
  }
}

async function runBatchInference(
  job: DequeuedJob<ZInferenceDescriptionBatchRequest>,
) {
  const jobId = job.id;

  const inferenceClient = InferenceClientFactory.build();
  if (!inferenceClient) {
    logger.debug(
      `[batch-inference][${jobId}] No inference client configured, nothing to do now`,
    );
    return;
  }

  const request = zInferenceDescriptionBatchRequestSchema.safeParse(job.data);
  if (!request.success) {
    throw new Error(
      `[batch-inference][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
  }

  await runBatchDescriptionEnhancement(request.data, job, inferenceClient);
}
