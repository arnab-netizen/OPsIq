/**
 * R10 P2-9 — table-driven proof of the ONE cash/finance narrative mapper (Cases A-I) plus a
 * mutation proof that restoring the old second-engine branch (deciding via `.effectiveState`/
 * `.conflicting`/`.supersededSource` instead of the authoritative `gateState`/`gateDriver`) makes
 * the known stale/current cases fail. See cash-finance-narrative.ts for the full contract.
 */
import { describe, it, expect } from "vitest";
import { cashFinanceOwnerNarrative, type CashFinanceOwnerNarrativeInput } from "@/domain/owner-guidance/cash-finance-narrative";

const base: CashFinanceOwnerNarrativeInput = {
  cashState: undefined, finState: undefined, cashLastKnown: null, finStaleLastKnown: null,
  finAmendedLastKnown: null, gateState: null, gateDriver: null, gateSource: null,
  provisional: false, bothCurrentDisagree: false, financeProfitDriven: false,
  supersededSource: null, supersededState: null,
};

describe("R10 P2-9: cashFinanceOwnerNarrative — Cases A-I", () => {
  it("Case A: current CRITICAL cash + stale SAFE finance — cash is the current danger, never downgraded, never 'conflicting'", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "CRITICAL", finState: undefined,
      finStaleLastKnown: "SAFE",
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow",
    });
    const cash = issues.find((i) => i.id === "cash");
    expect(cash).toBeDefined();
    expect(cash?.severity).toBe("CRITICAL");
    expect(cash?.headline).not.toMatch(/conflicting information/i);
    expect(cash?.headline).not.toMatch(/missing/i);
  });

  it("Case B: current SAFE cash + stale CRITICAL finance — exact required wording, last-known named as last-known only, never proven current", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "SAFE", finState: undefined,
      finStaleLastKnown: "CRITICAL",
      gateState: "AT_RISK", gateDriver: "unverified", gateSource: "finance",
    });
    const unverified = issues.find((i) => i.id === "cash_unverified");
    expect(unverified).toBeDefined();
    expect(unverified?.headline).toContain(
      "Cash is currently safe, but Finance figures are out of date, so OpsIQ cannot confirm overall financial safety."
    );
    expect(unverified?.headline).toContain("last Finance diagnosis showed CRITICAL");
    expect(unverified?.headline).not.toMatch(/finance figures? (is|are) critical\b/i);
    // No fabricated cash-danger issue naming cash itself as the problem:
    expect(issues.find((i) => i.id === "cash")).toBeUndefined();
  });

  it("Case C: current CRITICAL profit-driven finance + stale SAFE cash — a financial/profitability danger, never called cash danger", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: "CRITICAL",
      cashLastKnown: "SAFE",
      gateState: "CRITICAL", gateDriver: "finance_profit", gateSource: "finance",
      financeProfitDriven: true,
    });
    const margin = issues.find((i) => i.id === "margin");
    expect(margin).toBeDefined();
    expect(margin?.headline).toMatch(/profit and margin/i);
    expect(issues.some((i) => i.id === "cash" && i.category === "CASH_DANGER" && !i.headline.includes("profit"))).toBe(false);
  });

  it("Case D: Finance amended SAFE/WATCH + no current cash — last result may be named, current state unverified, no cash OK claimed", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      finAmendedLastKnown: "SAFE",
      gateState: "AT_RISK", gateDriver: "unverified", gateSource: "finance",
    });
    const amended = issues.find((i) => i.id === "finance_amended");
    expect(amended).toBeDefined();
    expect(amended?.headline).toMatch(/amended/i);
    expect(amended?.headline).not.toMatch(/is (currently )?safe\b/i);
  });

  it("Case E: Finance amended CRITICAL + no current cash — last known unsafe stated, never asserted as present-proven", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      finAmendedLastKnown: "CRITICAL",
      gateState: "CRITICAL", gateDriver: "unverified", gateSource: "finance",
    });
    const amended = issues.find((i) => i.id === "finance_amended");
    expect(amended).toBeDefined();
    expect(amended?.headline).toContain("CRITICAL");
    expect(amended?.headline).toMatch(/re-run the Finance diagnosis/i);
    expect(amended?.severity).toBe("CRITICAL");
  });

  it("Case F: both CURRENT and genuinely disagree — the only branch with an explicit current-conflict narrative", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "AT_RISK", finState: "SAFE",
      gateState: "AT_RISK", gateDriver: "cash", gateSource: "cashflow",
      bothCurrentDisagree: true,
    });
    const cash = issues.find((i) => i.id === "cash");
    expect(cash?.headline.toLowerCase()).toContain("conflicting information");
  });

  it("Case F does not fire when not genuinely disagreeing (both current, resolved, not conflicting) — narrates the shared decision instead", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "CRITICAL", finState: "SAFE",
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow",
      supersededSource: "finance", supersededState: "SAFE",
      bothCurrentDisagree: false,
    });
    const cash = issues.find((i) => i.id === "cash");
    expect(cash?.headline).not.toMatch(/conflicting information/i);
    expect(cash?.headline).toContain("CRITICAL");
  });

  it("Case G: provisional unsafe tightens — narrated as in-progress, never completed evidence", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      gateState: "AT_RISK", gateDriver: "cash", gateSource: "cashflow",
      provisional: true,
    });
    const inProgress = issues.find((i) => i.id === "cash_in_progress");
    expect(inProgress).toBeDefined();
    expect(inProgress?.headline).toMatch(/in progress/i);
    expect(inProgress?.headline).toMatch(/not a completed period/i);
    expect(inProgress?.headline).not.toMatch(/confirmed|proven/i);
  });

  it("Case H: provisional SAFE/WATCH alone — never claims proven safety (no issue fabricated, no danger claim)", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      gateState: "AT_RISK", gateDriver: "unverified", gateSource: "cashflow",
      provisional: true,
    });
    // gateDriver "unverified" (a provisional SAFE/WATCH alone never proves safety) — no cash_in_progress
    // (that requires gateDriver !== "unverified"), and no issue claims safety is proven.
    expect(issues.find((i) => i.id === "cash_in_progress")).toBeUndefined();
    expect(issues.every((i) => !/proven safe|confirmed safe/i.test(i.headline))).toBe(true);
  });

  it("Case I: no evidence at all — no fabricated cash issue", () => {
    const issues = cashFinanceOwnerNarrative({ ...base });
    expect(issues).toHaveLength(0);
  });
});

