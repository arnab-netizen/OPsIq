/**
 * Round 10 P2-1 — isWholeBusinessImperative (owner-imperatives.ts): the one pure classifier answering
 * whether a plan statement is a whole-business imperative that must be reconciled with the canonical
 * owner decision, built on the SAME structural per-sentence rules neutralizePlanImperatives uses to
 * reword plan text (never a second, separately maintained rule set).
 */
import { describe, it, expect } from "vitest";
import { isWholeBusinessImperative, neutralizePlanImperatives } from "@/domain/owner-spine/owner-imperatives";

describe("R10 P2-1: isWholeBusinessImperative — must classify as imperative", () => {
  it.each([
    "First: stop increasing spend.",
    "First, while demand is weak, stop adding channels.",
    "Do not, for now, add capacity.",
    "Stop (until the margin recovers) increasing acquisition.",
    "Avoid scaling this campaign.",
    "Before anything else, fix collections.",
    "You must reduce discretionary spend.",
  ])("%s", (statement) => {
    expect(isWholeBusinessImperative(statement)).toBe(true);
  });
});

describe("R10 P2-1: isWholeBusinessImperative — must NOT classify as imperative (factual prose)", () => {
  it.each([
    "The first period showed weaker sales.",
    "No more than 10% of revenue came from this channel.",
    "The customer stopped ordering last month.",
    "Costs increased first, then revenue followed.",
    "Supplier status: never reviewed since 2024.",
    // Hostile-review fix: an ordinary subject-verb-object factual clause using a past-tense
    // REPORTING verb ("occurred"/"happened"/"took place") is never an imperative, even when a
    // prohibition-lead phrase ("No more") is stripped from the front, leaving the subject noun
    // (not the verb) as the clause's first word.
    "No more stock-outs occurred.",
    "No more delays occurred this quarter.",
    "No more complaints happened last week.",
    "The outage took place before the fix shipped.",
  ])("%s", (statement) => {
    expect(isWholeBusinessImperative(statement)).toBe(false);
  });
});

describe("R10 P2-1: isWholeBusinessImperative agrees with neutralizePlanImperatives (one classifier, not two)", () => {
  it("every imperative example is also rewritten/held back by the text reconciler", () => {
    for (const s of [
      "First: stop increasing spend.",
      "First, while demand is weak, stop adding channels.",
      "Avoid scaling this campaign.",
      "Before anything else, fix collections.",
    ]) {
      const n = neutralizePlanImperatives(s);
      expect(n.text, s).not.toBe(s);
    }
  });
  it("every factual example is left completely unchanged by the text reconciler", () => {
    for (const s of ["The first period showed weaker sales.", "Costs increased first, then revenue followed."]) {
      expect(neutralizePlanImperatives(s).text, s).toBe(s);
    }
  });
});

describe("R10 P2-1: mutation sensitivity — the comma-introduced-prohibition fix is load-bearing", () => {
  it("a fronted subordinate clause before a comma-introduced prohibition is caught, not just the ordering lead", () => {
    // Reproduces on 14c36b12: "First," was stripped (ordering claim recognized), but the mid-sentence
    // prohibition "stop adding channels" (reached only via a plain comma, not a dash/colon) was missed —
    // the sentence was reworded to drop "First," but never marked heldBack, and "stop adding channels"
    // was never converted to "the plan analysis holds back ...".
    const n = neutralizePlanImperatives("First, while demand is weak, stop adding channels.");
    expect(n.heldBack).toBe(true);
    expect(n.text).toMatch(/the plan analysis holds back adding channels/);
  });
});
