/**
 * Seed ANY Staff/Proof/Anti-Gaming pack scenario into the DB so the real `getOwnerWholeBusinessPlan` resolves
 * the scenario's intended disposition (need_more_data via critical-data strip = demand fresh proof; blocked via
 * proof_fraud/compliance; owner_decision via a binding constraint; cautious/proceed via an owner SOP grant on
 * verified proof). Reuses the proven `seedScenarioBusiness` row-writers + `chaosScenarioToKnobs`. No new engine.
 */
import { seedScenarioBusiness } from "./seed-owner-scenarios";
import { chaosScenarioToKnobs } from "./seed-chaos-scenarios";
import type { StaffProofScenario } from "../src/domain/scenarios/staff-proof-anti-gaming-pack";
import type { PrismaClient } from "../src/generated/prisma/client";

/** Deterministic, globally-stable business id per Staff/Proof scenarioId (used by the browser seed + specs). */
export function staffProofBusinessId(scenarioId: string): string {
  let h = 5381;
  for (const c of `spa:${scenarioId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}fada`;
}

/** Seed ONE Staff/Proof scenario as an isolated business. Returns the businessId seeded. */
export async function seedStaffProofScenario(
  prisma: PrismaClient, ws: string, userId: string, businessId: string, scenario: StaffProofScenario, now: Date,
): Promise<string> {
  await seedScenarioBusiness(
    prisma, ws, userId, businessId, `SPA: ${scenario.scenarioId}`,
    chaosScenarioToKnobs(scenario.seed.dominant), now,
    scenario.seed.sopRiskClass, scenario.seed.stripCriticalData,
  );
  return businessId;
}

/** Seed ALL 120 Staff/Proof scenarios into one workspace (idempotent). Used by the browser seed + CI. */
export async function seedAllStaffProofScenarios(prisma: PrismaClient, ws: string, userId: string, now: Date): Promise<number> {
  const { STAFF_PROOF_ANTI_GAMING_PACK } = await import("../src/domain/scenarios/staff-proof-anti-gaming-pack");
  for (const s of STAFF_PROOF_ANTI_GAMING_PACK) {
    await seedStaffProofScenario(prisma, ws, userId, staffProofBusinessId(s.scenarioId), s, now);
  }
  return STAFF_PROOF_ANTI_GAMING_PACK.length;
}
