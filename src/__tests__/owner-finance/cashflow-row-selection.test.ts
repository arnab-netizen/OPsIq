/**
 * The ONE rule for "which Cashflow row is the current / effective one" (pickEffectiveCashflowRow), with deliberately TIED
 * rows: several rows may share a periodEnd (different periodStart); the owner's most recent statement of that as-of
 * balance must win, deterministically, whatever order the database returns them in.
 */
import { describe, it, expect } from "vitest";
import {
  compareCashflowRows,
  pickEffectiveCashflowRow,
  pickLatestCashflowRow,
  selectUsableBankBalance,
  type CashflowSelectionRow,
} from "@/domain/owner-finance/liquidity";

const row = (id: string, o: Partial<CashflowSelectionRow> = {}): CashflowSelectionRow => ({
  id,
  periodStart: "2026-09-01T00:00:00.000Z",
  periodEnd: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  bankBalance: 100,
  ...o,
});
const FIN_END = "2026-09-30T00:00:00.000Z";

function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [xs.slice()];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

describe("pickEffectiveCashflowRow — domain rule", () => {
  it("takes the greatest periodEnd at or before the Finance period end (a later balance never alters an earlier read)", () => {
    const rows = [
      row("old", { periodEnd: "2026-08-31T00:00:00.000Z", periodStart: "2026-08-01T00:00:00.000Z", bankBalance: 1 }),
      row("at", { bankBalance: 2 }),
      row("future", { periodEnd: "2026-10-31T00:00:00.000Z", periodStart: "2026-10-01T00:00:00.000Z", bankBalance: 3 }),
    ];
    expect(pickEffectiveCashflowRow(rows, FIN_END)?.id).toBe("at");
    expect(pickEffectiveCashflowRow(rows, "2026-09-15T00:00:00.000Z")?.id).toBe("old");
    expect(pickEffectiveCashflowRow(rows, "2026-07-01T00:00:00.000Z")).toBeNull();
  });

  it("an unparseable Finance end selects nothing (fail closed)", () => {
    expect(pickEffectiveCashflowRow([row("a")], "not-a-date")).toBeNull();
  });

  it("tie on periodEnd: a row WITH a bank balance beats a row without one, even if the empty row is newer", () => {
    const withBank = row("with", { periodStart: "2026-09-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", bankBalance: 500 });
    const empty = row("empty", { periodStart: "2026-09-15T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z", bankBalance: null });
    for (const order of permutations([withBank, empty])) expect(pickEffectiveCashflowRow(order, FIN_END)?.id).toBe("with");
  });

  it("tie on periodEnd and on having a balance: the latest updatedAt wins (the owner's most recent statement)", () => {
    const a = row("a", { periodStart: "2026-09-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", bankBalance: 100 });
    const b = row("b", { periodStart: "2026-09-10T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z", bankBalance: 200 });
    for (const order of permutations([a, b])) expect(pickEffectiveCashflowRow(order, FIN_END)?.id).toBe("b");
  });

  it("tie on updatedAt too: the latest periodStart wins", () => {
    const a = row("a", { periodStart: "2026-09-01T00:00:00.000Z", bankBalance: 100 });
    const b = row("b", { periodStart: "2026-09-20T00:00:00.000Z", bankBalance: 200 });
    for (const order of permutations([a, b])) expect(pickEffectiveCashflowRow(order, FIN_END)?.id).toBe("b");
  });

  it("only when EVERYTHING else ties does id (descending) decide — and still deterministically", () => {
    const a = row("aaaa", { bankBalance: 100 });
    const b = row("bbbb", { bankBalance: 100 });
    for (const order of permutations([a, b])) expect(pickEffectiveCashflowRow(order, FIN_END)?.id).toBe("bbbb");
  });

  it("all-empty tie still picks one deterministically (latest updatedAt, then periodStart, then id)", () => {
    const rows = [
      row("x1", { bankBalance: null, updatedAt: "2026-10-02T00:00:00.000Z" }),
      row("x2", { bankBalance: null, updatedAt: "2026-10-03T00:00:00.000Z", periodStart: "2026-09-05T00:00:00.000Z" }),
      row("x3", { bankBalance: undefined, updatedAt: "2026-10-03T00:00:00.000Z", periodStart: "2026-09-06T00:00:00.000Z" }),
    ];
    for (const order of permutations(rows)) expect(pickEffectiveCashflowRow(order, FIN_END)?.id).toBe("x3");
  });

  it("a non-finite balance counts as no balance", () => {
    const nan = row("nan", { bankBalance: Number.NaN, updatedAt: "2026-10-09T00:00:00.000Z" });
    const real = row("real", { bankBalance: 0, updatedAt: "2026-10-01T00:00:00.000Z" });
    expect(pickEffectiveCashflowRow([nan, real], FIN_END)?.id).toBe("real");
  });

  it("a known zero balance is a balance (it beats an empty row)", () => {
    const zero = row("zero", { bankBalance: 0, updatedAt: "2026-10-01T00:00:00.000Z" });
    const empty = row("empty", { bankBalance: null, updatedAt: "2026-10-09T00:00:00.000Z" });
    expect(pickEffectiveCashflowRow([empty, zero], FIN_END)?.id).toBe("zero");
  });

  it("the comparator is a strict total order (antisymmetric, transitive) over a mixed set", () => {
    const rows = [
      row("a", { bankBalance: null }),
      row("b", { bankBalance: 5, updatedAt: "2026-10-02T00:00:00.000Z" }),
      row("c", { bankBalance: 5, updatedAt: "2026-10-03T00:00:00.000Z" }),
      row("d", { periodEnd: "2026-08-31T00:00:00.000Z", bankBalance: 9 }),
    ];
    for (const x of rows) for (const y of rows) {
      if (x.id === y.id) { expect(compareCashflowRows(x, y)).toBe(0); continue; }
      expect(Math.sign(compareCashflowRows(x, y))).toBe(-Math.sign(compareCashflowRows(y, x)));
    }
    const sorted = [...rows].sort(compareCashflowRows).map((r) => r.id);
    for (const order of permutations(rows)) expect([...order].sort(compareCashflowRows).map((r) => r.id)).toEqual(sorted);
  });

  it("pickLatestCashflowRow has no upper bound on periodEnd (the dashboard's started-period view)", () => {
    const rows = [row("sep"), row("oct", { periodEnd: "2026-10-31T00:00:00.000Z", periodStart: "2026-10-01T00:00:00.000Z" })];
    expect(pickLatestCashflowRow(rows)?.id).toBe("oct");
    expect(pickLatestCashflowRow([])).toBeNull();
  });
});

describe("the selector never weakens the fail-closed usability rule", () => {
  it("a stale winner is unknown, not a fallback to an older fresher-looking row", () => {
    const winner = row("w", { periodEnd: "2026-06-30T00:00:00.000Z", periodStart: "2026-06-01T00:00:00.000Z", bankBalance: 777 });
    const picked = pickEffectiveCashflowRow([winner], FIN_END);
    expect(selectUsableBankBalance({ financePeriodEnd: FIN_END, cashflow: picked })).toBeUndefined();
  });
  it("the winning empty row yields unknown (never 0)", () => {
    const picked = pickEffectiveCashflowRow([row("e", { bankBalance: null })], FIN_END);
    expect(selectUsableBankBalance({ financePeriodEnd: FIN_END, cashflow: picked })).toBeUndefined();
  });
});
