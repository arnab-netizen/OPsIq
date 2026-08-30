/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * SMB archetype MVP — business-type update DB proof.
 *
 * Proves the governed update path (`updateBusiness`, reached via `PATCH
 * /api/owner/recovery/businesses/[businessId]`, `OWNER_MANAGE` + workspace-scoped) for changing
 * `OwnerBusiness.businessType`:
 *  - the target business's type actually changes;
 *  - a second business in a DIFFERENT workspace is completely unaffected (cross-workspace isolation);
 *  - existing evidence for the changed business is preserved untouched (archetype change never deletes
 *    or mutates data);
 *  - exactly one `OWNER_BUSINESS_UPDATED` audit event is emitted for the change, carrying the
 *    businessType before/after values;
 *  - changing businessType creates ZERO reassessment/diagnosis cycles — recomputation is derived/
 *    read-only (mapBusinessTypeToProfile is called fresh on every onboarding/readiness read), never an
 *    automatic diagnostic re-execution.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/founder-recovery/business-type-update.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness, updateBusiness, getBusiness } from "@/services/founder-recovery/business.service";
import { createSnapshot } from "@/services/founder-recovery/snapshot.service";
import { businessUpdateSchema } from "@/domain/founder-recovery/validation";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const ws = () => randomUUID();
const actor = randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `smb-archetype-mvp-test-${actor}@example.com`,
      name: "SMB Archetype MVP Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

describe("[db] SMB archetype — business-type update", () => {
  it("[db] changes the target business, leaves a business in another workspace untouched", async () => {
    const workspaceA = ws();
    const workspaceB = ws();

    const businessA = await createBusiness(
      { name: "Business A", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
      actor, workspaceA,
    );
    const businessB = await createBusiness(
      { name: "Business B", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
      actor, workspaceB,
    );

    const input = businessUpdateSchema.parse({ businessType: "hospitality_food_service" });
    const updated = await updateBusiness(businessA.id, input, actor, workspaceA);

    expect(updated.businessType).toBe("hospitality_food_service");

    const rowA = await getBusiness(businessA.id, workspaceA);
    expect(rowA.businessType).toBe("hospitality_food_service");
    expect(rowA.version).toBe(2);

    // CROSS_WORKSPACE_ISOLATION = PASS
    const rowB = await getBusiness(businessB.id, workspaceB);
    expect(rowB.businessType).toBe("generic_local_service");
    expect(rowB.version).toBe(1);
  });

  it("[db] ARCHETYPE_CHANGE_PRESERVES_EVIDENCE: existing evidence for the changed business is untouched", async () => {
    const workspaceId = ws();
    const business = await createBusiness(
      { name: "Evidence Business", businessType: "laundry_local_service", currency: "INR" },
      actor, workspaceId,
    );

    const snapshot = await createSnapshot(
      business.id,
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", revenue: 100000, totalCosts: 60000 } as any,
      actor, workspaceId,
    );

    const input = businessUpdateSchema.parse({ businessType: "field_mobile_service" });
    await updateBusiness(business.id, input, actor, workspaceId);

    const snapshotAfter = await db.ownerMetricSnapshot.findUnique({ where: { id: (snapshot as any).id } });
    expect(snapshotAfter).not.toBeNull();
    expect(Number(snapshotAfter!.revenue)).toBe(100000);
    expect(Number(snapshotAfter!.totalCosts)).toBe(60000);
  });

  it("[db] BUSINESS_TYPE_CHANGE_AUDIT: exactly one OWNER_BUSINESS_UPDATED event with before/after values", async () => {
    const workspaceId = ws();
    const business = await createBusiness(
      { name: "Audit Business", businessType: "retail_service_hybrid", currency: "INR" },
      actor, workspaceId,
    );

    const before = await db.auditEvent.count({
      where: { workspaceId, entityId: business.id, eventName: AUDIT_EVENTS.OWNER_BUSINESS_UPDATED },
    });
    expect(before).toBe(0);

    const input = businessUpdateSchema.parse({ businessType: "retail_storefront" });
    await updateBusiness(business.id, input, actor, workspaceId);

    const events = await db.auditEvent.findMany({
      where: { workspaceId, entityId: business.id, eventName: AUDIT_EVENTS.OWNER_BUSINESS_UPDATED },
    });
    expect(events).toHaveLength(1);

    const payload = events[0].payload as any;
    expect(payload.businessTypeChange).toEqual({
      field: "businessType",
      from: "retail_service_hybrid",
      to: "retail_storefront",
    });
  });

  it("[db] updating a field OTHER than businessType does not record a businessTypeChange payload", async () => {
    const workspaceId = ws();
    const business = await createBusiness(
      { name: "Name-Only Business", businessType: "generic_local_service", currency: "INR" },
      actor, workspaceId,
    );

    const input = businessUpdateSchema.parse({ name: "Renamed Business" });
    await updateBusiness(business.id, input, actor, workspaceId);

    const events = await db.auditEvent.findMany({
      where: { workspaceId, entityId: business.id, eventName: AUDIT_EVENTS.OWNER_BUSINESS_UPDATED },
    });
    expect(events).toHaveLength(1);
    const payload = events[0].payload as any;
    expect(payload.businessTypeChange).toBeUndefined();

    const row = await getBusiness(business.id, workspaceId);
    expect(row.businessType).toBe("generic_local_service");
  });

  it("[db] AUTOMATIC_DIAGNOSIS_MUTATIONS = 0: a businessType change creates zero reassessment/recovery cycles", async () => {
    const workspaceId = ws();
    const business = await createBusiness(
      { name: "No Auto Diagnosis Business", businessType: "generic_local_service", currency: "INR" },
      actor, workspaceId,
    );

    const cyclesBefore = await db.recoveryCycle.count({ where: { businessId: business.id } });
    const reassessmentsBefore = await db.ownerReassessmentEvent.count({ where: { workspaceId } });
    expect(cyclesBefore).toBe(0);
    expect(reassessmentsBefore).toBe(0);

    const input = businessUpdateSchema.parse({ businessType: "appointment_capacity_service" });
    await updateBusiness(business.id, input, actor, workspaceId);

    const cyclesAfter = await db.recoveryCycle.count({ where: { businessId: business.id } });
    const reassessmentsAfter = await db.ownerReassessmentEvent.count({ where: { workspaceId } });
    expect(cyclesAfter).toBe(0);
    expect(reassessmentsAfter).toBe(0);
  });

  it("[db] rejects an unrecognized businessType value at the validation boundary (API_UNKNOWN_BUSINESS_TYPE = REJECT)", () => {
    const result = businessUpdateSchema.safeParse({ businessType: "not_a_real_archetype" });
    expect(result.success).toBe(false);
  });
});
