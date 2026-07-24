/**
 * Jarvis 360 gap-closure (G15) — arbitration invoked over candidate interventions.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: vi.fn(async () => "audit-id") }));

import {
  arbitrateInterventions,
  interventionToCandidate,
} from "@/services/owner-mode/intervention-arbitration.service";
import type { PrioritizedIntervention } from "@/domain/consulting-engine/types";

function iv(over: Partial<PrioritizedIntervention["intervention"]> & { id: string }, priorityScore: number): PrioritizedIntervention {
  return {
    intervention: {
      id: over.id,
      title: over.title ?? `Intervention ${over.id}`,
      class: over.class ?? ("STABILIZATION" as never),
      objective: "obj",
      rationale: "rat",
      whyThisNow: "now",
      ownerRole: "owner",
      steps: [{ order: 1, description: "step", ownerRole: "owner" }] as never,
      estimatedCostBand: over.estimatedCostBand ?? ("LOW" as never),
      expectedImpactOnRevenue: over.expectedImpactOnRevenue ?? ("MINOR" as never),
      successMetrics: ["m"],
      failureRisks: ["r"],
      fallbackPlan: "fb",
      evidenceBasis: [],
      estimatedTotalDays: 5,
      priorityScore,
    } as PrioritizedIntervention["intervention"],
    priorityScore,
    factors: [],
    sequencingReason: "seq",
  };
}

describe("intervention-arbitration — module contract assertions", () => {
  it("arbitrateInterventions is a function", () => {
    expect(typeof arbitrateInterventions).toBe("function");
  });
  it("interventionToCandidate is a function", () => {
    expect(typeof interventionToCandidate).toBe("function");
  });
  it("iv({id:'x'}, 50) returns an object", () => {
    expect(typeof iv({ id: "x" }, 50)).toBe("object");
  });
  it("iv({id:'x'}, 50) has a priorityScore field", () => {
    expect(iv({ id: "x" }, 50)).toHaveProperty("priorityScore");
  });
  it("iv({id:'x'}, 50).priorityScore is 50", () => {
    expect(iv({ id: "x" }, 50).priorityScore).toBe(50);
  });
  it("iv({id:'x'}, 50) has an intervention field", () => {
    expect(iv({ id: "x" }, 50)).toHaveProperty("intervention");
  });
  it("iv({id:'x'}, 50).intervention.id is 'x'", () => {
    expect(iv({ id: "x" }, 50).intervention.id).toBe("x");
  });
  it("iv({id:'x'}, 50) has a factors field that is an array", () => {
    expect(Array.isArray(iv({ id: "x" }, 50).factors)).toBe(true);
  });
  it("interventionToCandidate(iv({id:'a'}, 50)) returns an object", () => {
    expect(typeof interventionToCandidate(iv({ id: "a" }, 50))).toBe("object");
  });
  it("interventionToCandidate result has a riskOfAction field", () => {
    expect(interventionToCandidate(iv({ id: "a" }, 50))).toHaveProperty("riskOfAction");
  });
  it("interventionToCandidate result has a reversible field (boolean)", () => {
    expect(typeof interventionToCandidate(iv({ id: "a" }, 50)).reversible).toBe("boolean");
  });
  it("interventionToCandidate result has an ownerGoalAligned field", () => {
    expect(interventionToCandidate(iv({ id: "a" }, 50))).toHaveProperty("ownerGoalAligned");
  });
  it("interventionToCandidate result has a confidence field (number)", () => {
    expect(typeof interventionToCandidate(iv({ id: "a" }, 50)).confidence).toBe("number");
  });
  it("HIGH cost + STRUCTURAL_REPAIR gives riskOfAction 0.8", () => {
    const c = interventionToCandidate(iv({ id: "a", estimatedCostBand: "HIGH" as never, class: "STRUCTURAL_REPAIR" as never }, 50));
    expect(c.riskOfAction).toBe(0.8);
  });
  it("TRANSFORMATIVE revenue impact gives ownerGoalAligned true", () => {
    const c = interventionToCandidate(iv({ id: "b", expectedImpactOnRevenue: "TRANSFORMATIVE" as never }, 90));
    expect(c.ownerGoalAligned).toBe(true);
  });
  it("iv result has a sequencingReason field", () => {
    expect(iv({ id: "x" }, 50)).toHaveProperty("sequencingReason");
  });
});

describe("interventionToCandidate", () => {
  it("derives higher action risk for higher cost and lower reversibility for structural repair", () => {
    const c = interventionToCandidate(iv({ id: "a", estimatedCostBand: "HIGH" as never, class: "STRUCTURAL_REPAIR" as never }, 50));
    expect(c.riskOfAction).toBe(0.8);
    expect(c.reversible).toBe(false);
  });
  it("marks high-revenue-impact interventions as owner-goal-aligned", () => {
    const c = interventionToCandidate(iv({ id: "b", expectedImpactOnRevenue: "TRANSFORMATIVE" as never }, 90));
    expect(c.ownerGoalAligned).toBe(true);
    expect(c.confidence).toBeCloseTo(0.9);
  });
});

describe("arbitrateInterventions", () => {
  it("chooses one action, rejects the rest, audits, and builds a what-not-to-do list", async () => {
    const emitAudit = vi.fn(async () => "audit-id");
    const interventions = [
      iv({ id: "safe", title: "Low-cost stabilizer", estimatedCostBand: "MINIMAL" as never, class: "STABILIZATION" as never, expectedImpactOnRevenue: "SIGNIFICANT" as never }, 80),
      iv({ id: "risky", title: "Expensive growth bet", estimatedCostBand: "HIGH" as never, class: "GROWTH_ENABLEMENT" as never }, 40),
    ];
    const summary = await arbitrateInterventions("ws1", interventions, { emitAudit });

    expect(summary.recommendedInterventionId).toBe("safe");
    expect(summary.whatNotToDo.length).toBe(1);
    expect(summary.whatNotToDo[0]).toContain("Expensive growth bet");
    expect(emitAudit).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "owner.arbitration_resolved", payload: expect.objectContaining({ recommendedId: "safe", candidateCount: 2 }) })
    );
    // EH-05 — the full verdict (not just counts) is persisted to the audit payload.
    const payload = emitAudit.mock.calls[0][0].payload;
    expect(Array.isArray(payload.whatNotToDo)).toBe(true);
    expect(payload.whatNotToDo.length).toBe(1);
    expect(Array.isArray(payload.verdict)).toBe(true);
    expect(payload.verdict.find((v: { id: string }) => v.id === "safe").verdict).toBe("recommended");
    expect(payload.verdict.find((v: { id: string }) => v.id === "risky").verdict).toBe("rejected");
  });

  it("handles a single candidate (recommended, nothing to avoid)", async () => {
    const emitAudit = vi.fn(async () => "audit-id");
    const summary = await arbitrateInterventions("ws1", [iv({ id: "only" }, 60)], { emitAudit });
    expect(summary.recommendedInterventionId).toBe("only");
    expect(summary.whatNotToDo).toEqual([]);
  });
});
