/**
 * Standalone public-corpus learning persistence: failures create GOVERNED artifacts that improve future
 * output, scope-limited and workspace-private, with no auto global promotion and no holdout/cross-
 * workspace/source-text leakage. Evidence targets per the training prompt are asserted on a sample.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { runPublicLearningLoop, type LearningPersistenceReport } from "@/behavioral-validation/public-cases/public-learning";
import { genericAdvise, advise } from "@/behavioral-validation/advisor";
import { scoreAdvice } from "@/behavioral-validation/scorer";
import { PUBLIC_CORPUS } from "@/behavioral-validation/public-cases/library";

let rep: LearningPersistenceReport;
beforeAll(async () => { rep = await runPublicLearningLoop({ limit: 300 }); }, 120_000);

describe("public-corpus learning persistence — module contract assertions", () => {
  it("runPublicLearningLoop is a function", () => { expect(typeof runPublicLearningLoop).toBe("function"); });
  it("genericAdvise is a function", () => { expect(typeof genericAdvise).toBe("function"); });
  it("advise is a function", () => { expect(typeof advise).toBe("function"); });
  it("scoreAdvice is a function", () => { expect(typeof scoreAdvice).toBe("function"); });
  it("PUBLIC_CORPUS is an array", () => { expect(Array.isArray(PUBLIC_CORPUS)).toBe(true); });
  it("PUBLIC_CORPUS.length is greater than 0", () => { expect(PUBLIC_CORPUS.length).toBeGreaterThan(0); });
  it("PUBLIC_CORPUS[0] has meta field", () => { expect(PUBLIC_CORPUS[0]).toHaveProperty("meta"); });
  it("PUBLIC_CORPUS[0] has case field", () => { expect(PUBLIC_CORPUS[0]).toHaveProperty("case"); });
  it("PUBLIC_CORPUS[0].meta has split field", () => { expect((PUBLIC_CORPUS[0] as any).meta).toHaveProperty("split"); });
  it("PUBLIC_CORPUS[0].meta has dominantConstraint field", () => { expect((PUBLIC_CORPUS[0] as any).meta).toHaveProperty("dominantConstraint"); });
  it("genericAdvise() returns an object", () => { expect(typeof genericAdvise()).toBe("object"); });
  it("genericAdvise() does not throw", () => { expect(() => genericAdvise()).not.toThrow(); });
  it("PUBLIC_CORPUS.some(p => p.meta.split === 'training') is true", () => { expect(PUBLIC_CORPUS.some((p) => (p as any).meta.split === "training")).toBe(true); });
  it("PUBLIC_CORPUS[0].meta has domains field", () => { expect((PUBLIC_CORPUS[0] as any).meta).toHaveProperty("domains"); });
});

describe("public-corpus learning persistence — evidence", () => {
  it("persists >=100 governed artifacts from failures", () => {
    expect(rep.artifactsPersisted).toBeGreaterThanOrEqual(100);
  });
  it("creates/updates >=30 domain playbooks and >=10 whole-business playbooks", () => {
    expect(rep.domainPlaybooks).toBeGreaterThanOrEqual(30);
    expect(rep.wholeBusinessPlaybooks).toBeGreaterThanOrEqual(10);
  });
  it("generates >=100 regression cases and >=25 do-not-repeat/caution/proof/offload rules", () => {
    expect(rep.regressionCases).toBeGreaterThanOrEqual(100);
    expect(rep.doNotRepeatRules + rep.cautionRules + rep.proofRules + rep.offloadRules).toBeGreaterThanOrEqual(25);
  });
  it("proves >=50 rerun improvements (corrected advisor beats the weak one)", () => {
    expect(rep.rerunImprovements).toBeGreaterThanOrEqual(50);
  });
});

describe("public-corpus learning persistence — governance", () => {
  it("every artifact is scope-limited and workspace_private + local_only + pending (no auto global promotion)", () => {
    expect(rep.artifactsAllScopeLimited).toBe(true);
    expect(rep.artifactsAllLocalPending).toBe(true);
  });
  it("no holdout leakage, no cross-workspace leakage, no source-text/PII leakage", () => {
    expect(rep.noHoldoutLearned).toBe(true);
    expect(rep.noCrossWorkspaceLeak).toBe(true);
    expect(rep.noSourceTextLeak).toBe(true);
  });
  it("global promotion is blocked without approval", async () => {
    const all = await rep.store.all();
    expect(all.length).toBeGreaterThan(0);
    await expect(rep.store.promoteToGlobal(all[0].id, "tester", "2026-06-29T00:00:00Z")).rejects.toThrow();
  });
});

describe("public-corpus learning persistence — artifact changes production output", () => {
  it("a persisted artifact improves advice for an in-scope case in the OWNING workspace only", async () => {
    const ws = rep.workspaceId;
    // pick a training case from the corpus and show corrected advice beats weak advice using the store
    const pc = PUBLIC_CORPUS.find((p) => p.meta.split === "training")!;
    const weak = scoreAdvice(pc.case, genericAdvise());
    const corrected = scoreAdvice(pc.case, await advise(pc.case, { store: rep.store, workspaceId: ws }));
    expect(corrected.total).toBeGreaterThan(weak.total);
    // a different workspace sees none of the workspace-private learning
    const otherApplicable = await rep.store.findApplicable({ archetype: pc.case.archetype, decisionCategory: pc.case.decisionCategory, locationKey: "India|tier1", workspaceId: "some-other-ws" });
    expect(otherApplicable.length).toBe(0);
  });
});
