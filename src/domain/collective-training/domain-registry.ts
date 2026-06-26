/**
 * Collective domain registry (pure).
 *
 * Maps each of the 24 individual domains to its collective priority level (Section 7),
 * its F5 risk category, and the actions it vetoes when red. This is the single source of
 * truth the priority engine (C4) and veto resolver (C5) consume — it does not duplicate
 * the domains, it indexes them.
 */

import type { CollectiveAction, DomainKey, PriorityLevel } from "@/domain/collective-training/collective-types";
import type { RiskCategory } from "@/domain/domain-training/severity-scoring";

export interface DomainMeta {
  domainId: string;
  priorityLevel: PriorityLevel;
  riskCategory: RiskCategory;
  /** Actions this domain vetoes when RED/critical (consumed by C5, aligned to F6). */
  vetoesWhenRed: CollectiveAction[];
  complianceSensitive: boolean;
}

export const DOMAIN_REGISTRY: Record<DomainKey, DomainMeta> = {
  // Level 1 — hard blockers
  "cash-survival": { domainId: "D1", priorityLevel: 1, riskCategory: "cash", complianceSensitive: false,
    vetoesWhenRed: ["paid_marketing", "broad_marketing", "growth", "expansion", "hiring", "bulk_inventory_purchase", "irreversible_commitment", "demand_generation"] },
  "risk-compliance": { domainId: "D24", priorityLevel: 1, riskCategory: "compliance", complianceSensitive: true,
    vetoesWhenRed: ["irreversible_commitment", "growth", "scale"] },
  quality: { domainId: "D10", priorityLevel: 1, riskCategory: "quality", complianceSensitive: false,
    vetoesWhenRed: ["paid_marketing", "broad_marketing", "growth", "scale"] },
  // Level 2 — operating constraints
  capacity: { domainId: "D7", priorityLevel: 2, riskCategory: "capacity", complianceSensitive: false,
    vetoesWhenRed: ["demand_generation", "broad_marketing", "growth"] },
  "staff-workload": { domainId: "D8", priorityLevel: 2, riskCategory: "workload", complianceSensitive: false,
    vetoesWhenRed: ["demand_generation", "non_critical_tasks"] },
  "owner-workload": { domainId: "D9", priorityLevel: 2, riskCategory: "workload", complianceSensitive: false,
    vetoesWhenRed: ["owner_heavy_action"] },
  "sop-process": { domainId: "D11", priorityLevel: 2, riskCategory: "quality", complianceSensitive: false,
    vetoesWhenRed: ["scale", "growth"] },
  "customer-complaints": { domainId: "D12", priorityLevel: 2, riskCategory: "quality", complianceSensitive: false,
    vetoesWhenRed: ["broad_marketing", "scale"] },
  "supplier-inventory": { domainId: "D15", priorityLevel: 2, riskCategory: "capacity", complianceSensitive: false,
    vetoesWhenRed: ["demand_generation", "bulk_inventory_purchase"] },
  // Level 3 — economic optimization
  "profit-improvement": { domainId: "D2", priorityLevel: 3, riskCategory: "general", complianceSensitive: false,
    vetoesWhenRed: ["discounting_below_margin", "revenue_chasing"] },
  "pricing-decisions": { domainId: "D3", priorityLevel: 3, riskCategory: "general", complianceSensitive: false,
    vetoesWhenRed: ["discounting_below_margin"] },
  retention: { domainId: "D13", priorityLevel: 3, riskCategory: "retention", complianceSensitive: false,
    vetoesWhenRed: ["paid_marketing", "broad_marketing"] },
  marketing: { domainId: "D14", priorityLevel: 3, riskCategory: "general", complianceSensitive: false,
    vetoesWhenRed: [] },
  // Level 4 — strategic movement
  "growth-readiness": { domainId: "D22", priorityLevel: 4, riskCategory: "general", complianceSensitive: false,
    vetoesWhenRed: ["growth", "expansion"] },
  "scale-readiness": { domainId: "D23", priorityLevel: 4, riskCategory: "general", complianceSensitive: false,
    vetoesWhenRed: ["scale", "expansion"] },
  // Governance / structural domains (inform packet structure; ranked low as conditions)
  "proof-required": { domainId: "D4", priorityLevel: 1, riskCategory: "general", complianceSensitive: false,
    vetoesWhenRed: ["closure_without_proof", "learning_admission", "confident_diagnosis"] },
  "verify-outcome": { domainId: "D5", priorityLevel: 1, riskCategory: "general", complianceSensitive: false,
    vetoesWhenRed: ["learning_admission"] },
  "stop-rollback-redesign": { domainId: "D6", priorityLevel: 2, riskCategory: "general", complianceSensitive: false,
    vetoesWhenRed: ["irreversible_commitment"] },
  "daily-priorities": { domainId: "D16", priorityLevel: 2, riskCategory: "general", complianceSensitive: false,
    vetoesWhenRed: ["non_critical_tasks"] },
  "review-cadence": { domainId: "D17", priorityLevel: 2, riskCategory: "general", complianceSensitive: false,
    vetoesWhenRed: [] },
  "what-not-to-do": { domainId: "D18", priorityLevel: 1, riskCategory: "general", complianceSensitive: false,
    vetoesWhenRed: [] },
  "what-to-do-next": { domainId: "D19", priorityLevel: 2, riskCategory: "general", complianceSensitive: false,
    vetoesWhenRed: [] },
  who: { domainId: "D20", priorityLevel: 2, riskCategory: "workload", complianceSensitive: false,
    vetoesWhenRed: ["owner_heavy_action"] },
  how: { domainId: "D21", priorityLevel: 2, riskCategory: "general", complianceSensitive: false,
    vetoesWhenRed: ["irreversible_commitment"] },
};

export const ALL_DOMAIN_KEYS = Object.keys(DOMAIN_REGISTRY) as DomainKey[];

export function domainMeta(domain: DomainKey): DomainMeta {
  return DOMAIN_REGISTRY[domain];
}
