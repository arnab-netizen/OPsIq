/**
 * R10 P2-9 — the ONE narrative mapper for Now View's cash/finance issue text.
 *
 * `currentCashFinanceReading()` already decided which state wins (`gateState`), what drives it
 * (`gateDriver`), which source backs it (`gateSource`), and whether it rests on unverified or
 * provisional evidence. This module NEVER re-decides any of that. It only narrates the already-
 * decided projection into owner-facing issue text.
 *
 * It deliberately takes primitive, authoritative facts as input — never `effectiveState` or
 * `safe` from the legacy `CashFinanceResolution` at all. Two legacy fields are still accepted, but
 * under a hard contract: they may ONLY change wording, never which issue exists, its id, category,
 * severity, or requiresOwnerAction:
 *   - `bothCurrentDisagree`: true only when both sources are CURRENT and genuinely disagree with no
 *     way to tell which is more current (Case F). A narration TRIGGER only — every branch it opens
 *     still gets its severity/category from `gateState`/`gateDriver`, never from this flag itself.
 *   - `supersededSource`/`supersededState`: which earlier, now-stale reading to name in an extra
 *     context sentence. All branching in this module is driven by `gateDriver` alone
 *     ("cash" | "finance_profit" | "unverified"); these two fields are read only inside the
 *     already-chosen branch, to append " An earlier X showed Y" — never to choose the branch.
 */
import { IssueCategory } from "@/domain/owner-guidance/issue-priority";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";
import type { SurvivalLikeState } from "@/domain/owner-guidance/cash-finance-conflict";

export type CashFinanceNarrativeSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface CashFinanceNarrativeIssue {
  id: string;
  category: IssueCategory;
  businessFunction: BusinessFunction[];
  severity: CashFinanceNarrativeSeverity;
  headline: string;
  requiresOwnerAction: boolean;
}

const SAFE_STATES: ReadonlySet<string> = new Set(["SAFE", "WATCH"]);

function cashSeverity(state: string | null): CashFinanceNarrativeSeverity {
  if (state === "CRITICAL" || state === "INSOLVENT_RISK") return "CRITICAL";
  if (state === "AT_RISK") return "HIGH";
  return "MEDIUM";
}

export interface CashFinanceOwnerNarrativeInput {
  /** Cash flow's CURRENT state only (undefined/null when cash is not current). */
  cashState: string | null | undefined;
  /** Finance's CURRENT state only (undefined/null when finance is not current, including amended). */
  finState: string | null | undefined;
  /** Cash flow's last-known state when it is NOT current (stale/future-dated); null otherwise. */
  cashLastKnown: SurvivalLikeState | null;
  /** Finance's last-known state when it is NOT current and NOT amended; null otherwise. */
  finStaleLastKnown: SurvivalLikeState | null;
  /** The last Finance diagnosis's state while its figures have since been amended; null otherwise. */
  finAmendedLastKnown: SurvivalLikeState | null;
  /** The authoritative enforced state (`gateState`). Null only when there is no reading at all. */
  gateState: SurvivalLikeState | null;
  /** What drives `gateState` — cash, a profit-driven Finance state, or unverified figures. */
  gateDriver: "cash" | "finance_profit" | "unverified" | null;
  /** The source whose figures decide `gateState`. */
  gateSource: "cashflow" | "finance" | null;
  /** True only when the in-progress current period's figures decide `gateState` (label as in progress). */
  provisional: boolean;
  /**
   * Case F trigger ONLY: both sources are CURRENT and genuinely disagree with no way to tell which
   * is more current. Never used to decide severity or attribution — `gateState`/`gateDriver`/
   * `gateSource` still do that, even inside this branch.
   */
  bothCurrentDisagree: boolean;
  /**
   * Whether Finance's OWN diagnosis (its findings, financeSurvivalDriver) is profit/margin-driven —
   * independent of whether Finance is the source currently deciding the gate. A stale or superseded
   * Finance reading is still named as a profit problem, never mislabeled "cash danger", even when
   * `gateDriver` itself is "cash" because Finance is not the decisive current source.
   */
  financeProfitDriven: boolean;
  /**
   * CONTEXT ONLY — which source (if any) a fresher, disagreeing current reading superseded, and what
   * it showed. Used only to name "an earlier cash check/finance diagnosis showed X" in a headline; it
   * never decides severity, classification, or which state wins — `gateState`/`gateDriver`/`gateSource`
   * do that. Both current AND legitimately null when there is no fresher/staler pair to name.
   */
  supersededSource: "cash" | "finance" | null;
  supersededState: string | null;
}

