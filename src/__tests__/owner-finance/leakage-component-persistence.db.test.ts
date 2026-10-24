/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * D9 — the three leakage components are PERSISTED SEPARATELY and survive the whole boundary (`[db]`-gated).
 *
 * The defect these tests close: the service merged refund + rework + complaint into one `refundReworkCost` before it
 * persisted, so a stored snapshot could never prove which components the owner supplied and the leakage finding could never
 * become complete. Earlier proof fed all four components straight to the pure domain and so never crossed the boundary.
 * EVERY case here goes API input → createFinancialSnapshot / amendFinancialSnapshot → the real database row →
 * rowToFinanceInput → leakageCoverage / metrics (→ diagnosis for the user-visible finding).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-finance/leakage-component-persistence.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ValidationError } from "@/infra/errors";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { amendFinancialSnapshot, createFinancialSnapshot, rowToFinanceInput } from "@/services/owner-finance/snapshot.service";
import { LEAKAGE_COMPONENT_CONTRACT_V1 } from "@/services/owner-finance/leakage-components";
import { listFinanceCycleFindings, runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { leakageCoverage } from "@/domain/owner-finance/cost-model";
import { costLeakageRatioPct } from "@/domain/owner-finance/metrics";
import { financialSnapshotAmendSchema, financialSnapshotCreateSchema } from "@/domain/owner-finance/validation";

const actor = randomUUID();
const REVENUE = 100_000;
const PERIOD = { periodStart: "2026-09-01", periodEnd: "2026-09-30" };

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `d9-leakage-${actor}@example.com`, name: "D9 Leakage", isActive: true, updatedAt: new Date() },
  });
});

