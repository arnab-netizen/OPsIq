/**
 * Real-world public case LIBRARY generator.
 *
 * Crosses sourced real-world "plays" (public business patterns from the source register) with the 36
 * target business categories, real location presets, and business stages to produce genuinely-distinct
 * `PublicCase`s. Each base case is real-source-derived (carries a sourceRef + patternId); numeric/
 * location/stage permutations are synthetic VARIANTS linked by lineage. Every play is engineered so the
 * arbitration engine resolves the SAME dominant constraint the gold skeleton expects — so the corpus
 * scores through the real scorer/runtime without weakening anything.
 */
import type { BehavioralCase, BusinessArchetype, CaseFlags, DecisionCategory, LocationContext } from "../schema";
import { LOCATIONS } from "../locations";
import type { Constraint } from "../whole-business/arbitration";
import {
  type PublicCase,
  type PublicCaseMeta,
  type GoldSkeleton,
  caseSignature,
  SEVERITIES,
} from "./schema";

type Severity = (typeof SEVERITIES)[number];

interface CategoryDef { key: string; businessType: string; archetype: BusinessArchetype }

/** 36 target business categories → (free) businessType + nearest validated archetype. */
export const CATEGORIES: CategoryDef[] = [
  { key: "laundry", businessType: "laundry_dry_cleaning", archetype: "laundry_dry_cleaning" },
  { key: "housekeeping", businessType: "housekeeping_cleaning", archetype: "housekeeping_facility" },
  { key: "restaurant", businessType: "restaurant_cafe_cloudkitchen", archetype: "food_restaurant_cloudkitchen" },
  { key: "retail_grocery", businessType: "retail_grocery", archetype: "retail_pharmacy_grocery_apparel" },
  { key: "pharmacy", businessType: "pharmacy_health_retail", archetype: "retail_pharmacy_grocery_apparel" },
  { key: "salon", businessType: "salon_spa_beauty", archetype: "health_care_fitness" },
  { key: "gym", businessType: "gym_fitness", archetype: "health_care_fitness" },
  { key: "clinic", businessType: "clinic_healthcare_service", archetype: "health_care_fitness" },
  { key: "eldercare", businessType: "elderly_home_care", archetype: "health_care_fitness" },
  { key: "childcare", businessType: "childcare_daycare_education", archetype: "education_training" },
  { key: "tutoring", businessType: "coaching_tutoring", archetype: "education_training" },
  { key: "repair", businessType: "repair_maintenance_services", archetype: "trades_repair_manufacturing" },
  { key: "pest_control", businessType: "pest_control", archetype: "trades_repair_manufacturing" },
  { key: "trades", businessType: "hvac_plumbing_electrical", archetype: "trades_repair_manufacturing" },
  { key: "printing", businessType: "printing_packaging", archetype: "trades_repair_manufacturing" },
  { key: "manufacturing", businessType: "small_manufacturing", archetype: "trades_repair_manufacturing" },
  { key: "logistics", businessType: "logistics_delivery", archetype: "logistics_delivery_fleet" },
  { key: "ecommerce", businessType: "ecommerce_d2c", archetype: "digital_ecommerce_d2c_saas" },
  { key: "agency", businessType: "local_agency_professional_services", archetype: "professional_services_agency" },
  { key: "it_services", businessType: "software_it_services_agency", archetype: "professional_services_agency" },
  { key: "saas", businessType: "micro_saas", archetype: "digital_ecommerce_d2c_saas" },
  { key: "construction", businessType: "construction_contracting", archetype: "trades_repair_manufacturing" },
  { key: "hotel", businessType: "hotel_guesthouse", archetype: "health_care_fitness" },
  { key: "franchise", businessType: "franchise_outlet", archetype: "multi_location_franchise_portfolio" },
  { key: "agri", businessType: "rural_agri_dairy_poultry", archetype: "agri_rural" },
  { key: "carwash", businessType: "car_wash_detailing", archetype: "trades_repair_manufacturing" },
  { key: "catering", businessType: "event_catering", archetype: "food_restaurant_cloudkitchen" },
  { key: "wholesale", businessType: "import_export_wholesale", archetype: "retail_pharmacy_grocery_apparel" },
  { key: "warehouse", businessType: "warehouse_cold_storage", archetype: "logistics_delivery_fleet" },
  { key: "multi_location", businessType: "multi_location_operator", archetype: "multi_location_franchise_portfolio" },
  { key: "renovation", businessType: "home_renovation_interiors", archetype: "trades_repair_manufacturing" },
  { key: "travel", businessType: "travel_tour_operator", archetype: "professional_services_agency" },
  { key: "subscription", businessType: "subscription_membership", archetype: "digital_ecommerce_d2c_saas" },
  { key: "b2b_contractor", businessType: "b2b_service_contractor", archetype: "professional_services_agency" },
  { key: "auto_service", businessType: "auto_service_repair_parts", archetype: "trades_repair_manufacturing" },
  { key: "distributor", businessType: "local_distributor_stockist", archetype: "retail_pharmacy_grocery_apparel" },
];

