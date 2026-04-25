import { vi } from "vitest";

if (process.env.NODE_ENV === "test" && !process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
  process.env.TEST_DATABASE_URL = "file:./test.db";
}
