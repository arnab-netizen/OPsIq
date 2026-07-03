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
 * Wave 5: `sales`/`operations`/`sop`/`marketing` → their existing Owner{Domain}Snapshot services, which the
 * owner-visible per-domain dashboards (GET /api/owner/{domain}/dashboard) read. The intake field-specs are a 1:1
 * match for those snapshots' create-input fields, so no field is invented — periodStart/periodEnd/currency are
 * required (mirroring finance) and every other numeric key is passed through. These per-domain snapshots feed the
 * per-domain dashboards, NOT the whole-business-plan critical domains (that bridge is a documented product decision).
 */
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { createSalesSnapshot } from "@/services/owner-sales/snapshot.service";
import { createOperationsSnapshot } from "@/services/owner-operations/snapshot.service";
import { createSopSnapshot } from "@/services/owner-sop/snapshot.service";
import { createMarketingSnapshot } from "@/services/owner-marketing/snapshot.service";
import { ConflictError } from "@/infra/errors";
import type { FinancialSnapshotCreateInput } from "@/domain/owner-finance/validation";

type NormalizedRecord = Record<string, number | string | null>;

/** A period-keyed snapshot create service. All four non-finance domains share this shape. */
type SnapshotCreator = (
  businessId: string,
  input: Record<string, string | number>,
  actorId: string,
  workspaceId: string
) => Promise<unknown>;

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
  // Wave 5: the non-finance CSV domains materialize into their existing owner-wired snapshot services. The intake
  // field-spec keys ARE the snapshot create-input field names (verified 1:1), so the generic pass-through invents
  // nothing. `createFinancialSnapshot`'s signature differs only in the input type; the four below are identical.
  const NON_FINANCE_CREATORS: Record<string, SnapshotCreator> = {
    sales: createSalesSnapshot as unknown as SnapshotCreator,
    operations: createOperationsSnapshot as unknown as SnapshotCreator,
    sop: createSopSnapshot as unknown as SnapshotCreator,
    marketing: createMarketingSnapshot as unknown as SnapshotCreator,
  };
  const creator = NON_FINANCE_CREATORS[intake.targetDomain];
  if (creator) {
    return materializeViaSnapshot(intake.targetDomain, creator, intake.businessId, intake.workspaceId, actorId, records);
  }
  // Unrecognised domain — reported honestly as 0 materialized (no fabrication).
  return { domain: intake.targetDomain, materialized: 0, skipped: records.length };
}

/**
 * Generic period-snapshot materializer for domains whose intake field-spec keys equal their snapshot create-input
 * field names. Requires periodStart/periodEnd/currency (a meaningful period snapshot); passes through every other
 * finite-number key; drops nulls/strings. A duplicate period (ConflictError) is an idempotent skip. Fabricates nothing.
 */
async function materializeViaSnapshot(
  domain: string,
  creator: SnapshotCreator,
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
    if (!periodStart || !periodEnd || !currency) {
      skipped++;
      continue;
    }
    const input: Record<string, string | number> = { periodStart, periodEnd, currency };
    for (const [key, value] of Object.entries(r)) {
      if (key === "periodStart" || key === "periodEnd" || key === "currency") continue;
      const n = num(value);
      if (n !== undefined) input[key] = n; // only real numbers; nulls/strings are not fabricated into the snapshot
    }
    try {
      await creator(businessId, input, actorId, workspaceId);
      materialized++;
    } catch (e) {
      if (e instanceof ConflictError) {
        skipped++; // a snapshot for this period already exists — idempotent, never overwrite
        continue;
      }
      throw e;
    }
  }
  return { domain, materialized, skipped };
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
