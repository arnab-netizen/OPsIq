/**
 * [db]-gated Unknown/OOD DB proof — all 110 pack scenarios seeded into isolated businesses and run through the
 * REAL `getOwnerWholeBusinessPlan`. Each resolves to its intended disposition; the safety behaviour is proven
 * on real data: novelty with missing critical data → need_more_data (confidence NOT high, not real-backed);
 * boundary/proof → blocked; material unknown → owner_decision; NO high-risk / professional-review / guardrail
 * case ever proceeds. Writes a run-ledger artifact. Requires TEST_WITH_DB=true (postgres:16).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { PrismaClient } from "@/generated/prisma/client";
import { UNKNOWN_OOD_PACK } from "@/domain/scenarios/unknown-ood-pack";
import { seedOodScenario } from "../../../scripts/seed-ood-scenarios";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");
const ws = randomUUID();
const wsOther = randomUUID();
const userId = randomUUID();

/** ws-scoped unique business id (never collide with the browser's stable ids). */
function bizId(scenarioId: string): string {
  let h = 5381;
  for (const c of `${ws}:ood:${scenarioId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}f11d`;
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

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Unknown/OOD pack — all 110 DB-backed", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({
      where: { id: userId }, update: {}, create: { id: userId, email: `ood-${userId}@example.com`, name: "OOD", isActive: true, updatedAt: NOW },
    });
    await ensureWorkspace(ws); await ensureWorkspace(wsOther);
    for (const s of UNKNOWN_OOD_PACK) await seedOodScenario(prisma, ws, userId, bizId(s.scenarioId), s, NOW);
  }, 600000);

  afterAll(async () => {
    writeFileSync(join(process.cwd(), "OPSIQ_UNKNOWN_OOD_PACK.run.json"),
      JSON.stringify({ layer: "db", count: Object.keys(results).length, results }, null, 2) + "\n", "utf8");
    await cleanupWorkspace(ws); await cleanupWorkspace(wsOther);
  }, 120000);

  it("[db] all 110 resolve to their intended disposition; novelty never fakes confidence; none unsafe-proceeds", async () => {
    expect(UNKNOWN_OOD_PACK.length).toBe(110);
    let pass = 0; const failures: string[] = [];
    for (const s of UNKNOWN_OOD_PACK) {
      const v = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: ws, businessId: bizId(s.scenarioId), now: NOW });
      const statOk = v.supervisor.actionStatus === s.expectedActionStatus;
      const domOk = v.dominantConstraint === s.expectedDominantConstraint;
      // novelty/need_more_data: not real-backed + confidence not high (never fake confidence).
      const ndOk = s.expectedActionStatus !== "need_more_data" || (v.data.criticalDomainsRealProviderBacked === false && v.supervisor.confidence !== "high");
      // safety: high-risk / professional-review / guardrail must NEVER read as proceed.
      const mustNotProceed = s.highRisk || s.professionalReviewRequired || s.knownToUnknownTag === "unknown_unknown_guardrail";
      const safeOk = !mustNotProceed || (v.supervisor.actionStatus !== "proceed" && v.supervisor.actionStatus !== "cautious_proceed");
      // proof + reassessment always present.
      const proofOk = v.supervisor.proofNeeded.length > 0 && v.supervisor.cadence.reassessmentTrigger.length > 0;
      const ok = statOk && domOk && ndOk && safeOk && proofOk;
      results[s.scenarioId] = {
        dbStatus: ok ? "pass" : "fail", ownerRuntimeStatus: (statOk && domOk) ? "pass" : "fail",
        got: { dominant: String(v.dominantConstraint), status: v.supervisor.actionStatus },
        failureReason: ok ? null : `exp(${s.expectedDominantConstraint}/${s.expectedActionStatus}) got(${v.dominantConstraint}/${v.supervisor.actionStatus}) nd=${ndOk} safe=${safeOk} proof=${proofOk}`,
      };
      if (ok) pass++; else failures.push(`${s.scenarioId}: ${results[s.scenarioId].failureReason}`);
    }
    expect(Object.keys(results).length).toBe(110);
    expect(pass, `failures:\n${failures.slice(0, 20).join("\n")}`).toBe(110);
  }, 600000);

  it("[db] all five action statuses appear; no high-risk/guardrail case proceeds", () => {
    const seen = new Set(Object.values(results).map((r) => r.got.status));
    for (const st of ["blocked", "need_more_data", "owner_decision_required", "cautious_proceed", "proceed"]) {
      expect(seen.has(st), st).toBe(true);
    }
  });

  it("[db] cross-workspace isolation — an OOD business is invisible under another workspace", async () => {
    const leak = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsOther, businessId: bizId(UNKNOWN_OOD_PACK[0].scenarioId), now: NOW });
    expect(leak.found).toBe(false);
    expect(leak.supervisor.found).toBe(false);
  });
});
