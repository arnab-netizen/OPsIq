/**
 * Startup research planner — determines what evidence to acquire and how.
 * Pure domain: no I/O, no HTTP, no side effects.
 */

export type AcquisitionMode = "AUTO" | "REQUIRES_OWNER_APPROVAL" | "HUMAN_ONLY";
export type RetrievalCost = "FREE" | "LOW" | "MEDIUM" | "HIGH";
export type ReliabilityLevel = "AUTHORITATIVE" | "OFFICIAL" | "FIELD" | "INFERRED" | "UNVERIFIED";

export interface EvidenceDomain {
  domain: string;
  requiredEvidence: string;
  canAutoAcquire: boolean;
  ownerApprovalRequired: boolean;
  bestSource: string;
  retrievalCost: RetrievalCost;
  decisionValue: number;
  reliability: ReliabilityLevel;
  expiryDays: number;
  fallbackSource: string;
  acquisitionMode: AcquisitionMode;
}

export interface ResearchPlanDraft {
  evidenceDomains: EvidenceDomain[];
  autoAcquireable: EvidenceDomain[];
  requiresOwnerApproval: EvidenceDomain[];
  humanOnly: EvidenceDomain[];
  estimatedAutoCompletionDays: number;
  ownerTaskCount: number;
}

export interface MinimizedOwnerTask {
  domain: string;
  prompt: string;
  estimatedTimeMinutes: number;
  importance: "CRITICAL" | "IMPORTANT" | "OPTIONAL";
  alternatives: string[];
}

const STANDARD_DOMAINS: Omit<EvidenceDomain, "acquisitionMode">[] = [
  {
    domain: "market_size",
    requiredEvidence: "Estimated number of potential customers and addressable revenue",
    canAutoAcquire: false,
    ownerApprovalRequired: false,
    bestSource: "Industry association reports, census data",
    retrievalCost: "FREE",
    decisionValue: 80,
    reliability: "OFFICIAL",
    expiryDays: 365,
    fallbackSource: "Competitor website traffic estimates",
  },
  {
    domain: "regulatory_requirements",
    requiredEvidence: "Licences, registrations, or compliance requirements for this industry and location",
    canAutoAcquire: false,
    ownerApprovalRequired: true,
    bestSource: "Government business registration portal",
    retrievalCost: "FREE",
    decisionValue: 95,
    reliability: "AUTHORITATIVE",
    expiryDays: 180,
    fallbackSource: "Industry association checklist",
  },
  {
    domain: "supplier_availability",
    requiredEvidence: "Supplier names, pricing, and lead times for key inputs",
    canAutoAcquire: false,
    ownerApprovalRequired: false,
    bestSource: "Direct supplier quotes",
    retrievalCost: "FREE",
    decisionValue: 70,
    reliability: "FIELD",
    expiryDays: 90,
    fallbackSource: "Industry wholesale price guides",
  },
  {
    domain: "customer_demand",
    requiredEvidence: "Confirmed demand signals from potential customers (minimum 10 interviews)",
    canAutoAcquire: false,
    ownerApprovalRequired: false,
    bestSource: "Customer interviews",
    retrievalCost: "FREE",
    decisionValue: 90,
    reliability: "FIELD",
    expiryDays: 90,
    fallbackSource: "Online forum sentiment analysis",
  },
  {
    domain: "pricing_benchmarks",
    requiredEvidence: "What competitors or substitutes charge for similar solutions",
    canAutoAcquire: false,
    ownerApprovalRequired: false,
    bestSource: "Competitor websites / price lists",
    retrievalCost: "FREE",
    decisionValue: 75,
    reliability: "OFFICIAL",
    expiryDays: 60,
    fallbackSource: "Owner estimate based on industry knowledge",
  },
  {
    domain: "delivery_cost_structure",
    requiredEvidence: "Actual cost breakdown for delivering one unit of the product/service",
    canAutoAcquire: false,
    ownerApprovalRequired: true,
    bestSource: "Owner cost modelling with supplier quotes",
    retrievalCost: "LOW",
    decisionValue: 85,
    reliability: "FIELD",
    expiryDays: 90,
    fallbackSource: "Industry average cost benchmarks",
  },
];

export function buildResearchPlan(
  _ideaName: string,
  _industry: string
): ResearchPlanDraft {
  const domains: EvidenceDomain[] = STANDARD_DOMAINS.map((d) => ({
    ...d,
    acquisitionMode: (d.ownerApprovalRequired
      ? "REQUIRES_OWNER_APPROVAL"
      : d.canAutoAcquire
      ? "AUTO"
      : "HUMAN_ONLY") as AcquisitionMode,
  }));

  const auto = domains.filter((d) => d.acquisitionMode === "AUTO");
  const approval = domains.filter((d) => d.acquisitionMode === "REQUIRES_OWNER_APPROVAL");
  const human = domains.filter((d) => d.acquisitionMode === "HUMAN_ONLY");

  return {
    evidenceDomains: domains,
    autoAcquireable: auto,
    requiresOwnerApproval: approval,
    humanOnly: human,
    estimatedAutoCompletionDays: auto.length > 0 ? 1 : 0,
    ownerTaskCount: approval.length + human.length,
  };
}

export function minimizeOwnerTasks(
  domains: EvidenceDomain[],
  autoAcquired: string[]
): MinimizedOwnerTask[] {
  const remaining = domains.filter((d) => !autoAcquired.includes(d.domain));
  return remaining.map((d) => ({
    domain: d.domain,
    prompt: `Collect: ${d.requiredEvidence}. Best source: ${d.bestSource}. Fallback: ${d.fallbackSource}.`,
    estimatedTimeMinutes:
      d.retrievalCost === "FREE" ? 30
      : d.retrievalCost === "LOW" ? 60
      : 120,
    importance: d.decisionValue >= 85 ? "CRITICAL" : d.decisionValue >= 65 ? "IMPORTANT" : "OPTIONAL",
    alternatives: [d.fallbackSource],
  }));
}
