/**
 * Cash-survival-triage (OwnerCashflowCycle) and finance diagnosis (OwnerFinanceCycle) are two
 * separate, parallel domain signals for the SAME business — one a short-term liquidity triage,
 * the other a broader financial diagnosis. Both are always fetched as "the latest of their own
 * kind" for the active business, so they can genuinely go stale relative to each other: an owner
 * can re-run a finance diagnosis without re-running a cash check (or vice versa), producing an
 * older AT_RISK cash reading sitting alongside a newer SAFE finance diagnosis for the exact same
 * business — the contradiction a real human usability test reproduced ("Home says at risk while
 * Finance says SAFE").
 *
 * This resolves which reading Home should present as current truth, using freshness (which
 * source ran more recently) as the tie-breaker when the two disagree — never silently picking
 * one over the other without a reason, and never presenting a superseded stale reading as
 * unqualified current fact. When freshness genuinely cannot be established, this fails safe
 * (treated as unsafe/conflicting) rather than guessing, per the "material recommendations must
 * fail safe under conflicting evidence" rule.
 */

export type SurvivalLikeState = "SAFE" | "WATCH" | "AT_RISK" | "CRITICAL" | "INSOLVENT_RISK";

export interface CashFinanceSourceState {
  state: SurvivalLikeState | null;
  /** When this reading was generated. Required to arbitrate a genuine disagreement; if absent
   *  on either side and the two sources disagree, the disagreement is treated as incomparable. */
  generatedAt: Date | null;
}

export interface CashFinanceResolution {
  /** The state Home should present as current truth, or null only when genuinely conflicting
   *  (both sources present, disagree, and freshness cannot be established). */
  effectiveState: SurvivalLikeState | null;
  /** Whether the effective reading is safe — false (fail-safe) when conflicting. */
  safe: boolean;
  /** True only when both sources are present, disagree on safe/unsafe, and neither can be shown
   *  to be more current than the other. Callers must render an explicit conflict state, never
   *  silently choose one side. */
  conflicting: boolean;
  /** Which source's reading was superseded by a fresher, disagreeing reading from the other
   *  source — null unless a genuine freshness-based supersession occurred. */
  supersededSource: "cash" | "finance" | null;
  supersededState: SurvivalLikeState | null;
}

const SAFE_STATES = new Set<SurvivalLikeState>(["SAFE", "WATCH"]);

function severityRank(state: SurvivalLikeState): number {
  switch (state) {
    case "INSOLVENT_RISK":
      return 4;
    case "CRITICAL":
      return 3;
    case "AT_RISK":
      return 2;
    case "WATCH":
      return 1;
    case "SAFE":
    default:
      return 0;
  }
}

export function resolveCashFinanceSignal(
  cash: CashFinanceSourceState,
  finance: CashFinanceSourceState
): CashFinanceResolution {
  const none: CashFinanceResolution = {
    effectiveState: null,
    safe: false,
    conflicting: false,
    supersededSource: null,
    supersededState: null,
  };

  if (!cash.state && !finance.state) return none;
  if (!cash.state) {
    return { effectiveState: finance.state, safe: SAFE_STATES.has(finance.state!), conflicting: false, supersededSource: null, supersededState: null };
  }
  if (!finance.state) {
    return { effectiveState: cash.state, safe: SAFE_STATES.has(cash.state), conflicting: false, supersededSource: null, supersededState: null };
  }

  const cashSafe = SAFE_STATES.has(cash.state);
  const financeSafe = SAFE_STATES.has(finance.state);

  if (cashSafe === financeSafe) {
    // Both sources agree on safe/unsafe — no conflict. When both are unsafe, present the more
    // severe of the two literal states rather than guessing which domain's number to show.
    if (cashSafe) return { effectiveState: "SAFE", safe: true, conflicting: false, supersededSource: null, supersededState: null };
    const moreSevere = severityRank(cash.state) >= severityRank(finance.state) ? cash.state : finance.state;
    return { effectiveState: moreSevere, safe: false, conflicting: false, supersededSource: null, supersededState: null };
  }

  // Genuine disagreement: one side safe, the other not. Freshness decides which is current.
  if (cash.generatedAt && finance.generatedAt && cash.generatedAt.getTime() !== finance.generatedAt.getTime()) {
    const financeIsNewer = finance.generatedAt.getTime() > cash.generatedAt.getTime();
    const effectiveState = financeIsNewer ? finance.state : cash.state;
    const supersededSource: "cash" | "finance" = financeIsNewer ? "cash" : "finance";
    const supersededState = financeIsNewer ? cash.state : finance.state;
    return {
      effectiveState,
      safe: SAFE_STATES.has(effectiveState),
      conflicting: false,
      supersededSource,
      supersededState,
    };
  }

  // Freshness cannot be established (missing timestamp on either side, or an exact tie) —
  // genuinely incomparable. Fail safe: never silently prefer one reading over the other.
  return { effectiveState: null, safe: false, conflicting: true, supersededSource: null, supersededState: null };
}
