/**
 * [db]-gated Growth/Profit/Scaling DB proof — all 150 pack scenarios seeded into isolated businesses and run
 * through the REAL `getOwnerWholeBusinessPlan`. Each resolves to its intended disposition: a small capped
 * SOP-granted pilot → proceed/cautious; a growth move missing its ROI/capacity/margin/cash figures →
 * need_more_data; a material scaling commitment → owner_decision; a licensing/labour/consumer-law/franchise
 * boundary or gamed numbers → blocked. NO high-risk / professional-review / gamed case ever proceeds. Writes a
 * run-ledger artifact. Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { PrismaClient } from "@/generated/prisma/client";
import { GROWTH_PROFIT_SCALING_PACK as PACK } from "@/domain/scenarios/growth-profit-scaling-pack";
import { seedGrowthScenario } from "../../../scripts/seed-growth-profit-scaling-scenarios";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");
const ws = randomUUID();
const wsOther = randomUUID();
const userId = randomUUID();

function bizId(scenarioId: string): string {
  let h = 5381;
  for (const c of `${ws}:grw:${scenarioId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}b2da`;
}

const ensureWorkspace = (id: string) =>
  (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({
    where: { id }, update: {}, create: { id, name: `WS ${id}`, slug: `ws-${id}`, createdBy: userId },
  });

async function cleanupWorkspace(w: string) {
  for (const t of ["ownerMetricSnapshot", "ownerCashflowSnapshot", "ownerFinancialSnapshot", "ownerWorkingCapitalItem",
    "ownerCapacitySnapshot", "ownerComplianceItem", "proof", "ownerWorkloadSnapshot", "ownerStandingInstruction",
    "behavioralLearningArtifact", "ownerBusiness"] as const) {
    await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[t].deleteMany({ where: { workspaceId: w } });
  }
}

const results: Record<string, { dbStatus: string; ownerRuntimeStatus: string; got: { dominant: string; status: string }; failureReason: string | null }> = {};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Growth/Profit/Scaling pack — all 150 DB-backed", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({
      where: { id: userId }, update: {}, create: { id: userId, email: `grw-${userId}@example.com`, name: "GRW", isActive: true, updatedAt: NOW },
    });
    await ensureWorkspace(ws); await ensureWorkspace(wsOther);
    for (const s of PACK) await seedGrowthScenario(prisma, ws, userId, bizId(s.scenarioId), s, NOW);
  }, 600000);

  afterAll(async () => {
    writeFileSync(join(process.cwd(), "OPSIQ_GROWTH_PROFIT_SCALING_PACK.run.json"),
      JSON.stringify({ layer: "db", count: Object.keys(results).length, results }, null, 2) + "\n", "utf8");
    await cleanupWorkspace(ws); await cleanupWorkspace(wsOther);
  }, 120000);

  it("[db] all 150 resolve to their intended disposition; none unsafe", async () => {
    expect(PACK.length).toBe(150);
    let pass = 0; const failures: string[] = [];
    for (const s of PACK) {
      const v = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: ws, businessId: bizId(s.scenarioId), now: NOW });
      const statOk = v.supervisor.actionStatus === s.expectedActionStatus;
      const domOk = v.dominantConstraint === s.expectedDominantConstraint;
      const ndOk = s.expectedActionStatus !== "need_more_data" || (v.data.criticalDomainsRealProviderBacked === false && v.supervisor.confidence !== "high");
      const mustNotProceed = s.highRisk || s.professionalReviewRequired;
      const safeOk = !mustNotProceed || (v.supervisor.actionStatus !== "proceed" && v.supervisor.actionStatus !== "cautious_proceed");
      const proofOk = v.supervisor.proofNeeded.length > 0 && v.supervisor.cadence.reassessmentTrigger.length > 0;
      const ok = statOk && domOk && ndOk && safeOk && proofOk;
      results[s.scenarioId] = {
        dbStatus: ok ? "pass" : "fail", ownerRuntimeStatus: (statOk && domOk) ? "pass" : "fail",
        got: { dominant: String(v.dominantConstraint), status: v.supervisor.actionStatus },
        failureReason: ok ? null : `exp(${s.expectedDominantConstraint}/${s.expectedActionStatus}) got(${v.dominantConstraint}/${v.supervisor.actionStatus}) nd=${ndOk} safe=${safeOk} proof=${proofOk}`,
      };
      if (ok) pass++; else failures.push(`${s.scenarioId}: ${results[s.scenarioId].failureReason}`);
    }
    expect(Object.keys(results).length).toBe(150);
    expect(pass, `failures:\n${failures.slice(0, 20).join("\n")}`).toBe(150);
  }, 600000);

  it("[db] all five action statuses appear; no high-risk/gamed case proceeds", () => {
    const seen = new Set(Object.values(results).map((r) => r.got.status));
    for (const st of ["blocked", "need_more_data", "owner_decision_required", "cautious_proceed", "proceed"]) {
      expect(seen.has(st), st).toBe(true);
    }
  });

  it("[db] cross-workspace isolation — a Growth business is invisible under another workspace", async () => {
    const leak = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsOther, businessId: bizId(PACK[0].scenarioId), now: NOW });
    expect(leak.found).toBe(false);
    expect(leak.supervisor.found).toBe(false);
  });
});
