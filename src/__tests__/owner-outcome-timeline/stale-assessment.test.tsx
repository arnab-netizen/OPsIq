/**
 * STALE_ASSESSMENT_CURRENT_TRUTH — an assessment recorded under an EARLIER decision record is historical only.
 * The current stages (and the current-result details) must never present its conclusions as describing the latest
 * ACCEPTED / MODIFIED commitment; it stays fully inspectable under History, and "Check outcome" stays available.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import {
  NEEDS_NEW_CHECK_COPY, assessmentHistory, buildTimelineStages, canCheckOutcome, chainFreshness, currentCommitmentAssessment,
} from "@/domain/owner-spine/owner-outcome-presentation";
import { CapabilitiesProvider } from "@/context/capabilities-context";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { OutcomeTimeline } from "@/components/owner-outcomes/OutcomeTimeline";
import { assessment, chain, decision } from "./fixtures";

afterEach(() => cleanup());

const TAIL = ["execution", "observation", "measurement", "target", "issue", "attribution", "learning"] as const;
/** Deliberately strong, distinct conclusions — the ones that must never leak into the current view. */
const A1 = assessment({
  id: "a1", version: 1, ownerDecisionId: "d1", executionStatus: "COMPLETED", observationStatus: "MEASURED", measurementResult: "IMPROVED",
  targetAttainment: "REACHED", issueResolution: "RESOLVED", causalAttribution: "PLAUSIBLE", learningEligibility: "ELIGIBLE_CONFIRMED_BY_GATE",
  independentlyVerified: true, nextVerificationAction: "STALE_NEXT_ACTION_TEXT", learningBlockers: ["STALE_BLOCKER_TEXT"],
});
const D1 = decision({ id: "d1", sequence: 1, decisionState: "ACCEPTED" });
const D2_ACCEPTED = decision({ id: "d2", sequence: 2, supersedesId: "d1", decisionState: "ACCEPTED", commitmentDescription: "Amended commitment", observationWindowDays: 60 });
const D2_MODIFIED = decision({ id: "d2", sequence: 2, supersedesId: "d1", decisionState: "MODIFIED", commitmentDescription: "Do something else entirely" });
const A2 = assessment({
  id: "a2", version: 2, ownerDecisionId: "d2", executionStatus: "IN_PROGRESS", observationStatus: "WINDOW_OPEN", measurementResult: "UNCHANGED",
  targetAttainment: "NOT_REACHED", issueResolution: "STILL_OPEN", causalAttribution: "NOT_ASSESSED", learningEligibility: "NOT_ELIGIBLE",
  independentlyVerified: false, nextVerificationAction: "FRESH_NEXT_ACTION_TEXT", learningBlockers: [],
});
const STALE_CODES = ["IMPROVED", "REACHED", "RESOLVED", "PLAUSIBLE", "ELIGIBLE_CONFIRMED_BY_GATE", "COMPLETED", "MEASURED"];
const STALE_WORDS = ["Improved", "Target reached", "Resolved in a newer diagnosis", "Possible contribution", "allows learning", "Completed", "Measured"];

describe.each([["ACCEPTED", D2_ACCEPTED], ["MODIFIED", D2_MODIFIED]] as const)("d1 ACCEPTED → d2 %s, no assessment under d2", (_name, d2) => {
  const stale = () => chain({ decisions: [D1, d2], assessments: [A1] });

  it("1. the chain is flagged stale", () => {
    expect(chainFreshness(stale()).assessmentIsStale).toBe(true);
    expect(currentCommitmentAssessment(stale())).toBeNull();
  });

  it("2. the current stages expose NONE of a1's conclusions (no code, label or caveat)", () => {
    const stages = buildTimelineStages(stale());
    for (const id of TAIL) {
      const st = stages.find((s) => s.id === id)!;
      expect(st.code, id).toBeUndefined();
      expect(st.caveat, id).toBeUndefined();
    }
    const serialized = JSON.stringify(stages);
    for (const c of STALE_CODES) expect(serialized, c).not.toContain(c);
    for (const w of STALE_WORDS) expect(serialized, w).not.toContain(w);
  });

  it("3. every outcome stage asks for a new check, conservatively", () => {
    for (const id of TAIL) {
      const st = buildTimelineStages(stale()).find((s) => s.id === id)!;
      expect(st.state, id).toBe("pending");
      expect(st.headline, id).toBe(NEEDS_NEW_CHECK_COPY);
      expect(st.tone, id).toBe("caution");
    }
    expect(NEEDS_NEW_CHECK_COPY).toMatch(/new check/i);
  });

  it("4. history still contains a1 exactly, untouched", () => {
    const c = stale();
    const found = assessmentHistory(c).find((x) => x.id === "a1");
    expect(found).toEqual(A1);
    expect(c.assessments).toEqual([A1]);
  });

  it("5. Check outcome stays available for the committed current decision", () => {
    expect(canCheckOutcome(stale())).toBe(true);
  });

  it("6. once a2 exists under d2 it becomes current and normal conclusions return — a1 conclusions still do not", () => {
    const c = chain({ decisions: [D1, d2], assessments: [A1, A2] });
    expect(chainFreshness(c).assessmentIsStale).toBe(false);
    expect(currentCommitmentAssessment(c)?.id).toBe("a2");
    const by = Object.fromEntries(buildTimelineStages(c).map((s) => [s.id, s]));
    expect(by.execution.code).toBe("IN_PROGRESS");
    expect(by.measurement.code).toBe("UNCHANGED");
    expect(by.target.code).toBe("NOT_REACHED");
    expect(by.issue.code).toBe("STILL_OPEN");
    expect(by.attribution.code).toBe("NOT_ASSESSED");
    expect(by.learning.code).toBe("NOT_ELIGIBLE");
    for (const id of TAIL) expect(by[id].headline).not.toBe(NEEDS_NEW_CHECK_COPY);
    const serialized = JSON.stringify(buildTimelineStages(c));
    for (const code of ["IMPROVED", "REACHED", "RESOLVED", "PLAUSIBLE", "ELIGIBLE_CONFIRMED_BY_GATE"]) expect(serialized.replace("NOT_REACHED", ""), code).not.toContain(code);
  });

  it("7. a1 remains in history after a2 is added, in order, unmodified", () => {
    const c = chain({ decisions: [D1, d2], assessments: [A1, A2] });
    expect(assessmentHistory(c).map((x) => x.id)).toEqual(["a2", "a1"]);
    expect(assessmentHistory(c).find((x) => x.id === "a1")).toEqual(A1);
  });
});

