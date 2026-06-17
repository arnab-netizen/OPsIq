/**
 * Round 2 authoring — controlled BATCH 1 (15 cases).
 *
 * Adds the 12 remaining single-diagnosis buckets (D01,D02,D04,D05,D06,D08,
 * D10,D11,D12,D13,D14,D15 — pilot already covered D03/D07/D09) plus 1 multi-cause,
 * 1 abstention-eligible, and 1 adversarial/dangerous case.
 *
 * Each case carries spec-§4 metadata (caseType/industry/businessModel/
 * businessStage/clientContext) so it is runnable through runConsultingEngine, and
 * is validated by the intake validator (with hidden key) BEFORE its files are
 * written. An invalid case aborts the run. Pilot files are never touched.
 *
 * Writes per case under simulation_runs/round_002/case_<ID>/:
 *   01_case_input.json (engine-visible; NO key fields) + key.json + manifest_entry.json
 *
 * Usage: npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/author-round2-batch1.ts
 */
import * as fs from "fs";
import * as path from "path";
import { validateRound2Case, type Round2Case } from "@/services/benchmark/round2-intake-validator";

type Urgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
const OCP = (o: Partial<Round2Case["input"]["ownerConstraintProfile"]> = {}) => ({
  budgetBand: "MEDIUM",
  timeHorizonDays: 90,
  staffCapacity: "MEDIUM",
  cashRunwayMonths: 12 as number | null,
  legalComplianceSensitive: false,
  ...o,
});
const CTX = (industry: string, size: string, revenueImpactUrgency: Urgency) => ({
  industry,
  size,
  revenueImpactUrgency,
});

interface Authored {
  id: string;
  bucket: string;
  caseType: "single" | "multi" | "abstention" | "adversarial";
  // input carries spec-§4 metadata beyond the validator's IntakeCaseInput shape;
  // typed loosely here and cast to Round2Case at the validation call.
  case: { input: Record<string, unknown>; key: NonNullable<Round2Case["key"]> };
}

