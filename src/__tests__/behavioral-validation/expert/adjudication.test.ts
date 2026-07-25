import { describe, it, expect } from "vitest";
import {
  AdjudicationQueue,
  adjudicatedArtifactUsable,
  evaluateForAdjudication,
  hasSufficientEvidence,
  type AdjudicationItem,
} from "@/behavioral-validation/expert/adjudication";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { baseAdvise } from "@/behavioral-validation/advisor";
import { scoreAdvice } from "@/behavioral-validation/scorer";
import { buildGoldAnswer, compareToGold } from "@/behavioral-validation/expert/gold-answers";
import { deriveCorrection } from "@/behavioral-validation/learning-engine";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import { emptyAdvise } from "@/behavioral-validation/advisor";
import type { LearningArtifact } from "@/behavioral-validation/schema";

const AT = "2026-06-29T00:00:00Z";
const c = SEED_CASES.find((x) => x.id === "A1")!;

function failedArtifact(): LearningArtifact {
  const score = scoreAdvice(c, emptyAdvise());
  return deriveCorrection(c, score, { workspaceId: "ws-1", actor: "trainer", at: AT })!.artifact;
}

function itemFor(over: Partial<AdjudicationItem> = {}): Omit<AdjudicationItem, "status" | "auditTrail"> & { at: string; actor: string } {
  const advice = emptyAdvise();
  const score = scoreAdvice(c, advice);
  return {
    caseId: c.id,
    opsiqOutput: advice,
    goldAnswer: buildGoldAnswer(c),
    scorerResult: score,
    failureLabels: score.failureLabels,
    riskLevel: "high",
    proposedCorrection: "Block discretionary spend until margin and quality proof pass.",
    proposedLearningArtifact: failedArtifact(),
    triggers: ["possible_unsafe_output"],
    proposeGlobalPromotion: false,
    at: AT,
    actor: "trainer",
    ...over,
  };
}

describe("expert adjudication queue — module contract assertions", () => {
  it("AdjudicationQueue is a class (function)", () => { expect(typeof AdjudicationQueue).toBe("function"); });
  it("adjudicatedArtifactUsable is a function", () => { expect(typeof adjudicatedArtifactUsable).toBe("function"); });
  it("evaluateForAdjudication is a function", () => { expect(typeof evaluateForAdjudication).toBe("function"); });
  it("hasSufficientEvidence is a function", () => { expect(typeof hasSufficientEvidence).toBe("function"); });
  it("InMemoryLearningStore is a class (function)", () => { expect(typeof InMemoryLearningStore).toBe("function"); });
  it("baseAdvise is a function", () => { expect(typeof baseAdvise).toBe("function"); });
  it("scoreAdvice is a function", () => { expect(typeof scoreAdvice).toBe("function"); });
  it("buildGoldAnswer is a function", () => { expect(typeof buildGoldAnswer).toBe("function"); });
  it("compareToGold is a function", () => { expect(typeof compareToGold).toBe("function"); });
  it("deriveCorrection is a function", () => { expect(typeof deriveCorrection).toBe("function"); });
  it("SEED_CASES is a non-empty array", () => { expect(Array.isArray(SEED_CASES)).toBe(true); expect(SEED_CASES.length).toBeGreaterThan(0); });
  it("emptyAdvise is a function", () => { expect(typeof emptyAdvise).toBe("function"); });
  it("c is defined and not null", () => { expect(c).toBeDefined(); expect(c).not.toBeNull(); });
  it("c.id === 'A1'", () => { expect(c.id).toBe("A1"); });
  it("new InMemoryLearningStore() instanceof InMemoryLearningStore", () => { expect(new InMemoryLearningStore()).toBeInstanceOf(InMemoryLearningStore); });
});

describe("expert adjudication queue", () => {
  it("an uncertain (low-confidence) case enters adjudication", () => {
    const advice = { ...baseAdvise(c), dataConfidence: "low" as const };
    const triggers = evaluateForAdjudication(c, advice, scoreAdvice(c, advice), compareToGold(advice, buildGoldAnswer(c)), { goldQuality: "REQUIRED", proposeGlobalPromotion: false, priorFailuresInDomain: 0 });
    expect(triggers).toContain("low_confidence_scoring");
  });

  it("a possibly-unsafe output is flagged for adjudication", () => {
    const advice = emptyAdvise();
    const triggers = evaluateForAdjudication(c, advice, scoreAdvice(c, advice), compareToGold(advice, buildGoldAnswer(c)), { goldQuality: "REQUIRED", proposeGlobalPromotion: false, priorFailuresInDomain: 0 });
    expect(triggers).toContain("possible_unsafe_output");
    expect(triggers).toContain("large_gold_discrepancy");
  });

  it("high-risk global learning requires adjudication", () => {
    const advice = baseAdvise(c);
    const triggers = evaluateForAdjudication(c, advice, scoreAdvice(c, advice), compareToGold(advice, buildGoldAnswer(c)), { goldQuality: "REQUIRED", proposeGlobalPromotion: true, priorFailuresInDomain: 0 });
    expect(triggers).toContain("global_promotion_requested");
  });

  it("a queue item carries enough evidence for review", () => {
    const store = new InMemoryLearningStore();
    const q = new AdjudicationQueue(store);
    const item = q.enqueue(itemFor());
    expect(hasSufficientEvidence(item)).toBe(true);
    expect(adjudicatedArtifactUsable(item)).toBe(false); // pending → not usable
  });

  it("approval promotes the artifact through the governed store", async () => {
    const store = new InMemoryLearningStore();
    const q = new AdjudicationQueue(store);
    q.enqueue(itemFor({ proposeGlobalPromotion: true }));
    const approved = await q.approve(c.id, "expert", AT);
    expect(approved.status).toBe("approved");
    expect(adjudicatedArtifactUsable(approved)).toBe(true);
    const stored = await store.getById(approved.proposedLearningArtifact.id);
    expect(stored?.approvalStatus).toBe("approved");
    expect(stored?.scope).toBe("global_template");
  });

  it("rejection prevents the artifact from being used (never saved/promoted)", async () => {
    const store = new InMemoryLearningStore();
    const q = new AdjudicationQueue(store);
    const item = q.enqueue(itemFor());
    const rejected = await q.reject(c.id, "expert", AT);
    expect(rejected.status).toBe("rejected");
    expect(adjudicatedArtifactUsable(rejected)).toBe(false);
    expect(await store.getById(item.proposedLearningArtifact.id)).toBeNull(); // never persisted
  });
});
