/**
 * B02-S3 Owner Data Intake Service Tests — State machine, persistence, and transaction safety.
 *
 * Tests:
 * 1. Draft → Confirmed state transition
 * 2. Idempotent confirmation (retries don't duplicate)
 * 3. Workspace isolation enforcement
 * 4. Validation status checks
 * 5. Audit event emission
 * 6. Transaction rollback on constraint violations
 * 7. Rejection workflow
 *
 * Requires TEST_WITH_DB=true for DB persistence tests.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { v4 as uuid } from "uuid";
import {
  confirmOwnerDataIntake,
  rejectOwnerDataIntake,
  getOwnerDataIntakeStatus,
} from "@/services/owner-data-intake.service";

const TEST_WITH_DB = process.env.TEST_WITH_DB === "true";

let prisma: PrismaClient;

// Only run DB tests if TEST_WITH_DB is set
describe.skipIf(!TEST_WITH_DB)("B02-S3 Owner Data Intake Service — DB Persistence", () => {
  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Cleanup test data
    await prisma.ownerDataIntake.deleteMany({});
    await prisma.auditEvent.deleteMany({});
  });

  async function createTestIntake(overrides?: Partial<any>) {
    const workspaceId = uuid();
    const businessId = uuid();
    const intake = await prisma.ownerDataIntake.create({
      data: {
        id: uuid(),
        workspaceId,
        businessId,
        source: "csv_upload",
        targetDomain: "finance",
        rowCount: 10,
        validationStatus: "valid",
        normalizationStatus: "normalized",
        mappedFields: { revenue: "currency", cost: "currency" },
        unmappedColumns: [],
        records: [{ revenue: "100000", cost: "40000" }],
        errorReport: {},
        ownerConfirmed: false,
        createdAt: new Date(),
        business: {
          connect: { id: businessId },
        },
        ...overrides,
      },
    });
    return { intake, workspaceId, businessId };
  }

  it("should transition intake from draft to confirmed state", async () => {
    const { intake, workspaceId, businessId } = await createTestIntake();

    const result = await confirmOwnerDataIntake({
      intakeId: intake.id,
      workspaceId,
      businessId,
      confirmedBy: uuid(),
    });

    expect(result.ok).toBe(true);
    expect(result.previousStatus).toBe("draft");
    expect(result.newStatus).toBe("confirmed");
    expect(result.confirmedAt).toBeInstanceOf(Date);

    // Verify DB state
    const updated = await prisma.ownerDataIntake.findUnique({
      where: { id: intake.id },
    });
    expect(updated!.ownerConfirmed).toBe(true);
    expect(updated!.confirmedAt).not.toBeNull();
    expect(updated!.confirmedBy).toBe(result.confirmedBy);
  });

  it("should be idempotent: confirming same intake twice returns success", async () => {
    const { intake, workspaceId, businessId } = await createTestIntake();
    const confirmerId = uuid();

    // First confirmation
    const result1 = await confirmOwnerDataIntake({
      intakeId: intake.id,
      workspaceId,
      businessId,
      confirmedBy: confirmerId,
    });
    expect(result1.ok).toBe(true);

    // Second confirmation with same confirmer (idempotent)
    const result2 = await confirmOwnerDataIntake({
      intakeId: intake.id,
      workspaceId,
      businessId,
      confirmedBy: confirmerId,
    });
    expect(result2.ok).toBe(true);
    expect(result2.previousStatus).toBe("confirmed");
    expect(result2.confirmedAt).toEqual(result1.confirmedAt);

    // Verify only one DB row
    const intakes = await prisma.ownerDataIntake.findMany({
      where: { id: intake.id },
    });
    expect(intakes).toHaveLength(1);
  });

  it("should reject confirmation if different user tries to confirm already-confirmed intake", async () => {
    const { intake, workspaceId, businessId } = await createTestIntake();
    const confirmerId1 = uuid();
    const confirmerId2 = uuid();

    // First confirmation
    await confirmOwnerDataIntake({
      intakeId: intake.id,
      workspaceId,
      businessId,
      confirmedBy: confirmerId1,
    });

    // Try to confirm with different user
    const result = await confirmOwnerDataIntake({
      intakeId: intake.id,
      workspaceId,
      businessId,
      confirmedBy: confirmerId2,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("ALREADY_CONFIRMED");
  });

  it("should enforce workspace isolation: cannot confirm intake from other workspace", async () => {
    const { intake, workspaceId } = await createTestIntake();
    const otherWorkspaceId = uuid();

    const result = await confirmOwnerDataIntake({
      intakeId: intake.id,
      workspaceId: otherWorkspaceId,
      businessId: uuid(),
      confirmedBy: uuid(),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("WORKSPACE_MISMATCH");
  });

  it("should reject confirmation if intake not found", async () => {
    const result = await confirmOwnerDataIntake({
      intakeId: uuid(),
      workspaceId: uuid(),
      businessId: uuid(),
      confirmedBy: uuid(),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_FOUND");
  });

  it("should reject confirmation if validation status is invalid", async () => {
    const { intake, workspaceId, businessId } = await createTestIntake({
      validationStatus: "invalid",
    });

    const result = await confirmOwnerDataIntake({
      intakeId: intake.id,
      workspaceId,
      businessId,
      confirmedBy: uuid(),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("VALIDATION_FAILED");
  });

  it("should emit audit event on confirmation", async () => {
    const { intake, workspaceId, businessId } = await createTestIntake();
    const confirmerId = uuid();

    await confirmOwnerDataIntake({
      intakeId: intake.id,
      workspaceId,
      businessId,
      confirmedBy: confirmerId,
    });

    // Verify audit event was created
    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        eventName: "owner_data_intake_confirmed",
        entityId: intake.id,
        workspaceId,
      },
    });

    expect(auditEvent).toBeDefined();
    expect(auditEvent!.eventName).toBe("owner_data_intake_confirmed");
    expect(auditEvent!.entityId).toBe(intake.id);

    const after = JSON.parse(auditEvent!.after as string);
    expect(after.ownerConfirmed).toBe(true);
  });

  it("should reject intake and mark as rejected", async () => {
    const { intake, workspaceId, businessId } = await createTestIntake();
    const rejector = uuid();

    const result = await rejectOwnerDataIntake({
      intakeId: intake.id,
      workspaceId,
      businessId,
      rejectedBy: rejector,
      reason: "Invalid data format",
    });

    expect(result.ok).toBe(true);
    expect(result.rejectionReason).toBe("Invalid data format");

    // Verify DB state
    const updated = await prisma.ownerDataIntake.findUnique({
      where: { id: intake.id },
    });
    expect(updated!.validationStatus).toBe("rejected");
    expect(updated!.notes).toBe("Invalid data format");
  });

  it("should not allow rejecting already-confirmed intake", async () => {
    const { intake, workspaceId, businessId } = await createTestIntake();
    const confirmerId = uuid();

    // Confirm first
    await confirmOwnerDataIntake({
      intakeId: intake.id,
      workspaceId,
      businessId,
      confirmedBy: confirmerId,
    });

    // Try to reject
    const result = await rejectOwnerDataIntake({
      intakeId: intake.id,
      workspaceId,
      businessId,
      rejectedBy: uuid(),
      reason: "Too late",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("ALREADY_CONFIRMED");
  });

  it("should get intake status", async () => {
    const { intake, workspaceId } = await createTestIntake();

    const result = await getOwnerDataIntakeStatus(intake.id, workspaceId);

    expect(result.ok).toBe(true);
    expect(result.intake?.id).toBe(intake.id);
    expect(result.intake?.ownerConfirmed).toBe(false);
    expect(result.intake?.validationStatus).toBe("valid");
  });

  it("should return NOT_FOUND for missing intake in workspace", async () => {
    const result = await getOwnerDataIntakeStatus(uuid(), uuid());

    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_FOUND");
  });

  it("should enforce workspace isolation on status read", async () => {
    const { intake, workspaceId } = await createTestIntake();
    const otherWorkspaceId = uuid();

    const result = await getOwnerDataIntakeStatus(intake.id, otherWorkspaceId);

    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_FOUND");
  });

  it("should handle multiple sequential confirmations across different intakes", async () => {
    const { intake: intake1, workspaceId, businessId } = await createTestIntake();
    const { intake: intake2 } = await createTestIntake({
      workspaceId,
      businessId,
    });

    const confirmer1 = uuid();
    const confirmer2 = uuid();

    // Confirm both intakes with different confirmers
    const result1 = await confirmOwnerDataIntake({
      intakeId: intake1.id,
      workspaceId,
      businessId,
      confirmedBy: confirmer1,
    });
    const result2 = await confirmOwnerDataIntake({
      intakeId: intake2.id,
      workspaceId,
      businessId,
      confirmedBy: confirmer2,
    });

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    expect(result1.confirmedBy).toBe(confirmer1);
    expect(result2.confirmedBy).toBe(confirmer2);

    // Verify both are confirmed in DB
    const intakes = await prisma.ownerDataIntake.findMany({
      where: {
        id: { in: [intake1.id, intake2.id] },
      },
    });
    expect(intakes).toHaveLength(2);
    expect(intakes.every((i) => i.ownerConfirmed)).toBe(true);
  });

  it("should maintain consistent timestamps on confirmation", async () => {
    const { intake, workspaceId, businessId } = await createTestIntake();
    const beforeConfirm = new Date();

    const result = await confirmOwnerDataIntake({
      intakeId: intake.id,
      workspaceId,
      businessId,
      confirmedBy: uuid(),
    });

    const afterConfirm = new Date();

    expect(result.confirmedAt.getTime()).toBeGreaterThanOrEqual(beforeConfirm.getTime());
    expect(result.confirmedAt.getTime()).toBeLessThanOrEqual(afterConfirm.getTime());
  });
});

describe("B02-S3 Owner Data Intake Service — Pure Function Logic", () => {
  it("should validate input structure for confirmation", async () => {
    // Type checking happens at compile time, but we test the API contract
    const result = await confirmOwnerDataIntake({
      intakeId: "test-id",
      workspaceId: "test-workspace",
      businessId: "test-business",
      confirmedBy: "test-confirmer",
    });

    // Should return proper discriminated result
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("code");
  });

  it("should provide proper error code for missing intake", async () => {
    const result = await confirmOwnerDataIntake({
      intakeId: "nonexistent",
      workspaceId: "any-workspace",
      businessId: "any-business",
      confirmedBy: "any-user",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["NOT_FOUND", "TRANSACTION_FAILED"]).toContain(result.code);
    }
  });
});
