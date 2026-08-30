/**
 * Founder Recovery — business service.
 *
 * Owner-only CRUD for real businesses. Workspace isolation is enforced on every
 * query via the verified workspace id. Mutations emit audit events.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import type { BusinessCreateInput, BusinessUpdateInput } from "@/domain/founder-recovery/validation";

export async function createBusiness(
  input: BusinessCreateInput,
  actorId: string,
  workspaceId: string
) {
  const business = await db.ownerBusiness.create({
    data: {
      id: randomUUID(),
      workspaceId,
      name: input.name,
      businessType: input.businessType,
      location: input.location ?? null,
      currency: input.currency,
      operatingModel: input.operatingModel ?? null,
      b2cSupported: input.b2cSupported ?? true,
      b2bSupported: input.b2bSupported ?? false,
      isActive: true,
      createdBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUSINESS_CREATED,
    actorId,
    workspaceId,
    entityType: "OwnerBusiness",
    entityId: business.id,
    payload: { name: business.name, businessType: business.businessType, currency: business.currency },
  });

  return business;
}

export async function listBusinesses(workspaceId: string) {
  return db.ownerBusiness.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBusiness(businessId: string, workspaceId: string) {
  const business = await db.ownerBusiness.findFirst({
    where: { id: businessId, workspaceId },
  });
  if (!business) throw new NotFoundError("OwnerBusiness", businessId);
  return business;
}

export async function updateBusiness(
  businessId: string,
  input: BusinessUpdateInput,
  actorId: string,
  workspaceId: string
) {
  // Ensure ownership before update (workspace-scoped).
  const before = await getBusiness(businessId, workspaceId);

  const updated = await db.ownerBusiness.update({
    where: { id: businessId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.businessType !== undefined ? { businessType: input.businessType } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.operatingModel !== undefined ? { operatingModel: input.operatingModel } : {}),
      ...(input.b2cSupported !== undefined ? { b2cSupported: input.b2cSupported } : {}),
      ...(input.b2bSupported !== undefined ? { b2bSupported: input.b2bSupported } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      version: { increment: 1 },
    },
  });

  // Changing the SMB archetype changes owner-pilot input requirements, readiness, and guidance
  // downstream (see smb-archetype.ts) — recording before/after values on this one field, not just
  // that it changed, gives the archetype-change audit trail Issue 5/12 required without a new event
  // type. Recomputation happens implicitly on the next read (mapBusinessTypeToProfile / readiness are
  // derived fresh every time); this update never triggers diagnosis/reassessment.
  const businessTypeChanged =
    input.businessType !== undefined && input.businessType !== before.businessType;

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUSINESS_UPDATED,
    actorId,
    workspaceId,
    entityType: "OwnerBusiness",
    entityId: businessId,
    payload: {
      fields: Object.keys(input),
      ...(businessTypeChanged
        ? { businessTypeChange: { field: "businessType", from: before.businessType, to: input.businessType } }
        : {}),
    },
  });

  return updated;
}
