/**
 * Seed ANY sequential-simulation EVENT into the DB so the real `getOwnerWholeBusinessPlan` resolves that event's
 * intended disposition (proceed via SOP-low grant; cautious via SOP-medium; need_more_data via critical-data strip;
 * owner_decision via a binding constraint; blocked via compliance/proof). Each event is an isolated business — the
 * DB harness walks every event of every simulation; the browser lanes render one representative event per
 * simulation. Reuses the proven `seedScenarioBusiness` row-writers + `chaosScenarioToKnobs`. No new engine.
 */
import { seedScenarioBusiness } from "./seed-owner-scenarios";
import { chaosScenarioToKnobs } from "./seed-chaos-scenarios";
import type { SimulationEvent } from "../src/domain/scenarios/business-simulation";
import type { BusinessSimulation } from "../src/domain/scenarios/business-simulation";
import type { PrismaClient } from "../src/generated/prisma/client";

/** Deterministic, globally-stable business id per simulation EVENT id (browser seed + specs). */
export function simEventBusinessId(eventId: string): string {
  let h = 5381;
  for (const c of `sim:${eventId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}f1da`;
}

/** Material-disposition priority for choosing a simulation's representative (browser) event. */
const PRIORITY: Record<string, number> = { blocked: 5, owner_decision_required: 4, need_more_data: 3, cautious_proceed: 2, proceed: 1 };

/** The representative event = the LAST event of the highest material priority (a simulation's climax). */
export function representativeEvent(sim: BusinessSimulation): SimulationEvent {
  let best = sim.events[0];
  for (const e of sim.events) {
    if (PRIORITY[e.expectedDecision] >= PRIORITY[best.expectedDecision]) best = e;
  }
  return best;
}

/** Seed ONE simulation event as an isolated business. Returns the businessId seeded. */
export async function seedSimulationEvent(
  prisma: PrismaClient, ws: string, userId: string, businessId: string, event: SimulationEvent, now: Date,
): Promise<string> {
  await seedScenarioBusiness(
    prisma, ws, userId, businessId, `SIM: ${event.eventId}`,
    chaosScenarioToKnobs(event.seed.dominant), now,
    event.seed.sopRiskClass, event.seed.stripCriticalData,
  );
  return businessId;
}

/**
 * Seed the representative event of ALL simulations into one workspace (idempotent). Used by the browser seed + CI.
 * Returns the number of representative businesses seeded (one per simulation).
 */
export async function seedAllSimulationRepresentatives(prisma: PrismaClient, ws: string, userId: string, now: Date): Promise<number> {
  const { BUSINESS_SIMULATION_PACK } = await import("../src/domain/scenarios/business-simulation-pack");
  for (const sim of BUSINESS_SIMULATION_PACK) {
    const event = representativeEvent(sim);
    await seedSimulationEvent(prisma, ws, userId, simEventBusinessId(event.eventId), event, now);
  }
  return BUSINESS_SIMULATION_PACK.length;
}
