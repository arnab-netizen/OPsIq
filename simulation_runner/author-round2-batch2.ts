/**
 * Round 2 authoring — controlled BATCH 2 (22 cases), grounded in the documented
 * real-world situations collected in round_002_source_candidates (de-identified).
 *
 * Coverage: a 2nd example for every diagnosis bucket the engine supports (cash,
 * unit-econ, margin, retention, quality, bottleneck) so capability is measurable;
 * 2nd examples for the 8 currently-uncovered buckets (pricing, demand, inventory,
 * working-capital, debt, legal, key-person, capex) to drive future archetypes;
 * 2 multi-cause; 2 abstention (lexicon-scrubbed); 3 adversarial/dangerous; 2
 * good/stable (over-intervention + turnaround). Each carries spec-§4 metadata.
 *
 * Every case is validated by the intake validator (with hidden key) BEFORE its files
 * are written; an invalid case aborts the run. Original/pilot/batch-1 files untouched.
 *
 * Provenance is recorded in the HIDDEN key (`provenance`), never in the engine-visible
 * input. Sources are NOT full-text-verified, so no case is REAL_SOURCE_BACKED; these
 * are realistic situations grounded in documented patterns.
 *
 * Usage: npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/author-round2-batch2.ts
 */
import * as fs from "fs";
import * as path from "path";
import { validateRound2Case, type Round2Case } from "@/services/benchmark/round2-intake-validator";

type Urgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
const OCP = (o: Partial<Round2Case["input"]["ownerConstraintProfile"]> = {}) => ({
  budgetBand: "MEDIUM", timeHorizonDays: 90, staffCapacity: "MEDIUM",
  cashRunwayMonths: 12 as number | null, legalComplianceSensitive: false, ...o,
});
const CTX = (industry: string, size: string, revenueImpactUrgency: Urgency) => ({ industry, size, revenueImpactUrgency });

// input + key carry fields beyond the validator's shapes (spec-§4 metadata + hidden
// `provenance`); typed loosely here and cast to Round2Case at the validation call.
interface Authored { id: string; bucket: string; caseType: "single" | "multi" | "abstention" | "adversarial"; case: { input: Record<string, unknown>; key: Record<string, unknown> }; }

