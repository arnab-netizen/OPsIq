/**
 * Structured External Opportunity Intake service — the governed write path that lets a real owner/manager/
 * system submit a structured external opportunity signal so the External Opportunity Intelligence loop +
 * Opportunity Operating Layer run on live data, not only DB-sim/injected data.
 *
 * Server-authoritative + fail-closed:
 *   - the submission is validated in the pure domain layer (unknown type / empty description / forbidden
 *     fraud-HR language fail closed);
 *   - workspace + actor come from the verified session (never a client claim);
 *   - the signal row + an atomic audit are written in ONE transaction;
 *   - it is idempotent on (workspaceId, idempotencyKey): an identical resubmit is a no-op;
 *   - after persisting it runs the operating layer over the workspace's ACTIVE signals so the caller sees
 *     the governed result (candidate / needs-data / parked / rejected / duplicate) — never raw spam;
 *   - it NEVER scrapes, contacts anyone, spends, or auto-submits a tender.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  planExternalOpportunitySignal,
  type ExternalOpportunitySignalSubmission,
  type PersistedIntakeRow,
} from "@/domain/owner-mode/external-opportunity-intake";
import {
  buildOpportunityOperatingLayer,
  type BusinessStateContext,
  type OpportunityOperatingAnalysis,
  type OperatingOpportunity,
} from "@/domain/owner-mode/opportunity-operating-layer";

interface SignalRow {
  id: string; workspaceId: string; idempotencyKey: string; dedupeKey: string; rawSignalType: string;
  sourceName: string | null; sourceChannel: string | null; sourceRef: string | null;
  submittedByUserId: string | null; submittedByRole: string | null; rawDescription: string;
  extractedBusinessNeed: string | null; targetCustomerSegment: string | null; locationContext: string | null;
  deadlineAt: Date | null; tenderOrProcurementValue: number | null; eligibilityRequirements: string | null;
  complianceRequirements: string | null; estimatedCashExposure: number | null; cashExposureBand: string;
  relevanceBand: string; ownerWorkloadBand: string; ownerWorkloadNotes: string | null; hasUnitEconomics: boolean;
  sourceQuality: string; requiredDocuments: string[]; missingDocuments: string[]; discoveredAt: Date | null;
  lastVerifiedAt: Date | null; staleAfterDays: number | null; evidenceRefs: string[]; missingData: string[];
  initialStatus: string; classification: string; status: string; submittedAt: Date; createdAt: Date; updatedAt: Date;
}
interface IntakeTx {
  externalOpportunitySignal: {
    create(a: { data: Record<string, unknown> }): Promise<{ id: string }>;
    updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  auditEvent: { create(a: { data: Record<string, unknown> }): Promise<unknown> };
}
export interface IntakeDb {
  externalOpportunitySignal: {
    findFirst(a: { where: Record<string, unknown> }): Promise<SignalRow | null>;
    findMany(a: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }): Promise<SignalRow[]>;
  };
  $transaction<T>(fn: (tx: IntakeTx) => Promise<T>): Promise<T>;
}
export interface IntakeDeps {
  db: IntakeDb;
  uuid: () => string;
  now: () => Date;
}

async function resolveDefaultDeps(): Promise<IntakeDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  return { db: db as unknown as IntakeDb, uuid: () => randomUUID(), now: () => new Date() };
}

/** A conservative business context for the submit-time preview (capacities unknown ⇒ never STRONG fit). */
export function defaultBusinessContext(): BusinessStateContext {
  return {
    hasCriticalQualityBottleneck: false, hasCashProfitRisk: false, staffCapacity: "UNKNOWN",
    equipmentCapacity: "UNKNOWN", deliveryCapacity: "UNKNOWN", ownerWorkloadHigh: false,
    unresolvedTrainingOrSopGap: false, activeHighRiskApproval: false, capabilityGapPresent: false, topConstraintType: null,
  };
}

