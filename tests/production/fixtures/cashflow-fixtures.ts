/**
 * Cashflow acceptance fixtures -- the numeric snapshot inputs are the single
 * source of truth shared by:
 *   - tests/production/24-cashflow-acceptance.spec.ts (live browser proof)
 *   - src/__tests__/deployment/cashflow-acceptance-fixture-safety.test.ts
 *     (static proof, against the REAL src/domain/owner-cashflow/metrics.ts
 *     functions, that each fixture lands in the cashflowState its acceptance
 *     test relies on)
 *
 * Exists to close OPSIQ-LIVE-ACCEPTANCE-CORRECTION Finding 1: the old spec
 * asserted a material action transition (Start) would SUCCEED on a fixture
 * whose own deliberately-stressed inputs computed cashflowState=INSOLVENT_RISK
 * -- a state owner-action-gate.service.ts's cash-safety gate is REQUIRED to
 * block for a FINANCE_SENSITIVE domain (see src/__tests__/owner-mode/
 * owner-action-gate.test.ts:109). That was a test-contract defect, not a
 * product defect: cashflow needs TWO fixtures, not one -- one proving the
 * safety gate blocks correctly, one proving the closed loop completes when
 * the fixture's own state does not require a block. Keeping both fixtures'
 * numbers in one file, checked against the real domain functions by the
 * static test above, is what makes "determine fixture values from the actual
 * diagnosis thresholds, don't guess" durable against future threshold edits.
 */

export interface CashflowFixtureFields {
  cashInHand: string;
  bankBalance: string;
  dailyCollections: string;
  receivables: string;
  receivablesOverdue: string;
  payables: string;
  payablesOverdue: string;
  upcomingEmi: string;
  rentDue: string;
  salaryDue: string;
  vendorDue: string;
  taxDue: string;
  ownerWithdrawal: string;
}

/**
 * Deliberately stressed: thin cash buffer against heavy near-term obligations
 * (rent/salary/vendor/tax/EMI far exceed total cash), critical payables
 * pressure, high overdue receivables. Against GENERIC_CASHFLOW_THRESHOLDS
 * (the owner UI never sends industryTemplate, so no per-industry override
 * ever applies -- see thresholds.ts/resolveCashflowThresholds), this computes
 * cashRunwayDays < insolventCashRunwayDays (5), which alone forces
 * cashflowState = "INSOLVENT_RISK" (metrics.ts's cashflowState()). Proven
 * against the real function in cashflow-acceptance-fixture-safety.test.ts.
 *
 * A cashflowState this severe means the cash-safety gate MUST refuse any
 * FINANCE_SENSITIVE material action transition (in_progress/completed) for
 * this business until the crisis is resolved -- this fixture exists to prove
 * that refusal, not to exercise the action lifecycle.
 */
export const CASHFLOW_INSOLVENT_FIXTURE: CashflowFixtureFields = {
  cashInHand: "5000",
  bankBalance: "5000",
  dailyCollections: "200",
  receivables: "20000",
  receivablesOverdue: "15000",
  payables: "12000",
  payablesOverdue: "12000",
  upcomingEmi: "5000",
  rentDue: "4000",
  salaryDue: "5000",
  vendorDue: "3000",
  taxDue: "2000",
  ownerWithdrawal: "4000",
};

/**
 * Deliberately UNSTRESSED on runway/urgent-payment/payables-pressure (cash
 * comfortably covers near-term obligations: dailyCollections alone exceeds
 * dailyObligations, so cashRunwayDays is never computed at all -- "not
 * burning" per metrics.ts's cashRunwayDays()), but still produces one real,
 * actionable finding: overdueReceivablesPct = 4000/10000 = 40%, which is
 * above GENERIC_CASHFLOW_THRESHOLDS.highOverdueReceivablesPct (30%) --
 * CF_HIGH_OVERDUE_RECEIVABLES (risk-rules.ts) fires with a mapped
 * recommendation template (CFREC_COLLECT_RECEIVABLES, recommendations.ts),
 * which planCashflowActionsFromDiagnosis (actions.ts) turns into a real
 * OwnerAction. No other risk signal crosses its threshold, so
 * cashflowState() returns exactly "AT_RISK" (severity 2) -- below
 * evaluateCashSafetyGate's UNSAFE_FOR_SPEND threshold (3, i.e.
 * CRITICAL/INSOLVENT_RISK), so FINANCE_SENSITIVE material transitions
 * (in_progress/completed) are NOT blocked. Proven against the real function
 * in cashflow-acceptance-fixture-safety.test.ts.
 */
export const CASHFLOW_SAFE_FIXTURE: CashflowFixtureFields = {
  cashInHand: "20000",
  bankBalance: "10000",
  dailyCollections: "300",
  receivables: "10000",
  receivablesOverdue: "4000",
  payables: "3000",
  payablesOverdue: "500",
  upcomingEmi: "1000",
  rentDue: "1000",
  salaryDue: "1000",
  vendorDue: "500",
  taxDue: "500",
  ownerWithdrawal: "1000",
};

export interface FixturePeriod {
  periodStart: string; // ISO date (YYYY-MM-DD)
  periodEnd: string; // ISO date (YYYY-MM-DD)
}

/**
 * Reporting period for CASHFLOW_INSOLVENT_FIXTURE: a ~30-day period ending
 * "today" (`reference`). Shared by the live Playwright spec (24-04) and
 * cashflow-acceptance-fixture-safety.test.ts so both always diagnose the
 * exact same period length -- see safeFixturePeriod()'s comment for why the
 * period LENGTH, not just its end date, changes this fixture's classification.
 */
export function insolventFixturePeriod(reference: Date): FixturePeriod {
  const periodEnd = reference;
  const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() - 1, periodEnd.getDate());
  return {
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
  };
}

/**
 * Reporting period for CASHFLOW_SAFE_FIXTURE: periodEnd must be strictly
 * LATER than insolventFixturePeriod(reference)'s periodEnd (`reference`
 * itself) so dashboard.service.ts's "latest snapshot by periodEnd" and
 * action.service.ts's re-diagnosis-on-complete both deterministically pick
 * THIS fixture's snapshot, never a same-day tie against the insolvent one.
 *
 * The period must ALSO stay ~30 days long, matching the insolvent fixture --
 * workflow run 33089xxxxx (24-08) proved that shortening it to "reference to
 * reference+1 day" (a 2-day period) while keeping the same nearTermObligations
 * total pushes dailyObligations from ~161/day to 2500/day, dropping
 * cashRunwayDays under criticalCashRunwayDays (14) and reclassifying this
 * fixture as CRITICAL -- the exact severity this fixture exists to be BELOW.
 * A short period is not a safe way to win the periodEnd tiebreak; a later
 * END date on an equally long period is.
 */
export function safeFixturePeriod(reference: Date): FixturePeriod {
  const periodEnd = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1);
  const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() - 1, periodEnd.getDate());
  return {
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
  };
}
