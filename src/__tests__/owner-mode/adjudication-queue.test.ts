/**
 * Owner Adjudication Queue read-model (pure).
 *
 * Flattens the now-view proof-risk blocks (reused-hash, anti-gaming, credibility, active timing
 * signals, existing adjudications) into concise, adjudicable queue items with a deterministic
 * sourceRef + proofIds (the exact adjudicate-route payload), the current status, and no fraud/theft/
 * negligence wording. BLOCKED_BY_DATA findings stay visible but are not adjudicable.
 */
import { describe, it, expect } from "vitest";
import { buildAdjudicationQueue, ADJUDICATION_OUTCOME_OPTIONS } from "@/domain/owner-mode/adjudication-queue";
import { AdjudicationSourceType, AdjudicationOutcome } from "@/domain/execution/proof-risk-adjudication";
import type { GamingSignal } from "@/domain/owner-mode/anti-gaming-analytics";
import type { CredibilityFinding } from "@/domain/owner-mode/evidence-credibility-graph";
import type { TimingSignal } from "@/domain/owner-mode/timing-evidence";

const AT = "2026-07-05T00:00:00.000Z";

const gaming = (over: Partial<GamingSignal> = {}): GamingSignal => ({
  workspaceId: "ws", actorId: "op-1", actorRole: "staff", signalType: "SELF_REVIEW_ATTEMPT",
  reasonCodes: ["SELF_REVIEW"], severity: "HIGH", confidence: "HIGH", evidence: ["2 self-reviewed"],
  patternCount: 2, missingData: [], ownerExplanation: "A reviewer accepted work they submitted themselves.",
  businessImpact: "x", relatedProfitLeak: null, relatedConstraint: null, recommendedResponse: "Enforce separate reviewer.",
  ownerActionRequired: true, managerActionSufficient: false, trainingOrProcessRecommendation: null, reassessmentTrigger: null,
  supportingProofIds: ["p1", "p2"], sourceCompleteness: "COMPLETE", signalScore: 1, evaluatedAt: AT, ...over,
});

const credibility = (over: Partial<CredibilityFinding> = {}): CredibilityFinding => ({
  workspaceId: "ws", entityType: "reviewer", entityId: "mgr-1", entityLabel: "Manager", signalType: "REVIEW_QUALITY_CONCERN",
  severity: "HIGH", confidence: "MEDIUM", reasonCodes: ["x"], evidence: ["x"], patternCount: 2, missingData: [],
  ownerExplanation: "This reviewer's review quality is a concern.", businessImpact: "x", relatedGamingSignal: null,
  relatedProfitLeak: null, relatedConstraint: null, recommendedResponse: "Spot-audit approvals.", ownerActionRequired: false,
  managerActionSufficient: true, reassessmentTrigger: null, supportingProofIds: ["pc1"], sourceCompleteness: "COMPLETE",
  credibilityScore: 1, evaluatedAt: AT, ...over,
});

const timing = (over: Partial<TimingSignal> = {}): TimingSignal => ({
  workspaceId: "ws", signalType: "SUSPICIOUS_FAST_COMPLETION", status: "SUSPICIOUS_FAST_COMPLETION_PATTERN",
  actorId: "op-fast", actorRole: "staff", severity: "HIGH", confidence: "MEDIUM", reasonCodes: ["x"],
  timingEvidence: [{ ref: "f1", measuredMs: 240000, baselineMs: 3600000, note: "fast" }],
  baselineSource: "OBSERVED_ACCEPTED_HISTORY(proofType=wash)", baselineConfidence: "MEDIUM", patternCount: 2,
  supportingProofIds: ["f1", "f2"], sourceCompleteness: "COMPLETE", missingData: [],
  ownerExplanation: "This operator repeatedly submits proof far faster than normal.", businessImpact: "x",
  recommendedResponse: "Owner-review these jobs.", ownerActionRequired: true, evaluatedAt: AT, ...over,
});

describe("adjudication-queue — module contract assertions", () => {
  it("buildAdjudicationQueue is a function", () => { expect(typeof buildAdjudicationQueue).toBe("function"); });
  it("ADJUDICATION_OUTCOME_OPTIONS is an array", () => { expect(Array.isArray(ADJUDICATION_OUTCOME_OPTIONS)).toBe(true); });
  it("AdjudicationSourceType is an object", () => { expect(typeof AdjudicationSourceType).toBe("object"); });
  it("AdjudicationOutcome is an object", () => { expect(typeof AdjudicationOutcome).toBe("object"); });
  it("AT is a string", () => { expect(typeof AT).toBe("string"); });
  it("gaming is a function", () => { expect(typeof gaming).toBe("function"); });
  it("credibility is a function", () => { expect(typeof credibility).toBe("function"); });
  it("timing is a function", () => { expect(typeof timing).toBe("function"); });
  it("gaming() returns an object", () => { expect(typeof gaming()).toBe("object"); });
  it("credibility() returns an object", () => { expect(typeof credibility()).toBe("object"); });
  it("timing() returns an object", () => { expect(typeof timing()).toBe("object"); });
  it("buildAdjudicationQueue({}) returns an object", () => { expect(typeof buildAdjudicationQueue({})).toBe("object"); });
  it("buildAdjudicationQueue({}) has items field", () => { expect(buildAdjudicationQueue({})).toHaveProperty("items"); });
  it("buildAdjudicationQueue({}).items is an array", () => { expect(Array.isArray(buildAdjudicationQueue({}).items)).toBe(true); });
});

