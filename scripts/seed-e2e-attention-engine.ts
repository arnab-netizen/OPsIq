/**
 * Seed deterministic data for the Phase 2 Owner Attention Engine E2E specs (46 specs 8-11, 52, 53).
 *
 * Each signal is idempotent (upsert) and independent — no shared state with other seeds.
 * Run AFTER seed-owner-scenarios.ts so E2E_WORKSPACE_ID / E2E_OWNER.userId already exist.
 *
 * Creates:
 *  1. OwnerBusiness (E2E_ATTN_BUSINESS_ID) — FK for metric snapshots
 *  2. OwnerMetricSnapshot × 2 — drives goal AT_RISK + trend alert (complaints rising)
 *  3. OwnerGoal (E2E_GOAL_ID) — AT_RISK: 1M INR target, slow revenue growth
 *  4. OwnerCapacitySnapshot (E2E_ATTN_CAPACITY_ID) — bottleneckUtilization=0.92 (>80% threshold)
 *  5. OperatingPolicy × 2 — default policies for E2E workspace (growth_before_capacity, high_cost_low_payback)
 *  6. Escalation (E2E_ESCALATION_ID) — OPEN severity=CRITICAL for spec 53
 */
import {
  E2E_OWNER,
  E2E_WORKSPACE_ID,
  E2E_ATTN_BUSINESS_ID,
  E2E_GOAL_ID,
  E2E_ESCALATION_ID,
  E2E_ATTN_CAPACITY_ID,
} from "../tests/browser/e2e-fixtures";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient as PrismaClientType } from "../src/generated/prisma/client";

// Deterministic metric snapshot IDs
const SNAP_1_ID = "81000000-0000-0000-0000-000000000001";
const SNAP_2_ID = "82000000-0000-0000-0000-000000000001";

// Fixed periods: two quarters of known metric data
// Period 1: Q4 2025 (Oct–Dec)
const P1_START = new Date("2025-10-01T00:00:00.000Z");
const P1_END   = new Date("2025-12-31T00:00:00.000Z");
// Period 2: Q1 2026 (Jan–Mar)
const P2_START = new Date("2026-01-01T00:00:00.000Z");
const P2_END   = new Date("2026-03-31T00:00:00.000Z");

// Goal target: far enough in the future for AT_RISK trajectory given slow growth
const GOAL_TARGET_DATE = new Date("2027-07-01T00:00:00.000Z");

