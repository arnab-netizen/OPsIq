/**
 * Seed ANY Daily Operations pack scenario into the DB so the real `getOwnerWholeBusinessPlan` resolves the
 * scenario's intended disposition (proceed via SOP-low grant; cautious via SOP-medium; need_more_data via
 * critical-data strip; owner_decision via a binding constraint; blocked via compliance/proof). Reuses the proven
 * `seedScenarioBusiness` row-writers + `chaosScenarioToKnobs`. No new engine.
 */
import { seedScenarioBusiness } from "./seed-owner-scenarios";
import { chaosScenarioToKnobs } from "./seed-chaos-scenarios";
import type { DailyOpsScenario } from "../src/domain/scenarios/daily-operations-pack";
import type { PrismaClient } from "../src/generated/prisma/client";

/** Deterministic, globally-stable business id per Daily Ops scenarioId (used by the browser seed + specs). */
export function dailyOpsBusinessId(scenarioId: string): string {
  let h = 5381;
  for (const c of `dop:${scenarioId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}d0da`;
}

/** Seed ONE Daily Ops scenario as an isolated business. Returns the businessId seeded. */
export async function seedDailyOpsScenario(
  prisma: PrismaClient, ws: string, userId: string, businessId: string, scenario: DailyOpsScenario, now: Date,
): Promise<string> {
  await seedScenarioBusiness(
    prisma, ws, userId, businessId, `DOP: ${scenario.scenarioId}`,
    chaosScenarioToKnobs(scenario.seed.dominant), now,
    scenario.seed.sopRiskClass, scenario.seed.stripCriticalData,
  );
  return businessId;
}

/** Seed ALL 300 Daily Ops scenarios into one workspace (idempotent). Used by the browser seed + CI. */
export async function seedAllDailyOpsScenarios(prisma: PrismaClient, ws: string, userId: string, now: Date): Promise<number> {
  const { DAILY_OPERATIONS_PACK } = await import("../src/domain/scenarios/daily-operations-pack");
  for (const s of DAILY_OPERATIONS_PACK) {
    await seedDailyOpsScenario(prisma, ws, userId, dailyOpsBusinessId(s.scenarioId), s, now);
  }
  return DAILY_OPERATIONS_PACK.length;
}
