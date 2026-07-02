/**
 * Intake materialization (P0-B runtime-readiness: closes blocker B2's CSV dead-end).
 *
 * A confirmed CSV intake previously only flipped `ownerConfirmed=true`; its numeric records never reached the snapshot
 * read models the owner whole-business plan / diagnosis actually consume, so "OpsIQ is ready to analyze" was false.
 * This module converts a confirmed intake's normalized records into the domain's real snapshot rows via the EXISTING
 * persistence services (workspace/business ownership enforced inside those services). It NEVER fabricates a snapshot:
 * only records with all required fields materialize; incomplete records are skipped, so confirming without the mapped
 * required fields cannot fake readiness. Period duplicates are treated idempotently (skip, not overwrite).
 *
 * Scope: `finance` → OwnerFinancialSnapshot (feeds the plan's `finance_cash` + `margin_pricing` critical domains).
 * Other intake domains (sales/operations/marketing/sop) are recognised and reported as not-yet-materialized (0) so
 * later slices can extend this dispatch without a rewrite.
 */
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { ConflictError } from "@/infra/errors";
import type { FinancialSnapshotCreateInput } from "@/domain/owner-finance/validation";

type NormalizedRecord = Record<string, number | string | null>;

export interface MaterializeResult {
  domain: string;
  materialized: number;
  skipped: number;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Materialize a confirmed intake into the snapshot read models. Returns how many records became real snapshots and how
 * many were skipped (incomplete or already materialized). Errors other than a period-duplicate propagate.
 */
export async function materializeIntake(
  intake: { targetDomain: string; businessId: string | null; workspaceId: string; records: unknown },
  actorId: string
): Promise<MaterializeResult> {
  const records: NormalizedRecord[] = Array.isArray(intake.records) ? (intake.records as NormalizedRecord[]) : [];
  if (!intake.businessId) return { domain: intake.targetDomain, materialized: 0, skipped: records.length };

  if (intake.targetDomain === "finance") {
    return materializeFinance(intake.businessId, intake.workspaceId, actorId, records);
  }
  // Recognised but not yet materialized in this slice — reported honestly as 0 materialized.
  return { domain: intake.targetDomain, materialized: 0, skipped: records.length };
}

async function materializeFinance(
  businessId: string,
  workspaceId: string,
  actorId: string,
  records: NormalizedRecord[]
): Promise<MaterializeResult> {
  let materialized = 0;
  let skipped = 0;
  for (const r of records) {
    const periodStart = str(r.periodStart);
    const periodEnd = str(r.periodEnd);
    const currency = str(r.currency);
    const revenue = num(r.revenue);
    // Required for a meaningful financial snapshot; without them we do NOT fabricate one.
    if (!periodStart || !periodEnd || !currency || revenue === undefined) {
      skipped++;
      continue;
    }
    const input: FinancialSnapshotCreateInput = {
      periodStart,
      periodEnd,
      currency,
      revenue,
      costOfGoodsOrServices: num(r.costOfGoodsOrServices),
      fixedCosts: num(r.fixedCosts),
      variableCosts: num(r.variableCosts),
    };
    try {
      await createFinancialSnapshot(businessId, input, actorId, workspaceId);
      materialized++;
    } catch (e) {
      if (e instanceof ConflictError) {
        // A snapshot for this period already exists — idempotent skip, never overwrite a governed record.
        skipped++;
        continue;
      }
      throw e;
    }
  }
  return { domain: "finance", materialized, skipped };
}
