/**
 * Seed the 10 representative scenario businesses into the E2E owner workspace for the browser-
 * representative E2E. Reuses the E2E owner identity (so the Playwright login path works) and creates,
 * per scenario, a full critical-domain row set tuned by the scenario knobs so the production runtime
 * resolves the scenario's dominant constraint (proven at the service level by the scenario unit tests).
 */
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { E2E_OWNER, E2E_WORKSPACE_ID } from "../tests/browser/e2e-fixtures";
import { SCENARIOS, scenarioBusinessId, type ScenarioKnobs } from "../src/services/owner-mode/owner-scenario-profiles";
import type { PrismaClient } from "../src/generated/prisma/client";

const OWNER_ROLE = "admin_or_portfolio_manager";
const day = 86_400_000;

const rid = (businessId: string, seed: string) => {
  let h = 5381;
  for (const c of `${businessId}:${seed}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  const tail = Array.from(seed).map((c) => c.charCodeAt(0).toString(16)).join("").slice(0, 4).padStart(4, "0");
  return `00000000-0000-4000-8000-${node}${tail}`;
};

async function seedScenario(prisma: PrismaClient, businessId: string, label: string, k: ScenarioKnobs, now: Date) {
  const ws = E2E_WORKSPACE_ID, userId = E2E_OWNER.userId;
  const periodEnd = now, periodStart = new Date(now.getTime() - 30 * day);
  const future = new Date(now.getTime() + 90 * day), past = new Date(now.getTime() - 10 * day);

  await prisma.ownerBusiness.upsert({
    where: { id: businessId },
    update: { name: label },
    create: { id: businessId, workspaceId: ws, name: label, businessType: "laundry_dry_cleaning", location: "Kolkata, West Bengal", currency: "INR", createdBy: userId },
  });
  await prisma.ownerCashflowSnapshot.upsert({
    where: { id: rid(businessId, "cf1") }, update: { cashInHand: k.cashInHand, receivablesOverdue: k.receivablesOverdue, periodEnd },
    create: { id: rid(businessId, "cf1"), workspaceId: ws, businessId, periodStart, periodEnd, currency: "INR", cashInHand: k.cashInHand, bankBalance: 0, receivables: 200000, receivablesOverdue: k.receivablesOverdue, payables: 30000, dataConfidenceScore: 0.8, missingCriticalData: [] },
  });
  await prisma.ownerFinancialSnapshot.upsert({
    where: { id: rid(businessId, "fin1") }, update: { revenue: k.revenue, costOfGoods: k.costOfGoods, periodEnd },
    create: { id: rid(businessId, "fin1"), workspaceId: ws, businessId, periodStart, periodEnd, currency: "INR", revenue: k.revenue, costOfGoods: k.costOfGoods, fixedCosts: 60000, variableCosts: 20000, dataConfidenceScore: 0.8, missingCriticalData: [] },
  });
  await prisma.ownerWorkingCapitalItem.upsert({
    where: { id: rid(businessId, "wc1") }, update: { amount: k.overdueWcReceivable ? 80000 : 40000, dueDate: k.overdueWcReceivable ? past : future },
    create: { id: rid(businessId, "wc1"), workspaceId: ws, businessId, kind: "receivable", counterparty: "Client", amount: k.overdueWcReceivable ? 80000 : 40000, dueDate: k.overdueWcReceivable ? past : future, status: "open" },
  });
  // NOTE: capacity/proof/workload are WORKSPACE-scoped entities (no businessId column), so they are
  // forced NEUTRAL here — within one workspace they cannot vary per business. Only business-scoped rows
  // (cashflow/finance/compliance/working-capital) drive the per-business browser constraint.
  await prisma.ownerCapacitySnapshot.upsert({
    where: { id: rid(businessId, "cap1") }, update: { bottleneckUtilization: 0.6, growthSafe: true },
    create: { id: rid(businessId, "cap1"), workspaceId: ws, currentRevenue: k.revenue, safeUtilization: 0.7, resources: {}, bottleneckUtilization: 0.6, growthCapacityRevenue: 0, availableBuffer: 0, expansionTriggered: false, growthSafe: true, createdAt: periodEnd },
  });
  await prisma.ownerComplianceItem.upsert({
    where: { id: rid(businessId, "cmp1") }, update: { expiresAt: k.complianceExpired ? past : future },
    create: { id: rid(businessId, "cmp1"), workspaceId: ws, businessId, kind: "trade_licence", name: "Trade licence", status: "active", expiresAt: k.complianceExpired ? past : future, createdByUserId: userId },
  });
  await prisma.proof.upsert({
    where: { id: rid(businessId, "prf1") }, update: { duplicateFlagged: false },
    create: { id: rid(businessId, "prf1"), workspaceId: ws, proofType: "delivery", status: "ACCEPTED", duplicateFlagged: false, submittedAt: now },
  });
  await prisma.ownerWorkloadSnapshot.upsert({
    where: { id: rid(businessId, "wl1") }, update: { overloaded: false, bottleneckRisk: false },
    create: { id: rid(businessId, "wl1"), workspaceId: ws, ownerMinutesPerDay: 300, sustainableMinutesPerDay: 360, ownerTasks: 8, ownerOnlyCriticalTasks: 1, dailyLoad: 0.8, dailyLoadPct: 80, band: "healthy", bottleneckRisk: false, overloaded: false, recommendedPath: "delegate_with_proof", createdAt: periodEnd },
  });
  await prisma.ownerStandingInstruction.upsert({
    where: { id: rid(businessId, "si1") }, update: {},
    create: { id: rid(businessId, "si1"), workspaceId: ws, scope: "pricing.routine", allowedActionTypes: ["routine_discount"], forbiddenActionTypes: ["expansion"], riskClass: "low", status: "active", createdByUserId: userId },
  });
  await prisma.behavioralLearningArtifact.upsert({
    where: { id: rid(businessId, "art1") }, update: {},
    create: {
      id: rid(businessId, "art1"), sourceCaseId: "A1", businessType: "laundry_dry_cleaning", archetype: "laundry_dry_cleaning",
      locationKey: "India|tier1", failureLabel: "bad_cash_advice", originalFailedBehavior: "spent in crisis",
      correctedBehavior: "block discretionary spend until margin proof", scopeArchetype: "laundry_dry_cleaning",
      scopeDecisionCategory: "cash_margin_working_capital", riskLevel: "high", approvalStatus: "pending",
      scope: "local_only", privacyClassification: "workspace_private", workspaceId: ws, version: 1, active: true,
      createdAt: now.toISOString(), auditTrail: [{ at: now.toISOString(), actor: "seed", action: "created" }],
    },
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClient;
  const now = new Date();
  const hashedPassword = bcrypt.hashSync(E2E_OWNER.password, 10);

  await prisma.user.upsert({ where: { id: E2E_OWNER.userId }, update: { hashedPassword }, create: { id: E2E_OWNER.userId, email: E2E_OWNER.email, name: "E2E Owner", hashedPassword, updatedAt: now } });
  await prisma.workspace.upsert({ where: { slug: "e2e-owner-workspace" }, update: {}, create: { id: E2E_WORKSPACE_ID, name: "E2E Owner Workspace", slug: "e2e-owner-workspace", createdBy: E2E_OWNER.userId, description: "E2E owner flow" } });
  await prisma.workspaceMembership.upsert({ where: { workspaceId_userId: { workspaceId: E2E_WORKSPACE_ID, userId: E2E_OWNER.userId } }, update: { role: "owner", isActive: true }, create: { workspaceId: E2E_WORKSPACE_ID, userId: E2E_OWNER.userId, role: "owner", addedBy: E2E_OWNER.userId, isActive: true } });
  await prisma.userRoleAssignment.upsert({ where: { userId_role_scope_scopeId: { userId: E2E_OWNER.userId, role: OWNER_ROLE, scope: "workspace", scopeId: E2E_WORKSPACE_ID } }, update: { isActive: true, revokedAt: null }, create: { id: randomUUID(), userId: E2E_OWNER.userId, role: OWNER_ROLE, scope: "workspace", scopeId: E2E_WORKSPACE_ID, isActive: true } });

  for (const s of SCENARIOS) {
    const bizId = scenarioBusinessId(s.id);
    await seedScenario(prisma, bizId, `Scenario: ${s.label}`, s.knobs, now);
    console.log(`[seed-scenarios] ${s.id} -> business ${bizId} (expect ${s.expectedConstraint})`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
