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
    // Round-3 hostile-review fix: PLAN_FINITE_VERB itself (is/are/was/...) can appear inside the SAME
    // relative clause and was still scanning the full clause (unfixed by the round-2 fix, which only
    // narrowed PLAN_FACTUAL_REPORTING_VERB) — reproducing the identical false-negative via a different
    // word.
    "Stop the campaign that is losing money.",
    "Never resume the initiative that was unprofitable last quarter.",
    // Round-3 hostile-review fix: the relative-clause split only covered "that"/"which"; "who"/"whose"
    // reproduced the same false-negative.
    "Avoid the plan whose costs increased.",
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
    // Round-4 hostile-review fix: a NONRESTRICTIVE, comma-set-off relative clause interposed BEFORE the
    // main verb must not truncate away that verb — "No more delays, which were flagged, occurred this
    // quarter." is still a plain factual report (the parenthetical aside on "delays" is not the sentence's
    // own claim).
    "No more delays, which were flagged, occurred this quarter.",
    // Round-5 hostile-review fix: two back-to-back comma-set-off asides sharing a boundary comma must
    // not starve the second aside of its leading comma.
    "No more delays, which were flagged, which were also logged, occurred this quarter.",
    // Round-6 hostile-review fix: the same aside can be set off with en/em dashes instead of commas.
    "No more delays — which were flagged — occurred this quarter.",
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

describe("R10 P2-1 round-3 hostile-review mutation proof: scanning the WHOLE clause (including relative clauses) for PLAN_FINITE_VERB reproduces the false-negative regression", () => {
  it("mutation check: an unscoped whole-clause finite-verb scan wrongly disarms a genuine imperative containing a relative clause", () => {
    const UNSCOPED_FINITE_VERB = /\b(?:is|are|was|were|has|have|had|did|does|been|being|will|would|could|should|fell|rose|grew|went|came|stayed|became|remained|seemed|showed|shows)\b/i;
    const clause = "the campaign that is losing money";
    // The buggy, unscoped whole-clause version WOULD misclassify this as factual (proves the mutation
    // actually reproduces the regression, not merely asserts it):
    expect(UNSCOPED_FINITE_VERB.test(clause)).toBe(true);
    // The real classifier does not, because it excludes the relative clause before scanning:
    expect(isWholeBusinessImperative("Stop the campaign that is losing money.")).toBe(true);
  });
});

describe("R10 P2-1 round-3: documented limitation — a REDUCED relative clause (no that/which/who/whose) is not detected", () => {
  it("KNOWN LIMITATION, accepted and non-blocking: a reporting verb inside a pronoun-less reduced relative clause still disarms the imperative", () => {
    // "having increased costs" has no "that"/"which"/"who"/"whose" pronoun for the mainClauseOnly split
    // to key off, so PLAN_FACTUAL_REPORTING_VERB's match on "increased" still marks the whole clause
    // factual. Recognising a reduced relative clause without a pronoun needs part-of-speech tagging,
    // which is out of scope for this dependency-free regex classifier (see the KNOWN LIMITATION comment
    // in planClauseIsFactual). This test documents current, accepted behavior — not a target to fix here.
    expect(isWholeBusinessImperative("Avoid initiatives having increased costs.")).toBe(false);
  });
});

describe("R10 P2-1 round-4 hostile-review mutation proof: a naive first-occurrence split (with no comma-aside stripping) reproduces the false-negative on a subject-modifying nonrestrictive relative clause", () => {
  it("mutation check: splitting at the first pronoun occurrence alone would discard the real main-clause verb that comes AFTER a comma-set-off aside", () => {
    const clause = "delays, which were flagged, occurred this quarter";
    const naiveMainClauseOnly = clause.split(/\b(?:that|which|who|whose)\b/i)[0] ?? clause;
    // The buggy, naive split WOULD discard "occurred" (proves the mutation reproduces the regression):
    expect(/\boccurred\b/i.test(naiveMainClauseOnly)).toBe(false);
    // The real classifier strips the comma-set-off aside first, so "occurred" survives:
    expect(isWholeBusinessImperative("No more delays, which were flagged, occurred this quarter.")).toBe(false);
  });
});