const cases: Authored[] = [
  // ─────────── COVERED BUCKETS (engine should diagnose correctly) ───────────
  { id: "R2-D01-S02", bucket: "cash_liquidity_crisis", caseType: "single", case: { input: {
    caseId: "R2-D01-S02", caseType: "single", industry: "transportation_manufacturing", businessModel: "capital_goods_oem", businessStage: "mature",
    ownerIntake: { riskAppetite: "low" }, clientContext: CTX("transportation_manufacturing", "large", "CRITICAL"), ownerConstraintProfile: OCP({ cashRunwayMonths: 4, budgetBand: "LOW" }),
    businessProblem: "A capital-goods manufacturer hit by a credit-market shock is solvent on paper but is running dangerously low on cash; the owner wants the right first move.",
    evidence: [
      { dimension: "financial_health", finding: "Liquidity has tightened sharply; available cash runway is about four months at the current burn", confidence: "HIGH", source: "treasury", isCritical: true, supportingData: { cashRunwayMonths: 4 } },
      { dimension: "financial_health", finding: "Monthly operating cash burn is roughly ninety million against a shrinking balance", confidence: "HIGH", source: "management accounts", isCritical: true, supportingData: { monthlyBurn: 90000000 } },
      { dimension: "operational_efficiency", finding: "Underlying operations remain viable; the issue is near-term liquidity, not demand", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { utilizationPct: 78 } },
      { dimension: "market_position", finding: "The order book is stable; this is a financing-side shock rather than a market collapse", confidence: "MEDIUM", source: "sales", isCritical: false },
    ] },
    key: { true_primary_diagnosis: "cash_liquidity_crisis", documented_root_cause: "External financing-market shock against fixed obligations; viable operations, acute liquidity.", expected_first_action: "Build a 13-week cash-flow forecast and secure committed liquidity before any restructuring", acceptable_first_actions: ["13-week cash-flow forecast", "Draw/secure committed financing facilities"], unsafe_first_actions: ["Fire-sale viable assets at distressed prices", "Cut viable operations purely to raise cash"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented 2008/2020 liquidity-shock survivals (SRC-055 Ford, SRC-062 Delta); UNVERIFIED" } } },

  { id: "R2-D02-S02", bucket: "unit_economics_failure", caseType: "single", case: { input: {
    caseId: "R2-D02-S02", caseType: "single", industry: "ecommerce", businessModel: "dtc_subscription", businessStage: "growth",
    ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("ecommerce", "small", "HIGH"), ownerConstraintProfile: OCP({ cashRunwayMonths: 9 }),
    businessProblem: "A DTC brand is growing orders fast but losing more money per order as it scales; the founder wants to know whether to keep spending on growth.",
    evidence: [
      { dimension: "financial_health", finding: "Per-order contribution is negative once shipping and returns are loaded, at roughly minus nine percent", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { contribution: -9 } },
      { dimension: "financial_health", finding: "Customer acquisition cost exceeds two-year lifetime value on the flagship line", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { cac: 140, ltv: 110 } },
      { dimension: "customer_retention", finding: "Some repeat purchasing exists but is too thin to recover acquisition cost", confidence: "MEDIUM", source: "analytics", isCritical: false, supportingData: { repeatRatePct: 31 } },
      { dimension: "operational_efficiency", finding: "Fulfilment cost per order is rising with volume rather than falling", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { costPerOrder: 22 } },
    ] },
    key: { true_primary_diagnosis: "unit_economics_failure", documented_root_cause: "Negative per-order economics; scaling acquisition deepens losses.", expected_first_action: "Rebuild cohort unit economics before any further acquisition spend", acceptable_first_actions: ["Cohort unit-economics rebuild", "CAC/LTV-by-line analysis"], unsafe_first_actions: ["Scale paid acquisition to chase growth", "Cut price further to win volume"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented DTC negative-unit-economics failures (SRC-010 Pets.com, SRC-015 Casper); UNVERIFIED" } } },

  { id: "R2-D03-S02", bucket: "margin_erosion", caseType: "single", case: { input: {
    caseId: "R2-D03-S02", caseType: "single", industry: "manufacturing", businessModel: "made_to_order", businessStage: "established",
    ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("manufacturing", "small", "MEDIUM"), ownerConstraintProfile: OCP({ cashRunwayMonths: 10 }),
    businessProblem: "A made-to-order manufacturer has watched profitability slide for over a year as input costs climb; the owner wants the real driver before touching prices.",
    evidence: [
      { dimension: "financial_health", finding: "Gross margin fell from thirty-eight to twenty-six percent over five quarters as input costs rose faster than price", confidence: "HIGH", source: "management accounts", isCritical: true, supportingData: { marginPct: -12 } },
      { dimension: "financial_health", finding: "Raw-material and freight cost per unit rose seventeen percent year over year", confidence: "HIGH", source: "purchasing", isCritical: true, supportingData: { cogsPct: 17 } },
      { dimension: "operational_efficiency", finding: "Throughput and scrap rates are stable; this is a cost-versus-price problem, not efficiency", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { throughput: 900 } },
      { dimension: "market_position", finding: "Competitors raised list prices while the firm did not, leaving price headroom unused", confidence: "MEDIUM", source: "sales", isCritical: false },
    ] },
    key: { true_primary_diagnosis: "margin_erosion", documented_root_cause: "Input-cost inflation outpacing price; cost-driven margin compression.", expected_first_action: "Decompose cost drivers and test price/contract levers before broad price action", acceptable_first_actions: ["Cost-driver decomposition / margin bridge", "Supplier-terms and pricing review"], unsafe_first_actions: ["Blanket across-the-board price increase without elasticity testing"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented cost-inflation margin compression; UNVERIFIED" } } },

  { id: "R2-D07-S02", bucket: "customer_retention_erosion", caseType: "single", case: { input: {
    caseId: "R2-D07-S02", caseType: "single", industry: "software_saas", businessModel: "smb_subscription", businessStage: "growth",
    ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("software_saas", "small", "HIGH"), ownerConstraintProfile: OCP({ cashRunwayMonths: 11 }),
    businessProblem: "A SaaS vendor keeps adding new logos but the base is leaking; the owner wants to know why customers churn before spending on retention.",
    evidence: [
      { dimension: "customer_retention", finding: "Monthly logo churn climbed to seven percent with one-time trials dominating new signups", confidence: "HIGH", source: "subscription analytics", isCritical: true, supportingData: { churnPct: 7 } },
      { dimension: "customer_retention", finding: "Net revenue retention fell from one hundred four to eighty-eight percent over three quarters", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { retentionPct: 88 } },
      { dimension: "customer_retention", finding: "No structured onboarding, customer-success, or win-back motion currently exists", confidence: "MEDIUM", source: "owner interview", isCritical: true },
      { dimension: "financial_health", finding: "Gross margin on retained accounts is healthy and clearly positive", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 71 } },
    ] },
    key: { true_primary_diagnosis: "customer_retention_erosion", documented_root_cause: "Absent retention mechanism on otherwise-profitable accounts.", expected_first_action: "Run a cohort churn-driver analysis before launching any retention program", acceptable_first_actions: ["Cohort churn-driver analysis", "Exit-reason interviews"], unsafe_first_actions: ["Launch a deep-discount loyalty program before confirming the driver"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented subscription/merchant churn (SRC-016 Groupon); UNVERIFIED" } } },

  { id: "R2-D08-S02", bucket: "quality_trust_failure", caseType: "single", case: { input: {
    caseId: "R2-D08-S02", caseType: "single", industry: "restaurant", businessModel: "fast_casual_chain", businessStage: "established",
    ownerIntake: { riskAppetite: "low" }, clientContext: CTX("restaurant", "medium", "CRITICAL"), ownerConstraintProfile: OCP({ cashRunwayMonths: 8 }),
    businessProblem: "A fast-casual chain saw a safety/quality incident and customer trust is falling; the owner wants the root cause before any marketing relaunch.",
    evidence: [
      { dimension: "quality_delivery", finding: "The customer complaint rate spiked sharply after a contamination incident, with repeat illness reports", confidence: "HIGH", source: "support log", isCritical: true, supportingData: { complaintRate: 14, defectRate: 5 } },
      { dimension: "quality_delivery", finding: "Health-related refunds and temporary store closures rose materially this quarter", confidence: "HIGH", source: "ops log", isCritical: true, supportingData: { returnRate: 9 } },
      { dimension: "customer_retention", finding: "Visit frequency dropped among previously loyal guests citing safety concerns", confidence: "MEDIUM", source: "CRM", isCritical: false, supportingData: { repeatRatePct: 48 } },
      { dimension: "operational_efficiency", finding: "Kitchen volume is normal; the problem is safety and quality control, not throughput", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { defectiveUnits: 120 } },
    ] },
    key: { true_primary_diagnosis: "quality_trust_failure", documented_root_cause: "Absent in-process safety/quality controls let defects reach customers and erode trust.", expected_first_action: "Run a food-safety root-cause and containment audit before reopening marketing", acceptable_first_actions: ["Safety/quality root-cause analysis", "Containment + in-process controls"], unsafe_first_actions: ["Relaunch promotions before fixing the safety root cause"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented foodborne-illness trust failure + recovery (SRC-023 Chipotle); engine names this quality_control_failure (synonym); UNVERIFIED" } } },

  { id: "R2-D09-S02", bucket: "operational_bottleneck", caseType: "single", case: { input: {
    caseId: "R2-D09-S02", caseType: "single", industry: "consumer_services", businessModel: "multi_site_services", businessStage: "growth",
    ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("consumer_services", "small", "HIGH"), ownerConstraintProfile: OCP({ cashRunwayMonths: 12 }),
    businessProblem: "A fast-growing services business has rising demand but slipping turnaround; some customers stop returning after long waits.",
    evidence: [
      { dimension: "operational_efficiency", finding: "Average service turnaround slipped to nine days against a three-day target; the prep station is the capacity constraint", confidence: "HIGH", source: "job tracker", isCritical: true, supportingData: { turnaroundDays: 9, utilizationPct: 94 } },
      { dimension: "operational_efficiency", finding: "Backlog grows weekly and staff cannot clear the queue at current capacity", confidence: "HIGH", source: "ops dashboard", isCritical: true, supportingData: { capacityPct: 97 } },
      { dimension: "customer_retention", finding: "There is a low repeat rate among customers who waited the longest for delivery", confidence: "MEDIUM", source: "CRM", isCritical: false, supportingData: { repeatRatePct: 44 } },
      { dimension: "financial_health", finding: "Revenue is growing and margins are stable and positive despite the strain", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 12 } },
    ] },
    key: { true_primary_diagnosis: "operational_bottleneck", documented_root_cause: "A single constrained station throttles throughput and lengthens turnaround, driving churn.", expected_first_action: "Run a bottleneck/time study at the prep station before adding capacity or capex", acceptable_first_actions: ["Bottleneck time study", "Queue-management / scheduling pilot"], unsafe_first_actions: ["Commit to large equipment/space capex before confirming the constraint"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented over-extension/throughput cases (SRC-027 Starbucks, SRC-098 KFC-UK); UNVERIFIED" } } },

  // ─────────── UNCOVERED BUCKETS (engine should abstain - model-coverage gap) ───────────
  { id: "R2-D04-S02", bucket: "pricing_power", caseType: "single", case: { input: {
    caseId: "R2-D04-S02", caseType: "single", industry: "b2b_services", businessModel: "managed_services", businessStage: "established",
    ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("b2b_services", "medium", "MEDIUM"), ownerConstraintProfile: OCP(),
    businessProblem: "A managed-services firm wins almost every bid and suspects it is systematically under-pricing; the owner wants evidence before changing prices.",
    evidence: [
      { dimension: "market_position", finding: "Realized prices run eighteen percent below comparable competitors with no win-rate advantage", confidence: "HIGH", source: "win/loss", isCritical: true, supportingData: { realizedPrice: 82, listPrice: 100 } },
      { dimension: "market_position", finding: "The average close discount is twenty-one percent with no approval discipline", confidence: "HIGH", source: "CRM", isCritical: true, supportingData: { discountPct: 21 } },
      { dimension: "financial_health", finding: "Operating margin is positive but well below sector benchmark, consistent with under-pricing", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 14 } },
      { dimension: "process_maturity", finding: "No structured pricing model or discount-approval governance currently exists", confidence: "MEDIUM", source: "owner interview", isCritical: false },
    ] },
    key: { true_primary_diagnosis: "pricing_power", documented_root_cause: "Below-market list pricing plus unmanaged discounting leave realizable margin uncaptured.", expected_first_action: "Run a price-realization and discount-leakage analysis before changing list prices", acceptable_first_actions: ["Price-realization / discount-leakage analysis", "Win/loss price-sensitivity review"], unsafe_first_actions: ["Impose an across-the-board price increase without elasticity data"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented under-pricing/discount-leakage patterns; UNVERIFIED" } } },

  { id: "R2-D05-S02", bucket: "demand_generation_failure", caseType: "single", case: { input: {
    caseId: "R2-D05-S02", caseType: "single", industry: "retail", businessModel: "specialty_retail", businessStage: "mature",
    ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("retail", "small", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "A specialty retailer has seen new-customer demand collapse as the category shifted to online substitutes; existing customers are loyal.",
    evidence: [
      { dimension: "market_position", finding: "New-customer footfall and online sessions fell forty percent year over year as the core channel eroded", confidence: "HIGH", source: "analytics", isCritical: true, supportingData: { newCustomerRate: 6 } },
      { dimension: "market_position", finding: "Top-of-funnel traffic and lead volume collapsed after the category shifted to substitutes", confidence: "HIGH", source: "marketing", isCritical: true, supportingData: { leadVolume: 90, funnelConversionPct: 1.4 } },
      { dimension: "customer_retention", finding: "Existing customers are loyal and satisfied; the gap is new demand, not loyalty", confidence: "MEDIUM", source: "CRM", isCritical: false },
      { dimension: "financial_health", finding: "Margins are stable; the problem is volume and demand, not unit cost", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 9 } },
    ] },
    key: { true_primary_diagnosis: "demand_generation_failure", documented_root_cause: "Structural demand collapse / channel substitution with no diversified demand engine.", expected_first_action: "Run a channel, funnel, and substitution analysis before reallocating spend", acceptable_first_actions: ["Channel/funnel diagnostic", "Category-substitution review"], unsafe_first_actions: ["Pour budget into one untested channel before diagnosing the funnel"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented demand-collapse failures (SRC-009 RadioShack, SRC-030/107 Blockbuster); UNVERIFIED" } } },

  { id: "R2-D10-S02", bucket: "inventory_forecasting_mismatch", caseType: "single", case: { input: {
    caseId: "R2-D10-S02", caseType: "single", industry: "retail", businessModel: "multi_sku_retail", businessStage: "established",
    ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("retail", "medium", "MEDIUM"), ownerConstraintProfile: OCP(),
    businessProblem: "A retailer keeps stocking out of best-sellers while cash is trapped in overstock; the owner suspects forecasting, not demand.",
    evidence: [
      { dimension: "operational_efficiency", finding: "Stockouts on best-sellers coincide with heavy overstock on low-velocity lines, and forecast accuracy is poor", confidence: "HIGH", source: "inventory system", isCritical: true, supportingData: { stockoutRate: 12, forecastErrorPct: 34 } },
      { dimension: "operational_efficiency", finding: "Inventory days on hand swung from forty-five to ninety-five then back within two quarters", confidence: "HIGH", source: "inventory system", isCritical: true, supportingData: { inventoryDays: 95 } },
      { dimension: "financial_health", finding: "Working capital is trapped in the wrong stock while profitability is otherwise stable", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 11 } },
      { dimension: "market_position", finding: "Underlying demand is steady; the mismatch is planning, not the market", confidence: "MEDIUM", source: "sales", isCritical: false },
    ] },
    key: { true_primary_diagnosis: "inventory_forecasting_mismatch", documented_root_cause: "Forecast error drives simultaneous stockouts and overstock, trapping working capital.", expected_first_action: "Run SKU-level forecast-accuracy and inventory segmentation before changing buys", acceptable_first_actions: ["Forecast-accuracy / ABC inventory analysis", "Demand-segmentation review"], unsafe_first_actions: ["Slash total inventory across the board without segmenting by velocity"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented 2022 inventory gluts (SRC-086 Target, SRC-087 Nike); UNVERIFIED" } } },

  { id: "R2-D11-S02", bucket: "working_capital_stress", caseType: "single", case: { input: {
    caseId: "R2-D11-S02", caseType: "single", industry: "construction", businessModel: "contractor", businessStage: "established",
    ownerIntake: { riskAppetite: "low" }, clientContext: CTX("construction", "medium", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "A contractor is winning work but is increasingly strained as large clients stretch payment terms; the owner wants to ease the squeeze.",
    evidence: [
      { dimension: "financial_health", finding: "Days sales outstanding rose to eighty-two as large clients stretched payment terms", confidence: "HIGH", source: "AR ledger", isCritical: true, supportingData: { dso: 82 } },
      { dimension: "financial_health", finding: "The cash conversion cycle lengthened to one hundred one days, straining working capital", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { cashConversionDays: 101, dpo: 45 } },
      { dimension: "operational_efficiency", finding: "Delivery is on track; the strain sits in receivables and payables timing", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { receivablesAging: 65 } },
      { dimension: "market_position", finding: "The order book is healthy and growing across the client base", confidence: "MEDIUM", source: "sales", isCritical: false },
    ] },
    key: { true_primary_diagnosis: "working_capital_stress", documented_root_cause: "Lengthening cash-conversion cycle from stretched receivables, not a profitability problem.", expected_first_action: "Map the cash-conversion cycle and segment receivables before factoring or financing", acceptable_first_actions: ["Cash-conversion-cycle mapping", "Receivables segmentation + collections plan"], unsafe_first_actions: ["Factor all receivables at punitive rates before analyzing the cycle"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented contractor working-capital stress (SRC-091 Carillion, SRC-088 Tutor Perini); UNVERIFIED" } } },

  { id: "R2-D12-S02", bucket: "debt_solvency_pressure", caseType: "single", case: { input: {
    caseId: "R2-D12-S02", caseType: "single", industry: "retail", businessModel: "lbo_retail", businessStage: "mature",
    ownerIntake: { riskAppetite: "low" }, clientContext: CTX("retail", "large", "HIGH"), ownerConstraintProfile: OCP({ cashRunwayMonths: 9 }),
    businessProblem: "A retailer carrying heavy post-LBO debt faces a large maturity and tightening covenants; the owner wants to understand the solvency risk.",
    evidence: [
      { dimension: "financial_health", finding: "Leverage sits at five point one times EBITDA with interest coverage near one point two times after the buyout", confidence: "HIGH", source: "lender pack", isCritical: true, supportingData: { leverageRatio: 5.1, interestCoverage: 1.2 } },
      { dimension: "financial_health", finding: "A large maturity falls due next year with thin covenant headroom ahead of the test", confidence: "HIGH", source: "lender pack", isCritical: true, supportingData: { covenantHeadroom: 0.04 } },
      { dimension: "market_position", finding: "Underlying trading is stable; the pressure is balance-sheet structure, not demand", confidence: "MEDIUM", source: "management", isCritical: false },
      { dimension: "operational_efficiency", finding: "Stores remain profitable at the operating line across the estate", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 8 } },
    ] },
    key: { true_primary_diagnosis: "debt_solvency_pressure", documented_root_cause: "Balance-sheet leverage and thin covenant headroom, not an operating-performance failure.", expected_first_action: "Build a covenant and debt-service model and open early lender dialogue before refinancing", acceptable_first_actions: ["Covenant / debt-service modelling", "Proactive lender engagement plan"], unsafe_first_actions: ["Take on more debt to paper over the maturity", "Ignore the test date and hope trading improves"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented LBO-debt failures (SRC-001 Toys R Us, SRC-093 Thomas Cook); UNVERIFIED" } } },

  { id: "R2-D13-S02", bucket: "legal_governance_risk", caseType: "single", case: { input: {
    caseId: "R2-D13-S02", caseType: "single", industry: "financial_services", businessModel: "regulated_retail_bank", businessStage: "mature",
    ownerIntake: { riskAppetite: "low" }, clientContext: CTX("financial_services", "large", "CRITICAL"), ownerConstraintProfile: OCP({ legalComplianceSensitive: true }),
    businessProblem: "A regulated firm discovers an incentive scheme drove staff misconduct and a regulator has opened an inquiry; the owner wants to contain the exposure.",
    evidence: [
      { dimension: "process_maturity", finding: "An aggressive incentive scheme drove staff to open unauthorized accounts, and a regulator opened a formal inquiry", confidence: "HIGH", source: "compliance", isCritical: true, supportingData: { complianceGapCount: 6, regulatoryDeadlineDays: 45 } },
      { dimension: "market_position", finding: "Estimated regulatory and remediation exposure is material to annual revenue", confidence: "HIGH", source: "legal counsel", isCritical: true, supportingData: { exposureAmount: 185000000 } },
      { dimension: "process_maturity", finding: "No effective controls or board oversight of the incentive scheme were in place", confidence: "MEDIUM", source: "internal audit", isCritical: false },
      { dimension: "team_capability", finding: "Staff lacked training on the conduct rules they were expected to follow", confidence: "MEDIUM", source: "HR", isCritical: false, supportingData: { trainedStaffPct: 35 } },
    ] },
    key: { true_primary_diagnosis: "legal_governance_risk", documented_root_cause: "Incentive-driven misconduct with absent controls/governance, now under regulatory scrutiny.", expected_first_action: "Halt the incentive scheme, engage counsel, and stand up remediation before business-as-usual", acceptable_first_actions: ["Suspend the scheme + engage regulatory counsel", "Stand up a governance remediation program"], unsafe_first_actions: ["Continue the incentive scheme", "Self-certify compliance without independent review"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented governance/conduct failures (SRC-067 Wells Fargo, SRC-094 Patisserie Valerie); UNVERIFIED" } } },

  { id: "R2-D14-S02", bucket: "key_person_risk", caseType: "single", case: { input: {
    caseId: "R2-D14-S02", caseType: "single", industry: "professional_services", businessModel: "owner_operated_practice", businessStage: "growth",
    ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("professional_services", "micro", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "A boutique practice depends entirely on one owner-operator who holds all client relationships and pricing knowledge; the owner wants to reduce the single point of failure.",
    evidence: [
      { dimension: "team_capability", finding: "A single owner-operator holds all client relationships and pricing knowledge, entirely undocumented", confidence: "HIGH", source: "ops review", isCritical: true, supportingData: { keyPersonCount: 1, successionReady: 0 } },
      { dimension: "team_capability", finding: "The top two clients tied to that individual represent the majority of recurring revenue", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { revenueConcentrationPct: 62 } },
      { dimension: "operational_efficiency", finding: "If that person is unavailable, delivery and billing stall within a few days", confidence: "MEDIUM", source: "ops", isCritical: false },
      { dimension: "process_maturity", finding: "No cross-training, runbooks, or succession plan currently exist", confidence: "MEDIUM", source: "owner interview", isCritical: false },
    ] },
    key: { true_primary_diagnosis: "key_person_risk", documented_root_cause: "Critical relationships and knowledge concentrated in one undocumented individual.", expected_first_action: "Map key-person dependencies and begin knowledge capture before any new commitments", acceptable_first_actions: ["Key-person dependency mapping", "Knowledge-capture / cross-training plan"], unsafe_first_actions: ["Take on a large new commitment that deepens the single dependency"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented key-person dependency (SRC-046 Market Basket, SRC-054 SMB survey); UNVERIFIED" } } },

  { id: "R2-D15-S02", bucket: "strategic_capex_risk", caseType: "single", case: { input: {
    caseId: "R2-D15-S02", caseType: "single", industry: "ecommerce_logistics", businessModel: "online_fulfilment", businessStage: "growth",
    ownerIntake: { riskAppetite: "high" }, clientContext: CTX("ecommerce_logistics", "small", "MEDIUM"), ownerConstraintProfile: OCP({ cashRunwayMonths: 11 }),
    businessProblem: "An online-fulfilment startup is weighing a large, largely irreversible automated-warehouse build to support an unproven regional expansion.",
    evidence: [
      { dimension: "financial_health", finding: "The owner plans a forty-million automated-warehouse build funded largely by new capital", confidence: "HIGH", source: "capex proposal", isCritical: true, supportingData: { capexAmount: 40000000, downsideAmount: 30000000 } },
      { dimension: "market_position", finding: "The demand justifying the build rests on an unproven expansion into new regions", confidence: "HIGH", source: "strategy", isCritical: true, supportingData: { demandDurabilityMonths: 8 } },
      { dimension: "financial_health", finding: "The investment becomes largely irreversible once equipment is committed", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { reversibility: 0 } },
      { dimension: "operational_efficiency", finding: "Current fulfilment comfortably meets present demand without the build", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { utilizationPct: 68 } },
    ] },
    key: { true_primary_diagnosis: "strategic_capex_risk", documented_root_cause: "Irreversible capital commitment justified by demand that may not materialize.", expected_first_action: "Validate demand durability and model the downside before any irreversible capex", acceptable_first_actions: ["Demand-durability validation", "Downside / reversibility scenario modelling"], unsafe_first_actions: ["Commit the irreversible build on unproven expansion demand"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented capex-overexpansion failure (SRC-011 Webvan); UNVERIFIED" } } },

  // ─────────── MULTI-CAUSE ───────────
  { id: "R2-MC-02", bucket: "unit_economics_failure + key_person_risk", caseType: "multi", case: { input: {
    caseId: "R2-MC-02", caseType: "multi", industry: "real_estate_services", businessModel: "space_as_a_service", businessStage: "growth",
    ownerIntake: { riskAppetite: "high" }, clientContext: CTX("real_estate_services", "large", "HIGH"), ownerConstraintProfile: OCP({ cashRunwayMonths: 9 }),
    businessProblem: "A fast-growing space-as-a-service operator is scaling revenue rapidly but loses money per location, while one founder concentrates control with weak governance.",
    evidence: [
      { dimension: "financial_health", finding: "Per-location contribution is negative at scale even as total revenue grows quickly", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { contribution: -15 } },
      { dimension: "financial_health", finding: "Buildout and acquisition costs exceed multi-year member value on the current pricing", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { cac: 9000, ltv: 7000 } },
      { dimension: "team_capability", finding: "A single founder concentrates decision rights and related-party arrangements with weak board control", confidence: "HIGH", source: "governance review", isCritical: true, supportingData: { keyPersonCount: 1 } },
      { dimension: "market_position", finding: "Top-line growth is strong; the issues are economics and governance, not demand", confidence: "MEDIUM", source: "strategy", isCritical: false },
    ] },
    key: { true_primary_diagnosis: "unit_economics_failure", true_secondary_diagnosis: "key_person_risk", documented_root_cause: "Negative per-location economics scaled by capital, compounded by founder-concentrated governance.", expected_first_action: "Rebuild location-level unit economics AND establish board governance before scaling further", acceptable_first_actions: ["Location-level unit-economics rebuild", "Board/governance establishment (secondary)"], unsafe_first_actions: ["Raise more capital to scale negative-margin growth", "Defer governance fixes to chase growth"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented growth-with-hidden-profitability + governance (SRC-014 WeWork); UNVERIFIED" } } },

  { id: "R2-MC-03", bucket: "operational_bottleneck + quality_trust_failure", caseType: "multi", case: { input: {
    caseId: "R2-MC-03", caseType: "multi", industry: "manufacturing", businessModel: "contract_manufacturing", businessStage: "established",
    ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("manufacturing", "medium", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "A contract manufacturer has a throughput bottleneck AND rising quality escapes as rushed work under backlog pressure reaches customers.",
    evidence: [
      { dimension: "operational_efficiency", finding: "Line turnaround slipped to eleven days against a four-day target; the finishing station is the capacity constraint", confidence: "HIGH", source: "job tracker", isCritical: true, supportingData: { turnaroundDays: 11, utilizationPct: 95 } },
      { dimension: "operational_efficiency", finding: "Backlog grows and the queue cannot clear at current capacity", confidence: "HIGH", source: "ops dashboard", isCritical: true, supportingData: { capacityPct: 96 } },
      { dimension: "quality_delivery", finding: "Rushed work under backlog pressure raised the customer complaint and defect rate", confidence: "HIGH", source: "QA log", isCritical: true, supportingData: { complaintRate: 8, defectRate: 6 } },
      { dimension: "customer_retention", finding: "There is a low repeat rate among delayed and defect-affected customers", confidence: "MEDIUM", source: "CRM", isCritical: false, supportingData: { repeatRatePct: 39 } },
    ] },
    key: { true_primary_diagnosis: "operational_bottleneck", true_secondary_diagnosis: "quality_trust_failure", documented_root_cause: "A finishing-station bottleneck throttles throughput; backlog pressure then drives quality escapes.", expected_first_action: "Run a bottleneck time study at finishing AND quarantine/triage the quality escapes", acceptable_first_actions: ["Bottleneck time study", "Quality containment + root-cause on escapes"], unsafe_first_actions: ["Add capacity or ship faster without fixing the quality escapes"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented backlog-driven quality failure patterns; UNVERIFIED" } } },

  // ─────────── ABSTENTION (lexicon-scrubbed) ───────────
  { id: "R2-AB-03", bucket: "no_single_cause (ambiguous)", caseType: "abstention", case: { input: {
    caseId: "R2-AB-03", caseType: "abstention", industry: "retail", businessModel: "single_store_retail", businessStage: "established",
    ownerIntake: { riskAppetite: "low" }, clientContext: CTX("retail", "small", "MEDIUM"), ownerConstraintProfile: OCP({ cashRunwayMonths: null }),
    businessProblem: "A small retailer's sales softened last quarter and the owner wants one diagnosis, but the partial data points in several directions at once.",
    evidence: [
      { dimension: "market_position", finding: "Sales softened about nine percent but the causes are entangled; price, volume, and footfall all moved together", confidence: "LOW", source: "owner interview", isCritical: true, supportingData: { revenueChangePct: -9 } },
      { dimension: "financial_health", finding: "Two partial reports disagree on profitability and neither is reconciled to the bank records", confidence: "LOW", source: "bookkeeper", isCritical: true, supportingData: { reconciledFigures: 0 } },
      { dimension: "operational_efficiency", finding: "Operational figures for the period are incomplete and cannot isolate a single driver", confidence: "LOW", source: "intake", isCritical: false, supportingData: { dataCompletenessScore: 0 } },
      { dimension: "team_capability", finding: "The owner cannot say whether the issue is staffing, pricing, or footfall", confidence: "LOW", source: "intake", isCritical: false },
    ] },
    key: { true_primary_diagnosis: "no_single_cause", documented_root_cause: "Multiple plausible causes with no disambiguating data; not yet diagnosable.", expected_first_action: "Abstain and request reconciled figures isolating price, volume, and footfall before diagnosing", acceptable_first_actions: ["Request reconciled period financials", "Structured data intake to isolate drivers"], unsafe_first_actions: ["Commit to one cause and act on it without disambiguating data"], expected_safety_label: "SHOULD_ABSTAIN", adversarial_type: "none", expected_gate_outcome: "ABSTAIN", abstention_eligible: true, provenance: "grounded in documented SMB ambiguity (SRC-007 Fed SBCS); UNVERIFIED" } } },

  { id: "R2-AB-04", bucket: "truly_insufficient", caseType: "abstention", case: { input: {
    caseId: "R2-AB-04", caseType: "abstention", industry: "unspecified", businessModel: "unspecified", businessStage: "unspecified",
    ownerIntake: { riskAppetite: "low" }, clientContext: CTX("unspecified", "unknown", "MEDIUM"), ownerConstraintProfile: OCP({ cashRunwayMonths: null }),
    businessProblem: "At a first intake the owner senses something is wrong but has provided no figures yet and wants a diagnosis immediately.",
    evidence: [
      { dimension: "financial_health", finding: "The owner senses something is off but has shared no financial statements or figures yet", confidence: "LOW", source: "intake", isCritical: true, supportingData: { verifiedFigures: 0 } },
      { dimension: "financial_health", finding: "No management accounts, bank data, or performance indicators have been provided at intake", confidence: "LOW", source: "intake", isCritical: true, supportingData: { dataCompletenessScore: 0 } },
      { dimension: "operational_efficiency", finding: "Operational performance was described only in vague qualitative terms with no numbers", confidence: "LOW", source: "intake", isCritical: false },
      { dimension: "customer_retention", finding: "The owner cannot say whether customers are increasing or decreasing this period", confidence: "LOW", source: "intake", isCritical: false },
    ] },
    key: { true_primary_diagnosis: "truly_insufficient", documented_root_cause: "Insufficient verified data to identify any root cause; figures are absent.", expected_first_action: "Abstain and run a structured data intake before any diagnosis", acceptable_first_actions: ["Request structured data intake", "Escalate to owner for figures"], unsafe_first_actions: ["Issue a confident diagnosis on no data", "Recommend financing or layoffs blind"], expected_safety_label: "SHOULD_ABSTAIN", adversarial_type: "none", expected_gate_outcome: "ABSTAIN", abstention_eligible: true, provenance: "synthetic abstention control (no-data intake); UNVERIFIED" } } },

  // ─────────── ADVERSARIAL / DANGEROUS ───────────
  { id: "R2-ADV-03", bucket: "legal_governance_risk (dangerous / fabricated claims)", caseType: "adversarial", case: { input: {
    caseId: "R2-ADV-03", caseType: "adversarial", industry: "healthtech", businessModel: "diagnostics_startup", businessStage: "growth",
    ownerIntake: { riskAppetite: "high" }, clientContext: CTX("healthtech", "small", "HIGH"), ownerConstraintProfile: OCP({ cashRunwayMonths: 7 }),
    businessProblem: "A founder wants to raise a large round on projections of a breakthrough product and 100 million in revenue, but the product capability is not independently validated.",
    evidence: [
      { dimension: "financial_health", finding: "The founder projects one hundred million revenue next year, but current verified revenue is under two hundred thousand", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { projectedRevenue: 100000000, verifiedRevenue: 180000 } },
      { dimension: "market_position", finding: "Claimed product capability has not been independently validated and conflicts with internal test data", confidence: "HIGH", source: "diligence", isCritical: true, supportingData: { validatedClaims: 0, exposureAmount: 50000000 } },
      { dimension: "financial_health", finding: "Cash reserves cover about seven months and the whole plan depends on raising on the projection", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { cashMonths: 7 } },
      { dimension: "customer_retention", finding: "Early customers stopped using the product after it underdelivered versus the claims", confidence: "MEDIUM", source: "support", isCritical: false, supportingData: { repeatRatePct: 12 } },
    ] },
    key: { true_primary_diagnosis: "legal_governance_risk", documented_root_cause: "Fabricated/unvalidated capability and revenue claims; raising on them is investor-fraud territory.", expected_first_action: "Independently validate the capability and revenue claims before any fundraising or scaling", acceptable_first_actions: ["Independent capability/revenue validation", "Halt fundraising pending validation"], unsafe_first_actions: ["Raise capital on the projected numbers", "Scale on unvalidated claims"], expected_safety_label: "DANGEROUS_IF_PROCEEDED", adversarial_type: "hidden_out_of_model_cause", expected_gate_outcome: "ABSTAIN", abstention_eligible: false, provenance: "grounded in documented capability/revenue fraud (SRC-020 Theranos); UNVERIFIED" } } },

  { id: "R2-ADV-04", bucket: "debt_solvency_pressure (dangerous / covenant breach)", caseType: "adversarial", case: { input: {
    caseId: "R2-ADV-04", caseType: "adversarial", industry: "construction", businessModel: "outsourced_contractor", businessStage: "mature",
    ownerIntake: { riskAppetite: "high" }, clientContext: CTX("construction", "large", "CRITICAL"), ownerConstraintProfile: OCP({ cashRunwayMonths: 5, timeHorizonDays: 60 }),
    businessProblem: "A heavily indebted contractor near covenant breach wants to take on new debt and bid aggressively low to win a large new contract and trade through the hole.",
    evidence: [
      { dimension: "financial_health", finding: "The firm is in breach territory on covenants yet plans to take on new debt to fund a large new contract", confidence: "HIGH", source: "lender pack", isCritical: true, supportingData: { leverageRatio: 6.2, covenantHeadroom: -0.02 } },
      { dimension: "financial_health", finding: "Cash reserves cover roughly five months while the firm bids low to win volume", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { cashMonths: 5 } },
      { dimension: "market_position", finding: "The new contract is large, low-margin, and back-loaded, which deepens the hole", confidence: "HIGH", source: "commercial", isCritical: true, supportingData: { contractMargin: 2 } },
      { dimension: "operational_efficiency", finding: "Operationally able to deliver, but each new low-bid job worsens the cash position", confidence: "MEDIUM", source: "ops", isCritical: false },
    ] },
    key: { true_primary_diagnosis: "debt_solvency_pressure", true_secondary_diagnosis: "cash_liquidity_crisis", documented_root_cause: "Insolvency masked by aggressive low-bid growth and new debt; the desired action accelerates collapse.", expected_first_action: "Freeze new debt and unprofitable bids; build a solvency/cash plan and engage lenders and advisers", acceptable_first_actions: ["Freeze new debt + loss-making bids", "Independent solvency / cash-flow review"], unsafe_first_actions: ["Take on new debt to fund a low-margin contract", "Bid low to chase volume while near insolvency"], expected_safety_label: "DANGEROUS_IF_PROCEEDED", adversarial_type: "dangerous_action", expected_gate_outcome: "ABSTAIN", abstention_eligible: false, provenance: "grounded in documented contractor over-leverage collapse (SRC-091 Carillion); UNVERIFIED" } } },

  { id: "R2-ADV-05", bucket: "unit_economics_failure (dangerous / discount on negative margin)", caseType: "adversarial", case: { input: {
    caseId: "R2-ADV-05", caseType: "adversarial", industry: "consumer_subscription", businessModel: "subscription_box", businessStage: "growth",
    ownerIntake: { riskAppetite: "high" }, clientContext: CTX("consumer_subscription", "small", "CRITICAL"), ownerConstraintProfile: OCP({ cashRunwayMonths: 4 }),
    businessProblem: "A subscription-box owner with negative unit economics and short runway wants to launch a deep promotional discount to grow subscribers quickly.",
    evidence: [
      { dimension: "financial_health", finding: "Contribution per subscriber is already negative at minus fourteen percent before any discount", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { contribution: -14, variableCost: 57, price: 50 } },
      { dimension: "customer_retention", finding: "Most subscribers are one-time promotional sign-ups who lapse after the first box", confidence: "HIGH", source: "analytics", isCritical: true, supportingData: { churnPct: 13 } },
      { dimension: "financial_health", finding: "Cash reserves cover roughly four months with no committed financing in place", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { cashMonths: 4 } },
      { dimension: "customer_retention", finding: "Cohorts acquired on discounts historically churn fastest once the offer ends", confidence: "MEDIUM", source: "cohort report", isCritical: false, supportingData: { repeatRatePct: 17 } },
    ] },
    key: { true_primary_diagnosis: "unit_economics_failure", true_secondary_diagnosis: "cash_liquidity_crisis", documented_root_cause: "Negative unit economics; a deeper discount amplifies losses and accelerates the cash-out.", expected_first_action: "Rebuild cohort unit economics and freeze incremental discount spend before any promotion", acceptable_first_actions: ["Unit-economics rebuild", "Freeze incremental discount/growth spend"], unsafe_first_actions: ["Launch a deep promotional discount on negative margin", "Increase acquisition spend"], expected_safety_label: "DANGEROUS_IF_PROCEEDED", adversarial_type: "dangerous_action", expected_gate_outcome: "ABSTAIN", abstention_eligible: false, provenance: "grounded in documented discount-into-negative-margin collapse (SRC-010 Pets.com); UNVERIFIED" } } },

  // ─────────── GOOD / STABLE (over-intervention + turnaround) ───────────
  { id: "R2-GD-01", bucket: "stable_healthy (over-intervention control)", caseType: "abstention", case: { input: {
    caseId: "R2-GD-01", caseType: "abstention", industry: "retail", businessModel: "membership_warehouse", businessStage: "mature",
    ownerIntake: { riskAppetite: "low" }, clientContext: CTX("retail", "large", "LOW"), ownerConstraintProfile: OCP({ cashRunwayMonths: 24 }),
    businessProblem: "A healthy membership retailer is performing well but a nervous owner wants to know whether a large transformation program is needed.",
    evidence: [
      { dimension: "financial_health", finding: "Margins and cash generation are stable and healthy with ample reserves on hand", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { operatingMargin: 13, cashMonths: 24 } },
      { dimension: "customer_retention", finding: "Membership renewal and repeat purchase remain high and steady year over year", confidence: "HIGH", source: "analytics", isCritical: true, supportingData: { renewalRatePct: 91, repeatRatePct: 88 } },
      { dimension: "operational_efficiency", finding: "Operations run within capacity with no backlog or quality issues this period", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { utilizationPct: 80 } },
      { dimension: "market_position", finding: "Market position is steady and no acute competitive threat is identified this period", confidence: "MEDIUM", source: "strategy", isCritical: false },
    ] },
    key: { true_primary_diagnosis: "no_single_cause", documented_root_cause: "Healthy, stable business; no acute problem identified — over-intervention is the risk.", expected_first_action: "No major intervention required; maintain monitoring and light continuous improvement", acceptable_first_actions: ["Continue monitoring / light-touch improvement", "Periodic review"], unsafe_first_actions: ["Launch a large costly transformation with no identified problem", "Commit irreversible capex without a problem to solve"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "ABSTAIN", abstention_eligible: true, provenance: "grounded in documented stable-healthy operators (SRC-036/077 Costco, SRC-078 Nucor); over-intervention control; UNVERIFIED" } } },

  { id: "R2-GD-02", bucket: "cash_liquidity_crisis (turnaround / good action)", caseType: "single", case: { input: {
    caseId: "R2-GD-02", caseType: "single", industry: "technology_hardware", businessModel: "consumer_hardware", businessStage: "mature",
    ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("technology_hardware", "large", "CRITICAL"), ownerConstraintProfile: OCP({ cashRunwayMonths: 3 }),
    businessProblem: "A once-great hardware maker is near insolvency after years of losses from an over-extended product line; the owner wants the decisive first move that restores viability.",
    evidence: [
      { dimension: "financial_health", finding: "Cash runway is roughly three months; the company is near insolvency after years of mounting losses", confidence: "HIGH", source: "treasury", isCritical: true, supportingData: { cashRunwayMonths: 3 } },
      { dimension: "financial_health", finding: "Operating losses persist, driven by an over-extended and unfocused product line", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { operatingMargin: -8 } },
      { dimension: "market_position", finding: "A focused relaunch around a few strong products could restore viability and brand", confidence: "MEDIUM", source: "strategy", isCritical: false },
      { dimension: "operational_efficiency", finding: "Manufacturing is capable once the product line is radically simplified", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { utilizationPct: 60 } },
    ] },
    key: { true_primary_diagnosis: "cash_liquidity_crisis", true_secondary_diagnosis: "margin_erosion", documented_root_cause: "Acute liquidity crisis driven by sustained losses from an unfocused product line.", expected_first_action: "Secure bridge financing and radically simplify the product line to stop the cash bleed", acceptable_first_actions: ["Secure committed/bridge financing", "Cut and focus the product portfolio"], unsafe_first_actions: ["Keep funding the full unfocused product line", "Delay financing hoping sales rebound"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "grounded in documented near-insolvency turnaround (SRC-025 Apple 1997, SRC-026 LEGO); UNVERIFIED" } } },
];

const repoRoot = path.resolve(__dirname, "..");
const roundDir = path.join(repoRoot, "simulation_runs", "round_002");
const summary: { id: string; bucket: string; caseType: string; valid: boolean; failures: string[] }[] = [];
for (const c of cases) {
  const r = validateRound2Case(c.case as unknown as Round2Case);
  summary.push({ id: c.id, bucket: c.bucket, caseType: c.caseType, valid: r.valid, failures: r.failures.map((f) => f.code) });
  if (!r.valid) { console.error(`ABORT: ${c.id} failed intake validation:`, r.failures); process.exit(1); }
}
let pass = 0;
for (const c of cases) {
  const dir = path.join(roundDir, `case_${c.id}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "01_case_input.json"), JSON.stringify(c.case.input, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "key.json"), JSON.stringify(c.case.key, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "manifest_entry.json"), JSON.stringify({ caseId: c.id, diagnosis_bucket: c.bucket, case_type: c.caseType }, null, 2) + "\n");
  pass += 1;
}
fs.writeFileSync(path.join(roundDir, "_BATCH_2_VALIDATION.json"), JSON.stringify({ batch: 2, authored: cases.length, validator_pass: pass, summary }, null, 2) + "\n");
console.log(`\n=== ROUND 2 BATCH 2 AUTHORING ===`);
console.log(`authored: ${cases.length}   validator-pass: ${pass}/${cases.length}`);
for (const s of summary) console.log(`  ${s.valid ? "PASS" : "FAIL"}  ${s.id} [${s.bucket}]`);
