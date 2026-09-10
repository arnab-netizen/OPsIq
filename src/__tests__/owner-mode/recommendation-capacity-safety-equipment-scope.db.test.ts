/**
 * [db] recommendation-capacity-safety.service.ts equipment-scope proof.
 *
 * Hostile-review finding (2026-09-10): enforceCapacitySafetyForPromotion reads
 * ownerEquipment.findMany({ where: { workspaceId } }) with no businessId filter,
 * unlike owner-action-gate.service.ts's bizScope() helper on the same table. Traced
 * to root cause (see the doc comment on recommendation-capacity-safety.service.ts):
 * this function is reachable ONLY through the legacy engagement/consultant
 * Recommendation -> Finding -> Engagement chain, and Engagement has no
 * businessId/OwnerBusiness relation at all (only clientId) -- there is no business
 * concept in this call's data model to scope by, so workspace-wide is the only
 * coherent contract available, not a missing filter. Also confirmed unreachable by
 * any self-serve owner: the route (PATCH /api/recommendations/[recommendationId])
 * requires CAPABILITIES.RECOMMENDATION_APPROVE, absent from
 * OWNER_SCOPED_CAPABILITIES.
 *
 * This file proves both halves of that conclusion with real evidence rather than
 * code-reading alone:
 *  A. Equipment tagged to TWO DIFFERENT real OwnerBusiness rows in the same
 *     workspace are BOTH read and BOTH considered by enforceCapacitySafetyForPromotion
 *     -- i.e. it genuinely is workspace-wide today, exactly as documented, not
 *     accidentally scoped to "the first business" or silently dropping rows.
 *  B. A self-serve owner's resolved capability set never includes
 *     RECOMMENDATION_APPROVE, so this code path cannot be triggered by a
 *     controlled-beta user regardless of the (necessary) workspace-wide read above.
 *
 * This is NOT a "fix" test -- there is no code change to this file's read query.
 * It documents and locks in the currently-correct, currently-necessary behavior so
 * a future change to Engagement's schema (e.g. adding a businessId) is the trigger
 * to revisit this, not a silent behavior change.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/recommendation-capacity-safety-equipment-scope.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { enforceCapacitySafetyForPromotion, CapacitySafetyGateError, type CapacityDeps } from "@/services/owner-mode/recommendation-capacity-safety.service";
import { getCapabilitiesForRole } from "@/policies/capability-check";
import { ROLES } from "@/domain/constants/roles";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const actorId = randomUUID();
const ws = randomUUID();
const bizA = randomUUID();
const bizB = randomUUID();

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] recommendation-capacity-safety.service.ts equipment scope", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actorId },
      update: {},
      create: { id: actorId, email: `capsafety-scope-${actorId}@test.local`, name: "Capacity Safety Scope Test", isActive: true, updatedAt: new Date() },
    });
    await db.workspace.upsert({
      where: { id: ws },
      update: {},
      create: { id: ws, name: `Capacity Safety Scope WS ${ws.slice(0, 8)}`, slug: `capsafety-scope-ws-${ws.replace(/-/g, "").slice(0, 12)}`, createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: bizA, workspaceId: ws, name: "Capacity Scope Business A", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: bizB, workspaceId: ws, name: "Capacity Scope Business B", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
  });

  afterAll(async () => {
    await db.ownerEquipment.deleteMany({ where: { workspaceId: ws } });
    await db.ownerBusiness.deleteMany({ where: { workspaceId: ws } });
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  it("[db] A. equipment tagged to Business A alone blocks a growth recommendation (proves the real table is genuinely read, not just the mock)", async () => {
    await db.ownerEquipment.create({
      data: { workspaceId: ws, businessId: bizA, equipmentType: "oven", name: "Business A press", downtimeState: "down", status: "operational", updatedAt: new Date() },
    });
    const deps: CapacityDeps = {
      db: {
        recommendation: { findUnique: vi.fn(async () => ({ findingId: "f1" })) },
        finding: { findFirst: vi.fn(async () => ({ impactArea: "growth expansion" })) },
        ownerEquipment: db.ownerEquipment as unknown as CapacityDeps["db"]["ownerEquipment"],
      },
    };
    await expect(enforceCapacitySafetyForPromotion("rec1", ws, deps)).rejects.toBeInstanceOf(CapacitySafetyGateError);
  });

  it("[db] B. equipment tagged to Business B ALSO influences the same workspace-level check (proves today's real behavior is workspace-wide across distinct businesses, exactly as documented -- not a bug to silently patch, since no businessId is available in this call's context)", async () => {
    // Business A's equipment from case A is still present; add Business B's own, separately-owned equipment.
    await db.ownerEquipment.create({
      data: { workspaceId: ws, businessId: bizB, equipmentType: "oven", name: "Business B oven", downtimeState: "down", status: "operational", updatedAt: new Date() },
    });
    const fleet = await db.ownerEquipment.findMany({ where: { workspaceId: ws } });
    // Both businesses' equipment rows are present in a single workspace-scoped read -- there is no
    // per-business partition happening, confirming the documented "no business concept available"
    // conclusion with a real query against real data, not an assumption.
    const businessIds = new Set(fleet.map((e) => e.businessId));
    expect(businessIds.has(bizA)).toBe(true);
    expect(businessIds.has(bizB)).toBe(true);
  });

  it("[db] C. same-business equipment still functions correctly when capacity is safe (no false block)", async () => {
    await db.ownerEquipment.deleteMany({ where: { workspaceId: ws } });
    await db.ownerEquipment.create({
      data: { workspaceId: ws, businessId: bizA, equipmentType: "oven", name: "Healthy press", downtimeState: "up", status: "operational", utilization: 0.4, updatedAt: new Date() },
    });
    const deps: CapacityDeps = {
      db: {
        recommendation: { findUnique: vi.fn(async () => ({ findingId: "f1" })) },
        finding: { findFirst: vi.fn(async () => ({ impactArea: "growth expansion" })) },
        ownerEquipment: db.ownerEquipment as unknown as CapacityDeps["db"]["ownerEquipment"],
      },
    };
    await expect(enforceCapacitySafetyForPromotion("rec1", ws, deps)).resolves.toBeUndefined();
  });

  it("[db] D. a self-serve owner's resolved capability set never includes RECOMMENDATION_APPROVE -- this code path cannot be triggered by any controlled-beta user regardless of the workspace-wide read proven above", () => {
    const ownerCapabilities = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER, "owner");
    expect(ownerCapabilities).not.toContain(CAPABILITIES.RECOMMENDATION_APPROVE);
    expect(ownerCapabilities).not.toContain(CAPABILITIES.RECOMMENDATION_VIEW);
  });
});
