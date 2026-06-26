/**
 * Module 6 — per-service economics persistence proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true with the owner_service_economics
 * migration applied. Proves real round-trip + workspace isolation through the
 * service + Prisma client. No FK, so arbitrary workspace UUIDs are used.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-finance/service-economics.db.test.ts
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { saveServiceEconomics, listServiceEconomics } from "@/services/owner-finance/service-economics.service";

const wsA = randomUUID();
const wsB = randomUUID();

afterAll(async () => {
  await db.ownerServiceEconomics.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
});

describe("[db][module6] owner service economics persistence", () => {
  it("persists and reads back a computed record (round-trip)", async () => {
    const computed = await saveServiceEconomics(
      { workspaceId: wsA, serviceLine: "wash", segment: "retail", orders: [{ revenue: 1000, labourCost: 200, materialCost: 150, deliveryCost: 50 }], usage: { labourHours: 4 }, createdByUserId: randomUUID() },
      undefined
    );
    expect(computed.contributionMargin).toBe(600);

    const rows = await listServiceEconomics(wsA);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const wash = rows.find((r) => r.serviceLine === "wash");
    expect(wash?.contributionMargin).toBe(600);
    expect(wash?.profitPerLabourHour).toBeCloseTo(150, 5);
    expect(wash?.lossMaking).toBe(false);
  });

  it("enforces workspace isolation", async () => {
    await saveServiceEconomics({ workspaceId: wsA, serviceLine: "dryclean", orders: [{ revenue: 500, labourCost: 100 }] });
    const wsBRows = await listServiceEconomics(wsB);
    expect(wsBRows.every((r) => r.serviceLine !== "dryclean")).toBe(true);
  });

  it("persists a loss-making flag", async () => {
    await saveServiceEconomics({ workspaceId: wsB, serviceLine: "express", orders: [{ revenue: 300, labourCost: 200, materialCost: 150 }] });
    const rows = await listServiceEconomics(wsB);
    expect(rows.find((r) => r.serviceLine === "express")?.lossMaking).toBe(true);
  });
});