async function biz() {
  const workspaceId = randomUUID();
  const b = await createBusiness(
    { name: "D9 Leakage", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return { workspaceId, businessId: b.id as string };
}

type Components = { refundAmount?: number; reworkCost?: number; complaintCost?: number };

function createBody(c: Components, extra: Record<string, unknown> = {}) {
  // Parsed through the REAL create schema, as the API route does.
  return financialSnapshotCreateSchema.parse({
    ...PERIOD,
    currency: "INR",
    revenue: REVENUE,
    fixedCosts: 40_000,
    variableCosts: 30_000,
    cashOnHand: 20_000,
    discountAmount: 3_000,
    ...c,
    ...extra,
  });
}

const rowOf = (id: string) => db.ownerFinancialSnapshot.findFirstOrThrow({ where: { id } });
const sum = (...xs: (number | undefined)[]) => {
  const k = xs.filter((x): x is number => typeof x === "number");
  return k.length ? k.reduce((a, b) => a + b, 0) : null;
};

/** Insert a row the way the application did BEFORE the split: only the combined figure, no component columns, no marker. */
async function insertLegacyRow(workspaceId: string, businessId: string, refundReworkCost: number | null, discountAmount: number | null = 3_000) {
  const id = randomUUID();
  await db.ownerFinancialSnapshot.create({
    data: {
      id, workspaceId, businessId, periodStart: new Date(PERIOD.periodStart), periodEnd: new Date(PERIOD.periodEnd), currency: "INR",
      revenue: REVENUE, fixedCosts: 40_000, variableCosts: 30_000, cashOnHand: 20_000, discountAmount, refundReworkCost,
      dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date(),
    },
  });
  return id;
}

describe("[db] D9 leakage components — every refund/rework/complaint combination round-trips independently", () => {
  const KEYS = ["refundAmount", "reworkCost", "complaintCost"] as const;
  const VALUES: Record<(typeof KEYS)[number], number> = { refundAmount: 2_000, reworkCost: 1_000, complaintCost: 500 };
  const LABELS = { refundAmount: "refunds", reworkCost: "redone work", complaintCost: "complaint costs" } as const;

  // All 8 subsets of {refund, rework, complaint}: none, each single, each pair, all three — i.e. required cases 1–12.
  const subsets = Array.from({ length: 8 }, (_, mask) => KEYS.filter((_, i) => (mask >> i) & 1));

  for (const supplied of subsets) {
    const name = supplied.length === 0 ? "all three UNKNOWN" : `supplied: ${supplied.join(" + ")}`;
    it(`[db] ${name}`, async () => {
      const { workspaceId, businessId } = await biz();
      const comps: Components = {};
      for (const k of supplied) comps[k] = VALUES[k];

      const snap = await createFinancialSnapshot(businessId, createBody(comps), actor, workspaceId);
      const row = await rowOf(snap.id);

      // → database: each component is its own column; omitted stays NULL (never 0); the marker says so
      expect(row.leakageCompVersion).toBe(LEAKAGE_COMPONENT_CONTRACT_V1);
      for (const k of KEYS) expect(row[k]).toBe(supplied.includes(k) ? VALUES[k] : null);
      expect(row.refundReworkCost).toBe(sum(comps.refundAmount, comps.reworkCost, comps.complaintCost)); // compatibility aggregate only

      // → service read → finance domain
      const input = rowToFinanceInput(row);
      expect(input.legacyCombinedLeakage).toBeUndefined();
      for (const k of KEYS) expect(input[k]).toBe(supplied.includes(k) ? VALUES[k] : undefined);

      const cov = leakageCoverage(input);
      expect(cov.complete).toBe(supplied.length === 3);
      expect(cov.known).toEqual(["discounts", ...supplied.map((k) => LABELS[k])]);
      expect(cov.unknown).toEqual(KEYS.filter((k) => !supplied.includes(k)).map((k) => LABELS[k]));

      // the aggregate figure is exactly the known components over sales (a lower bound unless complete)
      const known = 3_000 + (sum(comps.refundAmount, comps.reworkCost, comps.complaintCost) ?? 0);
      expect(costLeakageRatioPct(input)).toBe(Math.round((known / REVENUE) * 1000) / 10);

      // → the user-visible finding: exact only when every component was supplied; otherwise a lower bound naming what is missing
      const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);
      const finding = (await listFinanceCycleFindings(cycle.id, workspaceId)).find((f: any) => f.code === "FIN_OPP_LEAKAGE_REDUCTION");
      expect(finding).toBeDefined();
      if (supplied.length === 3) {
        expect(finding!.missingData).toEqual([]);
        expect(finding!.summary).not.toMatch(/not entered yet|at least/i);
      } else {
        expect(finding!.missingData).toEqual(KEYS.filter((k) => !supplied.includes(k)).map((k) => LABELS[k]));
        expect(finding!.summary).toMatch(/at least/i);
        for (const k of KEYS.filter((x) => !supplied.includes(x))) expect(finding!.summary).toContain(LABELS[k]);
      }
      await teardownOwnerBusiness(businessId);
    });
  }

  it("[db] all four components an explicit ZERO is complete known evidence (a legitimate zero, never UNKNOWN)", async () => {
    const { workspaceId, businessId } = await biz();
    const snap = await createFinancialSnapshot(
      businessId,
      createBody({ refundAmount: 0, reworkCost: 0, complaintCost: 0 }, { discountAmount: 0 }),
      actor,
      workspaceId
    );
    const row = await rowOf(snap.id);
    expect([row.discountAmount, row.refundAmount, row.reworkCost, row.complaintCost]).toEqual([0, 0, 0, 0]); // 0 persisted as 0, not NULL
    expect(row.refundReworkCost).toBe(0);
    const input = rowToFinanceInput(row);
    expect(leakageCoverage(input)).toEqual({ known: ["discounts", "refunds", "redone work", "complaint costs"], unknown: [], complete: true });
    expect(costLeakageRatioPct(input)).toBe(0);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] every leakage figure UNKNOWN fabricates no aggregate and is never complete", async () => {
    const { workspaceId, businessId } = await biz();
    const snap = await createFinancialSnapshot(businessId, createBody({}, { discountAmount: undefined }), actor, workspaceId);
    const row = await rowOf(snap.id);
    expect([row.discountAmount, row.refundAmount, row.reworkCost, row.complaintCost, row.refundReworkCost]).toEqual([null, null, null, null, null]);
    const input = rowToFinanceInput(row);
    expect(leakageCoverage(input).complete).toBe(false);
    expect(leakageCoverage(input).known).toEqual([]);
    expect(costLeakageRatioPct(input)).toBeNull();
    await teardownOwnerBusiness(businessId);
  });

  it("[db] discount UNKNOWN with all three others known is still NOT complete", async () => {
    const { workspaceId, businessId } = await biz();
    const snap = await createFinancialSnapshot(businessId, createBody({ ...VALUES }, { discountAmount: undefined }), actor, workspaceId);
    const cov = leakageCoverage(rowToFinanceInput(await rowOf(snap.id)));
    expect(cov.complete).toBe(false);
    expect(cov.unknown).toEqual(["discounts"]);
    await teardownOwnerBusiness(businessId);
  });
});

