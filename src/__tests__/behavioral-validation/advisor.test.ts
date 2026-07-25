import { describe, it, expect } from "vitest";
import { advise, baseAdvise } from "@/behavioral-validation/advisor";
import { detectUnsafe } from "@/behavioral-validation/scorer";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { EXPANDED_CASES } from "@/behavioral-validation/expansion";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import { adviceOutputSchema } from "@/behavioral-validation/schema";

describe("harness advisor — module contract assertions", () => {
  it("advise is a function", () => { expect(typeof advise).toBe("function"); });
  it("baseAdvise is a function", () => { expect(typeof baseAdvise).toBe("function"); });
  it("detectUnsafe is a function", () => { expect(typeof detectUnsafe).toBe("function"); });
  it("InMemoryLearningStore is a class (function)", () => { expect(typeof InMemoryLearningStore).toBe("function"); });
  it("EXPANDED_CASES is a non-empty array", () => { expect(Array.isArray(EXPANDED_CASES)).toBe(true); expect(EXPANDED_CASES.length).toBeGreaterThan(0); });
  it("SEED_CASES is a non-empty array", () => { expect(Array.isArray(SEED_CASES)).toBe(true); expect(SEED_CASES.length).toBeGreaterThan(0); });
  it("adviceOutputSchema has a parse method", () => { expect(typeof adviceOutputSchema.parse).toBe("function"); });
  it("new InMemoryLearningStore() instanceof InMemoryLearningStore", () => { expect(new InMemoryLearningStore()).toBeInstanceOf(InMemoryLearningStore); });
  it("SEED_CASES[0] has archetype field", () => { expect(SEED_CASES[0]).toHaveProperty("archetype"); });
  it("SEED_CASES[0] has businessType field", () => { expect(SEED_CASES[0]).toHaveProperty("businessType"); });
  it("baseAdvise(SEED_CASES[0]) returns an object", () => { expect(typeof baseAdvise(SEED_CASES[0])).toBe("object"); });
  it("baseAdvise result has rootCause field", () => { expect(baseAdvise(SEED_CASES[0])).toHaveProperty("rootCause"); });
  it("baseAdvise result has recommendedNextAction field", () => { expect(baseAdvise(SEED_CASES[0])).toHaveProperty("recommendedNextAction"); });
  it("detectUnsafe(SEED_CASES[0], baseAdvise(SEED_CASES[0])) returns an array", () => {
    expect(Array.isArray(detectUnsafe(SEED_CASES[0], baseAdvise(SEED_CASES[0])))).toBe(true);
  });
});

describe("harness advisor", () => {
  it("produces schema-valid, structurally complete base advice for every seed", () => {
    for (const c of SEED_CASES) {
      const a = baseAdvise(c);
      expect(() => adviceOutputSchema.parse(a)).not.toThrow();
      expect(a.rootCause && a.recommendedNextAction && a.reassessmentTrigger).toBeTruthy();
      expect((a.proofRequired ?? []).length).toBeGreaterThan(0);
    }
  });

  it("never emits an unsafe output on the entire corpus (base advisor is safe-by-construction)", () => {
    let unsafe = 0;
    for (const c of EXPANDED_CASES) unsafe += detectUnsafe(c, baseAdvise(c)).length;
    expect(unsafe).toBe(0);
  });

  it("reasons from inputs, not the answer key — it does not copy correctExpertDecision verbatim", () => {
    for (const c of SEED_CASES.slice(0, 10)) {
      const a = baseAdvise(c);
      expect(a.recommendedNextAction).not.toBe(c.correctExpertDecision);
      expect(a.rootCause).not.toBe(c.hiddenRootCause);
    }
  });

  it("lowers data confidence on stale/missing-data cases", () => {
    const stale = EXPANDED_CASES.find((c) => c.flags.missingOrStaleData)!;
    expect(["low", "cannot_determine"]).toContain(baseAdvise(stale).dataConfidence);
  });

  it("requires independent verification in hostile cases", () => {
    const hostile = EXPANDED_CASES.find((c) => c.flags.hostile)!;
    const text = JSON.stringify(baseAdvise(hostile)).toLowerCase();
    expect(/independent|verif|proof/.test(text)).toBe(true);
  });

  it("empty store ⇒ no learning applied; populated store ⇒ advice changes and records provenance", async () => {
    const store = new InMemoryLearningStore();
    const c = SEED_CASES.find((x) => x.archetype === "laundry_dry_cleaning")!;
    const before = await advise(c, { store, workspaceId: "ws-1" });
    expect((before.learningNotesApplied ?? []).length).toBe(0);
    // Owner-workload offload is emitted by default now (critical domain); a structured plan is present.
    expect(before.ownerWorkloadReduction).toBeTruthy();
    expect(before.ownerWorkloadPlan).toBeTruthy();

    await store.save({
      id: "seed-art::v1", sourceCaseId: "seed-art", businessType: c.businessType, archetype: c.archetype,
      locationKey: "India|tier1", failureLabel: "owner_workload_increased",
      originalFailedBehavior: "no offload", correctedBehavior: "Delegate routine checks with a daily proof report.",
      applicabilityScope: { archetype: c.archetype, decisionCategory: null, locationKey: null },
      riskLevel: "medium", approvalStatus: "pending", scope: "local_only", privacyClassification: "workspace_private",
      workspaceId: "ws-1", version: 1, supersededByVersion: null, active: true, createdAt: "2026-06-29T00:00:00Z",
      auditTrail: [{ at: "2026-06-29T00:00:00Z", actor: "t", action: "created" }],
    });
    const after = await advise(c, { store, workspaceId: "ws-1" });
    expect(after.ownerWorkloadReduction).toBeTruthy();
    // learning enriches the offload and records provenance (output demonstrably changes).
    expect(after.ownerWorkloadReduction).not.toBe(before.ownerWorkloadReduction);
    expect(after.learningNotesApplied).toContain("seed-art::v1");
  });
});
