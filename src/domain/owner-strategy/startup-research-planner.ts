/**
 * Startup research planner — determines what evidence to acquire and how.
 * Pure domain: no I/O, no HTTP, no side effects.
 *
 * AcquisitionMode: AUTO means a ResearchProvider can acquire without owner intervention.
 * Execution happens in the service layer via ResearchProvider (see src/infra/research-provider.ts).
 */

export type AcquisitionMode = "AUTO" | "REQUIRES_OWNER_APPROVAL" | "HUMAN_ONLY";

export type OwnerTaskType =
  | "OWNER_PRIVATE_FACT_REQUIRED"
  | "OWNER_AUTHORIZATION_REQUIRED"
  | "OWNER_CONNECTOR_REQUIRED"
  | "OWNER_OUTREACH_APPROVAL_REQUIRED"
  | "OWNER_PHYSICAL_ACTION_REQUIRED"
  | "OWNER_PROFESSIONAL_ADVICE_REQUIRED"
  | "OWNER_NEGOTIATION_REQUIRED";
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
  taskType: OwnerTaskType;
  prompt: string;
  estimatedTimeMinutes: number;
  importance: "CRITICAL" | "IMPORTANT" | "OPTIONAL";
  alternatives: string[];
  // What OpsIQ completed on its own before handing off to owner
  completedByOpsIQ: string;
  // Exact knowledge or action gap that only the owner can close
  exactGap: string;
  // Why software cannot complete this without the owner
  whySoftwareCannotComplete: string;
  // Prepared script or question set for the owner to use
  preparedScript: string;
  // Specific targets (suppliers, customers, authorities, advisors) to contact
  targetShortlist: string[];
  // Form for recording the evidence the owner collects
  evidenceForm: string;
  // What a passing result looks like
  passCriteria: string;
  // What a failing result looks like
  failCriteria: string;
  // Estimated out-of-pocket cost to the owner
  estimatedCostLabel: string;
  // Estimated owner effort in hours
  ownerEffortHours: number;
  // What happens next depending on the result
  followUpLogic: string;
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
    canAutoAcquire: true,  // ResearchProvider (StaticStubProvider / HttpFetchProvider) can fetch public pricing
    ownerApprovalRequired: false,
    bestSource: "Competitor websites / public price lists",
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

function classifyOwnerTaskType(domain: EvidenceDomain): OwnerTaskType {
  if (domain.ownerApprovalRequired && domain.domain === "regulatory_requirements") {
    return "OWNER_AUTHORIZATION_REQUIRED";
  }
  if (domain.domain === "customer_demand") {
    return "OWNER_OUTREACH_APPROVAL_REQUIRED";
  }
  if (domain.domain === "supplier_availability") {
    return "OWNER_NEGOTIATION_REQUIRED";
  }
  if (domain.domain === "delivery_cost_structure") {
    return "OWNER_PRIVATE_FACT_REQUIRED";
  }
  if (domain.domain === "market_size") {
    return "OWNER_PROFESSIONAL_ADVICE_REQUIRED";
  }
  if (domain.ownerApprovalRequired) {
    return "OWNER_AUTHORIZATION_REQUIRED";
  }
  return "OWNER_PHYSICAL_ACTION_REQUIRED";
}

export function minimizeOwnerTasks(
  domains: EvidenceDomain[],
  autoAcquired: string[]
): MinimizedOwnerTask[] {
  const remaining = domains.filter((d) => !autoAcquired.includes(d.domain));
  return remaining.map((d) => {
    const effortMinutes =
      d.retrievalCost === "FREE" ? 30
      : d.retrievalCost === "LOW" ? 60
      : 120;
    const taskType = classifyOwnerTaskType(d);
    return {
      domain: d.domain,
      taskType,
      prompt: `Collect: ${d.requiredEvidence}. Best source: ${d.bestSource}. Fallback: ${d.fallbackSource}.`,
      estimatedTimeMinutes: effortMinutes,
      importance: d.decisionValue >= 85 ? "CRITICAL" : d.decisionValue >= 65 ? "IMPORTANT" : "OPTIONAL",
      alternatives: [d.fallbackSource],
      completedByOpsIQ: `Identified evidence domain "${d.domain}", determined best source (${d.bestSource}), and confirmed OpsIQ cannot auto-acquire because: canAutoAcquire=${d.canAutoAcquire}.`,
      exactGap: d.requiredEvidence,
      whySoftwareCannotComplete: d.canAutoAcquire
        ? `Owner approval required before acquisition.`
        : `This evidence requires ${taskType === "OWNER_PHYSICAL_ACTION_REQUIRED" ? "physical presence or direct contact" : "privileged owner knowledge or authority"} that OpsIQ cannot substitute.`,
      preparedScript: `1. Contact: ${d.bestSource}.\n2. Ask: "${d.requiredEvidence}"\n3. Record exact response, source name, date, and any caveats.`,
      targetShortlist: [d.bestSource, d.fallbackSource],
      evidenceForm: `Observed result: ___\nSource name: ___\nDate collected: ___\nLimitations: ___\nConfidence (0-100): ___`,
      passCriteria: `Evidence is specific, sourced, and directly answers: "${d.requiredEvidence}"`,
      failCriteria: `No usable data found or only unverifiable estimates available.`,
      estimatedCostLabel: d.retrievalCost === "FREE" ? "$0" : d.retrievalCost === "LOW" ? "<$100" : "<$500",
      ownerEffortHours: Math.round(effortMinutes / 60 * 10) / 10,
      followUpLogic: `If PASS: mark domain acquired, advance to next evidence gap. If FAIL: escalate to fallback (${d.fallbackSource}) or mark as UNKNOWN_INPUT with implication for decision confidence.`,
    };
  });
}