function rowToPersisted(r: SignalRow): PersistedIntakeRow {
  return {
    id: r.id, workspaceId: r.workspaceId, idempotencyKey: r.idempotencyKey, dedupeKey: r.dedupeKey,
    rawSignalType: r.rawSignalType as PersistedIntakeRow["rawSignalType"],
    sourceName: r.sourceName, sourceChannel: r.sourceChannel, sourceRef: r.sourceRef,
    rawDescription: r.rawDescription, extractedBusinessNeed: r.extractedBusinessNeed,
    targetCustomerSegment: r.targetCustomerSegment, locationContext: r.locationContext, deadlineAt: r.deadlineAt,
    tenderOrProcurementValue: r.tenderOrProcurementValue, eligibilityRequirements: r.eligibilityRequirements,
    complianceRequirements: r.complianceRequirements, estimatedCashExposure: r.estimatedCashExposure,
    cashExposureBand: r.cashExposureBand as PersistedIntakeRow["cashExposureBand"],
    relevanceBand: r.relevanceBand as PersistedIntakeRow["relevanceBand"],
    ownerWorkloadBand: r.ownerWorkloadBand as PersistedIntakeRow["ownerWorkloadBand"],
    ownerWorkloadNotes: r.ownerWorkloadNotes, hasUnitEconomics: r.hasUnitEconomics,
    sourceQuality: r.sourceQuality as PersistedIntakeRow["sourceQuality"],
    requiredDocuments: r.requiredDocuments, missingDocuments: r.missingDocuments,
    discoveredAt: r.discoveredAt, lastVerifiedAt: r.lastVerifiedAt, staleAfterDays: r.staleAfterDays,
    evidenceRefs: r.evidenceRefs, missingData: r.missingData,
  };
}

export interface SubmitSignalInput {
  workspaceId: string;
  actorId: string | null;
  actorRole?: string | null;
  submission: ExternalOpportunitySignalSubmission;
  businessContext?: BusinessStateContext;
}
export type SubmitSignalResult =
  | {
      ok: true; signalId: string; classification: string; initialStatus: string; deduped: boolean;
      topOpportunity: OperatingOpportunity | null; operating: OpportunityOperatingAnalysis;
    }
  | { ok: false; reason: string };

