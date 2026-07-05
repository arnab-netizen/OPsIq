/**
 * Governed Proof Dispute — pure domain rules. A reason + valid category are REQUIRED (fail closed),
 * owner-only override is enforced, categories map deterministically to reassessment triggers, and
 * high-impact categories force human review. No DB.
 */
import { describe, it, expect } from "vitest";
import { planProofDispute, ProofDisputeCategory } from "@/domain/execution/proof-dispute";
import { ProofStatus } from "@/domain/execution/proof";
import { TaskActorRole } from "@/domain/execution/delegated-task";

const req = (over: Record<string, unknown> = {}) => ({
  category: ProofDisputeCategory.QUALITY_FAILURE, reason: "rewash needed", actorRole: TaskActorRole.MANAGER, ...over,
});

describe("planProofDispute", () => {
  it("valid manager dispute → DISPUTED with the category's trigger", () => {
    const r = planProofDispute(req());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.targetStatus).toBe(ProofStatus.DISPUTED);
    expect(r.plan.trigger).toBe("failed_outcome");
    expect(r.plan.source).toBe("manager");
  });

  it("fails closed on a missing/invalid category", () => {
    expect(planProofDispute(req({ category: "NOPE" })).ok).toBe(false);
    expect(planProofDispute(req({ category: undefined })).ok).toBe(false);
  });

  it("fails closed on a missing/blank reason", () => {
    expect(planProofDispute(req({ reason: "" })).ok).toBe(false);
    expect(planProofDispute(req({ reason: "  " })).ok).toBe(false);
    expect(planProofDispute(req({ reason: 123 })).ok).toBe(false);
  });

  it("owner-only override: non-owner rejected, owner → OVERRIDDEN_NOT_VERIFIED", () => {
    expect(planProofDispute(req({ override: true, actorRole: TaskActorRole.MANAGER })).ok).toBe(false);
    const owner = planProofDispute(req({ override: true, actorRole: TaskActorRole.OWNER }));
    expect(owner.ok).toBe(true);
    if (!owner.ok) return;
    expect(owner.plan.targetStatus).toBe(ProofStatus.OVERRIDDEN_NOT_VERIFIED);
    expect(owner.plan.requiresHumanReview).toBe(true);
    expect(owner.plan.source).toBe("owner");
  });

  it("high-impact categories force human review; category→trigger mapping is correct", () => {
    expect(planProofDispute(req({ category: ProofDisputeCategory.BAD_OUTCOME })).ok && (planProofDispute(req({ category: ProofDisputeCategory.BAD_OUTCOME })) as { plan: { requiresHumanReview: boolean } }).plan.requiresHumanReview).toBe(true);
    const map: Array<[ProofDisputeCategory, string]> = [
      [ProofDisputeCategory.CUSTOMER_COMPLAINT, "disputed_outcome"],
      [ProofDisputeCategory.REWORK_REQUIRED, "failed_outcome"],
      [ProofDisputeCategory.WRONG_OR_INSUFFICIENT_PROOF, "evidence_retraction"],
      [ProofDisputeCategory.SUSPECTED_FAKE_OR_REUSED_PROOF, "evidence_retraction"],
      [ProofDisputeCategory.MANAGER_REVIEW_ERROR, "evidence_retraction"],
      [ProofDisputeCategory.OTHER, "new_contradicting_evidence"],
    ];
    for (const [cat, trig] of map) {
      const r = planProofDispute(req({ category: cat }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.plan.trigger).toBe(trig);
    }
  });
});
