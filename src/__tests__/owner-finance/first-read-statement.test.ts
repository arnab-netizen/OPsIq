/**
 * N2 / N8 — "what OpsIQ knows" is derived from the actual known / unknown facts and names the period.
 * It must never say a figure was given when it is unknown, and never pass a rough read for knowing the whole business.
 */
import { describe, it, expect } from "vitest";
import { firstReadStatement } from "@/domain/owner-finance/first-read-statement";
import { firstReadSufficiencyFromRow, firstReadSufficiencyFromSnapshots, type CriticalFinanceRow } from "@/domain/owner-finance/first-read-sufficiency";

const SEPT = { periodStart: new Date("2026-09-01T00:00:00Z"), periodEnd: new Date("2026-09-30T00:00:00Z") };
const row = (o: CriticalFinanceRow): CriticalFinanceRow => ({ ...SEPT, ...o });
const stmt = (r: CriticalFinanceRow, basis: "completed" | "provisional" = "completed") => firstReadStatement(firstReadSufficiencyFromRow(r, basis));
const all = (s: ReturnType<typeof firstReadStatement>) => [s.given, s.notGiven ?? "", s.caveat].join(" ");

describe("N2 — My Business never claims cash was supplied when it is UNKNOWN", () => {
  it("revenue known, cost known, cash UNKNOWN: names revenue and a cost figure, says cash is not entered, names September 2026", () => {
    const s = stmt(row({ revenue: 80_000, fixedCosts: 40_000 }));
    expect(s.given).toBe("You have given OpsIQ revenue and a cost figure for September 2026.");
    expect(s.given).not.toMatch(/cash/i);
    expect(s.notGiven).toMatch(/Cash in hand is not entered/);
    expect(s.notGiven).toMatch(/how long your cash will last/);
  });
  it("revenue, cost and cash all known: says so, and nothing is reported as missing", () => {
    const s = stmt(row({ revenue: 80_000, variableCosts: 30_000, cashOnHand: 5_000 }));
    expect(s.given).toBe("You have given OpsIQ revenue, a cost figure and cash in hand for September 2026.");
    expect(s.notGiven).toBeNull();
  });
  it("cash known as an explicit ZERO counts as given (a known zero is not unknown)", () => {
    expect(stmt(row({ revenue: 1, fixedCosts: 1, cashOnHand: 0 })).given).toMatch(/cash in hand/);
  });
  it("revenue known, cash known, COSTS unknown: does not claim a cost figure; says costs are not entered", () => {
    const s = stmt(row({ revenue: 80_000, cashOnHand: 5_000 }));
    expect(s.given).toBe("You have given OpsIQ revenue and cash in hand for September 2026.");
    expect(s.given).not.toMatch(/cost figure/);
    expect(s.notGiven).toMatch(/a cost figure is not entered yet/);
  });
  it("revenue UNKNOWN (the audit case): does not claim revenue; says it is not entered", () => {
    const s = stmt(row({ fixedCosts: 40_000, cashOnHand: 5_000 }));
    expect(s.given).toBe("You have given OpsIQ a cost figure and cash in hand for September 2026.");
    expect(s.notGiven).toMatch(/^revenue is not entered yet/i);
  });
  it("two facts missing are listed together", () => {
    expect(stmt(row({ cashOnHand: 1 })).notGiven).toMatch(/revenue and a cost figure are not entered yet/);
  });
  it("nothing known: holds saved figures, claims no specific fact", () => {
    const s = stmt(row({}));
    expect(s.given).toBe("OpsIQ holds saved figures for September 2026.");
    expect(all(s)).not.toMatch(/You have given OpsIQ/);
  });
  it("a provisional period says the month is still in progress; a completed one does not", () => {
    expect(stmt(row({ revenue: 1, fixedCosts: 1 }), "provisional").given).toMatch(/a month that is still in progress, so the read is provisional/);
    expect(stmt(row({ revenue: 1, fixedCosts: 1 })).given).not.toMatch(/in progress/);
  });
  it("a custom period is worded as a date range, not a month", () => {
    const s = firstReadStatement(firstReadSufficiencyFromRow({ revenue: 1, fixedCosts: 1, periodStart: "2026-09-05T00:00:00Z", periodEnd: "2026-10-04T00:00:00Z" }));
    expect(s.given).toMatch(/for 5 Sep 2026 to 4 Oct 2026\./);
  });
  it("the caveat is always present: a rough picture, not the whole business", () => {
    for (const r of [row({ revenue: 1, fixedCosts: 1, cashOnHand: 1 }), row({}), row({ cashOnHand: 1 })]) {
      expect(stmt(r).caveat).toBe("That is a rough financial picture — it does not mean OpsIQ knows the whole business.");
    }
  });
  it("an older payload without sufficiency claims no fact at all", () => {
    expect(all(firstReadStatement(undefined))).not.toMatch(/revenue|cash|cost figure/i);
    expect(firstReadStatement(undefined).given).toBe("OpsIQ has enough saved to run a first read.");
  });
});

describe("N2 — the period follows the snapshot the answer rests on", () => {
  it("a sufficient completed snapshot wins; its period is the one named", () => {
    const fr = firstReadSufficiencyFromSnapshots({
      completed: { revenue: 1, fixedCosts: 1, periodStart: "2026-08-01T00:00:00Z", periodEnd: "2026-08-31T00:00:00Z" },
      provisional: { revenue: 1, fixedCosts: 1, periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-10-31T00:00:00Z" },
    });
    expect(fr.basis).toBe("completed");
    expect(firstReadStatement(fr).given).toMatch(/August 2026/);
  });
  it("no snapshot: no period", () => {
    expect(firstReadSufficiencyFromRow(null).period).toBeNull();
  });
});

describe("N8 — saved costs and cash with revenue UNKNOWN is not 'no business data'", () => {
  it("the statement says what IS saved", () => {
    const s = stmt(row({ fixedCosts: 40_000, cashOnHand: 5_000 }));
    expect(all(s)).not.toMatch(/no business data/i);
    expect(s.given).toMatch(/cost figure and cash in hand/);
  });
});
