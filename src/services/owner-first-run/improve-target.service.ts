/**
 * "Improve this recommendation" — the SERVER decides where the owner goes (add, edit the existing Finance entry, edit the
 * existing Cashflow entry, or "saved but not used by this read"), from persisted evidence only. The browser sends a
 * category; it never states whether the evidence exists, which entry it lives on, or whether to add or edit.
 * The decision itself is the pure `decideImproveTarget` (domain); this file only gathers its facts, workspace and
 * business scoped, through the same readers the first read uses (head snapshot, the one Cashflow selector).
 */
import { db } from "@/lib/db";
import { ValidationError, NotFoundError } from "@/infra/errors";
import { OWNER_INPUT_CATEGORIES } from "@/domain/owner-mode/input-catalog";
import {
  decideBankImproveTarget,
  decideImproveTarget,
  type ImproveCashflowRow,
  type ImproveFacts,
  type ImproveTarget,
} from "@/domain/owner-first-run/improve-target";
import { pickEffectiveCashflowRow, selectUsableBankBalance, type CashflowSelectionRow } from "@/domain/owner-finance/liquidity";
import { firstRunEvidence } from "@/services/owner-first-run/first-run-evidence.reader";
import { loadEffectiveCashflowCandidates, type CashflowRow } from "@/services/owner-cashflow/effective-cashflow.service";

const iso = (d: Date | string): string => (d instanceof Date ? d : new Date(d)).toISOString();
const finiteOrNull = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toFactsRow(r: CashflowRow): ImproveCashflowRow {
  return {
    id: r.id,
    updatedAt: iso(r.updatedAt),
    periodStart: iso(r.periodStart),
    periodEnd: iso(r.periodEnd),
    currency: r.currency,
    bankBalance: finiteOrNull(r.bankBalance),
    cashInHand: finiteOrNull(r.cashInHand),
  };
}

async function gatherFacts(workspaceId: string, businessId: string, category: string, opts: { withIgnored: boolean }): Promise<ImproveFacts> {
  const business = await db.ownerBusiness.findFirst({ where: { id: businessId, workspaceId }, select: { id: true } });
  if (!business) throw new NotFoundError("OwnerBusiness", businessId);

  const evidence = await firstRunEvidence(workspaceId, businessId);
  // The read's own snapshot, from the same selection the read uses (never a second lookup of "the latest").
  const head = evidence.head;
  if (!evidence.hasAnyRun || !head || !evidence.headPeriod) {
    throw new ValidationError("There is no first read to improve yet.", { fieldErrors: [] });
  }

  const readEnd = evidence.headPeriod.end;
  const candidates = await loadEffectiveCashflowCandidates(workspaceId, businessId, readEnd);
  const effective = pickEffectiveCashflowRow(candidates as CashflowSelectionRow[], readEnd) as CashflowRow | null;
  const usable = selectUsableBankBalance({ financePeriodEnd: readEnd, cashflow: effective });

  // Entries the owner saved since asking, with a recorded balance, that the read does not use (a later period, or too old):
  // they are what makes "saved, but not used by this read" a statement of fact rather than a guess.
  let ignoredRecent: ImproveFacts["cashflow"]["ignoredRecent"] = [];
  if (opts.withIgnored) {
    const asked = await db.ownerFirstResultInteraction.findFirst({
      where: { workspaceId, businessId, kind: "IMPROVEMENT_REQUESTED", questionCategory: category },
      select: { createdAt: true },
    });
    if (asked) {
      const used = new Set(candidates.map((c) => c.id));
      const recent = await db.ownerCashflowSnapshot.findMany({
        where: { workspaceId, businessId, updatedAt: { gte: asked.createdAt } },
        orderBy: [{ periodEnd: "desc" }, { id: "desc" }],
        take: 20,
        select: { id: true, periodStart: true, periodEnd: true, bankBalance: true },
      });
      ignoredRecent = recent
        .filter((r: { id: string; bankBalance: number | null }) => !used.has(r.id) && finiteOrNull(r.bankBalance) !== null)
        .map((r: { periodStart: Date; periodEnd: Date }) => ({ periodStart: iso(r.periodStart), periodEnd: iso(r.periodEnd) }));
    }
  }

  return {
    category,
    read: { snapshotId: head.id, periodStart: iso(head.periodStart), periodEnd: iso(head.periodEnd), currency: head.currency },
    finance: head as unknown as Record<string, number | null>,
    cashflow: { effective: effective ? toFactsRow(effective) : null, usableBankBalance: usable ?? null, ignoredRecent },
  };
}

/** The server-resolved destination for one "Improve" question. Throws for an unknown category or when there is no read yet. */
export async function resolveImproveTarget(workspaceId: string, businessId: string, category: string): Promise<ImproveTarget> {
  if (!(OWNER_INPUT_CATEGORIES as readonly string[]).includes(category)) {
    throw new ValidationError("That isn't a question OpsIQ asks.", { fieldErrors: [{ path: "category", message: "Unknown category" }] });
  }
  return decideImproveTarget(await gatherFacts(workspaceId, businessId, category, { withIgnored: true }));
}

/** Where the "add your bank balance" link on a read should go: the existing entry for the read's period, or a new one dated to it. */
export async function resolveBankBalanceTarget(workspaceId: string, businessId: string): Promise<ImproveTarget> {
  return decideBankImproveTarget(await gatherFacts(workspaceId, businessId, "cash_debt", { withIgnored: false }));
}