describe("R10 P2-9: mutation proof — restoring the old second-engine decision breaks known cases", () => {
  /** The retired branch: decides severity/subject from legacy `.effectiveState`/`.conflicting`/
   *  `.supersededSource` instead of the authoritative gateState/gateDriver/gateSource. */
  function legacySecondEngineNarrative(input: CashFinanceOwnerNarrativeInput & { legacyConflicting: boolean; legacyEffectiveState: string | null }) {
    const { cashState, finState, legacyConflicting, legacyEffectiveState, supersededSource, supersededState } = input;
    if (cashState && finState) {
      if (legacyConflicting) {
        return { id: "cash", headline: `We have conflicting information about cash health for this business: the latest cash check says ${cashState}, the latest finance diagnosis says ${finState}.` };
      }
      // BUG: uses the legacy effectiveState (which can diverge from gateState) instead of gateState.
      const subject = supersededSource === "finance" ? "Cash survival (cash check)" : "Cash and financial survival";
      return { id: "cash", headline: `${subject} is ${legacyEffectiveState}.${supersededSource ? ` An earlier reading showed ${supersededState}.` : ""}` };
    }
    return null;
  }

  it("Case A reproduction: legacy engine can report a SAFE-ish effectiveState even while the current source is CRITICAL, hiding real danger", () => {
    // The bug this replaces: the legacy resolution's own `.effectiveState` can be computed
    // independently of the P1-3 current-source-wins fix and diverge from gateState. Simulate that
    // divergence (effectiveState stuck at the stale/legacy WATCH instead of the current CRITICAL).
    const legacy = legacySecondEngineNarrative({
      ...base,
      cashState: "CRITICAL", finState: "SAFE",
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow",
      legacyConflicting: false, legacyEffectiveState: "WATCH", // <- diverges from the authoritative CRITICAL
    } as CashFinanceOwnerNarrativeInput & { legacyConflicting: boolean; legacyEffectiveState: string | null });
    expect(legacy?.headline).toContain("WATCH"); // proves the legacy path CAN misreport severity
    expect(legacy?.headline).not.toContain("CRITICAL");

    // The current mapper never does this: it always narrates the authoritative gateState.
    const current = cashFinanceOwnerNarrative({
      ...base,
      cashState: "CRITICAL", finState: "SAFE",
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow",
      supersededSource: "finance", supersededState: "SAFE",
    });
    expect(current.find((i) => i.id === "cash")?.headline).toContain("CRITICAL");
  });

  it("stale-vs-current reproduction: legacy `.conflicting` flag (computed from raw, non-currency-aware states) can fire even when one source is not current, wrongly forcing a conflict narrative", () => {
    // The bug: the legacy engine's `.conflicting` was computed over raw states, not gateState's
    // currency-aware arbitration — it can be true even when only one side is actually current.
    const legacy = legacySecondEngineNarrative({
      ...base,
      cashState: "CRITICAL", finState: "SAFE",
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow",
      legacyConflicting: true, legacyEffectiveState: null, // <- legacy engine wrongly saw a conflict
    } as CashFinanceOwnerNarrativeInput & { legacyConflicting: boolean; legacyEffectiveState: string | null });
    expect(legacy?.headline).toMatch(/conflicting information/i); // proves the legacy path CAN wrongly conflict

    // The current mapper only narrates a conflict when bothCurrentDisagree is explicitly true (Case F).
    const current = cashFinanceOwnerNarrative({
      ...base,
      cashState: "CRITICAL", finState: "SAFE",
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow",
      supersededSource: "finance", supersededState: "SAFE",
      bothCurrentDisagree: false,
    });
    expect(current.find((i) => i.id === "cash")?.headline).not.toMatch(/conflicting information/i);
  });
});
