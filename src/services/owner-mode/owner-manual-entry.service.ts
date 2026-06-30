/**
 * Owner MANUAL-ENTRY + structured-import SERVICE — two of the three real input paths.
 *
 *  1. Manual entry: the owner types one record; OpsIQ validates + scopes + classifies + persists it as
 *     an owner-confirmed intake (the owner is the authority for their own single record).
 *  2. Structured import: a batch of records (the upload-ready parser seam) runs through the SAME parser;
 *     valid records persist, malformed records are reported, and confidence updates only for the records
 *     that are actually confirmed.
 *
 *  The third path (DB/provider-backed) is the existing `owner-db-providers` ingestion — already proven.
 *
 * Every path: validates workspaceId + businessId, rejects cross-business and cross-workspace records,
 * rejects malformed records, classifies the category, persists through the existing governed
 * `OwnerDataIntake` table, emits an audit event, and reports the confidence before/after so the owner
 * sees the accuracy gain. A confirmed intake feeds the confidence read path (see owner-db-providers).
 *
 * The pure planning core is separated from the async DB wrapper so it is unit-tested without a live DB.
 */
import { randomUUID } from "node:crypto";
import {
  parseInputRecord,
  type OwnerInputRecord,
  type ParseResult,
} from "@/domain/owner-mode/input-record-parser";
import type { OwnerInputCategory } from "@/domain/owner-mode/input-catalog";
import { buildInputGuidance } from "@/domain/owner-mode/input-guidance";
import {
  mapBusinessTypeToProfile,
  mapOperatingModelToRole,
  rowsToSuppliedCategories,
} from "@/services/owner-mode/owner-onboarding.service";
import { prefetchOwnerDomainRows } from "@/services/owner-mode/owner-db-providers";
import type { Confidence } from "@/services/owner-mode/owner-domain-ingestion";
import type { BusinessProfileType, OwnerRole } from "@/domain/owner-mode/owner-onboarding";

export interface ManualEntryContext {
  business: { businessType?: string; operatingModel?: string | null } | null;
  priorSupplied: OwnerInputCategory[];
}

export interface ManualEntryDeps {
  db: {
    ownerBusiness: { findFirst(args: { where: { id: string; workspaceId: string } }): Promise<{ id: string } | null> };
    ownerDataIntake: { create(args: { data: Record<string, unknown> }): Promise<{ id: string }> };
  };
  now: Date;
  actorId: string;
  /** Override for tests; default reads the same scoped rows the runtime plan uses. */
  loadContext?: (workspaceId: string, businessId: string, now: Date) => Promise<ManualEntryContext>;
  /** Override for tests; default emits a governed audit event. */
  emitAudit?: (evt: { eventName: string; entityId: string; payload: Record<string, unknown> }) => Promise<void>;
}

export interface ManualEntryInput {
  workspaceId: string;
  businessId: string;
  record: OwnerInputRecord;
  /** Owner-confirmed on entry (manual single records are owner-authored); imports may stage unconfirmed. */
  confirm?: boolean;
}

export type ManualEntryResult =
  | {
      ok: true;
      intakeId: string;
      category: OwnerInputCategory;
      confirmed: boolean;
      confidenceBefore: Confidence;
      confidenceAfter: Confidence;
      confidenceImproved: boolean;
      suppliedAfter: OwnerInputCategory[];
    }
  | {
      ok: false;
      rejection: "malformed" | "cross_workspace" | "cross_business" | "business_not_found";
      errors: string[];
    };

const CONFIDENCE_ORDER: Record<Confidence, number> = { none: 0, low: 1, medium: 2, high: 3 };

/** Pure: given the parsed record, business, and prior supplied set, plan the confidence delta + payload. */
export function planManualEntry(
  parsed: Extract<ParseResult, { ok: true }>,
  business: { businessType?: string; operatingModel?: string | null },
  priorSupplied: OwnerInputCategory[],
  confirm: boolean,
): {
  profileType: BusinessProfileType;
  ownerRole: OwnerRole;
  confidenceBefore: Confidence;
  confidenceAfter: Confidence;
  confidenceImproved: boolean;
  suppliedAfter: OwnerInputCategory[];
} {
  const profileType = mapBusinessTypeToProfile(business.businessType);
  const ownerRole = mapOperatingModelToRole(business.operatingModel, profileType === "multi_location_smb");

  const confidenceBefore = buildInputGuidance({ profileType, ownerRole, suppliedCategories: priorSupplied }).overallConfidence;
  // A confirmed record counts toward supplied data; an unconfirmed import does not yet.
  const suppliedAfter = confirm ? Array.from(new Set([...priorSupplied, parsed.category])) : priorSupplied;
  const confidenceAfter = buildInputGuidance({ profileType, ownerRole, suppliedCategories: suppliedAfter }).overallConfidence;

  return {
    profileType,
    ownerRole,
    confidenceBefore,
    confidenceAfter,
    confidenceImproved: CONFIDENCE_ORDER[confidenceAfter] > CONFIDENCE_ORDER[confidenceBefore],
    suppliedAfter,
  };
}

