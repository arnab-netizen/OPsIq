/**
 * Owner Intake (Module 10 Slice 3) — service-layer persistence proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * the Module 10 data-intake migration applied. Proves: a valid CSV persists a
 * normalized candidate (ownerConfirmed false) that the owner can confirm; an
 * invalid CSV persists but cannot be confirmed; workspace isolation; duplicate
 * confirm rejected.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-intake/services.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import {
  createDataIntake,
  getDataIntake,
  confirmDataIntake,
  listDataIntakes,
} from "@/services/owner-intake/intake.service";
import type { IntakeUploadInput } from "@/domain/owner-intake";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `intake-test-${actor}@example.com`, name: "Intake Test", isActive: true, updatedAt: new Date() },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Intake Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

const validUpload: IntakeUploadInput = {
  source: "csv_upload",
  targetDomain: "finance",
  csvText: "Period Start,Period End,Currency,Revenue,Fixed Costs\n2026-05-01,2026-05-31,INR,100000,40000",
};
const invalidUpload: IntakeUploadInput = {
  source: "csv_upload",
  targetDomain: "finance",
  csvText: "Period Start,Period End,Currency,Revenue\n2026-05-01,2026-05-31,INR,oops", // revenue not a number
};

describe("[db] Owner Intake service", () => {
  it("[db] persists a valid candidate (unconfirmed) and the owner can confirm it", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const intake = await createDataIntake(businessId, validUpload, actor, workspaceId);
    expect(intake.validationStatus).toBe("valid");
    expect(intake.ownerConfirmed).toBe(false);

    const list = await listDataIntakes(businessId, workspaceId);
    expect(list.length).toBe(1);

    const confirmed = await confirmDataIntake(intake.id, actor, workspaceId);
    expect(confirmed.ownerConfirmed).toBe(true);
    expect(confirmed.confirmedAt).toBeTruthy();

    await expect(confirmDataIntake(intake.id, actor, workspaceId)).rejects.toThrow(/already/i);

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });

  it("[db] persists an invalid candidate that cannot be confirmed", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const intake = await createDataIntake(businessId, invalidUpload, actor, workspaceId);
    expect(intake.validationStatus).toBe("invalid");
    expect(intake.ownerConfirmed).toBe(false);

    await expect(confirmDataIntake(intake.id, actor, workspaceId)).rejects.toThrow(/cannot be confirmed/i);

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });

  it("[db] enforces workspace isolation (cross-workspace read is NotFound)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const intake = await createDataIntake(businessId, validUpload, actor, workspaceId);

    await expect(getDataIntake(intake.id, ws())).rejects.toThrow();

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });
});
