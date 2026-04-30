import { vi, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Configure test environment
(process.env as any).NODE_ENV = "test";
(process.env as any).VITEST = "true";

// Configure test database path
const TEST_DB_PATH = path.resolve(__dirname, "test.db");
const TEST_DB_DIR = path.dirname(TEST_DB_PATH);

if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
  (process.env as any).DATABASE_URL = `file:${TEST_DB_PATH}`;
  (process.env as any).TEST_DATABASE_URL = `file:${TEST_DB_PATH}`;
}

// Ensure test directory exists
if (!fs.existsSync(TEST_DB_DIR)) {
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
}

// Mock global fetch for Next.js compatibility
if (!globalThis.fetch) {
  globalThis.fetch = vi.fn();
}

// Mock timers to prevent test timeouts
vi.useFakeTimers({ shouldAdvanceTime: false });

// Clear all mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});
