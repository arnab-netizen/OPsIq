/**
 * Maximum-reliability — learning-governance re-proof.
 */
import { describe, it, expect } from "vitest";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { canPromoteArtifactToGlobal, artifactConfidence, isUsable, conflictsRequiringAdjudication, isVisibleTo, type PromotionContext } from "@/behavioral-validation/max-reliability/learning-governance";
import type { LearningArtifact } from "@/behavioral-validation/schema";

const AT = "2026-06-30T00:00:00Z";
function artifact(over: Partial<LearningArtifact> = {}): LearningArtifact {
  return {
    id: "art-1", sourceCaseId: "A1", businessType: "laundry_dry_cleaning", archetype: "laundry_dry_cleaning",
    locationKey: "India|tier1", failureLabel: "bad_cash_advice", originalFailedBehavior: "spent in crisis",
    correctedBehavior: "block discretionary spend until margin proof",
    applicabilityScope: { archetype: "laundry_dry_cleaning", decisionCategory: "cash_margin_working_capital", locationKey: null },
    riskLevel: "high", approvalStatus: "approved", scope: "archetype_level", privacyClassification: "abstracted_shareable",
    workspaceId: null, version: 1, supersededByVersion: null, active: true, createdAt: AT,
    auditTrail: [{ at: AT, actor: "test", action: "created" }], ...over,
  };
}
const okCtx: PromotionContext = { sourceReliability: "high", supportingCases: 3, privacyPass: true, sourcePoisoned: false, unresolvedUnsafe: 0, reversible: true, hasAuditTrail: true };

describe("learning governance", () => {
  it("an artifact backed by ONE weak source cannot become global", () => {
    const r = canPromoteArtifactToGlobal(artifact(), { ...okCtx, sourceReliability: "low", supportingCases: 1 });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /single weak source/.test(f))).toBe(true);
  });

  it("a non-approved artifact cannot become global", () => {
    expect(canPromoteArtifactToGlobal(artifact({ approvalStatus: "pending" }), okCtx).ok).toBe(false);
  });

  it("privacy failure / source poisoning / unresolved unsafe / non-reversible each block promotion", () => {
    expect(canPromoteArtifactToGlobal(artifact(), { ...okCtx, privacyPass: false }).ok).toBe(false);
    expect(canPromoteArtifactToGlobal(artifact(), { ...okCtx, sourcePoisoned: true }).ok).toBe(false);
    expect(canPromoteArtifactToGlobal(artifact(), { ...okCtx, unresolvedUnsafe: 1 }).ok).toBe(false);
    expect(canPromoteArtifactToGlobal(artifact(), { ...okCtx, reversible: false }).ok).toBe(false);
  });

  it("a sound, multi-supported, clean, reversible, audited artifact CAN be promoted", () => {
    expect(canPromoteArtifactToGlobal(artifact(), okCtx).ok).toBe(true);
  });

  it("a revoked (rejected) or inactive artifact is never usable", () => {
    expect(isUsable(artifact({ approvalStatus: "rejected" }))).toBe(false);
    expect(isUsable(artifact({ active: false }))).toBe(false);
    expect(isUsable(artifact())).toBe(true);
  });

  it("a stale artifact loses confidence", () => {
    expect(artifactConfidence("high", 10)).toBe("high");
    expect(artifactConfidence("high", 200)).toBe("medium");
    expect(artifactConfidence("high", 400)).toBe("low");
  });

  it("two active in-scope artifacts that disagree are routed to adjudication", () => {
    const conflicts = conflictsRequiringAdjudication([
      artifact({ id: "a", correctedBehavior: "block all spend" }),
      artifact({ id: "b", correctedBehavior: "allow capped spend" }),
    ]);
    expect(conflicts.length).toBe(1);
  });

  it("a workspace_private artifact never leaks across workspaces", () => {
    const priv = artifact({ privacyClassification: "workspace_private", workspaceId: "ws-A", scope: "local_only" });
    expect(isVisibleTo(priv, "ws-A")).toBe(true);
    expect(isVisibleTo(priv, "ws-B")).toBe(false);
    expect(isVisibleTo(priv, null)).toBe(false);
  });

  it("rollback (supersede then revert) restores the prior corrected behavior", async () => {
    const store = new InMemoryLearningStore();
    const a = await store.save(artifact({ approvalStatus: "pending", scope: "local_only", privacyClassification: "workspace_private", workspaceId: "ws-A" }));
    await store.supersede(a.id, "NEW corrected behavior v2", "owner", AT);
    const afterSupersede = (await store.all()).find((x) => x.active && x.sourceCaseId === a.sourceCaseId)!;
    expect(afterSupersede.correctedBehavior).toBe("NEW corrected behavior v2");
    const restored = await store.revert(a.sourceCaseId, "owner", AT);
    expect(restored.correctedBehavior).toBe("block discretionary spend until margin proof");
  });

  it("promoteToGlobal on a non-approved artifact throws (store-level safety gate)", async () => {
    const store = new InMemoryLearningStore();
    const a = await store.save(artifact({ approvalStatus: "pending", scope: "local_only", privacyClassification: "workspace_private", workspaceId: "ws-A" }));
    await expect(store.promoteToGlobal(a.id, "owner", AT)).rejects.toThrow();
  });
});
