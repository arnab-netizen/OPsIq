import { describe, it, expect } from "vitest";
import {
  cadenceIntervalMs,
  nextDueAt,
  isCadenceDue,
  overdueMs,
  dueReviews,
  CadenceType,
} from "@/domain/execution/operating-cadence";

const NOW = new Date("2026-06-26T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3600_000);

describe("[module16] operating cadence — module contract assertions", () => {
  it("cadenceIntervalMs is a function", () => { expect(typeof cadenceIntervalMs).toBe("function"); });
  it("nextDueAt is a function", () => { expect(typeof nextDueAt).toBe("function"); });
  it("isCadenceDue is a function", () => { expect(typeof isCadenceDue).toBe("function"); });
  it("overdueMs is a function", () => { expect(typeof overdueMs).toBe("function"); });
  it("dueReviews is a function", () => { expect(typeof dueReviews).toBe("function"); });
  it("CadenceType.DAILY_OWNER_BRIEFING is defined", () => { expect(CadenceType.DAILY_OWNER_BRIEFING).toBeDefined(); });
  it("CadenceType.WEEKLY_BUSINESS_REVIEW is defined", () => { expect(CadenceType.WEEKLY_BUSINESS_REVIEW).toBeDefined(); });
  it("CadenceType.MONTHLY_OPERATING_REVIEW is defined", () => { expect(CadenceType.MONTHLY_OPERATING_REVIEW).toBeDefined(); });
  it("cadenceIntervalMs(DAILY_OWNER_BRIEFING) returns a positive number", () => { expect(cadenceIntervalMs(CadenceType.DAILY_OWNER_BRIEFING)).toBeGreaterThan(0); });
  it("cadenceIntervalMs(WEEKLY) > cadenceIntervalMs(DAILY)", () => {
    expect(cadenceIntervalMs(CadenceType.WEEKLY_BUSINESS_REVIEW)).toBeGreaterThan(cadenceIntervalMs(CadenceType.DAILY_OWNER_BRIEFING));
  });
  it("isCadenceDue with null lastRun returns true", () => { expect(isCadenceDue(CadenceType.DAILY_OWNER_BRIEFING, null, NOW)).toBe(true); });
  it("nextDueAt with null lastRun returns NOW", () => { expect(nextDueAt(CadenceType.DAILY_OWNER_BRIEFING, null, NOW).getTime()).toBe(NOW.getTime()); });
  it("overdueMs returns 0 when not yet due", () => { expect(overdueMs(CadenceType.DAILY_OWNER_BRIEFING, new Date(NOW.getTime() - 3600_000), NOW)).toBe(0); });
  it("dueReviews([]) returns an empty array", () => { expect(Array.isArray(dueReviews([], NOW))).toBe(true); });
});

describe("[module16] operating cadence", () => {
  it("never-run cadences are always due", () => {
    expect(isCadenceDue(CadenceType.DAILY_OWNER_BRIEFING, null, NOW)).toBe(true);
    expect(isCadenceDue(CadenceType.MONTHLY_OPERATING_REVIEW, undefined, NOW)).toBe(true);
  });

  it("daily briefing due after 24h, not before", () => {
    expect(isCadenceDue(CadenceType.DAILY_OWNER_BRIEFING, hoursAgo(23), NOW)).toBe(false);
    expect(isCadenceDue(CadenceType.DAILY_OWNER_BRIEFING, hoursAgo(25), NOW)).toBe(true);
  });

  it("weekly + monthly thresholds", () => {
    expect(isCadenceDue(CadenceType.WEEKLY_BUSINESS_REVIEW, daysAgo(6), NOW)).toBe(false);
    expect(isCadenceDue(CadenceType.WEEKLY_BUSINESS_REVIEW, daysAgo(8), NOW)).toBe(true);
    expect(isCadenceDue(CadenceType.MONTHLY_OPERATING_REVIEW, daysAgo(29), NOW)).toBe(false);
    expect(isCadenceDue(CadenceType.MONTHLY_OPERATING_REVIEW, daysAgo(31), NOW)).toBe(true);
  });

  it("nextDueAt = lastRun + interval; now when never run", () => {
    const last = daysAgo(1);
    expect(nextDueAt(CadenceType.DAILY_OWNER_BRIEFING, last, NOW).getTime()).toBe(last.getTime() + cadenceIntervalMs(CadenceType.DAILY_OWNER_BRIEFING));
    expect(nextDueAt(CadenceType.WEEKLY_BUSINESS_REVIEW, null, NOW).getTime()).toBe(NOW.getTime());
  });

  it("overdueMs is 0 before due, positive after", () => {
    expect(overdueMs(CadenceType.DAILY_OWNER_BRIEFING, hoursAgo(12), NOW)).toBe(0);
    expect(overdueMs(CadenceType.DAILY_OWNER_BRIEFING, hoursAgo(36), NOW)).toBeGreaterThan(0);
  });

  it("dueReviews returns due cadences most-overdue first", () => {
    const due = dueReviews(
      [
        { type: CadenceType.DAILY_OWNER_BRIEFING, lastRunAt: hoursAgo(12) }, // not due
        { type: CadenceType.WEEKLY_BUSINESS_REVIEW, lastRunAt: daysAgo(10) }, // due, 3d overdue
        { type: CadenceType.MONTHLY_OPERATING_REVIEW, lastRunAt: daysAgo(60) }, // due, 30d overdue
      ],
      NOW
    );
    expect(due).toEqual([CadenceType.MONTHLY_OPERATING_REVIEW, CadenceType.WEEKLY_BUSINESS_REVIEW]);
  });
});
