/**
 * N7 — a future-dated period is accepted and kept, but is labelled as such and never mistaken for observed evidence.
 * The label rule mirrors the rule every read uses (evidencePeriodState); this pins the two together.
 */
import { describe, it, expect } from "vitest";
import { SAVED_PERIOD_TIMING_NOTE, savedPeriodTiming } from "@/domain/owner-finance/period-timing";
import { evidencePeriodState } from "@/services/owner-spine/current-diagnosis-cycle";

const NOW = new Date("2026-10-17T12:00:00Z");
const cases: Array<[string, { periodStart?: string | null; periodEnd?: string | null }]> = [
  ["completed month", { periodStart: "2026-09-01T00:00:00Z", periodEnd: "2026-09-30T00:00:00Z" }],
  ["ends exactly now", { periodStart: "2026-09-17T12:00:00Z", periodEnd: "2026-10-17T12:00:00Z" }],
  ["in progress", { periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-10-31T00:00:00Z" }],
  ["starts exactly now", { periodStart: "2026-10-17T12:00:00Z", periodEnd: "2026-11-17T00:00:00Z" }],
  ["future month", { periodStart: "2026-12-01T00:00:00Z", periodEnd: "2026-12-31T00:00:00Z" }],
  ["no start", { periodStart: null, periodEnd: "2026-12-31T00:00:00Z" }],
  ["no end", { periodStart: "2026-09-01T00:00:00Z", periodEnd: null }],
  ["garbage end", { periodStart: "2026-09-01T00:00:00Z", periodEnd: "not a date" }],
];

describe("savedPeriodTiming", () => {
  for (const [name, period] of cases) {
    it(`${name}: identical to evidencePeriodState`, () => {
      expect(savedPeriodTiming(period, NOW)).toBe(evidencePeriodState(period, NOW));
    });
  }
  it("future and in-progress periods carry an owner-readable note; completed ones do not", () => {
    expect(SAVED_PERIOD_TIMING_NOTE.future).toMatch(/not used until the period begins/);
    expect(SAVED_PERIOD_TIMING_NOTE.provisional).toMatch(/provisional/);
    expect(Object.keys(SAVED_PERIOD_TIMING_NOTE)).not.toContain("completed");
  });
});
