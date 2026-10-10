/**
 * The ONLY place first-run reads Finance evidence tables, through the repository's canonical definitions:
 *   - the snapshot a read is about is the diagnosable head: the current-effective snapshot, else the in-progress one
 *     (financial-snapshot-selection.ts) — an amended snapshot is never the head, so a read can only ever be about the
 *     CURRENT figures of ONE business;
 *   - the read is the latest diagnosis run on exactly that snapshot (by snapshotId — "were these figures already
 *     diagnosed?"), never a choice between evidence periods.
 * When figures were amended and not yet re-diagnosed there is no read on the head: the owner is asked to update it.
 * Every query is workspace + business scoped.
 */
import { db } from "@/lib/db";
import { currentEffectiveFinancialSnapshotQuery, inProgressFinancialSnapshotQuery } from "@/services/owner-finance/financial-snapshot-selection";

export interface FirstRunEvidence {
  /** The snapshot a diagnosis should run on / a read is about (null when no snapshot exists). */
  headSnapshotId: string | null;
  /** The latest diagnosis run on the head snapshot (null when the head has not been diagnosed). */
  runOnHead: { id: string } | null;
  /** The business has been diagnosed at least once (on any version of its figures). */
  hasAnyRun: boolean;
}

export async function firstRunEvidence(workspaceId: string, businessId: string, now: Date = new Date()): Promise<FirstRunEvidence> {
  const scope = { workspaceId, businessId };
  const effective = await db.ownerFinancialSnapshot.findFirst(currentEffectiveFinancialSnapshotQuery(scope, { id: true }, now));
  const head =
    effective ?? (await db.ownerFinancialSnapshot.findFirst(inProgressFinancialSnapshotQuery(scope, { id: true }, now)));
  const headSnapshotId = (head?.id as string | undefined) ?? null;

  const runOnHead = headSnapshotId
    ? await db.ownerFinanceCycle.findFirst({
        where: { workspaceId, businessId, snapshotId: headSnapshotId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      })
    : null;
  const hasAnyRun = runOnHead
    ? true
    : Boolean(await db.ownerFinanceCycle.findFirst({ where: { workspaceId, businessId }, select: { id: true } }));
  return { headSnapshotId, runOnHead: runOnHead ? { id: runOnHead.id as string } : null, hasAnyRun };
}

/** Whether the diagnosis with this id ran on a snapshot that has since been amended (workspace + business scoped). */
export async function cycleSnapshotSuperseded(workspaceId: string, businessId: string, cycleId: string): Promise<boolean> {
  const row = await db.ownerFinanceCycle.findFirst({
    where: { id: cycleId, workspaceId, businessId },
    select: { snapshot: { select: { supersededById: true } } },
  });
  return row?.snapshot?.supersededById != null;
}
