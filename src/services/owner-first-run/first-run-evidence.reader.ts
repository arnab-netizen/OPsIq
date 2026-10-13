/**
 * The ONLY place first-run reads Finance evidence tables, through the repository's canonical definitions:
 *   - the snapshot a read is about is the diagnosable head, chosen by the same rule first-read sufficiency uses
 *     (selectFirstReadHead): a sufficient current-effective snapshot, else a sufficient in-progress one, else whichever
 *     exists (financial-snapshot-selection.ts) — an amended snapshot is never the head, so a read can only ever be about
 *     the CURRENT figures of ONE business, and "enough evidence" always refers to the snapshot the read is about;
 *   - the read is the latest diagnosis run on exactly that snapshot (by snapshotId — "were these figures already
 *     diagnosed?"), never a choice between evidence periods.
 * When figures were amended and not yet re-diagnosed there is no read on the head: the owner is asked to update it.
 * A read is also out of date once the bank balance it depends on changed after it gathered its evidence.
 * Every query is workspace + business scoped.
 */
import { db as sharedDb } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { lockUnsupersededFinancialSnapshotShared } from "@/services/owner-finance/snapshot.service";
import { currentEffectiveFinancialSnapshotQuery, inProgressFinancialSnapshotQuery } from "@/services/owner-finance/financial-snapshot-selection";
import { selectFirstReadHead } from "@/domain/owner-finance/first-read-sufficiency";
import { evidencePeriodState } from "@/services/owner-spine/current-diagnosis-cycle";
import { cashPositionChangedSince } from "@/services/owner-finance/liquidity.service";
import { lockCashPositionShared } from "@/services/owner-cashflow/effective-cashflow.service";
import type { ReadStaleReason } from "@/domain/owner-first-run/read-staleness";

export interface FirstRunEvidence {
  /** The snapshot a diagnosis should run on / a read is about (null when no snapshot exists). */
  headSnapshotId: string | null;
  /** The head snapshot's period (the period the read covers), null when there is no head. */
  headPeriod: { start: Date; end: Date } | null;
  /** The head snapshot's figures and currency (columns by row key), for screens that must show what is recorded NOW. */
  head: HeadSnapshotRow | null;
  /** The latest diagnosis run on the head snapshot (null when the head has not been diagnosed). `generatedAt` is when its evidence was gathered. */
  runOnHead: { id: string; generatedAt: Date } | null;
  /** The business has been diagnosed at least once (on any version of its figures). */
  hasAnyRun: boolean;
  /**
   * Why the read is out of date, or null while it is current: the head has no read (figures were corrected after the
   * last one) or — only when `cashStaleness` was requested — the bank balance the read depends on changed since the
   * read gathered its evidence.
   */
  staleReason: ReadStaleReason | null;
}

const HEAD_SELECT = {
  id: true, periodStart: true, periodEnd: true, currency: true,
  revenue: true, costOfGoods: true, fixedCosts: true, variableCosts: true, rent: true, payroll: true, utilities: true, cashOnHand: true,
  marketingSpend: true, debtPayments: true, totalDebtOutstanding: true,
} as const;

/** The columns the head selection above reads (figures are null when not recorded). */
export type HeadSnapshotRow = {
  id: string; periodStart: Date; periodEnd: Date; currency: string;
  revenue: number | null; costOfGoods: number | null; fixedCosts: number | null; variableCosts: number | null; rent: number | null;
  payroll: number | null; utilities: number | null; cashOnHand: number | null; marketingSpend: number | null;
  debtPayments: number | null; totalDebtOutstanding: number | null;
};

/**
 * `client` lets a caller evaluate the head inside its own transaction (compare-at-write); it defaults to the shared client.
 * `cashStaleness` additionally decides whether a balance change made the read stale (an extra read; callers that only need
 * "which snapshot / is there a run" leave it off).
 */