describe("adjudication-queue — read model", () => {
  it("renders a reused-proof finding as an adjudicable REUSED_HASH_FINDING item", () => {
    const { items, summary } = buildAdjudicationQueue({
      reusedProofFindings: { submitterReuse: [{ actorId: "op-1", count: 3, proofIds: ["r1", "r2", "r3"] }] },
    });
    const it0 = items.find((i) => i.sourceType === AdjudicationSourceType.REUSED_HASH_FINDING)!;
    expect(it0.findingType).toBe("REUSED_PROOF");
    expect(it0.sourceRef).toBe("REUSED_HASH:op-1");
    expect(it0.proofIds).toEqual(["r1", "r2", "r3"]);
    expect(it0.supportingProofCount).toBe(3);
    expect(it0.representativeProofRefs.length).toBeLessThanOrEqual(5);
    expect(it0.adjudicable).toBe(true);
    expect(summary.totalItems).toBe(1);
  });

  it("renders an anti-gaming signal with supporting proof count + deterministic sourceRef", () => {
    const { items } = buildAdjudicationQueue({ topGamingSignal: gaming() });
    const g = items.find((i) => i.sourceType === AdjudicationSourceType.ANTI_GAMING_SIGNAL)!;
    expect(g.findingType).toBe("SELF_REVIEW_ATTEMPT");
    expect(g.sourceRef).toBe("SELF_REVIEW_ATTEMPT:op-1");
    expect(g.supportingProofCount).toBe(2);
    expect(g.proofIds).toEqual(["p1", "p2"]);
    expect(g.actorId).toBe("op-1");
    expect(g.adjudicable).toBe(true);
  });

  it("renders a credibility concern as a CREDIBILITY_CONCERN item", () => {
    const { items } = buildAdjudicationQueue({ topCredibilityConcern: credibility() });
    const c = items.find((i) => i.sourceType === AdjudicationSourceType.CREDIBILITY_CONCERN)!;
    expect(c.findingType).toBe("REVIEW_QUALITY_CONCERN");
    expect(c.sourceRef).toBe("REVIEW_QUALITY_CONCERN:mgr-1");
    expect(c.proofIds).toEqual(["pc1"]);
  });

  it("renders an active timing-evidence signal as an adjudicable item", () => {
    const { items } = buildAdjudicationQueue({ timingEvidence: { fastCompletion: timing(), escalationTiming: null } });
    const t = items.find((i) => i.findingType === "SUSPICIOUS_FAST_COMPLETION")!;
    expect(t.sourceType).toBe(AdjudicationSourceType.ANTI_GAMING_SIGNAL);
    expect(t.sourceRef).toBe("SUSPICIOUS_FAST_COMPLETION:op-fast");
    expect(t.proofIds).toEqual(["f1", "f2"]);
    expect(t.adjudicable).toBe(true);
  });

  it("dedupes a timing signal that is also the top gaming signal (same sourceRef)", () => {
    const g = gaming({ signalType: "SUSPICIOUS_FAST_COMPLETION", actorId: "op-fast", supportingProofIds: ["f1", "f2"] });
    const { items } = buildAdjudicationQueue({ topGamingSignal: g, timingEvidence: { fastCompletion: timing(), escalationTiming: null } });
    expect(items.filter((i) => i.sourceRef === "SUSPICIOUS_FAST_COMPLETION:op-fast").length).toBe(1);
  });

  it("keeps a BLOCKED_BY_DATA finding visible but NOT adjudicable (fail-visible)", () => {
    const { items, summary } = buildAdjudicationQueue({
      topGamingSignal: gaming({ supportingProofIds: undefined, sourceCompleteness: "BLOCKED_BY_DATA", missingData: ["no persisted proof-level source"] }),
    });
    const g = items[0];
    expect(g.adjudicable).toBe(false);
    expect(g.missingData.length).toBeGreaterThan(0);
    expect(summary.blockedByDataItems).toBe(1);
  });

  it("attaches the current adjudication status per (sourceType, sourceRef)", () => {
    const { items } = buildAdjudicationQueue({
      topGamingSignal: gaming(),
      proofRiskAdjudications: [{ sourceType: "ANTI_GAMING_SIGNAL", sourceRef: "SELF_REVIEW_ATTEMPT:op-1", status: "CLEARED" }],
    });
    expect(items[0].currentAdjudicationStatus).toBe("CLEARED");
  });

  it("exposes all seven governed outcomes with plain, non-accusatory labels + effects", () => {
    expect(ADJUDICATION_OUTCOME_OPTIONS.map((o) => o.outcome).sort()).toEqual(
      Object.values(AdjudicationOutcome).sort()
    );
    const json = JSON.stringify(ADJUDICATION_OUTCOME_OPTIONS);
    expect(json).not.toMatch(/\b(fraud|theft|thief|negligent|negligence)\b/i);
    expect(ADJUDICATION_OUTCOME_OPTIONS.some((o) => o.effect === "REDUCES_NOISE")).toBe(true);
    expect(ADJUDICATION_OUTCOME_OPTIONS.some((o) => o.effect === "KEEPS_ACTIVE")).toBe(true);
  });

  it("sorts highest severity first and never emits a fraud/theft/negligence label", () => {
    const { items } = buildAdjudicationQueue({
      reusedProofFindings: { submitterReuse: [{ actorId: "op-1", count: 2, proofIds: ["r1", "r2"] }] },
      topGamingSignal: gaming({ severity: "MEDIUM", signalType: "REPEATED_WEAK_PROOF", actorId: "op-2" }),
    });
    expect(items[0].severity).toBe("HIGH"); // reused-hash HIGH before the MEDIUM gaming item
    expect(JSON.stringify(items)).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|stole|stealing)\b/i);
  });
});
