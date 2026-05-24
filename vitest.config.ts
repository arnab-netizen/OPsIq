import { defineConfig } from "vitest/config";
import path from "path";

const testWithDb = process.env.TEST_WITH_DB === "true";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./vitest-global-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/*.integration.test.ts",
      "**/*.placeholder.test.ts",
      "**/__ignored_tests__/**",
      ...(testWithDb ? [] : [
        "src/__tests__/runtime-proof/**", // Runtime proof tests require database
        "src/__tests__/phase-*/**", // Phase tests (phase-a through phase-i) require database
        "src/__tests__/phase-3-*.test.ts", // Phase-3 database dependency tests
        "src/__tests__/services/notifications/**", // Notification service requires persistence
        "src/__tests__/domain/**/*.integration.test.ts", // Integration tests require database
      ]),
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Filter tests: exclude DB-dependent tests unless TEST_WITH_DB=true
    ...(testWithDb ? {} : {
      testNamePattern: /^(?!.*\[db\]).*$/
    }),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
