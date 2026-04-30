import { defineConfig } from "vitest/config";
import path from "path";

const testWithDb = process.env.TEST_WITH_DB === "true";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/*.integration.test.ts",
      "**/*.placeholder.test.ts",
      "**/__ignored_tests__/**",
    ],
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
