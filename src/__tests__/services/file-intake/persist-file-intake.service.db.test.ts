/**
 * B02-S3 File-Intake Persistence Bridge — DB-backed proof.
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * the Module 10 data-intake migration applied. Proves the B02 safe-file front-door
 * bridges into the PROVEN Module 10 persistence/confirmation flow WITHOUT a second
 * confirmation service:
 *   - a safe CSV file persists an unconfirmed Module 10 candidate, then the
 *     EXISTING `confirmDataIntake` confirms it (and rejects a duplicate confirm);
 *   - a formula-injection file is BLOCKED before any DB write;
 *   - a bad file type is rejected before any DB write;
 *   - an invalid CSV persists (Module 10 authority) but cannot be confirmed.
 *
 * Run: TEST_WITH_DB=true npx vitest run \
 *   src/__tests__/services/file-intake/persist-file-intake.service.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { confirmDataIntake, getDataIntake } from "@/services/owner-intake/intake.service";
import { persistFileIntake } from "@/services/file-intake/persist-file-intake.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `file-intake-test-${actor}@example.com`,
      name: "File Intake Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "File Intake Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

const SAFE_FINANCE_CSV =
  "Period Start,Period End,Currency,Revenue,Fixed Costs\n" +
  "2026-05-01,2026-05-31,INR,100000,40000";

const INVALID_FINANCE_CSV =
  // periodStart is a REQUIRED date; "notadate" breaks it → Module 10 marks invalid.
  "Period Start,Period End,Currency,Revenue\n" +
  "notadate,2026-05-31,INR,100000";

const FORMULA_INJECTION_CSV =
  "Period Start,Period End,Currency,Revenue,Fixed Costs\n" +
  "2026-05-01,2026-05-31,INR,=cmd|'/c calc',40000";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] B02-S3 file-intake persistence bridge", () => {
  it("[db] persists a safe CSV as an unconfirmed Module 10 candidate, then existing confirm flow confirms it", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const result = await persistFileIntake({
      businessId,
      workspaceId,
      actorId: actor,
      targetDomain: "finance",
      filename: "finance.csv",
      fileSizeBytes: SAFE_FINANCE_CSV.length,
      mimeType: "text/csv",
      fileContent: SAFE_FINANCE_CSV,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.intake.validationStatus).toBe("valid");
    expect(result.intake.ownerConfirmed).toBe(false);
    // B02-S2 preview is attached and non-blocking.
    expect(result.mappingPreview?.detected_domain).toBe("finance");

    // The row actually landed in the DB via the Module 10 path.
    const persisted = await getDataIntake(result.intake.id, workspaceId);
    expect(persisted.ownerConfirmed).toBe(false);

    // Confirmation reuses the EXISTING proven flow — no second confirmation service.
    const confirmed = await confirmDataIntake(result.intake.id, actor, workspaceId);
    expect(confirmed.ownerConfirmed).toBe(true);
    expect(confirmed.confirmedAt).toBeTruthy();

    // Duplicate confirm is rejected by the existing flow.
    await expect(confirmDataIntake(result.intake.id, actor, workspaceId)).rejects.toThrow(/already/i);
  });

  it("[db] BLOCKS a formula-injection file before any DB write", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const result = await persistFileIntake({
      businessId,
      workspaceId,
      actorId: actor,
      targetDomain: "finance",
      filename: "tainted.csv",
      fileSizeBytes: FORMULA_INJECTION_CSV.length,
      mimeType: "text/csv",
      fileContent: FORMULA_INJECTION_CSV,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("FORMULA_INJECTION_BLOCKED");
    expect(result.injectionAlerts?.length).toBeGreaterThan(0);

    // Nothing was persisted for this business.
    const intakes = await db.ownerDataIntake.findMany({ where: { businessId, workspaceId } });
    expect(intakes.length).toBe(0);
  });

  it("[db] rejects an unsupported file type before any DB write", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const result = await persistFileIntake({
      businessId,
      workspaceId,
      actorId: actor,
      targetDomain: "finance",
      filename: "notes.txt.exe",
      fileSizeBytes: SAFE_FINANCE_CSV.length,
      mimeType: "application/octet-stream",
      fileContent: SAFE_FINANCE_CSV,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("FILE_VALIDATION_FAILED");

    const intakes = await db.ownerDataIntake.findMany({ where: { businessId, workspaceId } });
    expect(intakes.length).toBe(0);
  });

  it("[db] persists an invalid CSV (Module 10 authority) that cannot be confirmed", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const result = await persistFileIntake({
      businessId,
      workspaceId,
      actorId: actor,
      targetDomain: "finance",
      filename: "broken.csv",
      fileSizeBytes: INVALID_FINANCE_CSV.length,
      mimeType: "text/csv",
      fileContent: INVALID_FINANCE_CSV,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.intake.validationStatus).toBe("invalid");

    // The existing flow refuses to confirm an invalid candidate.
    await expect(confirmDataIntake(result.intake.id, actor, workspaceId)).rejects.toThrow(/cannot be confirmed/i);
  });

  it("[db] enforces workspace isolation via the Module 10 business guard", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    // A different workspace cannot persist against this business (guard throws).
    await expect(
      persistFileIntake({
        businessId,
        workspaceId: ws(),
        actorId: actor,
        targetDomain: "finance",
        filename: "finance.csv",
        fileSizeBytes: SAFE_FINANCE_CSV.length,
        mimeType: "text/csv",
        fileContent: SAFE_FINANCE_CSV,
      })
    ).rejects.toThrow();
  });
});
