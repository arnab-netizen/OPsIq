/**
 * Runtime Control Correlation — real-business DB simulation (laundry).
 *
 * Seeds the ACTUAL persisted control loop for one workspace: closed OwnerReassessmentEvents,
 * ShockEvents with their SHOCK_EVENT_RECORDED (durability) + CONDITION_CHANGED (handling) audit
 * events, and a tamper-suspected proof. Then asks the DB-backed control-correlation service +
 * the LIVE Owner Now View for measured control health, and asserts:
 *   - REASSESSMENT_LATENCY / SHOCK_HANDLING_LATENCY / AUDIT_DURABILITY are now MEASURED (not
 *     NOT_MEASURABLE) — the pass's core conversion, from real timestamps.
 *   - a genuine FAILED link (a shock with no re-evaluation audit) is surfaced honestly.
 *   - a clean workspace stays NOT_MEASURABLE (no fabricated green) and is fully isolated.
 *
 * Requires TEST_WITH_DB=true with the migration applied.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getControlCorrelations } from "@/services/owner-mode/control-correlation.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const owner = randomUUID();
const wsL = randomUUID();      // laundry workspace (= ClientAccount id, so reassessment FK resolves)
const wsClean = randomUUID();
const bizL = randomUUID();
const engL = randomUUID();
const NOW = Date.now();
const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

// Two fully-audited shocks (durability + handling) and one un-handled shock (a real FAILED link).
const shockOk1 = randomUUID();
const shockOk2 = randomUUID();
const shockUnhandled = randomUUID();

async function audit(over: Record<string, unknown>) {
  await db.auditEvent.create({
    data: { id: randomUUID(), actorType: "system", visibility: "internal", workspaceId: wsL, entityType: "ShockEvent", ...over },
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Runtime Control Correlation — laundry control-loop simulation", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `cc-${owner}@laundry.test`, name: "Owner", isActive: true, updatedAt: new Date(NOW) } });
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `cc-${id.slice(0, 8)}`, createdBy: owner } });
    }
    // ClientAccount with id = wsL so OwnerReassessmentEvent.workspaceId (→ClientAccount) resolves.
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    await db.engagement.create({ data: {
      id: engL, code: `ENG-${engL.slice(0, 8)}`, title: "Laundry engagement", clientId: wsL, workspaceId: wsL,
      serviceTier: "standard", engagementMode: "recovery", updatedAt: new Date(NOW), createdBy: owner,
    } });

    // ── Reassessments: two closed (fast) → measurable, healthy latency. ──
    const mkReassess = (id: string, createdOffset: number, closedOffset: number, status: string) =>
      db.ownerReassessmentEvent.create({ data: {
        id, workspaceId: wsL, businessId: bizL, trigger: "failed_outcome", triggerDescription: "sim",
        status, requiresHumanReview: false, reopensDiagnosis: false, assumptionsChecked: true,
        invalidatedAssumptions: "[]", ownerAcknowledged: true,
        createdAt: new Date(NOW - createdOffset), updatedAt: new Date(NOW - closedOffset),
      } });
    await mkReassess(randomUUID(), 3 * D, 2 * D, "closed_with_correction");   // 1d latency
    await mkReassess(randomUUID(), 10 * D, 8 * D, "closed_no_correction_needed"); // 2d latency

    // ── Shocks + their audit records. ──
    const mkShock = (id: string, createdOffset: number) =>
      db.shockEvent.create({ data: {
        id, engagementId: engL, type: "service_breakdown", severity: "high",
        happenedAt: new Date(NOW - createdOffset - H), createdAt: new Date(NOW - createdOffset),
        updatedAt: new Date(NOW - createdOffset), createdBy: owner,
      } });
    await mkShock(shockOk1, 2 * H);
    await mkShock(shockOk2, 3 * H);
    await mkShock(shockUnhandled, 40 * MIN); // past the 1-min grace, no handling audit → FAILED

    // Durability audits (SHOCK_EVENT_RECORDED, atomic with the shock) for ALL three shocks.
    await audit({ eventName: "shock.event_recorded", entityId: shockOk1, occurredAt: new Date(NOW - 2 * H) });
    await audit({ eventName: "shock.event_recorded", entityId: shockOk2, occurredAt: new Date(NOW - 3 * H) });
    await audit({ eventName: "shock.event_recorded", entityId: shockUnhandled, occurredAt: new Date(NOW - 40 * MIN) });
    // Handling audits (CONDITION_CHANGED) for the two handled shocks only (30s after record).
    await audit({ eventName: "condition.changed", entityId: shockOk1, occurredAt: new Date(NOW - 2 * H + 30_000) });
    await audit({ eventName: "condition.changed", entityId: shockOk2, occurredAt: new Date(NOW - 3 * H + 45_000) });

    // Tamper-suspected proof (persisted flag) + a couple of normal proofs.
    await db.proof.create({ data: { id: randomUUID(), workspaceId: wsL, proofType: "photo", status: "NEEDS_HUMAN_REVIEW", tamperSuspected: true, updatedAt: new Date(NOW) } });
    await db.proof.create({ data: { id: randomUUID(), workspaceId: wsL, proofType: "photo", status: "ACCEPTED", updatedAt: new Date(NOW) } });
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.shockEvent.deleteMany({ where: { engagementId: engL } });
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.engagement.deleteMany({ where: { id: engL } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: owner } });
  });

  it("measures real reassessment + shock + audit correlations from persisted timestamps", async () => {
    const r = await getControlCorrelations(wsL, { db: db as never, now: () => NOW });

    // Reassessment latency: 2 closed, median 1.5d, no failures.
    expect(r.reassessmentLatency.measurable).toBe(true);
    expect(r.reassessmentLatency.linkedCount).toBe(2);
    expect(r.reassessmentLatency.failedCount).toBe(0);
    expect(r.reassessmentLatency.medianLatencyMs).toBe(Math.round((1 * D + 2 * D) / 2));

    // Shock handling: 2 LINKED with sub-minute latency, 1 FAILED (unhandled).
    expect(r.shockHandlingLatency.linkedCount).toBe(2);
    expect(r.shockHandlingLatency.failedCount).toBe(1);
    expect(r.shockHandlingLatency.medianLatencyMs).not.toBeNull();
    expect(r.shockHandlingLatency.medianLatencyMs!).toBeLessThan(60_000);

    // Audit durability: all 3 shocks have a SHOCK_EVENT_RECORDED audit → 100% coverage.
    expect(r.auditDurability.totalMutations).toBe(3);
    expect(r.auditDurability.coveragePct).toBe(100);

    // The one unhandled shock is a real FAILED link with NO fabricated target timestamp.
    const failed = r.correlations.find((c) => c.correlationType === "SHOCK_TO_HANDLING_CORRELATION" && c.sourceEntityId === shockUnhandled)!;
    expect(failed.status).toBe("FAILED");
    expect(failed.targetTimestamp).toBeNull();

    // Tamper signal is persisted + queryable.
    expect(r.tamper.tamperSuspectedCount).toBe(1);
    expect(r.correlations.some((c) => c.correlationType === "PROOF_TAMPER_SIGNAL_PERSISTENCE" && c.status === "LINKED")).toBe(true);
  });

  it("flips the Business-Control SLOs from NOT_MEASURABLE to measured via the live now-view", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const slo = (t: string) => out.businessControlHealth.slos.find((s) => s.sloType === t)!;

    // The three target SLOs are no longer NOT_MEASURABLE — they carry a real measured value.
    expect(slo("REASSESSMENT_LATENCY").status).not.toBe("NOT_MEASURABLE");
    expect(slo("SHOCK_HANDLING_LATENCY").status).not.toBe("NOT_MEASURABLE");
    expect(slo("AUDIT_DURABILITY").status).not.toBe("NOT_MEASURABLE");

    // Reassessment closes fast + audit fully covered → PASS. Shock has one unhandled → FAIL.
    expect(slo("REASSESSMENT_LATENCY").status).toBe("PASS");
    expect(slo("AUDIT_DURABILITY").status).toBe("PASS");
    expect(slo("AUDIT_DURABILITY").actualValue).toMatch(/100%/);
    expect(slo("SHOCK_HANDLING_LATENCY").status).toBe("FAIL");

    // The correlation report is surfaced on the owner-visible payload.
    expect(out.controlCorrelations).toBeTruthy();
    expect(out.controlCorrelations!.correlations.length).toBeGreaterThan(0);

    // Tamper flows into the credibility concern (persisted flag → owner-visible signal).
    expect(out.topCredibilityConcern?.signalType).toBe("TAMPER_SUSPECTED_PROOF");
  });

  it("a clean workspace stays honestly NOT_MEASURABLE and is fully isolated (no bleed)", async () => {
    const r = await getControlCorrelations(wsClean, { db: db as never, now: () => NOW });
    expect(r.reassessmentLatency.measurable).toBe(false);
    expect(r.shockHandlingLatency.measurable).toBe(false);
    expect(r.auditDurability.measurable).toBe(false);
    expect(r.tamper.tamperSuspectedCount).toBe(0);
    // No laundry correlation bleeds into the clean workspace.
    expect(r.correlations.every((c) => c.workspaceId === wsClean)).toBe(true);
    expect(r.correlations.some((c) => c.sourceEntityId === shockOk1)).toBe(false);

    const out = await getOwnerNowView(wsClean, null);
    const slo = (t: string) => out.businessControlHealth.slos.find((s) => s.sloType === t)!;
    expect(slo("REASSESSMENT_LATENCY").status).toBe("NOT_MEASURABLE");
    expect(slo("SHOCK_HANDLING_LATENCY").status).toBe("NOT_MEASURABLE");
    expect(slo("AUDIT_DURABILITY").status).toBe("NOT_MEASURABLE");
  });
});