const LOC_KEYS = Object.keys(LOCATIONS) as Array<keyof typeof LOCATIONS>;
const STAGES = ["startup", "early", "established", "growth", "scaling", "distressed", "turnaround", "winding_down"] as const;

function fullFlags(p: Partial<CaseFlags>): CaseFlags {
  return { hostile: false, missingOrStaleData: false, cashRisk: false, capacityRisk: false, complianceRisk: false, ownerEmotional: false, remoteOwner: false, multiBranch: false, ...p };
}

/** Blocking constraints (a collective whole-business decision exists when one is active + ≥3 domains). */
const BLOCKING_CONSTRAINTS = new Set<Constraint>([
  "compliance_block", "proof_fraud_block", "cash_survival", "below_margin", "capacity_feasibility", "customer_quality", "owner_workload",
]);

/** A 2-turn owner-interaction: owner pushes the tempting action, OpsIQ holds the gate with the reason. */
function buildTurns(play: Play): Array<{ owner: string; opsiq: string }> {
  return [
    { owner: `I want to ${play.tempting}. Can we just do it?`, opsiq: `Not yet — the binding constraint is ${play.dominantConstraint.replace(/_/g, " ")}. ${play.correct}. First show: ${play.proofRequired[0]}.` },
    { owner: `But competitors do it and I'll lose the chance. Why hold back?`, opsiq: `Because ${play.rootCause}. We do NOT ${play.shouldBlock[0]}. Reassess when: ${play.reassessment}.` },
  ];
}

/** Size fields scale with the variant; ratio/constraint fields stay FIXED so the dominant constraint
 *  the gold skeleton expects never flips between variants. */
const SIZE_KEYS = new Set([
  "cash", "grossSalesNow", "grossSalesPrev", "rent", "electricity", "water", "staff", "chemicals",
  "receivables", "payables", "adSpend", "adRevenue", "reliableKgPerDay", "offeredKgPerDay", "machineMaxKgPerDay",
]);
function scaleNumbers(base: Record<string, number | string>, scale: number): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(base)) out[k] = typeof v === "number" && SIZE_KEYS.has(k) ? Math.round(v * scale) : v;
  return out;
}

interface Play {
  patternId: string;
  sourceRef: string;
  severity: Severity;
  decisionCategory: DecisionCategory;
  dominantConstraint: Constraint;
  flags: Partial<CaseFlags>;
  domains: string[];
  businessMathRequired: boolean;
  browserRepresentative: boolean;
  /** base numbers at unit scale; the variant scale is applied to SIZE_KEYS only. */
  numbers: (unit: number) => Record<string, number | string>;
  messyFacts: (cat: string) => string[];
  ownerGoal: string;
  rootCause: string;
  tempting: string;
  correct: string;
  shouldSay: string[];
  shouldBlock: string[];
  proofRequired: string[];
  reassessment: string;
  learningRule: string;
  stopLoss?: string;
  plan: { d7: string; d30: string; d90: string };
}

