import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db, getDbInstance } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * Phase 6A F2 — owner dashboard KPI delegate: investigated and CLEARED (false positive).
 *
 * The hostile audit flagged `db.KPI.findMany(...)` in `src/app/api/owner/dashboard/route.ts` as a
 * raw-500 defect on the theory that the generated Prisma delegate is `db.kPI` and `db.KPI` is
 * `undefined`. Adversarial DB testing DISPROVED that theory: the extended Prisma client exposes BOTH
 * `KPI` and `kPI` as working delegates, so `db.KPI.findMany(...)` succeeds against a real database on
 * both the Proxy's cold (deferred) path and its hot (post-init, production) path. There is no 500.
 *
 * This test locks in that verified truth so the false positive cannot be re-opened, and it keeps real
 * DB coverage of the exact KPI query the owner dashboard route runs.
 *
 * DB-backed; gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Phase 6A F2 — owner dashboard KPI delegate resolves (false positive cleared)",
  () => {
    const stamp = randomUUID().substring(0, 8);
    const workspaceId = randomUUID();
    const clientId = randomUUID();
    const engagementId = randomUUID();
    const kpiId = randomUUID();

    beforeAll(async () => {
      await db.workspace.create({ data: { id: workspaceId, name: "P6A F2 WS", slug: `p6a-f2-${stamp}` } });
      await db.clientAccount.create({
        data: { id: clientId, name: "P6A F2 Client", workspaceId, updatedAt: new Date() },
      });
      await db.engagement.create({
        data: {
          id: engagementId,
          code: `P6A-F2-${stamp}`,
          title: "P6A F2 Engagement",
          clientId,
          serviceTier: "standard",
          engagementMode: "advisory",
          workspaceId,
          updatedAt: new Date(),
        },
      });
      await db.KPI.create({
        data: { id: kpiId, engagementId, name: "Revenue", updatedAt: new Date() },
      });
    });

    afterAll(async () => {
      try {
        await db.KPI.deleteMany({ where: { engagementId } });
        await db.engagement.deleteMany({ where: { id: engagementId } });
        await db.clientAccount.deleteMany({ where: { id: clientId } });
        await db.workspace.deleteMany({ where: { id: workspaceId } });
      } catch {
        // best-effort cleanup
      }
    });

    it("[db] disproves the audit theory: the real client exposes BOTH KPI and kPI delegates (fast path)", async () => {
      // Force full init so globalForPrisma.prisma is set → db.* now takes the production fast path.
      const client = (await getDbInstance()) as unknown as Record<string, unknown>;
      expect(client.KPI).toBeDefined();
      expect(client.kPI).toBeDefined();
      expect((db as unknown as Record<string, unknown>).KPI).toBeDefined();
    });

    it("[db] the dashboard KPI query (db.KPI, as the route runs it) returns the workspace KPI", async () => {
      // Exactly the query the route runs — proves no raw 500.
      const kpis = await db.KPI.findMany({
        where: { engagementId: { in: [engagementId] } },
        include: { engagement: { select: { id: true } } },
      });
      expect(kpis.some((k) => k.id === kpiId)).toBe(true);
      expect(kpis[0].engagement.id).toBe(engagementId);
    });
  }
);