async function defaultLoadContext(workspaceId: string, businessId: string, now: Date): Promise<ManualEntryContext> {
  const { db } = await import("@/lib/db");
  const rows = await prefetchOwnerDomainRows({ db: db as never, workspaceId, businessId, now });
  return {
    business: rows.business as ManualEntryContext["business"],
    priorSupplied: rowsToSuppliedCategories(rows),
  };
}

async function defaultEmitAudit(evt: { eventName: string; entityId: string; payload: Record<string, unknown> }): Promise<void> {
  const { emitAuditEvent } = await import("@/infra/audit");
  await emitAuditEvent({
    eventName: evt.eventName as Parameters<typeof emitAuditEvent>[0]["eventName"],
    actorId: (evt.payload.actorId as string) ?? "system",
    workspaceId: evt.payload.workspaceId as string,
    entityType: "OwnerDataIntake",
    entityId: evt.entityId,
    payload: evt.payload,
  });
}

/** Submit ONE manual record. */
export async function submitManualEntry(input: ManualEntryInput, deps: ManualEntryDeps): Promise<ManualEntryResult> {
  const scope = { workspaceId: input.workspaceId, businessId: input.businessId };
  const parsed = parseInputRecord(input.record, scope);
  if (!parsed.ok) {
    return { ok: false, rejection: parsed.rejection, errors: parsed.errors };
  }

  // Business must exist within this workspace (defends cross-workspace/business even past the parser).
  const business = await deps.db.ownerBusiness.findFirst({ where: { id: input.businessId, workspaceId: input.workspaceId } });
  if (!business) {
    return { ok: false, rejection: "business_not_found", errors: ["business not found in this workspace"] };
  }

  const load = deps.loadContext ?? defaultLoadContext;
  const ctx = await load(input.workspaceId, input.businessId, deps.now);
  const confirm = input.confirm ?? true;

  const plan = planManualEntry(parsed, ctx.business ?? {}, ctx.priorSupplied, confirm);

  const intakeId = randomUUID();
  await deps.db.ownerDataIntake.create({
    data: {
      id: intakeId,
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      source: parsed.source,
      targetDomain: parsed.category,
      rowCount: parsed.rowCount,
      validationStatus: "valid",
      normalizationStatus: "normalized",
      mappedFields: parsed.normalizedFields,
      unmappedColumns: [],
      records: [parsed.normalizedFields],
      errorReport: [],
      ownerConfirmed: confirm,
      confirmedAt: confirm ? deps.now : null,
      confirmedBy: confirm ? deps.actorId : null,
    },
  });

  const emit = deps.emitAudit ?? defaultEmitAudit;
  await emit({
    eventName: confirm ? "owner.data_intake_confirmed" : "owner.data_intake_recorded",
    entityId: intakeId,
    payload: { workspaceId: input.workspaceId, businessId: input.businessId, actorId: deps.actorId, source: parsed.source, category: parsed.category },
  });

  return {
    ok: true,
    intakeId,
    category: parsed.category,
    confirmed: confirm,
    confidenceBefore: plan.confidenceBefore,
    confidenceAfter: plan.confidenceAfter,
    confidenceImproved: plan.confidenceImproved,
    suppliedAfter: plan.suppliedAfter,
  };
}

export interface StructuredImportResult {
  accepted: ManualEntryResult[];
  rejected: Array<{ index: number; rejection: string; errors: string[] }>;
  acceptedCount: number;
  rejectedCount: number;
}

/** Submit a BATCH of structured records (upload-ready parser path). */
export async function submitStructuredImport(
  input: { workspaceId: string; businessId: string; records: OwnerInputRecord[]; confirm?: boolean },
  deps: ManualEntryDeps,
): Promise<StructuredImportResult> {
  const accepted: ManualEntryResult[] = [];
  const rejected: StructuredImportResult["rejected"] = [];

  for (let i = 0; i < input.records.length; i++) {
    const res = await submitManualEntry(
      { workspaceId: input.workspaceId, businessId: input.businessId, record: input.records[i], confirm: input.confirm ?? false },
      deps,
    );
    if (res.ok) accepted.push(res);
    else rejected.push({ index: i, rejection: res.rejection, errors: res.errors });
  }

  return { accepted, rejected, acceptedCount: accepted.length, rejectedCount: rejected.length };
}
