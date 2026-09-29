/**
 * Round 10 P2-3 — a reporting period cannot prove an issue/action recurred after a completion (or a
 * stronger verification) merely by ENDING after it. Its period must START strictly after the terminal
 * proof time. Reproduces on 14c36b12 (which used periodEnd > completedAt) and passes now.
 */
import { describe, it, expect } from "vitest";
import { evidencePostdatesCompletion, terminalProofTime } from "@/domain/founder-recovery/action-continuity";

const DAY = 86_400_000;
const NOW = new Date("2026-06-01T00:00:00Z");
const completedAt = new Date(NOW.getTime() - 40 * DAY);
// The cycle itself is always diagnosed well after completion in these cases — only the evidence PERIOD
// varies — so every case below isolates the periodStart/periodEnd question the defect was about.
const diagnosedAfter = new Date(NOW.getTime() - 2 * DAY);

function cycle(periodStartDaysAgo: number, periodEndDaysAgo: number) {
  return {
    createdAt: diagnosedAfter,
    periodStart: new Date(NOW.getTime() - periodStartDaysAgo * DAY),
    periodEnd: new Date(NOW.getTime() - periodEndDaysAgo * DAY),
  };
}

describe("R10 P2-3: periodStart > terminalProofTime required to prove recurrence", () => {
  it("1 — period entirely BEFORE the completion cannot revive it", () => {
    expect(evidencePostdatesCompletion(cycle(70, 60), completedAt)).toBe(false);
  });

  it("2 — period OVERLAPS the completion (starts before, ends after) cannot revive it", () => {
    // completedAt is 40 days ago; this period runs from 50 days ago to 10 days ago (overlaps it).
    expect(evidencePostdatesCompletion(cycle(50, 10), completedAt)).toBe(false);
  });

  it("3 — periodStart EXACTLY EQUAL to the completion cannot revive it (must be strictly after)", () => {
    expect(evidencePostdatesCompletion({ createdAt: diagnosedAfter, periodStart: completedAt, periodEnd: new Date(NOW.getTime() - 5 * DAY) }, completedAt)).toBe(false);
  });

  it("4 — periodStart strictly AFTER the completion can revive it (genuinely new evidence)", () => {
    expect(evidencePostdatesCompletion(cycle(30, 5), completedAt)).toBe(true);
  });

  it("5 — a cycle diagnosed BEFORE the completion never revives it even if its period nominally starts later (back-dated diagnosis is not new evidence)", () => {
    const backDated = { createdAt: new Date(NOW.getTime() - 45 * DAY), periodStart: new Date(NOW.getTime() - 30 * DAY), periodEnd: new Date(NOW.getTime() - 5 * DAY) };
    expect(evidencePostdatesCompletion(backDated, completedAt)).toBe(false);
  });

  it("terminalProofTime prefers a later verification timestamp over the completion timestamp", () => {
    const laterVerification = new Date(NOW.getTime() - 10 * DAY);
    const t = terminalProofTime({ completedAt, verifications: [{ createdAt: laterVerification }] });
    expect(t?.getTime()).toBe(laterVerification.getTime());
    // A period starting after completedAt (40d ago) but before the verification (10d ago) still cannot
    // revive it once verification is the stronger terminal proof.
    expect(evidencePostdatesCompletion(cycle(30, 5), t)).toBe(false);
    // A period starting after the verification itself can.
    expect(evidencePostdatesCompletion(cycle(5, 1), t)).toBe(true);
  });

  it("terminalProofTime falls back to completedAt when there is no verification", () => {
    expect(terminalProofTime({ completedAt })?.getTime()).toBe(completedAt.getTime());
  });
});
