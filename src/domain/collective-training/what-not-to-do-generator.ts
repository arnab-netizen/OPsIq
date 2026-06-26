/**
 * C7 — Collective what-not-to-do generator (pure).
 *
 * Turns the resolved vetoes, low-confidence/missing-data state, contradictions and
 * compliance uncertainty into the four anti-action lists: prohibited, temporarily
 * blocked, allowed-only-after-proof, and expert-escalation. Consumes the F6-derived
 * blocked-action set (via the veto resolver) — it does not re-derive vetoes.
 */

import type { CollectiveAction, DomainKey, WhatNotToDo } from "@/domain/collective-training/collective-types";
import type { VetoContext } from "@/domain/domain-training/veto-matrix";

const ACTION_PHRASE: Record<CollectiveAction, string> = {
  broad_marketing: "run broad marketing", paid_marketing: "spend on paid marketing",
  growth: "pursue growth", scale: "scale the operation", expansion: "expand (new site/service)",
  hiring: "make non-essential hires", bulk_inventory_purchase: "bulk-buy inventory",
  discounting_below_margin: "discount below margin", irreversible_commitment: "make irreversible commitments",
  demand_generation: "generate more demand", non_critical_tasks: "take on non-critical tasks",
  owner_heavy_action: "load more onto the owner", closure_without_proof: "close items without proof",
  learning_admission: "admit learning from this outcome", confident_diagnosis: "make a confident diagnosis",
  revenue_chasing: "chase revenue at any cost",
};

export interface WhatNotToDoInput {
  blockedActions: CollectiveAction[];
  context: VetoContext;
  lowDataConfidence: boolean;
  hasContradiction: boolean;
  redDomains: DomainKey[];
}

export function generateWhatNotToDo(i: WhatNotToDoInput): WhatNotToDo {
  const prohibited = new Set<string>();
  const temporarilyBlocked = new Set<string>();
  const requiresProof = new Set<string>();
  const requiresExpertEscalation = new Set<string>();

  // Hard, condition-driven prohibitions (cash / quality / capacity red).
  for (const a of i.blockedActions) {
    const phrase = `Do not ${ACTION_PHRASE[a]}`;
    if (a === "closure_without_proof" || a === "confident_diagnosis") requiresProof.add(`${phrase} — collect proof first`);
    else if (a === "learning_admission") temporarilyBlocked.add(`${phrase} until the outcome is verified`);
    else prohibited.add(phrase);
    // Conditions that can clear → also expressed as temporarily blocked.
    if (i.context.criticalCashSurvivalRisk || i.context.severeQualityFailure || i.context.capacityOverload) {
      temporarilyBlocked.add(`${phrase} until the binding constraint clears`);
    }
  }

  if (i.lowDataConfidence) {
    requiresProof.add("Do not act on low-confidence data — collect evidence before committing");
    prohibited.add("Do not make a high-confidence call on weak data");
  }
  if (i.hasContradiction) {
    requiresProof.add("Do not close or learn while evidence is contradictory — reconcile first");
  }
  if (i.context.complianceOrSafetyUncertain) {
    requiresExpertEscalation.add("Do not act on the compliance/safety-sensitive decision without verified expert sign-off");
  }

  return {
    prohibited: [...prohibited],
    temporarilyBlocked: [...temporarilyBlocked],
    requiresProof: [...requiresProof],
    requiresExpertEscalation: [...requiresExpertEscalation],
  };
}
