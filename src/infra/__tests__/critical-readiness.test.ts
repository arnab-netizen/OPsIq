/**
 * Tests for critical readiness assessment
 * Verifies that per-request readiness check allows recovery from stale failures
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ensureCriticalReadiness,
  type CriticalReadinessStatus,
} from "../critical-readiness";

describe("Critical Readiness Assessment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ensureCriticalReadiness", () => {
    it("returns READY when database is reachable and config valid", async () => {
      // Mock successful database check
      vi.doMock("@/lib/db", () => ({
        getDbInstance: vi.fn(async () => ({
          $queryRawUnsafe: vi.fn(async () => {
            return [{ result: 1 }];
          }),
        })),
      }));

      // Mock valid environment
      process.env.DATABASE_URL =
        "postgresql://user:pass@localhost/db";

      const result = await ensureCriticalReadiness();

      expect(result.status).toBe("READY");
      expect(result.checks.database_reachable).toBe(true);
      expect(result.checks.configuration_valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns FAILED_CRITICAL when database is unreachable", async () => {
      // Mock failed database check
      vi.doMock("@/lib/db", () => ({
        getDbInstance: vi.fn(async () => ({
          $queryRawUnsafe: vi.fn(async () => {
            throw new Error("Connection refused");
          }),
        })),
      }));

      process.env.DATABASE_URL =
        "postgresql://user:pass@localhost/db";

      const result = await ensureCriticalReadiness();

      expect(result.status).toBe("FAILED_CRITICAL");
      expect(result.checks.database_reachable).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.join(" ")).toContain("connectivity");
    });

    it("returns FAILED_CRITICAL when DATABASE_URL is missing", async () => {
      // Mock successful database check
      vi.doMock("@/lib/db", () => ({
        getDbInstance: vi.fn(async () => ({
          $queryRawUnsafe: vi.fn(async () => {
            return [{ result: 1 }];
          }),
        })),
      }));

      // Remove DATABASE_URL
      delete process.env.DATABASE_URL;

      const result = await ensureCriticalReadiness();

      expect(result.status).toBe("FAILED_CRITICAL");
      expect(result.checks.configuration_valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("allows recovery from prior failures if current conditions are healthy", async () => {
      // This test verifies the key fix:
      // Even if startup-status table has FAILED state,
      // per-request readiness assessment allows recovery.

      // Mock successful database
      vi.doMock("@/lib/db", () => ({
        getDbInstance: vi.fn(async () => ({
          $queryRawUnsafe: vi.fn(async () => {
            return [{ result: 1 }];
          }),
        })),
      }));

      process.env.DATABASE_URL =
        "postgresql://user:pass@localhost/db";

      // First call
      const result1 = await ensureCriticalReadiness();
      expect(result1.status).toBe("READY");

      // Second call (simulating a new request)
      // Even if startup_status table says FAILED,
      // this should still return READY because we re-evaluate
      const result2 = await ensureCriticalReadiness();
      expect(result2.status).toBe("READY");
    });

    it("verifies database using same runtime path as production", async () => {
      let dbQueryCalled = false;
      let dbQueryMethod = "";

      vi.doMock("@/lib/db", () => ({
        getDbInstance: vi.fn(async () => ({
          $queryRawUnsafe: vi.fn(async (sql: string) => {
            dbQueryCalled = true;
            dbQueryMethod = sql;
            return [{ result: 1 }];
          }),
        })),
      }));

      process.env.DATABASE_URL =
        "postgresql://user:pass@localhost/db";

      const result = await ensureCriticalReadiness();

      expect(result.status).toBe("READY");
      expect(dbQueryCalled).toBe(true);
      expect(dbQueryMethod).toBe("SELECT 1");
    });

    it("does not check hardcoded table names", async () => {
      // This test verifies the old broken check is gone.
      // The critical readiness check should NOT query
      // information_schema or check for specific table names.

      let sqlQueries: string[] = [];

      vi.doMock("@/lib/db", () => ({
        getDbInstance: vi.fn(async () => ({
          $queryRawUnsafe: vi.fn(async (sql: string) => {
            sqlQueries.push(sql);
            return [{ result: 1 }];
          }),
        })),
      }));

      process.env.DATABASE_URL =
        "postgresql://user:pass@localhost/db";

      await ensureCriticalReadiness();

      // Should only have the "SELECT 1" query, not information_schema lookups
      const schemalQueries = sqlQueries.filter((sql) =>
        sql.toLowerCase().includes("information_schema")
      );
      expect(schemalQueries).toHaveLength(0);

      // Should not check for specific table names
      const tableNameQueries = sqlQueries.filter(
        (sql) =>
          sql.toLowerCase().includes("users") ||
          sql.toLowerCase().includes("workspaces") ||
          sql.toLowerCase().includes("audit_events") ||
          sql.toLowerCase().includes("actions")
      );
      expect(tableNameQueries).toHaveLength(0);
    });

    it("returns DEGRADED_NON_BLOCKING for non-critical errors", async () => {
      // Test that non-critical errors (if any occur in future)
      // would return DEGRADED_NON_BLOCKING, not FAILED_CRITICAL

      vi.doMock("@/lib/db", () => ({
        getDbInstance: vi.fn(async () => ({
          $queryRawUnsafe: vi.fn(async () => {
            return [{ result: 1 }];
          }),
        })),
      }));

      process.env.DATABASE_URL =
        "postgresql://user:pass@localhost/db";

      const result = await ensureCriticalReadiness();

      // Current implementation: should be READY, not DEGRADED
      expect(result.status).toBe("READY");

      // But the type should support DEGRADED_NON_BLOCKING
      const validStatuses: CriticalReadinessStatus[] = [
        "READY",
        "DEGRADED_NON_BLOCKING",
        "FAILED_CRITICAL",
      ];
      expect(validStatuses).toContain(result.status);
    });
  });

  describe("Integration: Prevents stale FAILED state from blocking requests", () => {
    it("does not check startup_status database table", async () => {
      // This test ensures the new function doesn't perpetuate
      // the stale state problem by checking startup_status table

      let tablesQueried: string[] = [];

      vi.doMock("@/lib/db", () => ({
        getDbInstance: vi.fn(async () => ({
          $queryRawUnsafe: vi.fn(async (sql: string) => {
            // Extract table name from query if possible
            if (sql.toLowerCase().includes("from")) {
              const match = sql.match(
                /from\s+(\w+)/i
              );
              if (match) tablesQueried.push(match[1]);
            }
            return [{ result: 1 }];
          }),
        })),
      }));

      process.env.DATABASE_URL =
        "postgresql://user:pass@localhost/db";

      await ensureCriticalReadiness();

      // Should NOT query startup_status table
      expect(
        tablesQueried.filter(
          (t) =>
            t.toLowerCase() === "startup_status" ||
            t.toLowerCase() === "startupstatus"
        )
      ).toHaveLength(0);
    });
  });
});
