/**
 * GAP-DB-01 — `[db]`-gated proof that the owner diagnosis/input/recommendation/decision/
 * harm lifecycle block (migration 20260628200000) is created and matches the Prisma models.
 *
 * These ~28 models were declared in schema.prisma but never migrated; in particular
 * `owner_input_quality_assessments` is read at runtime by the recommendation promotion gate
 * (enforceInputQualityForPromotion), so the missing table was an active runtime bug. This
 * test runs only under TEST_WITH_DB=true against a real PostgreSQL with all migrations
 * applied. It (1) proves the representative tables exist (count() would throw on a missing
 * relation) and (2) round-trips a real write/read on the active table, proving its columns
 * match the model and that reads are workspace-isolated.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/owner-diagnosis-lifecycle.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

const ws = randomUUID();
const otherWs = randomUUID();

beforeAll(async () => {
  await db.clientAccount.create({ data: { id: ws, name: `diag-db-${ws}`, updatedAt: new Date() } });
  await db.clientAccount.create({ data: { id: otherWs, name: `diag-db-${otherWs}`, updatedAt: new Date() } });
});

describe("[db] owner diagnosis/decision/harm lifecycle migration", () => {
  it("[db] the previously-unmigrated block tables now exist (count() does not throw)", async () => {
    // A missing relation makes Prisma throw P2021; reaching a number proves the table exists.
    await expect(db.ownerInputRecord.count()).resolves.toBeTypeOf("number");
    await expect(db.ownerInputQualityAssessment.count()).resolves.toBeTypeOf("number");
    await expect(db.ownerRecommendation.count()).resolves.toBeTypeOf("number");
    await expect(db.ownerDecision.count()).resolves.toBeTypeOf("number");
    await expect(db.ownerHarmEvent.count()).resolves.toBeTypeOf("number");
    await expect(db.ownerBenefit.count()).resolves.toBeTypeOf("number");
    await expect(db.ownerCausalAttribution.count()).resolves.toBeTypeOf("number");
  });

  it("[db] owner_input_quality_assessments round-trips and is workspace-isolated", async () => {
    const inputRecordId = randomUUID();
    await db.ownerInputRecord.create({
      data: {
        id: inputRecordId,
        workspaceId: ws,
        submittedBy: randomUUID(),
        inputPeriod: "2026-06",
        sourceType: "manual",
        rawJson: { revenue: 1000 },
        hashChecksum: "abc123",
        updatedAt: new Date(),
      },
    });

    const assessmentId = randomUUID();
    await db.ownerInputQualityAssessment.create({
      data: {
        id: assessmentId,
        workspaceId: ws,
        inputRecordId,
        qualityStatus: "partial",
        overallScore: 62,
        missingFields: ["cogs"],
        conflictFlags: [],
        staleFields: [],
        assessedBy: "InputQualityService",
      },
    });

    // The exact read the promotion gate performs (latest by workspace).
    const latest = await db.ownerInputQualityAssessment.findFirst({
      where: { workspaceId: ws },
      orderBy: { assessedAt: "desc" },
    });
    expect(latest?.qualityStatus).toBe("partial");
    expect(latest?.overallScore).toBe(62);

    // Workspace isolation: another workspace sees none of it.
    const isolated = await db.ownerInputQualityAssessment.findFirst({ where: { workspaceId: otherWs } });
    expect(isolated).toBeNull();
  });
});
