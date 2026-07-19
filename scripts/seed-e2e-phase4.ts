/**
 * Seed deterministic data for Phase 4 Business Operating System E2E spec (55).
 *
 * All IDs are fixed — script is idempotent (upsert). Run AFTER seed-e2e-owner.ts
 * so E2E_WORKSPACE_ID / E2E_OWNER.userId already exist.
 *
 * Creates:
 *  1. BusinessObjective (ACTIVE, REVENUE type, high priority)
 *  2. BusinessRiskEntry (high severity, FINANCIAL category)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  E2E_WORKSPACE_ID,
  E2E_PHASE4_OBJECTIVE_ID,
  E2E_PHASE4_OBJECTIVE2_ID,
  E2E_PHASE4_RISK_ID,
  E2E_OWNER,
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

  // ─── 1. BusinessObjective ─────────────────────────────────────────────────────
  await (prisma as any).businessObjective.upsert({
    where: { id: E2E_PHASE4_OBJECTIVE_ID },
    create: {
      id: E2E_PHASE4_OBJECTIVE_ID,
      workspaceId: E2E_WORKSPACE_ID,
      title: "Reduce cash collection lag by 5 days",
      objectiveType: "REVENUE",
      status: "ACTIVE",
      priorityScore: 85,
      targetValue: 20.0,
      currentValue: 25.0,
      unit: "days",
      createdAt: new Date("2026-07-01T00:00:00Z"),
      updatedAt: new Date("2026-07-01T00:00:00Z"),
    },
    update: {
      status: "ACTIVE",
      priorityScore: 85,
      updatedAt: new Date(),
    },
  });

  // ─── 2. Second BusinessObjective (COMPLIANCE) ────────────────────────────────
  await (prisma as any).businessObjective.upsert({
    where: { id: E2E_PHASE4_OBJECTIVE2_ID },
    create: {
      id: E2E_PHASE4_OBJECTIVE2_ID,
      workspaceId: E2E_WORKSPACE_ID,
      title: "GDPR compliance remediation",
      objectiveType: "COMPLIANCE",
      status: "ACTIVE",
      priorityScore: 90,
      createdAt: new Date("2026-07-05T00:00:00Z"),
      updatedAt: new Date("2026-07-05T00:00:00Z"),
    },
    update: {
      status: "ACTIVE",
      priorityScore: 90,
      updatedAt: new Date(),
    },
  });

  // ─── 3. BusinessRiskEntry ─────────────────────────────────────────────────────
  await (prisma as any).businessRiskEntry.upsert({
    where: { id: E2E_PHASE4_RISK_ID },
    create: {
      id: E2E_PHASE4_RISK_ID,
      workspaceId: E2E_WORKSPACE_ID,
      riskCode: "RISK-E2E-P4-001",
      title: "Cash flow shortfall risk",
      category: "FINANCIAL",
      likelihood: 60,
      impact: 80,
      severity: 48,
      status: "IDENTIFIED",
      identifiedBy: E2E_OWNER.userId,
      createdAt: new Date("2026-07-01T00:00:00Z"),
      updatedAt: new Date("2026-07-01T00:00:00Z"),
    },
    update: {
      status: "IDENTIFIED",
      updatedAt: new Date(),
    },
  });

  console.log("Phase 4 E2E seed complete.");
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
