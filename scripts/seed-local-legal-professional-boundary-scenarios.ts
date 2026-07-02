/**
 * Seed ANY Local/Legal/Professional-Boundary pack scenario into the DB so the real `getOwnerWholeBusinessPlan`
 * resolves the scenario's intended disposition (proceed via SOP-low grant; cautious via SOP-medium; need_more_data
 * via critical-data strip; owner_decision via a binding constraint; blocked via compliance/proof). Reuses the
 * proven `seedScenarioBusiness` row-writers + `chaosScenarioToKnobs`. No new engine.
 */
import { seedScenarioBusiness } from "./seed-owner-scenarios";
import { chaosScenarioToKnobs } from "./seed-chaos-scenarios";
import type { LocalLegalScenario } from "../src/domain/scenarios/local-legal-professional-boundary-pack";
import type { PrismaClient } from "../src/generated/prisma/client";

/** Deterministic, globally-stable business id per Local/Legal/Boundary scenarioId (browser seed + specs). */
export function localLegalBusinessId(scenarioId: string): string {
  let h = 5381;
  for (const c of `llb:${scenarioId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}d1da`;
}

/** Seed ONE Local/Legal/Boundary scenario as an isolated business. Returns the businessId seeded. */
export async function seedLocalLegalScenario(
  prisma: PrismaClient, ws: string, userId: string, businessId: string, scenario: LocalLegalScenario, now: Date,
): Promise<string> {
  await seedScenarioBusiness(
    prisma, ws, userId, businessId, `LLB: ${scenario.scenarioId}`,
    chaosScenarioToKnobs(scenario.seed.dominant), now,
    scenario.seed.sopRiskClass, scenario.seed.stripCriticalData,
  );
  return businessId;
}

/** Seed ALL 100 Local/Legal/Boundary scenarios into one workspace (idempotent). Used by the browser seed + CI. */
export async function seedAllLocalLegalScenarios(prisma: PrismaClient, ws: string, userId: string, now: Date): Promise<number> {
  const { LOCAL_LEGAL_BOUNDARY_PACK } = await import("../src/domain/scenarios/local-legal-professional-boundary-pack");
  for (const s of LOCAL_LEGAL_BOUNDARY_PACK) {
    await seedLocalLegalScenario(prisma, ws, userId, localLegalBusinessId(s.scenarioId), s, now);
  }
  return LOCAL_LEGAL_BOUNDARY_PACK.length;
}
