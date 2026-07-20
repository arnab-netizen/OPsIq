/**
 * Startup idea screening — 17 dimensions, fail-closed on unknown critical inputs.
 * Returns full structured result; no business logic may reside in callers.
 */

export type ScreeningStatus =
  | "PASSED"
  | "CONDITIONALLY_PASSED"
  | "REJECTED"
  | "EVIDENCE_REQUIRED"
  | "UNSCREENED";

export interface ScreeningDimensionResult {
  dimension: string;
  passed: boolean | null; // null = unknown/insufficient evidence
  reason: string;
  isCritical: boolean;
  evidenceRequired?: string;
}

export interface BusinessFitProfile {
  capitalAvailableCents: number | null;
  ownerHoursPerWeek: number | null;
  riskTolerance: "LOW" | "MEDIUM" | "HIGH" | null;
  industry?: string | null;
  location?: string | null;
  hasExistingCustomers?: boolean | null;
  existingNetworkStrength?: number | null; // 0-100
  regulatoryExperience?: boolean | null;
  priorIndustryExperience?: boolean | null;
  minimumMonthlyIncomeNeededCents?: number | null;
  cashRunwayMonthsAvailable?: number | null;
}

export interface StartupIdeaInput {
  name: string;
  industry: string;
  estimatedStartupCostCents?: number | null;
  estimatedMonthlyRevenueCents?: number | null;
  estimatedMonthlyProfitCents?: number | null;
  customerAccessibility?: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | null;
  regulatoryComplexity?: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | null;
  requiresSpecialisedLicence?: boolean | null;
  deliverableType?: "PRODUCT" | "SERVICE" | "HYBRID" | null;
  capitalIntensity?: "LOW" | "MEDIUM" | "HIGH" | null;
  timeToFirstRevenueDays?: number | null;
  supplyChainRisk?: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | null;
  competitiveDifferentiator?: string | null;
}

export interface ScreeningResult {
  status: ScreeningStatus;
  dimensions: ScreeningDimensionResult[];
  bindingConstraints: string[];
  unknownInputs: string[];
  evidenceRequired: string[];
  alternativesConsidered: string[];
  whatCouldChange: string;
  screenedAt: string; // ISO
}

function dim(
  dimension: string,
  passed: boolean | null,
  reason: string,
  isCritical: boolean,
  evidenceRequired?: string
): ScreeningDimensionResult {
  return { dimension, passed, reason, isCritical, evidenceRequired };
}

