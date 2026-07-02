/**
 * Seed ANY Finance/Cash pack scenario into the DB so the real `getOwnerWholeBusinessPlan` resolves the intended
 * disposition. Reuses the proven `seedScenarioBusiness` + `chaosScenarioToKnobs`. No new engine.
 */
import { seedScenarioBusiness } from "./seed-owner-scenarios";
import { chaosScenarioToKnobs } from "./seed-chaos-scenarios";
import type { FinanceScenario } from "../src/domain/scenarios/finance-cash-pack";
import type { PrismaClient } from "../src/generated/prisma/client";

export function financeBusinessId(scenarioId: string): string {
  let h = 5381;
  for (const c of `fin:${scenarioId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}f1da`;
}

export async function seedFinanceScenario(
  prisma: PrismaClient, ws: string, userId: string, businessId: string, scenario: FinanceScenario, now: Date,
): Promise<string> {
  await seedScenarioBusiness(
    prisma, ws, userId, businessId, `FIN: ${scenario.scenarioId}`,
    chaosScenarioToKnobs(scenario.seed.dominant), now,
    scenario.seed.sopRiskClass, scenario.seed.stripCriticalData,
  );
  return businessId;
}

export async function seedAllFinanceScenarios(prisma: PrismaClient, ws: string, userId: string, now: Date): Promise<number> {
  const { FINANCE_CASH_PACK } = await import("../src/domain/scenarios/finance-cash-pack");
  for (const s of FINANCE_CASH_PACK) await seedFinanceScenario(prisma, ws, userId, financeBusinessId(s.scenarioId), s, now);
  return FINANCE_CASH_PACK.length;
}