/**
 * Narrates the already-decided `CurrentCashFinanceReading` projection into Now View issues.
 * Pure: no I/O, no independent arbitration. See the module doc for the Case A-I contract.
 */
export function cashFinanceOwnerNarrative(input: CashFinanceOwnerNarrativeInput): CashFinanceNarrativeIssue[] {
  const {
    cashState, finState, cashLastKnown, finStaleLastKnown, finAmendedLastKnown,
    gateState, gateDriver, gateSource, provisional, bothCurrentDisagree, financeProfitDriven,
    supersededSource, supersededState,
  } = input;
  const issues: CashFinanceNarrativeIssue[] = [];
  let profitIssueRaised = false;
  // Tracks whether finState's OWN unsafe reading has already been narrated by some issue above
  // (profit-labeled or otherwise) — never re-labelled as a generic "margin" issue by the trailing
  // fallback once it has been.
  let financeIssueRaised = false;

  const pushFinanceProfitIssue = (state: string, note: string) => {
    const sev = cashSeverity(state);
    issues.push({
      id: "margin", category: IssueCategory.PROFIT_LEAK, businessFunction: [BusinessFunction.PROFITABILITY],
      severity: sev,
      headline: `Financial survival (Finance diagnosis) is ${state}, driven by profit and margin rather than cash.${note}`,
      requiresOwnerAction: sev === "CRITICAL" || sev === "HIGH",
    });
    profitIssueRaised = true;
    financeIssueRaised = true;
  };

  if (cashState && finState) {
    // Both CURRENT. Case F is the ONLY branch where an explicit current-conflict narrative may
    // appear; otherwise narrate the shared decision (gateState/gateDriver/gateSource) directly.
    if (bothCurrentDisagree) {
      if (financeProfitDriven) {
        if (!SAFE_STATES.has(cashState)) {
          const sev = cashSeverity(cashState);
          issues.push({
            id: "cash", category: IssueCategory.CASH_DANGER, businessFunction: [BusinessFunction.CASH_FLOW],
            severity: sev, headline: `Cash survival (cash check) is ${cashState}.`,
            requiresOwnerAction: sev === "CRITICAL" || sev === "HIGH",
          });
        }
        if (!SAFE_STATES.has(finState)) pushFinanceProfitIssue(finState, "");
      } else {
        issues.push({
          id: "cash", category: IssueCategory.CASH_DANGER, businessFunction: [BusinessFunction.CASH_FLOW],
          severity: cashSeverity(cashState) === "CRITICAL" || cashSeverity(finState) === "CRITICAL" ? "CRITICAL" : "HIGH",
          headline: `We have conflicting information about cash health for this business: the latest cash check says ${cashState}, the latest finance diagnosis says ${finState}, and neither can be shown to be more current. Review both before acting on either.`,
          requiresOwnerAction: true,
        });
        financeIssueRaised = true;
      }
    } else if (gateState !== null && !SAFE_STATES.has(gateState)) {
      // Not conflicting: gateState/gateDriver/gateSource are the SOLE authoritative decision of
      // which issue exists, its id/category/severity/requiresOwnerAction. supersededSource/
      // supersededState are read ONLY to build an extra context sentence (which earlier, now-stale
      // reading to name) — they must never select a branch or alter classification.
      const sev = cashSeverity(gateState);
      const supersedeNote = supersededSource
        ? ` An earlier ${supersededSource === "cash" ? "cash check" : "finance diagnosis"} showed ${supersededState}; that reading is now out of date.`
        : "";
      if (gateDriver === "finance_profit") {
        // The enforced danger is profitability/financial survival, from Finance's own current
        // provenance — never relabelled CASH_DANGER because of a legacy supersession field.
        pushFinanceProfitIssue(gateState, supersedeNote);
        // Independently-current second issue: cash's OWN current reading, if it is itself unsafe —
        // decided from cashState alone, never from supersededSource.
        if (!SAFE_STATES.has(cashState)) {
          const cashSev = cashSeverity(cashState);
          issues.push({
            id: "cash", category: IssueCategory.CASH_DANGER, businessFunction: [BusinessFunction.CASH_FLOW],
            severity: cashSev, headline: `Cash survival (cash check) is ${cashState}.`,
            requiresOwnerAction: cashSev === "CRITICAL" || cashSev === "HIGH",
          });
        }
      } else if (gateDriver === "cash") {
        // The enforced danger is cash/financial-survival cash risk, from Cash flow's own current reading.
        issues.push({
          id: "cash", category: IssueCategory.CASH_DANGER, businessFunction: [BusinessFunction.CASH_FLOW],
          severity: sev, headline: `Cash survival (cash check) is ${gateState}.${supersedeNote}`,
          requiresOwnerAction: sev === "CRITICAL" || sev === "HIGH",
        });
        // Independently-current second issue: Finance's OWN current reading, if it is itself unsafe —
        // decided from finState + financeProfitDriven, never from supersededSource. Profit-driven gets
        // its own PROFIT_LEAK issue; a non-profit-driven Finance danger still gets its own CASH_DANGER
        // issue (never silently unrepresented, never mislabelled as a generic "margin" issue).
        if (!SAFE_STATES.has(finState)) {
          if (financeProfitDriven) {
            pushFinanceProfitIssue(finState, "");
          } else {
            const finSev = cashSeverity(finState);
            issues.push({
              id: "finance_survival", category: IssueCategory.CASH_DANGER, businessFunction: [BusinessFunction.CASH_FLOW],
              severity: finSev, headline: `Financial survival (Finance diagnosis) is ${finState}.`,
              requiresOwnerAction: finSev === "CRITICAL" || finSev === "HIGH",
            });
            financeIssueRaised = true;
          }
        }
      } else {
        // gateDriver "unverified" (or absent) while both sources are nonetheless current: name both,
        // never inferring a specific cash/profit danger from a stale source.
        issues.push({
          id: "cash", category: IssueCategory.CASH_DANGER, businessFunction: [BusinessFunction.CASH_FLOW],
          severity: sev, headline: `Cash and financial survival is ${gateState}.${supersedeNote}`,
          requiresOwnerAction: sev === "CRITICAL" || sev === "HIGH",
        });
        financeIssueRaised = true;
      }
    }
  } else if (cashState || finState) {
    // Exactly one CURRENT signal exists at all (the other has no reading whatsoever).
    if (cashState && !SAFE_STATES.has(cashState)) {
      const sev = cashSeverity(cashState);
      issues.push({
        id: "cash", category: IssueCategory.CASH_DANGER, businessFunction: [BusinessFunction.CASH_FLOW],
        severity: sev, headline: `Cash survival (cash check) is ${cashState}; there is no current Finance diagnosis.`,
        requiresOwnerAction: sev === "CRITICAL" || sev === "HIGH",
      });
    } else if (finState && !SAFE_STATES.has(finState)) {
      if (financeProfitDriven) {
        pushFinanceProfitIssue(finState, " There is no cash check yet.");
      } else {
        const sev = cashSeverity(finState);
        issues.push({
          id: "cash", category: IssueCategory.CASH_DANGER, businessFunction: [BusinessFunction.CASH_FLOW],
          severity: sev, headline: `Financial survival (Finance diagnosis) is ${finState}; there is no cash check yet.`,
          requiresOwnerAction: sev === "CRITICAL" || sev === "HIGH",
        });
        financeIssueRaised = true;
      }
    }
  }

  const unverifiedGate = gateState !== null && gateDriver === "unverified";
  if (finAmendedLastKnown && (!SAFE_STATES.has(finAmendedLastKnown) || unverifiedGate)) {
    // Case D/E: Finance amended. Last Finance result is named as last-known only; current state is
    // unverified; growth is not ready. Never assert the amended reading's severity as proven current.
    const unsafeLastKnown = !SAFE_STATES.has(finAmendedLastKnown);
    const sev = cashSeverity(unsafeLastKnown ? finAmendedLastKnown : gateState ?? "AT_RISK");
    issues.push({
      id: "finance_amended",
      category: financeProfitDriven && unsafeLastKnown ? IssueCategory.PROFIT_LEAK : IssueCategory.CASH_DANGER,
      businessFunction: [financeProfitDriven && unsafeLastKnown ? BusinessFunction.PROFITABILITY : BusinessFunction.CASH_FLOW],
      severity: sev,
      headline: unsafeLastKnown
        ? `The last Finance diagnosis showed financial survival ${finAmendedLastKnown}${financeProfitDriven ? " (driven by profit and margin)" : ""}, but its figures have since been amended and not analysed, so the current state is not proven either way — re-run the Finance diagnosis.`
        : `The last Finance diagnosis showed financial survival ${finAmendedLastKnown}, but its figures have since been amended and not analysed, and no current cash check confirms it — OpsIQ cannot treat cash as safe until the Finance diagnosis is re-run.`,
      requiresOwnerAction: sev === "CRITICAL" || sev === "HIGH",
    });
  }
  if (unverifiedGate && !issues.some((i) => i.id === "finance_amended")) {
    // Case B / general stale case: gateState/gateDriver already say the figures are unverified.
    // Last-known figures are named as last known, never current; cash is never shown as safe.
    const sev = cashSeverity(gateState);
    const lastKnown = [
      cashLastKnown ? `the last cash check showed ${cashLastKnown}` : null,
      finStaleLastKnown ? `the last Finance diagnosis showed ${finStaleLastKnown}` : null,
    ].filter(Boolean).join(" and ");
    // Case B: cash IS current and SAFE, only Finance is stale — the exact required wording names
    // overall safety as unconfirmed (never "cash danger", never the stale Finance severity as proven).
    const cashCurrentSafe = !!cashState && SAFE_STATES.has(cashState);
    const caseBHeadline = cashCurrentSafe
      ? `Cash is currently safe, but Finance figures are out of date, so OpsIQ cannot confirm overall financial safety.${finStaleLastKnown ? ` The last Finance diagnosis showed ${finStaleLastKnown}, but that reading is out of date — re-run the Finance diagnosis.` : ""}`
      : null;
    issues.push({
      id: "cash_unverified", category: IssueCategory.CASH_DANGER, businessFunction: [BusinessFunction.CASH_FLOW],
      severity: sev,
      headline: provisional
        ? "Only this period's in-progress cash and Finance figures are available (in progress — not a completed period); OpsIQ cannot treat cash as safe until a completed period is entered and diagnosed."
        : caseBHeadline
          ?? `${lastKnown ? `Last known (out of date): ${lastKnown}. ` : ""}Those figures are out of date, so OpsIQ cannot treat them as current; enter and diagnose current figures.`,
      requiresOwnerAction: sev === "CRITICAL",
    });
  }
  if (provisional && gateState && !SAFE_STATES.has(gateState) && gateDriver !== "unverified") {
    // Case G: provisional unsafe tightens. Narrate as in-progress, low confidence — never completed evidence.
    const sev = cashSeverity(gateState);
    const profit = gateDriver === "finance_profit";
    issues.push({
      id: "cash_in_progress", category: profit ? IssueCategory.PROFIT_LEAK : IssueCategory.CASH_DANGER,
      businessFunction: [profit ? BusinessFunction.PROFITABILITY : BusinessFunction.CASH_FLOW],
      severity: sev,
      headline: `This period's in-progress ${gateSource === "finance" ? "Finance" : "cash"} figures show ${profit ? "financial survival" : "cash survival"} ${gateState} (in progress — not a completed period yet).`,
      requiresOwnerAction: sev === "CRITICAL" || sev === "HIGH",
    });
  }
  if (finState && !SAFE_STATES.has(finState) && !profitIssueRaised && !financeIssueRaised) {
    issues.push({
      id: "margin", category: IssueCategory.PROFIT_LEAK, businessFunction: [BusinessFunction.PROFITABILITY],
      severity: finState === "CRITICAL" || finState === "INSOLVENT_RISK" ? "HIGH" : "MEDIUM",
      headline: "Profit/margin is below a safe level", requiresOwnerAction: false,
    });
  }

  return issues;
}
