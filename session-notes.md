# Session Notes — 2025-10-15

- Repo-wide Prettier/oxlint debt prevents `pnpm format --check` and `pnpm lint` from passing. We limited fixes to touched files; a dedicated cleanup pass is still required to restore green quality gates.
- Added temporary logging in `packages/trpc/testUtils.ts` and a global 30s Vitest timeout to diagnose long-running database tests (remove logs once the slowdown is solved).
