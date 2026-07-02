/**
 * Seed ANY Ugly/Tail-Risk/Crisis pack scenario into the DB so the real `getOwnerWholeBusinessPlan` resolves the
 * scenario's intended disposition (proceed via SOP-low grant; cautious via SOP-medium; need_more_data via
 * critical-data strip; owner_decision via a binding constraint; blocked via compliance/proof). Reuses the proven
 * `seedScenarioBusiness` row-writers + `chaosScenarioToKnobs`. No new engine.
 */
import { seedScenarioBusiness } from "./seed-owner-scenarios";
import { chaosScenarioToKnobs } from "./seed-chaos-scenarios";
import type { CrisisScenario } from "../src/domain/scenarios/ugly-tail-risk-crisis-pack";
import type { PrismaClient } from "../src/generated/prisma/client";

/** Deterministic, globally-stable business id per Ugly/Tail-Risk/Crisis scenarioId (browser seed + specs). */
export function crisisBusinessId(scenarioId: string): string {
  let h = 5381;
  for (const c of `utr:${scenarioId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}e1da`;
}

/** Seed ONE Ugly/Tail-Risk/Crisis scenario as an isolated business. Returns the businessId seeded. */
export async function seedCrisisScenario(
  prisma: PrismaClient, ws: string, userId: string, businessId: string, scenario: CrisisScenario, now: Date,
): Promise<string> {
  await seedScenarioBusiness(
    prisma, ws, userId, businessId, `UTR: ${scenario.scenarioId}`,
    chaosScenarioToKnobs(scenario.seed.dominant), now,
    scenario.seed.sopRiskClass, scenario.seed.stripCriticalData,
  );
  return businessId;
}

/** Seed ALL 150 Ugly/Tail-Risk/Crisis scenarios into one workspace (idempotent). Used by the browser seed + CI. */
export async function seedAllCrisisScenarios(prisma: PrismaClient, ws: string, userId: string, now: Date): Promise<number> {
  const { UGLY_TAIL_RISK_CRISIS_PACK } = await import("../src/domain/scenarios/ugly-tail-risk-crisis-pack");
  for (const s of UGLY_TAIL_RISK_CRISIS_PACK) {
    await seedCrisisScenario(prisma, ws, userId, crisisBusinessId(s.scenarioId), s, now);
  }
  return UGLY_TAIL_RISK_CRISIS_PACK.length;
}
