# Agent Analysis — Last updated: 2025-10-15

This is an living document that provides context on the current codebase, including recent actions and areas or activities of note, including potential issues or constraints.

## Documentation Reviewed

- `README.md` — product positioning, feature surface, stack overview.
- Legacy `CLAUDE.md` material (now merged below) — July 2025 migration notes from `better-sqlite3` to `@libsql/client`, plus dev workflow checks.
- `docs/README.md` & `docs/SECURITY_TESTS.md` — Docusaurus site commands and security/performance regression suite.
- `kubernetes/README.md`, `CONTRIBUTING.md`, `SECURITY.md` — deployment and policy context.

## Architecture & Entry Points

- **Web App** (`apps/web`): Next.js 14 App Router with PWA wrapper (`apps/web/next.config.mjs`); authentication via NextAuth (`apps/web/server/auth.ts`) and TRPC endpoints (`apps/web/app/api/trpc/[trpc]/route.ts`). API requests flow through `createContextFromRequest` (`apps/web/server/api/client.ts`) to share DB/session context.
- **API Layer** (`packages/api`): Hono server composed in `packages/api/index.ts`, exposing REST surfaces (`routes/*.ts`) and reusing TRPC context via `trpcAdapter` middleware.
- **Workers** (`apps/workers/index.ts`): Background queue consumers for crawling, inference, search indexing, feeds, video archiving, rules, and webhooks. Queues defined with liteque in `packages/shared/queues.ts` (SQLite-backed).
- **Shared Packages**: `packages/shared/config.ts` centralizes env validation/defaults; `packages/trpc` provides routers (e.g. `routers/bookmarks.ts`) and auth helpers; `packages/db` holds Drizzle schema and libSQL connector (`drizzle.ts`).
- **Clients & Tooling**: CLI (`apps/cli/src/index.ts`) via Commander, MCP server (`apps/mcp`), browser extension (`apps/browser-extension`), Expo mobile app (`apps/mobile`), and TypeScript SDK (`packages/sdk`).

## Backend Patterns & Data

- Database access via Drizzle ORM over libSQL (`packages/db/drizzle.ts`), with schema co-located in `packages/db/schema.ts` and migrations under `packages/db/drizzle`.
- Business logic organized in TRPC routers (`packages/trpc/routers`). Procedures enforce auth via `authedProcedure` / `adminProcedure` and share validation using `zod` DTOs from `packages/shared/types`.
- Background jobs queued with liteque (`packages/shared/queues.ts`), persisted in `data/queue.db`. Workers orchestrate inference providers (OpenAI, Gemini, Ollama) via `packages/shared/inference.ts`, asset processing, search sync (`packages/shared/search.ts`), and rule engine triggers.
- REST API mirrors TRPC behavior by bridging Hono handlers to router calls, ensuring consistent validation (`packages/api/middlewares/trpcAdapter.ts`).

## Frontend Patterns & State

- Next.js app uses the shadcn/ui catalog (`apps/web/components.json`) on top of Radix primitives; Tailwind config comes from the shared preset (`tooling/tailwind/web.ts`).
- Client data flows through TanStack Query and TRPC React hooks (`packages/shared-react/trpc.ts`), with lightweight Zustand stores for local UI state (e.g. `apps/web/lib/store/useSortOrderStore.ts`).
- App router segments under `apps/web/app` (e.g. `dashboard`, `admin`, `settings`) pair server components with route handlers for downloads/export (`app/api/bookmarks/export/route.tsx`).
- PWA behavior enabled via `next-pwa`. TypeScript config extends the workspace base for strict mode while suppressing build-time enforcement in production builds (see `apps/web/next.config.mjs`).

## Performance, Security & Observability

