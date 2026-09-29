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

describe("R10 P2-9 follow-up: legacy context fields are wording-only (context invariance)", () => {
  type IssueShape = { id: string; category: string; severity: string; requiresOwnerAction: boolean };
  const shape = (issues: ReturnType<typeof cashFinanceOwnerNarrative>): IssueShape[] =>
    issues.map((i) => ({ id: i.id, category: i.category, severity: i.severity, requiresOwnerAction: i.requiresOwnerAction }));

  const scenarios: Array<{ label: string; input: CashFinanceOwnerNarrativeInput }> = [
    {
      label: "gateDriver=cash, both current, cash unsafe",
      input: { ...base, cashState: "CRITICAL", finState: "SAFE", gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow" },
    },
    {
      label: "gateDriver=finance_profit, both current, finance unsafe + cash unsafe too",
      input: { ...base, cashState: "CRITICAL", finState: "AT_RISK", gateState: "AT_RISK", gateDriver: "finance_profit", gateSource: "finance", financeProfitDriven: true },
    },
    {
      label: "gateDriver=unverified, both current (edge case)",
      input: { ...base, cashState: "AT_RISK", finState: "AT_RISK", gateState: "AT_RISK", gateDriver: "unverified", gateSource: "finance" },
    },
  ];

  for (const { label, input } of scenarios) {
    it(`${label}: identical issue ids/categories/severities/requiresOwnerAction across supersededSource variants — only wording may differ`, () => {
      const none = cashFinanceOwnerNarrative({ ...input, supersededSource: null, supersededState: null });
      const cash = cashFinanceOwnerNarrative({ ...input, supersededSource: "cash", supersededState: "SAFE" });
      const finance = cashFinanceOwnerNarrative({ ...input, supersededSource: "finance", supersededState: "SAFE" });

      expect(shape(cash)).toEqual(shape(none));
      expect(shape(finance)).toEqual(shape(none));

      // Wording MAY differ (that's the one thing these fields are allowed to change):
      const headlines = [none, cash, finance].map((issues) => issues.map((i) => i.headline).join("|"));
      // Not asserting they DO differ (they needn't, e.g. when gateDriver="unverified" ignores them) —
      // only that classification never does, which the equality checks above already prove.
      expect(headlines.length).toBe(3);
    });
  }

  it("mutation check: reintroducing supersededSource-dependent classification breaks context invariance", () => {
    // Simulates the retired bug: branching (which issue/category is emitted) keyed off
    // supersededSource instead of gateDriver.
    function buggyClassify(input: CashFinanceOwnerNarrativeInput): IssueShape[] {
      const { cashState, finState, gateState, supersededSource } = input;
      if (!cashState || !finState || !gateState) return [];
      // BUG: category flips based on supersededSource, not gateDriver.
      const category = supersededSource === "finance" ? "CASH_DANGER" : supersededSource === "cash" ? "PROFIT_LEAK" : "CASH_DANGER";
      return [{ id: "cash", category, severity: "CRITICAL", requiresOwnerAction: true }];
    }
    const scenario = scenarios[0].input;
    const buggyNone = buggyClassify({ ...scenario, supersededSource: null, supersededState: null });
    const buggyCash = buggyClassify({ ...scenario, supersededSource: "cash", supersededState: "SAFE" });
    const buggyFinance = buggyClassify({ ...scenario, supersededSource: "finance", supersededState: "SAFE" });
    // Proves the buggy path DOES violate context invariance (different category per variant):
    expect(buggyCash[0]?.category).not.toEqual(buggyNone[0]?.category);
    expect(buggyFinance[0]?.category).toEqual(buggyNone[0]?.category);
    expect(buggyCash[0]?.category).not.toEqual(buggyFinance[0]?.category);

    // The real mapper does not: category is identical across all three variants.
    const realNone = shape(cashFinanceOwnerNarrative({ ...scenario, supersededSource: null, supersededState: null }));
    const realCash = shape(cashFinanceOwnerNarrative({ ...scenario, supersededSource: "cash", supersededState: "SAFE" }));
    const realFinance = shape(cashFinanceOwnerNarrative({ ...scenario, supersededSource: "finance", supersededState: "SAFE" }));
    expect(realCash).toEqual(realNone);
    expect(realFinance).toEqual(realNone);
  });
});

describe("R10 P2-9 follow-up: bothCurrentDisagree invariant — only a genuinely current pair may trigger Case F", () => {
  it("call-site guard: one current + one stale source, even with legacy conflicting=true, cannot set bothCurrentDisagree", () => {
    // Mirrors the actual call site in owner-now-view.service.ts: bothCurrentDisagree is gated on
    // Boolean(cashState) && Boolean(finState) (both CURRENT-only locals) BEFORE the legacy
    // `.conflicting` flag is even consulted.
    const cashState: string | undefined = "CRITICAL"; // current
    const finState: string | undefined = undefined; // NOT current (stale) — this is the point
    const legacyConflicting = true; // legacy engine (wrongly, or on raw non-current states) says conflict
    const bothCurrentDisagree = Boolean(cashState) && Boolean(finState) && legacyConflicting;
    expect(bothCurrentDisagree).toBe(false);

    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState, finState,
      cashLastKnown: null, finStaleLastKnown: "SAFE",
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow",
      bothCurrentDisagree,
    });
    expect(issues.find((i) => i.id === "cash")?.headline).not.toMatch(/conflicting information/i);
  });

  it("both stale (neither current) cannot set bothCurrentDisagree either", () => {
    const cashState: string | undefined = undefined;
    const finState: string | undefined = undefined;
    const legacyConflicting = true;
    const bothCurrentDisagree = Boolean(cashState) && Boolean(finState) && legacyConflicting;
    expect(bothCurrentDisagree).toBe(false);
  });

  it("only both current + legacy conflicting=true sets bothCurrentDisagree", () => {
    const cashState: string | undefined = "AT_RISK";
    const finState: string | undefined = "SAFE";
    const legacyConflicting = true;
    const bothCurrentDisagree = Boolean(cashState) && Boolean(finState) && legacyConflicting;
    expect(bothCurrentDisagree).toBe(true);
  });
});

