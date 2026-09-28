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
    // Round-10-round-2 hostile-review fix: a reporting verb (occurred/dropped/resulted/...) inside a
    // RELATIVE clause ("that dropped...", "that resulted in...") describes the object, not a fact the
    // sentence itself reports — the genuine imperative must still be recognised.
    "Stop the campaign that dropped conversions last quarter.",
    "Never resume marketing spend that resulted in the prior loss.",
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
    // Round-10-round-2 hostile-review fix: broadened whitelist coverage for common business-reporting
    // past-tense verbs beyond the original 8 (documented as a maintained, non-exhaustive list).
    "No more stock-outs worsened.",
    "No more stock-outs improved.",
    "No more delays climbed this quarter.",
  ])("%s", (statement) => {
    expect(isWholeBusinessImperative(statement)).toBe(false);
  });
});

describe("R10 P2-1 round-2 hostile-review mutation proof: scanning the WHOLE clause (including relative clauses) for factual-reporting verbs reproduces the false-negative regression", () => {
  it("mutation check: an unscoped whole-clause scan wrongly disarms a genuine imperative containing a relative clause", () => {
    const UNSCOPED_FACTUAL_REPORTING_VERB = /\b(?:occurred|happened|took\s+place|resulted|declined|dropped|increased|decreased)\b/i;
    const clause = "Stop the campaign that dropped conversions last quarter";
    // The buggy, unscoped whole-clause version WOULD misclassify this as factual (proves the mutation
    // actually reproduces the regression, not merely asserts it):
    expect(UNSCOPED_FACTUAL_REPORTING_VERB.test(clause)).toBe(true);
    // The real classifier does not, because it excludes the relative clause before scanning:
    expect(isWholeBusinessImperative("Stop the campaign that dropped conversions last quarter.")).toBe(true);
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