- Winston logger (`packages/shared/logger.ts`) centralizes console/file logging, with dedicated auth-failure log rotation tied to `DATA_DIR`.
- Config schema enforces environment sanity (timeouts, feature flags, inference provider selection) and provides safe defaults (`packages/shared/config.ts`).
- Security hardening documented in `docs/SECURITY_TESTS.md`, covering API key timing attacks, path traversal, transaction safety, pagination limits, and batch processing race conditions. API key management leverages bcrypt plus timing-safe comparisons (`packages/trpc/auth.ts`).
- Meilisearch integration (`packages/shared/search.ts`) auto-configures index settings. Inference client factory routes between OpenAI, Gemini, and Ollama providers with configurable timeouts (`packages/shared/inference.ts`).

## Quality Gates & Tooling

- Root scripts (`package.json`) delegate to Turborepo for `build`, `dev`, `lint`, `format`, and `typecheck`. `CLAUDE.md` mandates running `pnpm typecheck`, `pnpm format --check`, `pnpm lint`, and `pnpm exec sherif` before commits.
- Security regression runner `./run-security-tests.sh` fans out to Vitest specs across packages (`packages/trpc`, `packages/shared`, `apps/workers`).
- Shared lint/format configs live under `tooling/` (oxlint presets, Prettier config, Tailwind theme, TypeScript base config).

## Deployment & Ops

- `start-dev.sh` provisions Meilisearch and headless Chrome via Docker, ensures migrations run, and boots web + workers with environment validation (absolute `DATA_DIR`).
- Container builds and compose manifests under `docker/`; Helm/Kustomize assets under `charts/` and `kubernetes/` with a simplified README.
- Docusaurus docs site resides in `docs/`, with workspace inclusion via `pnpm-workspace.yaml`.

## Recent Git Themes

- `989f32b2` — feat/phase1-security-stability-fixes: Phase 2 security enhancements (pagination, API key validation) aligned with the security test suite.
- `0bef9ae9` — fix: implement Phase 1 security and stability fixes: earlier hardening groundwork.
- `6b0f8755` — fix: quality gate failures: ensures lint/type/test alignment post-hardening.

## LibSQL Migration (July 2025)

### Background
- Observed "Transaction function cannot return a promise" failures after upgrading to Node.js v22.
- better-sqlite3 requires synchronous transactions; the codebase relies heavily on `async`/`await` within Drizzle transactions.

### Root Cause
- Structural mismatch between Drizzle ORM’s better-sqlite3 adapter and asynchronous transaction handlers, impacting signin and other DB operations.

### Migration Summary
- Swapped dependencies to `@libsql/client` in `packages/db/package.json`.
- Updated `packages/db/drizzle.ts` to use `drizzle-orm/libsql`, `createClient`, and the new migrator import.
- Normalised `.changes` → `.rowsAffected` usage, refreshed transaction typings, and fixed migration script imports across dependent files.
- Adjusted `start-dev.sh` to drop sqlite3 CLI checks and rely on file-size verification.

### Benefits
- Async transactions fully supported; transaction errors resolved.
- Minimal surface-area changes (database layer only) with backward-compatible SQLite files.
- Improved performance characteristics under async workloads and optional remote libSQL support.

### Testing Notes
- Validated signin/signup/bookmark flows against both fresh and legacy databases.
- Existing better-sqlite3 databases remain compatible post-migration.

### Future Considerations
- libSQL’s roadmap enables potential remote deployments; document rollout before production use.
- Capture migration guidance in broader developer onboarding material when external contributors join.

### Related Work & Environment
- X.com scraping work lives on `feat/drizzle-with-x-scrape`; revisit after libSQL stability proves out.
- Dev environment: Node.js v22, pnpm, Docker-driven Meilisearch + headless Chrome services.

### Commit Workflow
- Run `pnpm typecheck`, `pnpm format --check`, `pnpm lint`, and `pnpm exec sherif` before committing.

## Notable Considerations

- Demo mode blocks TRPC mutations (`packages/trpc/index.ts`); feature work must respect this guard.
- Queues rely on `DATA_DIR`; ensure migrations and file permissions are honored in new environments.
- Next.js build ignores type errors in CI to favor speed; rely on `pnpm typecheck` for enforcement before merging.
- Inference features require at least one provider credential; autodetection logic sets default model names based on the configured provider.