describe("rendered timeline", () => {
  const renderStale = (canManage: boolean) =>
    render(
      <CapabilitiesProvider capabilities={canManage ? [CAPABILITIES.OWNER_VIEW, CAPABILITIES.OWNER_MANAGE] : [CAPABILITIES.OWNER_VIEW]}>
        <OutcomeTimeline chain={chain({ decisions: [D1, D2_ACCEPTED], assessments: [A1] })} canManage={canManage} onChanged={() => {}} />
      </CapabilitiesProvider>
    );

  it("the primary view shows no stale conclusion anywhere outside History", () => {
    renderStale(true);
    const card = screen.getByTestId("outcome-chain-card");
    const history = screen.getByTestId("outcome-history");
    // Everything except the History disclosure:
    const clone = card.cloneNode(true) as HTMLElement;
    clone.querySelector('[data-testid="outcome-history"]')?.remove();
    const primary = clone.textContent ?? "";
    for (const w of [...STALE_WORDS.filter((w) => w !== "Measured"), ...STALE_CODES, "STALE_NEXT_ACTION_TEXT", "STALE_BLOCKER_TEXT", "Checked independently"]) expect(primary, w).not.toContain(w);
    expect(primary).toContain(NEEDS_NEW_CHECK_COPY);
    // …while the stale assessment IS inspectable under History, labelled as an earlier commitment.
    const h = history.textContent ?? "";
    expect(h).toContain("Version 1");
    expect(h).toContain("Improved");
    expect(h).toContain("checked under decision #1");
    expect(h).toContain("(earlier commitment)");
  });

  it("keeps the visible out-of-date notice and offers Check outcome to a manager; a viewer sees the notice but no action", () => {
    renderStale(true);
    expect(screen.getByText("Result is out of date")).toBeTruthy();
    expect(screen.getByTestId("outcome-stale-notice").textContent).toMatch(/Check the outcome again/);
    expect(screen.getByRole("button", { name: /check outcome/i })).toBeTruthy();
    expect(screen.getByTestId("outcome-not-checked").textContent).toMatch(/kept under History and are not shown as the current result/);
    cleanup();
    renderStale(false);
    expect(screen.getByTestId("outcome-stale-notice")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /check outcome/i })).toBeNull();
  });

  it("each outcome stage reads 'Needs a new check…' and carries no status code", () => {
    renderStale(true);
    for (const id of TAIL) {
      const el = screen.getByTestId(`outcome-stage-${id}`);
      expect(within(el).getByText(NEEDS_NEW_CHECK_COPY)).toBeTruthy();
      expect(el.textContent).not.toMatch(/\([A-Z_]{4,}\)/); // no "(CODE)" detail
    }
  });

  it("a current assessment renders normally (no regression)", () => {
    render(<OutcomeTimeline chain={chain({ decisions: [D1, D2_ACCEPTED], assessments: [A1, A2] })} canManage={false} onChanged={() => {}} />);
    expect(screen.queryByText("Result is out of date")).toBeNull();
    expect(screen.getByTestId("outcome-stage-measurement").textContent).toContain("No material change");
    expect(screen.getByTestId("outcome-assessment-meta").textContent).toContain("FRESH_NEXT_ACTION_TEXT");
  });
});