// Escalation created-at: fixed deterministic timestamp
const ESCALATION_CREATED_AT = new Date("2026-07-01T08:00:00.000Z");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClientType;

  // ─── 1. OwnerBusiness ───────────────────────────────────────────────────────
  await prisma.ownerBusiness.upsert({
    where: { id: E2E_ATTN_BUSINESS_ID },
    update: { name: "Attn Engine E2E Probe" },
    create: {
      id: E2E_ATTN_BUSINESS_ID,
      workspaceId: E2E_WORKSPACE_ID,
      name: "Attn Engine E2E Probe",
      businessType: "laundry_dry_cleaning",
      location: "Kolkata",
      currency: "INR",
      createdBy: E2E_OWNER.userId,
    },
  });
  console.log(`[seed-attn-engine] business ${E2E_ATTN_BUSINESS_ID} upserted`);

  // ─── 2. OwnerMetricSnapshot × 2 ─────────────────────────────────────────────
  // Period 1: revenue=10_000, complaintCount=1 (baseline — complaint low)
  await prisma.ownerMetricSnapshot.upsert({
    where: { businessId_periodStart_periodEnd: { businessId: E2E_ATTN_BUSINESS_ID, periodStart: P1_START, periodEnd: P1_END } },
    update: { revenue: 10000, complaintCount: 1 },
    create: {
      id: SNAP_1_ID,
      businessId: E2E_ATTN_BUSINESS_ID,
      workspaceId: E2E_WORKSPACE_ID,
      periodStart: P1_START,
      periodEnd: P1_END,
      currency: "INR",
      revenue: 10000,
      netProfit: 2000,
      complaintCount: 1,
    },
  });

  // Period 2: revenue=10_200 (+2%), complaintCount=18 (+1700% → complaints_up_before_churn alert)
  // discountAmount=1530 (15% of revenue) → DISCOUNT_LEAK fires with rangeLow=0, rangeHigh=1530
  // which beats COMPLAINT_REVENUE_RISK's score (144 > 141) and makes cockpit-profit-leak-impact visible.
  await prisma.ownerMetricSnapshot.upsert({
    where: { businessId_periodStart_periodEnd: { businessId: E2E_ATTN_BUSINESS_ID, periodStart: P2_START, periodEnd: P2_END } },
    update: { revenue: 10200, complaintCount: 18, discountAmount: 1530 },
    create: {
      id: SNAP_2_ID,
      businessId: E2E_ATTN_BUSINESS_ID,
      workspaceId: E2E_WORKSPACE_ID,
      periodStart: P2_START,
      periodEnd: P2_END,
      currency: "INR",
      revenue: 10200,
      netProfit: 2040,
      complaintCount: 18,
      discountAmount: 1530,
    },
  });
  console.log(`[seed-attn-engine] metric snapshots ${SNAP_1_ID}, ${SNAP_2_ID} upserted`);
  console.log(`  → period 1: revenue=10000, complaints=1`);
  console.log(`  → period 2: revenue=10200 (+2%), complaints=18 (+1700%)`);

  // ─── 3. OwnerGoal (AT_RISK) ──────────────────────────────────────────────────
  // Target 1,000,000 INR revenue by 2027-07-01 (≈12 months away from P2 end).
  // Current revenue ≈ 10,200/quarter (≈ 40,800/year). Gap: 1,000,000 − 10,200 = 989,800.
  // At 2% quarterly growth, projected years to reach goal: several decades → AT_RISK.
  await prisma.ownerGoal.upsert({
    where: { id: E2E_GOAL_ID },
    update: { status: "ACTIVE" },
    create: {
      id: E2E_GOAL_ID,
      workspaceId: E2E_WORKSPACE_ID,
      actorId: E2E_OWNER.userId,
      targetType: "REVENUE",
      targetAmount: 1000000,
      targetCurrency: "INR",
      targetDate: GOAL_TARGET_DATE,
      baselineAmount: 10000,
      baselineDate: P1_END,
      status: "ACTIVE",
    },
  });
  console.log(`[seed-attn-engine] goal ${E2E_GOAL_ID} upserted (AT_RISK trajectory expected)`);

  // ─── 4. OwnerCapacitySnapshot ────────────────────────────────────────────────
  // bottleneckUtilization=0.92 (92%) → capacityUtilizationPct=92 → growth_before_capacity policy BLOCKS
  await prisma.ownerCapacitySnapshot.upsert({
    where: { id: E2E_ATTN_CAPACITY_ID },
    update: { bottleneckUtilization: 0.92 },
    create: {
      id: E2E_ATTN_CAPACITY_ID,
      workspaceId: E2E_WORKSPACE_ID,
      businessId: E2E_ATTN_BUSINESS_ID,
      currentRevenue: 10200,
      safeUtilization: 0.80,
      bottleneckResource: "staff",
      bottleneckUtilization: 0.92,
      growthCapacityRevenue: 11100,
      availableBuffer: 900,
      growthSafe: false,
      expansionTriggered: false,
      resources: [{ name: "staff", utilization: 0.92 }],
    },
  });
  console.log(`[seed-attn-engine] capacity snapshot ${E2E_ATTN_CAPACITY_ID} upserted (bottleneck=92%)`);

  // ─── 5. OperatingPolicy × 2 (default policies for E2E workspace) ─────────────
  // growth_before_capacity: hardBlock=true, threshold=80%
  const GBC_POLICY_ID = "91000000-0000-0000-0000-000000000001";
  await prisma.operatingPolicy.upsert({
    where: { workspaceId_policyKey: { workspaceId: E2E_WORKSPACE_ID, policyKey: "growth_before_capacity" } },
    update: { isActive: true, hardBlock: true, threshold: 80 },
    create: {
      id: GBC_POLICY_ID,
      workspaceId: E2E_WORKSPACE_ID,
      policyKey: "growth_before_capacity",
      category: "GROWTH_GATING",
      description: "Block marketing and growth expenditure when operational capacity utilisation exceeds the threshold percentage.",
      threshold: 80,
      thresholdUnit: "PERCENT",
      hardBlock: true,
      overrideAuthorityRole: "OWNER",
      overrideReasonRequired: true,
      expiryAfterOverrideMinutes: 2880,
      isActive: true,
      createdBy: E2E_OWNER.userId,
    },
  });

  // high_cost_low_payback: hardBlock=false, threshold=6 months
  const HCLP_POLICY_ID = "92000000-0000-0000-0000-000000000001";
  await prisma.operatingPolicy.upsert({
    where: { workspaceId_policyKey: { workspaceId: E2E_WORKSPACE_ID, policyKey: "high_cost_low_payback" } },
    update: { isActive: true, hardBlock: false, threshold: 6 },
    create: {
      id: HCLP_POLICY_ID,
      workspaceId: E2E_WORKSPACE_ID,
      policyKey: "high_cost_low_payback",
      category: "COST_CONTROL",
      description: "Warn or block expenditures where the estimated payback period exceeds the threshold.",
      threshold: 6,
      thresholdUnit: "MONTHS",
      hardBlock: false,
      overrideAuthorityRole: "OWNER",
      overrideReasonRequired: true,
      expiryAfterOverrideMinutes: 1440,
      isActive: true,
      createdBy: E2E_OWNER.userId,
    },
  });
  console.log(`[seed-attn-engine] operating policies upserted (growth_before_capacity + high_cost_low_payback)`);

  // ─── 6. Escalation (OPEN, CRITICAL) ─────────────────────────────────────────
  await prisma.escalation.upsert({
    where: { id: E2E_ESCALATION_ID },
    update: { status: "OPEN" },
    create: {
      id: E2E_ESCALATION_ID,
      workspaceId: E2E_WORKSPACE_ID,
      category: "PROCESS_FAILURE",
      severity: "CRITICAL",
      assignedTarget: "Owner — Review complaint spike in laundry operations",
      status: "OPEN",
      createdBy: E2E_OWNER.userId,
      createdAt: ESCALATION_CREATED_AT,
    },
  });
  console.log(`[seed-attn-engine] escalation ${E2E_ESCALATION_ID} upserted (OPEN/CRITICAL)`);
  console.log(`[seed-attn-engine] ✓ All attention engine fixtures ready`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
