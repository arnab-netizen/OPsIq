/**
 * E2E owner seed — creates the loginable owner the Playwright owner-flow spec uses
 * (test1@staging.local / password123, OWNER of a workspace) and seeds the laundry archetype
 * plus a finance diagnosis so the owner command center renders real backend data. Used only
 * by the owner-e2e CI lane.
 *
 * Mirrors the production signup path (src/app/api/auth/signup/route.ts): an owner is a workspace
 * member AND holds a workspace-scoped UserRoleAssignment (ADMIN_OR_PORTFOLIO_MANAGER) — that role
 * assignment is what grants OWNER_VIEW / OWNER_MANAGE. Membership alone does not grant capabilities,
 * so without the assignment every /api/owner/* call is correctly denied (403 owner:view).
 */
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import {
  E2E_OWNER,
  E2E_MEMBER,
  E2E_WORKSPACE_ID,
  E2E_PROOF_BLOCKED_TASK_ID,
  E2E_PROOF_REQUIREMENT_ID,
} from "../tests/browser/e2e-fixtures";

// Shared with the Playwright specs (tests/browser/e2e-fixtures.ts) so seed + assertions agree.
const USER_ID = E2E_OWNER.userId;
const WORKSPACE_ID = E2E_WORKSPACE_ID;
const EMAIL = E2E_OWNER.email;
const PASSWORD = E2E_OWNER.password;
const MEMBER_ID = E2E_MEMBER.userId;
const MEMBER_EMAIL = E2E_MEMBER.email;
const PROOF_BLOCKED_TASK_ID = E2E_PROOF_BLOCKED_TASK_ID;
const PROOF_REQUIREMENT_ID = E2E_PROOF_REQUIREMENT_ID;
const OWNER_ROLE = "admin_or_portfolio_manager"; // ROLES.ADMIN_OR_PORTFOLIO_MANAGER — grants OWNER_VIEW/OWNER_MANAGE

