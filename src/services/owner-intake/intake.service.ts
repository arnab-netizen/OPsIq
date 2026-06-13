/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Connectors & Data Intake (Module 10) — intake service.
 *
 * Persists a validated, normalized intake CANDIDATE (the engine output) for a
 * business, and lets the owner CONFIRM it. Connector data is never auto-confirmed
 * and an invalid intake can never be confirmed (execution.md §17). Workspace
 * ownership is enforced via the Module 1 `getBusiness` guard; all meaningful
 * mutations emit audit events.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { buildCsvIntake, fieldSpecForDomain } from "@/domain/owner-intake";
import type { IntakeUploadInput } from "@/domain/owner-intake";

export async function createDataIntake(
  businessId: string,
  input: IntakeUploadInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId); // workspace ownership + existence

  const spec = fieldSpecForDomain(input.targetDomain);
  if (!spec) throw new ValidationError(`Unsupported intake target domain: ${input.targetDomain}`);

  const result = buildCsvIntake(input.source, input.csvText, spec);

  const intake = await db.ownerDataIntake.create({
    data: {
      id: randomUUID(),
      workspaceId,
      businessId,
      source: result.source,
      targetDomain: input.targetDomain,
      rowCount: result.rowCount,
      validationStatus: result.validationStatus,
      normalizationStatus: result.normalizationStatus,
      mappedFields: result.mappedFields,
      unmappedColumns: result.unmappedColumns,
      records: result.records,
      errorReport: result.errorReport,
      ownerConfirmed: false, // never auto-confirmed
      notes: input.notes ?? null,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_DATA_INTAKE_RECORDED,
    actorId,
    workspaceId,
    entityType: "OwnerDataIntake",
    entityId: intake.id,
    payload: {
      businessId,
      source: result.source,
      targetDomain: input.targetDomain,
      validationStatus: result.validationStatus,
      rowCount: result.rowCount,
      errorCount: result.errorReport.length,
    },
  });

  return intake;
}

export async function getDataIntake(intakeId: string, workspaceId: string) {
  const intake = await db.ownerDataIntake.findFirst({ where: { id: intakeId, workspaceId } });
  if (!intake) throw new NotFoundError("OwnerDataIntake", intakeId);
  return intake;
}

export async function listDataIntakes(businessId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  return db.ownerDataIntake.findMany({
    where: { businessId, workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Owner-confirm an intake. Fails closed: an invalid intake cannot be confirmed
 * (it would feed bad data into a diagnosis), and a duplicate confirm is rejected.
 */
export async function confirmDataIntake(intakeId: string, actorId: string, workspaceId: string) {
  const intake = await db.ownerDataIntake.findFirst({ where: { id: intakeId, workspaceId } });
  if (!intake) throw new NotFoundError("OwnerDataIntake", intakeId);

  if (intake.ownerConfirmed) {
    throw new ConflictError("This intake has already been confirmed.");
  }
  if (intake.validationStatus === "invalid") {
    throw new ValidationError(
      "An intake with validation errors cannot be confirmed. Fix the source data and re-upload."
    );
  }

  const updated = await db.ownerDataIntake.update({
    where: { id: intakeId },
    data: { ownerConfirmed: true, confirmedAt: new Date(), confirmedBy: actorId },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_DATA_INTAKE_CONFIRMED,
    actorId,
    workspaceId,
    entityType: "OwnerDataIntake",
    entityId: intakeId,
    payload: { businessId: intake.businessId, targetDomain: intake.targetDomain, rowCount: intake.rowCount },
  });

  return updated;
}

export async function getIntakeDashboard(workspaceId: string, requestedBusinessId?: string | null) {
  const { listBusinesses } = await import("@/services/founder-recovery/business.service");
  const businesses = await listBusinesses(workspaceId);
  const businessList = businesses.map((b: any) => ({
    id: b.id, name: b.name, businessType: b.businessType, currency: b.currency, isActive: b.isActive,
  }));

  let selectedBusinessId: string | null = null;
  if (requestedBusinessId) {
    const owned = businesses.find((b: any) => b.id === requestedBusinessId);
    if (owned) selectedBusinessId = owned.id;
  }
  if (!selectedBusinessId && businesses.length > 0) selectedBusinessId = businesses[0].id;

  if (!selectedBusinessId) {
    return { businesses: businessList, selectedBusinessId: null, intakes: [], hasData: false };
  }

  await getBusiness(selectedBusinessId, workspaceId);
  const intakes = await db.ownerDataIntake.findMany({
    where: { businessId: selectedBusinessId, workspaceId },
    orderBy: { createdAt: "desc" },
  });

  return {
    businesses: businessList,
    selectedBusinessId,
    intakes,
    hasData: intakes.length > 0,
  };
}