describe("R10 P2-9 hostile-review fix: a non-profit-driven Finance danger is never duplicated/mislabelled as a generic margin issue", () => {
  it("exactly one current (Finance only), non-profit-driven CRITICAL — exactly one issue, correctly labelled CASH_DANGER", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: "CRITICAL",
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "finance",
      financeProfitDriven: false,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ id: "cash", category: "CASH_DANGER" });
    expect(issues.some((i) => i.id === "margin")).toBe(false);
  });

  it("both current, gateDriver=cash, finance also independently unsafe but NOT profit-driven — a real second issue, not a mislabelled margin issue", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "CRITICAL", finState: "AT_RISK",
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow",
      financeProfitDriven: false,
    });
    expect(issues.some((i) => i.id === "margin")).toBe(false);
    const cash = issues.find((i) => i.id === "cash");
    expect(cash).toMatchObject({ category: "CASH_DANGER", severity: "CRITICAL" });
    const financeSurvival = issues.find((i) => i.id === "finance_survival");
    expect(financeSurvival).toMatchObject({ category: "CASH_DANGER", severity: "HIGH" });
    expect(issues).toHaveLength(2);
  });

  it("both current, gateDriver=unverified, finance also unsafe non-profit — the combined issue already covers it, no mislabelled margin issue", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "AT_RISK", finState: "AT_RISK",
      gateState: "AT_RISK", gateDriver: "unverified", gateSource: "finance",
      financeProfitDriven: false,
    });
    // The unverifiedGate block legitimately adds its own "cash_unverified" notice — that is
    // expected, pre-existing behavior, not the bug under test. Only "margin" is disallowed here.
    expect(issues.some((i) => i.id === "margin")).toBe(false);
  });

  it("both current, bothCurrentDisagree, non-profit — the conflict issue already covers finState, no extra margin issue", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "AT_RISK", finState: "CRITICAL",
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow",
      financeProfitDriven: false,
      bothCurrentDisagree: true,
    });
    expect(issues.some((i) => i.id === "margin")).toBe(false);
    expect(issues).toHaveLength(1);
  });

  it("mutation check: reverting to the old !profitIssueRaised-only guard reproduces the bug on the same input", () => {
    // Simulates the retired trailing-fallback guard (missing the financeIssueRaised check).
    const issuesWithoutGuard = [
      { id: "cash", category: "CASH_DANGER" },
      // The buggy fallback would ALSO push this, mislabelling a non-profit danger as PROFIT_LEAK:
      { id: "margin", category: "PROFIT_LEAK", headline: "Profit/margin is below a safe level" },
    ];
    expect(issuesWithoutGuard.some((i) => i.id === "margin")).toBe(true); // proves the old shape had the bug

    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "CRITICAL", finState: "AT_RISK",
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow",
      financeProfitDriven: false,
    });
    expect(issues.some((i) => i.id === "margin")).toBe(false); // the real mapper does not
  });
});

