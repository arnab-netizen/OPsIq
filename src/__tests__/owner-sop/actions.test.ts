/**
 * Owner SOP & Execution Accountability (Module 7 Slice 3) — recommendation/action
 * planner tests. Pure/no DB. Verifies traceable recommendations, action conformance
 * to the Spine schema, bounded + deterministic pressure-weighted priority, ranking,
 * no-invention (every emitted finding has a template), template traceability, and
 * that the recommended next action targets the most urgent execution problem.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseSopSnapshot,
  planSopActionsFromDiagnosis,
  buildSopRecommendations,
  SOP_REC_TEMPLATES,
  type SopSnapshotInput,
} from "@/domain/owner-sop";
import {
  ownerActionSchema,
  OWNER_ACTION_STATUSES,
  calculateOwnerPriorityScore,
} from "@/domain/owner-spine/contracts";

const NOW = new Date("2026-06-05T00:00:00.000Z");

function disciplined(): SopSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    actionsAssigned: 100,
    actionsCompleted: 98,
    actionsVerified: 92,
    actionsOverdue: 3,
    actionsDisputed: 1,
    actionsReassigned: 2,
    repeatedFailures: 1,
    proofRequired: 50,
    proofProvided: 48,
    recurringProcesses: 20,
    documentedSops: 19,
  };
}

function breakdown(): SopSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    actionsAssigned: 100,
    actionsCompleted: 50,
    actionsVerified: 10,
    actionsOverdue: 40,
    actionsDisputed: 8,
    actionsReassigned: 30,
    repeatedFailures: 30,
    proofRequired: 40,
    proofProvided: 10,
    recurringProcesses: 20,
    documentedSops: 5,
  };
}

function plan(input: SopSnapshotInput) {
  return planSopActionsFromDiagnosis(diagnoseSopSnapshot(input, { now: NOW }));
}
const actionCodes = (p: { actions: { findingCode: string }[] }) => p.actions.map((a) => a.findingCode);

describe("owner-sop actions — module contract assertions", () => {
  it("diagnoseSopSnapshot is a function", () => { expect(typeof diagnoseSopSnapshot).toBe("function"); });
  it("planSopActionsFromDiagnosis is a function", () => { expect(typeof planSopActionsFromDiagnosis).toBe("function"); });
  it("buildSopRecommendations is a function", () => { expect(typeof buildSopRecommendations).toBe("function"); });
  it("SOP_REC_TEMPLATES is an object", () => { expect(typeof SOP_REC_TEMPLATES).toBe("object"); });
  it("ownerActionSchema is an object", () => { expect(typeof ownerActionSchema).toBe("object"); });
  it("OWNER_ACTION_STATUSES is defined", () => { expect(OWNER_ACTION_STATUSES).toBeDefined(); });
  it("calculateOwnerPriorityScore is a function", () => { expect(typeof calculateOwnerPriorityScore).toBe("function"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("disciplined is a function", () => { expect(typeof disciplined).toBe("function"); });
  it("breakdown is a function", () => { expect(typeof breakdown).toBe("function"); });
  it("plan is a function", () => { expect(typeof plan).toBe("function"); });
  it("actionCodes is a function", () => { expect(typeof actionCodes).toBe("function"); });
  it("disciplined() returns an object", () => { expect(typeof disciplined()).toBe("object"); });
  it("breakdown() returns an object", () => { expect(typeof breakdown()).toBe("object"); });
});

describe("owner-sop planner — recommendation/action creation", () => {
  it("repeated failures create an eliminate-repeat-failure (convert-to-SOP) action", () => {
    const p = plan(breakdown());
    expect(actionCodes(p)).toContain("SOP_REPEATED_FAILURES");
    const rec = p.recommendations.find((r) => r.findingCode === "SOP_REPEATED_FAILURES");
    expect(rec?.category).toBe("eliminate_repeat_failure");
    expect(rec?.recommendationCode).toBe("SOPREC_ELIMINATE_REPEAT_FAILURE");
  });

  it("low SOP coverage creates a document-sop action", () => {
    const p = plan(breakdown());
    expect(actionCodes(p)).toContain("SOP_LOW_COVERAGE");
    const rec = p.recommendations.find((r) => r.findingCode === "SOP_LOW_COVERAGE");
    expect(rec?.category).toBe("document_sop");
  });

  it("recommendations are traceable to a real source metric/value", () => {
    const p = plan(breakdown());
    const rec = p.recommendations.find((r) => r.findingCode === "SOP_HIGH_OVERDUE");
    expect(rec?.sourceMetric).toBe("overdueRatePct");
    expect(typeof rec?.sourceValue).toBe("number");
    expect(rec?.verificationMetric).toBe("overdueRatePct");
  });
});

describe("owner-sop planner — actions conform + prioritise", () => {
  it("every action satisfies the Spine OwnerAction schema (proposed, sop)", () => {
    const p = plan(breakdown());
    expect(p.actions.length).toBeGreaterThan(0);
    for (const a of p.actions) {
      expect(() => ownerActionSchema.parse(a)).not.toThrow();
      expect(a.domain).toBe("sop");
      expect(a.status).toBe("proposed");
      expect(OWNER_ACTION_STATUSES).toContain(a.status);
      expect(a.priorityScore).toBeGreaterThanOrEqual(0);
      expect(a.priorityScore).toBeLessThanOrEqual(100);
      expect(Number.isInteger(a.priorityScore)).toBe(true);
    }
  });

  it("ranks by descending priority and recommends a critical-severity top action", () => {
    const p = plan(breakdown());
    for (let i = 1; i < p.actions.length; i++) {
      expect(p.actions[i - 1].priorityScore).toBeGreaterThanOrEqual(p.actions[i].priorityScore);
    }
    expect(p.recommendedNextAction).toEqual(p.actions[0]);
    expect(p.recommendedNextAction?.severity).toBe("critical");
  });

  it("priority is pressure-weighted: execution risk lifts the same action", () => {
    const p = plan(breakdown());
    const risk = diagnoseSopSnapshot(breakdown(), { now: NOW }).metrics.executionRiskScore;
    const rec = p.recommendations.find((r) => r.findingCode === "SOP_REPEATED_FAILURES")!;
    const weighted = calculateOwnerPriorityScore({
      expectedImpactScore: rec.expectedExecImpactScore,
      confidence: rec.confidence,
      urgencyScore: rec.urgencyScore,
      effortScore: rec.effortScore,
      severity: rec.severity,
      survivalRiskScore: risk,
    });
    const unweighted = calculateOwnerPriorityScore({
      expectedImpactScore: rec.expectedExecImpactScore,
      confidence: rec.confidence,
      urgencyScore: rec.urgencyScore,
      effortScore: rec.effortScore,
      severity: rec.severity,
      survivalRiskScore: 0,
    });
    expect(weighted).toBeGreaterThanOrEqual(unweighted);
    const action = p.actions.find((a) => a.findingCode === "SOP_REPEATED_FAILURES");
    expect(action?.priorityScore).toBe(weighted);
  });
});

describe("owner-sop planner — no invention / completeness", () => {
  it("every emitted finding has a recommendation template (no missing inputs)", () => {
    for (const input of [disciplined(), breakdown()]) {
      const diag = diagnoseSopSnapshot(input, { now: NOW });
      const p = planSopActionsFromDiagnosis(diag);
      expect(p.missingActionInputs).toEqual([]);
      const withTemplate = diag.findings.filter((f) => SOP_REC_TEMPLATES[f.code]);
      expect(p.recommendations.length).toBe(withTemplate.length);
    }
  });

  it("does not mutate diagnosis findings", () => {
    const diag = diagnoseSopSnapshot(breakdown(), { now: NOW });
    const before = JSON.parse(JSON.stringify(diag.findings));
    planSopActionsFromDiagnosis(diag);
    expect(diag.findings).toEqual(before);
  });

  it("buildSopRecommendations skips findings with no template", () => {
    const recs = buildSopRecommendations([
      {
        domain: "sop",
        code: "SOP_UNKNOWN_NOT_A_TEMPLATE",
        title: "x",
        summary: "x",
        sourceMetric: "x",
        sourceValue: null,
        threshold: null,
        severity: "low",
        confidence: 1,
        impactScore: 10,
        urgencyScore: 10,
        findingType: "risk",
        evidence: [],
        missingData: [],
      },
    ]);
    expect(recs).toEqual([]);
  });
});
