/**
 * Complaint / Rework model — pure. Conservative category vocabulary, fail-closed validation
 * (category + description required), category→profit/constraint mapping, and proof↔event linkage
 * analysis with per-submitter attribution + measured-impact honesty (no fabricated figure).
 */
import { describe, it, expect } from "vitest";
import {
  planRecordEvent, buildComplaintReworkAnalysis, riskForEvent,
  OperationalEventType, ComplaintCategory, ReworkCategory,
  type OperationalEventRow, type LinkedProofRow,
} from "@/domain/execution/complaint-rework";

const AT = "2026-07-05T00:00:00.000Z";
const NOW = new Date(AT);

describe("complaint/rework — validation + mapping", () => {
  it("records a valid complaint; fails closed on missing category / blank description / bad type", () => {
    expect(planRecordEvent({ eventType: OperationalEventType.COMPLAINT, category: ComplaintCategory.QUALITY_COMPLAINT, description: "stain remained" }).ok).toBe(true);
    expect(planRecordEvent({ eventType: OperationalEventType.COMPLAINT, category: "NOPE", description: "x y z" }).ok).toBe(false);
    expect(planRecordEvent({ eventType: OperationalEventType.REWORK, category: ReworkCategory.REWASH, description: "" }).ok).toBe(false);
    expect(planRecordEvent({ eventType: "WHAT", category: ComplaintCategory.OTHER, description: "abc" }).ok).toBe(false);
    // A rework category on a COMPLAINT event is rejected (conservative).
    expect(planRecordEvent({ eventType: OperationalEventType.COMPLAINT, category: ReworkCategory.REWASH, description: "abc" }).ok).toBe(false);
  });

  it("carries an impact amount only when supplied (never fabricated)", () => {
    const none = planRecordEvent({ eventType: OperationalEventType.REWORK, category: ReworkCategory.REWASH, description: "redo" });
    expect(none.ok && none.plan.impactConfidence).toBe("NEEDS_DATA");
    const amt = planRecordEvent({ eventType: OperationalEventType.REWORK, category: ReworkCategory.REWASH, description: "redo", estimatedImpactAmount: 40 });
    expect(amt.ok && amt.plan.estimatedImpactAmount).toBe(40);
    expect(amt.ok && amt.plan.impactConfidence).toBe("ESTIMATED");
  });

  it("maps categories to profit/constraint drivers", () => {
    expect(riskForEvent("COMPLAINT", ComplaintCategory.QUALITY_COMPLAINT)).toEqual({ profitLeakType: "COMPLAINT_REVENUE_RISK", constraintType: "QUALITY" });
    expect(riskForEvent("REWORK", ReworkCategory.REWASH)).toEqual({ profitLeakType: "REWORK_REDO_COST", constraintType: "QUALITY" });
    expect(riskForEvent("COMPLAINT", ComplaintCategory.DELIVERY_COMPLAINT)?.constraintType).toBe("DELIVERY");
  });
});

const ev = (over: Partial<OperationalEventRow> = {}): OperationalEventRow => ({
  id: "e1", eventType: OperationalEventType.COMPLAINT, relatedProofId: "p1", relatedActionId: null,
  category: ComplaintCategory.QUALITY_COMPLAINT, severity: "HIGH", status: "OPEN", source: "customer_reported",
  description: "stain remained", occurredAt: null, createdAt: NOW, estimatedImpactAmount: null, impactConfidence: "NEEDS_DATA", ...over,
});
const proof = (over: Partial<LinkedProofRow> = {}): LinkedProofRow => ({ id: "p1", status: "ACCEPTED", submittedByUserId: "op-1", ...over });

describe("complaint/rework — linkage analysis", () => {
  it("a complaint linked to an accepted proof is measurable + attributed to the submitter", () => {
    const a = buildComplaintReworkAnalysis("ws-1", [ev()], [proof()], AT);
    expect(a.measurement.proofComplaintMeasurable).toBe(true);
    expect(a.aggregates.complaintLinkedCount).toBe(1);
    expect(a.aggregates.qualityCount).toBe(1);
    expect(a.submitterComplaints).toEqual([{ actorId: "op-1", count: 1 }]);
    expect(a.links[0].linkStatus).toBe("LINKED");
    expect(a.links[0].profitLeakType).toBe("COMPLAINT_REVENUE_RISK");
  });

  it("a rework linked to accepted proof feeds rework aggregates + measured impact when present", () => {
    const a = buildComplaintReworkAnalysis("ws-1", [ev({ eventType: OperationalEventType.REWORK, category: ReworkCategory.REWASH, estimatedImpactAmount: 30, impactConfidence: "ESTIMATED" })], [proof()], AT);
    expect(a.aggregates.reworkLinkedCount).toBe(1);
    expect(a.aggregates.measuredReworkImpact).toBe(30);
    expect(a.submitterReworks).toEqual([{ actorId: "op-1", count: 1 }]);
  });

  it("an event whose proof is not in the workspace is MISSING_PROOF (no fabricated linkage)", () => {
    const a = buildComplaintReworkAnalysis("ws-1", [ev({ relatedProofId: "ghost" })], [proof()], AT);
    expect(a.links[0].linkStatus).toBe("MISSING_PROOF");
    expect(a.aggregates.complaintLinkedCount).toBe(0);
  });

  it("no measured amount → impact stays qualitative (NEEDS_DATA), never invented", () => {
    const a = buildComplaintReworkAnalysis("ws-1", [ev()], [proof()], AT);
    expect(a.aggregates.measuredComplaintImpact).toBeNull();
    expect(a.links[0].impactConfidence).toBe("NEEDS_DATA");
    expect(a.links[0].missingData.length).toBeGreaterThan(0);
    expect(a.links.every((l) => l.workspaceId === "ws-1")).toBe(true);
  });
});