describe("R10 P2-1 round-5 hostile-review mutation proof: a comma-consuming aside-strip regex starves a second, back-to-back aside of its shared leading comma", () => {
  it("mutation check: consuming the closing comma (instead of a lookahead) leaves the second aside's own verb intact but unstripped, and the FIRST aside's own reporting verb ('flagged') would then leak into the scan", () => {
    const clause = "delays, which were flagged, which were also logged, occurred this quarter";
    const consumingRegex = /,\s*(?:that|which|who|whose)\b[^,]*,/gi;
    const buggyResult = clause.replace(consumingRegex, "");
    // The buggy, comma-consuming regex only strips the FIRST aside (the second aside's leading comma was
    // already eaten as the first aside's closing comma), leaving "which were also logged" unstripped —
    // proving the mutation reproduces the starvation:
    expect(buggyResult).toContain("which were also logged");
    // The real classifier (lookahead-based) strips both asides, so "occurred" is classified correctly:
    expect(isWholeBusinessImperative("No more delays, which were flagged, which were also logged, occurred this quarter.")).toBe(false);
  });
});

describe("R10 P2-1 round-5: documented limitation — a RESTRICTIVE relative clause with no surrounding commas, interposed before the main verb, is not detected", () => {
  it("KNOWN LIMITATION, accepted and non-blocking: an unpunctuated relative clause before the real verb still disarms factual detection", () => {
    // "delays that were flagged occurred" has no comma at all to bound the relative clause, so the
    // first-occurrence split still discards "occurred". Distinguishing this from a genuine trailing
    // restrictive clause ("the campaign that dropped conversions" — no content after it) requires
    // knowing where an unpunctuated clause ends, which needs part-of-speech tagging — out of scope for
    // this dependency-free regex classifier. This test documents current, accepted behavior.
    expect(isWholeBusinessImperative("No more delays that were flagged occurred this quarter.")).toBe(true);
  });
});

describe("R10 P2-1 round-6 hostile-review mutation proof: an aside-strip regex without dash support reproduces the false-negative via em-dash delimiters", () => {
  it("mutation check: stripping only comma-delimited asides leaves the dash-delimited aside's verb outside the strip, but the resumed main clause still carries the real verb", () => {
    const clause = "delays — which were flagged — occurred this quarter";
    const commaOnlyStrip = clause.replace(/,\s*(?:that|which|who|whose)\b[^,]*(?=,)/gi, "");
    const naiveMainClauseOnly = commaOnlyStrip.split(/\b(?:that|which|who|whose)\b/i)[0] ?? commaOnlyStrip;
    // The comma-only strip does nothing here (no commas), so the naive split still discards "occurred"
    // (proves the mutation reproduces the regression):
    expect(/\boccurred\b/i.test(naiveMainClauseOnly)).toBe(false);
    // The real classifier also strips dash-delimited asides, so "occurred" survives:
    expect(isWholeBusinessImperative("No more delays — which were flagged — occurred this quarter.")).toBe(false);
  });
});

describe("R10 P2-1 round-6: documented limitations — semicolon-delimited asides and compound (multi-lead) prohibitions", () => {
  it("KNOWN LIMITATION, accepted and non-blocking: a semicolon-delimited relative-clause aside is never stripped (the sentence-splitter treats ';' as a hard boundary first)", () => {
    // A semicolon cannot standardly introduce a relative-clause aside in English (semicolons join
    // independent clauses) — this construction is not organic business prose, unlike the comma/dash
    // forms already fixed. Documents current, accepted behavior.
    expect(isWholeBusinessImperative("No more delays; which were flagged; occurred this quarter.")).toBe(true);
  });

  it("KNOWN LIMITATION, accepted and non-blocking: a compound sentence with two prohibition leads classifies correctly but its REWRITTEN TEXT only converts the first clause", () => {
    // Classification (imperative/heldBack) is correct either way — only the cosmetic rewritten text is
    // affected, and callers that need the classification (not the reworded text) are unaffected.
    const statement = "Do not add growth spend and never discount further until cash is safe.";
    expect(isWholeBusinessImperative(statement)).toBe(true);
    const n = neutralizePlanImperatives(statement);
    expect(n.heldBack).toBe(true);
    expect(n.text).toMatch(/the plan analysis holds back/i);
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
