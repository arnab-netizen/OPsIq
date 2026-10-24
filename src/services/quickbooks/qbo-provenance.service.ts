/**
 * QuickBooks Online V1 — provenance reads for owner-facing surfaces.
 *
 * "QuickBooks-sourced" is a fact derived from the data, never a stored flag: a Finance snapshot version is QuickBooks-sourced
 * iff a provenance row points at that exact version. When the owner amends it, the amendment is a NEW version with no
 * provenance, so it reads as owner-entered from then on (and QuickBooks stops replacing it — see qbo-materialization).
 */
import { db } from "@/lib/db";

export async function qboSourcedFinancialSnapshotIds(
  workspaceId: string,
  businessId: string,
  snapshotIds: readonly string[],
  client: Pick<typeof db, "qboCanonicalProvenance"> = db,
): Promise<Set<string>> {
  if (snapshotIds.length === 0) return new Set();
  const rows = await client.qboCanonicalProvenance.findMany({
    where: { workspaceId, businessId, financialSnapshotId: { in: [...snapshotIds] } },
    select: { financialSnapshotId: true },
  });
  return new Set(rows.map((r: { financialSnapshotId: string | null }) => r.financialSnapshotId).filter((v: string | null): v is string => v !== null));
}
