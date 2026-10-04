import { describe, it, expect, vi } from "vitest";
import {
  parseQuickAmount,
  assessQuickEntry,
  buildQuickSnapshotPayload,
  QUICK_ENTRY_FIELDS,
} from "@/domain/owner-finance/quick-entry";
import { financialSnapshotCreateSchema } from "@/domain/owner-finance/validation";
import { quickReportingPeriods, runQuickStart, retryDiagnosis, type QuickStartApi } from "@/lib/owner-quick-start";
import { evidencePeriodState } from "@/services/owner-spine/current-diagnosis-cycle";
import { loadFirstReadSufficiency } from "@/services/owner-mode/owner-onboarding.service";

describe("parseQuickAmount — blank is unknown, zero is known", () => {
  it("blank / whitespace / null → blank (never 0)", () => {
    for (const raw of ["", "   ", null, undefined]) expect(parseQuickAmount(raw)).toEqual({ kind: "blank" });
  });
  it("'0' and '0.00' → known zero", () => {
    expect(parseQuickAmount("0")).toEqual({ kind: "value", value: 0 });
    expect(parseQuickAmount("0.00")).toEqual({ kind: "value", value: 0 });
  });
  it("accepts estimates and thousands separators as given", () => {
    expect(parseQuickAmount("600000")).toEqual({ kind: "value", value: 600000 });
    expect(parseQuickAmount("1,80,000")).toEqual({ kind: "value", value: 180000 });
    expect(parseQuickAmount(" 4500.5 ")).toEqual({ kind: "value", value: 4500.5 });
  });
  it.each(["abc", "6 lakh", "1e5", "NaN", "Infinity", "--5", "5-", "12,,x"])("rejects %j with an inline error (no coercion)", (raw) => {
    expect(parseQuickAmount(raw).kind).toBe("invalid");
  });
  it("rejects negatives with a plain message", () => {
    const r = parseQuickAmount("-5");
    expect(r.kind).toBe("invalid");
    expect((r as { message: string }).message).toMatch(/negative/);
  });
});

describe("assessQuickEntry", () => {
  it("nothing entered → nothingEntered, no values", () => {
    const a = assessQuickEntry({});
    expect(a.nothingEntered).toBe(true);
    expect(a.values).toEqual({});
    expect(a.sufficiency?.sufficient).toBe(false);
  });
  it("only known values are present; blanks are absent and zero is kept", () => {
    const a = assessQuickEntry({ revenue: "100", fixedCosts: "0", variableCosts: "", cashOnHand: "  " });
    expect(a.values).toEqual({ revenue: 100, fixedCosts: 0 });
    expect(a.sufficiency?.missing).toEqual(["cashOnHand"]);
  });
  it.each([
    ["A fixed", { revenue: "1", fixedCosts: "1", cashOnHand: "1" }, true],
    ["B variable", { revenue: "1", variableCosts: "1", cashOnHand: "1" }, true],
    ["D no cost", { revenue: "1", cashOnHand: "1" }, false],
    ["zero cost", { revenue: "1", fixedCosts: "0", cashOnHand: "1" }, true],
    ["zero cash", { revenue: "1", fixedCosts: "1", cashOnHand: "0" }, true],
    ["zero revenue", { revenue: "0", fixedCosts: "1", cashOnHand: "1" }, true],
  ])("%s → sufficient=%s via the canonical rule", (_n, draft, ok) => {
    expect(assessQuickEntry(draft).sufficiency?.sufficient).toBe(ok);
  });
  it("an invalid field blocks sufficiency (null) and reports only that field", () => {
    const a = assessQuickEntry({ revenue: "x", fixedCosts: "1", cashOnHand: "1" });
    expect(a.sufficiency).toBeNull();
    expect(Object.keys(a.errors)).toEqual(["revenue"]);
  });
  it("offers exactly four fields and never a total-cost field", () => {
    expect(QUICK_ENTRY_FIELDS.map((f) => f.name)).toEqual(["revenue", "fixedCosts", "variableCosts", "cashOnHand"]);
  });
});

