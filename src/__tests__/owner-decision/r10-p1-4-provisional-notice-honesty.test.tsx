/**
 * R10 P1-4 — before-fix proof for InProgressPeriodNotice's provisional-safety honesty.
 *
 * The bug this proves fixed: the notice used to claim, for EVERY domain, that "where they are
 * worse than the completed reading, OpsIQ's safety checks already apply them" — but only
 * Cash/Finance's canonical safety arbitration (current-cash-finance-reading.ts, a worst-of
 * merge) actually reads provisional evidence. Sales/Operations/Execution/Marketing/Recovery's
 * diagnosis engines never read an in-progress snapshot into a safety/gate decision at all, so the
 * claim was false for five of the seven domains that render this notice.
 *
 * Matrix: Finance and Cashflow (provisionalSafetyImplemented=true) may state provisional data can
 * affect safety; Sales/Operations/Execution/Marketing/Recovery (false/default) must NOT claim
 * safety checks already use provisional figures, and must instead say provisional data does not
 * replace completed evidence.
 *
 * This same file is copied onto a worktree at 14c36b12167320359de6a837bdf8a4b56bfd2310 (where the
 * `provisionalSafetyImplemented` prop does not exist at all and the safety-claim text is
 * unconditional) and run there to confirm it FAILS for the non-Finance/Cashflow domains.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { InProgressPeriodNotice } from "@/components/owner/InProgressPeriodNotice";

afterEach(cleanup);

const SAFETY_CLAIM = /safety checks already apply|OpsIQ's safety checks already/i;
const NEVER_REPLACES_COMPLETED = /do not replace the latest completed-period evidence|will not treat them as completed-period evidence/i;

const SAFETY_IMPLEMENTED_DOMAINS = ["Finance", "Cashflow"] as const;
const NOT_IMPLEMENTED_DOMAINS = ["Sales", "Operations", "Execution", "Marketing", "Recovery"] as const;

describe("R10 P1-4: InProgressPeriodNotice — provisional-safety honesty matrix", () => {
  it.each(SAFETY_IMPLEMENTED_DOMAINS)("%s (provisionalSafetyImplemented=true, with a completed reading) may state provisional data can affect safety", (domain) => {
    render(
      <InProgressPeriodNotice
        periodState="provisional"
        periodEnd="2026-06-30"
        hasCompletedReading
        provisionalSafetyImplemented
      />
    );
    const text = screen.getByTestId("in-progress-period-notice").textContent ?? "";
    expect(text).toMatch(SAFETY_CLAIM);
    cleanup();
    void domain;
  });

  it.each(NOT_IMPLEMENTED_DOMAINS)("%s (provisionalSafetyImplemented default false, with a completed reading) must NOT claim safety checks already use provisional figures", (domain) => {
    render(
      <InProgressPeriodNotice periodState="provisional" periodEnd="2026-06-30" hasCompletedReading />
    );
    const text = screen.getByTestId("in-progress-period-notice").textContent ?? "";
    expect(text).not.toMatch(SAFETY_CLAIM);
    expect(text).toMatch(NEVER_REPLACES_COMPLETED);
    cleanup();
    void domain;
  });

  it.each(NOT_IMPLEMENTED_DOMAINS)("%s (no completed reading) must NOT claim safety checks already use provisional figures", (domain) => {
    render(<InProgressPeriodNotice periodState="provisional" periodEnd="2026-06-30" hasCompletedReading={false} />);
    const text = screen.getByTestId("in-progress-period-notice").textContent ?? "";
    expect(text).not.toMatch(SAFETY_CLAIM);
    expect(text).toMatch(NEVER_REPLACES_COMPLETED);
    cleanup();
    void domain;
  });

  it("the generic (non-implemented) notice explicitly says provisional data does not replace completed evidence — with a completed reading", () => {
    render(<InProgressPeriodNotice periodState="provisional" periodEnd="2026-06-30" hasCompletedReading />);
    const text = screen.getByTestId("in-progress-period-notice").textContent ?? "";
    expect(text).toMatch(/do not replace the latest completed-period evidence/i);
  });

  it("the generic (non-implemented) notice explicitly says provisional data does not replace completed evidence — no completed reading", () => {
    render(<InProgressPeriodNotice periodState="provisional" periodEnd="2026-06-30" hasCompletedReading={false} />);
    const text = screen.getByTestId("in-progress-period-notice").textContent ?? "";
    expect(text).toMatch(/will not treat them as completed-period evidence/i);
  });

  it("Finance/Cashflow's safety claim never appears for a non-implemented domain even when the figures were diagnosed", () => {
    render(
      <InProgressPeriodNotice
        periodState="provisional"
        periodEnd="2026-06-30"
        hasCompletedReading
        diagnosis={{ diagnosedAt: "2026-06-15T00:00:00Z", state: "AT_RISK", current: true }}
      />
    );
    const text = screen.getByTestId("in-progress-period-notice").textContent ?? "";
    expect(text).not.toMatch(SAFETY_CLAIM);
  });
});
