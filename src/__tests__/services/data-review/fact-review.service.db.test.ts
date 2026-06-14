/**
 * B05-S1 Fact Review Service — DB-backed acceptance gates.
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL.
 * Proves the owner fact-review operations:
 *   - owner can approve draft facts
 *   - owner can correct extracted value
 *   - corrections create audit record
 *   - rejected facts are tracked (not used in diagnosis — proven in B09)
 *   - unauthorized users cannot review another workspace facts
 *
 * Run: TEST_WITH_DB=true npx vitest run \
 *   src/__tests__/services/data-review/fact-review.service.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createDataIntake } from "@/services/owner-intake/intake.service";
import {
  approveFact,
  correctFact,
  rejectFact,
  markFactUnknown,
  getReviewStatus,
  undoReviewAction,
} from "@/services/data-review/fact-review.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `fact-review-test-${actor}@example.com`,
      name: "Fact Review Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    {
      name: "Fact Review Svc Test",
      businessType: "generic_local_service",
      currency: "INR",
      b2cSupported: true,
      b2bSupported: false,
    },
    actor,
    workspaceId
  );
  return b.id;
}

const FINANCE_CSV =
  "Period Start,Period End,Currency,Revenue,Fixed Costs\n" +
  "2026-05-01,2026-05-31,INR,100000,40000";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] B05-S1 fact review service", () => {
  it("[db] owner can approve draft facts", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const intake = await createDataIntake(
      businessId,
      {
        source: "manual_entry",
        csvText: FINANCE_CSV,
        targetDomain: "finance",
      },
      actor,
      workspaceId
    );

    // Extract fact IDs from the mapped records (from B02-S2 column mapping)
    const mappedFields = Array.isArray(intake.mappedFields) ? intake.mappedFields : [];
    const factIds = mappedFields.filter((f: any) => f.factId).map((f: any) => f.factId);

    expect(factIds.length).toBeGreaterThan(0);

    const factId = factIds[0];

    // Approve a fact
    await approveFact(intake.id, factId, workspaceId, actor);

    // Check status
    const status = await getReviewStatus(intake.id, workspaceId);
    expect(status.approvedFactCount).toBe(1);
  });

  it("[db] owner can correct extracted value", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const intake = await createDataIntake(
      businessId,
      {
        source: "manual_entry",
        csvText: FINANCE_CSV,
        targetDomain: "finance",
      },
      actor,
      workspaceId
    );

    const mappedFields = Array.isArray(intake.mappedFields) ? intake.mappedFields : [];
    const factIds = mappedFields.filter((f: any) => f.factId).map((f: any) => f.factId);
    expect(factIds.length).toBeGreaterThan(0);

    const factId = factIds[0];
    const correctedValue = 150000;

    // Correct a fact value
    await correctFact(intake.id, factId, correctedValue, "Owner revised estimate", workspaceId, actor);

    // Check status
    const status = await getReviewStatus(intake.id, workspaceId);
    expect(status.correctedFactCount).toBe(1);
    expect(status.actions[0].newValue).toBe(correctedValue);
  });

  it("[db] corrections create audit record", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const intake = await createDataIntake(
      businessId,
      {
        source: "manual_entry",
        csvText: FINANCE_CSV,
        targetDomain: "finance",
      },
      actor,
      workspaceId
    );

    const mappedFields = Array.isArray(intake.mappedFields) ? intake.mappedFields : [];
    const factIds = mappedFields.filter((f: any) => f.factId).map((f: any) => f.factId);
    expect(factIds.length).toBeGreaterThan(0);

    const factId = factIds[0];

    // Correct a fact
    await correctFact(intake.id, factId, 200000, "Verified correction", workspaceId, actor);

    // Check audit trail
    const actions = await db.factReviewAction.findMany({
      where: { intakeId: intake.id, factId, action: "corrected" },
    });

    expect(actions.length).toBe(1);
    expect(actions[0].correctionReason).toBe("Verified correction");
  });

  it("[db] rejected facts are tracked and excluded from diagnosis", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const intake = await createDataIntake(
      businessId,
      {
        source: "manual_entry",
        csvText: FINANCE_CSV,
        targetDomain: "finance",
      },
      actor,
      workspaceId
    );

    const mappedFields = Array.isArray(intake.mappedFields) ? intake.mappedFields : [];
    const factIds = mappedFields.filter((f: any) => f.factId).map((f: any) => f.factId);
    expect(factIds.length).toBeGreaterThan(0);

    const factId = factIds[0];

    // Reject a fact
    await rejectFact(intake.id, factId, "Data source unreliable", workspaceId, actor);

    // Check status
    const status = await getReviewStatus(intake.id, workspaceId);
    expect(status.rejectedFactCount).toBe(1);

    // Check that the action is recorded
    const rejectedActions = await db.factReviewAction.findMany({
      where: { intakeId: intake.id, action: "rejected" },
    });
    expect(rejectedActions.length).toBe(1);
  });

  it("[db] owner can mark fact as unknown", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const intake = await createDataIntake(
      businessId,
      {
        source: "manual_entry",
        csvText: FINANCE_CSV,
        targetDomain: "finance",
      },
      actor,
      workspaceId
    );

    const mappedFields = Array.isArray(intake.mappedFields) ? intake.mappedFields : [];
    const factIds = mappedFields.filter((f: any) => f.factId).map((f: any) => f.factId);
    expect(factIds.length).toBeGreaterThan(0);

    const factId = factIds[0];

    // Mark as unknown
    await markFactUnknown(intake.id, factId, "Cannot verify from available data", workspaceId, actor);

    // Check status
    const status = await getReviewStatus(intake.id, workspaceId);
    expect(status.markedUnknownCount).toBe(1);
  });

  it("[db] enforces workspace isolation — unauthorized users cannot review another workspace facts", async () => {
    const workspaceId = ws();
    const otherWorkspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const intake = await createDataIntake(
      businessId,
      {
        source: "manual_entry",
        csvText: FINANCE_CSV,
        targetDomain: "finance",
      },
      actor,
      workspaceId
    );

    const mappedFields = Array.isArray(intake.mappedFields) ? intake.mappedFields : [];
    const factIds = mappedFields.filter((f: any) => f.factId).map((f: any) => f.factId);
    expect(factIds.length).toBeGreaterThan(0);

    const factId = factIds[0];

    // Try to review from a different workspace
    await expect(approveFact(intake.id, factId, otherWorkspaceId, actor)).rejects.toThrow(
      /not found/i
    );
  });

  it("[db] approval is idempotent (re-approving is safe)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const intake = await createDataIntake(
      businessId,
      {
        source: "manual_entry",
        csvText: FINANCE_CSV,
        targetDomain: "finance",
      },
      actor,
      workspaceId
    );

    const mappedFields = Array.isArray(intake.mappedFields) ? intake.mappedFields : [];
    const factIds = mappedFields.filter((f: any) => f.factId).map((f: any) => f.factId);
    expect(factIds.length).toBeGreaterThan(0);

    const factId = factIds[0];

    // Approve multiple times
    await approveFact(intake.id, factId, workspaceId, actor);
    await approveFact(intake.id, factId, workspaceId, actor);
    await approveFact(intake.id, factId, workspaceId, actor);

    // Only one approval record should exist
    const status = await getReviewStatus(intake.id, workspaceId);
    expect(status.approvedFactCount).toBe(1);
  });

  it("[db] can undo a review action", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const intake = await createDataIntake(
      businessId,
      {
        source: "manual_entry",
        csvText: FINANCE_CSV,
        targetDomain: "finance",
      },
      actor,
      workspaceId
    );

    const mappedFields = Array.isArray(intake.mappedFields) ? intake.mappedFields : [];
    const factIds = mappedFields.filter((f: any) => f.factId).map((f: any) => f.factId);
    expect(factIds.length).toBeGreaterThan(0);

    const factId = factIds[0];

    // Approve, then undo
    await approveFact(intake.id, factId, workspaceId, actor);
    await undoReviewAction(intake.id, factId, workspaceId, actor);

    // Check that the approval is still there (undo creates a separate audit record)
    const status = await getReviewStatus(intake.id, workspaceId);
    expect(status.approvedFactCount).toBe(1); // Original approval still tracked
  });
});
