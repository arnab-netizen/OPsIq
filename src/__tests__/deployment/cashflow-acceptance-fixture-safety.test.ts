/**
 * OPSIQ-LIVE-ACCEPTANCE-CORRECTION Finding 1 -- static, non-DB proof that each
 * Cashflow acceptance fixture (tests/production/fixtures/cashflow-fixtures.ts)
 * lands in the exact cashflowState its Playwright test relies on, computed by
 * the REAL production domain functions (never re-implemented or guessed here).
 *
 * This is the regression guard the correction requires: "Cashflow acceptance
 * must never assert execution succeeds when the fixture's own canonical
 * safety state requires execution to be blocked." If a future threshold edit
 * (src/domain/owner-cashflow/thresholds.ts) or metrics change shifts either
 * fixture's classification, this fails here -- cheaply, at lint/test time,
 * before the live acceptance workflow ever runs against real production.
 */
import { diagnoseCashflowSnapshot } from "@/domain/owner-cashflow/diagnosis";
import { planCashflowActionsFromDiagnosis } from "@/domain/owner-cashflow/actions";
import type { CashflowSnapshotInput } from "@/domain/owner-cashflow/types";
import {
  CASHFLOW_INSOLVENT_FIXTURE,
  CASHFLOW_SAFE_FIXTURE,
  type CashflowFixtureFields,
} from "../../../tests/production/fixtures/cashflow-fixtures";

function toSnapshotInput(fields: CashflowFixtureFields): CashflowSnapshotInput {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() - 1, periodEnd.getDate());
  return {
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    currency: "INR",
    cashInHand: Number(fields.cashInHand),
    bankBalance: Number(fields.bankBalance),
    dailyCollections: Number(fields.dailyCollections),
    receivables: Number(fields.receivables),
    receivablesOverdue: Number(fields.receivablesOverdue),
    payables: Number(fields.payables),
    payablesOverdue: Number(fields.payablesOverdue),
    upcomingEmi: Number(fields.upcomingEmi),
    rentDue: Number(fields.rentDue),
    salaryDue: Number(fields.salaryDue),
    vendorDue: Number(fields.vendorDue),
    taxDue: Number(fields.taxDue),
    ownerWithdrawal: Number(fields.ownerWithdrawal),
    // industryTemplate deliberately omitted: the real owner UI form
    // (src/app/(authenticated)/owner/cashflow/page.tsx) never sends this
    // field, so GENERIC_CASHFLOW_THRESHOLDS always applies in production --
    // matching that exactly is the point of this test.
  };
}

describe("Cashflow acceptance fixtures -- cashflowState proven against the real domain functions", () => {
  it("CASHFLOW_INSOLVENT_FIXTURE computes cashflowState=INSOLVENT_RISK (the safety-gate test's fixture MUST be blocked)", () => {
    const diagnosis = diagnoseCashflowSnapshot(toSnapshotInput(CASHFLOW_INSOLVENT_FIXTURE));
    expect(diagnosis.metrics.cashflowState).toBe("INSOLVENT_RISK");
  });

  it("CASHFLOW_SAFE_FIXTURE computes cashflowState=AT_RISK, not CRITICAL/INSOLVENT_RISK (the closed-loop test's fixture MUST NOT be blocked)", () => {
    const diagnosis = diagnoseCashflowSnapshot(toSnapshotInput(CASHFLOW_SAFE_FIXTURE));
    expect(diagnosis.metrics.cashflowState).toBe("AT_RISK");
    expect(diagnosis.metrics.cashflowState).not.toBe("CRITICAL");
    expect(diagnosis.metrics.cashflowState).not.toBe("INSOLVENT_RISK");
  });

  it("CASHFLOW_SAFE_FIXTURE still produces at least one real, actionable Cashflow action", () => {
    const diagnosis = diagnoseCashflowSnapshot(toSnapshotInput(CASHFLOW_SAFE_FIXTURE));
    const plan = planCashflowActionsFromDiagnosis(diagnosis);
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.actions.some((a) => a.findingCode === "CF_HIGH_OVERDUE_RECEIVABLES")).toBe(true);
  });

  it("CASHFLOW_SAFE_FIXTURE's classification is not an accident of a single signal being exactly at the threshold (clear margin, not borderline)", () => {
    const diagnosis = diagnoseCashflowSnapshot(toSnapshotInput(CASHFLOW_SAFE_FIXTURE));
    // cashRunwayDays must be null (not burning) -- proves runway signals play
    // no part in this fixture's classification, isolating overdue-receivables
    // as the one deliberate trigger.
    expect(diagnosis.metrics.cashRunwayDays).toBeNull();
    expect(diagnosis.metrics.urgentPaymentRiskPct).toBeLessThan(60);
    expect(diagnosis.metrics.payablesPressurePct).toBeLessThan(75);
    expect(diagnosis.metrics.overdueReceivablesPct).toBeGreaterThan(30);
  });
});
