# Security Hardening Implementation Plan

Last updated: 2025-10-15

This phased plan tracks the remaining hardening work after Phase 1 and Phase 2 landed in commits `0bef9ae9` and `989f32b2`. Each task is represented with a checkbox so we can mark progress as changes merge.

## Phase 3 – Immediate Worker Guardrails (local runtime)

- [x] **Queue lifecycle integrity** – update `apps/workers/workers/tidyAssetsWorker.ts` so the job awaits `handleAsset(...)` (or batches promises) before reporting success, guaranteeing filesystem/DB changes complete under the job’s retry policy.
- [x] **Batch preservation** – extend `apps/workers/workers/inference/descriptionBatchCollector.ts` to retry or requeue bookmark IDs when `InferenceDescriptionBatchQueue.enqueue` fails, preventing silent loss of crawler-generated description jobs.
- [x] **Crawler payload limits** – enforce HTML/content byte caps and reuse `validateUrlForSSRF` (plus max content-length checks) for secondary asset fetches in `apps/workers/workers/crawlerWorker.ts`, mitigating large-response exhaustion even in local mode.
- [x] **Feed import atomicity** – wrap bookmark creation + `rssFeedImportsTable` writes in a transaction (or add a targeted retry queue) inside `apps/workers/workers/feedWorker.ts` so GUID imports cannot orphan rows when bookmark creation fails.

## Phase 4 – Reliability & Performance Enhancements

- [ ] Consolidate list/tag statistics queries in `packages/trpc/routers/lists.ts` to avoid per-list size roundtrips; prefer an aggregated SQL query.
- [ ] Refactor `Bookmark.loadMulti` in `packages/trpc/models/bookmarks.ts` to reduce multi-join fan-out and prepare for larger datasets.
- [ ] Add download size/time guards and telemetry around crawler asset fetches (`downloadAndStoreFile`), surfacing repeated failures for follow-up.

## Phase 5 – Public-Facing Readiness

- [ ] Move sensitive API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, etc.) out of raw env consumption in `packages/shared/config.ts` into a managed secret store with rotation hooks.
- [ ] Implement automated secret rotation playbooks and document operational runbooks in `docs/SECURITY_TESTS.md`.
- [ ] Expand SSRF/governance coverage to any future outbound integrations (Convex, PostHog) before cloud deployment.

---

_Tracking note: update this file as tasks ship or reprioritize._