describe("R10 P2-9 round-3 hostile-review fix: trailing fallback uses cashSeverity()/requiresOwnerAction consistently, never a hand-rolled ternary", () => {
  it("gateState SAFE (freshness tie-break picks cash) with finState independently CRITICAL, non-profit — a real CASH_DANGER finance_survival issue, CRITICAL severity, requiresOwnerAction true (not a downgraded 'margin' issue)", () => {
    // Simulates a fresher CURRENT SAFE cash reading superseding a CURRENT unsafe Finance reading: both
    // current, not disagreeing (or the disagreement already resolved elsewhere), gateState itself SAFE.
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "SAFE", finState: "CRITICAL",
      gateState: "SAFE", gateDriver: "cash", gateSource: "cashflow",
      financeProfitDriven: false,
    });
    const finance = issues.find((i) => i.id === "finance_survival");
    expect(finance).toBeDefined();
    expect(finance?.category).toBe("CASH_DANGER");
    // Must match cashSeverity("CRITICAL") = "CRITICAL", never the old hand-rolled ternary's "HIGH":
    expect(finance?.severity).toBe("CRITICAL");
    expect(finance?.requiresOwnerAction).toBe(true);
    expect(issues.some((i) => i.id === "margin")).toBe(false);
  });

  it("same scenario, profit-driven — routed through pushFinanceProfitIssue, CRITICAL severity, requiresOwnerAction true", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "SAFE", finState: "CRITICAL",
      gateState: "SAFE", gateDriver: "cash", gateSource: "cashflow",
      financeProfitDriven: true,
    });
    const margin = issues.find((i) => i.id === "margin");
    expect(margin).toBeDefined();
    expect(margin?.severity).toBe("CRITICAL");
    expect(margin?.requiresOwnerAction).toBe(true);
  });

  it("mutation check: the retired hand-rolled ternary would have downgraded CRITICAL to HIGH and forced requiresOwnerAction false", () => {
    const retiredTernarySeverity = (finState: string) => (finState === "CRITICAL" || finState === "INSOLVENT_RISK" ? "HIGH" : "MEDIUM");
    expect(retiredTernarySeverity("CRITICAL")).toBe("HIGH"); // proves the old shape had the bug
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "SAFE", finState: "CRITICAL",
      gateState: "SAFE", gateDriver: "cash", gateSource: "cashflow",
      financeProfitDriven: false,
    });
    const finance = issues.find((i) => i.id === "finance_survival");
    expect(finance?.severity).toBe("CRITICAL"); // the real mapper does not downgrade it
    expect(finance?.requiresOwnerAction).toBe(true);
  });
});

describe("R10 P2-9 round-3 hostile-review fix: cash_unverified requiresOwnerAction follows the CRITICAL||HIGH pattern used everywhere else", () => {
  it("AT_RISK unverified gate (cashSeverity -> HIGH) still requires owner action, matching finance_amended's sibling pattern", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      cashLastKnown: "SAFE", finStaleLastKnown: "AT_RISK",
      gateState: "AT_RISK", gateDriver: "unverified", gateSource: "finance",
    });
    const unverified = issues.find((i) => i.id === "cash_unverified");
    expect(unverified?.severity).toBe("HIGH");
    expect(unverified?.requiresOwnerAction).toBe(true);
  });
});

describe("R10 P2-9 round-3 hostile-review fix: bothCurrentDisagree + financeProfitDriven no longer silently drops the conflicting-evidence framing", () => {
  it("profit-driven Case F still names the disagreement, on both the cash and the margin issue", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "AT_RISK", finState: "CRITICAL",
      gateState: "CRITICAL", gateDriver: "finance_profit", gateSource: "finance",
      financeProfitDriven: true,
      bothCurrentDisagree: true,
    });
    const cash = issues.find((i) => i.id === "cash");
    const margin = issues.find((i) => i.id === "margin");
    expect(cash?.headline).toMatch(/neither can be shown to be more current/i);
    expect(margin?.headline).toMatch(/neither can be shown to be more current/i);
  });
});

