/// <reference types="vitest" />

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    alias: {
      "@/*": "./*",
    },
    // Fail fast and avoid hanging workers
    bail: 1,
    testTimeout: 30_000,
    hookTimeout: 20_000,
    teardownTimeout: 10_000,
    pool: "threads",
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 1,
      },
    },
    deps: {
      // TODO: this need to be fixed
      inline: ["liteque"],
    },
  },
});