describe("buildQuickSnapshotPayload", () => {
  const period = { start: "2026-09-01", end: "2026-09-30" };
  it("uses the business's own currency, omits blanks, keeps zero, and passes the governed schema", () => {
    const r = buildQuickSnapshotPayload({ values: { revenue: 100, fixedCosts: 0, cashOnHand: 5 }, period, currency: "GBP" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toEqual({ periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "GBP", revenue: 100, fixedCosts: 0, cashOnHand: 5 });
    expect("variableCosts" in r.payload).toBe(false);
    expect("totalCosts" in r.payload).toBe(false);
    expect(financialSnapshotCreateSchema.safeParse(r.payload).success).toBe(true);
  });
  it("refuses a missing currency instead of choosing one", () => {
    for (const currency of [undefined, null, "", "  "]) {
      expect(buildQuickSnapshotPayload({ values: { revenue: 1 }, period, currency })).toEqual({ ok: false, reason: "currency_missing" });
    }
  });
  it("refuses an empty entry", () => {
    expect(buildQuickSnapshotPayload({ values: {}, period, currency: "INR" })).toEqual({ ok: false, reason: "nothing_entered" });
  });
});

describe("quickReportingPeriods — completed stays completed, provisional stays provisional", () => {
  it("mid-month: last month is completed, this month is provisional", () => {
    const now = new Date(2026, 9, 15, 12); // 15 Oct 2026 local noon
    const p = quickReportingPeriods(now);
    expect(p.map((x) => x.id)).toEqual(["last_month", "this_month"]);
    expect(p[0]).toMatchObject({ start: "2026-09-01", end: "2026-09-30", provisional: false });
    expect(p[1]).toMatchObject({ start: "2026-10-01", end: "2026-10-31", provisional: true });
    expect(evidencePeriodState({ periodStart: p[0].start, periodEnd: p[0].end }, now)).toBe("completed");
    expect(evidencePeriodState({ periodStart: p[1].start, periodEnd: p[1].end }, now)).toBe("provisional");
  });
  it("handles year rollover", () => {
    const p = quickReportingPeriods(new Date(2026, 0, 10, 12));
    expect(p[0]).toMatchObject({ start: "2025-12-01", end: "2025-12-31" });
  });
  it("never offers an option whose real classification differs from its label", () => {
    for (let day = 1; day <= 31; day++) {
      const now = new Date(2026, 9, day, 12);
      for (const o of quickReportingPeriods(now)) {
        const state = evidencePeriodState({ periodStart: o.start, periodEnd: o.end }, now);
        expect(state).toBe(o.provisional ? "provisional" : "completed");
      }
    }
  });
});

describe("runQuickStart / retryDiagnosis — one action, no duplicate snapshot", () => {
  const payload = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", revenue: 1 };
  const snapPath = "/api/owner/finance/businesses/b1/snapshots";
  const diagPath = "/api/owner/finance/businesses/b1/diagnoses";

  it("saves through the governed snapshot endpoint then diagnoses that exact snapshot", async () => {
    const api = vi.fn<QuickStartApi>(async (path) => (path === snapPath ? { id: "s1" } : { ok: true }));
    const r = await runQuickStart({ api, businessId: "b1", payload });
    expect(r).toEqual({ status: "diagnosed", snapshotId: "s1" });
    expect(api.mock.calls.map((c) => c[0])).toEqual([snapPath, diagPath]);
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual(payload);
    expect(JSON.parse(api.mock.calls[1][1].body)).toEqual({ snapshotId: "s1" });
  });
  it("snapshot saved + diagnosis fails → recoverable, data kept, retry never re-posts the snapshot", async () => {
    const api = vi.fn<QuickStartApi>(async (path) => {
      if (path === snapPath) return { id: "s1" };
      throw new Error("diagnosis down");
    });
    const first = await runQuickStart({ api, businessId: "b1", payload });
    expect(first).toMatchObject({ status: "diagnosis_failed", snapshotId: "s1" });
    const posts = () => api.mock.calls.filter((c) => c[0] === snapPath).length;
    expect(posts()).toBe(1);
    api.mockImplementation(async () => ({ ok: true }));
    const retry = await retryDiagnosis(api, "b1", "s1");
    expect(retry).toEqual({ status: "diagnosed", snapshotId: "s1" });
    expect(posts()).toBe(1); // still exactly one snapshot POST
  });
  it("snapshot failure stops before any diagnosis call", async () => {
    const api = vi.fn<QuickStartApi>(async () => { throw new Error("nope"); });
    const r = await runQuickStart({ api, businessId: "b1", payload });
    expect(r.status).toBe("snapshot_failed");
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("a save response without an id is a failure, not a blind diagnosis", async () => {
    const api = vi.fn<QuickStartApi>(async () => ({}));
    const r = await runQuickStart({ api, businessId: "b1", payload });
    expect(r.status).toBe("snapshot_failed");
    expect(api).toHaveBeenCalledTimes(1);
  });
});

describe("loadFirstReadSufficiency — service-level, scoped, provisional-aware", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const rowsWith = (finance: unknown) => ({ finance }) as never;
  const fakeDb = (provisional: unknown) => {
    const findFirst = vi.fn(async () => provisional);
    return { db: { ownerFinancialSnapshot: { findFirst } } as never, findFirst };
  };

  it("queries the in-progress snapshot scoped to workspace + business at `now`", async () => {
    const { db, findFirst } = fakeDb(null);
    await loadFirstReadSufficiency({ db, workspaceId: "w1", businessId: "b1", now }, rowsWith(null));
    const arg = findFirst.mock.calls[0] as unknown as [{ where: Record<string, unknown> }];
    expect(arg[0].where).toMatchObject({ workspaceId: "w1", businessId: "b1", supersededById: null, periodStart: { lte: now }, periodEnd: { gt: now } });
  });
  it("completed snapshot with fixed costs only (no variable) is sufficient", async () => {
    const { db } = fakeDb(null);
    const r = await loadFirstReadSufficiency({ db, workspaceId: "w", businessId: "b", now }, rowsWith({ revenue: 5, fixedCosts: 5, cashOnHand: 5 }));
    expect(r).toMatchObject({ sufficient: true, basis: "completed" });
  });
  it("a row that is not actually in progress is never treated as provisional evidence", async () => {
    const { db } = fakeDb({ revenue: 5, variableCosts: 5, cashOnHand: 5, periodStart: new Date("2026-08-01T00:00:00Z"), periodEnd: new Date("2026-08-31T00:00:00Z") });
    const r = await loadFirstReadSufficiency({ db, workspaceId: "w", businessId: "b", now }, rowsWith(null));
    expect(r).toMatchObject({ sufficient: false, basis: "none" });
  });
  it("a provisional snapshot unlocks the read but is labelled provisional", async () => {
    const { db } = fakeDb({ revenue: 5, variableCosts: 5, cashOnHand: 5, periodStart: new Date("2026-10-01T00:00:00Z"), periodEnd: new Date("2026-10-31T00:00:00Z") });
    const r = await loadFirstReadSufficiency({ db, workspaceId: "w", businessId: "b", now }, rowsWith(null));
    expect(r).toMatchObject({ sufficient: true, basis: "provisional" });
  });
});
