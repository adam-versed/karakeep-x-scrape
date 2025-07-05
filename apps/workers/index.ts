import "dotenv/config";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { runQueueDBMigrations } from "@karakeep/shared/queues";

import { shutdownPromise } from "./exit";
import { AssetPreprocessingWorker } from "./workers/assetPreprocessingWorker";
import { CrawlerWorker } from "./workers/crawlerWorker";
import { FeedRefreshingWorker, FeedWorker } from "./workers/feedWorker";
import { descriptionBatchCollector } from "./workers/inference/descriptionBatchCollector";
import { DescriptionBatchWorker } from "./workers/inference/descriptionBatchWorker";
import { InferenceWorker } from "./workers/inference/inferenceWorker";
import { RuleEngineWorker } from "./workers/ruleEngineWorker";
import { SearchIndexingWorker } from "./workers/searchWorker";
import { TidyAssetsWorker } from "./workers/tidyAssetsWorker";
import { VideoWorker } from "./workers/videoWorker";
import { WebhookWorker } from "./workers/webhookWorker";

async function main() {
  logger.info(`Workers version: ${serverConfig.serverVersion ?? "not set"}`);
  runQueueDBMigrations();

  const [
    crawler,
    inference,
    descriptionBatch,
    search,
    tidyAssets,
    video,
    feed,
    assetPreprocessing,
    webhook,
    ruleEngine,
  ] = [
    await CrawlerWorker.build(),
    InferenceWorker.build(),
    DescriptionBatchWorker.build(),
    SearchIndexingWorker.build(),
    TidyAssetsWorker.build(),
    VideoWorker.build(),
    FeedWorker.build(),
    AssetPreprocessingWorker.build(),
    WebhookWorker.build(),
    RuleEngineWorker.build(),
  ];
  FeedRefreshingWorker.start();

  await Promise.any([
    Promise.all([
      crawler.run(),
      inference.run(),
      descriptionBatch.run(),
      search.run(),
      tidyAssets.run(),
      video.run(),
      feed.run(),
      assetPreprocessing.run(),
      webhook.run(),
      ruleEngine.run(),
    ]),
    shutdownPromise,
  ]);
  logger.info(
    "Shutting down crawler, inference, descriptionBatch, tidyAssets, video, feed, assetPreprocessing, webhook, ruleEngine and search workers ...",
  );

  FeedRefreshingWorker.stop();

  // Ensure any pending batches are flushed before stopping
  await descriptionBatchCollector.shutdown();

  crawler.stop();
  inference.stop();
  descriptionBatch.stop();
  search.stop();
  tidyAssets.stop();
  video.stop();
  feed.stop();
  assetPreprocessing.stop();
  webhook.stop();
  ruleEngine.stop();
}

main();
