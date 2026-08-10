import { defineConfig } from "vitest/config";
import path from "path";

const testWithDb = process.env.TEST_WITH_DB === "true";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./vitest-global-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/owner-mode/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/*.integration.test.ts",
      "**/*.placeholder.test.ts",
      "**/__ignored_tests__/**",
      ...(testWithDb ? [] : [
        "**/runtime-proof/**",
        "**/phase-*.test.ts", // Exclude phase tests (have implicit DB dependencies via enforceRequest)
      ]),
    ],
    testTimeout: 120000,
    hookTimeout: 120000,
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
