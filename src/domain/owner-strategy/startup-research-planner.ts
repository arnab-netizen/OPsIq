/**
 * Startup Research Planner (Phase 5).
 * Determines what evidence can be acquired automatically vs. requires owner action.
 * Minimizes owner effort to the irreducible minimum.
 * Pure functions — no I/O.
 */
import type { AcquisitionMode, EvidenceSourceType } from "./startup-lifecycle";

export interface EvidenceDomain {
  domain: string;
  requiredEvidence: string;
  decisionAffected: string;
  canAutoAcquire: boolean;
  ownerApprovalRequired: boolean;
  bestSource: string;
  sourceType: EvidenceSourceType;
  retrievalCostCents: number;
  decisionValue: number; // 0-100
  reliability: number; // 0-100
  expiryDays: number;
  fallbackSource: string;
  acquisitionMode: AcquisitionMode;
  ownerTaskIfRequired: string | null;
}

export interface ResearchPlanDraft {
  evidenceDomains: EvidenceDomain[];
  autoAcquireable: EvidenceDomain[];
  requiresOwnerApproval: EvidenceDomain[];
  humanOnly: EvidenceDomain[];
  minimizedOwnerTasks: MinimizedOwnerTask[];
}

export interface MinimizedOwnerTask {
  domain: string;
  whyCannotAutoAcquire: string;
  exactOwnerAction: string;
  estimatedOwnerMinutes: number;
  expectedOutput: string;
  ownerApprovalRequired: boolean;
  costIfAny: string;
  completionCondition: string;
}

export interface ResearchCompletenessReport {
  domains: Array<{
    domain: string;
    requiredEvidence: string;
    acquired: boolean;
    sourceQuality: EvidenceSourceType | null;
    current: boolean;
    materialGaps: string[];
    effectOnDecision: string;
  }>;
  overallCompleteness: number; // 0-100
  criticalGaps: string[];
  canClassifyReady: boolean;
  ownerAcceptedGaps: string[];
}

