/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma client + service rows are untyped at this test-only seed boundary */
/**
 * PRE-TRAINING BASELINE SEED — "Laundry Cash Squeeze + Capacity + Quality Complaint Growth Trap".
 *
 * A realistic, deliberately messy Kolkata laundry/dry-cleaning scenario seeded ONLY through existing
 * services (no new product logic). It exercises the real cross-domain owner loop so the baseline
 * Playwright spec can capture exactly what OpsIQ surfaces today — strengths AND gaps — before any
 * behavioral validation/training. Nothing here tunes or improves OpsIQ's output.
 *
 * Scenario dimensions seeded:
 *  - cash pressure        → tight cashflow snapshot (overdue receivables, big upcoming payroll/rent/vendor)
 *  - margin trap          → leaky finance snapshot (high discount, thin margin)
 *  - STALE data           → finance period ~60 days old (> 45d staleness threshold)
 *  - capacity bottleneck  → a down dryer + an over-utilised washer
 *  - quality complaint    → operations snapshot with complaints / rework / delivery failures
 *  - staff/process issue  → SOP misses; a draft SOP to review; an overdue process review
 *  - proof requirement    → a proof-required staff checklist task with NO accepted proof
 *  - EMERGENCY budget     → a committed statutory-payroll obligation due in days (mode flips, growth BLOCKed)
 *  - reassessment         → diagnosis cadence recorded by the real services
 */
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import {
  BASELINE_OWNER,
  BASELINE_WORKSPACE_ID,
  BASELINE_PROOF_TASK_ID,
  BASELINE_PROOF_REQUIREMENT_ID,
} from "../tests/browser/baseline-fixtures";

