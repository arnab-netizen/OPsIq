import { describe, it, expect } from "vitest";
import { planSyncRun, cursorAfterMonth } from "@/domain/quickbooks/qbo-sync-plan";

const now = new Date("2026-10-24T03:00:00Z");

describe("sync plan", () => {
  it("first run is a baseline: newest 3 closed months, cursor to the 4th", () => {
    const p = planSyncRun({ now, baselineCompletedAt: null, baselineCursor: null, lastFullReconcileAt: null });
    expect(p.kind).toBe("BASELINE");
    expect(p.months.map((m) => m.start)).toEqual(["2026-09-01", "2026-08-01", "2026-07-01"]);
    expect(p.cursorAfter).toBe("2026-06-01");
    expect(p.completesPass).toBe(false);
  });
  it("baseline resumes from the persisted cursor and finishes after 4 runs (12 months)", () => {
    let cursor: string | null = null;
    const seen: string[] = [];
    let completed = false;
    for (let i = 0; i < 6 && !completed; i++) {
      const p = planSyncRun({ now, baselineCompletedAt: null, baselineCursor: cursor, lastFullReconcileAt: null });
      seen.push(...p.months.map((m) => m.start));
      cursor = p.cursorAfter;
      completed = p.completesPass;
    }
    expect(completed).toBe(true);
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
    expect(seen[11]).toBe("2025-10-01");
  });
  it("per-month cursor is the next older month, then the plan's own cursorAfter", () => {
    const p = planSyncRun({ now, baselineCompletedAt: null, baselineCursor: null, lastFullReconcileAt: null });
    expect(cursorAfterMonth(p, 0)).toBe("2026-08-01");
    expect(cursorAfterMonth(p, 1)).toBe("2026-07-01");
    expect(cursorAfterMonth(p, 2)).toBe("2026-06-01");
  });
  it("steady state: refresh the 3 most recent closed months only", () => {
    const p = planSyncRun({ now, baselineCompletedAt: new Date("2026-10-20"), baselineCursor: null, lastFullReconcileAt: new Date("2026-10-22") });
    expect(p.kind).toBe("REFRESH");
    expect(p.months).toHaveLength(3);
    expect(p.cursorAfter).toBeNull();
  });
  it("a full reconcile is due after 7 days, in chunks", () => {
    const p = planSyncRun({ now, baselineCompletedAt: new Date("2026-09-01"), baselineCursor: null, lastFullReconcileAt: new Date("2026-10-10") });
    expect(p.kind).toBe("RECONCILE");
    expect(p.months).toHaveLength(3);
    expect(p.cursorAfter).toBe("2026-06-01");
  });
  it("the in-progress month is never planned", () => {
    const p = planSyncRun({ now, baselineCompletedAt: null, baselineCursor: null, lastFullReconcileAt: null });
    expect(p.months.map((m) => m.start)).not.toContain("2026-10-01");
  });
  it("a cursor older than the window start yields an empty, completing plan", () => {
    const p = planSyncRun({ now, baselineCompletedAt: null, baselineCursor: "2025-09-01", lastFullReconcileAt: null });
    expect(p.months).toEqual([]);
    expect(p.completesPass).toBe(true);
  });
});

describe("closed-month grace", () => {
  it("a month is not closed until a full UTC day after it ends (closed in every company time zone)", async () => {
    const { closedMonths, isClosedMonth, monthOf } = await import("@/domain/quickbooks/qbo-report-model");
    const feb = monthOf(2026, 1);
    const firstOfMarch = new Date("2026-03-01T03:00:00.000Z");
    expect(isClosedMonth(feb, firstOfMarch)).toBe(false);
    expect(closedMonths(firstOfMarch, 1)[0].start).toBe("2026-01-01");
    const secondOfMarch = new Date("2026-03-02T03:00:00.000Z");
    expect(isClosedMonth(feb, secondOfMarch)).toBe(true);
    expect(closedMonths(secondOfMarch, 1)[0].start).toBe("2026-02-01");
  });
});