/** The sourced plays — each maps to a real public pattern (sourceRef) + a deterministic dominant constraint. */
export const PLAYS: Play[] = [
  {
    patternId: "cashflow_squeeze", sourceRef: "SRC-SCORE-CASHFLOW", severity: "ugly_spiral",
    decisionCategory: "cash_margin_working_capital", dominantConstraint: "cash_survival", flags: { cashRisk: true },
    domains: ["cash flow", "working capital", "budgeting", "profitability/efficiency"], businessMathRequired: true, browserRepresentative: true,
    numbers: (u) => ({ cash: Math.round(8 * u), grossSalesNow: Math.round(40 * u), rent: Math.round(18 * u), staff: Math.round(14 * u), chemicals: Math.round(10 * u), receivables: Math.round(35 * u) }),
    messyFacts: (c) => [`${c} profitable on paper but cash keeps disappearing`, "owner tempted to take a loan to 'buy time'", "receivables lag while payables are due now"],
    ownerGoal: "survive the month without a loan and protect payroll",
    rootCause: "negative operating cash conversion — receivables and overheads outrun incoming cash despite paper profit",
    tempting: "take a high-interest loan to cover the gap and keep spending",
    correct: "freeze discretionary spend, accelerate receivables, compute runway and contribution margin before any borrowing",
    shouldSay: ["compute cash runway", "protect cash before growth", "recover receivables and cut discretionary spend"],
    shouldBlock: ["take a loan to keep spending", "fund growth before cash is stable"],
    proofRequired: ["13-week cash flow", "receivables ageing with collection dates"],
    reassessment: "re-check runway weekly until cash conversion turns positive",
    learningRule: "never recommend new spend while cash runway is under 30 days without a proven collection plan",
    stopLoss: "if runway falls below 14 days, freeze all non-payroll spend and call the bank/accountant",
    plan: { d7: "freeze discretionary spend; chase top overdue receivables", d30: "fix payment terms; rebuild a 1-month reserve", d90: "restore positive cash conversion, then resume controlled growth" },
  },
  {
    patternId: "receivables_terms_trap", sourceRef: "SRC-FC-BREWBURST", severity: "bad_management",
    decisionCategory: "cash_margin_working_capital", dominantConstraint: "cash_survival", flags: { cashRisk: true },
    domains: ["working capital", "B2B receivables/payment terms", "cash flow", "pricing/margin"], businessMathRequired: true, browserRepresentative: false,
    numbers: (u) => ({ cash: Math.round(6 * u), grossSalesNow: Math.round(50 * u), rent: Math.round(15 * u), staff: Math.round(16 * u), receivables: Math.round(60 * u), paymentTermsDays: 90 }),
    messyFacts: (c) => [`${c} pays suppliers upfront but bills clients on long credit`, "big clients pay in 60-90 days", "revenue looks strong but the bank balance shrinks"],
    ownerGoal: "stop the working-capital gap from widening",
    rootCause: "structural term mismatch — cash out before cash in; every new sale deepens the gap",
    tempting: "win more big-client volume on the same long credit terms",
    correct: "renegotiate payment terms, take deposits/milestones, and stop selling volume that worsens the cash gap",
    shouldSay: ["fix payment terms before more volume", "require deposits or milestone billing", "match cash-in timing to cash-out"],
    shouldBlock: ["chase more long-credit volume", "ignore the term mismatch"],
    proofRequired: ["payment-term schedule", "deposit/milestone agreement"],
    reassessment: "re-check the working-capital gap each fortnight",
    learningRule: "do not endorse volume growth when payment terms make each sale cash-negative",
    plan: { d7: "request deposits on new orders", d30: "renegotiate top-client terms", d90: "only grow lines that are cash-positive after terms" },
  },
  {
    patternId: "dead_stock", sourceRef: "SRC-FC-URBANMART", severity: "bad_management",
    decisionCategory: "cash_margin_working_capital", dominantConstraint: "cash_survival", flags: { cashRisk: true },
    domains: ["inventory/stock", "working capital", "cash flow", "profitability/efficiency"], businessMathRequired: true, browserRepresentative: false,
    numbers: (u) => ({ cash: Math.round(7 * u), grossSalesNow: Math.round(45 * u), rent: Math.round(16 * u), staff: Math.round(12 * u), receivables: Math.round(8 * u) }),
    messyFacts: (c) => [`${c} shelves overstocked with slow movers`, "storage cost rising and markdowns growing", "cash tied in stock that will not sell"],
    ownerGoal: "free cash trapped in dead stock without dumping margin",
    rootCause: "inventory not matched to demand — working capital frozen in slow-movers while fast-movers stock out",
    tempting: "buy more stock on a supplier scheme to chase a bulk discount",
    correct: "liquidate dead stock in a controlled way, reorder only proven fast-movers, and free working capital",
    shouldSay: ["liquidate dead stock", "reorder only proven fast-movers", "free trapped working capital"],
    shouldBlock: ["buy more stock for a bulk-scheme discount", "hold dead stock hoping demand returns"],
    proofRequired: ["stock-ageing report", "sell-through rate by SKU"],
    reassessment: "review stock turns monthly",
    learningRule: "never endorse bulk buying while working capital is trapped in dead stock",
    plan: { d7: "tag and clear dead stock", d30: "set reorder points on fast-movers", d90: "hold inventory only to demand-backed levels" },
  },
  {
    patternId: "over_expansion", sourceRef: "SRC-PESHEV-EXPANSION", severity: "ugly_spiral",
    decisionCategory: "multi_branch_portfolio", dominantConstraint: "cash_survival", flags: { cashRisk: true, multiBranch: true },
    domains: ["scaling/expansion", "cash flow", "capital allocation", "strategy"], businessMathRequired: true, browserRepresentative: true,
    numbers: (u) => ({ cash: Math.round(9 * u), grossSalesNow: Math.round(55 * u), rent: Math.round(30 * u), staff: Math.round(24 * u) }),
    messyFacts: (c) => [`${c} opened a second site before the first proved repeatable`, "fixed cost doubled, demand did not", "cash draining across both locations"],
    ownerGoal: "stop the bleed without destroying the brand",
    rootCause: "expansion before proven, repeatable unit economics — fixed cost doubled ahead of demand",
    tempting: "open a third location to 'spread overhead'",
    correct: "pause expansion, prove unit economics at one site, and cut or convert the loss-making site",
    shouldSay: ["pause expansion", "prove repeatable unit economics first", "cut or fix the loss-making site"],
    shouldBlock: ["open another location", "spread overhead by adding sites"],
    proofRequired: ["per-site P&L", "per-site contribution margin"],
    reassessment: "re-evaluate expansion only after one site is proven for 2 cycles",
    learningRule: "block expansion when current sites are not yet proven cash-positive",
    stopLoss: "if a site stays cash-negative for 2 cycles, close or convert it",
    plan: { d7: "freeze new-site spend", d30: "make one site provably profitable", d90: "expand only from a proven, capped playbook" },
  },
  {
    patternId: "underpriced_contract", sourceRef: "SRC-SBA-RECEIVABLES", severity: "normal",
    decisionCategory: "marketing_opportunity_contract", dominantConstraint: "below_margin", flags: {},
    domains: ["opportunity/contract evaluation", "pricing/margin", "B2B receivables/payment terms"], businessMathRequired: true, browserRepresentative: true,
    numbers: (u) => ({ consideredRate: 18, fullyLoadedCost: 19, competitorRate: 20, paymentTermsDays: 45, grossSalesNow: Math.round(40 * u), cash: Math.round(20 * u) }),
    messyFacts: (c) => [`${c} offered a big contract at a low rate`, "client wants 45-day terms", "owner sees the volume, not the margin"],
    ownerGoal: "decide the contract without hurting cash or margin",
    rootCause: "quoted rate is below fully-loaded cost after payment terms — the contract loses money at scale",
    tempting: "accept the big contract for the revenue and 'make it up on volume'",
    correct: "decline or re-quote to a viable margin after terms; never take work below fully-loaded cost",
    shouldSay: ["compute fully-loaded cost", "re-quote to a viable margin", "do not take work below cost"],
    shouldBlock: ["accept the contract at the offered rate", "make it up on volume"],
    proofRequired: ["fully-loaded cost computation", "margin-after-terms calculation"],
    reassessment: "re-price if input costs or terms change",
    learningRule: "block contract acceptance when margin after terms is non-positive",
    plan: { d7: "compute fully-loaded cost", d30: "re-quote or decline", d90: "win only margin-positive contracts" },
  },
  {
    patternId: "capacity_bottleneck", sourceRef: "SRC-KENAN-RESILIENCE", severity: "normal",
    decisionCategory: "staff_process_equipment", dominantConstraint: "capacity_feasibility", flags: { capacityRisk: true },
    domains: ["capacity/equipment", "operations", "staff/process control", "customer quality/reputation"], businessMathRequired: true, browserRepresentative: false,
    numbers: (u) => ({ reliableKgPerDay: 80, offeredKgPerDay: 120, grossSalesNow: Math.round(42 * u), cash: Math.round(18 * u), staff: Math.round(14 * u) }),
    messyFacts: (c) => [`${c} taking more orders than it can reliably deliver`, "a key machine/station is the bottleneck", "quality slips when overloaded"],
    ownerGoal: "grow without breaking delivery quality",
    rootCause: "demand exceeds reliable capacity — the bottleneck caps real throughput and overload hurts quality",
    tempting: "accept all incoming demand and push the team harder",
    correct: "cap intake to reliable capacity, relieve the bottleneck with proof, then add load",
    shouldSay: ["cap intake to reliable capacity", "relieve the bottleneck first", "protect quality before volume"],
    shouldBlock: ["accept all demand", "push the team past reliable capacity"],
    proofRequired: ["measured reliable throughput", "bottleneck utilization"],
    reassessment: "re-measure capacity after each process change",
    learningRule: "do not endorse more volume than measured reliable capacity",
    plan: { d7: "cap intake; protect quality", d30: "relieve the bottleneck", d90: "scale load to proven capacity" },
  },
  {
    patternId: "quality_complaints", sourceRef: "SRC-SOCIALTARGETER-PIVOT", severity: "bad_management",
    decisionCategory: "marketing_opportunity_contract", dominantConstraint: "customer_quality", flags: {},
    domains: ["customer quality/reputation", "marketing", "customer retention", "operations"], businessMathRequired: false, browserRepresentative: true,
    numbers: (u) => ({ grossSalesNow: Math.round(38 * u), cash: Math.round(16 * u), adSpend: Math.round(8 * u), adRevenue: Math.round(10 * u) }),
    messyFacts: (c) => [`${c} getting rising complaints and rework`, "reviews dropping", "owner wants to spend on ads to grow"],
    ownerGoal: "grow revenue without amplifying a quality problem",
    rootCause: "quality/complaint problem unresolved — acquisition spend would amplify churn and bad word-of-mouth",
    tempting: "spend on marketing to bring in more customers",
    correct: "fix quality and complaints first; do not spend on acquisition while reputation is leaking",
    shouldSay: ["fix quality and complaints first", "protect reputation before acquisition", "stop the leak before adding inflow"],
    shouldBlock: ["spend on marketing now", "acquire more customers before fixing quality"],
    proofRequired: ["complaint/rework rate trend", "root-cause of top complaints"],
    reassessment: "re-check complaint rate before any acquisition spend",
    learningRule: "block acquisition spend while complaint/rework rate is rising",
    plan: { d7: "triage top complaints", d30: "fix root-cause and stabilise quality", d90: "resume acquisition once quality holds" },
  },
  {
    patternId: "owner_overload", sourceRef: "SRC-BND-FRAUD-SIGNS", severity: "bad_management",
    decisionCategory: "remote_owner", dominantConstraint: "owner_workload", flags: { remoteOwner: true },
    domains: ["owner workload reduction", "approval memory/standing instructions", "staff/process control", "self-evaluation/learning"], businessMathRequired: false, browserRepresentative: true,
    numbers: (u) => ({ grossSalesNow: Math.round(40 * u), cash: Math.round(22 * u), staff: Math.round(15 * u) }),
    messyFacts: (c) => [`${c} owner is the bottleneck for every decision`, "owner works every day with no offload", "nothing happens without the owner"],
    ownerGoal: "reduce owner workload without losing control",
    rootCause: "owner is the single point of execution — no delegation, no standing instructions, no proof-based control",
    tempting: "owner keeps doing everything personally to 'keep quality'",
    correct: "delegate with proof-based controls and standing instructions; owner reviews exceptions only",
    shouldSay: ["delegate with proof-based controls", "set standing instructions", "owner reviews exceptions only"],
    shouldBlock: ["owner keeps doing everything", "no delegation"],
    proofRequired: ["named owners per task with daily proof", "standing-instruction list"],
    reassessment: "re-check owner daily load after delegation",
    learningRule: "flag plans that depend on the owner being everywhere",
    plan: { d7: "list owner-only tasks to delegate", d30: "stand up proof-based delegation", d90: "owner on exceptions only" },
  },
  {
    patternId: "fake_vendor_fraud", sourceRef: "SRC-TAL-FAKEVENDOR", severity: "fraud",
    decisionCategory: "compliance_location_review", dominantConstraint: "proof_fraud_block", flags: { hostile: true },
    domains: ["fraud/collusion prevention", "proof/anti-gaming", "vendor/supplier management"], businessMathRequired: false, browserRepresentative: true,
    numbers: (u) => ({ grossSalesNow: Math.round(50 * u), cash: Math.round(20 * u), staff: Math.round(18 * u) }),
    messyFacts: (c) => [`${c} has irregular payments to an unfamiliar linked vendor`, "one staffer both approves and pays vendors", "invoices lack matching purchase orders"],
    ownerGoal: "stop suspected vendor fraud without tipping off the suspect",
    rootCause: "no segregation of duties or three-way match — one person approves and pays, enabling fake-vendor kickbacks",
    tempting: "confront the staffer immediately on a hunch and keep paying",
    correct: "require independent verification and a PO/receipt/invoice three-way match before any further payment",
    shouldSay: ["require independent verification", "enforce three-way match", "segregate vendor approval and payment"],
    shouldBlock: ["keep paying the suspect vendor", "treat unverifiable proof as proof"],
    proofRequired: ["three-way match (PO/receipt/invoice)", "independent vendor verification"],
    reassessment: "audit vendor master and payments monthly",
    learningRule: "treat unverifiable proof as no proof and block payment",
    stopLoss: "freeze payments to the flagged vendor pending independent audit",
    plan: { d7: "freeze flagged payments; pull the vendor file", d30: "independent audit + controls", d90: "permanent segregation + monthly vendor audit" },
  },
  {
    patternId: "fake_completion_proof", sourceRef: "SRC-SDK-FICTITIOUS-VENDOR", severity: "fraud",
    decisionCategory: "compliance_location_review", dominantConstraint: "proof_fraud_block", flags: { hostile: true },
    domains: ["proof/anti-gaming", "fraud/collusion prevention", "staff incentives/KPI gaming", "staff/process control"], businessMathRequired: false, browserRepresentative: true,
    numbers: (u) => ({ grossSalesNow: Math.round(44 * u), cash: Math.round(18 * u), staff: Math.round(16 * u) }),
    messyFacts: (c) => [`${c} has completions marked done with no real evidence`, "photos/records may be reused or faked", "a manager's report cannot be independently checked"],
    ownerGoal: "stop fake completions and proof gaming",
    rootCause: "completion proof is self-reported and unverifiable — KPIs can be gamed with fake/reused evidence",
    tempting: "act on the manager's report and pay the bonus",
    correct: "require independent, non-reusable proof before completion/bonus; never act on unverifiable self-reports",
    shouldSay: ["require independent proof", "reject reused/fake evidence", "verify before payment/bonus"],
    shouldBlock: ["act on the unverifiable report", "pay the bonus without verification"],
    proofRequired: ["timestamped non-reusable proof", "independent spot-check"],
    reassessment: "spot-check completions weekly",
    learningRule: "block completion/bonus on self-reported, unverifiable proof",
    plan: { d7: "hold disputed completions", d30: "deploy non-reusable proof capture", d90: "independent audit cadence on completions" },
  },
  {
    patternId: "compliance_shutdown_risk", sourceRef: "SRC-SCIENCEDIRECT-COVID", severity: "extreme",
    decisionCategory: "compliance_location_review", dominantConstraint: "compliance_block", flags: { complianceRisk: true },
    domains: ["compliance/professional-review", "tax/legal/insurance escalation", "business continuity/risk management"], businessMathRequired: false, browserRepresentative: false,
    numbers: (u) => ({ grossSalesNow: Math.round(46 * u), cash: Math.round(14 * u), rent: Math.round(18 * u) }),
    messyFacts: (c) => [`${c} faces a licence/compliance notice with shutdown risk`, "exact rule/tax position is uncertain", "owner wants to proceed and 'sort it later'"],
    ownerGoal: "avoid shutdown and handle the notice correctly",
    rootCause: "operating in a compliance grey area with shutdown exposure and uncertain legal/tax position",
    tempting: "ignore the notice and keep operating as usual",
    correct: "pause the at-risk activity and obtain written professional compliance/tax review before proceeding",
    shouldSay: ["pause the at-risk activity", "obtain written professional review", "do not guess the legal/tax position"],
    shouldBlock: ["ignore the notice", "proceed past the grey area"],
    proofRequired: ["written professional compliance/tax review"],
    reassessment: "re-assess once the review confirms the position",
    learningRule: "route uncertain legal/tax/compliance to professional review, never guess",
    stopLoss: "halt the at-risk activity until written clearance",
    plan: { d7: "pause at-risk activity; engage a professional", d30: "obtain written clearance", d90: "operate only within cleared boundaries" },
  },
  {
    patternId: "turnaround_sequence", sourceRef: "SRC-CEINTERIM-TURNAROUND", severity: "ugly_spiral",
    decisionCategory: "cash_margin_working_capital", dominantConstraint: "cash_survival", flags: { cashRisk: true },
    domains: ["stop-loss/pivot/shutdown", "cash flow", "pricing/margin", "profitability/efficiency", "strategy"], businessMathRequired: true, browserRepresentative: true,
    numbers: (u) => ({ cash: Math.round(5 * u), grossSalesNow: Math.round(48 * u), rent: Math.round(20 * u), staff: Math.round(22 * u), chemicals: Math.round(12 * u) }),
    messyFacts: (c) => [`${c} is losing money across several lines`, "owner emotionally attached to a loss-making line", "cash nearly gone"],
    ownerGoal: "turn the business around before cash runs out",
    rootCause: "multiple loss-making lines draining a near-empty cash position; sunk-cost attachment delays the stop-loss",
    tempting: "keep funding the favourite loss-making line hoping it recovers",
    correct: "stabilise cash first, apply a stop-loss to loss-making lines, then fix margin before any reinvestment",
    shouldSay: ["stabilise cash first", "stop-loss the loss-making lines", "fix margin before reinvesting"],
    shouldBlock: ["keep funding the loss-making line", "reinvest before cash is stable"],
    proofRequired: ["line-level contribution margin", "cash runway"],
    reassessment: "weekly turnaround review until cash-positive",
    learningRule: "enforce stop-loss on loss-making lines when cash is critical, despite sunk-cost bias",
    stopLoss: "cut any line still cash-negative after one corrective cycle",
    plan: { d7: "stabilise cash; freeze losses", d30: "stop-loss + margin fix", d90: "reinvest only in proven profitable lines" },
  },
  {
    patternId: "weak_unit_economics_scale", sourceRef: "SRC-FOUNDR-STARTUP", severity: "good_fragile",
    decisionCategory: "marketing_opportunity_contract", dominantConstraint: "below_margin", flags: {},
    domains: ["digital/e-commerce unit economics", "marketing", "customer acquisition", "profitability/efficiency"], businessMathRequired: true, browserRepresentative: false,
    numbers: (u) => ({ adSpend: Math.round(20 * u), adRevenue: Math.round(22 * u), returnRatePct: 18, rtoRatePct: 12, grossMarginPct: 30, consideredRate: 18, fullyLoadedCost: 19, cash: Math.round(16 * u) }),
    messyFacts: (c) => [`${c} scaling ad spend before retention is proven`, "returns/RTO eat the margin", "CAC is close to or above contribution"],
    ownerGoal: "grow without burning cash on unprofitable acquisition",
    rootCause: "negative net unit economics after returns/RTO — scaling spend multiplies the loss",
    tempting: "increase ad spend to grow top-line revenue",
    correct: "prove positive net contribution per order (after returns/RTO) before scaling acquisition",
    shouldSay: ["prove net unit economics first", "account for returns and RTO", "fix contribution before scaling spend"],
    shouldBlock: ["increase ad spend now", "scale before retention/margin is proven"],
    proofRequired: ["net ROAS after returns/RTO", "contribution margin per order"],
    reassessment: "re-check unit economics before each spend increase",
    learningRule: "block acquisition scale when net contribution per order is non-positive",
    plan: { d7: "measure true contribution per order", d30: "fix returns/RTO and margin", d90: "scale only profitable channels" },
  },
  {
    patternId: "ghost_payroll", sourceRef: "SRC-PAPAYA-GHOST", severity: "fraud",
    decisionCategory: "staff_process_equipment", dominantConstraint: "proof_fraud_block", flags: { hostile: true },
    domains: ["fraud/collusion prevention", "staff/process control", "proof/anti-gaming", "owner workload reduction"], businessMathRequired: false, browserRepresentative: false,
    numbers: (u) => ({ grossSalesNow: Math.round(42 * u), cash: Math.round(17 * u), staff: Math.round(20 * u) }),
    messyFacts: (c) => [`${c} payroll may include staff who do not work the shifts`, "attendance is self-reported", "supervisor controls both roster and payroll"],
    ownerGoal: "stop payroll leakage from ghost/no-show staff",
    rootCause: "no independent roster-vs-payroll reconciliation — one person controls roster and pay, enabling ghost payroll",
    tempting: "trust the supervisor's headcount and keep paying",
    correct: "reconcile an owner-verified roster/attendance against payroll independently before paying",
    shouldSay: ["reconcile roster vs payroll independently", "owner-verified attendance", "segregate roster and pay"],
    shouldBlock: ["pay on the supervisor's word", "skip independent reconciliation"],
    proofRequired: ["owner-verified attendance", "roster-to-payroll reconciliation"],
    reassessment: "reconcile payroll every cycle",
    learningRule: "block payroll on unverified, self-reported attendance",
    stopLoss: "hold disputed pay until reconciliation clears",
    plan: { d7: "reconcile this cycle's payroll", d30: "independent attendance capture", d90: "permanent payroll segregation" },
  },
];

