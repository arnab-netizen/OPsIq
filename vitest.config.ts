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
        "**/*.db.test.ts", // DB-backed suites run only under TEST_WITH_DB=true (postgres:16 lane); skip in non-DB lanes
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
