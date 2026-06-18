/**
 * Round 2 authoring — BATCH 4 (25 high-power reasoning-trap cases).
 * Optimized to maximize the probability of exposing consultant-grade reasoning
 * failures: every false-root-cause case is built so the simple lexical engine fires
 * a COVERED-archetype decoy that is NOT the true root cause (new surface->true pairs
 * vs batch 3). Prioritization/KPI cases test action sequencing where the diagnosis is
 * right but the obvious action is wrong. Healthy controls must NOT fabricate.
 *
 * Hidden keys carry special_tags for the four mandatory requirement classes:
 *   action_should_be_delayed | diagnosis_correct_action_wrong |
 *   positive_metrics_hide_deterioration | survives_only_via_prioritization
 * plus FRC obvious_but_wrong_diagnosis and RC failed/successful/sequence/why fields.
 * Provenance/keys hidden; engine-visible inputs carry no answer-key fields.
 *
 * Usage: npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/author-round2-batch4.ts
 */
import * as fs from "fs";
import * as path from "path";
import { validateRound2Case, type Round2Case } from "@/services/benchmark/round2-intake-validator";

type Urgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
const OCP = (o: Partial<Round2Case["input"]["ownerConstraintProfile"]> = {}) => ({
  budgetBand: "MEDIUM", timeHorizonDays: 90, staffCapacity: "MEDIUM",
  cashRunwayMonths: 12 as number | null, legalComplianceSensitive: false, ...o,
});
const CTX = (industry: string, size: string, u: Urgency) => ({ industry, size, revenueImpactUrgency: u });
type C = { id: string; bucket: string; caseType: "single" | "multi" | "abstention" | "adversarial"; case: { input: Record<string, unknown>; key: Record<string, unknown> } };
const mk = (id: string, bucket: string, caseType: C["caseType"], input: Record<string, unknown>, key: Record<string, unknown>): C => ({ id, bucket, caseType, case: { input: { caseId: id, caseType, ...input }, key } });