export function screenIdea(
  idea: StartupIdeaInput,
  profile: BusinessFitProfile
): ScreeningResult {
  const results: ScreeningDimensionResult[] = [];
  const bindingConstraints: string[] = [];
  const unknownInputs: string[] = [];
  const evidenceRequired: string[] = [];

  // 1. Capital sufficiency
  const capitalOk =
    idea.estimatedStartupCostCents == null || profile.capitalAvailableCents == null
      ? null
      : profile.capitalAvailableCents >= idea.estimatedStartupCostCents;
  if (capitalOk === null) unknownInputs.push("estimatedStartupCostCents or capitalAvailableCents");
  if (capitalOk === false) bindingConstraints.push("Insufficient capital");
  results.push(dim(
    "capital_sufficiency",
    capitalOk,
    capitalOk === false
      ? `Capital gap: need ${idea.estimatedStartupCostCents}, have ${profile.capitalAvailableCents}`
      : capitalOk === null ? "Capital requirement unknown" : "Capital sufficient",
    true,
    capitalOk === null ? "Estimated startup cost" : undefined
  ));

  // 2. Owner time availability
  const timeOk = profile.ownerHoursPerWeek == null ? null : profile.ownerHoursPerWeek >= 10;
  if (timeOk === null) unknownInputs.push("ownerHoursPerWeek");
  if (timeOk === false) bindingConstraints.push("Insufficient owner time");
  results.push(dim(
    "owner_time",
    timeOk,
    timeOk === false
      ? `Only ${profile.ownerHoursPerWeek}h/week available — minimum 10h required`
      : timeOk === null ? "Owner time unknown" : "Sufficient time available",
    true,
    timeOk === null ? "Owner hours available per week" : undefined
  ));

  // 3. Regulatory complexity
  const regOk = idea.regulatoryComplexity == null || idea.regulatoryComplexity === "UNKNOWN"
    ? null
    : idea.regulatoryComplexity !== "HIGH";
  if (idea.regulatoryComplexity === "UNKNOWN") {
    unknownInputs.push("regulatoryComplexity");
    evidenceRequired.push("Regulatory classification for this industry");
  }
  if (regOk === false) bindingConstraints.push("High regulatory complexity");
  results.push(dim(
    "regulatory_complexity",
    regOk,
    regOk === null ? "Regulatory complexity unknown — must verify"
      : regOk ? "Acceptable regulatory environment"
      : "High regulatory complexity blocks launch",
    true,
    idea.regulatoryComplexity === "UNKNOWN" ? "Regulatory classification" : undefined
  ));

  // 4. Licence requirement
  const licenceOk = idea.requiresSpecialisedLicence == null
    ? null
    : !idea.requiresSpecialisedLicence || (profile.regulatoryExperience === true);
  if (idea.requiresSpecialisedLicence == null) unknownInputs.push("requiresSpecialisedLicence");
  if (licenceOk === false) bindingConstraints.push("Specialised licence required without experience");
  results.push(dim(
    "licence_requirement",
    licenceOk,
    licenceOk === null ? "Licence requirement unknown"
      : licenceOk ? "Licence not required or owner has experience"
      : "Licence required — owner lacks regulatory experience",
    true,
    idea.requiresSpecialisedLicence == null ? "Whether licence is required" : undefined
  ));

  // 5. Customer accessibility
  const custOk = idea.customerAccessibility == null || idea.customerAccessibility === "UNKNOWN"
    ? null
    : idea.customerAccessibility !== "LOW";
  if (!idea.customerAccessibility || idea.customerAccessibility === "UNKNOWN") {
    unknownInputs.push("customerAccessibility");
    evidenceRequired.push("Customer reachability assessment");
  }
  results.push(dim(
    "customer_accessibility",
    custOk,
    custOk === null ? "Customer accessibility unknown"
      : custOk ? "Customers accessible"
      : "Low customer accessibility — acquisition path blocked",
    true
  ));

  // 6. Cash runway
  const runwayOk = profile.cashRunwayMonthsAvailable == null
    ? null
    : profile.cashRunwayMonthsAvailable >= 3;
  if (runwayOk === null) unknownInputs.push("cashRunwayMonthsAvailable");
  if (runwayOk === false) bindingConstraints.push("Insufficient cash runway");
  results.push(dim(
    "cash_survival",
    runwayOk,
    runwayOk === null ? "Cash runway unknown"
      : runwayOk ? `${profile.cashRunwayMonthsAvailable}m runway available`
      : `Only ${profile.cashRunwayMonthsAvailable}m runway — minimum 3m required`,
    true
  ));

  // 7. Time to first revenue vs runway
  const ttfrMonths = idea.timeToFirstRevenueDays != null ? idea.timeToFirstRevenueDays / 30 : null;
  const ttfrvOk = ttfrMonths == null || profile.cashRunwayMonthsAvailable == null
    ? null
    : ttfrMonths <= profile.cashRunwayMonthsAvailable * 0.75;
  if (ttfrvOk === false) bindingConstraints.push("Revenue too slow for cash runway");
  results.push(dim(
    "time_to_revenue_vs_runway",
    ttfrvOk,
    ttfrvOk === null ? "Cannot assess without cost and runway data"
      : ttfrvOk ? "Revenue timing acceptable within runway"
      : "Time to first revenue exceeds safe runway threshold",
    true
  ));

  // 8. Capital intensity vs risk tolerance
  const capIntOk = idea.capitalIntensity == null || profile.riskTolerance == null
    ? null
    : !(idea.capitalIntensity === "HIGH" && profile.riskTolerance === "LOW");
  results.push(dim(
    "capital_intensity_vs_risk",
    capIntOk,
    capIntOk === null ? "Cannot assess without capital intensity and risk tolerance"
      : capIntOk ? "Capital intensity aligned with risk tolerance"
      : "High capital intensity conflicts with low risk tolerance",
    false
  ));

  // 9. Prior industry experience
  const expOk = profile.priorIndustryExperience ?? null;
  results.push(dim(
    "industry_experience",
    expOk,
    expOk === null ? "Prior industry experience unknown"
      : expOk ? "Owner has prior industry experience — reduces execution risk"
      : "No prior industry experience — higher execution risk",
    false,
    expOk === null ? "Prior industry experience" : undefined
  ));

  // 10. Supply chain risk
  const scOk = idea.supplyChainRisk == null || idea.supplyChainRisk === "UNKNOWN"
    ? null
    : idea.supplyChainRisk !== "HIGH";
  if (!idea.supplyChainRisk || idea.supplyChainRisk === "UNKNOWN") {
    evidenceRequired.push("Supply chain risk assessment");
  }
  results.push(dim(
    "supply_chain_risk",
    scOk,
    scOk === null ? "Supply chain risk unknown"
      : scOk ? "Supply chain risk acceptable"
      : "High supply chain risk without mitigation",
    false
  ));

  // 11. Competitive differentiation
  const diffOk = idea.competitiveDifferentiator != null && idea.competitiveDifferentiator.trim().length > 0
    ? true
    : null;
  if (diffOk === null) evidenceRequired.push("Competitive differentiation statement");
  results.push(dim(
    "competitive_differentiation",
    diffOk,
    diffOk === null ? "No competitive differentiator stated — required for evidence-based assessment"
      : "Differentiator present — requires validation",
    false,
    diffOk === null ? "What makes this offering different from alternatives" : undefined
  ));

  // 12. Minimum income coverage
  const incomeOk = profile.minimumMonthlyIncomeNeededCents == null || idea.estimatedMonthlyProfitCents == null
    ? null
    : idea.estimatedMonthlyProfitCents >= profile.minimumMonthlyIncomeNeededCents;
  results.push(dim(
    "minimum_income_coverage",
    incomeOk,
    incomeOk === null ? "Cannot assess — missing income need or profit estimate"
      : incomeOk ? "Estimated profit covers minimum income need"
      : "Estimated profit below owner minimum income requirement",
    true,
    incomeOk === null ? "Estimated monthly profit and minimum income needed" : undefined
  ));
  if (incomeOk === false) bindingConstraints.push("Profit below minimum income requirement");

  // 13. Network leverage
  const netOk = profile.existingNetworkStrength == null
    ? null
    : profile.existingNetworkStrength >= 20;
  results.push(dim(
    "network_leverage",
    netOk,
    netOk === null ? "Network strength unknown"
      : netOk ? "Owner network can support initial customer acquisition"
      : "Weak network — cold acquisition needed, higher CAC risk",
    false
  ));

  // 14. Risk tolerance declared
  const riskOk = profile.riskTolerance == null ? null : true;
  results.push(dim(
    "risk_tolerance_declared",
    riskOk,
    riskOk === null ? "Risk tolerance not stated — required for MODIFY vs GO recommendation"
      : `Risk tolerance: ${profile.riskTolerance}`,
    false,
    riskOk === null ? "Owner risk tolerance declaration" : undefined
  ));

  // 15. Deliverable clarity
  const deliverableOk = idea.deliverableType != null ? true : null;
  results.push(dim(
    "deliverable_clarity",
    deliverableOk,
    deliverableOk === null ? "Deliverable type not specified"
      : `Deliverable type: ${idea.deliverableType}`,
    false,
    deliverableOk === null ? "Whether product, service, or hybrid" : undefined
  ));

  // 16. Revenue model evidence
  const revOk = idea.estimatedMonthlyRevenueCents != null ? true : null;
  if (revOk === null) evidenceRequired.push("Revenue model and pricing hypothesis");
  results.push(dim(
    "revenue_model_evidence",
    revOk,
    revOk === null ? "No revenue estimate — pricing not validated"
      : `Revenue estimate provided: ${idea.estimatedMonthlyRevenueCents} cents/month`,
    true
  ));

  // 17. Industry location match
  const locOk = profile.location != null ? true : null;
  results.push(dim(
    "location_market_match",
    locOk,
    locOk === null ? "Location not specified — cannot assess market accessibility"
      : `Operating location: ${profile.location}`,
    false,
    locOk === null ? "Owner operating location" : undefined
  ));

  // Determine overall status
  const criticalFailed = results.filter((r) => r.isCritical && r.passed === false);
  const criticalUnknown = results.filter((r) => r.isCritical && r.passed === null);
  const nonCriticalFailed = results.filter((r) => !r.isCritical && r.passed === false);

  let status: ScreeningStatus;
  if (criticalFailed.length > 0) {
    status = "REJECTED";
  } else if (criticalUnknown.length > 0) {
    status = "EVIDENCE_REQUIRED";
  } else if (nonCriticalFailed.length > 1) {
    status = "CONDITIONALLY_PASSED";
  } else {
    status = "PASSED";
  }

  return {
    status,
    dimensions: results,
    bindingConstraints,
    unknownInputs,
    evidenceRequired,
    alternativesConsidered: [],
    whatCouldChange:
      criticalFailed.length > 0
        ? `Fix binding constraints: ${bindingConstraints.join("; ")}`
        : criticalUnknown.length > 0
        ? `Provide missing evidence: ${evidenceRequired.join("; ")}`
        : "All critical dimensions pass",
    screenedAt: new Date().toISOString(),
  };
}