// Standard evidence domains for every startup session
export function buildResearchPlan(opts: {
  geography: string | null;
  industry: string | null;
  targetCustomer: string | null;
  ideaNames: string[];
  requiresLicence: boolean;
  hasConnectors: boolean;
}): ResearchPlanDraft {
  const domains: EvidenceDomain[] = [
    {
      domain: "customer_problems",
      requiredEvidence: "Evidence that target customers experience the identified problem",
      decisionAffected: "Problem existence hypothesis",
      canAutoAcquire: opts.hasConnectors,
      ownerApprovalRequired: false,
      bestSource: "Customer review sites, forum discussions, survey data",
      sourceType: "MARKETPLACE_OBSERVATION",
      retrievalCostCents: 0,
      decisionValue: 95,
      reliability: 60,
      expiryDays: 90,
      fallbackSource: "Industry reports, trade publications",
      acquisitionMode: opts.hasConnectors ? "AUTO" : "HUMAN_ONLY",
      ownerTaskIfRequired: opts.hasConnectors
        ? null
        : "Conduct or assign 5 structured customer interviews using OpsIQ-prepared script",
    },
    {
      domain: "market_demand",
      requiredEvidence: "Evidence of current and growing demand for the proposed solution",
      decisionAffected: "Market sizing and willingness-to-pay hypothesis",
      canAutoAcquire: opts.hasConnectors,
      ownerApprovalRequired: false,
      bestSource: "Search trend data, industry statistics, procurement data",
      sourceType: "REPUTABLE_SECONDARY",
      retrievalCostCents: 0,
      decisionValue: 90,
      reliability: 65,
      expiryDays: 180,
      fallbackSource: "Trade association publications, government statistics",
      acquisitionMode: opts.hasConnectors ? "AUTO" : "REQUIRES_OWNER_APPROVAL",
      ownerTaskIfRequired: opts.hasConnectors
        ? null
        : "Approve OpsIQ-prepared web research and review findings",
    },
    {
      domain: "competitor_offerings",
      requiredEvidence: "Identification and comparison of at least 3 meaningful competitors or substitutes",
      decisionAffected: "Competitive defensibility and differentiation",
      canAutoAcquire: opts.hasConnectors,
      ownerApprovalRequired: false,
      bestSource: "Competitor websites, pricing pages, marketplace listings",
      sourceType: "OFFICIAL_COMMERCIAL",
      retrievalCostCents: 0,
      decisionValue: 85,
      reliability: 75,
      expiryDays: 60,
      fallbackSource: "Industry directories, press releases",
      acquisitionMode: opts.hasConnectors ? "AUTO" : "REQUIRES_OWNER_APPROVAL",
      ownerTaskIfRequired: opts.hasConnectors
        ? null
        : "Review OpsIQ competitor shortlist and confirm any known missing competitors",
    },
    {
      domain: "supplier_pricing",
      requiredEvidence: "Indicative pricing from at least 2 suppliers for key inputs",
      decisionAffected: "Variable unit cost and gross margin",
      canAutoAcquire: opts.hasConnectors,
      ownerApprovalRequired: true,
      bestSource: "Supplier websites, published tariffs, marketplace listings",
      sourceType: "OFFICIAL_COMMERCIAL",
      retrievalCostCents: 0,
      decisionValue: 88,
      reliability: 70,
      expiryDays: 90,
      fallbackSource: "Trade directory listings, prior quotations",
      acquisitionMode: "REQUIRES_OWNER_APPROVAL",
      ownerTaskIfRequired:
        "Approve OpsIQ-prepared quotation requests or enter any existing supplier quotes (estimated 2 minutes)",
    },
    {
      domain: "regulatory_requirements",
      requiredEvidence: "Authoritative confirmation of all applicable licences, registrations, and requirements",
      decisionAffected: "Regulatory readiness gate — blocks launch if missing licence",
      canAutoAcquire: opts.hasConnectors,
      ownerApprovalRequired: false,
      bestSource: `${opts.geography ?? "local"} government regulatory authority website`,
      sourceType: "AUTHORITATIVE_PRIMARY",
      retrievalCostCents: 0,
      decisionValue: 100,
      reliability: 95,
      expiryDays: 365,
      fallbackSource: "Industry association guidance notes",
      acquisitionMode: opts.hasConnectors ? "AUTO" : "REQUIRES_OWNER_APPROVAL",
      ownerTaskIfRequired: opts.hasConnectors
        ? null
        : "Review regulatory summary prepared by OpsIQ and confirm applicability (estimated 5 minutes)",
    },
    {
      domain: "customer_acquisition_cost",
      requiredEvidence: "Observable or estimated CAC through at least one channel",
      decisionAffected: "Acquisition feasibility hypothesis and unit economics",
      canAutoAcquire: false,
      ownerApprovalRequired: true,
      bestSource: "Ad platform cost-per-click data, referral network costs",
      sourceType: "MARKETPLACE_OBSERVATION",
      retrievalCostCents: 5000,
      decisionValue: 90,
      reliability: 55,
      expiryDays: 30,
      fallbackSource: "Industry benchmark CAC reports",
      acquisitionMode: "REQUIRES_OWNER_APPROVAL",
      ownerTaskIfRequired:
        "Approve a small test campaign (budget limit set by owner) to measure real CAC, or enter industry benchmark data",
    },
    {
      domain: "local_geographic_conditions",
      requiredEvidence: "Local demographic, economic, and infrastructure data for the target geography",
      decisionAffected: "Market sizing geography-limited estimate",
      canAutoAcquire: opts.hasConnectors,
      ownerApprovalRequired: false,
      bestSource: "Government census, local council statistics",
      sourceType: "AUTHORITATIVE_PRIMARY",
      retrievalCostCents: 0,
      decisionValue: 75,
      reliability: 90,
      expiryDays: 365,
      fallbackSource: "National statistics disaggregated by region",
      acquisitionMode: opts.hasConnectors ? "AUTO" : "REQUIRES_OWNER_APPROVAL",
      ownerTaskIfRequired: opts.hasConnectors
        ? null
        : "Confirm target geography so OpsIQ can identify correct local data source",
    },
    {
      domain: "willingness_to_pay",
      requiredEvidence: "Direct or observed evidence that target customers will pay the proposed price",
      decisionAffected: "WTP hypothesis — highest decision value; cannot substitute desk research",
      canAutoAcquire: false,
      ownerApprovalRequired: true,
      bestSource: "Price tests, LOIs, pre-orders, direct customer conversations",
      sourceType: "CUSTOMER_GENERATED",
      retrievalCostCents: 0,
      decisionValue: 100,
      reliability: 85,
      expiryDays: 45,
      fallbackSource: "Comparable market pricing data as weak proxy only",
      acquisitionMode: "HUMAN_ONLY",
      ownerTaskIfRequired:
        "Owner or assigned team member must conduct structured price conversations with 10+ qualified prospects using OpsIQ-prepared script",
    },
    {
      domain: "economic_conditions",
      requiredEvidence: "Current interest rate, inflation, and sector-specific economic conditions",
      decisionAffected: "Cash flow and working capital risk assessment",
      canAutoAcquire: opts.hasConnectors,
      ownerApprovalRequired: false,
      bestSource: "Central bank data, official statistics",
      sourceType: "AUTHORITATIVE_PRIMARY",
      retrievalCostCents: 0,
      decisionValue: 65,
      reliability: 95,
      expiryDays: 30,
      fallbackSource: "Financial press summary",
      acquisitionMode: opts.hasConnectors ? "AUTO" : "REQUIRES_OWNER_APPROVAL",
      ownerTaskIfRequired: opts.hasConnectors
        ? null
        : "No action required — OpsIQ will note that current economic data is unverified",
    },
    {
      domain: "government_grants_tenders",
      requiredEvidence: "Applicable government schemes, grants, or procurement opportunities",
      decisionAffected: "Startup cost offset and revenue opportunity",
      canAutoAcquire: opts.hasConnectors,
      ownerApprovalRequired: false,
      bestSource: "Government tender and grants portals",
      sourceType: "AUTHORITATIVE_PRIMARY",
      retrievalCostCents: 0,
      decisionValue: 60,
      reliability: 95,
      expiryDays: 30,
      fallbackSource: "Industry association funding guides",
      acquisitionMode: opts.hasConnectors ? "AUTO" : "REQUIRES_OWNER_APPROVAL",
      ownerTaskIfRequired: opts.hasConnectors
        ? null
        : "Review grant summary produced by OpsIQ (estimated 3 minutes)",
    },
  ];

  const autoAcquireable = domains.filter((d) => d.acquisitionMode === "AUTO");
  const requiresOwnerApproval = domains.filter((d) => d.acquisitionMode === "REQUIRES_OWNER_APPROVAL");
  const humanOnly = domains.filter((d) => d.acquisitionMode === "HUMAN_ONLY");

  const minimizedOwnerTasks = buildMinimizedOwnerTasks([...requiresOwnerApproval, ...humanOnly]);

  return {
    evidenceDomains: domains,
    autoAcquireable,
    requiresOwnerApproval,
    humanOnly,
    minimizedOwnerTasks,
  };
}

