/**
 * C17 — Archetype collective simulations (universal / laundry / housekeeping).
 *
 * 30 cases per archetype (= 6 archetype-relevant dominants × 5 scenario types) = 90
 * scored collective cases. The archetype shapes which domains are in play (laundry =
 * capacity/quality/pricing/SOP/supplier/retention; housekeeping = staff/owner workload,
 * compliance/roster, quality, capacity, retention), so the engine's binding constraint
 * and primary action differ by archetype — archetype influences the output.
 */

import type { DomainKey } from "@/domain/collective-training/collective-types";
import type { CollectiveCase } from "@/domain/collective-training/simulation/collective-scoring";
import { buildDominantCase } from "@/domain/collective-training/simulation/conflict-pairs.cases";

const SCEN = ["normal", "adversarial", "missing_data", "owner_pressure", "false_success"] as const;

interface ArchPack { archetype: string; dominants: { domain: DomainKey; goal: string }[] }

const ARCHETYPES: ArchPack[] = [
  {
    archetype: "universal",
    dominants: [
      { domain: "cash-survival", goal: "spend on marketing" },
      { domain: "profit-improvement", goal: "chase revenue" },
      { domain: "quality", goal: "run a campaign" },
      { domain: "capacity", goal: "take more work" },
      { domain: "retention", goal: "spend on acquisition" },
      { domain: "risk-compliance", goal: "move fast" },
    ],
  },
  {
    archetype: "laundry",
    dominants: [
      { domain: "capacity", goal: "accept more wash volume than machines allow" },
      { domain: "quality", goal: "market the laundry while rewash rate is high" },
      { domain: "pricing-decisions", goal: "discount per-kg pricing to win volume" },
      { domain: "sop-process", goal: "scale a second branch before the wash SOP is stable" },
      { domain: "supplier-inventory", goal: "switch to a cheaper detergent supplier" },
      { domain: "retention", goal: "chase new customers while regulars churn" },
    ],
  },
  {
    archetype: "housekeeping",
    dominants: [
      { domain: "staff-workload", goal: "add more cleaning jobs to an overloaded roster" },
      { domain: "owner-workload", goal: "have the owner clean and manage every site" },
      { domain: "risk-compliance", goal: "skip the labour/safety sign-off to move fast" },
      { domain: "quality", goal: "market while cleaning complaints are rising" },
      { domain: "capacity", goal: "promise more sites than the team can staff" },
      { domain: "retention", goal: "spend on ads while client contracts lapse" },
    ],
  },
];

function archetypeCases(pack: ArchPack): CollectiveCase[] {
  return pack.dominants.flatMap((d, di) =>
    SCEN.map((scen) => buildDominantCase(
      `C17-${pack.archetype}-${di}-${scen}`, `arch-${pack.archetype}`, d.domain, d.goal, scen, { archetype: pack.archetype })));
}

export const ARCHETYPE_PACK_CASES: CollectiveCase[] = ARCHETYPES.flatMap(archetypeCases);
export const ARCHETYPE_NAMES = ARCHETYPES.map((a) => a.archetype);
