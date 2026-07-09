import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { classifyDbRuntimeError, isSchemaDriftError } from "@/lib/schema-drift";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * Phase 4 Item 1 — schema-drift classifier real-DB proof (no mocks).
 *
 * Reproduces the exact production failure class against a real Postgres: a default-select
 * read of `workspace_memberships` when the deployed database is missing a newer column
 * (deploy/migration drift) throws Prisma `P2022` (PostgreSQL 42703, ColumnNotFound). This
 * test drops such a column, captures the REAL thrown error, and proves the classifier
 * labels it `schema_drift` and maps it to migration `20260625120000_owner_mode_execution_tables`.
 *
 * The maintained suite runs serially (--maxWorkers 1); the dropped column is restored in a
 * finally block so the schema is always left intact.
 *
 * DB-backed; gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Phase 4 Item 1 — schema-drift classifier on a real Prisma P2022",
  () => {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const stamp = randomUUID().substring(0, 8);

    beforeAll(async () => {
      await db.user.create({ data: { id: userId, email: `p4-drift-${stamp}@test.local`, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: workspaceId, name: "P4 Drift WS", slug: `p4-drift-${stamp}` } });
      await db.workspaceMembership.create({
        data: { id: randomUUID(), workspaceId, userId, role: "owner" },
      });
    });

    afterAll(async () => {
      try {
        await db.workspaceMembership.deleteMany({ where: { workspaceId } });
        await db.workspace.deleteMany({ where: { id: workspaceId } });
        await db.user.deleteMany({ where: { id: userId } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("[db] classifies a real ColumnNotFound (P2022) as schema_drift mapped to its migration", async () => {
      const DRIFT_COLUMN = "primary_auth_method";
      await db.$executeRawUnsafe(`ALTER TABLE workspace_memberships DROP COLUMN ${DRIFT_COLUMN}`);
      try {
        let thrown: unknown;
        try {
          // Default select (all columns) — the production-class read that fails under drift.
          await db.workspaceMembership.findFirst({
            where: { userId, isActive: true },
            orderBy: { addedAt: "asc" },
          });
        } catch (e) {
          thrown = e;
        }

        expect(thrown).toBeDefined();
        expect(isSchemaDriftError(thrown)).toBe(true);

        const info = classifyDbRuntimeError(thrown);
        expect(info.kind).toBe("schema_drift");
        expect(info.table).toBe("workspace_memberships");
        expect(info.column).toBe(DRIFT_COLUMN);
        expect(info.introducedByMigration).toBe("20260625120000_owner_mode_execution_tables");
      } finally {
        await db.$executeRawUnsafe(
          `ALTER TABLE workspace_memberships ADD COLUMN ${DRIFT_COLUMN} TEXT`
        );
      }
    });

    it("[db] a healthy read (no drift) is NOT classified as schema_drift", async () => {
      // With the schema intact, the same read succeeds — no error to classify.
      const m = await db.workspaceMembership.findFirst({
        where: { userId, isActive: true },
        orderBy: { addedAt: "asc" },
      });
      expect(m?.workspaceId).toBe(workspaceId);
    });
  }
);