// Poor finance metrics → guarantees findings + actions so a domain diagnosis exists and the
// command center reports hasData=true (the control center panel only renders with diagnosed data).
const LEAKY_SNAPSHOT = {
  periodStart: "2026-04-01",
  periodEnd: "2026-04-30",
  currency: "INR",
  revenue: 100000,
  fixedCosts: 40000,
  variableCosts: 40000,
  discountAmount: 15000,
  cashOnHand: 50000,
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma: any = new PrismaClient({ adapter });

  const hashedPassword = bcrypt.hashSync(PASSWORD, 10);

  await prisma.user.upsert({
    where: { id: USER_ID },
    update: { hashedPassword },
    create: { id: USER_ID, email: EMAIL, name: "E2E Owner", hashedPassword, updatedAt: new Date() },
  });
  await prisma.workspace.upsert({
    where: { slug: "e2e-owner-workspace" },
    update: {},
    create: { id: WORKSPACE_ID, name: "E2E Owner Workspace", slug: "e2e-owner-workspace", createdBy: USER_ID, description: "E2E owner flow" },
  });
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: USER_ID } },
    update: { role: "owner", isActive: true },
    create: { workspaceId: WORKSPACE_ID, userId: USER_ID, role: "owner", addedBy: USER_ID, isActive: true },
  });

  // Capability grant: workspace-scoped role assignment (mirrors signup). Without this the owner
  // routes deny with 403 "Missing capabilities: owner:view".
  await prisma.userRoleAssignment.upsert({
    where: {
      userId_role_scope_scopeId: { userId: USER_ID, role: OWNER_ROLE, scope: "workspace", scopeId: WORKSPACE_ID },
    },
    update: { isActive: true, revokedAt: null },
    create: {
      id: randomUUID(),
      userId: USER_ID,
      role: OWNER_ROLE,
      scope: "workspace",
      scopeId: WORKSPACE_ID,
      isActive: true,
    },
  });
  console.log(`[seed-e2e] owner ${EMAIL} + workspace ${WORKSPACE_ID} + role ${OWNER_ROLE} ready`);

  // Seed the laundry archetype (business + operational data) so the control center renders rich data.
  const { seedLaundryArchetype } = await import("../src/services/owner-mode/archetype-seed.service");
  const archetype = await seedLaundryArchetype({ workspaceId: WORKSPACE_ID, actorId: USER_ID, env: "test" });
  console.log(`[seed-e2e] archetype seeded: business ${archetype.businessId}, equipment ${archetype.equipmentCount}`);

  // Guarantee a capacity bottleneck (flow D + control-center "what NOT to do"): a down machine
  // deterministically produces an equipment bottleneck and the "do not pursue growth" guidance.
  const { recordEquipment } = await import("../src/services/owner-mode/equipment.service");
  await recordEquipment({
    workspaceId: WORKSPACE_ID, businessId: archetype.businessId,
    equipmentType: "laundry_machine", name: "Industrial dryer #2 (DOWN)",
    utilization: 0.98, status: "out_of_service", downtimeState: "down",
    actorId: USER_ID,
  });
  console.log(`[seed-e2e] guaranteed bottleneck equipment recorded`);

  // Run a finance diagnosis on the archetype business so a domain score exists → command center
  // hasData=true → the control center panel (the asserted surface) actually renders.
  const { createFinancialSnapshot } = await import("../src/services/owner-finance/snapshot.service");
  const { runFinanceDiagnosis } = await import("../src/services/owner-finance/diagnosis.service");
  const snap = await createFinancialSnapshot(archetype.businessId, LEAKY_SNAPSHOT, USER_ID, WORKSPACE_ID);
  const cycle = await runFinanceDiagnosis(archetype.businessId, snap.id, USER_ID, WORKSPACE_ID);
  console.log(`[seed-e2e] finance diagnosis: cycle ${cycle.id}, findings ${cycle.findings.length}, actions ${cycle.actions.length}`);

  // ── Budget EMERGENCY state (flow C) ──────────────────────────────────────────────────────
  // A real committed statutory-payroll obligation due in 5 days drives the budget mode to a
  // defensive posture (EMERGENCY) through the real service path, so /owner/budget shows the
  // cash-risk state, blocked growth, and freeze guidance — no fake UI.
  const { createBudgetPeriod, recordSpendEntry } = await import("../src/services/owner-budget/budget.service");
  const period = await createBudgetPeriod(
    archetype.businessId,
    { label: "Current period", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000, statutoryReserveRequired: 50000, ownerGoal: "growth" },
    USER_ID, WORKSPACE_ID
  );
  const spend = await recordSpendEntry(
    archetype.businessId,
    {
      periodId: period.id, label: "Payroll (committed)", category: "statutory_payroll_tax",
      amount: 420000, state: "committed", obligationKind: "payroll", dueInDays: 5,
      requestedByUserId: USER_ID, ownerApprovalThreshold: 50000,
    },
    USER_ID, WORKSPACE_ID
  );
  console.log(`[seed-e2e] budget seeded: period ${period.id}, plan mode ${spend.plan.mode}, decision ${spend.plan.decisionType}`);

  // ── Proof-blocked delegated task (flow B) ────────────────────────────────────────────────
  // A proof-required task with NO accepted proof. The owner attempting to complete it is
  // server-rejected (409 proof_not_accepted) — the UI shows the block reason, never fake success.
  await prisma.proofRequirement.upsert({
    where: { id: PROOF_REQUIREMENT_ID },
    update: {},
    create: { id: PROOF_REQUIREMENT_ID, workspaceId: WORKSPACE_ID, taskId: PROOF_BLOCKED_TASK_ID, proofType: "photo", riskLevel: "HIGH", reviewerRole: "owner", ownerOverrideAllowed: true },
  });
  await prisma.delegatedTask.upsert({
    where: { id: PROOF_BLOCKED_TASK_ID },
    update: { status: "COMPLETED_PENDING_REVIEW", proofRequirementId: PROOF_REQUIREMENT_ID },
    create: {
      id: PROOF_BLOCKED_TASK_ID, workspaceId: WORKSPACE_ID,
      title: "Replace dryer belt (proof required)", description: "Owner-verified maintenance task",
      status: "COMPLETED_PENDING_REVIEW", proofRequirementId: PROOF_REQUIREMENT_ID,
      assignedUserId: MEMBER_ID, assignedRole: "member", createdByUserId: USER_ID,
      updatedAt: new Date(),
    },
  });
  console.log(`[seed-e2e] proof-blocked task ${PROOF_BLOCKED_TASK_ID} ready (no accepted proof)`);

  // ── Non-owner member (flow E) ────────────────────────────────────────────────────────────
  // A real member of the SAME workspace with NO UserRoleAssignment → can log in but lacks
  // owner:view, so /owner must not render the control center and the owner APIs return 403.
  await prisma.user.upsert({
    where: { id: MEMBER_ID },
    update: { hashedPassword },
    create: { id: MEMBER_ID, email: MEMBER_EMAIL, name: "E2E Member", hashedPassword, updatedAt: new Date() },
  });
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: MEMBER_ID } },
    update: { role: "member", isActive: true },
    create: { workspaceId: WORKSPACE_ID, userId: MEMBER_ID, role: "member", addedBy: USER_ID, isActive: true },
  });
  console.log(`[seed-e2e] non-owner member ${MEMBER_EMAIL} ready (membership only, no owner role)`);

  // Cross-domain persisted records (cashflow/finance/working-capital/capacity/compliance/proof/
  // workload/standing-instruction/learning) for the SAME workspace+business, so the NEW production
  // owner-advice runtime (/api/owner/whole-business-plan) reads REAL provider-backed state and applies
  // the workspace-private learning artifact with provenance. Seeded LAST so the newer finance snapshot
  // it inserts cannot perturb the budget plan computed above (the budget reads the latest finance
  // snapshot at compute time; its persisted EMERGENCY snapshot is what /owner/budget displays).
  const { seedOwnerDbCase } = await import("./seed-owner-db-case");
  await seedOwnerDbCase(prisma, { workspaceId: WORKSPACE_ID, businessId: archetype.businessId, userId: USER_ID, now: new Date() });
  console.log(`[seed-e2e] owner-db-case rows seeded for whole-business runtime on business ${archetype.businessId}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
