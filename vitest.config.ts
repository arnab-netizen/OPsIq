import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Excluded from test runs:
    // - *.integration.test.ts (requires database)
    // - *.placeholder.test.ts (empty/broken test files pending removal)
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/*.integration.test.ts",
      "**/*.placeholder.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
