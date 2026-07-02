/**
 * Seed ANY Growth/Profit/Scaling pack scenario into the DB so the real `getOwnerWholeBusinessPlan` resolves the
 * scenario's intended disposition (proceed via SOP-low grant; cautious via SOP-medium; need_more_data via
 * critical-data strip; owner_decision via a binding constraint; blocked via compliance/proof). Reuses the proven
 * `seedScenarioBusiness` row-writers + `chaosScenarioToKnobs`. No new engine.
 */
import { seedScenarioBusiness } from "./seed-owner-scenarios";
import { chaosScenarioToKnobs } from "./seed-chaos-scenarios";
import type { GrowthScenario } from "../src/domain/scenarios/growth-profit-scaling-pack";
import type { PrismaClient } from "../src/generated/prisma/client";

/** Deterministic, globally-stable business id per Growth/Profit/Scaling scenarioId (browser seed + specs). */
export function growthBusinessId(scenarioId: string): string {
  let h = 5381;
  for (const c of `grw:${scenarioId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}b1da`;
}

/** Seed ONE Growth/Profit/Scaling scenario as an isolated business. Returns the businessId seeded. */
export async function seedGrowthScenario(
  prisma: PrismaClient, ws: string, userId: string, businessId: string, scenario: GrowthScenario, now: Date,
): Promise<string> {
  await seedScenarioBusiness(
    prisma, ws, userId, businessId, `GRW: ${scenario.scenarioId}`,
    chaosScenarioToKnobs(scenario.seed.dominant), now,
    scenario.seed.sopRiskClass, scenario.seed.stripCriticalData,
  );
  return businessId;
}

/** Seed ALL 150 Growth/Profit/Scaling scenarios into one workspace (idempotent). Used by the browser seed + CI. */
export async function seedAllGrowthScenarios(prisma: PrismaClient, ws: string, userId: string, now: Date): Promise<number> {
  const { GROWTH_PROFIT_SCALING_PACK } = await import("../src/domain/scenarios/growth-profit-scaling-pack");
  for (const s of GROWTH_PROFIT_SCALING_PACK) {
    await seedGrowthScenario(prisma, ws, userId, growthBusinessId(s.scenarioId), s, now);
  }
  return GROWTH_PROFIT_SCALING_PACK.length;
}
