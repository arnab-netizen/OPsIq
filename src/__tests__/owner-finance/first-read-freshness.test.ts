/**
 * One readiness contract: "enough for a first read" and "figures are out of date" are decided on the SAME evidence
 * and the SAME window, so Onboarding, Start Here, My Business and Home cannot contradict each other.
 *
 * Root cause (hostile UX audit): first-read sufficiency and "Starter information complete" had no age limit, while
 * Home flagged the same business "out of date" after 45 days.
 */
import { describe, it, expect } from "vitest";
import {
  FIRST_READ_STALE_AFTER_DAYS,
  evidenceFreshnessOf,
  firstReadSufficiencyFromSnapshots,
} from "@/domain/owner-finance/first-read-sufficiency";
import {
  computeOnboardingState,
  staleEvidenceNotice,
  starterStatusPhrase,
} from "@/domain/owner-mode/owner-onboarding";
import { OWNER_DECISION_STALE_EVIDENCE_DAYS } from "@/services/owner-home/owner-decision-candidates";

const NOW = new Date("2026-10-19T00:00:00.000Z");
const DAY = 86_400_000;
const row = (periodEnd: Date) => ({
  periodStart: new Date(periodEnd.getTime() - 30 * DAY),
  periodEnd,
  revenue: 1000,
  fixedCosts: 400,
  cashOnHand: 50,
});

describe("evidence freshness uses Home's window", () => {
  it("is the same constant Home uses", () => {
    expect(FIRST_READ_STALE_AFTER_DAYS).toBe(45);
    expect(OWNER_DECISION_STALE_EVIDENCE_DAYS).toBe(FIRST_READ_STALE_AFTER_DAYS);
  });

  it("recent completed period is current; the boundary day is still current; older is stale", () => {
    const at = (days: number) =>
      evidenceFreshnessOf(firstReadSufficiencyFromSnapshots({ completed: row(new Date(NOW.getTime() - days * DAY)), provisional: null }), NOW);
    expect(at(10).state).toBe("current");
    expect(at(45).state).toBe("current");
    expect(at(46).state).toBe("stale");
    expect(at(46).ageDays).toBe(46);
  });

  it("an in-progress (future-ending) period is current, never stale", () => {
    const fr = firstReadSufficiencyFromSnapshots({ completed: null, provisional: row(new Date(NOW.getTime() + 5 * DAY)) });
    expect(evidenceFreshnessOf(fr, NOW)).toMatchObject({ state: "current", ageDays: 0 });
  });

  it("no dated snapshot is unknown — never fabricated as stale", () => {
    const fr = firstReadSufficiencyFromSnapshots({ completed: null, provisional: null });
    expect(evidenceFreshnessOf(fr, NOW).state).toBe("unknown");
  });
});

describe("onboarding state carries the verdict every surface reads", () => {
  const base = { businessName: "Cafe", profileType: "generic_local_service" as const, ownerRole: "owner_operated" as const, suppliedCategories: [] };
  const stale = firstReadSufficiencyFromSnapshots({ completed: row(new Date(NOW.getTime() - 200 * DAY)), provisional: null });

  it("sufficient-but-stale stays a first read (data is enough) yet reports stale", () => {
    const state = computeOnboardingState({ ...base, firstRead: stale, now: NOW });
    expect(state.canRunFirstDiagnosis).toBe(true);
    expect(state.evidenceFreshness.state).toBe("stale");
  });

  it("without a clock the verdict is unknown", () => {
    expect(computeOnboardingState({ ...base, firstRead: stale }).evidenceFreshness.state).toBe("unknown");
  });

  it("never claims 'complete' for stale figures; current figures keep the existing phrase", () => {
    const freshness = computeOnboardingState({ ...base, firstRead: stale, now: NOW }).evidenceFreshness;
    expect(starterStatusPhrase("high", freshness)).not.toBe("Starter information complete");
    expect(starterStatusPhrase("high", freshness)).toMatch(/out of date/);
    expect(starterStatusPhrase("high", { state: "current" })).toBe("Starter information complete");
    expect(starterStatusPhrase("none", freshness)).toBe("Not enough data yet");
  });

  it("explains stale evidence with the period end and the window; silent otherwise", () => {
    const freshness = computeOnboardingState({ ...base, firstRead: stale, now: NOW }).evidenceFreshness;
    expect(staleEvidenceNotice(freshness)).toMatch(/period ending 2026-04-02/);
    expect(staleEvidenceNotice(freshness)).toMatch(/45 days/);
    expect(staleEvidenceNotice({ state: "current", periodEnd: null, ageDays: 3, staleAfterDays: 45 })).toBeNull();
    expect(staleEvidenceNotice(null)).toBeNull();
  });
});
