/// <reference types="vitest" />

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    alias: { "@/*": "./*" },
    bail: 1,
    testTimeout: 30_000,
    hookTimeout: 20_000,
    teardownTimeout: 10_000,
    passWithNoTests: true,
    pool: "threads",
    poolOptions: { threads: { minThreads: 1, maxThreads: 1 } },
  },
});