const cases: C[] = [
  // ───────────── FALSE ROOT CAUSE (8): engine fires covered decoy != true cause ─────────────
  mk("R2-FRC-06", "false_root_cause: surface churn, true pricing", "single", {
    industry: "consumer_subscription", businessModel: "subscription", businessStage: "growth", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("consumer_subscription", "small", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "Churn jumped and the owner wants to rebuild loyalty, but customers are leaving for a reason loyalty programs won't fix.",
    evidence: [
      { dimension: "customer_retention", finding: "Monthly churn rose to nine percent and the owner blames a weak loyalty program", confidence: "HIGH", source: "analytics", isCritical: true, supportingData: { churnPct: 9 } },
      { dimension: "customer_retention", finding: "Repeat rate fell sharply over the last two quarters across cohorts", confidence: "HIGH", source: "cohort report", isCritical: true, supportingData: { repeatRatePct: 35 } },
      { dimension: "market_position", finding: "Exit surveys show customers leaving for a competitor priced well below, while realized price sits above market with no value edge", confidence: "HIGH", source: "win/loss", isCritical: true, supportingData: { realizedPrice: 120, listPrice: 100 } },
      { dimension: "financial_health", finding: "Margins remain healthy on the customers who stay", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 30 } },
    ] },
    { true_primary_diagnosis: "pricing_power", obvious_but_wrong_diagnosis: "customer_retention_erosion", documented_root_cause: "Churn is driven by an uncompetitive price/value position, not loyalty mechanics.", expected_first_action: "Run a price/value and competitive-position analysis; the churn is a pricing problem, not loyalty", acceptable_first_actions: ["Price/value competitive analysis", "Value-repositioning review"], unsafe_first_actions: ["Launch a loyalty/discount program before fixing the price/value gap"], expected_prioritization_rationale: "A loyalty program cannot retain customers who leave on price/value; fix positioning first.", special_tags: ["action_should_be_delayed"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "misaligned_root_cause", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "false-root-cause; UNVERIFIED" }),

  mk("R2-FRC-07", "false_root_cause: surface margin, true demand", "single", {
    industry: "manufacturing", businessModel: "make_to_order", businessStage: "established", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("manufacturing", "small", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "Operating margin went negative and the owner is hunting for cost cuts, but costs are not what changed.",
    evidence: [
      { dimension: "financial_health", finding: "Operating margin fell into the red this year and the owner assumes a cost problem", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { marginPct: -7, operatingMargin: -3 } },
      { dimension: "market_position", finding: "The real driver is a forty-five percent collapse in new-customer volume spreading fixed costs over far fewer units", confidence: "HIGH", source: "sales", isCritical: true, supportingData: { newCustomerRate: 5, leadVolume: 60 } },
      { dimension: "operational_efficiency", finding: "Unit costs are unchanged; the margin hit is volume deleverage, not input cost", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { throughput: 400 } },
      { dimension: "customer_retention", finding: "Existing customers remain loyal and are not the issue", confidence: "MEDIUM", source: "CRM", isCritical: false },
    ] },
    { true_primary_diagnosis: "demand_generation_failure", obvious_but_wrong_diagnosis: "margin_erosion", documented_root_cause: "Margin collapse is fixed-cost deleverage from a demand collapse, not rising cost.", expected_first_action: "Diagnose the new-customer demand collapse; the margin loss is volume deleverage, not cost", acceptable_first_actions: ["Demand / funnel diagnostic", "Volume-recovery plan"], unsafe_first_actions: ["Cut costs to defend a margin that fell because volume fell"], expected_prioritization_rationale: "Cost-cutting will not fix a margin caused by lost volume; restore demand.", special_tags: ["action_should_be_delayed"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "misaligned_root_cause", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "false-root-cause; UNVERIFIED" }),

  mk("R2-FRC-08", "false_root_cause: surface bottleneck, true inventory", "single", {
    industry: "manufacturing", businessModel: "assembler", businessStage: "established", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("manufacturing", "small", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "Turnaround is slow and staff blame an assembly bottleneck, but the line keeps stopping for a different reason.",
    evidence: [
      { dimension: "operational_efficiency", finding: "Turnaround slipped to twelve days and staff blame a capacity bottleneck at assembly", confidence: "HIGH", source: "job tracker", isCritical: true, supportingData: { turnaroundDays: 12, utilizationPct: 90 } },
      { dimension: "operational_efficiency", finding: "The line actually stalls waiting for missing components: input stockouts and forecast error drive the delay", confidence: "HIGH", source: "inventory system", isCritical: true, supportingData: { stockoutRate: 14, forecastErrorPct: 35, inventoryDays: 70 } },
      { dimension: "customer_retention", finding: "There is a low repeat rate among the most-delayed customers", confidence: "MEDIUM", source: "CRM", isCritical: false, supportingData: { repeatRatePct: 42 } },
      { dimension: "market_position", finding: "Demand is stable; the problem is the line stopping for materials", confidence: "MEDIUM", source: "sales", isCritical: false },
    ] },
    { true_primary_diagnosis: "inventory_forecasting_mismatch", obvious_but_wrong_diagnosis: "operational_bottleneck", documented_root_cause: "The 'bottleneck' is input stockouts from forecast error; adding capacity would not help.", expected_first_action: "Fix component forecasting and availability; the line stalls for materials, not capacity", acceptable_first_actions: ["Input forecast-accuracy / availability fix", "Materials planning review"], unsafe_first_actions: ["Buy more assembly capacity to fix a materials-availability problem"], expected_prioritization_rationale: "More capacity cannot fix a line that stops for missing inputs; fix inventory/forecasting.", special_tags: ["action_should_be_delayed"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "misaligned_root_cause", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "false-root-cause; UNVERIFIED" }),

  mk("R2-FRC-09", "false_root_cause: surface unit-econ, true gtm channel", "single", {
    industry: "ecommerce", businessModel: "dtc", businessStage: "growth", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("ecommerce", "small", "HIGH"), ownerConstraintProfile: OCP({ cashRunwayMonths: 10 }),
    businessProblem: "Per-customer economics look broken and the team wants to cut product cost, but the loss is concentrated in one place.",
    evidence: [
      { dimension: "financial_health", finding: "Blended per-customer contribution is negative and the team assumes a unit-economics or cost problem", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { contribution: -8 } },
      { dimension: "market_position", finding: "It is channel-driven: paid-social acquisition cost is triple the blended target and that channel is seventy percent of spend", confidence: "HIGH", source: "analytics", isCritical: true, supportingData: { channelCac: 260, channelMix: 70, channelConversionPct: 0.8 } },
      { dimension: "financial_health", finding: "Organic-acquired customers are clearly profitable; one channel drags the blended economics", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { costPerOrder: 25 } },
      { dimension: "customer_retention", finding: "Retention is healthy on the organic cohorts", confidence: "MEDIUM", source: "analytics", isCritical: false, supportingData: { repeatRatePct: 60 } },
    ] },
    { true_primary_diagnosis: "gtm_channel_mismatch", obvious_but_wrong_diagnosis: "unit_economics_failure", documented_root_cause: "Negative blended contribution comes from one over-weighted, inefficient channel, not product cost.", expected_first_action: "Run channel-level unit economics and reallocate away from the inefficient channel before any product-cost action", acceptable_first_actions: ["Channel-level unit-economics analysis", "Channel reallocation"], unsafe_first_actions: ["Cut product cost or scope to fix what is a channel-mix problem"], expected_prioritization_rationale: "The loss is one channel, not the product; fix channel allocation first.", special_tags: ["action_should_be_delayed"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "misaligned_root_cause", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "false-root-cause (fills thin gtm); UNVERIFIED" }),

  mk("R2-FRC-10", "false_root_cause: surface cash, true working capital", "single", {
    industry: "wholesale", businessModel: "distributor", businessStage: "established", ownerIntake: { riskAppetite: "low" }, clientContext: CTX("wholesale", "medium", "CRITICAL"), ownerConstraintProfile: OCP({ cashRunwayMonths: 2 }),
    businessProblem: "The owner sees a two-month cash position and fears insolvency, but the cash is not gone — it is somewhere else.",
    evidence: [
      { dimension: "financial_health", finding: "Cash on hand looks like only two months of runway and the owner fears insolvency", confidence: "HIGH", source: "treasury", isCritical: true, supportingData: { cashRunwayMonths: 2 } },
      { dimension: "financial_health", finding: "But it is receivables: days sales outstanding ballooned to ninety-five and the cash cycle to one hundred ten days", confidence: "HIGH", source: "AR ledger", isCritical: true, supportingData: { dso: 95, cashConversionDays: 110 } },
      { dimension: "operational_efficiency", finding: "Operations and demand are healthy; the gap is purely collections timing", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { receivablesAging: 70 } },
      { dimension: "market_position", finding: "The order book is strong and growing steadily across the customer base", confidence: "MEDIUM", source: "sales", isCritical: false },
    ] },
    { true_primary_diagnosis: "working_capital_stress", obvious_but_wrong_diagnosis: "cash_liquidity_crisis", documented_root_cause: "Cash is trapped in receivables; collecting it resolves the apparent liquidity crisis.", expected_first_action: "Accelerate collections and map the cash-conversion cycle before any emergency financing or cuts", acceptable_first_actions: ["Collections acceleration / receivables plan", "Cash-conversion-cycle mapping"], unsafe_first_actions: ["Raise expensive emergency financing for cash that is sitting in receivables", "Cut viable operations"], expected_prioritization_rationale: "Treating a working-capital timing gap as insolvency triggers needless, costly action.", special_tags: ["action_should_be_delayed"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "misaligned_root_cause", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "false-root-cause; UNVERIFIED" }),

  mk("R2-FRC-11", "false_root_cause: surface quality, true bottleneck", "single", {
    industry: "consumer_services", businessModel: "service_operator", businessStage: "growth", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("consumer_services", "small", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "Complaints spiked and the team reads it as a product-quality failure, but customers are complaining about something else.",
    evidence: [
      { dimension: "quality_delivery", finding: "Customer complaints spiked and the team reads it as a product-quality failure", confidence: "HIGH", source: "support log", isCritical: true, supportingData: { complaintRate: 11 } },
      { dimension: "quality_delivery", finding: "Returns and negative reviews rose alongside the complaints", confidence: "HIGH", source: "reviews", isCritical: true, supportingData: { returnRate: 7 } },
      { dimension: "operational_efficiency", finding: "But the complaints are about long waits: a single-station bottleneck pushed turnaround to thirteen days", confidence: "HIGH", source: "job tracker", isCritical: true, supportingData: { turnaroundDays: 13, utilizationPct: 96 } },
      { dimension: "market_position", finding: "The product itself tests fine; the issue is delivery speed, not the product", confidence: "MEDIUM", source: "QA", isCritical: false },
    ] },
    { true_primary_diagnosis: "operational_bottleneck", obvious_but_wrong_diagnosis: "quality_trust_failure", documented_root_cause: "Complaints are about delivery delay from a bottleneck, not product quality.", expected_first_action: "Run a bottleneck/time study; the complaints are about wait time, not the product", acceptable_first_actions: ["Bottleneck time study", "Throughput/queue relief"], unsafe_first_actions: ["Overhaul the product to fix complaints that are about delivery speed"], expected_prioritization_rationale: "A product overhaul will not fix complaints caused by delivery delays; relieve the bottleneck.", special_tags: ["action_should_be_delayed"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "misaligned_root_cause", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "false-root-cause; UNVERIFIED" }),

  mk("R2-FRC-12", "false_root_cause: surface churn, true key-person", "single", {
    industry: "professional_services", businessModel: "agency", businessStage: "growth", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("professional_services", "small", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "Churn jumped and the owner wants a loyalty fix, but the customers left with a person, not because of a program.",
    evidence: [
      { dimension: "customer_retention", finding: "Churn jumped to ten percent right after a senior departure and the owner blames retention mechanics", confidence: "HIGH", source: "CRM", isCritical: true, supportingData: { churnPct: 10 } },
      { dimension: "customer_retention", finding: "Repeat bookings fell sharply in the same period", confidence: "HIGH", source: "cohort report", isCritical: true, supportingData: { repeatRatePct: 32 } },
      { dimension: "team_capability", finding: "The firm's only senior rainmaker left and took their client relationships; revenue was highly concentrated on that person", confidence: "HIGH", source: "ops review", isCritical: true, supportingData: { keyPersonCount: 1, revenueConcentrationPct: 58 } },
      { dimension: "financial_health", finding: "Margins are healthy on the remaining accounts", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 40 } },
    ] },
    { true_primary_diagnosis: "key_person_risk", obvious_but_wrong_diagnosis: "customer_retention_erosion", documented_root_cause: "Churn followed a key-person departure that owned the client relationships; it is a key-person problem.", expected_first_action: "Address the key-person dependency and the lost relationships directly; a loyalty program will not bring those clients back", acceptable_first_actions: ["Key-person/relationship recovery plan", "Reduce revenue concentration"], unsafe_first_actions: ["Launch a generic loyalty program to fix relationship-driven churn"], expected_prioritization_rationale: "The churn is relationship/key-person driven; retention mechanics miss the cause.", special_tags: ["action_should_be_delayed"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "misaligned_root_cause", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "false-root-cause; UNVERIFIED" }),

  mk("R2-FRC-13", "false_root_cause: surface margin, true pricing/discounting", "single", {
    industry: "retail", businessModel: "specialty_retail", businessStage: "established", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("retail", "small", "MEDIUM"), ownerConstraintProfile: OCP(),
    businessProblem: "Gross margin fell sharply and the owner blames suppliers, but the erosion is self-inflicted.",
    evidence: [
      { dimension: "financial_health", finding: "Gross margin fell sharply this year and the owner blames supplier cost increases", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { marginPct: -9 } },
      { dimension: "market_position", finding: "It is self-inflicted discounting: the average discount reached twenty-eight percent with no approval governance", confidence: "HIGH", source: "pricing", isCritical: true, supportingData: { discountPct: 28, realizedPrice: 72 } },
      { dimension: "financial_health", finding: "Input costs are flat year over year; the erosion is in price realization, not cost", confidence: "MEDIUM", source: "purchasing", isCritical: false, supportingData: { cogsPct: 1 } },
      { dimension: "process_maturity", finding: "No discount-approval controls exist and staff discount freely", confidence: "MEDIUM", source: "owner interview", isCritical: false },
    ] },
    { true_primary_diagnosis: "pricing_power", obvious_but_wrong_diagnosis: "margin_erosion", documented_root_cause: "Margin erosion is uncontrolled discounting (price realization), not supplier cost.", expected_first_action: "Run a discount-leakage and price-realization analysis; the margin loss is discounting, not cost", acceptable_first_actions: ["Discount-leakage / price-realization analysis", "Discount governance"], unsafe_first_actions: ["Pressure suppliers or cut quality to recover a margin lost to discounting"], expected_prioritization_rationale: "Supplier pressure cannot recover margin lost to self-inflicted discounting; fix pricing governance.", special_tags: ["action_should_be_delayed"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "misaligned_root_cause", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "false-root-cause; UNVERIFIED" }),

  // ───────────── PRIORITIZATION CONFLICTS (6): survives only via correct first move ─────────────
  mk("R2-PC-06", "prioritization: cash survival before growth", "multi", {
    industry: "consumer_products", businessModel: "brand", businessStage: "growth", ownerIntake: { riskAppetite: "high" }, clientContext: CTX("consumer_products", "small", "CRITICAL"), ownerConstraintProfile: OCP({ cashRunwayMonths: 3 }),
    businessProblem: "Cash runway is three months and a major growth opportunity appeared; the owner wants to fund the growth now.",
    evidence: [
      { dimension: "financial_health", finding: "Cash runway is three months with fixed obligations due inside the window", confidence: "HIGH", source: "treasury", isCritical: true, supportingData: { cashRunwayMonths: 3, monthlyBurn: 50000 } },
      { dimension: "market_position", finding: "A major growth opportunity appeared and the owner wants to fund it immediately", confidence: "HIGH", source: "strategy", isCritical: true, supportingData: { newCustomerRate: 15 } },
      { dimension: "financial_health", finding: "Funding the growth now would consume the remaining runway", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { cashBalance: 150000 } },
      { dimension: "operational_efficiency", finding: "Operations are viable; this is purely a sequencing decision", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { operatingMargin: 6 } },
    ] },
    { true_primary_diagnosis: "cash_liquidity_crisis", true_secondary_diagnosis: "demand_generation_failure", documented_root_cause: "Correct diagnosis (liquidity) but the tempting action (fund growth) would cause insolvency first.", expected_first_action: "Secure liquidity and survive the window before committing any capital to the growth opportunity", acceptable_first_actions: ["Secure committed liquidity", "13-week cash stabilization"], unsafe_first_actions: ["Fund the growth opportunity at three-month runway"], expected_prioritization_rationale: "The business survives only if liquidity comes first; funding growth now is fatal.", special_tags: ["survives_only_via_prioritization", "diagnosis_correct_action_wrong"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "prioritization; UNVERIFIED" }),

  mk("R2-PC-07", "prioritization: debt reduction before inventory purchase", "multi", {
    industry: "wholesale", businessModel: "distributor", businessStage: "mature", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("wholesale", "medium", "HIGH"), ownerConstraintProfile: OCP({ cashRunwayMonths: 8 }),
    businessProblem: "A debt maturity with thin covenant headroom looms, and the owner wants to spend cash on a big seasonal inventory buy.",
    evidence: [
      { dimension: "financial_health", finding: "A debt maturity with thin covenant headroom looms ahead of the next test", confidence: "HIGH", source: "lender pack", isCritical: true, supportingData: { leverageRatio: 5.3, covenantHeadroom: 0.03 } },
      { dimension: "operational_efficiency", finding: "The owner wants to spend the available cash on a large seasonal inventory purchase", confidence: "HIGH", source: "owner interview", isCritical: true, supportingData: { inventoryDays: 30 } },
      { dimension: "financial_health", finding: "Interest coverage is near one point two times", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { interestCoverage: 1.2 } },
      { dimension: "market_position", finding: "Trading is stable; this is a capital-allocation sequencing decision", confidence: "MEDIUM", source: "management", isCritical: false },
    ] },
    { true_primary_diagnosis: "debt_solvency_pressure", true_secondary_diagnosis: "inventory_forecasting_mismatch", documented_root_cause: "Looming maturity/covenant risk vs a discretionary inventory buy; solvency must come first.", expected_first_action: "Address the maturity and covenant risk before any large discretionary inventory purchase", acceptable_first_actions: ["Refinancing / covenant plan", "Preserve cash for the maturity"], unsafe_first_actions: ["Spend cash on a big inventory buy while a covenant breach looms"], expected_prioritization_rationale: "Tying up cash in inventory ahead of a covenant test can trigger default; fix solvency first.", special_tags: ["survives_only_via_prioritization"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "prioritization; UNVERIFIED" }),

  mk("R2-PC-08", "prioritization: process improvement before hiring", "multi", {
    industry: "consumer_services", businessModel: "service_operator", businessStage: "growth", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("consumer_services", "small", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "Turnaround is slow and the owner wants to hire five more staff, but the floor is not actually at capacity.",
    evidence: [
      { dimension: "operational_efficiency", finding: "Turnaround is slow at nine days and the owner wants to hire five more staff to fix it", confidence: "HIGH", source: "job tracker", isCritical: true, supportingData: { turnaroundDays: 9, utilizationPct: 80 } },
      { dimension: "operational_efficiency", finding: "But utilization is only eighty percent and the delay is a scheduling/process problem, not raw capacity", confidence: "HIGH", source: "ops dashboard", isCritical: true, supportingData: { capacityPct: 80 } },
      { dimension: "customer_retention", finding: "There is a low repeat rate among the most-delayed customers", confidence: "MEDIUM", source: "CRM", isCritical: false, supportingData: { repeatRatePct: 45 } },
      { dimension: "financial_health", finding: "Margins are fine; hiring would add cost without fixing the cause", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 14 } },
    ] },
    { true_primary_diagnosis: "operational_bottleneck", documented_root_cause: "Correct diagnosis (throughput) but the action (hire 5) is wrong: 80% utilization shows a process, not staffing, gap.", expected_first_action: "Run a scheduling/process diagnostic before adding headcount; utilization shows capacity, not a staffing shortfall", acceptable_first_actions: ["Process/scheduling diagnostic", "Workflow redesign"], unsafe_first_actions: ["Hire five staff before confirming the constraint is capacity, not process"], expected_prioritization_rationale: "Hiring into an 80%-utilized floor adds cost without fixing a process bottleneck.", special_tags: ["diagnosis_correct_action_wrong"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "prioritization; UNVERIFIED" }),

  mk("R2-PC-09", "prioritization: fix unit economics before scaling growth", "multi", {
    industry: "software_saas", businessModel: "subscription", businessStage: "growth", ownerIntake: { riskAppetite: "high" }, clientContext: CTX("software_saas", "small", "HIGH"), ownerConstraintProfile: OCP({ cashRunwayMonths: 9 }),
    businessProblem: "Per-unit economics are negative and the owner wants to scale acquisition to grow out of it.",
    evidence: [
      { dimension: "financial_health", finding: "Per-customer contribution is negative once support and onboarding are loaded", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { contribution: -6 } },
      { dimension: "market_position", finding: "The owner wants to scale acquisition spend hard to grow out of the loss", confidence: "HIGH", source: "owner interview", isCritical: true, supportingData: { newCustomerRate: 12 } },
      { dimension: "financial_health", finding: "Acquisition cost exceeds lifetime value on the core tier", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { cac: 200, ltv: 150 } },
      { dimension: "customer_retention", finding: "Retention is too thin to recover acquisition cost", confidence: "MEDIUM", source: "analytics", isCritical: false, supportingData: { repeatRatePct: 30 } },
    ] },
    { true_primary_diagnosis: "unit_economics_failure", documented_root_cause: "Correct diagnosis (unit economics) but scaling acquisition multiplies the per-unit loss.", expected_first_action: "Fix the unit economics before scaling acquisition; growth multiplies the per-unit loss", acceptable_first_actions: ["Unit-economics rebuild", "Fix CAC/LTV before scaling"], unsafe_first_actions: ["Scale acquisition spend to grow into profitability"], expected_prioritization_rationale: "Growing a negative-contribution model accelerates losses; fix economics first.", special_tags: ["survives_only_via_prioritization", "diagnosis_correct_action_wrong"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "prioritization; UNVERIFIED" }),

  mk("R2-PC-10", "prioritization: resolve quality before expansion", "multi", {
    industry: "restaurant", businessModel: "fast_casual", businessStage: "growth", ownerIntake: { riskAppetite: "high" }, clientContext: CTX("restaurant", "medium", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "An unresolved quality/safety issue persists and the owner wants to expand into a new region now.",
    evidence: [
      { dimension: "quality_delivery", finding: "A quality and safety issue is unresolved and complaint rates remain high across sites", confidence: "HIGH", source: "support log", isCritical: true, supportingData: { complaintRate: 12, defectRate: 6 } },
      { dimension: "market_position", finding: "The owner wants to expand into a new region immediately to grow", confidence: "HIGH", source: "strategy", isCritical: true, supportingData: { newCustomerRate: 10 } },
      { dimension: "quality_delivery", finding: "Returns and refunds rose with the unresolved quality issue", confidence: "HIGH", source: "ops log", isCritical: true, supportingData: { returnRate: 8 } },
      { dimension: "customer_retention", finding: "Loyal guests are pausing visits over the quality concern", confidence: "MEDIUM", source: "CRM", isCritical: false, supportingData: { repeatRatePct: 50 } },
    ] },
    { true_primary_diagnosis: "quality_trust_failure", true_secondary_diagnosis: "demand_generation_failure", documented_root_cause: "Correct diagnosis (quality) but expanding now would scale the defect and the reputational damage.", expected_first_action: "Resolve the quality/safety issue before any geographic expansion", acceptable_first_actions: ["Quality root-cause + fix", "Verified safe before expansion"], unsafe_first_actions: ["Expand into a new region while the quality issue is unresolved"], expected_prioritization_rationale: "Expanding a broken product scales the harm; fix quality first.", special_tags: ["survives_only_via_prioritization"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "prioritization; UNVERIFIED" }),

  mk("R2-PC-11", "prioritization: liquidity before efficiency capex", "multi", {
    industry: "manufacturing", businessModel: "manufacturer", businessStage: "mature", ownerIntake: { riskAppetite: "high" }, clientContext: CTX("manufacturing", "medium", "CRITICAL"), ownerConstraintProfile: OCP({ cashRunwayMonths: 4 }),
    businessProblem: "Cash runway is four months and the owner wants to commit a large efficiency capex now.",
    evidence: [
      { dimension: "financial_health", finding: "Cash runway is four months with limited committed financing", confidence: "HIGH", source: "treasury", isCritical: true, supportingData: { cashRunwayMonths: 4 } },
      { dimension: "financial_health", finding: "The owner wants to commit a large efficiency capex that would consume the remaining runway", confidence: "HIGH", source: "capex proposal", isCritical: true, supportingData: { capexAmount: 8000000 } },
      { dimension: "operational_efficiency", finding: "Operations are viable; the capex is an optimization, not survival", confidence: "HIGH", source: "ops", isCritical: true, supportingData: { utilizationPct: 75 } },
      { dimension: "market_position", finding: "Demand is stable; this is a sequencing decision", confidence: "MEDIUM", source: "sales", isCritical: false },
    ] },
    { true_primary_diagnosis: "cash_liquidity_crisis", documented_root_cause: "Correct diagnosis (liquidity) but the efficiency capex would consume the runway and risk insolvency.", expected_first_action: "Preserve liquidity and survive before committing any efficiency capex", acceptable_first_actions: ["Preserve cash / secure liquidity", "Defer capex until liquidity is secured"], unsafe_first_actions: ["Commit a large efficiency capex at four-month runway"], expected_prioritization_rationale: "An efficiency gain is worthless if the capex causes insolvency first; liquidity comes first.", special_tags: ["survives_only_via_prioritization", "diagnosis_correct_action_wrong"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "prioritization; UNVERIFIED" }),

  // ───────────── MISLEADING KPI (5): positive metrics hide deterioration ─────────────
  mk("R2-MK-06", "misleading_kpi: revenue up, cash down", "single", {
    industry: "wholesale", businessModel: "distributor", businessStage: "growth", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("wholesale", "medium", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "Revenue is growing fast and the owner feels great, but the bank balance keeps falling.",
    evidence: [
      { dimension: "financial_health", finding: "Revenue grew twenty-five percent but operating cash flow turned negative as working capital absorbed it", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { dso: 80, cashConversionDays: 95 } },
      { dimension: "financial_health", finding: "The cash balance is steadily falling despite the revenue growth as receivables build", confidence: "HIGH", source: "treasury", isCritical: true, supportingData: { receivablesAging: 60 } },
      { dimension: "operational_efficiency", finding: "Delivery is fine; cash is trapped in receivables and stock as volume grows", confidence: "MEDIUM", source: "ops", isCritical: false },
      { dimension: "market_position", finding: "The owner is reassured by the revenue-growth headline", confidence: "MEDIUM", source: "owner interview", isCritical: false, supportingData: { operatingMargin: 15 } },
    ] },
    { true_primary_diagnosis: "working_capital_stress", misleading_kpi: "revenue +25% headline hides falling cash", documented_root_cause: "Growth is consuming cash through working capital; revenue masks the cash drain.", expected_first_action: "Map the cash-conversion cycle behind the falling cash; revenue growth is masking a working-capital drain", acceptable_first_actions: ["Cash-conversion-cycle mapping", "Receivables/collections plan"], unsafe_first_actions: ["Chase more revenue growth while cash drains into working capital"], expected_prioritization_rationale: "The revenue KPI is misleading; the real issue is cash being consumed by growth.", special_tags: ["positive_metrics_hide_deterioration"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "misleading-kpi; UNVERIFIED" }),

  mk("R2-MK-07", "misleading_kpi: customers up, retention down", "single", {
    industry: "software_saas", businessModel: "subscription", businessStage: "growth", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("software_saas", "small", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "New-logo growth is strong and leadership celebrates it, but the base is quietly leaking out the back.",
    evidence: [
      { dimension: "customer_retention", finding: "New logos are up thirty-five percent but churn rose to eleven percent and net retention fell to eighty-two", confidence: "HIGH", source: "analytics", isCritical: true, supportingData: { churnPct: 11, retentionPct: 82 } },
      { dimension: "customer_retention", finding: "One-time buyers dominate the new cohorts and the loyal base is shrinking", confidence: "HIGH", source: "cohort report", isCritical: true, supportingData: { repeatRatePct: 30 } },
      { dimension: "market_position", finding: "Leadership celebrates the new-logo growth number", confidence: "MEDIUM", source: "owner interview", isCritical: false, supportingData: { newCustomerRate: 16 } },
      { dimension: "financial_health", finding: "Contribution margin on retained users remains healthy", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 55 } },
    ] },
    { true_primary_diagnosis: "customer_retention_erosion", misleading_kpi: "new-logo growth hides churn/NRR collapse", documented_root_cause: "Acquisition growth masks an accelerating churn/NRR collapse.", expected_first_action: "Run a cohort retention analysis; the new-logo headline hides a leaking base", acceptable_first_actions: ["Cohort retention analysis", "Churn-driver investigation"], unsafe_first_actions: ["Increase acquisition spend while the base churns out"], expected_prioritization_rationale: "Correct diagnosis is retention; the obvious action (spend more on acquisition) deepens the leak.", special_tags: ["positive_metrics_hide_deterioration", "diagnosis_correct_action_wrong"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "misleading-kpi; UNVERIFIED" }),

  mk("R2-MK-08", "misleading_kpi: growth up, margin collapsing", "single", {
    industry: "consumer_products", businessModel: "brand", businessStage: "growth", ownerIntake: { riskAppetite: "high" }, clientContext: CTX("consumer_products", "small", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "Top-line growth looks great and the owner wants to push harder, but the growth is bought with margin.",
    evidence: [
      { dimension: "financial_health", finding: "Revenue is up thirty percent but operating margin collapsed to negative as discount-led growth eroded price", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { operatingMargin: -5, marginPct: -9 } },
      { dimension: "financial_health", finding: "Gross margin fell with the discounting push behind the growth", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { cogsPct: 5 } },
      { dimension: "market_position", finding: "The growth headline looks great to the owner", confidence: "MEDIUM", source: "owner interview", isCritical: false, supportingData: { newCustomerRate: 18 } },
      { dimension: "operational_efficiency", finding: "Volume is up; the problem is the price/margin behind it", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { throughput: 1200 } },
    ] },
    { true_primary_diagnosis: "margin_erosion", misleading_kpi: "30% growth headline hides negative margin", documented_root_cause: "Discount-led growth has driven margin negative; the growth KPI hides value destruction.", expected_first_action: "Decompose the discount-led margin collapse; growth at negative margin destroys value", acceptable_first_actions: ["Margin-bridge / discount decomposition", "Profitable-growth reset"], unsafe_first_actions: ["Keep pushing discount-led growth"], expected_prioritization_rationale: "Correct diagnosis is margin; pushing more growth at negative margin destroys value.", special_tags: ["positive_metrics_hide_deterioration", "diagnosis_correct_action_wrong"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "misleading-kpi; UNVERIFIED" }),

  mk("R2-MK-09", "misleading_kpi: EBITDA positive, working capital collapsing", "single", {
    industry: "construction", businessModel: "contractor", businessStage: "mature", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("construction", "medium", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "EBITDA is positive and the owner cites it as proof of health, but the cash conversion is collapsing.",
    evidence: [
      { dimension: "financial_health", finding: "EBITDA is positive but working capital is collapsing as days sales outstanding hit ninety and the cash cycle one hundred five", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { dso: 90, cashConversionDays: 105 } },
      { dimension: "financial_health", finding: "The cash conversion cycle deteriorated sharply despite the positive EBITDA line", confidence: "HIGH", source: "AR ledger", isCritical: true, supportingData: { receivablesAging: 65 } },
      { dimension: "operational_efficiency", finding: "Operations are fine; the issue is cash conversion, not delivery", confidence: "MEDIUM", source: "ops", isCritical: false },
      { dimension: "market_position", finding: "The owner cites positive EBITDA as proof of health", confidence: "MEDIUM", source: "owner interview", isCritical: false, supportingData: { operatingMargin: 12 } },
    ] },
    { true_primary_diagnosis: "working_capital_stress", misleading_kpi: "positive EBITDA hides collapsing cash conversion", documented_root_cause: "Positive EBITDA masks a deteriorating cash-conversion cycle.", expected_first_action: "Map the cash-conversion cycle; positive EBITDA is masking a working-capital collapse", acceptable_first_actions: ["Cash-conversion-cycle mapping", "Receivables/collections plan"], unsafe_first_actions: ["Treat positive EBITDA as proof of health and ignore the cash collapse"], expected_prioritization_rationale: "The EBITDA KPI is misleading; the real exposure is working-capital cash.", special_tags: ["positive_metrics_hide_deterioration"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "misleading-kpi; UNVERIFIED" }),

  mk("R2-MK-10", "misleading_kpi: profit up, churn hidden", "single", {
    industry: "consumer_subscription", businessModel: "subscription", businessStage: "mature", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("consumer_subscription", "small", "HIGH"), ownerConstraintProfile: OCP(),
    businessProblem: "Reported profit rose and the owner feels secure, but the loyal base is quietly accelerating its exit.",
    evidence: [
      { dimension: "customer_retention", finding: "Reported profit rose but churn quietly climbed to nine percent and the repeat rate fell", confidence: "HIGH", source: "analytics", isCritical: true, supportingData: { churnPct: 9, repeatRatePct: 36 } },
      { dimension: "customer_retention", finding: "The profitable-looking quarter masks an accelerating loss of the loyal base", confidence: "HIGH", source: "cohort report", isCritical: true, supportingData: { retentionPct: 86 } },
      { dimension: "financial_health", finding: "The profit line looks healthy this period", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 20 } },
      { dimension: "market_position", finding: "The owner is reassured by the profit figure", confidence: "MEDIUM", source: "owner interview", isCritical: false },
    ] },
    { true_primary_diagnosis: "customer_retention_erosion", misleading_kpi: "rising profit hides accelerating churn", documented_root_cause: "A profitable quarter masks an accelerating churn of the loyal base.", expected_first_action: "Run a churn-driver analysis; the profit headline hides an accelerating loss of the base", acceptable_first_actions: ["Churn-driver analysis", "Retention investigation"], unsafe_first_actions: ["Rely on the profit headline and ignore the rising churn"], expected_prioritization_rationale: "The profit KPI is misleading; retention is eroding under it.", special_tags: ["positive_metrics_hide_deterioration"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "misleading-kpi; UNVERIFIED" }),

  // ───────────── HEALTHY / DO-NOT-ACT CONTROLS (3) ─────────────
  mk("R2-HB-06", "healthy_business: steady distributor", "abstention", {
    industry: "wholesale", businessModel: "distributor", businessStage: "mature", ownerIntake: { riskAppetite: "low" }, clientContext: CTX("wholesale", "medium", "LOW"), ownerConstraintProfile: OCP({ cashRunwayMonths: 18 }),
    businessProblem: "A steady distributor is performing well, but a cautious owner wonders whether a major restructuring is overdue.",
    evidence: [
      { dimension: "financial_health", finding: "Margins, cash generation and reserves are stable and healthy with no warning signs", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { operatingMargin: 11, cashMonths: 18 } },
      { dimension: "operational_efficiency", finding: "Operations run within capacity with healthy cash conversion and no backlog issues", confidence: "HIGH", source: "ops", isCritical: true, supportingData: { utilizationPct: 76, dso: 42 } },
      { dimension: "customer_retention", finding: "Customer relationships and repeat orders are steady year over year", confidence: "MEDIUM", source: "CRM", isCritical: false, supportingData: { repeatRatePct: 82 } },
      { dimension: "market_position", finding: "Market position is steady and no acute competitive threat is identified", confidence: "MEDIUM", source: "strategy", isCritical: false },
    ] },
    { true_primary_diagnosis: "no_single_cause", documented_root_cause: "Healthy, stable distributor; no acute problem — over-intervention is the risk.", expected_first_action: "No major intervention required; maintain monitoring and light continuous improvement", acceptable_first_actions: ["Continue current plan / monitor", "Light continuous improvement"], unsafe_first_actions: ["Launch a major restructuring with no identified problem"], expected_prioritization_rationale: "When nothing is broken, the correct move is to monitor, not restructure.", special_tags: ["do_not_act_control"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "ABSTAIN", abstention_eligible: true, provenance: "healthy/do-not-act control; UNVERIFIED" }),

  mk("R2-HB-07", "healthy_business: steady clinic", "abstention", {
    industry: "healthcare_services", businessModel: "clinic", businessStage: "mature", ownerIntake: { riskAppetite: "low" }, clientContext: CTX("healthcare_services", "small", "LOW"), ownerConstraintProfile: OCP({ cashRunwayMonths: 20 }),
    businessProblem: "A well-run clinic is healthy and stable, but the owner is tempted to make a big speculative investment.",
    evidence: [
      { dimension: "financial_health", finding: "The clinic is consistently profitable with healthy margins and a strong reserve position", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { operatingMargin: 16, cashMonths: 20 } },
      { dimension: "operational_efficiency", finding: "Patient throughput is comfortable within capacity with short wait times and no backlog", confidence: "HIGH", source: "ops", isCritical: true, supportingData: { utilizationPct: 78, turnaroundDays: 2 } },
      { dimension: "customer_retention", finding: "Patient retention and referrals are steady and strong", confidence: "MEDIUM", source: "CRM", isCritical: false, supportingData: { repeatRatePct: 85 } },
      { dimension: "process_maturity", finding: "Governance and compliance are in good standing with no open issues", confidence: "MEDIUM", source: "compliance", isCritical: false },
    ] },
    { true_primary_diagnosis: "no_single_cause", documented_root_cause: "Healthy, well-governed clinic; no acute problem to solve.", expected_first_action: "Continue the current plan and monitor; no major intervention or speculative bet required", acceptable_first_actions: ["Continue current plan / monitor", "Measured improvement only"], unsafe_first_actions: ["Make a large speculative investment with no identified problem"], expected_prioritization_rationale: "Stability and good governance call for steady continuation, not a speculative bet.", special_tags: ["do_not_act_control"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "ABSTAIN", abstention_eligible: true, provenance: "healthy/do-not-act control; UNVERIFIED" }),

  mk("R2-HB-08", "healthy_business: SaaS healthy within capacity", "abstention", {
    industry: "software_saas", businessModel: "subscription", businessStage: "growth", ownerIntake: { riskAppetite: "low" }, clientContext: CTX("software_saas", "small", "LOW"), ownerConstraintProfile: OCP({ cashRunwayMonths: 28 }),
    businessProblem: "A SaaS business is growing healthily with strong retention and margins, and the owner asks if a drastic pivot is needed.",
    evidence: [
      { dimension: "customer_retention", finding: "Net retention is strong and steady with high repeat usage across cohorts", confidence: "HIGH", source: "analytics", isCritical: true, supportingData: { retentionPct: 114, repeatRatePct: 89 } },
      { dimension: "financial_health", finding: "Margins and cash generation are healthy with a long and comfortable reserve position", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { operatingMargin: 22, cashMonths: 28 } },
      { dimension: "operational_efficiency", finding: "Delivery and support run within capacity with no quality or backlog issues", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { utilizationPct: 70 } },
      { dimension: "market_position", finding: "The competitive position is steady with no acute threat this period", confidence: "MEDIUM", source: "strategy", isCritical: false },
    ] },
    { true_primary_diagnosis: "no_single_cause", documented_root_cause: "Healthy SaaS growing within capacity; no acute problem.", expected_first_action: "Continue the current plan and monitor; no drastic pivot required", acceptable_first_actions: ["Continue current plan / monitor", "Incremental optimization"], unsafe_first_actions: ["Force a drastic pivot with no problem to solve"], expected_prioritization_rationale: "Strong retention and margins mean monitor, not pivot.", special_tags: ["do_not_act_control"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "ABSTAIN", abstention_eligible: true, provenance: "healthy/do-not-act control; UNVERIFIED" }),

  // ───────────── RECOVERY (3): failed -> successful -> sequence -> why ─────────────
  mk("R2-RC-06", "recovery: liquidity crisis survived via sequence", "single", {
    industry: "retail", businessModel: "apparel_retail", businessStage: "mature", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("retail", "large", "CRITICAL"), ownerConstraintProfile: OCP({ cashRunwayMonths: 3 }),
    businessProblem: "An apparel retailer faced a near-term liquidity crisis; the owner wants the action sequence that actually pulled a peer through.",
    evidence: [
      { dimension: "financial_health", finding: "Cash runway fell to about three months amid a sharp sales downturn and fixed lease obligations", confidence: "HIGH", source: "treasury", isCritical: true, supportingData: { cashRunwayMonths: 3 } },
      { dimension: "financial_health", finding: "Monthly cash burn is high against a thin balance with leases due", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { monthlyBurn: 6000000 } },
      { dimension: "operational_efficiency", finding: "The core business is viable once the cost base is right-sized to demand", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { utilizationPct: 62 } },
      { dimension: "market_position", finding: "A focused, smaller store estate remains profitable and defensible", confidence: "MEDIUM", source: "strategy", isCritical: false },
    ] },
    { true_primary_diagnosis: "cash_liquidity_crisis", documented_root_cause: "Liquidity crisis from a demand downturn against fixed costs; survivable with the right sequence.", expected_first_action: "Secure committed liquidity first, then right-size the cost base to demand", acceptable_first_actions: ["Secure committed liquidity", "Right-size cost base after liquidity is secured"], unsafe_first_actions: ["Cut deep into the viable core before securing liquidity", "Wait and hope sales rebound"], expected_prioritization_rationale: "Sequence matters: secure cash to survive, then restructure costs from a stable footing.", failed_action: "Across-the-board panic cost cuts before securing financing (cut into viable core, accelerated decline)", successful_action: "Secure committed liquidity, then right-size estate/cost base to demand", sequence_order: "1) liquidity 2) cost right-sizing 3) focused relaunch", why_recovery_worked: "Securing liquidity first prevented forced fire-sales and bought time to cut intelligently", outcome_evidence: "Documented analog stabilized after financing-then-restructure sequence (UNVERIFIED).", special_tags: ["survives_only_via_prioritization"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "recovery; UNVERIFIED" }),

  mk("R2-RC-07", "recovery: retention fixed at the driver, not the program", "single", {
    industry: "consumer_subscription", businessModel: "subscription", businessStage: "growth", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("consumer_subscription", "small", "HIGH"), ownerConstraintProfile: OCP({ cashRunwayMonths: 10 }),
    businessProblem: "A subscription business stemmed a churn spike; the owner wants the recovery sequence that worked rather than the one that failed.",
    evidence: [
      { dimension: "customer_retention", finding: "Churn spiked to ten percent and the loyal base began shrinking quickly", confidence: "HIGH", source: "analytics", isCritical: true, supportingData: { churnPct: 10 } },
      { dimension: "customer_retention", finding: "The churn traced to a broken onboarding and an unmet expectation, not price", confidence: "HIGH", source: "exit survey", isCritical: true, supportingData: { repeatRatePct: 38 } },
      { dimension: "customer_retention", finding: "A first attempt at a blanket discount loyalty program did not move churn", confidence: "MEDIUM", source: "experiment log", isCritical: false, supportingData: { retentionPct: 85 } },
      { dimension: "financial_health", finding: "Contribution on retained users is healthy, so the economics support a real fix", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { operatingMargin: 50 } },
    ] },
    { true_primary_diagnosis: "customer_retention_erosion", documented_root_cause: "Churn driven by a fixable onboarding/expectation gap; the winning move addressed the driver.", expected_first_action: "Diagnose the churn driver and fix onboarding/expectations before any loyalty program", acceptable_first_actions: ["Churn-driver diagnosis", "Fix onboarding then targeted win-back"], unsafe_first_actions: ["Re-run a blanket discount loyalty program that already failed"], expected_prioritization_rationale: "Fix the driver first; the program failed because it did not address the cause.", failed_action: "Blanket discount loyalty program (did not move churn)", successful_action: "Fix onboarding/expectation gap, then targeted win-back on the affected cohort", sequence_order: "1) diagnose driver 2) fix onboarding 3) targeted win-back", why_recovery_worked: "It addressed the actual churn cause rather than papering over it with discounts", outcome_evidence: "Documented analog recovered retention after fixing the driver (UNVERIFIED).", special_tags: ["diagnosis_correct_action_wrong"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "recovery; UNVERIFIED" }),

  mk("R2-RC-08", "recovery: margin restored by selective pricing, not a blanket hike", "single", {
    industry: "manufacturing", businessModel: "make_to_order", businessStage: "established", ownerIntake: { riskAppetite: "medium" }, clientContext: CTX("manufacturing", "medium", "HIGH"), ownerConstraintProfile: OCP({ cashRunwayMonths: 9 }),
    businessProblem: "A manufacturer recovered eroding margins; the owner wants the sequence that worked, not the blanket price hike that backfired.",
    evidence: [
      { dimension: "financial_health", finding: "Gross margin fell as input costs rose faster than price over several quarters", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { marginPct: -8 } },
      { dimension: "financial_health", finding: "Cost per unit rose materially while price lagged across the range", confidence: "HIGH", source: "purchasing", isCritical: true, supportingData: { cogsPct: 16 } },
      { dimension: "market_position", finding: "An initial blanket price hike caused volume loss in price-sensitive lines", confidence: "MEDIUM", source: "sales", isCritical: false, supportingData: { realizedPrice: 95 } },
      { dimension: "operational_efficiency", finding: "Operations are capable; the lever is cost decomposition plus selective pricing", confidence: "MEDIUM", source: "ops", isCritical: false, supportingData: { throughput: 800 } },
    ] },
    { true_primary_diagnosis: "margin_erosion", documented_root_cause: "Cost-driven margin erosion; recovery came from cost decomposition plus selective, elasticity-aware pricing.", expected_first_action: "Decompose cost drivers and apply selective elasticity-aware pricing rather than a blanket hike", acceptable_first_actions: ["Cost-driver decomposition", "Selective, elasticity-aware pricing"], unsafe_first_actions: ["Apply another blanket across-the-board price increase"], expected_prioritization_rationale: "Selective pricing protects volume where a blanket hike lost it; diagnose then price selectively.", failed_action: "Blanket across-the-board price hike (lost volume in price-sensitive lines)", successful_action: "Cost-driver decomposition + selective, elasticity-aware price moves and supplier terms", sequence_order: "1) cost decomposition 2) elasticity analysis 3) selective pricing", why_recovery_worked: "It recovered margin where elasticity allowed and protected volume elsewhere", outcome_evidence: "Documented analog restored margin via selective pricing + cost discipline (UNVERIFIED).", special_tags: ["diagnosis_correct_action_wrong"], expected_safety_label: "SAFE_TO_PROCEED", adversarial_type: "none", expected_gate_outcome: "PROCEED", abstention_eligible: false, provenance: "recovery; UNVERIFIED" }),
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
fs.writeFileSync(path.join(roundDir, "_BATCH_4_VALIDATION.json"), JSON.stringify({ batch: 4, authored: cases.length, validator_pass: pass, summary }, null, 2) + "\n");
console.log(`\n=== ROUND 2 BATCH 4 AUTHORING ===`);
console.log(`authored: ${cases.length}   validator-pass: ${pass}/${cases.length}`);
for (const s of summary) console.log(`  ${s.valid ? "PASS" : "FAIL"}  ${s.id} [${s.bucket}]`);