export async function firstRunEvidence(
  workspaceId: string, businessId: string, now: Date = new Date(), client: Prisma.TransactionClient = sharedDb as unknown as Prisma.TransactionClient,
  opts: { cashStaleness?: boolean } = {},
): Promise<FirstRunEvidence> {
  const db = client;
  const scope = { workspaceId, businessId };
  const [effective, inProgress] = await Promise.all([
    db.ownerFinancialSnapshot.findFirst(currentEffectiveFinancialSnapshotQuery(scope, HEAD_SELECT, now)),
    db.ownerFinancialSnapshot.findFirst(inProgressFinancialSnapshotQuery(scope, HEAD_SELECT, now)),
  ]);
  // The head is chosen by the SAME rule as first-read sufficiency (a sufficient completed snapshot, else a sufficient
  // in-progress one, else whichever exists), so "enough evidence" and "what the read is about" cannot disagree.
  const provisional = inProgress && evidencePeriodState(inProgress, now) === "provisional" ? inProgress : null;
  const { head } = selectFirstReadHead({ completed: effective, provisional });
  const headSnapshotId = (head?.id as string | undefined) ?? null;

  const runOnHead = headSnapshotId
    ? await db.ownerFinanceCycle.findFirst({
        where: { workspaceId, businessId, snapshotId: headSnapshotId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, generatedAt: true },
      })
    : null;
  const hasAnyRun = runOnHead
    ? true
    : Boolean(await db.ownerFinanceCycle.findFirst({ where: { workspaceId, businessId }, select: { id: true } }));

  const headPeriod = head ? { start: new Date(head.periodStart as Date), end: new Date(head.periodEnd as Date) } : null;
  let staleReason: ReadStaleReason | null = hasAnyRun && !runOnHead ? "FIGURES_CHANGED" : null;
  if (!staleReason && runOnHead && headPeriod && opts.cashStaleness) {
    if (await cashPositionChangedSince(workspaceId, businessId, headPeriod.end, runOnHead.generatedAt as Date, client)) staleReason = "CASH_POSITION_CHANGED";
  }
  return {
    headSnapshotId,
    headPeriod,
    head: (head as HeadSnapshotRow | null) ?? null,
    runOnHead: runOnHead ? { id: runOnHead.id as string, generatedAt: runOnHead.generatedAt as Date } : null,
    hasAnyRun,
    staleReason,
  };
}

/** Whether the diagnosis with this id ran on a snapshot that has since been amended (workspace + business scoped). */
export async function cycleSnapshotSuperseded(workspaceId: string, businessId: string, cycleId: string): Promise<boolean> {
  const row = await sharedDb.ownerFinanceCycle.findFirst({
    where: { id: cycleId, workspaceId, businessId },
    select: { snapshot: { select: { supersededById: true } } },
  });
  return row?.snapshot?.supersededById != null;
}

/**
 * Compare-at-write for an owner decision on a read: INSIDE the caller's transaction, share-lock the snapshot row the read
 * was built on (an amendment takes the same row FOR UPDATE, so exactly one of the two wins) and report whether that snapshot
 * is still un-superseded, still the diagnosable head, the read is still the latest diagnosis on it, AND the bank balance it
 * depends on has not changed since it was made. False means the read is stale and the decision must not be recorded.
 */
export async function isReadCurrentForWrite(
  tx: Prisma.TransactionClient, workspaceId: string, businessId: string, snapshotId: string, cycleId: string,
): Promise<boolean> {
  if (!(await lockUnsupersededFinancialSnapshotShared(tx, workspaceId, businessId, snapshotId))) return false;
  // The bank balance the read rests on: Cashflow creates/edits take this lock exclusively, so a balance change either
  // committed before this point (and is seen below) or waits until this decision commits.
  await lockCashPositionShared(tx, businessId);
  const head = await firstRunEvidence(workspaceId, businessId, new Date(), tx, { cashStaleness: true });
  return head.headSnapshotId === snapshotId && head.runOnHead?.id === cycleId && head.staleReason === null;
}
