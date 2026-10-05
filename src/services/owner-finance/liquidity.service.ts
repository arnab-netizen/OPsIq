/**
 * Owner Finance — the I/O half of the liquidity contract (`@/domain/owner-finance/liquidity`).
 * Every Finance-based consumer builds its engine input here, so cash semantics and the usable bank
 * balance are resolved ONCE and identically for the diagnosis, the Budget forecast and the budget plan.
 */
import { db } from "@/lib/db";
import {
  resolveCashSemanticsFromLineage,
  selectUsableBankBalance,
  type CashLineageNode,
  type CashSemantics,
} from "@/domain/owner-finance/liquidity";
import type { FinancialSnapshotInput } from "@/domain/owner-finance/types";
import { listFinancialSnapshotVersions, rowToFinanceInput } from "./snapshot.service";

/**
 * Latest Cashflow snapshot ending at or before the Finance period end, accepted only through
 * `selectUsableBankBalance` (fresh, not future, finite). `undefined` means "unknown" — never 0.
 */
export async function loadUsableBankBalance(
  workspaceId: string,
  businessId: string,
  financePeriodEnd: Date | string
): Promise<number | undefined> {
  const end = financePeriodEnd instanceof Date ? financePeriodEnd : new Date(financePeriodEnd);
  if (Number.isNaN(end.getTime())) return undefined;
  const cashflowRow = await db.ownerCashflowSnapshot.findFirst({
    where: { workspaceId, businessId, periodEnd: { lte: end } },
    orderBy: { periodEnd: "desc" },
    select: { bankBalance: true, periodEnd: true },
  });
  return selectUsableBankBalance({ financePeriodEnd: end, cashflow: cashflowRow });
}

const MAX_LINEAGE_DEPTH = 200;

interface LineageRow extends CashLineageNode {
  id: string;
  version: number;
  supersededById: string | null;
}

/**
 * Cash semantics of a Finance snapshot row, resolved through its amendment chain (root → target).
 * Amendments copy the period and create a NEW row, so every version of one snapshot shares
 * (workspace, business, period); that scoped read is the only lineage data touched, so no other
 * workspace or business can influence the result. A dangling predecessor (version > 1 with no row
 * pointing at it), a branch (two predecessors) or a cycle fails closed to LEGACY_AMBIGUOUS.
 */
export async function resolveFinancialSnapshotCashSemantics(
  row: { id: string; workspaceId: string; businessId: string; periodStart: Date | string; periodEnd: Date | string },
  workspaceId: string
): Promise<CashSemantics> {
  if (row.workspaceId !== workspaceId) return "LEGACY_AMBIGUOUS";
  const versions = (await listFinancialSnapshotVersions(
    workspaceId, row.businessId, new Date(row.periodStart), new Date(row.periodEnd)
  )) as LineageRow[];

  const byId = new Map(versions.map((v) => [v.id, v]));
  const target = byId.get(row.id);
  if (!target) return "LEGACY_AMBIGUOUS";

  const chain: LineageRow[] = [target];
  const seen = new Set<string>([target.id]);
  for (let depth = 0; depth < MAX_LINEAGE_DEPTH; depth++) {
    const head = chain[0];
    const predecessors = versions.filter((v) => v.supersededById === head.id);
    if (predecessors.length === 0) {
      // A root has version 1; a later version with no predecessor is a dangling lineage.
      return head.version === 1 ? resolveCashSemanticsFromLineage(chain) : "LEGACY_AMBIGUOUS";
    }
    if (predecessors.length > 1) return "LEGACY_AMBIGUOUS"; // branched chain
    const p = predecessors[0];
    if (seen.has(p.id)) return "LEGACY_AMBIGUOUS"; // cycle
    seen.add(p.id);
    chain.unshift(p);
  }
  return "LEGACY_AMBIGUOUS"; // implausibly deep chain
}

/**
 * The Finance engine input for a persisted snapshot row: lineage-resolved cash semantics, enriched
 * ONCE with the usable bank balance (unknown stays unknown). The single entry point for diagnosis and Budget.
 */
export async function loadFinanceEngineInput(
  row: { id: string; workspaceId: string; businessId: string; periodStart: Date | string; periodEnd: Date | string } & Record<string, unknown>,
  workspaceId: string
): Promise<FinancialSnapshotInput> {
  const semantics = await resolveFinancialSnapshotCashSemantics(row, workspaceId);
  const input = rowToFinanceInput(row, semantics);
  const bank = await loadUsableBankBalance(workspaceId, row.businessId, row.periodEnd);
  if (bank !== undefined) input.bankBalance = bank;
  return input;
}
