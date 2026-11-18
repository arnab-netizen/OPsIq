import { describe, expect, it } from "vitest";
import { estimateCronIntervalMs, isOverdue } from "@/lib/daily-report/cron-cadence";

describe("estimateCronIntervalMs", () => {
  it("recognizes a daily fixed-hour cron (this repo's real scheduled-backup.yml cadence)", () => {
    expect(estimateCronIntervalMs("17 6 * * *")).toBe(24 * 60 * 60 * 1000);
  });

  it("recognizes a monthly fixed-day cron (this repo's real restore-rehearsal.yml cadence)", () => {
    expect(estimateCronIntervalMs("0 7 1 * *")).toBe(28 * 24 * 60 * 60 * 1000);
  });

  it("recognizes an every-N-hours step cron", () => {
    expect(estimateCronIntervalMs("0 */6 * * *")).toBe(6 * 60 * 60 * 1000);
  });

  it("recognizes an every-N-minutes step cron", () => {
    expect(estimateCronIntervalMs("*/15 * * * *")).toBe(15 * 60 * 1000);
  });

  it("recognizes a weekly fixed-day-of-week cron", () => {
    expect(estimateCronIntervalMs("0 9 * * 1")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("returns null for shapes it does not recognize, rather than guessing", () => {
    expect(estimateCronIntervalMs("0 9 1-5 * *")).toBeNull();
    expect(estimateCronIntervalMs("not a cron")).toBeNull();
    expect(estimateCronIntervalMs("0 9 * 3 *")).toBeNull();
  });
});

describe("isOverdue", () => {
  it("is false just after a daily run", () => {
    const now = new Date("2026-11-17T07:00:00Z");
    const last = new Date("2026-11-17T06:17:00Z");
    expect(isOverdue(last, "17 6 * * *", now)).toBe(false);
  });

  it("is true when far past the grace-multiplied daily cadence", () => {
    const now = new Date("2026-11-20T07:00:00Z"); // 3 days later
    const last = new Date("2026-11-17T06:17:00Z");
    expect(isOverdue(last, "17 6 * * *", now)).toBe(true);
  });

  it("returns null (unknown cadence) rather than a guess for an unrecognized expression", () => {
    const now = new Date("2026-11-20T07:00:00Z");
    const last = new Date("2026-11-17T06:17:00Z");
    expect(isOverdue(last, "0 9 1-5 * *", now)).toBeNull();
  });
});
