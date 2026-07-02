/**
 * Seed ANY Customer/Vendor/Market pack scenario into the DB so the real `getOwnerWholeBusinessPlan` resolves the
 * scenario's intended disposition (proceed via SOP-low grant; cautious via SOP-medium; need_more_data via
 * critical-data strip; owner_decision via a binding constraint; blocked via compliance/proof). Reuses the proven
 * `seedScenarioBusiness` row-writers + `chaosScenarioToKnobs`. No new engine.
 */
import { seedScenarioBusiness } from "./seed-owner-scenarios";
import { chaosScenarioToKnobs } from "./seed-chaos-scenarios";
import type { CustomerVendorScenario } from "../src/domain/scenarios/customer-vendor-market-pack";
import type { PrismaClient } from "../src/generated/prisma/client";

/** Deterministic, globally-stable business id per Customer/Vendor/Market scenarioId (browser seed + specs). */
export function customerVendorBusinessId(scenarioId: string): string {
  let h = 5381;
  for (const c of `cvm:${scenarioId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}c1da`;
}

/** Seed ONE Customer/Vendor/Market scenario as an isolated business. Returns the businessId seeded. */
export async function seedCustomerVendorScenario(
  prisma: PrismaClient, ws: string, userId: string, businessId: string, scenario: CustomerVendorScenario, now: Date,
): Promise<string> {
  await seedScenarioBusiness(
    prisma, ws, userId, businessId, `CVM: ${scenario.scenarioId}`,
    chaosScenarioToKnobs(scenario.seed.dominant), now,
    scenario.seed.sopRiskClass, scenario.seed.stripCriticalData,
  );
  return businessId;
}

/** Seed ALL 100 Customer/Vendor/Market scenarios into one workspace (idempotent). Used by the browser seed + CI. */
export async function seedAllCustomerVendorScenarios(prisma: PrismaClient, ws: string, userId: string, now: Date): Promise<number> {
  const { CUSTOMER_VENDOR_MARKET_PACK } = await import("../src/domain/scenarios/customer-vendor-market-pack");
  for (const s of CUSTOMER_VENDOR_MARKET_PACK) {
    await seedCustomerVendorScenario(prisma, ws, userId, customerVendorBusinessId(s.scenarioId), s, now);
  }
  return CUSTOMER_VENDOR_MARKET_PACK.length;
}
