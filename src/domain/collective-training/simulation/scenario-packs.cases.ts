/**
 * C16 — Multi-domain scenario packs C1–C12 (10 cases each = 120 scored collective cases).
 *
 * Each pack encodes a real cross-domain situation and its required governed behavior,
 * reproduced by the C18 engine. 10 cases per pack = the 5 scenario types × 2 rounds
 * (the second round adds a benign extra signal to vary the board).
 */

import type { DomainKey } from "@/domain/collective-training/collective-types";
import type { CollectiveCase } from "@/domain/collective-training/simulation/collective-scoring";
import { buildDominantCase, buildGovernanceCase, type ContradictionSeed, type GovKind } from "@/domain/collective-training/simulation/conflict-pairs.cases";

const SCEN = ["normal", "adversarial", "missing_data", "owner_pressure", "false_success"] as const;

interface PackDef {
  pack: string;
  goal: string;
  kind: "dom" | "gov";
  dominant?: DomainKey;
  govKind?: GovKind;
  contradiction?: ContradictionSeed;
  round2Green: DomainKey;
}

const PACKS: PackDef[] = [
  { pack: "C1-low-cash-wants-marketing", kind: "dom", dominant: "cash-survival", goal: "spend on broad marketing", round2Green: "marketing" },
  { pack: "C2-revenue-up-profit-down", kind: "dom", dominant: "profit-improvement", goal: "keep chasing revenue", contradiction: { revenueUp: true, profitDown: true }, round2Green: "marketing" },
  { pack: "C3-staff-overloaded-wants-growth", kind: "dom", dominant: "staff-workload", goal: "grow demand now", round2Green: "marketing" },
  { pack: "C4-quality-unstable-marketing-performing", kind: "dom", dominant: "quality", goal: "double down on the campaign", contradiction: { marketingClaimedSuccess: true, complaintsUp: true }, round2Green: "marketing" },
  { pack: "C5-high-demand-weak-sop", kind: "dom", dominant: "sop-process", goal: "scale to meet demand", round2Green: "capacity" },
  { pack: "C6-good-cash-weak-retention", kind: "dom", dominant: "retention", goal: "spend on acquisition", round2Green: "marketing" },
  { pack: "C7-cheap-supplier-damages-quality", kind: "dom", dominant: "supplier-inventory", goal: "keep the cheaper supplier", contradiction: { supplierCostSaved: true, supplierQualityHarm: true }, round2Green: "quality" },
  { pack: "C8-owner-wants-to-fire-staff", kind: "dom", dominant: "risk-compliance", goal: "fire the underperformer today", round2Green: "staff-workload" },
  { pack: "C9-b2b-grows-revenue-consumes-capacity", kind: "dom", dominant: "capacity", goal: "take the big B2B account", contradiction: { revenueUp: true, profitDown: true }, round2Green: "marketing" },
  { pack: "C10-expansion-before-stability", kind: "dom", dominant: "scale-readiness", goal: "open the second site", round2Green: "sop-process" },
  { pack: "C11-complaints-low-repeat-falling", kind: "dom", dominant: "retention", goal: "assume quality is fine", round2Green: "customer-complaints" },
  { pack: "C12-owner-success-data-contradicts", kind: "gov", govKind: "owner_evidence", goal: "log the owner's reported win", round2Green: "marketing" },
];

function packCases(def: PackDef): CollectiveCase[] {
  const out: CollectiveCase[] = [];
  for (let i = 0; i < 10; i++) {
    const scen = SCEN[i % 5];
    const round = i < 5 ? 1 : 2;
    const idTag = `C16-${def.pack}-${scen}-r${round}`;
    if (def.kind === "dom") {
      out.push(buildDominantCase(idTag, def.pack, def.dominant!, def.goal, scen, {
        baseContradiction: def.contradiction,
        extraGreens: round === 2 ? [def.round2Green] : [],
      }));
    } else {
      out.push(buildGovernanceCase(idTag, def.pack, def.govKind!, def.goal, scen));
    }
  }
  return out;
}

export const SCENARIO_PACK_CASES: CollectiveCase[] = PACKS.flatMap(packCases);
export const SCENARIO_PACK_NAMES = PACKS.map((p) => p.pack);
