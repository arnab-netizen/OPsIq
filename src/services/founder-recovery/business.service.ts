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
  workspaceId: string,
  opts?: { isFixtureBusiness?: boolean }
) {
  // isFixtureBusiness is NEVER read from the ordinary business-create request body/schema — it
  // is only ever passed by the route layer after an explicit SYSTEM_ADMIN capability check (see
  // POST /api/owner/recovery/businesses). A self-serve owner has no path to set this on their own
  // business. See docs/opsiq-governance/ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.
  const isFixtureBusiness = opts?.isFixtureBusiness === true;

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
      isFixtureBusiness,
      createdBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUSINESS_CREATED,
    actorId,
    workspaceId,
    entityType: "OwnerBusiness",
    entityId: business.id,
    payload: { name: business.name, businessType: business.businessType, currency: business.currency, isFixtureBusiness },
  });

  return business;
}

export async function listBusinesses(workspaceId: string) {
  // isActive: true — excludes archived businesses (see archiveBusiness below). Durable,
  // non-destructive isolation for stale/test/acceptance rows accumulated in a workspace:
  // an owner (or whoever ran acceptance testing under their own account) can archive a
  // business they no longer want cluttering their own selector without deleting the row
  // or its history. Previously this had no isActive filter at all, so a business archived
  // by any future caller of this field would still have appeared here.
  //
  // isFixtureBusiness: false — excludes acceptance/QA fixtures (see createBusiness above and
  // ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md). An ordinary owner's list must never include a business
  // an authorized acceptance run created under this same workspace/account.
  return db.ownerBusiness.findMany({
    where: { workspaceId, isActive: true, isFixtureBusiness: false },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Authorized acceptance/QA path — the ONLY listBusinesses variant that returns fixture rows.
 * Callers must independently enforce a SYSTEM_ADMIN (or equivalent acceptance-tooling) capability
 * check before invoking this; it performs no capability check itself, matching every other
 * function in this file being a plain workspace-scoped data accessor with authorization handled at
 * the route layer.
 */
export async function listFixtureBusinesses(workspaceId: string) {
  return db.ownerBusiness.findMany({
    where: { workspaceId, isFixtureBusiness: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * The single authoritative "does this workspace have at least one real, active business" check
 * for domain services that must gate business-derived output (risks, alerts, actions,
 * recommendations) on real business existence -- never a React-only page guard. See
 * listBusinessRisks() in business-risk.service.ts for the defect this closes: a real human
 * usability test found Priorities still showing a critical cash-survival risk while Home
 * correctly showed the "set up your business" onboarding state, because BusinessRiskEntry has no
 * businessId column at all and its list query was workspace-scoped only, with no gate on whether
 * a real business currently exists for that workspace.
 */
export async function hasAnyRealBusiness(workspaceId: string): Promise<boolean> {
  const business = await db.ownerBusiness.findFirst({
    where: { workspaceId, isActive: true, isFixtureBusiness: false },
    select: { id: true },
  });
  return business !== null;
}

/**
 * The authoritative "is this workspace's data unambiguously attributable to exactly one real,
 * active business" check -- for domain services whose underlying model has NO businessId column
 * at all (e.g. BusinessRiskEntry) and therefore can never filter by the currently-selected
 * business. Live production browser acceptance (controlled-beta launch-blocker audit, D2) proved
 * that when a workspace holds MORE than one real business, showing that workspace-wide data on any
 * "selected business" surface (Home/Cockpit) silently misattributes it -- the same risk record IDs
 * rendered as if they belonged to whichever business happened to be selected. With exactly one real
 * business, workspace-wide data and that business's data are the same set by definition, so showing
 * it is correct, not an assumption; with zero or two-or-more, it is hidden rather than guessed at.
 */
export async function hasExactlyOneRealBusiness(workspaceId: string): Promise<boolean> {
  const businesses = await db.ownerBusiness.findMany({
    where: { workspaceId, isActive: true, isFixtureBusiness: false },
    select: { id: true },
    take: 2,
  });
  return businesses.length === 1;
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
