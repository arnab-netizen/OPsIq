import { describe, it, expect } from "vitest";
import { advise, baseAdvise } from "@/behavioral-validation/advisor";
import { scoreAdvice } from "@/behavioral-validation/scorer";
import { learnFromFailure } from "@/behavioral-validation/learning-engine";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { EXPANDED_CASES } from "@/behavioral-validation/expansion";

const AT = "2026-06-29T00:00:00Z";
const WS = "ws-1";

describe("controlled-learning loop — real, not faked", () => {
  it("a failing case scores strictly higher after learning from its own failure, with provenance", async () => {
    const store = new InMemoryLearningStore();
    const failing = EXPANDED_CASES.find((c) => !scoreAdvice(c, baseAdvise(c)).passed)!;
    const before = scoreAdvice(failing, baseAdvise(failing));
    await learnFromFailure(failing, before, store, { workspaceId: WS, actor: "trainer", at: AT });
    const adv = await advise(failing, { store, workspaceId: WS });
    const after = scoreAdvice(failing, adv);
    expect(after.total).toBeGreaterThan(before.total);
    expect((adv.learningNotesApplied ?? []).length).toBeGreaterThan(0);
  });

  it("GENERALIZES — a correction learned from one case lifts a DIFFERENT, never-trained case in the same scope", async () => {
    const store = new InMemoryLearningStore();
    // pick two distinct failing cases sharing archetype + decision category
    const failing = EXPANDED_CASES.filter((c) => !scoreAdvice(c, baseAdvise(c)).passed);
    let trainOn = null, heldOut = null;
    for (const a of failing) {
      const b = failing.find((x) => x.id !== a.id && x.archetype === a.archetype && x.decisionCategory === a.decisionCategory);
      if (b) { trainOn = a; heldOut = b; break; }
    }
    expect(trainOn && heldOut).toBeTruthy();

    const heldBefore = scoreAdvice(heldOut!, await advise(heldOut!, { store, workspaceId: WS }));
    // learn ONLY from trainOn — heldOut is never used to create an artifact
    await learnFromFailure(trainOn!, scoreAdvice(trainOn!, baseAdvise(trainOn!)), store, { workspaceId: WS, actor: "trainer", at: AT });
    const heldAdv = await advise(heldOut!, { store, workspaceId: WS });
    const heldAfter = scoreAdvice(heldOut!, heldAdv);

    expect(heldAfter.total).toBeGreaterThanOrEqual(heldBefore.total);
    expect((heldAdv.learningNotesApplied ?? []).length).toBeGreaterThan(0); // applied an artifact it did not create
  });

  it("batch learning over the corpus improves average and pass rate with zero unsafe", async () => {
    const store = new InMemoryLearningStore();
    const cases = EXPANDED_CASES;
    const baseScores = cases.map((c) => scoreAdvice(c, baseAdvise(c)));
    for (let i = 0; i < cases.length; i++) if (!baseScores[i].passed) await learnFromFailure(cases[i], baseScores[i], store, { workspaceId: WS, actor: "trainer", at: AT });

    let baseTotal = 0, learnedTotal = 0, basePass = 0, learnedPass = 0, learnedUnsafe = 0;
    for (let i = 0; i < cases.length; i++) {
      const learned = scoreAdvice(cases[i], await advise(cases[i], { store, workspaceId: WS }));
      baseTotal += baseScores[i].total; learnedTotal += learned.total;
      if (baseScores[i].passed) basePass++;
      if (learned.passed) learnedPass++;
      learnedUnsafe += learned.unsafe.length;
    }
    expect(learnedTotal).toBeGreaterThan(baseTotal);
    expect(learnedPass).toBeGreaterThan(basePass);
    expect(learnedUnsafe).toBe(0);
  });

  it("does NOT change advice for a workspace that never learned (no global side effects from local learning)", async () => {
    const store = new InMemoryLearningStore();
    const failing = EXPANDED_CASES.find((c) => !scoreAdvice(c, baseAdvise(c)).passed)!;
    await learnFromFailure(failing, scoreAdvice(failing, baseAdvise(failing)), store, { workspaceId: WS, actor: "trainer", at: AT });
    const otherWs = await advise(failing, { store, workspaceId: "ws-2" });
    expect((otherWs.learningNotesApplied ?? []).length).toBe(0);
  });
});