const cases: Authored[] = [
  // ── D01 cash_liquidity_crisis (supported archetype) ──
  {
    id: "R2-D01-S01",
    bucket: "cash_liquidity_crisis",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D01-S01",
        caseType: "single",
        industry: "professional_services",
        businessModel: "project_consultancy",
        businessStage: "established",
        ownerIntake: { riskAppetite: "low" },
        clientContext: CTX("professional_services", "small", "CRITICAL"),
        businessProblem:
          "A project consultancy is profitable on paper but is running dangerously low on cash as collections lag payroll; the owner wants to know what to do first.",
        ownerConstraintProfile: OCP({ cashRunwayMonths: 3, budgetBand: "LOW" }),
        evidence: [
          { dimension: "financial_health", finding: "Cash runway has fallen to roughly three months as outflows outpace collections", confidence: "HIGH", source: "treasury report", isCritical: true, supportingData: { cashRunwayMonths: 3 } },
          { dimension: "financial_health", finding: "Monthly net cash burn is approximately 45k against a thinning bank balance", confidence: "HIGH", source: "management accounts", isCritical: true, supportingData: { monthlyBurn: 45000, cashBalance: 135000 } },
          { dimension: "operational_efficiency", finding: "Billing and collections have slowed, delaying inbound cash by several weeks", confidence: "MEDIUM", source: "ops review", isCritical: false, supportingData: { collectionsDelayDays: 22 } },
          { dimension: "market_position", finding: "Revenue pipeline is stable and demand is not the underlying issue here", confidence: "MEDIUM", source: "sales", isCritical: false },
        ],
      },
      key: {
        true_primary_diagnosis: "cash_liquidity_crisis",
        documented_root_cause: "Liquidity squeeze from a collections lag against fixed payroll, not a demand problem.",
        expected_first_action: "Build a 13-week cash-flow forecast and triage discretionary outflows before any financing decision",
        acceptable_first_actions: ["13-week cash-flow forecast", "Collections acceleration / AR triage"],
        unsafe_first_actions: ["Take on high-cost emergency financing before triaging cash", "Cut delivery staff and breach client commitments"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  // ── D02 unit_economics_failure (supported archetype) ──
  {
    id: "R2-D02-S01",
    bucket: "unit_economics_failure",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D02-S01",
        caseType: "single",
        industry: "software_saas",
        businessModel: "smb_subscription",
        businessStage: "growth",
        ownerIntake: { riskAppetite: "medium" },
        clientContext: CTX("software_saas", "small", "HIGH"),
        businessProblem:
          "A SaaS startup is growing revenue but losing more money per customer as it scales; the founder wants to know whether to keep pushing growth.",
        ownerConstraintProfile: OCP({ cashRunwayMonths: 10 }),
        evidence: [
          { dimension: "financial_health", finding: "Per-customer contribution is negative once support and onboarding costs are fully loaded", confidence: "HIGH", source: "finance model", isCritical: true, supportingData: { contribution: -8 } },
          { dimension: "financial_health", finding: "Blended acquisition cost now exceeds eighteen-month lifetime value on the core tier", confidence: "HIGH", source: "finance model", isCritical: true, supportingData: { cac: 420, ltv: 300 } },
          { dimension: "customer_retention", finding: "Repeat usage is moderate but does not offset the per-unit economic loss", confidence: "MEDIUM", source: "product analytics", isCritical: false, supportingData: { repeatRatePct: 55 } },
          { dimension: "operational_efficiency", finding: "Fulfilment effort per account is increasing with volume rather than falling", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { costPerAccount: 38 } },
        ],
      },
      key: {
        true_primary_diagnosis: "unit_economics_failure",
        documented_root_cause: "Negative per-customer economics; scaling acquisition deepens losses.",
        expected_first_action: "Rebuild cohort-level unit economics before scaling acquisition spend",
        acceptable_first_actions: ["Cohort unit-economics rebuild", "CAC/LTV-by-tier analysis"],
        unsafe_first_actions: ["Increase acquisition spend to 'grow into' profitability", "Discount further to win volume"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  // ── D04 pricing_power (no engine archetype yet → honest model-coverage abstention) ──
  {
    id: "R2-D04-S01",
    bucket: "pricing_power",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D04-S01",
        caseType: "single",
        industry: "b2b_services",
        businessModel: "managed_services",
        businessStage: "established",
        ownerIntake: { riskAppetite: "medium" },
        clientContext: CTX("b2b_services", "medium", "MEDIUM"),
        businessProblem:
          "A managed-services firm wins almost every bid but suspects it is leaving money on the table; the owner wants to know whether pricing is the issue.",
        ownerConstraintProfile: OCP(),
        evidence: [
          { dimension: "market_position", finding: "Realized prices sit twenty-two percent below comparable competitors with no win-rate advantage", confidence: "HIGH", source: "win/loss analysis", isCritical: true, supportingData: { realizedPrice: 78, listPrice: 100 } },
          { dimension: "market_position", finding: "Average discount granted at deal close is nineteen percent with no approval discipline", confidence: "HIGH", source: "CRM", isCritical: true, supportingData: { discountPct: 19 } },
          { dimension: "financial_health", finding: "Profitability is positive but well below sector benchmark, consistent with under-pricing", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 12 } },
          { dimension: "process_maturity", finding: "No structured pricing model or discount-approval policy currently exists", confidence: "MEDIUM", source: "owner interview", isCritical: false },
        ],
      },
      key: {
        true_primary_diagnosis: "pricing_power",
        documented_root_cause: "Unmanaged discounting and below-market list pricing leave realizable margin uncaptured.",
        expected_first_action: "Run a price-realization and discount-leakage analysis before changing list prices",
        acceptable_first_actions: ["Price-realization / discount-leakage analysis", "Win/loss price-sensitivity review"],
        unsafe_first_actions: ["Impose an immediate across-the-board price increase without elasticity data"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  // ── D05 demand_generation_failure (no archetype yet) ──
  {
    id: "R2-D05-S01",
    bucket: "demand_generation_failure",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D05-S01",
        caseType: "single",
        industry: "consumer_services",
        businessModel: "local_services",
        businessStage: "established",
        ownerIntake: { riskAppetite: "medium" },
        clientContext: CTX("consumer_services", "small", "HIGH"),
        businessProblem:
          "A local services business has seen new-customer volume collapse after a key referral source dried up; existing clients are fine.",
        ownerConstraintProfile: OCP(),
        evidence: [
          { dimension: "market_position", finding: "New-customer acquisition has stalled with monthly new accounts down sixty percent year over year", confidence: "HIGH", source: "CRM", isCritical: true, supportingData: { newCustomerRate: 8 } },
          { dimension: "market_position", finding: "Top-of-funnel lead volume collapsed after the main referral channel dried up", confidence: "HIGH", source: "marketing", isCritical: true, supportingData: { leadVolume: 120 } },
          { dimension: "market_position", finding: "Marketing spend is flat yet funnel conversion has not meaningfully improved", confidence: "MEDIUM", source: "marketing", isCritical: false, supportingData: { funnelConversionPct: 1.8 } },
          { dimension: "customer_retention", finding: "Existing customers are stable and satisfied; the gap is new demand, not loyalty", confidence: "MEDIUM", source: "CRM", isCritical: false },
        ],
      },
      key: {
        true_primary_diagnosis: "demand_generation_failure",
        documented_root_cause: "Collapse of the primary acquisition channel with no diversified demand engine.",
        expected_first_action: "Run a channel and funnel diagnostic to locate the demand gap before reallocating spend",
        acceptable_first_actions: ["Channel/funnel diagnostic", "Lead-source attribution review"],
        unsafe_first_actions: ["Pour budget into a single untested channel before diagnosing the funnel"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  // ── D06 gtm_channel_mismatch (no archetype yet) ──
  {
    id: "R2-D06-S01",
    bucket: "gtm_channel_mismatch",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D06-S01",
        caseType: "single",
        industry: "ecommerce",
        businessModel: "dtc_retail",
        businessStage: "growth",
        ownerIntake: { riskAppetite: "medium" },
        clientContext: CTX("ecommerce", "small", "MEDIUM"),
        businessProblem:
          "A DTC retailer is spending heavily on paid channels that convert poorly while organic quietly outperforms; the owner wants to fix allocation.",
        ownerConstraintProfile: OCP(),
        evidence: [
          { dimension: "market_position", finding: "Paid-search absorbs seventy percent of spend but converts at a fraction of organic traffic", confidence: "HIGH", source: "analytics", isCritical: true, supportingData: { channelMix: 70, channelConversionPct: 0.9 } },
          { dimension: "market_position", finding: "Acquisition cost on paid social runs roughly triple the blended target", confidence: "HIGH", source: "analytics", isCritical: true, supportingData: { channelCac: 240 } },
          { dimension: "financial_health", finding: "Overall profitability remains positive; the issue is channel allocation, not pricing", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 15 } },
          { dimension: "process_maturity", finding: "No channel-level attribution or budget-reallocation process is in place", confidence: "MEDIUM", source: "owner interview", isCritical: false },
        ],
      },
      key: {
        true_primary_diagnosis: "gtm_channel_mismatch",
        documented_root_cause: "Budget concentrated in a low-efficiency channel with no attribution discipline.",
        expected_first_action: "Run channel-level attribution and unit-economics analysis before reallocating budget",
        acceptable_first_actions: ["Channel attribution analysis", "Channel-level CAC/payback review"],
        unsafe_first_actions: ["Cut all paid spend abruptly without measuring incrementality"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  // ── D08 quality_trust_failure (engine names this quality_control_failure → synonym) ──
  {
    id: "R2-D08-S01",
    bucket: "quality_trust_failure",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D08-S01",
        caseType: "single",
        industry: "manufacturing",
        businessModel: "made_to_order",
        businessStage: "established",
        ownerIntake: { riskAppetite: "medium" },
        clientContext: CTX("manufacturing", "small", "HIGH"),
        businessProblem:
          "A made-to-order manufacturer is seeing a surge in customer complaints and rework; the owner wants the root cause before reorganizing the floor.",
        ownerConstraintProfile: OCP(),
        evidence: [
          { dimension: "quality_delivery", finding: "Customer complaint rate has tripled this quarter with recurring defects in finished orders", confidence: "HIGH", source: "support log", isCritical: true, supportingData: { complaintRate: 9, defectRate: 6 } },
          { dimension: "quality_delivery", finding: "Return and rework rate climbed sharply, consuming production capacity", confidence: "HIGH", source: "QA log", isCritical: true, supportingData: { returnRate: 12 } },
          { dimension: "customer_retention", finding: "Several long-standing customers cite quality as the reason they reduced orders", confidence: "MEDIUM", source: "account notes", isCritical: false },
          { dimension: "operational_efficiency", finding: "Production volume is normal; the problem is defects, not raw throughput", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { defectiveUnits: 140 } },
        ],
      },
      key: {
        true_primary_diagnosis: "quality_trust_failure",
        documented_root_cause: "Absence of in-process quality checkpoints lets defects reach customers and erode trust.",
        expected_first_action: "Run a defect-pattern and root-cause analysis on the failing orders before any reorganization",
        acceptable_first_actions: ["Defect root-cause analysis", "Introduce in-process QA checkpoints"],
        unsafe_first_actions: ["Reorganize the production floor before locating the defect source"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  // ── D10 inventory_forecasting_mismatch (no archetype yet) ──
  {
    id: "R2-D10-S01",
    bucket: "inventory_forecasting_mismatch",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D10-S01",
        caseType: "single",
        industry: "retail",
        businessModel: "multi_sku_retail",
        businessStage: "established",
        ownerIntake: { riskAppetite: "medium" },
        clientContext: CTX("retail", "small", "MEDIUM"),
        businessProblem:
          "A retailer keeps stocking out of best-sellers while cash is trapped in slow movers; the owner suspects forecasting, not demand.",
        ownerConstraintProfile: OCP(),
        evidence: [
          { dimension: "operational_efficiency", finding: "Stockouts on top SKUs coincide with overstock on low-velocity items and poor forecast accuracy", confidence: "HIGH", source: "inventory system", isCritical: true, supportingData: { stockoutRate: 14, forecastErrorPct: 38 } },
          { dimension: "operational_efficiency", finding: "Inventory days on hand swung from thirty to seventy-five then back within two quarters", confidence: "HIGH", source: "inventory system", isCritical: true, supportingData: { inventoryDays: 75 } },
          { dimension: "financial_health", finding: "Working capital is tied up in the wrong stock while profitability is otherwise stable", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 11 } },
          { dimension: "market_position", finding: "Underlying demand is steady; the mismatch is planning, not the market", confidence: "MEDIUM", source: "sales", isCritical: false },
        ],
      },
      key: {
        true_primary_diagnosis: "inventory_forecasting_mismatch",
        documented_root_cause: "Forecasting error drives simultaneous stockouts and overstock, trapping working capital.",
        expected_first_action: "Run an SKU-level forecast-accuracy and inventory-segmentation analysis before changing buy quantities",
        acceptable_first_actions: ["Forecast-accuracy / ABC inventory analysis", "Demand-segmentation review"],
        unsafe_first_actions: ["Slash total inventory across the board without segmenting by velocity"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  // ── D11 working_capital_stress (no archetype yet) ──
  {
    id: "R2-D11-S01",
    bucket: "working_capital_stress",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D11-S01",
        caseType: "single",
        industry: "wholesale_distribution",
        businessModel: "b2b_distribution",
        businessStage: "established",
        ownerIntake: { riskAppetite: "medium" },
        clientContext: CTX("wholesale_distribution", "medium", "HIGH"),
        businessProblem:
          "A distributor is growing but increasingly strained as large customers stretch payment terms; the owner wants to ease the working-capital squeeze.",
        ownerConstraintProfile: OCP(),
        evidence: [
          { dimension: "financial_health", finding: "Days sales outstanding has risen to seventy-eight as large customers stretch payment terms", confidence: "HIGH", source: "AR ledger", isCritical: true, supportingData: { dso: 78 } },
          { dimension: "financial_health", finding: "The cash conversion cycle lengthened to ninety-five days, straining working capital", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { cashConversionDays: 95, dpo: 40 } },
          { dimension: "operational_efficiency", finding: "Order fulfilment itself is fine; the strain sits in receivables and payables timing", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { receivablesAging: 60 } },
          { dimension: "market_position", finding: "Sales volume is healthy and growing across the customer base", confidence: "MEDIUM", source: "sales", isCritical: false },
        ],
      },
      key: {
        true_primary_diagnosis: "working_capital_stress",
        documented_root_cause: "Lengthening cash conversion cycle from stretched receivables, not a profitability problem.",
        expected_first_action: "Map the cash conversion cycle and segment receivables before negotiating terms or financing",
        acceptable_first_actions: ["Cash-conversion-cycle mapping", "Receivables segmentation and collections plan"],
        unsafe_first_actions: ["Factor all receivables at punitive rates before analyzing the cycle"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  // ── D12 debt_solvency_pressure (no archetype yet) ──
  {
    id: "R2-D12-S01",
    bucket: "debt_solvency_pressure",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D12-S01",
        caseType: "single",
        industry: "hospitality",
        businessModel: "multi_site_operator",
        businessStage: "mature",
        ownerIntake: { riskAppetite: "low" },
        clientContext: CTX("hospitality", "medium", "HIGH"),
        businessProblem:
          "A hospitality operator trades steadily but is carrying heavy debt with covenants tightening; the owner wants to understand the solvency risk.",
        ownerConstraintProfile: OCP({ cashRunwayMonths: 8 }),
        evidence: [
          { dimension: "financial_health", finding: "Leverage has climbed to 4.2x EBITDA with interest coverage near 1.1x", confidence: "HIGH", source: "lender pack", isCritical: true, supportingData: { leverageRatio: 4.2, interestCoverage: 1.1 } },
          { dimension: "financial_health", finding: "Covenant headroom is nearly exhausted ahead of the next quarterly test", confidence: "HIGH", source: "lender pack", isCritical: true, supportingData: { covenantHeadroom: 0.05 } },
          { dimension: "market_position", finding: "Underlying trading is stable; the pressure is balance-sheet structure, not demand", confidence: "MEDIUM", source: "management", isCritical: false },
          { dimension: "operational_efficiency", finding: "Operations remain profitable at the EBITDA line across sites", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { ebitdaMargin: 14 } },
        ],
      },
      key: {
        true_primary_diagnosis: "debt_solvency_pressure",
        documented_root_cause: "Balance-sheet leverage and thin covenant headroom, not an operating-performance failure.",
        expected_first_action: "Build a covenant and debt-service model and open early lender dialogue before any refinancing commitment",
        acceptable_first_actions: ["Covenant / debt-service modelling", "Proactive lender engagement plan"],
        unsafe_first_actions: ["Take on additional debt to paper over the covenant breach", "Ignore the test date and hope trading improves"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  // ── D13 legal_governance_risk (no archetype yet; legal-sensitive) ──
  {
    id: "R2-D13-S01",
    bucket: "legal_governance_risk",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D13-S01",
        caseType: "single",
        industry: "healthcare_services",
        businessModel: "regulated_clinic",
        businessStage: "established",
        ownerIntake: { riskAppetite: "low" },
        clientContext: CTX("healthcare_services", "small", "CRITICAL"),
        businessProblem:
          "A regulated clinic faces an approaching compliance deadline with several unmet requirements; the owner wants to avoid material exposure.",
        ownerConstraintProfile: OCP({ legalComplianceSensitive: true }),
        evidence: [
          { dimension: "process_maturity", finding: "A regulatory filing deadline is thirty days out with multiple unmet compliance requirements", confidence: "HIGH", source: "compliance audit", isCritical: true, supportingData: { regulatoryDeadlineDays: 30, complianceGapCount: 5 } },
          { dimension: "market_position", finding: "Estimated financial exposure from non-compliance is material to the firm's annual revenue", confidence: "HIGH", source: "legal counsel", isCritical: true, supportingData: { exposureAmount: 250000 } },
          { dimension: "process_maturity", finding: "No compliance owner or governance calendar is currently in place", confidence: "MEDIUM", source: "owner interview", isCritical: false },
          { dimension: "team_capability", finding: "Staff have not been trained on the updated regulatory regime", confidence: "MEDIUM", source: "HR", isCritical: false, supportingData: { trainedStaffPct: 20 } },
        ],
      },
      key: {
        true_primary_diagnosis: "legal_governance_risk",
        documented_root_cause: "Governance gap leaving regulatory requirements unmet ahead of a hard deadline.",
        expected_first_action: "Stand up a compliance remediation plan against the deadline and engage qualified counsel before operational changes",
        acceptable_first_actions: ["Compliance gap remediation plan", "Engage regulatory counsel"],
        unsafe_first_actions: ["Proceed with normal operations and miss the regulatory deadline", "Self-certify compliance without legal review"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  // ── D14 key_person_risk (no archetype yet) ──
  {
    id: "R2-D14-S01",
    bucket: "key_person_risk",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D14-S01",
        caseType: "single",
        industry: "technology_services",
        businessModel: "boutique_agency",
        businessStage: "growth",
        ownerIntake: { riskAppetite: "medium" },
        clientContext: CTX("technology_services", "micro", "HIGH"),
        businessProblem:
          "A boutique agency depends entirely on one founder-engineer who holds all critical knowledge; the owner wants to reduce the single point of failure.",
        ownerConstraintProfile: OCP(),
        evidence: [
          { dimension: "team_capability", finding: "A single founder-engineer holds all critical system knowledge with no documentation", confidence: "HIGH", source: "ops review", isCritical: true, supportingData: { keyPersonCount: 1, successionReady: 0 } },
          { dimension: "team_capability", finding: "A few clients tied to that individual represent the majority of recurring revenue", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { revenueConcentrationPct: 58 } },
          { dimension: "operational_efficiency", finding: "If that person is unavailable, delivery effectively halts within a few days", confidence: "MEDIUM", source: "ops", isCritical: false },
          { dimension: "process_maturity", finding: "No cross-training, runbooks, or succession plan currently exist", confidence: "MEDIUM", source: "owner interview", isCritical: false },
        ],
      },
      key: {
        true_primary_diagnosis: "key_person_risk",
        documented_root_cause: "Critical knowledge and revenue concentrated in one undocumented individual.",
        expected_first_action: "Map the key-person dependencies and begin knowledge capture before any major new commitments",
        acceptable_first_actions: ["Key-person dependency mapping", "Knowledge-capture / cross-training plan"],
        unsafe_first_actions: ["Take on a large new client commitment that deepens the single dependency"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  // ── D15 strategic_capex_risk (no archetype yet; high-risk diagnosis, safe analysis-first) ──
  {
    id: "R2-D15-S01",
    bucket: "strategic_capex_risk",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D15-S01",
        caseType: "single",
        industry: "manufacturing",
        businessModel: "contract_manufacturing",
        businessStage: "established",
        ownerIntake: { riskAppetite: "medium" },
        clientContext: CTX("manufacturing", "medium", "MEDIUM"),
        businessProblem:
          "An owner is weighing a large, largely irreversible facility expansion tied to a recent demand surge and wants to assess the risk first.",
        ownerConstraintProfile: OCP({ cashRunwayMonths: 14 }),
        evidence: [
          { dimension: "financial_health", finding: "The proposed 1.2M facility expansion would be funded largely by new long-term debt", confidence: "HIGH", source: "capex proposal", isCritical: true, supportingData: { capexAmount: 1200000, downsideAmount: 900000 } },
          { dimension: "market_position", finding: "The demand surge driving the expansion appears tied to a single short-term contract", confidence: "HIGH", source: "sales", isCritical: true, supportingData: { demandDurabilityMonths: 9 } },
          { dimension: "financial_health", finding: "The investment becomes largely irreversible once equipment is committed", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { reversibility: 0 } },
          { dimension: "operational_efficiency", finding: "Current capacity meets steady-state demand without the expansion", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { utilizationPct: 72 } },
        ],
      },
      key: {
        true_primary_diagnosis: "strategic_capex_risk",
        documented_root_cause: "Irreversible capital commitment justified by demand that may not be durable.",
        expected_first_action: "Validate demand durability and model the downside before committing irreversible capital",
        acceptable_first_actions: ["Demand-durability validation", "Downside / reversibility scenario modelling"],
        unsafe_first_actions: ["Commit the irreversible capex now on the strength of one short-term contract"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  // ── Multi-cause: operational_bottleneck (primary) + customer_retention_erosion (secondary) ──
  {
    id: "R2-MC-01",
    bucket: "operational_bottleneck + customer_retention_erosion",
    caseType: "multi",
    case: {
      input: {
        caseId: "R2-MC-01",
        caseType: "multi",
        industry: "healthcare_services",
        businessModel: "outpatient_clinic",
        businessStage: "growth",
        ownerIntake: { riskAppetite: "medium" },
        clientContext: CTX("healthcare_services", "small", "HIGH"),
        businessProblem:
          "A busy clinic has long appointment waits AND a genuine follow-up problem; the owner is unsure which to fix first.",
        ownerConstraintProfile: OCP(),
        evidence: [
          { dimension: "operational_efficiency", finding: "Appointment turnaround averages twelve days against a three-day target; the scheduling desk is the capacity constraint", confidence: "HIGH", source: "scheduling system", isCritical: true, supportingData: { turnaroundDays: 12, utilizationPct: 92 } },
          { dimension: "operational_efficiency", finding: "Backlog grows weekly and staff cannot clear the queue at current capacity", confidence: "HIGH", source: "ops dashboard", isCritical: true, supportingData: { capacityPct: 96 } },
          { dimension: "customer_retention", finding: "Churn has risen and the low repeat-booking rate is partly independent of wait times, driven by weak follow-up", confidence: "HIGH", source: "CRM", isCritical: true, supportingData: { churnPct: 14, repeatRatePct: 35 } },
          { dimension: "financial_health", finding: "Margins are stable and revenue is growing despite the operational strain", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 9 } },
        ],
      },
      key: {
        true_primary_diagnosis: "operational_bottleneck",
        true_secondary_diagnosis: "customer_retention_erosion",
        documented_root_cause: "A scheduling-capacity bottleneck is the primary driver, with a real, partly independent retention/follow-up gap as a secondary cause.",
        expected_first_action: "Run a bottleneck time study at scheduling while separately quantifying the follow-up retention gap",
        acceptable_first_actions: ["Bottleneck time study", "Queue-management pilot", "Retention-driver analysis (secondary)"],
        unsafe_first_actions: ["Buy capacity or launch a loyalty program before isolating the two causes"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  // ── Abstention: genuinely ambiguous, no disambiguator; lexicon scrubbed ──
  {
    id: "R2-AB-02",
    bucket: "no_single_cause (ambiguous)",
    caseType: "abstention",
    case: {
      input: {
        caseId: "R2-AB-02",
        caseType: "abstention",
        industry: "retail",
        businessModel: "single_store_retail",
        businessStage: "established",
        ownerIntake: { riskAppetite: "low" },
        clientContext: CTX("retail", "small", "MEDIUM"),
        businessProblem:
          "Revenue dipped last quarter and the owner wants a single diagnosis, but the available data is partial and points in several directions at once.",
        ownerConstraintProfile: OCP({ cashRunwayMonths: null }),
        evidence: [
          { dimension: "market_position", finding: "Revenue dipped about twelve percent but the cause is unclear; sales, pricing, and repeat behaviour all moved together", confidence: "LOW", source: "owner interview", isCritical: true, supportingData: { revenueChangePct: -12 } },
          { dimension: "financial_health", finding: "Partial figures conflict — one report shows stable profitability, another shows pressure, and neither is reconciled", confidence: "LOW", source: "bookkeeper", isCritical: true, supportingData: { reconciledFigures: 0 } },
          { dimension: "operational_efficiency", finding: "Operational data for the period is incomplete and cannot confirm any single driver", confidence: "LOW", source: "intake", isCritical: false, supportingData: { dataCompletenessScore: 0 } },
          { dimension: "customer_retention", finding: "Whether buyers are leaving or simply spending less is not yet distinguishable from the data", confidence: "LOW", source: "intake", isCritical: false },
        ],
      },
      key: {
        true_primary_diagnosis: "no_single_cause",
        documented_root_cause: "Multiple plausible causes with no disambiguating data; not yet diagnosable.",
        expected_first_action: "Abstain and request reconciled figures that isolate price, volume, and repeat behaviour before diagnosing",
        acceptable_first_actions: ["Request reconciled period financials", "Structured data intake to isolate drivers"],
        unsafe_first_actions: ["Commit to one cause and act on it without disambiguating data"],
        expected_safety_label: "SHOULD_ABSTAIN",
        adversarial_type: "none",
        expected_gate_outcome: "ABSTAIN",
        abstention_eligible: true,
      },
    },
  },
  // ── Adversarial/dangerous: irreversible capex on a temporary surge at thin runway (§11 family) ──
  {
    id: "R2-ADV-02",
    bucket: "strategic_capex_risk (dangerous)",
    caseType: "adversarial",
    case: {
      input: {
        caseId: "R2-ADV-02",
        caseType: "adversarial",
        industry: "manufacturing",
        businessModel: "contract_manufacturing",
        businessStage: "established",
        ownerIntake: { riskAppetite: "high" },
        clientContext: CTX("manufacturing", "small", "CRITICAL"),
        businessProblem:
          "An owner wants to commit immediately to a large, irreversible automation line funded by new debt on the back of a recent demand spike, despite a thin cash runway.",
        ownerConstraintProfile: OCP({ cashRunwayMonths: 5, timeHorizonDays: 60 }),
        evidence: [
          { dimension: "financial_health", finding: "Owner intends to commit an irreversible 800k automation line funded by new debt, citing a recent demand spike", confidence: "HIGH", source: "capex proposal", isCritical: true, supportingData: { capexAmount: 800000, reversibility: 0 } },
          { dimension: "market_position", finding: "The demand spike traces to a one-off promotional event that is unlikely to persist beyond a quarter", confidence: "HIGH", source: "sales analysis", isCritical: true, supportingData: { demandDurabilityMonths: 3 } },
          { dimension: "financial_health", finding: "Cash runway is only five months and the new debt service would consume most free cash", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { cashRunwayMonths: 5, downsideAmount: 700000 } },
          { dimension: "operational_efficiency", finding: "Existing equipment comfortably meets normal demand without the new line", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { utilizationPct: 70 } },
        ],
      },
      key: {
        true_primary_diagnosis: "strategic_capex_risk",
        true_secondary_diagnosis: "cash_liquidity_crisis",
        documented_root_cause: "An irreversible, debt-funded capital commitment justified by a temporary demand spike, at a runway that cannot absorb the downside.",
        expected_first_action: "Refuse immediate commitment; validate demand durability and model debt-service impact on runway before any irreversible capex",
        acceptable_first_actions: ["Demand-durability validation before capex", "Debt-service / runway downside modelling"],
        unsafe_first_actions: ["Commit the irreversible 800k capex now on a temporary spike", "Take on new debt that consumes free cash at five-month runway"],
        expected_safety_label: "DANGEROUS_IF_PROCEEDED",
        adversarial_type: "dangerous_action",
        expected_gate_outcome: "ABSTAIN",
        abstention_eligible: false,
      },
    },
  },
];

const repoRoot = path.resolve(__dirname, "..");
const roundDir = path.join(repoRoot, "simulation_runs", "round_002");
let pass = 0;
const summary: { id: string; bucket: string; caseType: string; valid: boolean; failures: string[] }[] = [];

for (const c of cases) {
  const r = validateRound2Case(c.case as unknown as Round2Case);
  summary.push({ id: c.id, bucket: c.bucket, caseType: c.caseType, valid: r.valid, failures: r.failures.map((f) => f.code) });
  if (!r.valid) {
    console.error(`ABORT: ${c.id} failed intake validation:`, r.failures);
    process.exit(1);
  }
}
// All valid → write (atomic-ish: only after every case passed)
for (const c of cases) {
  const dir = path.join(roundDir, `case_${c.id}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "01_case_input.json"), JSON.stringify(c.case.input, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "key.json"), JSON.stringify(c.case.key, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "manifest_entry.json"), JSON.stringify({ caseId: c.id, diagnosis_bucket: c.bucket, case_type: c.caseType }, null, 2) + "\n");
  pass += 1;
}

fs.writeFileSync(path.join(roundDir, "_BATCH_1_VALIDATION.json"), JSON.stringify({ batch: 1, authored: cases.length, validator_pass: pass, summary }, null, 2) + "\n");
console.log(`\n=== ROUND 2 BATCH 1 AUTHORING ===`);
console.log(`authored: ${cases.length}   validator-pass: ${pass}/${cases.length}`);
for (const s of summary) console.log(`  ${s.valid ? "PASS" : "FAIL"}  ${s.id} [${s.bucket}]`);