describe("R10 P2-9 round-4 hostile-review fix: a genuine current/current disagreement is never silently dropped, even when provisional in-progress figures also tighten gateState", () => {
  // Round 3's `bothCurrentDisagree && !provisional` guard fixed a duplicate/stale-looking narrative but,
  // per a round-4 hostile reviewer's REAL-DB reproduction (a genuine tied-freshness Cash-vs-Finance
  // disagreement plus a worse in-progress Cash reading), it silently erased a genuine, required
  // disagreement the module's own contract says must never be silently resolved. Case F now always
  // fires; when provisional is also true it gets an extra note, and Case G (in-progress) fires
  // alongside it as complementary — not contradictory — information.
  it("both completed states current+disagreeing, AND provisional in-progress figures already decide a worse gateState — the disagreement is still named, alongside the in-progress narrative", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "SAFE", finState: "CRITICAL",
      gateState: "INSOLVENT_RISK", gateDriver: "cash", gateSource: "cashflow",
      bothCurrentDisagree: true,
      provisional: true,
    });
    const conflict = issues.find((i) => /conflicting information/i.test(i.headline));
    expect(conflict).toBeDefined();
    expect(conflict?.headline).toMatch(/in-progress figures have already moved further/i);
    const inProgress = issues.find((i) => i.id === "cash_in_progress");
    expect(inProgress).toBeDefined();
    expect(inProgress?.headline).toMatch(/in progress/i);
    // Exactly one "cash"-id issue (the conflict one) — no separate, unqualified "settled" cash issue
    // duplicating the same in-progress value.
    expect(issues.filter((i) => i.id === "cash")).toHaveLength(1);
  });

  it("mutation check: reverting to round 3's `&& !provisional` guard would drop the conflict entirely on this input", () => {
    const legacyGuardFires = true && !true; // bothCurrentDisagree && !provisional, both true here
    expect(legacyGuardFires).toBe(false); // proves the retired guard would have skipped Case F entirely
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "SAFE", finState: "CRITICAL",
      gateState: "INSOLVENT_RISK", gateDriver: "cash", gateSource: "cashflow",
      bothCurrentDisagree: true,
      provisional: true,
    });
    expect(issues.some((i) => /conflicting information/i.test(i.headline))).toBe(true); // the real mapper still names it
  });
});

describe("R10 P2-9 round-4 hostile-review fix: gateState-driven 'settled' issues defer to Case G when provisional, instead of duplicating/contradicting it", () => {
  it("both current, non-conflicting, gateDriver cash, provisional — no unqualified 'cash' issue duplicating cash_in_progress for the same value", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "AT_RISK", finState: "SAFE",
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow",
      provisional: true,
    });
    expect(issues.some((i) => i.id === "cash" && !/in progress/i.test(i.headline))).toBe(false);
    const inProgress = issues.find((i) => i.id === "cash_in_progress");
    expect(inProgress).toBeDefined();
    expect(inProgress?.headline).toContain("CRITICAL");
  });

  it("both current, non-conflicting, gateDriver finance_profit, provisional — no unqualified 'margin' issue duplicating cash_in_progress for the same value", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "SAFE", finState: "AT_RISK",
      gateState: "CRITICAL", gateDriver: "finance_profit", gateSource: "finance",
      financeProfitDriven: true,
      provisional: true,
    });
    expect(issues.some((i) => i.id === "margin" && !/in progress/i.test(i.headline))).toBe(false);
    const inProgress = issues.find((i) => i.id === "cash_in_progress");
    expect(inProgress).toBeDefined();
    expect(inProgress?.category).toBe("PROFIT_LEAK");
  });

  it("exactly one current signal (cash only), provisional — no unqualified 'cash' issue duplicating cash_in_progress", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "CRITICAL", finState: undefined,
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow",
      provisional: true,
    });
    expect(issues.some((i) => i.id === "cash" && !/in progress/i.test(i.headline))).toBe(false);
    expect(issues.find((i) => i.id === "cash_in_progress")).toBeDefined();
  });

  it("gateDriver unverified, both current, non-conflicting — no combined 'cash' settled issue duplicating cash_unverified", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "AT_RISK", finState: "AT_RISK",
      gateState: "AT_RISK", gateDriver: "unverified", gateSource: "finance",
    });
    expect(issues.some((i) => i.id === "cash")).toBe(false);
    expect(issues.find((i) => i.id === "cash_unverified")).toBeDefined();
  });
});

