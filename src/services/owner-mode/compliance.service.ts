/**
 * Jarvis 360 Slice 14 — compliance item service (DI).
 *
 * Records compliance items (licence/permit/insurance/tax) with expiry and reports
 * those needing review (expired → blocked, expiring soon → caution). Reuses the
 * pure boundary rules. Recording is audited.
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { isExpired, isExpiringSoon } from "@/domain/owner-mode/compliance-boundary";

interface ComplianceRow {
  id: string;
  kind: string;
  name: string;
  expiresAt: Date | null;
}

interface ComplianceDb {
  ownerComplianceItem: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    findMany(args: { where: { workspaceId: string; status: string }; select: Record<string, boolean> }): Promise<ComplianceRow[]>;
  };
}

export interface ComplianceDeps {
  db: ComplianceDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<ComplianceDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as ComplianceDb };
}

export interface RecordComplianceItemInput {
  workspaceId: string;
  businessId?: string | null;
  kind: string;
  name: string;
  reference?: string | null;
  expiresAt?: Date | null;
  actorId: string;
  jurisdiction?: string | null;
  legalBasis?: string | null;
  obligationOwner?: string | null;
  evidenceValidityDays?: number | null;
  recurrenceMonths?: number | null;
  penaltyDescription?: string | null;
  /** "owner_input" | "professional_input" | "authoritative_document" */
  provenanceSource?: string | null;
}

export async function recordComplianceItem(input: RecordComplianceItemInput, injected?: ComplianceDeps): Promise<string> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const created = await deps.db.ownerComplianceItem.create({
    data: {
      workspaceId: input.workspaceId,
      businessId: input.businessId ?? null,
      kind: input.kind,
      name: input.name,
      reference: input.reference ?? null,
      expiresAt: input.expiresAt ?? null,
      status: "active",
      createdByUserId: input.actorId,
      jurisdiction: input.jurisdiction ?? null,
      legalBasis: input.legalBasis ?? null,
      obligationOwner: input.obligationOwner ?? null,
      evidenceValidityDays: input.evidenceValidityDays ?? null,
      recurrenceMonths: input.recurrenceMonths ?? null,
      penaltyDescription: input.penaltyDescription ?? null,
      provenanceSource: input.provenanceSource ?? null,
      updatedAt: now,
    },
  });
  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_COMPLIANCE_REVIEW_REQUIRED,
    actorId: input.actorId,
    actorType: "user",
    entityType: "owner_compliance_item",
    entityId: created.id,
    payload: { kind: input.kind, name: input.name },
  });
  return created.id;
}

export interface ComplianceReviewItem {
  id: string;
  kind: string;
  name: string;
  state: "expired" | "expiring_soon";
}

/** List compliance items needing attention (expired or expiring soon). */
export async function getComplianceReviewItems(
  workspaceId: string,
  injected?: ComplianceDeps,
  windowDays = 30
): Promise<ComplianceReviewItem[]> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const rows = await deps.db.ownerComplianceItem.findMany({
    where: { workspaceId, status: "active" },
    select: { id: true, kind: true, name: true, expiresAt: true },
  });
  const out: ComplianceReviewItem[] = [];
  for (const r of rows) {
    if (isExpired(r.expiresAt, now)) out.push({ id: r.id, kind: r.kind, name: r.name, state: "expired" });
    else if (isExpiringSoon(r.expiresAt, now, windowDays)) out.push({ id: r.id, kind: r.kind, name: r.name, state: "expiring_soon" });
  }
  return out;
}
