/**
 * Operational-event resolution + aging — real-business DB simulation (laundry).
 *
 * A customer reports a DELIVERY complaint against an operator's accepted proof. The event is
 * recorded (backdated 60h), so it ages past its severity window and becomes OVERDUE. The live
 * now-view is shown to:
 *   - surface the open/overdue event via operationalEventHealth + the OPERATIONAL_EVENT_RESOLUTION
 *     SLO (FAIL, escalation triggered);
 *   - bind a DELIVERY constraint and a DELIVERY_DELAY_COST leak from the per-event delivery complaint;
 *   - fail PROOF_OUTCOME_INTEGRITY (accepted proof contradicted by a linked complaint).
 * The owner then RESOLVES the event with a note (governed + audited). On re-read the live risk clears
 * (the resolved event no longer drives the top leak/constraint and the resolution SLO returns to PASS),
 * while PROOF_OUTCOME_INTEGRITY stays FAIL (the sign-off historically did not hold). A clean workspace
 * fabricates nothing and isolation holds.
 *
 * Requires TEST_WITH_DB=true with the operational_events + resolution-column migrations applied.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  recordOperationalEvent, resolveOperationalEvent, getOperationalEventAgingSummary, getOpenOperationalEvents,
} from "@/services/execution/complaint-rework.service";
import { OperationalEventType, ComplaintCategory } from "@/domain/execution/complaint-rework";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const owner = randomUUID();
const opWeak = randomUUID();
const reviewer = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const proofId = randomUUID();
const NOW = Date.now();
const H = 3_600_000;

const slo = (out: Awaited<ReturnType<typeof getOwnerNowView>>, t: string) =>
  out.businessControlHealth.slos.find((s) => s.sloType === t)!;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Operational-event resolution + aging — laundry delivery complaint", () => {
  let eventId = "";

  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [opWeak, "OpWeak"], [reviewer, "Reviewer"]] as const) {
      await db.user.create({ data: { id, email: `age-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `age-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    await db.proof.create({ data: { id: proofId, workspaceId: wsL, businessId: bizL, proofType: "photo", status: "ACCEPTED", submittedByUserId: opWeak, reviewedByUserId: reviewer, reviewedAt: new Date(NOW - 65 * H), createdAt: new Date(NOW - 66 * H), updatedAt: new Date(NOW - 65 * H) } });
    await db.auditEvent.create({ data: { id: randomUUID(), workspaceId: wsL, eventName: "proof.reviewed", actorId: reviewer, actorType: "user", entityType: "proof", entityId: proofId, payload: { fromStatus: "NEEDS_HUMAN_REVIEW", toStatus: "ACCEPTED" }, visibility: "internal", occurredAt: new Date(NOW - 65 * H) } });
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.operationalEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, opWeak, reviewer] } } });
  });

  it("records a HIGH delivery complaint, backdated so it ages OVERDUE (server createdAt)", async () => {
    // Record through the live service with a backdated clock so createdAt is 60h ago (past the
    // HIGH 48h window) — the age is real elapsed time, not a fabricated flag.
    const rec = await recordOperationalEvent(
      { workspaceId: wsL, actorId: owner, eventType: OperationalEventType.COMPLAINT, category: ComplaintCategory.DELIVERY_COMPLAINT, severity: "HIGH", description: "delivered a day late, customer angry", relatedProofId: proofId },
      { db: db as never, uuid: () => randomUUID(), now: () => NOW - 60 * H }
    );
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    eventId = rec.eventId;

    const summary = await getOperationalEventAgingSummary(wsL, { db: db as never, uuid: () => randomUUID(), now: () => NOW });
    expect(summary.openCount).toBe(1);
    expect(summary.overdueCount).toBe(1);
    expect(summary.overdueSevereCount).toBe(1);
    expect(summary.escalationTriggered).toBe(true);
    expect(summary.topActiveEvent?.eventId).toBe(eventId);

    const open = await getOpenOperationalEvents(wsL, { db: db as never, uuid: () => randomUUID(), now: () => NOW });
    expect(open.map((e) => e.eventId)).toContain(eventId);
  });

  it("the overdue delivery complaint drives delivery constraint/leak + fails the resolution & integrity SLOs", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    // Per-event delivery complaint binds a DELIVERY constraint + a DELIVERY_DELAY_COST leak
    // (the delivery-specific leak outranks the generic complaint-revenue leak, which is also present).
    expect(out.topConstraint?.constraintType).toBe("DELIVERY");
    expect(out.topProfitLeak?.leakType).toBe("DELIVERY_DELAY_COST");
    expect(out.topProfitLeak?.leaks ?? out.businessControlHealth.slos.length).toBeTruthy();
    // Owner-visible event health is exposed and shows the overdue event.
    expect(out.operationalEventHealth?.overdueCount).toBe(1);
    expect(out.operationalEventHealth?.escalationTriggered).toBe(true);
    // The resolution SLO fails (overdue severe); integrity fails (accepted proof contradicted).
    expect(slo(out, "OPERATIONAL_EVENT_RESOLUTION").status).toBe("FAIL");
    expect(slo(out, "PROOF_OUTCOME_INTEGRITY").status).toBe("FAIL");
  });

  it("resolving the event with a note clears the live risk (SLO PASS) but integrity stays FAIL (historical)", async () => {
    const r = await resolveOperationalEvent({ workspaceId: wsL, actorId: owner, eventId, note: "re-delivered same day + apology; runner route fixed" });
    expect(r.ok && r.deduped).toBe(false);
    // Governed status-change audit exists.
    const audits = await db.auditEvent.count({ where: { workspaceId: wsL, eventName: "operational_event.status_changed", entityId: eventId } });
    expect(audits).toBe(1);
    // Re-linking/resolving again is idempotent.
    const again = await resolveOperationalEvent({ workspaceId: wsL, actorId: owner, eventId, note: "again" });
    expect(again.ok && again.deduped).toBe(true);

    const out = await getOwnerNowView(wsL, bizL);
    expect(out.operationalEventHealth?.activeCount).toBe(0);
    expect(out.operationalEventHealth?.resolvedCount).toBe(1);
    // Resolution SLO recovers; the resolved event no longer drives the delivery leak/constraint.
    expect(slo(out, "OPERATIONAL_EVENT_RESOLUTION").status).toBe("PASS");
    expect(out.topProfitLeak?.leakType).not.toBe("COMPLAINT_REVENUE_RISK");
    expect(out.topProfitLeak?.leakType).not.toBe("DELIVERY_DELAY_COST");
    // Integrity remains FAIL — the accepted proof historically did not hold up.
    expect(slo(out, "PROOF_OUTCOME_INTEGRITY").status).toBe("FAIL");
  });

  it("a clean workspace fabricates no events or risk and is isolated", async () => {
    const summary = await getOperationalEventAgingSummary(wsClean, { db: db as never, uuid: () => randomUUID(), now: () => NOW });
    expect(summary.activeCount).toBe(0);
    expect(summary.events.length).toBe(0);
    const out = await getOwnerNowView(wsClean, null);
    expect(out.operationalEventHealth?.activeCount ?? 0).toBe(0);
    expect(slo(out, "OPERATIONAL_EVENT_RESOLUTION").status).toBe("NOT_MEASURABLE");
    expect(out.topConstraint?.constraintType).not.toBe("DELIVERY");
  });
});
