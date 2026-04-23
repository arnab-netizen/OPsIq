import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

// Load test environment variables
const loadEnv = () => {
  const envPath = path.resolve(__dirname, ".env.test");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const lines = envContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      if (key) {
        const value = valueParts.join("=").replace(/^"(.*)"$/, "$1").trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
};

loadEnv();

// Generate SQLite Prisma client for tests if using SQLite
const generateTestClient = () => {
  const dbUrl = process.env.DATABASE_URL || "";
  if (dbUrl.startsWith("file:")) {
    console.log("Generating SQLite Prisma client for tests...");
    try {
      const testSchemaPath = path.resolve(__dirname, "prisma/schema.test.prisma");
      // Generate without pushing to DB (that happens in setup.ts)
      execSync(`npx prisma generate --schema ${testSchemaPath}`, {
        stdio: "pipe",
      });
      console.log("SQLite Prisma client generated");
    } catch (error) {
      console.warn("Warning: Could not generate SQLite Prisma client. Tests may fail.");
    }
  }
};

generateTestClient();

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globalSetup: ["src/__tests__/global-setup.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
