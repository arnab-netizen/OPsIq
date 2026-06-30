/**
 * [db]-gated EXHAUSTIVE all-180 DB-backed chaos replay (§4). Every one of the 180 counted scenarios (165
 * source-backed corpus + 15 independent gold) is seeded into its OWN isolated business and run through the
 * REAL `getOwnerWholeBusinessPlan`. Each is graded against the LOCKED ledger expectation (dominant + DB
 * action status). Proves: all 180 are DB-backed (real provider data, not static/fallback), every dominant
 * matches gold, every status obeys the PR #63 policy (compliance/proof → blocked; every other binding
 * constraint → owner_decision_required; NO chaos case ever proceeds/cautious-proceeds), proof + reassessment
 * present, impact surfaced, no fake confidence, and no cross-business / cross-workspace leakage.
 *
 * Writes a run-results artifact (OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_LEDGER.run.json) recording dbBackedStatus +
 * supervisorSummaryStatus per scenarioId for the report. Requires TEST_WITH_DB=true (postgres:16).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { PrismaClient } from "@/generated/prisma/client";
import { CHAOS_LEDGER, EXPECTED_LEDGER_COUNT, type LayerStatus } from "@/behavioral-validation/chaos-replay/chaos-ledger";
import { seedChaosScenario } from "../../../../scripts/seed-chaos-scenarios";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");
const ws = randomUUID();
const wsOther = randomUUID();
const userId = randomUUID();

/** Deterministic business id per scenario (unique per scenarioId → 180 isolated businesses in one ws). */
function bizIdFor(scenarioId: string): string {
  let h = 5381;
  for (const c of `chaos:${scenarioId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}c0de`;
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

const results: Record<string, { dbBackedStatus: LayerStatus; supervisorSummaryStatus: LayerStatus; businessScopeStatus: LayerStatus; got: { dominant: string; status: string }; failureReason: string | null }> = {};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] EXHAUSTIVE all-180 chaos DB replay (§4)", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({
      where: { id: userId }, update: {}, create: { id: userId, email: `exh-${userId}@example.com`, name: "EXH", isActive: true, updatedAt: NOW },
    });
    await ensureWorkspace(ws);
    await ensureWorkspace(wsOther);
    for (const e of CHAOS_LEDGER) {
      await seedChaosScenario(prisma, ws, userId, bizIdFor(e.scenarioId), e, NOW);
    }
  }, 600000);

  afterAll(async () => {
    writeFileSync(
      join(process.cwd(), "OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_LEDGER.run.json"),
      JSON.stringify({ layer: "db", count: Object.keys(results).length, results }, null, 2) + "\n", "utf8",
    );
    await cleanupWorkspace(ws); await cleanupWorkspace(wsOther);
  }, 120000);

  it("[db] seeds and resolves all 180 counted scenarios to their locked dominant + policy status", async () => {
    expect(CHAOS_LEDGER.length).toBe(EXPECTED_LEDGER_COUNT);
    let pass = 0;
    const failures: string[] = [];
    for (const e of CHAOS_LEDGER) {
      const biz = bizIdFor(e.scenarioId);
      const v = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: ws, businessId: biz, now: NOW });
      const domOk = v.found && v.dominantConstraint === e.expectedDominantConstraint;
      const statOk = v.supervisor.actionStatus === e.expectedActionStatus;
      const realBacked = v.data.criticalDomainsRealProviderBacked === true;
      const proofOk = v.supervisor.proofNeeded.length > 0 && v.supervisor.cadence.reassessmentTrigger.length > 0;
      const impactOk = v.supervisor.impact.some((m) => m.relevant);
      // never fake confidence: a blocked/owner-decision case with full data is not "none"; missing data is not "high".
      const confOk = v.data.criticalDomainsAllReal ? v.supervisor.confidence !== "none" : v.supervisor.confidence !== "high";
      // SAFETY: no chaos case may read as proceed/cautious.
      const safe = v.supervisor.actionStatus !== "proceed" && v.supervisor.actionStatus !== "cautious_proceed";
      const ok = domOk && statOk && realBacked && proofOk && impactOk && confOk && safe;
      const reason = ok ? null : `exp(${e.expectedDominantConstraint}/${e.expectedActionStatus}) got(${v.dominantConstraint}/${v.supervisor.actionStatus}) realBacked=${realBacked} proof=${proofOk} impact=${impactOk} conf=${confOk} safe=${safe}`;
      results[e.scenarioId] = {
        dbBackedStatus: (domOk && realBacked) ? "pass" : "fail",
        supervisorSummaryStatus: (statOk && proofOk && impactOk && confOk && safe) ? "pass" : "fail",
        businessScopeStatus: realBacked ? "pass" : "fail",
        got: { dominant: String(v.dominantConstraint), status: v.supervisor.actionStatus },
        failureReason: reason,
      };
      if (ok) pass++; else failures.push(`${e.scenarioId}: ${reason}`);
    }
    expect(Object.keys(results).length, "every scenario ran").toBe(EXPECTED_LEDGER_COUNT);
    expect(pass, `failures:\n${failures.slice(0, 25).join("\n")}`).toBe(EXPECTED_LEDGER_COUNT);
  }, 600000);

  it("[db] both genuine chaos statuses appear and NO chaos scenario proceeds", () => {
    const seen = new Set(Object.values(results).map((r) => r.got.status));
    expect(seen.has("blocked")).toBe(true);
    expect(seen.has("owner_decision_required")).toBe(true);
    expect(seen.has("proceed")).toBe(false);
    expect(seen.has("cautious_proceed")).toBe(false);
  });

  it("[db] cross-business isolation — each of a sample resolves independently (no bleed)", async () => {
    const sample = [CHAOS_LEDGER[0], CHAOS_LEDGER[40], CHAOS_LEDGER[90], CHAOS_LEDGER[150], CHAOS_LEDGER[179]];
    const doms = new Set<string>();
    for (const e of sample) {
      const v = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: ws, businessId: bizIdFor(e.scenarioId), now: NOW });
      expect(v.dominantConstraint).toBe(e.expectedDominantConstraint);
      doms.add(String(v.dominantConstraint));
    }
    expect(doms.size).toBeGreaterThanOrEqual(3);
  });

  it("[db] cross-workspace isolation — a seeded business is invisible under another workspace", async () => {
    const leak = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsOther, businessId: bizIdFor(CHAOS_LEDGER[0].scenarioId), now: NOW });
    expect(leak.found).toBe(false);
    expect(leak.supervisor.found).toBe(false);
  });
});
