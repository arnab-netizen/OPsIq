/**
 * Seed ANY counted chaos-ledger scenario into the DB so the real `getOwnerWholeBusinessPlan` resolves the
 * scenario's locked dominant constraint + intended action status. Reuses the proven `seedScenarioBusiness`
 * row-writers (cashflow/finance/working-capital/capacity/compliance/proof/workload/standing-instruction)
 * and adds:
 *   - a deterministic dominant→knobs mapping (`chaosScenarioToKnobs`);
 *   - the additive customer-reputation metric snapshot for customer_quality scenarios;
 *   - the optional `owner.safe-action-approved` SOP grant (proceed/cautious) and critical-data strip
 *     (need_more_data) carried by the ledger seed plan.
 *
 * Every business is workspace+business scoped (isolated) — co-seeded businesses never bleed.
 */
import { seedScenarioBusiness } from "./seed-owner-scenarios";
import type { ScenarioKnobs } from "../src/services/owner-mode/owner-scenario-profiles";
import type { ChaosLedgerEntry } from "../src/behavioral-validation/chaos-replay/chaos-ledger";
import type { Constraint } from "../src/behavioral-validation/whole-business/arbitration";
import type { PrismaClient } from "../src/generated/prisma/client";

const day = 86_400_000;

/** Genuinely-healthy baseline — resolves to profitable_growth unless a knob/metric binds a constraint. */
const HEALTHY: ScenarioKnobs = {
  cashInHand: 60000, receivablesOverdue: 0, overdueWcReceivable: false,
  revenue: 320000, costOfGoods: 240000, bottleneckUtilization: 0.6, growthSafe: true,
  complianceExpired: false, proofDuplicate: false, proofUnsubmitted: false, workloadOverloaded: false,
};

/** Deterministic dominant-constraint → seed knobs. customer_quality is driven by the reputation metric
 *  (HEALTHY knobs keep every higher-priority constraint inactive so customer_quality binds). */
export function chaosScenarioToKnobs(dominant: Constraint): ScenarioKnobs {
  switch (dominant) {
    case "cash_survival": return { ...HEALTHY, cashInHand: 0, receivablesOverdue: 80000, overdueWcReceivable: true };
    case "below_margin": return { ...HEALTHY, revenue: 200000, costOfGoods: 240000 };
    case "capacity_feasibility": return { ...HEALTHY, bottleneckUtilization: 1.2, growthSafe: false };
    case "owner_workload": return { ...HEALTHY, workloadOverloaded: true };
    case "proof_fraud_block": return { ...HEALTHY, proofDuplicate: true };
    case "compliance_block": return { ...HEALTHY, complianceExpired: true };
    case "customer_quality": return { ...HEALTHY }; // reputation metric (below) binds customer_quality
    case "profitable_growth": return { ...HEALTHY };
    default: return { ...HEALTHY };
  }
}

/** Deterministic, unique business id per scenarioId (shared by the DB seed + the Playwright spec). */
export function chaosBusinessId(scenarioId: string): string {
  let h = 5381;
  for (const c of `chaos:${scenarioId}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  return `00000000-0000-4000-8000-${node}c0de`;
}

const ridLike = (businessId: string, seed: string) => {
  let h = 5381;
  for (const c of `${businessId}:${seed}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  const tail = Array.from(seed).map((c) => c.charCodeAt(0).toString(16)).join("").slice(0, 4).padStart(4, "0");
  return `00000000-0000-4000-8000-${node}${tail}`;
};

/** Seed ONE counted chaos scenario as an isolated business. Returns the businessId seeded. */
export async function seedChaosScenario(
  prisma: PrismaClient, ws: string, userId: string, businessId: string, entry: ChaosLedgerEntry, now: Date,
): Promise<string> {
  const knobs = chaosScenarioToKnobs(entry.seed.dominant);
  await seedScenarioBusiness(
    prisma, ws, userId, businessId, `Chaos: ${entry.scenarioId}`, knobs, now,
    entry.seed.sopRiskClass, entry.seed.stripCriticalData,
  );
  // customer_quality scenarios need the additive reputation metric (complaints/rework) to bind the
  // customer-quality constraint through the real provider seam.
  if (entry.seed.dominant === "customer_quality") {
    const periodEnd = now, periodStart = new Date(now.getTime() - 30 * day);
    await prisma.ownerMetricSnapshot.upsert({
      where: { id: ridLike(businessId, "metric1") },
      update: { complaintCount: 14, rewashCount: 9, refundAmount: 12000 },
      create: {
        id: ridLike(businessId, "metric1"), workspaceId: ws, businessId, periodStart, periodEnd, currency: "INR",
        revenue: knobs.revenue, complaintCount: 14, rewashCount: 9, refundAmount: 12000, createdBy: userId,
      },
    });
  }
  return businessId;
}

/** Seed ALL 180 counted chaos scenarios into one workspace (idempotent). Used by the browser seed + CI. */
export async function seedAllChaosScenarios(prisma: PrismaClient, ws: string, userId: string, now: Date): Promise<number> {
  const { CHAOS_LEDGER } = await import("../src/behavioral-validation/chaos-replay/chaos-ledger");
  for (const e of CHAOS_LEDGER) {
    await seedChaosScenario(prisma, ws, userId, chaosBusinessId(e.scenarioId), e, now);
  }
  return CHAOS_LEDGER.length;
}
