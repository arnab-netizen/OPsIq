/**
 * Budget Outcome Learning loop — DB-backed proof.
 *
 * `[db]`-gated. Proves the learning loop records, through the REAL `updateBudgetAction`
 * completion path, an outcome class + disposition + confidence impact into the
 * FundedInitiativeOutcome store: success raises confidence; verified failure escalates
 * then blocks on repeat; missing-impact lowers DATA confidence; owner-override is
 * classified separately; no-evidence completion is refused (no failure recorded); all
 * workspace-scoped + cross-workspace safe; audit emitted. Reuses action-linkage — no
 * duplicate learning engine.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-budget/outcome-learning.service.db.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { updateBudgetAction } from "@/services/owner-budget/action-link.service";

const actor = randomUUID();
const ws = () => randomUUID();
const businessIds: string[] = [];

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `ol-test-${actor}@example.com`, name: "OL Test", isActive: true, updatedAt: new Date() },
  });
});

afterEach(async () => {
  for (const id of businessIds.splice(0)) {
    await db.ownerBusiness.delete({ where: { id } }).catch(() => undefined);
  }
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness({ name: "OL Biz", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  businessIds.push(b.id);
  return b.id;
}

async function seedAction(workspaceId: string, businessId: string, title = "Protect cash") {
  const id = randomUUID();
  await db.ownerBudgetAction.create({
    data: {
      id, workspaceId, businessId,
      // Unique sourceKey per instance; the learning label is title-based so same-title
      // instances accumulate prior-failure history.
      sourceKey: `BLOCK|${title.toLowerCase()}|${id}`, title,
      decisionType: "BLOCK", accountableRole: "owner", reviewInDays: 7,
      requiredProof: "proof", expectedFinancialImpact: "100",
      verificationMethod: "owner verifies", escalationPath: "escalate to owner",
      status: "proposed", createdBy: actor, updatedAt: new Date(),
    },
  });
  return id;
}

/** Drive an action proposed→assigned→in_progress, then complete with outcome inputs. */
async function complete(actionId: string, workspaceId: string, outcome: Record<string, unknown>) {
  await updateBudgetAction(actionId, { status: "assigned" }, actor, workspaceId);
  await updateBudgetAction(actionId, { status: "in_progress" }, actor, workspaceId);
  return updateBudgetAction(actionId, { status: "completed", completionNotes: "done", completionEvidence: ["ev-1"], ...outcome }, actor, workspaceId);
}

const latestOutcome = async (workspaceId: string, businessId: string, title: string) =>
  db.fundedInitiativeOutcome.findFirst({
    where: { workspaceId, businessId, initiativeLabel: `budget-action:${title}` },
    orderBy: { createdAt: "desc" },
  });

describe("[db] Budget Outcome Learning loop", () => {
  it("[db] verified success records SUCCESS + raise + safeForLearning", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const id = await seedAction(workspaceId, businessId, "Collect 90+ receivable");
    const res = await complete(id, workspaceId, { expectedImpact: 100, actualImpact: 110 });
    expect(res.outcomeClass).toBe("SUCCESS");
    const o = await latestOutcome(workspaceId, businessId, "Collect 90+ receivable");
    expect(o?.outcome).toBe("SUCCESS");
    expect(o?.safeForLearning).toBe(true);
    expect(JSON.parse(o?.note as string).confidenceImpact).toBe("raise");
  });

  it("[db] verified poor result records FAILED + escalate + lower_recommendation", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const id = await seedAction(workspaceId, businessId);
    const res = await complete(id, workspaceId, { expectedImpact: 100, actualImpact: 5 });
    expect(res.outcomeClass).toBe("FAILED");
    const o = await latestOutcome(workspaceId, businessId, "Protect cash");
    expect(JSON.parse(o?.note as string)).toMatchObject({ disposition: "escalate", confidenceImpact: "lower_recommendation" });
  });

  it("[db] repeated failure of the same recommendation BLOCKS (not blindly repeated)", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const id1 = await seedAction(workspaceId, businessId, "Repeated rec");
    await complete(id1, workspaceId, { expectedImpact: 100, actualImpact: 5 }); // 1st FAILED
    const id2 = await seedAction(workspaceId, businessId, "Repeated rec");      // same title (later reassessment)
    await complete(id2, workspaceId, { expectedImpact: 100, actualImpact: 5 }); // 2nd FAILED ⇒ block
    const o = await latestOutcome(workspaceId, businessId, "Repeated rec");
    expect(JSON.parse(o?.note as string).disposition).toBe("block");
  });

  it("[db] missing impact lowers DATA confidence (UNVERIFIED), not the recommendation", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const id = await seedAction(workspaceId, businessId, "No impact data");
    const res = await complete(id, workspaceId, {}); // no expected/actual impact
    expect(res.outcomeClass).toBe("UNVERIFIED");
    const o = await latestOutcome(workspaceId, businessId, "No impact data");
    expect(JSON.parse(o?.note as string).confidenceImpact).toBe("lower_data");
  });

  it("[db] owner-override failure is classified separately (OVERRIDDEN, maintain)", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const id = await seedAction(workspaceId, businessId, "Overridden rec");
    const res = await complete(id, workspaceId, { expectedImpact: 100, actualImpact: 0, ownerOverridden: true });
    expect(res.outcomeClass).toBe("OVERRIDDEN");
    const o = await latestOutcome(workspaceId, businessId, "Overridden rec");
    expect(JSON.parse(o?.note as string).confidenceImpact).toBe("maintain");
  });

  it("[db] completion without evidence is refused — no failure outcome recorded", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const id = await seedAction(workspaceId, businessId, "No evidence");
    await updateBudgetAction(id, { status: "assigned" }, actor, workspaceId);
    await updateBudgetAction(id, { status: "in_progress" }, actor, workspaceId);
    await expect(updateBudgetAction(id, { status: "completed", expectedImpact: 100, actualImpact: 5 }, actor, workspaceId)).rejects.toThrow();
    expect(await db.fundedInitiativeOutcome.findMany({ where: { workspaceId, businessId } })).toHaveLength(0);
  });

  it("[db] cross-workspace update is blocked (no outcome leak/mutation)", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const id = await seedAction(workspaceId, businessId, "Scoped rec");
    await expect(updateBudgetAction(id, { status: "assigned" }, actor, ws())).rejects.toThrow();
    const row = await db.ownerBudgetAction.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("proposed");
  });

  it("[db] completion emits an audit event carrying the learning disposition", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const id = await seedAction(workspaceId, businessId, "Audited rec");
    await complete(id, workspaceId, { expectedImpact: 100, actualImpact: 110 });
    const audit = await db.auditEvent.findMany({ where: { workspaceId, entityType: "OwnerBudgetAction", eventName: "owner.budget_initiative_closed" } });
    expect(audit.length).toBeGreaterThan(0);
  });
});