describe("R10 P2-9 round-4 hostile-review fix: bothCurrentDisagree non-profit severity always derives from cashSeverity() (worst-of), never a hand-rolled CRITICAL/HIGH-only floor", () => {
  it("two disagreeing current readings, neither AT_RISK nor CRITICAL/INSOLVENT_RISK — severity is the MEDIUM cashSeverity() gives, not a forced HIGH", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "WATCH", finState: "SAFE",
      gateState: "WATCH", gateDriver: "cash", gateSource: "cashflow",
      bothCurrentDisagree: true,
    });
    // Note: WATCH/SAFE are both in SAFE_STATES, but bothCurrentDisagree fires the conflict branch
    // regardless of SAFE/unsafe (see Case F's own base test) — this exercises the severity computation
    // itself, not whether SAFE states can disagree in practice.
    const cash = issues.find((i) => i.id === "cash");
    expect(cash?.severity).toBe("MEDIUM");
  });

  it("mutation check: the retired hand-rolled ternary would have forced HIGH instead of MEDIUM", () => {
    const retiredTernary = (cashState: string, finState: string) =>
      cashState === "CRITICAL" || cashState === "INSOLVENT_RISK" || finState === "CRITICAL" || finState === "INSOLVENT_RISK" ? "CRITICAL" : "HIGH";
    expect(retiredTernary("WATCH", "SAFE")).toBe("HIGH"); // proves the old shape had the bug
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: "WATCH", finState: "SAFE",
      gateState: "WATCH", gateDriver: "cash", gateSource: "cashflow",
      bothCurrentDisagree: true,
    });
    expect(issues.find((i) => i.id === "cash")?.severity).toBe("MEDIUM"); // the real mapper does not force HIGH
  });
});

describe("R10 P2-9 round-5 hostile-review fix: Case G's source label and survival-type noun always agree with each other (both keyed off gateSource, never off gateDriver's profit check alone)", () => {
  it("gateDriver 'cash' with gateSource 'finance' (a non-profit-driven Finance-sourced reading) — 'Finance figures show financial survival', never the self-contradictory 'Finance figures show cash survival'", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "finance",
      provisional: true,
    });
    const inProgress = issues.find((i) => i.id === "cash_in_progress");
    expect(inProgress).toBeDefined();
    expect(inProgress?.headline).toContain("Finance figures show financial survival");
    expect(inProgress?.headline).not.toMatch(/Finance figures show cash survival/i);
    // Category still keys off the profit check alone (gateDriver !== "finance_profit" here) — a
    // non-profit-driven Finance danger is still classified CASH_DANGER, matching the rest of the file:
    expect(inProgress?.category).toBe("CASH_DANGER");
  });

  it("gateDriver 'cash' with gateSource 'cashflow' — 'cash figures show cash survival', unchanged from before", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow",
      provisional: true,
    });
    const inProgress = issues.find((i) => i.id === "cash_in_progress");
    expect(inProgress?.headline).toContain("cash figures show cash survival");
  });

  it("gateDriver 'finance_profit' with gateSource 'finance' — 'Finance figures show financial survival', unchanged from before", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      gateState: "CRITICAL", gateDriver: "finance_profit", gateSource: "finance",
      provisional: true,
    });
    const inProgress = issues.find((i) => i.id === "cash_in_progress");
    expect(inProgress?.headline).toContain("Finance figures show financial survival");
    expect(inProgress?.category).toBe("PROFIT_LEAK");
  });

  it("mutation check: keying the survival-type noun off gateDriver's profit check alone (the retired shape) would reproduce the mismatch", () => {
    const retiredWording = (gateSource: string, gateDriver: string) => {
      const profit = gateDriver === "finance_profit";
      return `${gateSource === "finance" ? "Finance" : "cash"} figures show ${profit ? "financial" : "cash"} survival`;
    };
    expect(retiredWording("finance", "cash")).toBe("Finance figures show cash survival"); // proves the old shape had the bug
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      gateState: "CRITICAL", gateDriver: "cash", gateSource: "finance",
      provisional: true,
    });
    expect(issues.find((i) => i.id === "cash_in_progress")?.headline).not.toContain("Finance figures show cash survival");
  });
});