/** Submit (or idempotently no-op) a structured external opportunity signal, then run the operating layer. */
export async function submitExternalOpportunitySignal(input: SubmitSignalInput, injected?: IntakeDeps): Promise<SubmitSignalResult> {
  const deps = injected ?? (await resolveDefaultDeps());
  const plan = planExternalOpportunitySignal(input.submission);
  if (!plan.ok) return { ok: false, reason: plan.reason };
  const row = plan.row;
  const now = deps.now();
  const business = input.businessContext ?? defaultBusinessContext();

  const existing = await deps.db.externalOpportunitySignal.findFirst({
    where: { workspaceId: input.workspaceId, idempotencyKey: row.idempotencyKey },
  });

  // Classify the submitted signal on its own so we can persist an honest initialStatus.
  const soloId = existing?.id ?? deps.uuid();
  const soloPersisted: PersistedIntakeRow = { ...row, id: soloId, workspaceId: input.workspaceId };
  const solo = buildOpportunityOperatingLayer([soloPersisted], business, input.workspaceId, now.toISOString());
  const classification = solo.opportunities[0]?.recommendedNextStep ?? "RAW";
  const initialStatus = deriveInitialStatus(solo.opportunities[0]);

  // Idempotent: identical resubmit (same dedupeKey + description) → no-op.
  if (existing && existing.dedupeKey === row.dedupeKey && existing.rawDescription === row.rawDescription && existing.rawSignalType === row.rawSignalType) {
    const active = await loadActive(deps, input.workspaceId);
    const operating = buildOpportunityOperatingLayer(active, business, input.workspaceId, now.toISOString());
    return { ok: true, signalId: `intake:${existing.id}`, classification: existing.classification, initialStatus: existing.initialStatus, deduped: true, topOpportunity: operating.topOpportunity, operating };
  }

  const id = soloId;
  await deps.db.$transaction(async (tx) => {
    const data = {
      workspaceId: input.workspaceId, idempotencyKey: row.idempotencyKey, dedupeKey: row.dedupeKey,
      rawSignalType: row.rawSignalType, sourceName: row.sourceName, sourceChannel: row.sourceChannel, sourceRef: row.sourceRef,
      submittedByUserId: input.actorId ?? null, submittedByRole: input.actorRole ?? null, rawDescription: row.rawDescription,
      extractedBusinessNeed: row.extractedBusinessNeed, targetCustomerSegment: row.targetCustomerSegment,
      locationContext: row.locationContext, deadlineAt: row.deadlineAt, tenderOrProcurementValue: row.tenderOrProcurementValue,
      eligibilityRequirements: row.eligibilityRequirements, complianceRequirements: row.complianceRequirements,
      estimatedCashExposure: row.estimatedCashExposure, cashExposureBand: row.cashExposureBand, relevanceBand: row.relevanceBand,
      ownerWorkloadBand: row.ownerWorkloadBand, ownerWorkloadNotes: row.ownerWorkloadNotes, hasUnitEconomics: row.hasUnitEconomics,
      sourceQuality: row.sourceQuality, requiredDocuments: row.requiredDocuments, missingDocuments: row.missingDocuments,
      discoveredAt: row.discoveredAt ?? now, lastVerifiedAt: row.lastVerifiedAt, staleAfterDays: row.staleAfterDays,
      evidenceRefs: row.evidenceRefs, missingData: row.missingData, initialStatus, classification, status: "ACTIVE",
      submittedAt: now, updatedAt: now,
    };
    if (existing) {
      await tx.externalOpportunitySignal.updateMany({ where: { workspaceId: input.workspaceId, idempotencyKey: row.idempotencyKey }, data });
    } else {
      await tx.externalOpportunitySignal.create({ data: { id, createdAt: now, ...data } });
    }
    await tx.auditEvent.create({
      data: {
        id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.OWNER_OPPORTUNITY_SIGNAL_SUBMITTED,
        actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system",
        entityType: "external_opportunity_signal", entityId: id,
        payload: { rawSignalType: row.rawSignalType, classification, initialStatus, dedupeKey: row.dedupeKey, updated: !!existing },
        visibility: "internal", occurredAt: now,
      },
    });
  });

  const active = await loadActive(deps, input.workspaceId);
  const operating = buildOpportunityOperatingLayer(active, business, input.workspaceId, now.toISOString());
  return { ok: true, signalId: `intake:${id}`, classification, initialStatus, deduped: false, topOpportunity: operating.topOpportunity, operating };
}

function deriveInitialStatus(o: OperatingOpportunity | undefined): string {
  if (!o) return "RAW";
  if (o.recommendedNextStep === "REJECT" || o.recommendedNextStep === "REJECT_UNFIT" || o.recommendedNextStep === "DO_NOT_BID") return "REJECTED";
  if (o.recommendedNextStep === "PARK") return "PARKED";
  if (o.executionReadiness === "NEEDS_DATA" || o.recommendedNextStep === "COLLECT_DATA" || /COLLECT_/.test(o.recommendedNextStep)) return "NEEDS_DATA";
  return "CANDIDATE";
}

async function loadActive(deps: IntakeDeps, workspaceId: string): Promise<PersistedIntakeRow[]> {
  const rows = await deps.db.externalOpportunitySignal.findMany({ where: { workspaceId, status: "ACTIVE" }, orderBy: { submittedAt: "desc" }, take: 500 });
  return rows.map(rowToPersisted);
}

/** Read the workspace's ACTIVE structured signals as engine-ready persisted rows (workspace-scoped). */
export async function getActiveExternalOpportunitySignals(workspaceId: string, injected?: IntakeDeps): Promise<PersistedIntakeRow[]> {
  const deps = injected ?? (await resolveDefaultDeps());
  try {
    return await loadActive(deps, workspaceId);
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2021") return [];
    throw e;
  }
}
