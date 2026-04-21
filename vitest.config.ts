import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      DATABASE_PROVIDER: "sqlite",
      DATABASE_URL: "file:./prisma/test.db",
      NODE_ENV: "test",
    },
  },
});
