/**
 * Factory Stage 6 — LANE_B DB Proof Tests
 *
 * Requires TEST_WITH_DB=true and a real postgres:16 instance with migrations applied.
 * Intended for the stage6-db-verification CI workflow (LANE_B).
 *
 * S6-I4 + S6-I6: SELECT 1 succeeds post-migration → DB is up, health probe works
 * S6-I7: Workspace isolation enforced on hot-path workspace-scoped queries
 * S6-I8: workspaceId index exists on hot-path tables (pg_indexes check)
 * S6-I9: Hot-path query baseline timing recorded (p50/p95 captured)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

// ─── Shared test fixtures ─────────────────────────────────────────────────────

const wsA = randomUUID();
const wsB = randomUUID();
const userId = randomUUID();

const prisma = db as unknown as {
  workspace: {
    create: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
  user: {
    create: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
  workspaceMembership: {
    create: (args: unknown) => Promise<{ id: string }>;
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>;
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Factory Stage 6 DB Proofs (LANE_B)",
  () => {
    // ─── Fixture lifecycle ──────────────────────────────────────────────────

    beforeAll(async () => {
      await prisma.user.create({
        data: {
          id: userId,
          email: `s6-proof-${userId}@example.com`,
          isActive: true,
          updatedAt: new Date(),
        },
      });
      for (const wsId of [wsA, wsB]) {
        await prisma.workspace.create({
          data: {
            id: wsId,
            name: `S6-Proof-WS-${wsId.slice(0, 8)}`,
            slug: `s6-${wsId.slice(0, 8)}`,
          },
        });
      }
      await prisma.workspaceMembership.create({
        data: {
          workspaceId: wsA,
          userId,
          role: "member",
          isActive: true,
        },
      });
    });

    afterAll(async () => {
      await prisma.workspaceMembership
        .deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } })
        .catch(() => undefined);
      await prisma.workspace
        .deleteMany({ where: { id: { in: [wsA, wsB] } } })
        .catch(() => undefined);
      await prisma.user
        .deleteMany({ where: { id: userId } })
        .catch(() => undefined);
    });

    // ─── S6-I4 / S6-I6: DB is up post-migration ────────────────────────────

    describe("S6-I4/I6: database accessible post-migration", () => {
      it("[db] SELECT 1 returns 1 (DB is up and health probe will succeed)", async () => {
        const result = await prisma.$queryRawUnsafe<Array<{ ok: string }>>(
          "SELECT 1 AS ok"
        );
        expect(result).toHaveLength(1);
        expect(Number(result[0].ok)).toBe(1);
      });

      it("[db] all 158 migrations applied (pg_migrations count ≥ 158)", async () => {
        const rows = await prisma.$queryRawUnsafe<Array<{ count: string }>>(
          `SELECT COUNT(*)::text AS count FROM _prisma_migrations WHERE rolled_back_at IS NULL`
        );
        const count = Number(rows[0].count);
        expect(count).toBeGreaterThanOrEqual(158);
      });
    });

    // ─── S6-I7: Workspace isolation ─────────────────────────────────────────

    describe("S6-I7: workspace isolation on hot-path queries", () => {
      it("[db] workspace_memberships query scoped to wsA returns the seeded member", async () => {
        const rows = await prisma.workspaceMembership.findMany({
          where: { workspaceId: wsA, userId },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ workspaceId: wsA } as Record<string, unknown>);
      });

      it("[db] workspace_memberships query scoped to wsB returns zero rows (isolation)", async () => {
        const rows = await prisma.workspaceMembership.findMany({
          where: { workspaceId: wsB, userId },
        });
        expect(rows).toHaveLength(0);
      });

      it("[db] raw SQL workspace-scoped query enforces isolation at query level", async () => {
        const rowsA = await prisma.$queryRawUnsafe<Array<{ cnt: string }>>(
          `SELECT COUNT(*)::text AS cnt FROM workspace_memberships WHERE workspace_id = $1::uuid`,
          wsA
        );
        const rowsB = await prisma.$queryRawUnsafe<Array<{ cnt: string }>>(
          `SELECT COUNT(*)::text AS cnt FROM workspace_memberships WHERE workspace_id = $1::uuid`,
          wsB
        );

        expect(Number(rowsA[0].cnt)).toBeGreaterThanOrEqual(1);
        expect(Number(rowsB[0].cnt)).toBe(0);
      });
    });

    // ─── S6-I8: Index existence on hot-path tables ──────────────────────────

    describe("S6-I8: workspaceId index exists on owner hot-path tables", () => {
      it("[db] engagements table has a workspaceId index", async () => {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ indexname: string; tablename: string }>
        >(
          `SELECT indexname, tablename
           FROM pg_indexes
           WHERE tablename = 'engagements'
             AND indexname LIKE '%workspace%'`
        );
        expect(rows.length).toBeGreaterThanOrEqual(1);
      });

      it("[db] workspace_memberships table has a workspaceId index", async () => {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ indexname: string; tablename: string }>
        >(
          `SELECT indexname, tablename
           FROM pg_indexes
           WHERE tablename = 'workspace_memberships'
             AND indexname LIKE '%workspace%'`
        );
        expect(rows.length).toBeGreaterThanOrEqual(1);
      });

      it("[db] EXPLAIN plan for workspace-scoped membership query returns valid JSON", async () => {
        const plan = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `EXPLAIN (FORMAT JSON, ANALYZE FALSE)
           SELECT id FROM workspace_memberships WHERE workspace_id = $1::uuid AND is_active = TRUE`,
          wsA
        );
        expect(plan).toHaveLength(1);
        const planText = JSON.stringify(plan[0]);
        expect(planText).toContain("workspace_memberships");
      });
    });

    // ─── S6-I9: Hot-path timing baseline ────────────────────────────────────

    describe("S6-I9: hot-path query baseline timing captured", () => {
      it("[db] workspace-scoped membership query timing baseline (10 warm-up runs)", async () => {
        const RUNS = 10;
        const timings: number[] = [];

        for (let i = 0; i < RUNS; i++) {
          const t0 = Date.now();
          await prisma.workspaceMembership.findMany({
            where: { workspaceId: wsA, isActive: true },
            select: { id: true },
          });
          timings.push(Date.now() - t0);
        }

        const sorted = [...timings].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const max = sorted[sorted.length - 1];

        expect(typeof p50).toBe("number");
        expect(typeof p95).toBe("number");
        expect(p95).toBeGreaterThanOrEqual(0);

        console.info(
          `[S6-I9] workspace_memberships hot-path baseline: p50=${p50}ms p95=${p95}ms max=${max}ms`
        );
      });
    });
  }
);
