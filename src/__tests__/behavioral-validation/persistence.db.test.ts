/**
 * [db]-gated proof that learning artifacts persist in Postgres and are read back across store
 * instances (true persistence, not just an in-memory map). Also re-checks privacy + versioning at
 * the database layer. Requires TEST_WITH_DB=true with the migration applied + prisma generated.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { PrismaLearningStore } from "@/behavioral-validation/learning-store";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { LearningArtifact } from "@/behavioral-validation/schema";

const AT = "2026-06-29T00:00:00Z";
const ID = "persisted-case::v1";

function artifact(): LearningArtifact {
  return {
    id: ID, sourceCaseId: "persisted-case", businessType: "laundry", archetype: "laundry_dry_cleaning",
    locationKey: "India|tier1", failureLabel: "bad_cash_advice", originalFailedBehavior: "spent in crisis",
    correctedBehavior: "block discretionary spend until margin proof",
    applicabilityScope: { archetype: "laundry_dry_cleaning", decisionCategory: "cash_margin_working_capital", locationKey: null },
    riskLevel: "high", approvalStatus: "pending", scope: "local_only", privacyClassification: "workspace_private",
    workspaceId: "ws-db-1", version: 1, supersededByVersion: null, active: true, createdAt: AT,
    auditTrail: [{ at: AT, actor: "trainer", action: "created" }],
  };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] persistent learning store", () => {
  const model = () => (db as unknown as { behavioralLearningArtifact: { deleteMany: (a: unknown) => Promise<unknown> } }).behavioralLearningArtifact;

  beforeAll(async () => {
    await model().deleteMany({ where: { sourceCaseId: "persisted-case" } });
  });
  afterAll(async () => {
    await model().deleteMany({ where: { sourceCaseId: "persisted-case" } });
  });

  it("[db] persists and reads back through a fresh store instance", async () => {
    const writer = new PrismaLearningStore(db as never);
    await writer.save(artifact());
    const reader = new PrismaLearningStore(db as never); // separate instance — no shared memory
    const got = await reader.getById(ID);
    expect(got?.correctedBehavior).toContain("block discretionary spend");
    expect(got?.auditTrail.length).toBe(1);
  });

  it("[db] enforces workspace privacy in findApplicable", async () => {
    const store = new PrismaLearningStore(db as never);
    await store.save(artifact());
    const mine = await store.findApplicable({ archetype: "laundry_dry_cleaning", decisionCategory: "cash_margin_working_capital", locationKey: "India|tier1", workspaceId: "ws-db-1" });
    const theirs = await store.findApplicable({ archetype: "laundry_dry_cleaning", decisionCategory: "cash_margin_working_capital", locationKey: "India|tier1", workspaceId: "ws-db-2" });
    expect(mine.map((a) => a.id)).toContain(ID);
    expect(theirs.map((a) => a.id)).not.toContain(ID);
  });

  it("[db] supersede + revert persist version history", async () => {
    const store = new PrismaLearningStore(db as never);
    await store.save(artifact());
    const v2 = await store.supersede(ID, "stricter block", "trainer", AT);
    expect(v2.version).toBe(2);
    expect((await store.getById(ID))?.active).toBe(false);
    const restored = await store.revert("persisted-case", "admin", AT);
    expect(restored.version).toBe(1);
    expect(restored.active).toBe(true);
  });
});
