/**
 * MIGRATION READINESS DETECTOR — Unit Tests
 *
 * Covers all five correctness cases required by the startup defect investigation:
 *   1. All migrations applied → ready: true
 *   2. Latest migration pending (committed but not in DB) → ready: false
 *   3. Failed migration (rolled_back_at IS NOT NULL) → ready: false
 *   4. Failed migration (finished_at IS NULL, in-progress/stalled) → ready: false
 *   5. Extra historical rows in DB (applied records not in committed dirs) → ready: true
 *      (extra rows are not a failure; only missing committed migrations matter)
 *   6. Migrations directory inaccessible (Vercel bundle gap) → fail-closed: ready: false
 *   7. DB unreachable → fail-closed: ready: false
 *
 * All tests use mocked filesystem and getDbInstance — no real DB required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs and @/lib/db before importing the module under test.
// Using vi.mock with a factory function ensures the mocks are hoisted.
vi.mock("fs", async () => {
  return {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn(),
  // Unit-level simplification: skip the real SET LOCAL statement_timeout
  // transaction wrapping (proven separately against real Postgres in
  // src/__tests__/lib/db-statement-timeout.db.test.ts) and just invoke the
  // callback with the same mocked client.
  withStatementTimeout: (prisma: unknown, _timeoutMs: number, fn: (tx: unknown) => unknown) => fn(prisma),
}));

// Import mocked modules for type-safe access to mock functions.
import * as fsMod from "fs";
import * as dbMod from "@/lib/db";

// Import after mocks are set up.
import { checkMigrationReadiness } from "@/services/monitoring/migration-check";

// Three committed migration directories used across tests.
const COMMITTED_DIRS = [
  { name: "20260101_init", isDirectory: () => true },
  { name: "20260201_add_workspace", isDirectory: () => true },
  { name: "20260301_add_snapshots", isDirectory: () => true },
];

function makeRow(
  migration_name: string,
  finished_at: Date | null = new Date(),
  rolled_back_at: Date | null = null
) {
  return { migration_name, finished_at, rolled_back_at };
}

function setupFs(dirs = COMMITTED_DIRS) {
  vi.mocked(fsMod.existsSync).mockReturnValue(true);
  vi.mocked(fsMod.readdirSync).mockReturnValue(
    dirs as unknown as ReturnType<typeof fsMod.readdirSync>
  );
}

function setupDb(rows: ReturnType<typeof makeRow>[]) {
  const mockPrisma = {
    $queryRawUnsafe: vi.fn().mockResolvedValue(rows),
  };
  vi.mocked(dbMod.getDbInstance).mockResolvedValue(
    mockPrisma as unknown as Awaited<ReturnType<typeof dbMod.getDbInstance>>
  );
  return mockPrisma;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkMigrationReadiness", () => {
  describe("Case 1: all committed migrations applied", () => {
    it("returns ready: true when every committed migration is applied", async () => {
      setupFs();
      setupDb([
        makeRow("20260101_init"),
        makeRow("20260201_add_workspace"),
        makeRow("20260301_add_snapshots"),
      ]);

      const result = await checkMigrationReadiness();

      expect(result.ready).toBe(true);
      expect(result.totalCommitted).toBe(3);
      expect(result.applied).toBe(3);
      expect(result.pending).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it("includes extra historical DB rows without failing", async () => {
      // Case 5: DB has more applied records than committed dirs (e.g. after a rollback/downgrade).
      // Extra rows are not committed migrations — they should not mark the check as failed.
      setupFs();
      setupDb([
        makeRow("20260101_init"),
        makeRow("20260201_add_workspace"),
        makeRow("20260301_add_snapshots"),
        makeRow("20241201_historical_record"), // extra; not in committed dirs
      ]);

      const result = await checkMigrationReadiness();

      expect(result.ready).toBe(true);
      expect(result.applied).toBe(3); // only committed ones counted as applied
      expect(result.pending).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe("Case 2: latest migration pending (committed, not yet applied)", () => {
    it("returns ready: false when a committed migration has no DB record", async () => {
      setupFs();
      setupDb([
        makeRow("20260101_init"),
        makeRow("20260201_add_workspace"),
        // 20260301_add_snapshots is committed but not in DB (pending)
      ]);

      const result = await checkMigrationReadiness();

      expect(result.ready).toBe(false);
      expect(result.pending).toBe(1);
      expect(result.applied).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe("Case 3: failed migration — rolled back", () => {
    it("returns ready: false when any migration has rolled_back_at set", async () => {
      setupFs();
      setupDb([
        makeRow("20260101_init"),
        makeRow("20260201_add_workspace", new Date(), new Date()), // rolled back
        makeRow("20260301_add_snapshots"),
      ]);

      const result = await checkMigrationReadiness();

      expect(result.ready).toBe(false);
      expect(result.failed).toBe(1);
    });
  });

  describe("Case 4: failed migration — in-progress or stalled (finished_at IS NULL)", () => {
    it("returns ready: false when any migration has finished_at null", async () => {
      setupFs();
      setupDb([
        makeRow("20260101_init"),
        makeRow("20260201_add_workspace", null, null), // in-progress / stalled
        makeRow("20260301_add_snapshots"),
      ]);

      const result = await checkMigrationReadiness();

      expect(result.ready).toBe(false);
      expect(result.failed).toBe(1);
    });
  });

  describe("Case 6: migrations directory not accessible (fail-closed)", () => {
    it("returns ready: false when existsSync returns false", async () => {
      vi.mocked(fsMod.existsSync).mockReturnValue(false);

      const result = await checkMigrationReadiness();

      expect(result.ready).toBe(false);
      expect(result.totalCommitted).toBe(0);
      expect(result.error).toContain("not accessible");
    });

    it("returns ready: false when readdirSync throws", async () => {
      vi.mocked(fsMod.existsSync).mockReturnValue(true);
      vi.mocked(fsMod.readdirSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const result = await checkMigrationReadiness();

      expect(result.ready).toBe(false);
      expect(result.error).toContain("not accessible");
    });
  });

  describe("Case 7: DB unreachable", () => {
    it("returns ready: false when getDbInstance rejects", async () => {
      setupFs();
      vi.mocked(dbMod.getDbInstance).mockRejectedValue(
        new Error("Cannot connect to database")
      );

      const result = await checkMigrationReadiness();

      expect(result.ready).toBe(false);
      expect(result.totalCommitted).toBe(3);
      expect(result.applied).toBe(0);
      expect(result.error).toContain("Cannot connect to database");
    });

    it("returns ready: false when $queryRawUnsafe throws", async () => {
      setupFs();
      const mockPrisma = {
        $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("relation _prisma_migrations does not exist")),
      };
      vi.mocked(dbMod.getDbInstance).mockResolvedValue(
        mockPrisma as unknown as Awaited<ReturnType<typeof dbMod.getDbInstance>>
      );

      const result = await checkMigrationReadiness();

      expect(result.ready).toBe(false);
      expect(result.error).toContain("_prisma_migrations does not exist");
    });
  });

  describe("Edge case: zero committed migrations", () => {
    it("returns ready: true when there are no committed migrations", async () => {
      vi.mocked(fsMod.existsSync).mockReturnValue(true);
      vi.mocked(fsMod.readdirSync).mockReturnValue([]); // empty migrations dir

      const result = await checkMigrationReadiness();

      expect(result.ready).toBe(true);
      expect(result.totalCommitted).toBe(0);
      expect(result.applied).toBe(0);
      expect(result.pending).toBe(0);
    });
  });

  describe("applied/pending/failed counts are accurate", () => {
    it("correctly counts across a mixed state with multiple issues", async () => {
      // 3 committed: init, workspace, snapshots
      setupFs();
      setupDb([
        makeRow("20260101_init"),
        // 20260201_add_workspace is missing → pending
        makeRow("20260301_add_snapshots", null, null), // stalled → failed
        makeRow("20260401_extra", new Date(), new Date()), // rolled_back → failed (extra)
      ]);

      const result = await checkMigrationReadiness();

      expect(result.ready).toBe(false);
      expect(result.totalCommitted).toBe(3);
      expect(result.applied).toBe(1); // only init applied
      expect(result.pending).toBe(2); // workspace + snapshots not applied
      expect(result.failed).toBe(2); // snapshots (stalled) + extra (rolled_back)
    });
  });
});