function buildMinimizedOwnerTasks(domains: EvidenceDomain[]): MinimizedOwnerTask[] {
  return domains.map((domain) => ({
    domain: domain.domain,
    whyCannotAutoAcquire: buildWhyCannotAuto(domain),
    exactOwnerAction: domain.ownerTaskIfRequired ?? "No action specified",
    estimatedOwnerMinutes: estimateOwnerMinutes(domain),
    expectedOutput: `Evidence record in OpsIQ for: ${domain.requiredEvidence}`,
    ownerApprovalRequired: domain.ownerApprovalRequired,
    costIfAny: domain.retrievalCostCents > 0
      ? `$${(domain.retrievalCostCents / 100).toFixed(2)}`
      : "No cost",
    completionCondition: `Evidence record created and marked verified for domain: ${domain.domain}`,
  }));
}

function buildWhyCannotAuto(domain: EvidenceDomain): string {
  if (domain.acquisitionMode === "HUMAN_ONLY") {
    if (domain.sourceType === "CUSTOMER_GENERATED") {
      return "Genuine human interaction is required — desk research cannot substitute for direct customer evidence on willingness to pay";
    }
    return "Requires human observation, negotiation, or physical access not available to automated systems";
  }
  return "Owner approval is required before OpsIQ can initiate external outreach or spending";
}

function estimateOwnerMinutes(domain: EvidenceDomain): number {
  const minutesByDomain: Record<string, number> = {
    willingness_to_pay: 120, // 10 conversations
    supplier_pricing: 2,
    customer_acquisition_cost: 10,
    regulatory_requirements: 5,
    competitor_offerings: 5,
    market_demand: 3,
    local_geographic_conditions: 2,
    government_grants_tenders: 3,
    economic_conditions: 1,
    customer_problems: 90,
  };
  return minutesByDomain[domain.domain] ?? 10;
}

export function buildResearchCompletenessReport(
  domains: EvidenceDomain[],
  acquiredDomainIds: Set<string>,
  ownerAcceptedGapIds: Set<string>
): ResearchCompletenessReport {
  const domainReports = domains.map((domain) => {
    const acquired = acquiredDomainIds.has(domain.domain);
    const materialGaps: string[] = [];
    if (!acquired && !ownerAcceptedGapIds.has(domain.domain)) {
      materialGaps.push(domain.requiredEvidence);
    }
    return {
      domain: domain.domain,
      requiredEvidence: domain.requiredEvidence,
      acquired,
      sourceQuality: acquired ? domain.sourceType : null,
      current: acquired, // simplified — staleness tracking handled separately
      materialGaps,
      effectOnDecision: domain.decisionAffected,
    };
  });

  const criticalGaps = domainReports
    .filter((d) => d.materialGaps.length > 0 && !ownerAcceptedGapIds.has(d.domain))
    .map((d) => d.requiredEvidence);

  const totalDomains = domains.length;
  const acquiredCount = domainReports.filter((d) => d.acquired).length;
  const overallCompleteness = Math.round((acquiredCount / totalDomains) * 100);

  // Can classify ready if: all critical domains acquired, or owner accepted remaining gaps
  const unacceptedCriticalGaps = criticalGaps.filter(
    (_, i) =>
      !ownerAcceptedGapIds.has(
        domainReports.filter((d) => d.materialGaps.length > 0)[i]?.domain ?? ""
      )
  );

  return {
    domains: domainReports,
    overallCompleteness,
    criticalGaps,
    canClassifyReady: unacceptedCriticalGaps.length === 0,
    ownerAcceptedGaps: [...ownerAcceptedGapIds],
  };
}
