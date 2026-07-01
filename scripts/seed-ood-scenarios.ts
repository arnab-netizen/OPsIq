/**
 * Seed ANY Unknown/OOD pack scenario into the DB so the real `getOwnerWholeBusinessPlan` resolves the
 * scenario's intended disposition (need_more_data via critical-data strip, blocked via compliance/proof,
 * owner_decision via a binding constraint, cautious/proceed via an owner SOP grant). Reuses the proven
 * `seedScenarioBusiness` row-writers + `chaosScenarioToKnobs`. No new engine.
 */
import { seedScenarioBusiness } from "./seed-owner-scenarios";
import { chaosScenarioToKnobs } from "./seed-chaos-scenarios";
import type { OodScenario } from "../src/domain/scenarios/unknown-ood-pack";
import type { PrismaClient } from "../src/generated/prisma/client";

/** Deterministic, globally-stable business id per OOD scenarioId (used by the browser seed + specs). */
export function oodBusinessId(scenarioId: string): string {
  let h = 5381;
  for (const c of `ood:${scenarioId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}f00d`;
}

/** Seed ONE OOD scenario as an isolated business. Returns the businessId seeded. */
export async function seedOodScenario(
  prisma: PrismaClient, ws: string, userId: string, businessId: string, scenario: OodScenario, now: Date,
): Promise<string> {
  await seedScenarioBusiness(
    prisma, ws, userId, businessId, `OOD: ${scenario.scenarioId}`,
    chaosScenarioToKnobs(scenario.seed.dominant), now,
    scenario.seed.sopRiskClass, scenario.seed.stripCriticalData,
  );
  return businessId;
}

/** Seed ALL 110 OOD scenarios into one workspace (idempotent). Used by the browser seed + CI. */
export async function seedAllOodScenarios(prisma: PrismaClient, ws: string, userId: string, now: Date): Promise<number> {
  const { UNKNOWN_OOD_PACK } = await import("../src/domain/scenarios/unknown-ood-pack");
  for (const s of UNKNOWN_OOD_PACK) {
    await seedOodScenario(prisma, ws, userId, oodBusinessId(s.scenarioId), s, now);
  }
  return UNKNOWN_OOD_PACK.length;
}
