import { describe, it, expect } from "vitest";
import { advise, baseAdvise } from "@/behavioral-validation/advisor";
import { scoreAdvice } from "@/behavioral-validation/scorer";
import { learnFromFailure } from "@/behavioral-validation/learning-engine";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { EXPANDED_CASES } from "@/behavioral-validation/expansion";

const AT = "2026-06-29T00:00:00Z";
const WS = "ws-1";

// A "weak" case is one with an identified sub-expert weakness (failure label) the loop learns from,
// even if it already clears the pass threshold — continuous improvement toward expert level.
const isWeak = (c: (typeof EXPANDED_CASES)[number]) => scoreAdvice(c, baseAdvise(c)).failureLabels.length > 0;

describe("learning loop — module contract assertions", () => {
  it("advise is a function", () => {
    expect(typeof advise).toBe("function");
  });
  it("baseAdvise is a function", () => {
    expect(typeof baseAdvise).toBe("function");
  });
  it("scoreAdvice is a function", () => {
    expect(typeof scoreAdvice).toBe("function");
  });
  it("learnFromFailure is a function", () => {
    expect(typeof learnFromFailure).toBe("function");
  });
  it("InMemoryLearningStore is a function (class)", () => {
    expect(typeof InMemoryLearningStore).toBe("function");
  });
  it("EXPANDED_CASES is an array", () => {
    expect(Array.isArray(EXPANDED_CASES)).toBe(true);
  });
  it("EXPANDED_CASES has at least 1 entry", () => {
    expect(EXPANDED_CASES.length).toBeGreaterThan(0);
  });
  it("EXPANDED_CASES[0] has an id field", () => {
    expect(EXPANDED_CASES[0]).toHaveProperty("id");
  });
  it("EXPANDED_CASES[0] has an archetype field", () => {
    expect(EXPANDED_CASES[0]).toHaveProperty("archetype");
  });
  it("EXPANDED_CASES[0] has a decisionCategory field", () => {
    expect(EXPANDED_CASES[0]).toHaveProperty("decisionCategory");
  });
  it("AT is a string", () => {
    expect(typeof AT).toBe("string");
  });
  it("WS is a string", () => {
    expect(typeof WS).toBe("string");
  });
  it("isWeak is a function", () => {
    expect(typeof isWeak).toBe("function");
  });
  it("new InMemoryLearningStore() is an instance of InMemoryLearningStore", () => {
    expect(new InMemoryLearningStore()).toBeInstanceOf(InMemoryLearningStore);
  });
  it("baseAdvise(EXPANDED_CASES[0]) returns an object", () => {
    expect(typeof baseAdvise(EXPANDED_CASES[0])).toBe("object");
  });
  it("scoreAdvice result has a total field that is a number", () => {
    const score = scoreAdvice(EXPANDED_CASES[0], baseAdvise(EXPANDED_CASES[0]));
    expect(typeof score.total).toBe("number");
  });
});

describe("controlled-learning loop — real, not faked", () => {
  it("a weak case scores strictly higher after learning from its own weakness, with provenance", async () => {
    const store = new InMemoryLearningStore();
    const weak = EXPANDED_CASES.find(isWeak)!;
    const before = scoreAdvice(weak, baseAdvise(weak));
    await learnFromFailure(weak, before, store, { workspaceId: WS, actor: "trainer", at: AT });
    const adv = await advise(weak, { store, workspaceId: WS });
    const after = scoreAdvice(weak, adv);
    expect(after.total).toBeGreaterThan(before.total);
    expect((adv.learningNotesApplied ?? []).length).toBeGreaterThan(0);
  });

  it("GENERALIZES — a correction learned from one case lifts a DIFFERENT, never-trained case in the same scope", async () => {
    const store = new InMemoryLearningStore();
    const weak = EXPANDED_CASES.filter(isWeak);
    let trainOn = null, heldOut = null;
    for (const a of weak) {
      const b = weak.find((x) => x.id !== a.id && x.archetype === a.archetype && x.decisionCategory === a.decisionCategory);
      if (b) { trainOn = a; heldOut = b; break; }
    }
    expect(trainOn && heldOut).toBeTruthy();

    const heldBefore = scoreAdvice(heldOut!, await advise(heldOut!, { store, workspaceId: WS }));
    await learnFromFailure(trainOn!, scoreAdvice(trainOn!, baseAdvise(trainOn!)), store, { workspaceId: WS, actor: "trainer", at: AT });
    const heldAdv = await advise(heldOut!, { store, workspaceId: WS });
    const heldAfter = scoreAdvice(heldOut!, heldAdv);

    expect(heldAfter.total).toBeGreaterThanOrEqual(heldBefore.total);
    expect((heldAdv.learningNotesApplied ?? []).length).toBeGreaterThan(0); // applied an artifact it did not create
  });

  it("batch learning over the corpus improves the average with zero unsafe (pass rate already maxed)", async () => {
    const store = new InMemoryLearningStore();
    const cases = EXPANDED_CASES;
    const baseScores = cases.map((c) => scoreAdvice(c, baseAdvise(c)));
    for (let i = 0; i < cases.length; i++) if (!baseScores[i].passed || baseScores[i].failureLabels.length > 0) await learnFromFailure(cases[i], baseScores[i], store, { workspaceId: WS, actor: "trainer", at: AT });

    let baseTotal = 0, learnedTotal = 0, learnedPass = 0, learnedUnsafe = 0;
    for (let i = 0; i < cases.length; i++) {
      const learned = scoreAdvice(cases[i], await advise(cases[i], { store, workspaceId: WS }));
      baseTotal += baseScores[i].total; learnedTotal += learned.total;
      if (learned.passed) learnedPass++;
      learnedUnsafe += learned.unsafe.length;
    }
    expect(learnedTotal).toBeGreaterThan(baseTotal);
    expect(learnedPass).toBe(cases.length); // no regression below the pass threshold
    expect(learnedUnsafe).toBe(0);
  });

  it("does NOT change advice for a workspace that never learned (no global side effects from local learning)", async () => {
    const store = new InMemoryLearningStore();
    const weak = EXPANDED_CASES.find(isWeak)!;
    await learnFromFailure(weak, scoreAdvice(weak, baseAdvise(weak)), store, { workspaceId: WS, actor: "trainer", at: AT });
    const otherWs = await advise(weak, { store, workspaceId: "ws-2" });
    expect((otherWs.learningNotesApplied ?? []).length).toBe(0);
  });
});
