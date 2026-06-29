import { describe, it, expect } from "vitest";
import { InMemoryLearningStore, isVisibleTo } from "@/behavioral-validation/learning-store";
import type { LearningArtifact } from "@/behavioral-validation/schema";

const AT = "2026-06-29T00:00:00Z";

function artifact(over: Partial<LearningArtifact> = {}): LearningArtifact {
  return {
    id: "case-x::v1", sourceCaseId: "case-x", businessType: "laundry", archetype: "laundry_dry_cleaning",
    locationKey: "India|tier1", failureLabel: "bad_cash_advice", originalFailedBehavior: "spent in crisis",
    correctedBehavior: "block discretionary spend until margin proof",
    applicabilityScope: { archetype: "laundry_dry_cleaning", decisionCategory: "cash_margin_working_capital", locationKey: null },
    riskLevel: "high", approvalStatus: "pending", scope: "local_only", privacyClassification: "workspace_private",
    workspaceId: "ws-1", version: 1, supersededByVersion: null, active: true, createdAt: AT,
    auditTrail: [{ at: AT, actor: "t", action: "created" }],
    ...over,
  };
}

describe("learning store — persistence + read-back", () => {
  it("saves and reads an artifact back by id and via findApplicable", async () => {
    const store = new InMemoryLearningStore();
    await store.save(artifact());
    expect((await store.getById("case-x::v1"))?.correctedBehavior).toContain("block discretionary spend");
    const found = await store.findApplicable({ archetype: "laundry_dry_cleaning", decisionCategory: "cash_margin_working_capital", locationKey: "India|tier1", workspaceId: "ws-1" });
    expect(found.map((a) => a.id)).toContain("case-x::v1");
  });

  it("scopes by archetype/category/location", async () => {
    const store = new InMemoryLearningStore();
    await store.save(artifact());
    const wrongCat = await store.findApplicable({ archetype: "laundry_dry_cleaning", decisionCategory: "marketing_opportunity_contract", locationKey: "India|tier1", workspaceId: "ws-1" });
    expect(wrongCat.length).toBe(0);
  });
});

describe("learning store — privacy (no cross-workspace leakage)", () => {
  it("a workspace-private artifact is invisible to other workspaces", async () => {
    const store = new InMemoryLearningStore();
    await store.save(artifact());
    const mine = await store.findApplicable({ archetype: "laundry_dry_cleaning", decisionCategory: "cash_margin_working_capital", locationKey: "India|tier1", workspaceId: "ws-1" });
    const theirs = await store.findApplicable({ archetype: "laundry_dry_cleaning", decisionCategory: "cash_margin_working_capital", locationKey: "India|tier1", workspaceId: "ws-2" });
    expect(mine.length).toBe(1);
    expect(theirs.length).toBe(0);
  });

  it("isVisibleTo enforces approved+promoted for cross-workspace sharing", () => {
    const priv = artifact();
    expect(isVisibleTo(priv, "ws-1")).toBe(true);
    expect(isVisibleTo(priv, "ws-2")).toBe(false);
    const shared = artifact({ privacyClassification: "abstracted_shareable", approvalStatus: "approved", scope: "global_template", workspaceId: null });
    expect(isVisibleTo(shared, "ws-2")).toBe(true);
    const pendingShared = artifact({ privacyClassification: "abstracted_shareable", approvalStatus: "pending", scope: "global_template" });
    expect(isVisibleTo(pendingShared, "ws-2")).toBe(false);
  });
});

describe("learning store — approval-gated global promotion", () => {
  it("refuses to promote a non-approved artifact", async () => {
    const store = new InMemoryLearningStore();
    await store.save(artifact());
    await expect(store.promoteToGlobal("case-x::v1", "admin", AT)).rejects.toThrow();
  });

  it("promotes only after approval, then it is visible cross-workspace", async () => {
    const store = new InMemoryLearningStore();
    await store.save(artifact());
    await store.approve("case-x::v1", "admin", AT);
    const promoted = await store.promoteToGlobal("case-x::v1", "admin", AT);
    expect(promoted.scope).toBe("global_template");
    expect(promoted.privacyClassification).toBe("abstracted_shareable");
    const theirs = await store.findApplicable({ archetype: "laundry_dry_cleaning", decisionCategory: "cash_margin_working_capital", locationKey: "India|tier1", workspaceId: "ws-2" });
    expect(theirs.map((a) => a.id)).toContain("case-x::v1");
  });
});

describe("learning store — versioning + revert", () => {
  it("supersede creates v2, deactivates v1, and a new correction needs re-approval", async () => {
    const store = new InMemoryLearningStore();
    await store.save(artifact({ approvalStatus: "approved" }));
    const v2 = await store.supersede("case-x::v1", "even stricter block", "trainer", AT);
    expect(v2.version).toBe(2);
    expect(v2.approvalStatus).toBe("pending");
    expect((await store.getById("case-x::v1"))?.active).toBe(false);
    expect((await store.getById("case-x::v1"))?.supersededByVersion).toBe(2);
  });

  it("revert restores the prior version and deactivates the current one", async () => {
    const store = new InMemoryLearningStore();
    await store.save(artifact());
    await store.supersede("case-x::v1", "v2 behavior", "trainer", AT);
    const restored = await store.revert("case-x", "admin", AT);
    expect(restored.version).toBe(1);
    expect(restored.active).toBe(true);
    const all = await store.all();
    expect(all.find((a) => a.version === 2)?.active).toBe(false);
  });
});
