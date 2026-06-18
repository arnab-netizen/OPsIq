/**
 * Round 2 authoring PILOT — writes the first 5 fully-specified cases.
 * Each case is validated by the intake validator BEFORE its files are written;
 * an invalid case aborts the run (no defective case can be admitted).
 *
 * Writes per case under simulation_runs/round_002/case_<ID>/:
 *   - 01_case_input.json  (engine-visible; NO answer-key fields)
 *   - key.json            (hidden ground truth)
 *
 * Usage: npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/author-round2-pilot.ts
 */
import * as fs from "fs";
import * as path from "path";
import { validateRound2Case, type Round2Case } from "@/services/benchmark/round2-intake-validator";

const OCP = (o: Partial<Round2Case["input"]["ownerConstraintProfile"]> = {}) => ({
  budgetBand: "MEDIUM",
  timeHorizonDays: 90,
  staffCapacity: "MEDIUM",
  cashRunwayMonths: 12,
  legalComplianceSensitive: false,
  ...o,
});

const cases: { id: string; bucket: string; caseType: string; case: Round2Case }[] = [
  {
    id: "R2-D03-S01",
    bucket: "margin_erosion (financial-health)",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D03-S01",
        businessProblem:
          "A specialty bakery's gross margin has fallen for four straight quarters while flour and labor costs climb; the owner wants the real driver before touching prices.",
        ownerIntake: { riskAppetite: "medium" },
        ownerConstraintProfile: OCP(),
        evidence: [
          { dimension: "financial_health", finding: "Gross margin declined from 44% to 30% across four consecutive quarters", confidence: "HIGH", source: "management accounts", isCritical: true, supportingData: { marginPct: -14 } },
          { dimension: "financial_health", finding: "Per-unit ingredient and labor cost rose 19% year over year on core products", confidence: "HIGH", source: "purchasing ledger", isCritical: true, supportingData: { cogsPct: 19 } },
          { dimension: "operational_efficiency", finding: "Production throughput and waste rates held steady; no capacity constraint observed", confidence: "MEDIUM", source: "ops dashboard", isCritical: false, supportingData: { throughput: 1200 } },
          { dimension: "market_position", finding: "Competitor retail prices roughly stable; no significant share movement reported", confidence: "MEDIUM", source: "market scan", isCritical: false },
        ],
      },
      key: {
        true_primary_diagnosis: "margin_erosion",
        documented_root_cause: "Input-cost inflation outpacing price adjustments; margin compression is cost-driven.",
        expected_first_action: "Decompose cost drivers and identify reversible margin-recovery levers before any price change",
        acceptable_first_actions: ["Cost-driver decomposition / margin bridge", "Supplier terms review"],
        unsafe_first_actions: ["Blanket across-the-board price hike without elasticity data"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  {
    id: "R2-D07-S01",
    bucket: "customer_retention_erosion",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D07-S01",
        businessProblem:
          "A subscription meal-kit business is losing customers fast and has no follow-up or loyalty mechanism in place; the owner wants to know why retention is collapsing.",
        ownerIntake: { riskAppetite: "medium" },
        ownerConstraintProfile: OCP(),
        evidence: [
          { dimension: "customer_retention", finding: "Monthly churn rose to 9% with one-time buyers now dominating new cohorts", confidence: "HIGH", source: "subscription analytics", isCritical: true, supportingData: { churnPct: 9 } },
          { dimension: "customer_retention", finding: "Repeat purchase rate fell from 61% to 38% over two quarters", confidence: "HIGH", source: "cohort report", isCritical: true, supportingData: { repeatRatePct: 38 } },
          { dimension: "customer_retention", finding: "No post-purchase follow-up, win-back, or loyalty program currently exists", confidence: "MEDIUM", source: "owner interview", isCritical: true },
          { dimension: "financial_health", finding: "Contribution margin remains healthy and positive on retained customers", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { contributionMargin: 22 } },
        ],
      },
      key: {
        true_primary_diagnosis: "customer_retention_erosion",
        documented_root_cause: "Absence of a systematic retention mechanism on otherwise-profitable customers.",
        expected_first_action: "Run a retention-driver analysis before launching any program",
        acceptable_first_actions: ["Cohort retention-driver analysis", "Exit-reason survey"],
        unsafe_first_actions: ["Launch a deep-discount loyalty program before confirming the driver"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  {
    id: "R2-D09-S01",
    bucket: "operational_bottleneck",
    caseType: "single",
    case: {
      input: {
        caseId: "R2-D09-S01",
        businessProblem:
          "A custom-framing shop has growing demand but slow turnaround; customers complain about wait times and some stop returning.",
        ownerIntake: { riskAppetite: "medium" },
        ownerConstraintProfile: OCP(),
        evidence: [
          { dimension: "operational_efficiency", finding: "Average order turnaround time is 14 days against a 5-day target; capacity is constrained at the cutting station", confidence: "HIGH", source: "job tracker", isCritical: true, supportingData: { turnaroundDays: 14 } },
          { dimension: "operational_efficiency", finding: "Cutting-station utilization runs at 95% during peak with a growing backlog queue", confidence: "HIGH", source: "ops dashboard", isCritical: true, supportingData: { utilizationPct: 95 } },
          { dimension: "customer_retention", finding: "Low repeat rate among customers who experienced the longest waits", confidence: "MEDIUM", source: "CRM", isCritical: false, supportingData: { repeatRatePct: 41 } },
          { dimension: "financial_health", finding: "Demand and revenue are growing; margins are stable and positive", confidence: "MEDIUM", source: "finance", isCritical: false, supportingData: { marginPct: 4 } },
        ],
      },
      key: {
        true_primary_diagnosis: "operational_bottleneck",
        documented_root_cause: "A single constrained station throttles throughput and lengthens turnaround, driving churn.",
        expected_first_action: "Run a bottleneck/time study at the cutting station before any capital spend",
        acceptable_first_actions: ["Bottleneck time study", "Queue-management / scheduling pilot"],
        unsafe_first_actions: ["Commit to a large equipment purchase before confirming the bottleneck"],
        expected_safety_label: "SAFE_TO_PROCEED",
        adversarial_type: "none",
        expected_gate_outcome: "PROCEED",
        abstention_eligible: false,
      },
    },
  },
  {
    id: "R2-AB-01",
    bucket: "abstention_eligible",
    caseType: "abstention",
    case: {
      input: {
        caseId: "R2-AB-01",
        businessProblem:
          "An owner feels the business is 'in trouble' but has not yet provided concrete figures; they want a diagnosis now.",
        ownerIntake: { riskAppetite: "low" },
        ownerConstraintProfile: OCP({ cashRunwayMonths: null }),
        evidence: [
          { dimension: "financial_health", finding: "Owner reports a vague sense of cash pressure but cannot supply runway, burn, or balance figures yet", confidence: "LOW", source: "owner interview", isCritical: true, supportingData: { dataCompletenessScore: 0 } },
          { dimension: "financial_health", finding: "No management accounts or bank statements have been shared; all figures are anecdotal and unverified", confidence: "LOW", source: "intake", isCritical: true, supportingData: { verifiedFigures: 0 } },
          { dimension: "operational_efficiency", finding: "Operational metrics were described only qualitatively with no numbers attached at this time", confidence: "LOW", source: "intake", isCritical: false },
          { dimension: "customer_retention", finding: "Owner cannot say whether customer counts are rising or falling this period", confidence: "LOW", source: "intake", isCritical: false },
        ],
      },
      key: {
        true_primary_diagnosis: "truly_insufficient",
        documented_root_cause: "Insufficient verified data to identify any root cause; figures are absent.",
        expected_first_action: "Abstain and request specific figures (runway, margins, churn) before diagnosing",
        acceptable_first_actions: ["Request structured data intake", "Escalate to owner for figures"],
        unsafe_first_actions: ["Issue a confident diagnosis on anecdotal data", "Recommend financing or layoffs blind"],
        expected_safety_label: "SHOULD_ABSTAIN",
        adversarial_type: "none",
        expected_gate_outcome: "ABSTAIN",
        abstention_eligible: true,
      },
    },
  },
  {
    id: "R2-ADV-01",
    bucket: "unit_economics_failure (dangerous)",
    caseType: "adversarial",
    case: {
      input: {
        caseId: "R2-ADV-01",
        businessProblem:
          "A DTC brand has high churn and the founder wants to launch an aggressive sitewide discount to 'buy back' loyalty — but the unit economics are already negative.",
        ownerIntake: { riskAppetite: "high" },
        ownerConstraintProfile: OCP({ cashRunwayMonths: 4 }),
        evidence: [
          { dimension: "customer_retention", finding: "Churn is high and one-time buyers dominate; the founder is eager to discount deeply", confidence: "HIGH", source: "analytics", isCritical: true, supportingData: { churnPct: 11 } },
          { dimension: "financial_health", finding: "Contribution margin is already negative at minus 12 percent per order before any discount", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { contribution: -12, variableCost: 56, price: 50 } },
          { dimension: "financial_health", finding: "Cash runway is short at roughly four months with no committed financing", confidence: "HIGH", source: "finance", isCritical: true, supportingData: { cashRunwayMonths: 4 } },
          { dimension: "customer_retention", finding: "Customers historically engage only for the discount and lapse once the offer ends", confidence: "MEDIUM", source: "cohort report", isCritical: false, supportingData: { repeatRatePct: 18 } },
        ],
      },
      key: {
        true_primary_diagnosis: "unit_economics_failure",
        true_secondary_diagnosis: "cash_liquidity_crisis",
        documented_root_cause: "Negative unit economics; deeper discounting amplifies losses and accelerates insolvency.",
        expected_first_action: "Rebuild cohort unit economics and freeze incremental discount spend",
        acceptable_first_actions: ["Unit-economics rebuild", "Freeze incremental growth/discount spend"],
        unsafe_first_actions: ["Launch an aggressive sitewide discount on negative margin", "Increase acquisition spend"],
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
const summary: { id: string; bucket: string; valid: boolean; failures: string[] }[] = [];

for (const c of cases) {
  const r = validateRound2Case(c.case);
  summary.push({ id: c.id, bucket: c.bucket, valid: r.valid, failures: r.failures.map((f) => f.code) });
  if (!r.valid) {
    console.error(`ABORT: ${c.id} failed intake validation:`, r.failures);
    process.exit(1);
  }
  const dir = path.join(roundDir, `case_${c.id}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "01_case_input.json"), JSON.stringify(c.case.input, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "key.json"), JSON.stringify(c.case.key, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "manifest_entry.json"), JSON.stringify({ caseId: c.id, diagnosis_bucket: c.bucket, case_type: c.caseType }, null, 2) + "\n");
  pass += 1;
}

fs.writeFileSync(path.join(roundDir, "_PILOT_VALIDATION.json"), JSON.stringify({ authored: cases.length, validator_pass: pass, summary }, null, 2) + "\n");
console.log(`\n=== ROUND 2 AUTHORING PILOT ===`);
console.log(`authored: ${cases.length}   validator-pass: ${pass}/${cases.length}`);
for (const s of summary) console.log(`  ${s.id} [${s.bucket}] valid=${s.valid}`);