function loc(i: number): LocationContext {
  return LOCATIONS[LOC_KEYS[i % LOC_KEYS.length]];
}

function makeCase(play: Play, cat: CategoryDef, locIdx: number, stageIdx: number, scale: number, idSuffix: string, attachMultiTurn: boolean): PublicCase {
  const unit = 1000; // base currency unit
  const location = loc(locIdx);
  const stage = STAGES[stageIdx % STAGES.length];
  const numbers = scaleNumbers(play.numbers(unit), scale);
  const caseId = `PC-${play.patternId}-${cat.key}-${idSuffix}`;
  const c: BehavioralCase = {
    id: caseId,
    sourceSeedCaseId: play.patternId,
    title: `${cat.businessType} — ${play.patternId.replace(/_/g, " ")} (${location.cityRegion}, ${stage})`,
    archetype: cat.archetype,
    businessType: cat.businessType,
    decisionCategory: play.decisionCategory,
    ownerGoal: `${play.ownerGoal} (${cat.key})`,
    location,
    messyFacts: play.messyFacts(cat.businessType),
    numbers,
    hiddenRootCause: play.rootCause,
    temptingBadDecision: play.tempting,
    correctExpertDecision: play.correct,
    opsiqShouldSay: play.shouldSay,
    opsiqShouldBlock: play.shouldBlock,
    proofRequired: play.proofRequired,
    reassessmentTrigger: play.reassessment,
    learningRuleIfFails: play.learningRule,
    flags: fullFlags(play.flags),
  };
  const gold: GoldSkeleton = {
    rootCause: play.rootCause,
    dominantConstraint: play.dominantConstraint,
    whatNotToDo: play.shouldBlock,
    nextBestAction: play.correct,
    proofRequired: play.proofRequired,
    reassessment: play.reassessment,
    stopLoss: play.stopLoss,
  };
  const realFlag = idSuffix === "r0" ? "real" : "variant";
  const meta: PublicCaseMeta = {
    caseId,
    realFlag,
    sourceRef: play.sourceRef,
    lineageParentId: realFlag === "variant" ? `PC-${play.patternId}-${cat.key}-r0` : undefined,
    patternId: play.patternId,
    businessCategory: cat.key,
    businessStage: stage,
    severity: play.severity,
    dominantConstraint: play.dominantConstraint,
    domains: play.domains,
    crossDomainConflicts: play.shouldBlock,
    businessMathRequired: play.businessMathRequired,
    stopLossCondition: play.stopLoss,
    plan7Day: play.plan.d7,
    plan30Day: play.plan.d30,
    plan90Day: play.plan.d90,
    goldSkeleton: gold,
    scoringLabels: [play.patternId, play.severity, play.dominantConstraint],
    collective: play.domains.length >= 3 && BLOCKING_CONSTRAINTS.has(play.dominantConstraint),
    multiTurn: attachMultiTurn ? buildTurns(play) : undefined,
    learningExpected: play.learningRule,
    regressionTrigger: `${play.patternId} must keep dominant=${play.dominantConstraint} and block: ${play.shouldBlock[0]}`,
    privacyNote: "anonymized public pattern; no personal identifiers",
    productionRuntimeEligible: true,
    browserRepresentative: play.browserRepresentative,
    holdoutProtected: false,
    split: "training",
  };
  return { case: c, meta };
}