describe("[db] D9 leakage components — amendment semantics (omitted keeps, number sets, null returns to UNKNOWN)", () => {
  async function amendIn(workspaceId: string, id: string, body: Record<string, unknown>) {
    const out = await amendFinancialSnapshot(id, financialSnapshotAmendSchema.parse({ amendmentReason: "D9 correction", ...body }), actor, workspaceId);
    return rowOf(out.snapshot!.id);
  }

  it("[db] known → UNKNOWN: null returns ONE component to UNKNOWN and the others are untouched", async () => {
    const { workspaceId, businessId } = await biz();
    const snap = await createFinancialSnapshot(businessId, createBody({ refundAmount: 2_000, reworkCost: 1_000, complaintCost: 500 }), actor, workspaceId);
    const r = await amendIn(workspaceId, snap.id, { reworkCost: null });
    expect([r.refundAmount, r.reworkCost, r.complaintCost]).toEqual([2_000, null, 500]);
    expect(r.refundReworkCost).toBe(2_500);
    expect(r.leakageCompVersion).toBe(1);
    expect(leakageCoverage(rowToFinanceInput(r))).toMatchObject({ complete: false, unknown: ["redone work"] });
    await teardownOwnerBusiness(businessId);
  });

  it("[db] UNKNOWN → known: setting one component fabricates nothing for the other two; completing the set makes it complete", async () => {
    const { workspaceId, businessId } = await biz();
    const snap = await createFinancialSnapshot(businessId, createBody({ refundAmount: 2_000 }), actor, workspaceId);
    const r1 = await amendIn(workspaceId, snap.id, { reworkCost: 200 });
    expect([r1.refundAmount, r1.reworkCost, r1.complaintCost]).toEqual([2_000, 200, null]); // complaint NOT invented as 0
    expect(leakageCoverage(rowToFinanceInput(r1)).complete).toBe(false);
    const r2 = await amendIn(workspaceId, r1.id, { complaintCost: 0 });
    expect([r2.refundAmount, r2.reworkCost, r2.complaintCost]).toEqual([2_000, 200, 0]);
    expect(leakageCoverage(rowToFinanceInput(r2)).complete).toBe(true); // discount was supplied at creation
    await teardownOwnerBusiness(businessId);
  });

  it("[db] an explicit amended 0 is a known zero, distinct from null", async () => {
    const { workspaceId, businessId } = await biz();
    const snap = await createFinancialSnapshot(businessId, createBody({ refundAmount: 2_000, reworkCost: 1_000, complaintCost: 500 }), actor, workspaceId);
    const r = await amendIn(workspaceId, snap.id, { refundAmount: 0 });
    expect([r.refundAmount, r.reworkCost, r.complaintCost]).toEqual([0, 1_000, 500]);
    expect(r.refundReworkCost).toBe(1_500);
    expect(leakageCoverage(rowToFinanceInput(r)).complete).toBe(true);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] an unrelated amendment preserves every component, the marker and the semantics", async () => {
    const { workspaceId, businessId } = await biz();
    const snap = await createFinancialSnapshot(businessId, createBody({ refundAmount: 2_000, complaintCost: 0 }), actor, workspaceId);
    const r = await amendIn(workspaceId, snap.id, { marketingSpend: 123 });
    expect([r.refundAmount, r.reworkCost, r.complaintCost, r.leakageCompVersion, r.refundReworkCost]).toEqual([2_000, null, 0, 1, 2_000]);
    expect(leakageCoverage(rowToFinanceInput(r))).toMatchObject({ complete: false, unknown: ["redone work"] });
    await teardownOwnerBusiness(businessId);
  });

  it("[db] amending the LAST remaining component of an all-UNKNOWN record never completes the other two", async () => {
    const { workspaceId, businessId } = await biz();
    const snap = await createFinancialSnapshot(businessId, createBody({}), actor, workspaceId);
    const r = await amendIn(workspaceId, snap.id, { complaintCost: 700 });
    expect([r.refundAmount, r.reworkCost, r.complaintCost]).toEqual([null, null, 700]);
    expect(leakageCoverage(rowToFinanceInput(r)).unknown).toEqual(["refunds", "redone work"]);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] the previous version is preserved unchanged (append-only lineage)", async () => {
    const { workspaceId, businessId } = await biz();
    const snap = await createFinancialSnapshot(businessId, createBody({ refundAmount: 2_000, reworkCost: 1_000, complaintCost: 500 }), actor, workspaceId);
    const r = await amendIn(workspaceId, snap.id, { reworkCost: null });
    const before = await rowOf(snap.id);
    expect(before.supersededById).toBe(r.id);
    expect([before.refundAmount, before.reworkCost, before.complaintCost]).toEqual([2_000, 1_000, 500]);
    await teardownOwnerBusiness(businessId);
  });
});

