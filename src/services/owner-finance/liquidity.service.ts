/**
 * Owner Finance — loads the usable bank balance for a Finance period (the I/O half of the liquidity
 * contract in `@/domain/owner-finance/liquidity`). Every Finance-based consumer that needs total liquid
 * funds enriches its engine input through this one function.
 */
import { db } from "@/lib/db";
import { selectUsableBankBalance } from "@/domain/owner-finance/liquidity";

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
