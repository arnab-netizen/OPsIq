/**
 * Seed ANY Weekly Management/Trend pack scenario into the DB so the real `getOwnerWholeBusinessPlan` resolves the
 * scenario's intended disposition (proceed via SOP-low grant; cautious via SOP-medium; need_more_data via
 * critical-data strip; owner_decision via a binding constraint; blocked via compliance/proof). Reuses the proven
 * `seedScenarioBusiness` row-writers + `chaosScenarioToKnobs`. No new engine.
 */
import { seedScenarioBusiness } from "./seed-owner-scenarios";
import { chaosScenarioToKnobs } from "./seed-chaos-scenarios";
import type { WeeklyTrendScenario } from "../src/domain/scenarios/weekly-management-trend-pack";
import type { PrismaClient } from "../src/generated/prisma/client";

/** Deterministic, globally-stable business id per Weekly Management/Trend scenarioId (browser seed + specs). */
export function weeklyBusinessId(scenarioId: string): string {
  let h = 5381;
  for (const c of `wky:${scenarioId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}a1da`;
}

/** Seed ONE Weekly Management/Trend scenario as an isolated business. Returns the businessId seeded. */
export async function seedWeeklyScenario(
  prisma: PrismaClient, ws: string, userId: string, businessId: string, scenario: WeeklyTrendScenario, now: Date,
): Promise<string> {
  await seedScenarioBusiness(
    prisma, ws, userId, businessId, `WKY: ${scenario.scenarioId}`,
    chaosScenarioToKnobs(scenario.seed.dominant), now,
    scenario.seed.sopRiskClass, scenario.seed.stripCriticalData,
  );
  return businessId;
}

/** Seed ALL 150 Weekly Management/Trend scenarios into one workspace (idempotent). Used by the browser seed + CI. */
export async function seedAllWeeklyScenarios(prisma: PrismaClient, ws: string, userId: string, now: Date): Promise<number> {
  const { WEEKLY_MANAGEMENT_TREND_PACK } = await import("../src/domain/scenarios/weekly-management-trend-pack");
  for (const s of WEEKLY_MANAGEMENT_TREND_PACK) {
    await seedWeeklyScenario(prisma, ws, userId, weeklyBusinessId(s.scenarioId), s, now);
  }
  return WEEKLY_MANAGEMENT_TREND_PACK.length;
}