const USER_ID = BASELINE_OWNER.userId;
const WORKSPACE_ID = BASELINE_WORKSPACE_ID;
const OWNER_ROLE = "admin_or_portfolio_manager"; // grants OWNER_VIEW / OWNER_MANAGE (mirrors signup)
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma: any = new PrismaClient({ adapter: new PrismaPg(pool) });
  const now = new Date();
  const hashedPassword = bcrypt.hashSync(BASELINE_OWNER.password, 10);

  // ── Loginable owner with the capability-granting role assignment ────────────────────────────
  await prisma.user.upsert({
    where: { id: USER_ID },
    update: { hashedPassword },
    create: { id: USER_ID, email: BASELINE_OWNER.email, name: "Baseline Owner (Kolkata)", hashedPassword, updatedAt: now },
  });
  await prisma.workspace.upsert({
    where: { slug: "baseline-laundry-kolkata" },
    update: {},
    create: { id: WORKSPACE_ID, name: "Sparkle Laundry (Kolkata)", slug: "baseline-laundry-kolkata", createdBy: USER_ID, description: "Pre-training baseline scenario" },
  });
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: USER_ID } },
    update: { role: "owner", isActive: true },
    create: { workspaceId: WORKSPACE_ID, userId: USER_ID, role: "owner", addedBy: USER_ID, isActive: true },
  });
  await prisma.userRoleAssignment.upsert({
    where: { userId_role_scope_scopeId: { userId: USER_ID, role: OWNER_ROLE, scope: "workspace", scopeId: WORKSPACE_ID } },
    update: { isActive: true, revokedAt: null },
    create: { id: randomUUID(), userId: USER_ID, role: OWNER_ROLE, scope: "workspace", scopeId: WORKSPACE_ID, isActive: true },
  });
  console.log(`[baseline] owner ${BASELINE_OWNER.email} + workspace ${WORKSPACE_ID} + role ${OWNER_ROLE} ready`);

  // ── Business ────────────────────────────────────────────────────────────────────────────────
  const { createBusiness } = await import("../src/services/founder-recovery/business.service");
  const business = await createBusiness(
    { name: "Sparkle Laundry & Dry-Cleaning", businessType: "laundry_local_service", currency: "INR", b2cSupported: true, b2bSupported: true },
    USER_ID, WORKSPACE_ID
  );
  const businessId = business.id;
  console.log(`[baseline] business ${businessId} (laundry, Kolkata)`);

  // ── STALE finance snapshot (period ~60 days old) + diagnosis — margin trap, thin cash ─────────
  const staleEnd = new Date(now.getTime() - 60 * DAY);
  const staleStart = new Date(staleEnd.getTime() - 30 * DAY);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const { createFinancialSnapshot } = await import("../src/services/owner-finance/snapshot.service");
  const { runFinanceDiagnosis } = await import("../src/services/owner-finance/diagnosis.service");
  const finSnap = await createFinancialSnapshot(
    businessId,
    {
      periodStart: iso(staleStart), periodEnd: iso(staleEnd), currency: "INR",
      revenue: 420000, fixedCosts: 190000, variableCosts: 180000,
      discountAmount: 65000, cashOnHand: 35000,
    },
    USER_ID, WORKSPACE_ID
  );
  const finCycle = await runFinanceDiagnosis(businessId, finSnap.id, USER_ID, WORKSPACE_ID);
  console.log(`[baseline] STALE finance diagnosis: cycle ${finCycle.id}, findings ${finCycle.findings.length} (period ${iso(staleStart)}..${iso(staleEnd)})`);

  // ── Cashflow snapshot + diagnosis — overdue receivables, large upcoming obligations ───────────
  const { createCashflowSnapshot } = await import("../src/services/owner-cashflow/snapshot.service");
  const { runCashflowDiagnosis } = await import("../src/services/owner-cashflow/diagnosis.service");
  const cfSnap = await createCashflowSnapshot(
    businessId,
    {
      periodStart: iso(staleStart), periodEnd: iso(staleEnd), currency: "INR",
      cashInHand: 9000, bankBalance: 26000, dailyCollections: 7000,
      receivables: 110000, receivablesOverdue: 72000,
      payables: 84000, payablesOverdue: 38000,
      upcomingEmi: 22000, rentDue: 55000, salaryDue: 130000, vendorDue: 47000, taxDue: 18000,
      ownerWithdrawal: 25000,
      notes: "B2B hotel client paying 45+ days late; payroll + rent due this week.",
    },
    USER_ID, WORKSPACE_ID
  );
  const cfCycle = await runCashflowDiagnosis(businessId, cfSnap.id, USER_ID, WORKSPACE_ID);
  console.log(`[baseline] cashflow diagnosis: cycle ${cfCycle.id}, findings ${cfCycle.findings.length}`);

  // ── Operations snapshot + diagnosis — quality complaints, delays, SOP misses, capacity ────────
  const { createOperationsSnapshot } = await import("../src/services/owner-operations/snapshot.service");
  const { runOperationsDiagnosis } = await import("../src/services/owner-operations/diagnosis.service");
  const opsSnap = await createOperationsSnapshot(
    businessId,
    {
      periodStart: iso(staleStart), periodEnd: iso(staleEnd), currency: "INR",
      ordersReceived: 1240, ordersCompleted: 980, ordersDelayed: 190,
      reworkCount: 64, complaints: 28, staffHours: 760, machineCapacityUnits: 1000, idleHours: 18,
      deliveryAttempts: 320, deliveryFailures: 41, inventoryShortages: 9,
      sopChecks: 120, sopMisses: 34,
      notes: "Repeat complaints about delayed + damaged orders; dryer downtime backing up the line.",
    },
    USER_ID, WORKSPACE_ID
  );
  const opsCycle = await runOperationsDiagnosis(businessId, opsSnap.id, USER_ID, WORKSPACE_ID);
  console.log(`[baseline] operations diagnosis: cycle ${opsCycle.id}, findings ${opsCycle.findings.length} (complaints 28, sopMisses 34)`);

  // ── EMERGENCY budget: committed statutory payroll obligation due in 4 days ────────────────────
  const { createBudgetPeriod, recordSpendEntry } = await import("../src/services/owner-budget/budget.service");
  const period = await createBudgetPeriod(
    businessId,
    { label: "Current period", periodStart: iso(staleStart), periodEnd: iso(now), currency: "INR", approvedBudget: 150000, statutoryReserveRequired: 60000, ownerGoal: "growth" },
    USER_ID, WORKSPACE_ID
  );
  const spend = await recordSpendEntry(
    businessId,
    { periodId: period.id, label: "Payroll + PF/ESI (committed)", category: "statutory_payroll_tax", amount: 130000, state: "committed", obligationKind: "payroll", dueInDays: 4, requestedByUserId: USER_ID, ownerApprovalThreshold: 50000 },
    USER_ID, WORKSPACE_ID
  );
  console.log(`[baseline] budget: period ${period.id}, mode ${spend.plan.mode}, decision ${spend.plan.decisionType}`);

  // ── Capacity bottleneck: a down dryer + an over-utilised washer ───────────────────────────────
  const { recordEquipment } = await import("../src/services/owner-mode/equipment.service");
  await recordEquipment({ workspaceId: WORKSPACE_ID, businessId, equipmentType: "laundry_machine", name: "Industrial dryer #2 (DOWN)", utilization: 0.99, status: "out_of_service", downtimeState: "down", actorId: USER_ID });
  await recordEquipment({ workspaceId: WORKSPACE_ID, businessId, equipmentType: "laundry_machine", name: "Front-load washer #1", utilization: 0.94, status: "operational", downtimeState: "up", maintenanceDueAt: new Date(now.getTime() - 3 * DAY), actorId: USER_ID });
  console.log(`[baseline] equipment: down dryer + over-utilised washer recorded`);

  // ── Staff/process: a draft SOP to review + an OVERDUE process review ───────────────────────────
  const { createSopDraft } = await import("../src/services/owner-mode/sop-document.service");
  await createSopDraft({ workspaceId: WORKSPACE_ID, businessId, process: "Garment intake & tagging", title: "Garment intake & tagging checklist", steps: ["Tag every garment at intake", "Photograph pre-existing damage", "Log promised delivery date"], proofRequirements: ["photo_or_log"], actorId: USER_ID });
  const { registerProcess } = await import("../src/services/owner-mode/process-review.service");
  const processId = await registerProcess({ workspaceId: WORKSPACE_ID, businessId, name: "Pressing & QC final check", processType: "operational", ownerRole: "owner", metric: "defect_rate", reviewFrequencyDays: 14, actorId: USER_ID });
  // Test-only fixture adjustment: make the review OVERDUE so the control center surfaces it.
  await prisma.ownerProcess.update({ where: { id: processId }, data: { nextReviewAt: new Date(now.getTime() - 5 * DAY) } });
  console.log(`[baseline] staff/process: draft SOP + overdue process review ${processId}`);

  // ── Proof-required staff checklist task with NO accepted proof ────────────────────────────────
  await prisma.proofRequirement.upsert({
    where: { id: BASELINE_PROOF_REQUIREMENT_ID },
    update: {},
    create: { id: BASELINE_PROOF_REQUIREMENT_ID, workspaceId: WORKSPACE_ID, taskId: BASELINE_PROOF_TASK_ID, proofType: "photo", riskLevel: "HIGH", reviewerRole: "owner", ownerOverrideAllowed: true },
  });
  await prisma.delegatedTask.upsert({
    where: { id: BASELINE_PROOF_TASK_ID },
    update: { status: "COMPLETED_PENDING_REVIEW", proofRequirementId: BASELINE_PROOF_REQUIREMENT_ID },
    create: {
      id: BASELINE_PROOF_TASK_ID, workspaceId: WORKSPACE_ID,
      title: "Re-wash + re-deliver damaged hotel order (proof required)",
      description: "Recover the complaint order; owner-verify before closing.",
      status: "COMPLETED_PENDING_REVIEW", proofRequirementId: BASELINE_PROOF_REQUIREMENT_ID,
      assignedRole: "staff", createdByUserId: USER_ID, updatedAt: now,
    },
  });
  console.log(`[baseline] proof-required staff task ${BASELINE_PROOF_TASK_ID} ready (no accepted proof)`);

  console.log("[baseline] SEED COMPLETE");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