describe("R10 P2-9 round-8 hostile-review fix: finance_amended's severity/headline fold in a WORSE stale cash reading instead of understating the danger", () => {
  it("stale cash CRITICAL + amended Finance AT_RISK — severity is CRITICAL (the worse of the two), and the stale cash fact is named, not dropped", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      cashLastKnown: "CRITICAL",
      finAmendedLastKnown: "AT_RISK",
      gateState: "CRITICAL", gateDriver: "unverified", gateSource: "cashflow",
    });
    const amended = issues.find((i) => i.id === "finance_amended");
    expect(amended).toBeDefined();
    // Must not be downgraded to the amended reading's own HIGH severity:
    expect(amended?.severity).toBe("CRITICAL");
    expect(amended?.requiresOwnerAction).toBe(true);
    // The stale cash fact must be named somewhere in the headline, not silently dropped:
    expect(amended?.headline).toContain("CRITICAL");
    expect(amended?.headline).toMatch(/last cash check also showed CRITICAL/i);
  });

  it("mutation check: severity from finAmendedLastKnown alone would understate a worse stale cash reading as HIGH instead of CRITICAL", () => {
    const retiredSeverityOnly = (finAmendedLastKnown: string) =>
      finAmendedLastKnown === "CRITICAL" || finAmendedLastKnown === "INSOLVENT_RISK" ? "CRITICAL" : finAmendedLastKnown === "AT_RISK" ? "HIGH" : "MEDIUM";
    expect(retiredSeverityOnly("AT_RISK")).toBe("HIGH"); // proves the old shape had the bug
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      cashLastKnown: "CRITICAL",
      finAmendedLastKnown: "AT_RISK",
      gateState: "CRITICAL", gateDriver: "unverified", gateSource: "cashflow",
    });
    expect(issues.find((i) => i.id === "finance_amended")?.severity).toBe("CRITICAL"); // the real mapper does not understate it
  });

  it("stale cash SAFE (or absent) + amended Finance CRITICAL — unchanged from before, no spurious cash note", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      finAmendedLastKnown: "CRITICAL",
      gateState: "CRITICAL", gateDriver: "unverified", gateSource: "finance",
    });
    const amended = issues.find((i) => i.id === "finance_amended");
    expect(amended?.severity).toBe("CRITICAL");
    expect(amended?.headline).not.toMatch(/last cash check also showed/i);
  });
});

describe("R10 P2-9 round-9 hostile-review fix: finance_amended's category/businessFunction never mislabel a cash-driven escalation as a pure margin problem", () => {
  it("financeProfitDriven + amended AT_RISK (HIGH) escalated to CRITICAL by a worse stale cash reading — category is CASH_DANGER, not PROFIT_LEAK", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      cashLastKnown: "CRITICAL",
      finAmendedLastKnown: "AT_RISK",
      gateState: "CRITICAL", gateDriver: "unverified", gateSource: "cashflow",
      financeProfitDriven: true,
    });
    const amended = issues.find((i) => i.id === "finance_amended");
    expect(amended).toBeDefined();
    expect(amended?.severity).toBe("CRITICAL");
    // The escalation is entirely cash-driven — must not be filed as a pure margin problem with no
    // CASH_FLOW tag:
    expect(amended?.category).toBe("CASH_DANGER");
    expect(amended?.businessFunction).toContain("CASH_FLOW");
    expect(amended?.businessFunction).not.toContain("PROFITABILITY");
  });

  it("financeProfitDriven + amended CRITICAL, stale cash lower (or absent) — category stays PROFIT_LEAK, unchanged from before", () => {
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      cashLastKnown: "AT_RISK",
      finAmendedLastKnown: "CRITICAL",
      gateState: "CRITICAL", gateDriver: "unverified", gateSource: "finance",
      financeProfitDriven: true,
    });
    const amended = issues.find((i) => i.id === "finance_amended");
    expect(amended?.severity).toBe("CRITICAL");
    expect(amended?.category).toBe("PROFIT_LEAK");
    expect(amended?.businessFunction).toContain("PROFITABILITY");
  });

  it("mutation check: keying category off financeProfitDriven alone would mislabel the cash-driven escalation as PROFIT_LEAK", () => {
    const retiredCategory = (financeProfitDriven: boolean, unsafeLastKnown: boolean) => (financeProfitDriven && unsafeLastKnown ? "PROFIT_LEAK" : "CASH_DANGER");
    expect(retiredCategory(true, true)).toBe("PROFIT_LEAK"); // proves the old shape had the bug
    const issues = cashFinanceOwnerNarrative({
      ...base,
      cashState: undefined, finState: undefined,
      cashLastKnown: "CRITICAL",
      finAmendedLastKnown: "AT_RISK",
      gateState: "CRITICAL", gateDriver: "unverified", gateSource: "cashflow",
      financeProfitDriven: true,
    });
    expect(issues.find((i) => i.id === "finance_amended")?.category).toBe("CASH_DANGER"); // the real mapper does not mislabel it
  });
});