describe("[db] D9 leakage components — LEGACY rows (combined figure, composition unknown) stay conservatively incomplete", () => {
  it("[db] a legacy combined figure is NEVER assigned to a guessed component and NEVER reads as complete", async () => {
    const { workspaceId, businessId } = await biz();
    const id = await insertLegacyRow(workspaceId, businessId, 5_000);
    const row = await rowOf(id);
    expect([row.refundAmount, row.reworkCost, row.complaintCost, row.leakageCompVersion]).toEqual([null, null, null, null]);

    const input = rowToFinanceInput(row);
    expect(input.legacyCombinedLeakage).toBe(5_000);
    expect(input.refundAmount).toBeUndefined();
    expect(input.reworkCost).toBeUndefined();
    expect(input.complaintCost).toBeUndefined();

    const cov = leakageCoverage(input);
    expect(cov.complete).toBe(false);
    expect(cov.known).toEqual(["discounts", "refunds, redone work and complaint costs combined"]);
    expect(cov.unknown).toEqual(["the split between refunds, redone work and complaint costs"]);
    // the known monetary contribution is preserved as a LOWER-BOUND figure (3,000 discount + 5,000 combined)
    expect(costLeakageRatioPct(input)).toBe(8);

    const cycle = await runFinanceDiagnosis(businessId, id, actor, workspaceId);
    const finding = (await listFinanceCycleFindings(cycle.id, workspaceId)).find((f: any) => f.code === "FIN_OPP_LEAKAGE_REDUCTION");
    expect(finding!.missingData).toEqual(["the split between refunds, redone work and complaint costs"]);
    expect(finding!.summary).toMatch(/at least/i);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] a legacy row with NO combined figure has all three components UNKNOWN (and is incomplete)", async () => {
    const { workspaceId, businessId } = await biz();
    const id = await insertLegacyRow(workspaceId, businessId, null);
    const input = rowToFinanceInput(await rowOf(id));
    expect(input.legacyCombinedLeakage).toBeUndefined();
    expect(leakageCoverage(input)).toMatchObject({ complete: false, unknown: ["refunds", "redone work", "complaint costs"], known: ["discounts"] });
    await teardownOwnerBusiness(businessId);
  });

  it("[db] an unrelated amendment of a legacy row keeps it legacy: same combined figure, components still NULL, still incomplete", async () => {
    const { workspaceId, businessId } = await biz();
    const id = await insertLegacyRow(workspaceId, businessId, 5_000);
    const out = await amendFinancialSnapshot(id, financialSnapshotAmendSchema.parse({ amendmentReason: "fix marketing", marketingSpend: 900 }), actor, workspaceId);
    const r = await rowOf(out.snapshot!.id);
    expect([r.refundAmount, r.reworkCost, r.complaintCost, r.leakageCompVersion, r.refundReworkCost]).toEqual([null, null, null, null, 5_000]);
    expect(leakageCoverage(rowToFinanceInput(r)).complete).toBe(false);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] LEGACY INVARIANT: a row holding only refund_rework_cost is NEVER complete — across diagnosis reruns, unrelated amendments, reloads and round trips", async () => {
    const { workspaceId, businessId } = await biz();
    let id = await insertLegacyRow(workspaceId, businessId, 5_000);

    const assertStillIncomplete = async (snapshotId: string) => {
      const row = await rowOf(snapshotId); // reload from the database every time
      const input = rowToFinanceInput(row);
      expect(leakageCoverage(input).complete).toBe(false);
      expect([row.refundAmount, row.reworkCost, row.complaintCost, row.leakageCompVersion]).toEqual([null, null, null, null]);
      expect(row.refundReworkCost).toBe(5_000); // the combined figure is carried unchanged, never split
      const cycle = await runFinanceDiagnosis(businessId, snapshotId, actor, workspaceId); // a diagnosis RERUN
      const finding = (await listFinanceCycleFindings(cycle.id, workspaceId)).find((f: any) => f.code === "FIN_OPP_LEAKAGE_REDUCTION");
      expect(finding!.missingData).toEqual(["the split between refunds, redone work and complaint costs"]);
      expect(finding!.summary).toMatch(/at least/i);
    };

    await assertStillIncomplete(id);
    await assertStillIncomplete(id); // diagnosis rerun on the same, unchanged row
    for (const body of [{ marketingSpend: 100 }, { cashOnHand: 21_000 }, { notes: "reviewed" }, { revenue: 110_000 }]) {
      const out = await amendFinancialSnapshot(id, financialSnapshotAmendSchema.parse({ amendmentReason: "unrelated correction", ...body }), actor, workspaceId);
      id = out.snapshot!.id; // a chain of unrelated amendments, each reloaded and re-diagnosed
      await assertStillIncomplete(id);
    }
    await teardownOwnerBusiness(businessId);
  });

  it("[db] correcting ONE component of a legacy row is refused (the combined figure cannot be split) and changes nothing", async () => {
    const { workspaceId, businessId } = await biz();
    const id = await insertLegacyRow(workspaceId, businessId, 5_000);
    await expect(
      amendFinancialSnapshot(id, financialSnapshotAmendSchema.parse({ amendmentReason: "x", refundAmount: 100 }), actor, workspaceId)
    ).rejects.toBeInstanceOf(ValidationError);
    const still = await rowOf(id);
    expect(still.supersededById).toBeNull(); // no new version was created
    expect([still.refundAmount, still.reworkCost, still.complaintCost, still.refundReworkCost]).toEqual([null, null, null, 5_000]);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] restating ALL three components upgrades a legacy row; the legacy figure is kept in the superseded version and audited", async () => {
    const { workspaceId, businessId } = await biz();
    const id = await insertLegacyRow(workspaceId, businessId, 5_000);
    const out = await amendFinancialSnapshot(
      id,
      financialSnapshotAmendSchema.parse({ amendmentReason: "split it", refundAmount: 1_000, reworkCost: null, complaintCost: 0 }),
      actor,
      workspaceId
    );
    const r = await rowOf(out.snapshot!.id);
    expect([r.refundAmount, r.reworkCost, r.complaintCost, r.leakageCompVersion, r.refundReworkCost]).toEqual([1_000, null, 0, 1, 1_000]);
    expect(leakageCoverage(rowToFinanceInput(r))).toMatchObject({ complete: false, unknown: ["redone work"] }); // rework left UNKNOWN: still honest

    const old = await rowOf(id);
    expect([old.refundReworkCost, old.leakageCompVersion, old.supersededById]).toEqual([5_000, null, r.id]); // legacy figure intact

    const audit: any = await db.auditEvent.findFirst({
      where: { workspaceId, eventName: AUDIT_EVENTS.OWNER_FINANCE_SNAPSHOT_AMENDED, entityId: r.id },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit)).toContain("legacyCombinedLeakageSuperseded");
    expect(JSON.stringify(audit)).toContain("5000");
    await teardownOwnerBusiness(businessId);
  });
});

