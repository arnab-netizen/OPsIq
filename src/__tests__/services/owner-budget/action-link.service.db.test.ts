/**
 * Deep Action-System Linkage service — DB-backed proof.
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against migrated PostgreSQL.
 * Proves: reassessment persists advisory budget actions as real, governed owner
 * execution tasks (15 governed fields); repeated reassessment links the existing
 * OPEN task instead of duplicating it (idempotency); assignment/status is preserved
 * on link; completion drives the shared FSM + records a FundedInitiativeOutcome
 * (budget learning); reads/writes are workspace-scoped and cross-workspace writes
 * are blocked.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-budget/action-link.service.db.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import {
  createBudgetPeriod,
  recordSpendEntry,
  reassessBudget,
} from "@/services/owner-budget/budget.service";
import {
  listBudgetActions,
  updateBudgetAction,
} from "@/services/owner-budget/action-link.service";

const actor = randomUUID();
const ws = () => randomUUID();
const businessIds: string[] = [];

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `budget-action-test-${actor}@example.com`, name: "Budget Action Test", isActive: true, updatedAt: new Date() },
  });
});

afterEach(async () => {
  for (const id of businessIds.splice(0)) {
    await db.ownerBusiness.delete({ where: { id } }).catch(() => undefined);
  }
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Budget Action Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  businessIds.push(b.id);
  return b.id;
}

async function seedHealthyFinance(workspaceId: string, businessId: string) {
  await db.ownerFinancialSnapshot.create({
    data: {
      id: randomUUID(),
      workspaceId, businessId,
      periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"),
      currency: "INR",
      revenue: 500000, costOfGoods: 250000, fixedCosts: 150000, cashOnHand: 400000,
      dataConfidenceScore: 80, missingCriticalData: [],
      updatedAt: new Date(),
    },
  });
}

/** Drive the business into a defensive posture that generates cash-protection actions. */
async function seedEmergencyActions(workspaceId: string, businessId: string) {
  const period = await createBudgetPeriod(
    businessId,
    { label: "May 2026", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000, statutoryReserveRequired: 50000, ownerGoal: "growth" },
    actor, workspaceId
  );
  await recordSpendEntry(
    businessId,
    {
      periodId: period.id, label: "Payroll (committed)", category: "statutory_payroll_tax",
      amount: 420000, state: "committed", obligationKind: "payroll", dueInDays: 5,
      requestedByUserId: actor, ownerApprovalThreshold: 50000,
    },
    actor, workspaceId
  );
  return period.id;
}

