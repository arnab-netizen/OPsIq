/**
 * SOP / Training Effectiveness Loop — real-business DB simulation (laundry).
 *
 * Sparkle Laundry (workspace `wsL`): repeated quality complaints/rework drive a QUALITY_FAILURE_LOOP /
 * REWORK_LOOP with routed corrections. The first Owner Now View has no baseline → effectiveness is
 * INSUFFICIENT_DATA. After the metric snapshot improves (fewer complaints/rework) and a second Now View
 * runs, OpsIQ surfaces the real before/after numbers but — because it has no persisted proof that any
 * correction was actually approved and executed — it must NOT claim IMPROVED / "appears to be working"
 * (that would be correlation-as-causation). It stays honestly INSUFFICIENT_DATA until the
 * correction→execution bridge exists (PASS 19 / C1). A clean workspace fabricates nothing.
 * Requires TEST_WITH_DB=true.
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
const metric = async (periodMonth: number, complaintCount: number, rewashCount: number) => {
  await db.ownerMetricSnapshot.create({ data: {
    id: randomUUID(), businessId: bizL, workspaceId: wsL, currency: "GBP",
    periodStart: new Date(Date.UTC(2026, periodMonth, 1)), periodEnd: new Date(Date.UTC(2026, periodMonth, 28)),
    complaintCount, rewashCount, revenue: 10000, updatedAt: new Date(NOW),
  } });
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] SOP / Training Effectiveness Loop (laundry)", () => {
  const p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID();

  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "Mgr"], [staff, "Staff"]] as const) {
      await db.user.create({ data: { id, email: `eff-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `eff-${id.slice(0, 8)}`, createdBy: owner } });
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
    // Baseline metric period: high complaints + rework.
    await metric(4, 5, 5);
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerMetricSnapshot.deleteMany({ where: { workspaceId: wsL } });
    await db.operationalEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr, staff] } } });
  });

  it("does NOT claim IMPROVED from a metric change alone — stays INSUFFICIENT_DATA without a verified executed correction (PASS 19 / C1)", async () => {
    // First review — creates the baseline snapshot; no prior snapshot yet, so effectiveness is honest INSUFFICIENT_DATA.
    const first = await getOwnerNowView(wsL, bizL);
    expect(first.sopTrainingEffectiveness).not.toBeNull();
    expect(first.sopTrainingEffectiveness!.evaluations.length).toBeGreaterThan(0);
    expect(first.sopTrainingEffectiveness!.evaluations.every((e) => e.direction === "INSUFFICIENT_DATA")).toBe(true);

    // The problem improves: a newer metric period with fewer complaints + rework.
    await metric(5, 2, 2);

    // Second review — the metric fell (5 → 2), but OpsIQ has NO persisted execution-linkage proving any
    // correction/SOP/training was actually approved and executed. Attributing the drop to a correction would
    // be correlation-as-causation (a fabricated causal claim). So OpsIQ must stay INSUFFICIENT_DATA and never
    // report IMPROVED / "appears to be working" here. The real before/after metric is still surfaced honestly.
    const second = await getOwnerNowView(wsL, bizL);
    const eff = second.sopTrainingEffectiveness;
    expect(eff).not.toBeNull();
    expect(eff!.evaluations.length).toBeGreaterThan(0);
    expect(eff!.evaluations.every((e) => e.direction === "INSUFFICIENT_DATA")).toBe(true);
    // No evaluation claims a causal "appears to be working" success.
    for (const e of eff!.evaluations) {
      expect(e.direction).not.toBe("IMPROVED");
      expect(e.ownerVisibleSummary).not.toMatch(/appears to be working/i);
      expect(e.workspaceId).toBe(wsL);
    }
    // The honest metric trend is still visible (real before/after numbers), never a fabricated figure.
    const withBaseline = eff!.evaluations.filter((e) => e.baselineMetricValue !== null && e.currentMetricValue !== null);
    for (const e of withBaseline) {
      expect(e.baselineMetricValue! > e.currentMetricValue!).toBe(true);
    }
    // No fabricated money figure, no fraud/negligence label, no hidden score.
    const json = JSON.stringify(eff);
    expect(json).not.toMatch(NO_FRAUD);
    expect(json).not.toMatch(/hidden\s*score/i);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("a clean workspace fabricates no effectiveness evaluation and leaks no evidence", async () => {
    const out = await getOwnerNowView(wsClean);
    const eff = out.sopTrainingEffectiveness;
    // Either null (fake-DI path) or empty — never fabricated.
    if (eff) expect(eff.evaluations).toHaveLength(0);
    expect(JSON.stringify(eff)).not.toContain(p1);
  });
});
