import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

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

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
