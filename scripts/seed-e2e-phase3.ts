/**
 * Seed deterministic data for Phase 3 Execution Lifecycle E2E spec (54).
 *
 * All IDs are fixed — script is idempotent (upsert). Run AFTER seed-e2e-owner.ts
 * so E2E_WORKSPACE_ID / E2E_OWNER.userId already exist.
 *
 * Creates:
 *  1. ProcessExecutionTask (E2E_PHASE3_TASK_ID) — PROPOSED, seeded for ACKNOWLEDGE journey
 *     Uses E2E_WORKSPACE_ID from seed-e2e-owner.ts (no separate OwnerBusiness needed — the
 *     archetype business created by seed-e2e-owner.ts is the workspace's primary business).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
// Fail closed unless DATABASE_URL is a guarded test database (see scripts/lib/assert-test-database.ts).
import "./lib/assert-test-database";
import {
  E2E_WORKSPACE_ID,
  E2E_PHASE3_TASK_ID,
  E2E_PHASE3_TASK_KEY,
} from "../tests/browser/e2e-fixtures";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient as PrismaClientType } from "../src/generated/prisma/client";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClientType;

  // ─── 1. ProcessExecutionTask (PROPOSED) ──────────────────────────────────────
  // Upsert by (workspaceId, taskKey) unique constraint.

  const existing = await (prisma as any).processExecutionTask.findFirst({
    where: { workspaceId: E2E_WORKSPACE_ID, taskKey: E2E_PHASE3_TASK_KEY },
    select: { id: true },
  });

  if (existing) {
    // Reset to PROPOSED so the E2E spec can run the full journey from the start.
    await (prisma as any).processExecutionTask.updateMany({
      where: { workspaceId: E2E_WORKSPACE_ID, taskKey: E2E_PHASE3_TASK_KEY },
      data: {
        status: "PROPOSED",
        acknowledgedAt: null,
        acknowledgedByUserId: null,
        workStartedAt: null,
        outcomeId: null,
        outcomeRecordedAt: null,
        updatedAt: new Date(),
      },
    });
    console.log(`[seed-phase3] task ${E2E_PHASE3_TASK_KEY} reset to PROPOSED`);
  } else {
    await (prisma as any).processExecutionTask.create({
      data: {
        id: E2E_PHASE3_TASK_ID,
        workspaceId: E2E_WORKSPACE_ID,
        taskKey: E2E_PHASE3_TASK_KEY,
        sourceFamily: "PROCESS_CORRECTION",
        sourceFindingKey: "c-cash-lag",
        executionRoute: "CREATE_OWNER_APPROVAL_TASK",
        actionOwner: "OWNER",
        approvalLevel: "OWNER_APPROVAL_REQUIRED",
        status: "PROPOSED",
        requiredEvidence: [],
        evidenceRefs: [],
        completionCriteria: "Owner acknowledges and records outcome.",
        reassessmentTrigger: "Re-evaluate at next review.",
        riskIfIgnored: "Cash collection lag compounds.",
        ownerVisibleSummary: "Reduce cash collection lag from 25 to 20 days",
        severity: "HIGH",
        priorityRank: 1,
        expectedBenefit: "Reduce cash collection lag by 5 days",
        baselineMetricName: "cash_collection_lag_days",
        baselineValue: 25.0,
        targetValue: 20.0,
        verificationWindowDays: null, // no observation window — can verify immediately
        updatedAt: new Date("2026-07-10T00:00:00.000Z"),
      },
    });
    console.log(`[seed-phase3] task ${E2E_PHASE3_TASK_KEY} created`);
  }

  // Clean up orphaned progress rows from prior runs
  if (existing) {
    await (prisma as any).processExecutionTaskProgress.deleteMany({
      where: { workspaceId: E2E_WORKSPACE_ID, taskId: existing.id },
    });
    console.log(`[seed-phase3] progress rows cleaned for prior task`);
  }

  await pool.end();
  console.log("[seed-phase3] done");
}

main().catch((err) => { console.error("[seed-phase3] FAILED:", err); process.exit(1); });
