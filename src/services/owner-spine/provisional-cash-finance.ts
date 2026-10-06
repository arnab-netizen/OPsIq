/**
 * The ONE read of a business's PROVISIONAL (in-progress current period) cash and Finance readings, for the
 * shared cash/finance reading (current-cash-finance-reading.ts). Provisional evidence is never completed
 * truth (current-diagnosis-cycle.ts): it is read separately from the current cycle, may only tighten the
 * enforced state, and a provisional Finance reading on since-amended figures counts only when unsafe.
 *
 * Every surface that shows or enforces the cash/finance reading loads it here (Owner Home, Now View, the
 * owner action gate, the dashboard route and the Consulting cash gate), so they agree.
 */
import { projectCashflowCycleRow } from "@/domain/owner-cashflow/cycle-projection";
import { financeSurvivalDriver } from "@/domain/owner-spine/owner-decision";
import { evidencePeriodState, PROVISIONAL_DIAGNOSIS_CYCLE_ORDER, provisionalEvidenceWhere } from "@/services/owner-spine/current-diagnosis-cycle";
import type { ProvisionalCashFinanceReads } from "@/services/owner-spine/current-cash-finance-reading";

const SAFE: ReadonlySet<string> = new Set(["SAFE", "WATCH"]);

export interface ProvisionalCashFinanceDb {
  ownerCashflowCycle: {
    findFirst(args: { where: Record<string, unknown>; orderBy: typeof PROVISIONAL_DIAGNOSIS_CYCLE_ORDER; select: Record<string, unknown> }): Promise<unknown>;
  };
  ownerFinanceCycle: {
    findFirst(args: { where: Record<string, unknown>; orderBy: typeof PROVISIONAL_DIAGNOSIS_CYCLE_ORDER; select: Record<string, unknown> }): Promise<unknown>;
  };
}

type CashRow = { cashflowState?: string; dataConfidenceScore?: number | null; generatedAt?: Date | null; snapshot?: ({ periodStart?: Date; periodEnd?: Date } & Record<string, unknown>) | null } | null;
type FinRow = {
  survivalState?: string;
  dataConfidenceScore?: number | null;
  snapshot?: { periodStart?: Date; periodEnd?: Date; supersededById?: string | null } | null;
  findings?: Array<{ code: string; severity?: string }>;
} | null;

function unitScore(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : null;
}

/** The in-progress period's latest cash and Finance readings of one business (null when there are none). */
export async function loadProvisionalCashFinance(
  db: ProvisionalCashFinanceDb,
  scope: { workspaceId: string; businessId: string },
  now: Date
): Promise<ProvisionalCashFinanceReads | null> {
  const where = { workspaceId: scope.workspaceId, businessId: scope.businessId, ...provisionalEvidenceWhere(now) };
  const [cash, fin] = (await Promise.all([
    db.ownerCashflowCycle.findFirst({
      where,
      orderBy: PROVISIONAL_DIAGNOSIS_CYCLE_ORDER,
      select: { cashflowState: true, dataConfidenceScore: true, generatedAt: true, snapshot: true },
    }),
    db.ownerFinanceCycle.findFirst({
      where,
      orderBy: PROVISIONAL_DIAGNOSIS_CYCLE_ORDER,
      select: {
        survivalState: true, dataConfidenceScore: true,
        snapshot: { select: { periodStart: true, periodEnd: true, supersededById: true } },
        findings: { select: { code: true, severity: true } },
      },
    }),
  ])) as [CashRow, FinRow];
  // Only a reading whose own period is in progress is provisional (the query's filter, re-checked on the row).
  const inProgress = (snap: { periodStart?: Date; periodEnd?: Date } | null | undefined) => evidencePeriodState(snap, now) === "provisional";
  // Read-time projection: an in-progress cash reading whose snapshot cannot establish total cash never tightens (or
  // relaxes) the gate by a persisted partial-total conclusion; it can only carry what the current engine supports.
  const cashUsable = cash && inProgress(cash.snapshot) ? projectCashflowCycleRow(cash) : null;
  // An amended in-progress Finance reading counts only while it is unsafe (it can still only tighten).
  const finUsable = fin && inProgress(fin.snapshot) && !(fin.snapshot?.supersededById && SAFE.has(String(fin.survivalState)));
  if (!cashUsable && !finUsable) return null;
  return {
    cash: cashUsable ? { state: cashUsable.cashflowState ?? null, snapshot: cashUsable.snapshot ?? null, confidence: unitScore(cashUsable.dataConfidenceScore) } : null,
    finance: finUsable
      ? { state: fin!.survivalState ?? null, snapshot: fin!.snapshot ?? null, driver: financeSurvivalDriver(fin!.findings), confidence: unitScore(fin!.dataConfidenceScore) }
      : null,
  };
}
