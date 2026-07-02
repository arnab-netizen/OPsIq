/**
 * [db]-gated Sequential Simulations DB proof — EVERY event of ALL 50 simulations seeded into isolated businesses and
 * run through the REAL `getOwnerWholeBusinessPlan`. Each event resolves to its intended disposition: a routine
 * reversible step → proceed/cautious; a decision missing its figures → need_more_data; a binding constraint →
 * owner_decision; a compliance/proof boundary → blocked. A simulation PASSES iff ALL its events pass. NO owner-gated
 * / boundary / missing-data / gamed event ever proceeds. Writes a per-sim + per-event run-ledger. Requires
 * TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { PrismaClient } from "@/generated/prisma/client";
import { BUSINESS_SIMULATION_PACK as PACK, BUSINESS_SIMULATION_EVENTS } from "@/domain/scenarios/business-simulation-pack";
import { seedSimulationEvent } from "../../../scripts/seed-business-simulation-scenarios";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");
const ws = randomUUID();
const wsOther = randomUUID();
const userId = randomUUID();

const PROCEEDISH = new Set(["proceed", "cautious_proceed"]);

/** Workspace-scoped, deterministic business id per event (isolated from the browser's global id). */
function bizId(eventId: string): string {
  let h = 5381;
  for (const c of `${ws}:sim:${eventId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}f2da`;
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

type EventResult = { eventId: string; ok: boolean; got: { dominant: string; status: string }; failureReason: string | null };
const perSim: Record<string, { category: string; simStatus: string; events: EventResult[] }> = {};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Sequential Simulations pack — every event of all 50 sims DB-backed", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({
      where: { id: userId }, update: {}, create: { id: userId, email: `sim-${userId}@example.com`, name: "SIM", isActive: true, updatedAt: NOW },
    });
    await ensureWorkspace(ws); await ensureWorkspace(wsOther);
    for (const { event } of BUSINESS_SIMULATION_EVENTS) await seedSimulationEvent(prisma, ws, userId, bizId(event.eventId), event, NOW);
  }, 1200000);

  afterAll(async () => {
    const totalEvents = Object.values(perSim).reduce((n, s) => n + s.events.length, 0);
    const passSims = Object.values(perSim).filter((s) => s.simStatus === "pass").length;
    writeFileSync(join(process.cwd(), "OPSIQ_SEQUENTIAL_SIMULATIONS_PACK.run.json"),
      JSON.stringify({ layer: "db", sims: Object.keys(perSim).length, passSims, events: totalEvents, results: perSim }, null, 2) + "\n", "utf8");
    await cleanupWorkspace(ws); await cleanupWorkspace(wsOther);
  }, 120000);

  it("[db] every event of all 50 sims resolves to its intended disposition; none unsafe", async () => {
    expect(PACK.length).toBe(50);
    let passSims = 0; const simFailures: string[] = [];
    for (const sim of PACK) {
      const events: EventResult[] = [];
      for (const event of sim.events) {
        const v = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: ws, businessId: bizId(event.eventId), now: NOW });
        const statOk = v.supervisor.actionStatus === event.expectedDecision;
        const domOk = v.dominantConstraint === event.expectedDominant;
        const ndOk = event.expectedDecision !== "need_more_data" || (v.data.criticalDomainsRealProviderBacked === false && v.supervisor.confidence !== "high");
        const material = event.expectedDecision === "owner_decision_required" || event.expectedDecision === "blocked" || event.expectedDecision === "need_more_data";
        const safeOk = !material || !PROCEEDISH.has(v.supervisor.actionStatus);
        const proofOk = v.supervisor.proofNeeded.length > 0 && v.supervisor.cadence.reassessmentTrigger.length > 0;
        const ok = statOk && domOk && ndOk && safeOk && proofOk;
        events.push({
          eventId: event.eventId, ok,
          got: { dominant: String(v.dominantConstraint), status: v.supervisor.actionStatus },
          failureReason: ok ? null : `exp(${event.expectedDominant}/${event.expectedDecision}) got(${v.dominantConstraint}/${v.supervisor.actionStatus}) nd=${ndOk} safe=${safeOk} proof=${proofOk}`,
        });
      }
      const simOk = events.every((e) => e.ok);
      perSim[sim.simulationId] = { category: sim.category, simStatus: simOk ? "pass" : "fail", events };
      if (simOk) passSims++; else simFailures.push(`${sim.simulationId}: ${events.filter((e) => !e.ok).map((e) => e.failureReason).slice(0, 3).join(" | ")}`);
    }
    expect(Object.keys(perSim).length).toBe(50);
    expect(passSims, `sim failures:\n${simFailures.slice(0, 15).join("\n")}`).toBe(50);
  }, 1800000);

  it("[db] all five action statuses appear across the corpus", () => {
    const seen = new Set(Object.values(perSim).flatMap((s) => s.events.map((e) => e.got.status)));
    for (const st of ["blocked", "need_more_data", "owner_decision_required", "cautious_proceed", "proceed"]) {
      expect(seen.has(st), st).toBe(true);
    }
  });

  it("[db] no owner-gated / boundary / missing-data / gamed event ever proceeds", () => {
    for (const sim of PACK) {
      for (const event of sim.events) {
        if (event.expectedDecision === "owner_decision_required" || event.expectedDecision === "blocked" || event.expectedDecision === "need_more_data") {
          const got = perSim[sim.simulationId].events.find((e) => e.eventId === event.eventId)!;
          expect(PROCEEDISH.has(got.got.status), event.eventId).toBe(false);
        }
      }
    }
  });

  it("[db] cross-workspace isolation — a simulation-event business is invisible under another workspace", async () => {
    const firstEvent = PACK[0].events[0];
    const leak = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: wsOther, businessId: bizId(firstEvent.eventId), now: NOW });
    expect(leak.found).toBe(false);
    expect(leak.supervisor.found).toBe(false);
  });
});
