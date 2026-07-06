/**
 * Cash / Profit Protection Depth — real-business DB simulation (laundry).
 *
 * Sparkle Laundry (workspace `wsL`): repeated rework on sold work erodes margin, and there is no financial
 * snapshot / per-job cost. getOwnerNowView must surface cashProfitProtection with the real rework-cost risk
 * plus honest data gaps (MISSING_UNIT_ECONOMICS / PROFIT_DATA_INSUFFICIENT) — never a fabricated money
 * figure, never a cash crisis invented from a defaulted zero — and keep material money decisions to owner
 * review. A clean workspace has nothing to protect. Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const owner = randomUUID();
const mgr = randomUUID();
const staff = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const NOW = Date.now();
const H = 3_600_000;
const NO_FRAUD = /\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/i;
const NO_HR = /\b(fire|fired|firing|terminate|termination|payroll|salary|docking|discipline|disciplinary|punish)\b/i;

const SIGNAL_TYPES = new Set([
  "CASH_SAFETY_RISK", "LOW_MARGIN_WORK_RISK", "PRICING_LEAK", "DISCOUNT_LEAK", "REWORK_COST_RISK",
  "DELIVERY_COST_RISK", "STAFF_INEFFICIENCY_COST_RISK", "B2B_UNDERPRICING_RISK", "WORKING_CAPITAL_STRAIN",
  "MISSING_UNIT_ECONOMICS", "PROFIT_DATA_INSUFFICIENT",
]);

const acceptedProof = async (id: string, ago: number) => {
  await db.proof.create({ data: {
    id, workspaceId: wsL, businessId: bizL, taskId: randomUUID(), proofType: "wash", status: "ACCEPTED",
    submittedByUserId: staff, reviewedByUserId: mgr, reviewedAt: new Date(NOW - ago * H),
    submittedAt: new Date(NOW - (ago + 1) * H), createdAt: new Date(NOW - (ago + 2) * H), updatedAt: new Date(NOW - ago * H),
  } });
};
const opEvent = async (eventType: string, category: string, proofId: string, ago: number, severity = "MEDIUM") => {
  await db.operationalEvent.create({ data: {
    id: randomUUID(), workspaceId: wsL, businessId: bizL, eventType, category, severity, status: "OPEN",
    source: "customer_reported", description: `${category} ${eventType}`, relatedProofId: proofId,
    occurredAt: new Date(NOW - ago * H), createdAt: new Date(NOW - ago * H), updatedAt: new Date(NOW - ago * H),
  } });
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Cash / Profit Protection (laundry)", () => {
  const p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID();

  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "Mgr"], [staff, "Staff"]] as const) {
      await db.user.create({ data: { id, email: `cpp-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `cpp-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });

    await acceptedProof(p1, 8);
    await acceptedProof(p2, 7);
    await acceptedProof(p3, 6);
    await opEvent("COMPLAINT", "quality", p1, 5, "HIGH");
    await opEvent("COMPLAINT", "quality", p2, 4);
    await opEvent("REWORK", "quality", p1, 5);
    await opEvent("REWORK", "quality", p2, 4);
    await opEvent("REWORK", "quality", p3, 3);
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.operationalEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr, staff] } } });
  });

  it("surfaces real cash/profit risk + honest data gaps; no fabricated money; material stays owner-reviewed", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const cp = out.cashProfitProtection;
    expect(cp).not.toBeNull();
    expect(cp!.signals.length).toBeGreaterThan(0);
    expect(cp!.topSignal).not.toBeNull();

    for (const sig of cp!.signals) {
      expect(SIGNAL_TYPES.has(sig.signalType)).toBe(true);
      expect(sig.workspaceId).toBe(wsL);
      expect(sig.ownerExplanation.length).toBeGreaterThan(10);
      expect(sig.riskGuardrail.length).toBeGreaterThan(10);
      // No fabricated money: metricValue is only ever a real number or null.
      expect(sig.metricValue === null || Number.isFinite(sig.metricValue)).toBe(true);
      // Material money signals keep owner review.
      if (["CASH_SAFETY_RISK", "LOW_MARGIN_WORK_RISK", "PRICING_LEAK", "DISCOUNT_LEAK", "B2B_UNDERPRICING_RISK"].includes(sig.signalType)) {
        expect(sig.requiresOwnerReview).toBe(true);
      }
    }
    // No finance snapshot / per-job cost was seeded → OpsIQ says so honestly rather than inventing a profit picture.
    expect(cp!.signals.some((s) => s.signalType === "MISSING_UNIT_ECONOMICS")).toBe(true);
    // Summary counts sum to the signal count.
    const s = cp!.summary;
    expect(s.total).toBe(cp!.signals.length);

    // No fraud/negligence/HR-discipline language, no fabricated money figure, no hidden score.
    const json = JSON.stringify(cp).toLowerCase();
    expect(json).not.toMatch(NO_FRAUD);
    expect(json).not.toMatch(NO_HR);
    expect(json).not.toMatch(/hidden\s*score/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("a clean workspace has nothing to protect and leaks no evidence", async () => {
    const out = await getOwnerNowView(wsClean);
    const cp = out.cashProfitProtection;
    if (cp) expect(cp.signals).toHaveLength(0);
    expect(JSON.stringify(cp)).not.toContain(p1);
  });
});