describe("[db] Deep Action-System Linkage", () => {
  it("[db] reassessment persists advisory actions as governed execution tasks with the required fields", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await seedEmergencyActions(workspaceId, businessId);

    const tasks = await listBudgetActions(workspaceId, businessId);
    expect(tasks.length).toBeGreaterThan(0);

    const t = tasks[0];
    // Governed-field presence + correctness.
    expect(t.workspaceId).toBe(workspaceId);
    expect(t.businessId).toBe(businessId);
    expect(t.sourceKey).toBeTruthy();
    expect(t.title).toBeTruthy();
    expect(t.decisionType).toBeTruthy();
    expect(t.accountableRole).toBeTruthy();
    expect(t.dueAt).toBeInstanceOf(Date);
    expect(t.requiredProof).toBeTruthy();
    expect(t.verificationMethod).toBeTruthy();
    expect(t.escalationPath).toBeTruthy();
    expect(t.status).toBe("proposed");
    expect(t.reassessmentId).toBeTruthy();
    expect(t.createdBy).toBe(actor);

    // The create emitted an audit event (create/link/update are all audited).
    const audit = await db.auditEvent.findMany({ where: { workspaceId, entityType: "OwnerBudgetAction" } });
    expect(audit.some((e) => e.eventName === "owner.budget_action_created")).toBe(true);
  });

  it("[db] repeated reassessment links the existing OPEN task instead of duplicating it", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await seedEmergencyActions(workspaceId, businessId);

    const before = await db.ownerBudgetAction.findMany({ where: { workspaceId, businessId } });
    expect(before.length).toBeGreaterThan(0);

    // A second, distinct reassessment of the same condition → same generated actions.
    await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "manual_review", triggerEventId: "relink-1" });

    const after = await db.ownerBudgetAction.findMany({ where: { workspaceId, businessId } });
    // No duplicate sourceKeys (the unique invariant): each budget risk = one task.
    const keys = after.map((a) => a.sourceKey);
    expect(new Set(keys).size).toBe(keys.length);
    // Linking produced a link audit event.
    const audit = await db.auditEvent.findMany({ where: { workspaceId, entityType: "OwnerBudgetAction" } });
    expect(audit.some((e) => e.eventName === "owner.budget_action_linked")).toBe(true);
  });

  it("[db] linking preserves owner-set status/assignment on the existing task", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await seedEmergencyActions(workspaceId, businessId);

    const [task] = await listBudgetActions(workspaceId, businessId);
    const assignee = randomUUID();
    await updateBudgetAction(task.id, { status: "assigned", assignedTo: assignee }, actor, workspaceId);

    // Re-run reassessment → the open task is refreshed, not reset.
    await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "manual_review", triggerEventId: "preserve-1" });

    const refreshed = await db.ownerBudgetAction.findFirstOrThrow({ where: { id: task.id } });
    expect(refreshed.status).toBe("assigned");
    expect(refreshed.assignedTo).toBe(assignee);
  });

  it("[db] completing a task drives the shared FSM and records a budget-learning outcome", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await seedEmergencyActions(workspaceId, businessId);

    const [task] = await listBudgetActions(workspaceId, businessId);
    await updateBudgetAction(task.id, { status: "assigned" }, actor, workspaceId);
    await updateBudgetAction(task.id, { status: "in_progress" }, actor, workspaceId);
    const completed = await updateBudgetAction(
      task.id,
      { status: "completed", completionNotes: "Cash freeze enacted; obligations covered", completionEvidence: ["bank-statement-2026-05-31"] },
      actor, workspaceId
    );

    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeInstanceOf(Date);
    expect(completed.outcomeClass).toBeTruthy();

    // Budget learning store received the outcome (same store Slice 4 uses).
    const outcomes = await db.fundedInitiativeOutcome.findMany({ where: { workspaceId, businessId } });
    expect(outcomes.some((o) => o.initiativeLabel === `budget-action:${task.title}`)).toBe(true);
  });

  it("[db] completion is refused without evidence (shared FSM evidence rule)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await seedEmergencyActions(workspaceId, businessId);

    const [task] = await listBudgetActions(workspaceId, businessId);
    await updateBudgetAction(task.id, { status: "assigned" }, actor, workspaceId);
    await updateBudgetAction(task.id, { status: "in_progress" }, actor, workspaceId);
    await expect(
      updateBudgetAction(task.id, { status: "completed" }, actor, workspaceId)
    ).rejects.toThrow();
  });

  it("[db] illegal transitions are rejected by the shared FSM", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await seedEmergencyActions(workspaceId, businessId);

    const [task] = await listBudgetActions(workspaceId, businessId);
    // proposed → completed is not a legal transition.
    await expect(
      updateBudgetAction(task.id, { status: "completed", completionNotes: "x", completionEvidence: ["y"] }, actor, workspaceId)
    ).rejects.toThrow();
  });

  it("[db] reads are workspace-scoped (foreign workspace cannot list the tasks)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await seedEmergencyActions(workspaceId, businessId);

    await expect(listBudgetActions(ws(), businessId)).rejects.toThrow();
  });

  it("[db] cross-workspace writes are blocked (foreign workspace cannot update the task)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await seedEmergencyActions(workspaceId, businessId);

    const [task] = await listBudgetActions(workspaceId, businessId);
    await expect(
      updateBudgetAction(task.id, { status: "assigned" }, actor, ws())
    ).rejects.toThrow();

    // The task is untouched in its real workspace.
    const unchanged = await db.ownerBudgetAction.findFirstOrThrow({ where: { id: task.id } });
    expect(unchanged.status).toBe("proposed");
  });
});
