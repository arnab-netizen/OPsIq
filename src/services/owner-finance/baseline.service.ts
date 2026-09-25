/**
 * Owner Finance — amendment-aware measured baseline for outcome verification.
 *
 * An action keeps the finding it was planned from (its pre-work baseline — see
 * action-continuity.ts). Finance snapshots can be formally amended (a new version
 * supersedes the old one), so that finding may hold a value the owner has since
 * corrected. The measured baseline must follow the governed amendment chain:
 * - finding's snapshot not superseded  → the finding's own value;
 * - superseded and the current version was diagnosed → the same finding (by code)
 *   from the latest cycle of the current version;
 * - superseded but not yet re-diagnosed, or the finding is no longer raised on the
 *   corrected data → no measured baseline (the owner must report one). A retracted
 *   value is never presented as measured.
 */
import { db } from "@/lib/db";
import { measuredBaselineFor, type MeasuredBaselineSource } from "@/domain/founder-recovery/verification-evidence";
import { resolveCurrentSnapshotId } from "./snapshot.service";

export interface BaselineFindingRow extends MeasuredBaselineSource {
  code: string;
  cycle: { snapshotId: string };
}

/** Prisma `include` for an action's finding that this resolver needs. */
export const baselineFindingInclude = {
  finding: {
    select: { code: true, sourceMetric: true, sourceValue: true, cycle: { select: { snapshotId: true } } },
  },
} as const;

export async function currentFinanceBaselineSource(
  finding: BaselineFindingRow | null | undefined,
  workspaceId: string
): Promise<MeasuredBaselineSource | null> {
  if (!finding) return null;
  const current = await resolveCurrentSnapshotId(finding.cycle.snapshotId);
  if (current === finding.cycle.snapshotId) return finding;
  const cycle = (await db.ownerFinanceCycle.findFirst({
    where: { snapshotId: current, workspaceId },
    orderBy: { sequenceNumber: "desc" },
    include: { findings: { where: { code: finding.code }, select: { sourceMetric: true, sourceValue: true } } },
  })) as { findings: MeasuredBaselineSource[] } | null;
  return cycle?.findings[0] ?? { sourceMetric: finding.sourceMetric, sourceValue: null };
}

export async function financeMeasuredBaseline(
  action: { verificationMetric: string; finding?: BaselineFindingRow | null },
  workspaceId: string
): Promise<number | null> {
  return measuredBaselineFor(action.verificationMetric, await currentFinanceBaselineSource(action.finding, workspaceId));
}