describe("[db] D9 leakage components — the database itself refuses a guessed component or a bad marker", () => {
  async function rawInsert(extra: Record<string, unknown>) {
    const { workspaceId, businessId } = await biz();
    try {
      await db.ownerFinancialSnapshot.create({
        data: {
          id: randomUUID(), workspaceId, businessId, periodStart: new Date(PERIOD.periodStart), periodEnd: new Date(PERIOD.periodEnd),
          currency: "INR", revenue: 1, dataConfidenceScore: 50, missingCriticalData: [], updatedAt: new Date(), ...extra,
        },
      });
    } finally {
      await teardownOwnerBusiness(businessId);
    }
  }

  it("[db] a component value without the component-aware marker is rejected (no guessed backfill on a legacy-shaped row)", async () => {
    await expect(rawInsert({ refundAmount: 5_000 })).rejects.toThrow();
    await expect(rawInsert({ reworkCost: 0 })).rejects.toThrow();
  });

  it("[db] an unknown marker value is rejected", async () => {
    await expect(rawInsert({ leakageCompVersion: 2, refundAmount: 1 })).rejects.toThrow();
  });

  it("[db] a negative component is rejected", async () => {
    await expect(rawInsert({ leakageCompVersion: 1, refundAmount: -1 })).rejects.toThrow();
  });

  it("[db] a well-formed component-aware row (including explicit zero and all-NULL) is accepted", async () => {
    await expect(rawInsert({ leakageCompVersion: 1, refundAmount: 0, reworkCost: null, complaintCost: 7 })).resolves.toBeUndefined();
    await expect(rawInsert({ leakageCompVersion: 1 })).resolves.toBeUndefined();
  });
});