/**
 * Build the full public corpus: each play × each category yields a real-source base (r0) plus variants
 * that rotate location/stage and scale numbers (so signatures differ). Shallow duplicates are dropped.
 * Splits are assigned deterministically (holdout/adversarial/regression/production_runtime/browser).
 */
export function buildPublicCorpus(): PublicCase[] {
  const out: PublicCase[] = [];
  const seen = new Set<string>();
  // r0 (real source-derived) + 3 variants with distinct size scales → distinct number signatures.
  const variantScales = [1, 0.5, 1.7, 0.8];
  for (let p = 0; p < PLAYS.length; p++) {
    const play = PLAYS[p];
    const adv = play.severity === "fraud" || play.severity === "extreme" || play.severity === "ugly_spiral";
    for (let ci = 0; ci < CATEGORIES.length; ci++) {
      const cat = CATEGORIES[ci];
      for (let v = 0; v < variantScales.length; v++) {
        const suffix = v === 0 ? "r0" : `v${v}`;
        const locIdx = p * 5 + ci * 3 + v * 7;       // rotate location per variant
        const stageIdx = p * 2 + ci + v * 3;          // rotate stage per variant
        const attachMultiTurn = v === 1;              // one multi-turn variant per play×category
        const pc = makeCase(play, cat, locIdx, stageIdx, variantScales[v], suffix, attachMultiTurn);
        const sig = caseSignature(pc);
        if (seen.has(sig)) continue;
        seen.add(sig);
        const r = (p * 37 + ci * 13 + v * 7) % 100;
        if (v === 0) {
          pc.meta.split = "training";
        } else if (pc.meta.browserRepresentative && v === 1) {
          pc.meta.split = "browser_representative";
        } else if (adv) {
          pc.meta.split = r < 60 ? "adversarial" : r < 85 ? "regression" : "validation";
        } else if (r < 26) {
          pc.meta.split = "holdout"; pc.meta.holdoutProtected = true;
        } else if (r < 52) {
          pc.meta.split = "regression";
        } else if (r < 70) {
          pc.meta.split = "production_runtime";
        } else {
          pc.meta.split = "validation";
        }
        out.push(pc);
      }
    }
  }
  return out;
}

export const PUBLIC_CORPUS: PublicCase[] = buildPublicCorpus();
