/**
 * Owner Outcome Timeline v1 — pure presentation rules: zero/unknown semantics, wording safety, stages, trackability,
 * contract mapping and submit-attempt keys. No component, no I/O.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  ATTRIBUTION_VIEW, EXECUTION_VIEW, ISSUE_VIEW, LEARNING_VIEW, MEASUREMENT_VIEW, OBSERVATION_VIEW, TARGET_VIEW,
  UNTRACKABLE_CANDIDATE_CLASSES, assessmentHistory, attemptFor, attributionView, buildTimelineStages, candidateTrackability, canCheckOutcome,
  chainFreshness, contractFormFromDecision, contractFormToRequest, contractLines, decisionHistory, formatKnownNumber, measurementView,
  originalRecommendation, verificationSummary, EMPTY_CONTRACT_FORM,
  type OwnerOutcomeChainDto,
} from "@/domain/owner-spine/owner-outcome-presentation";

import { UUID, assessment, chain, decision } from "./fixtures";
const stage = (c: OwnerOutcomeChainDto, id: string) => buildTimelineStages(c).find((s) => s.id === id)!;

describe("zero state and unknown values", () => {
  it("a chain with a decision but no assessment shows every later stage as waiting — nothing fabricated", () => {
    const stages = buildTimelineStages(chain());
    for (const id of ["execution", "observation", "measurement", "target", "issue", "attribution", "learning"]) {
      const st = stages.find((s) => s.id === id)!;
      expect(st.state, id).toBe("pending");
      expect(st.headline, id).toBe("Not checked yet");
      expect(st.code, id).toBeUndefined();
    }
  });
  it("formats unknown as unknown and a real zero as 0", () => {
    expect(formatKnownNumber(null)).toBe("Not set");
    expect(formatKnownNumber(undefined)).toBe("Not set");
    expect(formatKnownNumber(0)).toBe("0");
  });
  it("contract lines: no target is not target 0; baseline 0 keeps its provenance; unknown direction is stated as unspecified", () => {
    const none = Object.fromEntries(contractLines(decision()).map((l) => [l.label, l.value]));
    expect(none["Target"]).toBe("No target set");
    expect(none["Starting value"]).toBe("Not set");
    expect(none["Direction"]).toBe("Direction not specified");
    const zero = Object.fromEntries(contractLines(decision({ baselineValue: 0, baselineProvenance: "OWNER_REPORTED", targetValue: 0, targetDirection: "down" })).map((l) => [l.label, l.value]));
    expect(zero["Target"]).toBe("0");
    expect(zero["Starting value"]).toBe("0 (reported by you)");
    expect(zero["Direction"]).toBe("Lower is better");
  });
});

describe("contract form → request (shape only)", () => {
  it("blank is null, a typed 0 stays 0, direction is never inferred", () => {
    const body = contractFormToRequest({ ...EMPTY_CONTRACT_FORM, verificationMetric: "Cash balance falling", baselineValue: "0", baselineProvenance: "OWNER_REPORTED", targetValue: "0" });
    expect(body.baselineValue).toBe(0);
    expect(body.targetValue).toBe(0);
    expect(body.targetDirection).toBeNull(); // not "down", despite "falling" in the metric's wording
    expect(body.observationWindowDays).toBeNull();
    expect(body.commitmentDescription).toBeNull();
  });
  it("sends up / down / unknown exactly as chosen", () => {
    for (const d of ["up", "down", "unknown"]) expect(contractFormToRequest({ ...EMPTY_CONTRACT_FORM, targetDirection: d }).targetDirection).toBe(d);
  });
  it("never turns invalid text into null: non-numeric stays text so the server rejects it", () => {
    const body = contractFormToRequest({ ...EMPTY_CONTRACT_FORM, baselineValue: "abc" });
    expect(body.baselineValue).toBe("abc");
    expect(JSON.stringify(body)).toContain('"baselineValue":"abc"');
  });
  it("does not duplicate the provenance rule: a baseline without provenance is sent as-is for the server to reject", () => {
    const body = contractFormToRequest({ ...EMPTY_CONTRACT_FORM, baselineValue: "5" });
    expect(body.baselineValue).toBe(5);
    expect(body.baselineProvenance).toBeNull();
  });
  it("converts the planned-finish date to an ISO instant and round-trips a stored contract into the amendment form", () => {
    expect(contractFormToRequest({ ...EMPTY_CONTRACT_FORM, intendedCompletionDate: "2026-08-01" }).intendedCompletionAt).toBe("2026-08-01T00:00:00.000Z");
    const f = contractFormFromDecision(decision({ baselineValue: 0, baselineProvenance: "MEASURED", targetValue: null, intendedCompletionAt: "2026-08-01T00:00:00.000Z" }));
    expect(f.baselineValue).toBe("0");
    expect(f.targetValue).toBe("");
    expect(f.intendedCompletionDate).toBe("2026-08-01");
  });
});

describe("wording safety", () => {
  const ALL = [...Object.values(EXECUTION_VIEW), ...Object.values(OBSERVATION_VIEW), ...Object.values(MEASUREMENT_VIEW), ...Object.values(TARGET_VIEW),
    ...Object.values(ISSUE_VIEW), ...Object.values(ATTRIBUTION_VIEW), ...Object.values(LEARNING_VIEW)];
  it("no label or caveat claims causation, proof, success or a solved problem", () => {
    for (const v of ALL) {
      const text = `${v.label} ${v.caveat ?? ""}`.toLowerCase();
      expect(text, v.code).not.toMatch(/\b(caused|causes|proven|proved|proof|worked|solved|fixed|guaranteed)\b/);
    }
  });
  it("IMPROVED stays 'Improved' and carries a visible caveat; it never says the recommendation worked", () => {
    const v = measurementView("IMPROVED");
    expect(v.label).toBe("Improved");
    expect(v.caveat).toMatch(/does not by itself show/i);
  });
  it("TARGET_REACHED is not 'resolved'; only the persisted issue state says resolved", () => {
    expect(TARGET_VIEW.REACHED.label).toBe("Target reached");
    expect(TARGET_VIEW.REACHED.label.toLowerCase()).not.toContain("resolved");
    expect(TARGET_VIEW.REACHED.caveat).toMatch(/does not by itself mean/i);
    const c = chain({ assessments: [assessment({ targetAttainment: "REACHED", issueResolution: "NOT_YET_REASSESSED" })] });
    expect(stage(c, "target").headline).toBe("Target reached");
    expect(stage(c, "issue").headline).toBe("Needs a newer diagnosis");
    expect(stage(c, "issue").headline.toLowerCase()).not.toContain("resolved");
  });
  it("RESOLVED is shown only when the persisted issue resolution is RESOLVED", () => {
    for (const r of ["STILL_OPEN", "WORSENED", "NOT_YET_REASSESSED", "INCONCLUSIVE"] as const) {
      const c = chain({ assessments: [assessment({ issueResolution: r })] });
      expect(stage(c, "issue").headline.toLowerCase(), r).not.toMatch(/resolved/);
    }
    const resolved = chain({ assessments: [assessment({ issueResolution: "RESOLVED" })] });
    expect(stage(resolved, "issue").headline).toBe("Resolved in a newer diagnosis");
  });
  it("PLAUSIBLE is 'Possible contribution' with the cannot-prove caveat; NOT_ASSESSED is not 'no relationship'", () => {
    expect(attributionView("PLAUSIBLE").label).toBe("Possible contribution");
    expect(attributionView("PLAUSIBLE").caveat).toMatch(/cannot show that your action was the reason/i);
    const na = attributionView("NOT_ASSESSED");
    expect(na.label).toBe("Not assessed");
    expect(`${na.label} ${na.caveat}`.toLowerCase()).not.toMatch(/no (causal )?(relationship|effect|link|impact)/);
    expect(na.caveat).toMatch(/not a finding either way/i);
  });
  it("confounded and disputed results stay visible and distinct", () => {
    expect(measurementView("EXTERNALLY_CONFOUNDED").label).toBe("Outside events affected the result");
    expect(measurementView("DISPUTED").label).toBe("Result disputed");
    expect(measurementView("EXTERNALLY_CONFOUNDED").label).not.toBe(measurementView("DISPUTED").label);
    expect(attributionView("CONFOUNDED").label).toBe("Other factors affected the result");
    expect(attributionView("DISPUTED").label).toBe("Result disputed");
  });
  it("an unknown persisted value (a future policy version) is shown verbatim, never mapped to something friendlier", () => {
    const v = measurementView("SOMETHING_NEW");
    expect(v.label).toBe("SOMETHING_NEW");
    expect(v.tone).toBe("neutral");
  });
  it("the persisted code is kept on every reached stage as secondary detail", () => {
    const c = chain({ assessments: [assessment()] });
    expect(stage(c, "measurement").code).toBe("IMPROVED");
    expect(stage(c, "attribution").code).toBe("PLAUSIBLE");
    expect(stage(c, "learning").code).toBe("PENDING_GOVERNANCE");
  });
  it("an owner-entered / self check is never presented as independently verified", () => {
    expect(verificationSummary(assessment({ independentlyVerified: false, selfVerified: true, verifierKind: "SELF" }))).toMatch(/not independent/i);
    expect(verificationSummary(assessment({ independentlyVerified: false, selfVerified: false, verifierKind: "NONE" }))).toBe("Not independently verified");
    expect(verificationSummary(assessment({ independentlyVerified: true }))).toBe("Checked independently");
  });
});

describe("decision states", () => {
  it("ACCEPTED: the commitment is the recommended action", () => {
    const c = stage(chain(), "committed");
    expect(c.code).toBe("AS_RECOMMENDED");
    expect(c.state).toBe("reached");
  });
  it("MODIFIED: shows the owner's own action, flags it as different, and keeps the original recommendation alongside", () => {
    const c = chain({ decisions: [decision({ decisionState: "MODIFIED", commitmentDescription: "Cut supplier costs instead" })] });
    const committed = stage(c, "committed");
    expect(committed.headline).toBe("Cut supplier costs instead");
    expect(committed.code).toBe("MODIFIED_BY_OWNER");
    expect(committed.detail).toMatch(/not the one OpsIQ recommended/i);
    expect(stage(c, "recommended").headline).toBe("Raise prices on the two weakest products");
    expect(stage(c, "decided").headline).toBe("You decided to do something different");
  });
  it("DEFERRED and REJECTED are 'no commitment'; no execution or outcome stage applies, even if an assessment exists", () => {
    for (const state of ["DEFERRED", "REJECTED"] as const) {
      const c = chain({ decisions: [decision({ decisionState: state, revisitAt: state === "DEFERRED" ? "2026-09-01T00:00:00.000Z" : null })], assessments: [assessment({ commitmentFidelity: "NOT_COMMITTED" })] });
      expect(stage(c, "committed").state, state).toBe("not_applicable");
      expect(stage(c, "committed").code, state).toBe("NOT_COMMITTED");
      for (const id of ["execution", "observation", "measurement", "target", "issue", "attribution", "learning"]) {
        expect(stage(c, id).state, `${state}/${id}`).toBe("not_applicable");
        expect(stage(c, id).code, `${state}/${id}`).toBeUndefined();
      }
      expect(canCheckOutcome(c), state).toBe(false);
    }
    expect(stage(chain({ decisions: [decision({ decisionState: "DEFERRED", revisitAt: "2026-09-01T00:00:00.000Z" })] }), "committed").detail).toContain("2026-09-01");
  });
  it("only ACCEPTED / MODIFIED can be checked", () => {
    expect(canCheckOutcome(chain())).toBe(true);
    expect(canCheckOutcome(chain({ decisions: [decision({ decisionState: "MODIFIED", commitmentDescription: "x" })] }))).toBe(true);
  });
});

describe("history and currency", () => {
  const d1 = decision({ id: "d1", sequence: 1 });
  const d2 = decision({ id: "d2", sequence: 2, supersedesId: "d1", commitmentDescription: "Amended" });
  const a1 = assessment({ id: "a1", version: 1, ownerDecisionId: "d1", measurementResult: "UNCHANGED" });
  const a2 = assessment({ id: "a2", version: 2, ownerDecisionId: "d2", measurementResult: "IMPROVED" });
  it("current = highest version; history lists newest first and nothing is dropped", () => {
    const c = chain({ decisions: [d1, d2], assessments: [a1, a2] });
    expect(c.currentAssessment?.version).toBe(2);
    expect(assessmentHistory(c).map((x) => x.version)).toEqual([2, 1]);
    expect(decisionHistory(c).map((x) => x.sequence)).toEqual([2, 1]);
    expect(stage(c, "measurement").code).toBe("IMPROVED");
  });
  it("history ordering does not depend on input order", () => {
    const c = chain({ decisions: [d2, d1], assessments: [a2, a1] });
    expect(assessmentHistory(c).map((x) => x.version)).toEqual([2, 1]);
    expect(decisionHistory(c).map((x) => x.sequence)).toEqual([2, 1]);
  });
  it("an assessment made under an earlier decision is flagged out of date", () => {
    const stale = chain({ decisions: [d1, d2], assessments: [a1] });
    expect(chainFreshness(stale).assessmentIsStale).toBe(true);
    expect(chainFreshness(chain({ decisions: [d1, d2], assessments: [a1, a2] })).assessmentIsStale).toBe(false);
    expect(chainFreshness(chain()).assessmentIsStale).toBe(false);
  });
  it("the ORIGINAL recommendation comes from the first decision, not a later re-snapshot", () => {
    const later = decision({ id: "d2", sequence: 2, recommendationSnapshot: { title: "Changed wording later" } });
    expect(originalRecommendation(chain({ decisions: [d1, later] })).title).toBe("Raise prices on the two weakest products");
  });
  it("a missing snapshot title is stated, not invented", () => {
    expect(originalRecommendation(chain({ decisions: [decision({ recommendationSnapshot: {} })] })).title).toMatch(/no title was recorded/i);
  });
});

describe("candidate trackability (ids only)", () => {
  it("persisted domain actions of the eight System A domains and compliance items are trackable", () => {
    for (const dom of ["recovery", "finance", "cashflow", "sales", "operations", "sop", "marketing", "strategy"]) {
      const v = candidateTrackability(`domain_action:${dom}:${UUID}`);
      expect(v.trackable, dom).toBe(true);
    }
    const c = candidateTrackability(`compliance_item:${UUID}`);
    expect(c.trackable && c.source).toBe("compliance_item");
  });
  it("business risks, survival readings, evidence refreshes and safety holds are not trackable, with a stated reason", () => {
    for (const id of [`business_risk:${UUID}`, "survival_reading:cashflow:CASH_RUNWAY_LOW", "evidence_refresh:finance", "safety_gate:growth"]) {
      const v = candidateTrackability(id);
      expect(v.trackable, id).toBe(false);
      if (!v.trackable) expect(v.reason.length, id).toBeGreaterThan(10);
    }
  });
  it("malformed or look-alike ids are never guessed into a trackable candidate", () => {
    for (const id of ["", "domain_action", `domain_action:finance`, `domain_action:finance:not-a-uuid`, `domain_action:customer:${UUID}`, `domain_action:finance:${UUID}:extra`,
      `compliance_item:${UUID}:x`, `Domain_Action:finance:${UUID}`, `finance:${UUID}`, "Raise prices on the two weakest products", `domain_action:finance:${"abcdefab-abcd-4bcd-8bcd-abcdefabcdef".toUpperCase()}`]) {
      expect(candidateTrackability(id).trackable, id).toBe(false);
    }
  });
  it("trackability depends on the id only — an identical title with different ids differs", () => {
    expect(candidateTrackability(`domain_action:finance:${UUID}`).trackable).toBe(true);
    expect(candidateTrackability(`evidence_refresh:finance`).trackable).toBe(false);
  });
  it("COVERAGE GUARD: every candidate-id template the owner-decision builders emit is classified (trackable or documented-untrackable)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/services/owner-home/owner-decision-candidates.ts"), "utf8");
    const prefixes = new Set<string>();
    for (const m of src.matchAll(/candidateId:\s*`([a-z_]+):/g)) prefixes.add(m[1]);
    expect([...prefixes].sort()).toEqual(["business_risk", "compliance_item", "domain_action", "survival_reading"]);
    const classified = new Set<string>(["domain_action", "compliance_item", ...UNTRACKABLE_CANDIDATE_CLASSES]);
    for (const p of prefixes) expect(classified.has(p), `unclassified candidate class: ${p}`).toBe(true);
    // the two synthetic classes built in the Spine arbiter
    const spine = fs.readFileSync(path.join(process.cwd(), "src/domain/owner-spine/owner-decision.ts"), "utf8");
    for (const m of spine.matchAll(/candidateId:\s*`([a-z_]+):/g)) expect(classified.has(m[1]), `unclassified candidate class: ${m[1]}`).toBe(true);
  });
});

describe("submit attempts (double submit)", () => {
  it("the same payload reuses the key; a different payload gets a new key", () => {
    let n = 0;
    const gen = () => `key-${++n}-xxxxxxxx`;
    const a = attemptFor(null, { a: 1 }, gen);
    const b = attemptFor(a, { a: 1 }, gen);
    const c = attemptFor(b, { a: 2 }, gen);
    expect(b.key).toBe(a.key);
    expect(c.key).not.toBe(a.key);
    expect(n).toBe(2);
  });
});
