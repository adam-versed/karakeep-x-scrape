# Session Notes — 2025-10-15

- Repo-wide Prettier/oxlint debt prevents `pnpm format --check` and `pnpm lint` from passing. We limited fixes to touched files; a dedicated cleanup pass is still required to restore green quality gates.
- Added temporary logging in `packages/trpc/testUtils.ts` and a global 30s Vitest timeout to diagnose long-running database tests (remove logs once the slowdown is solved).
 
# Session Notes — 2025-10-16

- Completed quality-gate remediation items documented in `docs/build/quality-gate-issues.md` for workers, trpc, and shared packages.
- Replaced unsafe `any` usage with typed alternatives, added type guards, removed unused imports, and refactored a test setup to avoid CommonJS `require`.
- Fixed Drizzle `and/or` typing by composing conditions and only assigning when defined (avoids `as any`).
- Verified: `pnpm lint` and `pnpm typecheck` are green; staged-file quality gate via `lint-staged` also passes and formatted modified files.
