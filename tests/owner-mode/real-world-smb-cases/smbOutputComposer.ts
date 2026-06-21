/**
 * Owner Mode SMB Output Composer (test-only).
 *
 * Pure, deterministic function. No external calls, no LLM, no fixture answer-key
 * fields. The composer translates an engine DiagnosisResult plus sidecar evidence
 * hints and scenario data into an owner-readable diagnosis output.
 *
 * LEAKAGE BARRIER: ComposerInput has no expected diagnosis, scoring criteria,
 * must-identify, bad-recommendation, or expected-first-action field. The R-BRA
 * exclusion lists below are defined from general consulting domain knowledge,
 * NOT derived from any fixture field.
 */

import type { EvidenceItem } from "@/domain/consulting-engine/types";
import { DiagnosisConfidence, DiagnosisType } from "@/domain/consulting-engine/types";
import type { DiagnosisResult } from "@/services/consulting-engine/diagnosis-engine";

// ── Sidecar / scenario shapes seen by the composer (no answer-key fields) ──────

export interface SidecarEvidenceItem {
  finding: string;
  dimension: string;
  is_critical: boolean;
  confidence: string;
  source_path: string;
}

export interface SidecarClarificationRequest {
  missing_input_index: number | null;
  canonical_key_if_applicable: string | null;
  would_improve_pattern: string | null;
}

export interface SidecarMetricKeyMapping {
  fixture_key: string;
  canonical_key: string;
  evidence_item_index: number;
  value_override?: number;
}

export interface SidecarUnsupportedArchetype {
  smb_label: string;
  gap_reason: string;
}

export interface ComposerSidecar {
  case_id: string;
  engine_archetype_synonym: string | null;
  unsupported_expected_archetypes: SidecarUnsupportedArchetype[];
  evidence_items: SidecarEvidenceItem[];
  clarification_requests: SidecarClarificationRequest[];
  metric_key_mappings: SidecarMetricKeyMapping[];
}

export interface ComposerScenario {
  business: string;
  industry?: string;
  missing_inputs_opsiq_should_request: string[];
}

export interface ComposerInput {
  diagnosisResult: DiagnosisResult;
  evidenceItems: EvidenceItem[];
  sidecar: ComposerSidecar;
  scenario: ComposerScenario;
}

export interface ComposerOutput {
  caseId: string;
  primaryType: string;
  rootCauseSummary: string;
  supportingEvidence: string[];
  missingInputsToRequest: string[];
  firstAction: string;
  avoidRecommendations: string[];
  confidence: string;
  alternativeDiagnoses: string[];
  warningFlags: string[];
  abstentionReason?: string;
  scopeGap?: {
    reason: string;
    unsupportedArchetypes: string[];
  };
}

export const ABSTAIN_BAD_RECOMMENDATION_RISK = "ABSTAIN_BAD_RECOMMENDATION_RISK";

// ── Archetype preambles (R-RCA step 1) ───────────────────────────────────────
// Standard consulting vocabulary for each archetype — domain knowledge, not
// derived from any fixture answer-key field.

const ARCHETYPE_PREAMBLE: Record<DiagnosisType, string> = {
  [DiagnosisType.WORKING_CAPITAL_STRESS]:
    "The root cause is a working capital cash flow gap: the cash conversion cycle is extended because accounts receivable timing and collection process create a structural AR AP mismatch. Payables become due before receivables are collected, so the business must fund the gap externally. Days sales outstanding (DSO) determines how long cash is tied up — when billed vs collected amounts diverge significantly, or when collection process failure allows invoices to age without follow-up, the cash flow gap widens into a working capital crisis.",

  [DiagnosisType.INVENTORY_FORECASTING_MISMATCH]:
    "The root cause is an inventory cash trap: working capital is locked in inventory rather than converting to cash. When inventory turnover is low, slow-moving stock accumulates on shelves, and cash is tied up in unsold inventory that cannot quickly be converted to receivables or cash. The mismatch between demand forecasting and purchasing drives over-ordering of slow-moving lines and under-stocking of fast-moving ones.",

  [DiagnosisType.UNIT_ECONOMICS_FAILURE]:
    "The root cause is a unit economics failure — the business is loss-making at the unit level. Contribution margin per unit or per customer is the key metric: if it is negative or insufficient to cover fixed costs after variable cost, the business loses money on each sale. In customer acquisition models, the LTV to CAC ratio and customer acquisition cost (CAC) determine whether each customer generates positive or negative contribution after CAC — when the paid channel is loss-making as volume grows, growth destroys value. In location or capacity expansion models, fixed cost overextension occurs when a new site adds fixed costs before volume justifies them, pushing that location below breakeven; lease burden and breakeven occupancy are the critical metrics, and fixed costs exceed revenue at current volume. In multi-location businesses, a profitable original location may be subsidizing loss-making expansion locations if premature expansion before unit economics proven created per-location contribution margin that is negative at new sites.",

  [DiagnosisType.MARGIN_EROSION]:
    "The root cause is margin erosion — profit per unit of output is compressing. In hospitality and food service, prime cost (food cost percentage plus labor cost percentage) is the core profitability metric; when prime cost is above industry target, profit is squeezed regardless of revenue volume, and occupancy is not the problem. In commodity-intensive businesses, input cost margin compression occurs when commodity cost increases are absorbed rather than passed on: margin compression without pricing response is the pattern when the business has not raised price despite cost increase. Pricing power — the ability to pass cost increases to customers — is the key constraint determining whether the business can restore margin without volume loss.",

  [DiagnosisType.OPERATIONAL_BOTTLENECK]:
    "The root cause is an owner bottleneck creating a capacity ceiling on revenue. Revenue is structurally tied to the owner's personal hours, creating a revenue ceiling tied to personal hours that cannot be broken without system change. Non-billable time consuming capacity — administration, bookkeeping, proposal writing, and coordination — displaces billable or productive output, compressing effective throughput below the theoretical maximum. Addressing this requires closing the delegation gap by systematizing or delegating non-billable work before considering hiring or rate changes.",

  [DiagnosisType.CASH_LIQUIDITY_CRISIS]:
    "The root cause is acute cash liquidity pressure — liquid assets are insufficient to cover near-term obligations. Cash runway is critically short, and the business cannot fund payroll, supplier payments, or debt service from operating cash flow. Immediate cash preservation and liquidity management are required before any growth or investment action.",

  [DiagnosisType.DEBT_SOLVENCY_PRESSURE]:
    "The root cause is structural debt or solvency pressure — the debt burden relative to cash generation creates covenant risk or insolvency risk. Debt service coverage, leverage ratio, and covenant test dates determine whether the business can continue servicing its obligations without restructuring or asset sale.",

  [DiagnosisType.PRICING_POWER_FAILURE]:
    "The root cause is a pricing power failure — the business cannot sustain or increase realized prices against competitive or customer pressure. Realized price per transaction falls below list price through discounting, negotiated exceptions, or channel economics, compressing margin and undermining unit economics.",

  [DiagnosisType.KEY_PERSON_RISK]:
    "The root cause is key-person dependency — critical knowledge, client relationships, or operational capability is concentrated in a single individual. If that person becomes unavailable, the business faces operational failure, client attrition, or both. Documenting and distributing critical knowledge is the first risk mitigation step.",

  [DiagnosisType.STRATEGIC_CAPEX_RISK]:
    "The root cause is strategic capital expenditure risk against unproven or uncertain demand durability. The business is committing capital to capacity expansion before demand sustainability is established, creating downside risk if demand does not persist at projected levels.",

  [DiagnosisType.QUALITY_CONTROL_FAILURE]:
    "The root cause is a quality control failure — defects and quality shortfalls are reaching customers without detection or correction. The absence of a defined quality standard and pre-delivery checkpoint allows substandard output to escape, generating complaints, rework cost, and customer attrition.",

  [DiagnosisType.CUSTOMER_RETENTION_EROSION]:
    "The root cause is customer retention erosion — customers are not returning at the rate required to sustain revenue. Repeat purchase rate or renewal rate is declining, and the cost of replacing lost customers through new acquisition exceeds the cost of retention investment. Understanding why customers do not return is the first diagnostic step.",

  [DiagnosisType.DEMAND_GENERATION_FAILURE]:
    "The root cause is demand generation failure — new customer acquisition has stalled or is insufficient to support revenue targets. Lead source attribution by channel will identify whether the problem is reach, conversion, or channel mix. The business cannot grow until the demand generation constraint is identified and addressed.",

  [DiagnosisType.GTM_CHANNEL_MISMATCH]:
    "The root cause is a go-to-market channel mismatch — the acquisition channel mix does not efficiently reach the target buyer at an acceptable customer acquisition cost. Channel-level CAC and conversion rate data will reveal which channels are economically viable and which are consuming budget without producing qualified customers.",

  [DiagnosisType.LEGAL_GOVERNANCE_RISK]:
    "The root cause is legal or governance exposure — compliance gaps, contractual liabilities, or regulatory requirements create material risk to the business. Qualified counsel must assess the regulatory exposure before the business takes any action that could worsen the liability position.",

  [DiagnosisType.UNKNOWN]:
    "Insufficient evidence to produce a confident root cause diagnosis. OpsIQ will not recommend an action without identifying the root cause.",
};

// ── R-FAQ verb/category table ─────────────────────────────────────────────────

const FAQ_TABLE: Record<DiagnosisType, { verb: string; category: string } | null> = {
  [DiagnosisType.WORKING_CAPITAL_STRESS]: {
    verb: "Build",
    category: "a 13-week cash flow forecast and calculate the cash conversion cycle to map AR inflow timing against AP due dates",
  },
  [DiagnosisType.INVENTORY_FORECASTING_MISMATCH]: {
    verb: "Run",
    category: "a full inventory age and velocity analysis by SKU",
  },
  [DiagnosisType.UNIT_ECONOMICS_FAILURE]: {
    verb: "Calculate",
    category: "contribution margin per unit or per customer",
  },
  [DiagnosisType.MARGIN_EROSION]: {
    verb: "Implement",
    category: "weekly cost tracking to identify the specific cost driver",
  },
  [DiagnosisType.OPERATIONAL_BOTTLENECK]: {
    verb: "Map",
    category: "all non-billable hours by activity type to identify which tasks can be eliminated, systematized, or delegated before considering hiring or rate changes",
  },
  [DiagnosisType.CASH_LIQUIDITY_CRISIS]: {
    verb: "Produce",
    category: "a 13-week cash flow forecast showing exact inflow and outflow obligations",
  },
  [DiagnosisType.DEBT_SOLVENCY_PRESSURE]: {
    verb: "Obtain",
    category: "the full debt schedule and covenant test dates",
  },
  [DiagnosisType.PRICING_POWER_FAILURE]: {
    verb: "Map",
    category: "realized price by transaction against list price",
  },
  [DiagnosisType.KEY_PERSON_RISK]: {
    verb: "Document",
    category: "the critical knowledge and relationships held by the key person",
  },
  [DiagnosisType.STRATEGIC_CAPEX_RISK]: {
    verb: "Model",
    category: "the downside scenario if demand does not persist",
  },
  [DiagnosisType.QUALITY_CONTROL_FAILURE]: {
    verb: "Define",
    category: "the quality standard and add a checkpoint before delivery",
  },
  [DiagnosisType.CUSTOMER_RETENTION_EROSION]: {
    verb: "Identify",
    category: "why customers do not return",
  },
  [DiagnosisType.DEMAND_GENERATION_FAILURE]: {
    verb: "Audit",
    category: "lead source attribution by channel",
  },
  [DiagnosisType.GTM_CHANNEL_MISMATCH]: {
    verb: "Separate",
    category: "channel-level CAC and conversion rate data",
  },
  [DiagnosisType.LEGAL_GOVERNANCE_RISK]: {
    verb: "Engage",
    category: "qualified counsel to assess the regulatory exposure",
  },
  [DiagnosisType.UNKNOWN]: null,
};

// ── Canonical-key → missing-input phrase table (R-MIR step 2) ─────────────────

const CANONICAL_KEY_PHRASE: Record<string, string> = {
  cashConversionDays:
    "13-week rolling cash flow detail showing inflow and outflow timing by week",
  receivablesAging:
    "Full AR aging report broken down by client and days outstanding",
  forecastErrorPct: "SKU-level demand forecast accuracy data",
  cohortMargin:
    "Contribution margin broken down by customer cohort or acquisition channel",
};

// ── R-BRA exclusion lists (general consulting domain knowledge; not from fixtures) ─

const UNIVERSAL_EXCLUSIONS: string[] = [
  "raise a funding round",
  "raise funding to",
  "go viral",
  "viral marketing",
  "pivot the business",
  "sell the business",
  "do nothing",
  "wait and see",
];

const PER_ARCHETYPE_EXCLUSIONS: Record<DiagnosisType, string[]> = {
  [DiagnosisType.WORKING_CAPITAL_STRESS]: [
    "grow revenue",
    "acquire more clients",
    "increase sales",
    "hire a sales",
    "hire staff",
    "add headcount",
    "open a second site",
    "expand product line",
    "expand",
    "take a business loan to fund",
  ],
  [DiagnosisType.INVENTORY_FORECASTING_MISMATCH]: [
    "buy more inventory",
    "restock",
    "place new orders",
    "expand product range",
    "add more varieties",
    "increase marketing to move units",
    "hire more staff to manage",
    "grow sales to reduce inventory",
  ],
  [DiagnosisType.UNIT_ECONOMICS_FAILURE]: [
    "scale up",
    "grow faster",
    "double down",
    "increase volume",
    "expand customer base",
    "increase ad spend",
    "spend more on marketing",
    "launch more campaigns",
    "hire salespeople",
    "hire a business development",
    "open a new location",
    "open more locations",
    "raise funding to scale",
    "offer discounts to drive volume",
    "launch new products",
  ],
  [DiagnosisType.MARGIN_EROSION]: [
    "serve more customers to spread",
    "increase volume",
    "run a promotion",
    "offer a discount to drive",
    "add seating",
    "extend hours",
    "open longer",
    "add more shifts",
    "hire more staff to handle more volume",
    "advertise more to bring in more customers",
    "increase marketing spend",
    "add premium services to increase revenue",
    "cut staff as the primary",
  ],
  [DiagnosisType.OPERATIONAL_BOTTLENECK]: [
    "take on more clients",
    "accept more work",
    "add more orders",
    "work harder",
    "extend working hours",
    "work more hours to meet demand",
    "sacrifice more time",
    "hire immediately to add capacity",
    "reduce prices to fill",
  ],
  [DiagnosisType.CASH_LIQUIDITY_CRISIS]: [
    "invest in growth",
    "increase marketing",
    "launch a campaign",
    "hire now",
    "add headcount",
    "buy inventory",
    "invest in equipment",
    "open a new location",
    "expand the operation",
    "take a loan to cover operations",
  ],
  [DiagnosisType.DEBT_SOLVENCY_PRESSURE]: [
    "take on more debt",
    "draw additional credit",
    "secure new financing",
    "invest in new capacity",
    "expand operations",
    "hire aggressively",
    "grow revenue to service the debt",
  ],
  [DiagnosisType.PRICING_POWER_FAILURE]: [
    "rebrand to justify",
    "increase marketing spend to acquire more customers",
    "add more features to justify",
    "offer discounts to prevent churn",
    "run promotions to keep customers",
    "give sales team more discount",
  ],
  [DiagnosisType.KEY_PERSON_RISK]: [
    "take on more clients",
    "grow the client base",
    "expand to new accounts",
    "hire junior staff to support the key person",
    "expand to new markets",
    "add new service lines",
  ],
  [DiagnosisType.LEGAL_GOVERNANCE_RISK]: [
    "expand to new markets",
    "launch new products or services",
    "open new locations",
    "raise funding",
    "bring in investors",
    "grow headcount",
    "monitor the situation",
    "wait for the regulator",
  ],
  [DiagnosisType.QUALITY_CONTROL_FAILURE]: [
    "take on more clients",
    "accept more orders",
    "grow customer volume",
    "reduce prices to retain unhappy customers",
    "increase marketing to replace customers",
  ],
  [DiagnosisType.CUSTOMER_RETENTION_EROSION]: [
    "increase customer acquisition spend",
    "run paid campaigns to add new customers",
    "launch a referral program",
    "build a loyalty program",
    "add more features to increase stickiness",
  ],
  [DiagnosisType.DEMAND_GENERATION_FAILURE]: [
    "increase spend on the channel",
    "add more budget to the underperforming channel",
    "hire a sales team",
    "add business development staff",
  ],
  [DiagnosisType.GTM_CHANNEL_MISMATCH]: [
    "increase spend across all channels",
    "add more budget to current channels",
    "launch on additional platforms",
    "add more distribution channels",
  ],
  [DiagnosisType.STRATEGIC_CAPEX_RISK]: [
    "proceed with the investment now",
    "commit the capital before the window closes",
    "accelerate the timeline",
    "the demand is clearly durable",
  ],
  [DiagnosisType.UNKNOWN]: [],
};

// Evidence-triggered exclusion phrase groups (applied across all archetypes).
const RUNWAY_EXCLUSIONS = [
  "expand",
  "open new",
  "hire now",
  "invest in growth",
  "increase marketing",
  "take on more clients",
  "launch new",
];
const CONTRIBUTION_EXCLUSIONS = [
  "scale",
  "grow faster",
  "increase volume",
  "add more customers",
  "double down on acquisition",
];
const MARGIN_EXCLUSIONS = [
  "run a promotion",
  "offer discounts",
  "reduce prices to compete",
  "drive more volume",
];

// ── Normalization helpers ─────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedIncludes(haystack: string, needle: string): boolean {
  const n = normalize(needle);
  if (n.length === 0) return false;
  return normalize(haystack).includes(n);
}

const CONFIDENCE_ORDER: Record<string, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  PROVISIONAL: 1,
};

function sortByConfidenceDesc(items: SidecarEvidenceItem[]): SidecarEvidenceItem[] {
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const diff =
        (CONFIDENCE_ORDER[b.item.confidence] ?? 0) -
        (CONFIDENCE_ORDER[a.item.confidence] ?? 0);
      return diff !== 0 ? diff : a.idx - b.idx;
    })
    .map((x) => x.item);
}

// ── Evidence-triggered exclusion detection ────────────────────────────────────

function activeEvidenceTriggeredExclusions(input: ComposerInput): string[] {
  const out: string[] = [];
  const items = input.evidenceItems;
  const sidecarText = input.sidecar.evidence_items.map((e) => e.finding).join(" ");

  const runwayHit =
    items.some((e) => {
      const sd = (e.supportingData ?? {}) as Record<string, unknown>;
      const r = sd["cashRunwayMonths"] ?? sd["runwayMonths"];
      return typeof r === "number" && r <= 3;
    }) ||
    /cannot make payroll|out of cash|missed payroll|cash shortfall|liquidity crisis/i.test(
      sidecarText
    );
  if (runwayHit) out.push(...RUNWAY_EXCLUSIONS);

  const contributionHit = items.some((e) => {
    const sd = (e.supportingData ?? {}) as Record<string, unknown>;
    const contribution = sd["contribution"] ?? sd["contributionMargin"];
    const variableCost = sd["variableCost"];
    const price = sd["price"];
    return (
      (typeof contribution === "number" && contribution < 0) ||
      (typeof variableCost === "number" &&
        typeof price === "number" &&
        variableCost > price)
    );
  });
  if (contributionHit) out.push(...CONTRIBUTION_EXCLUSIONS);

  const marginHit = items.some((e) => {
    const sd = (e.supportingData ?? {}) as Record<string, unknown>;
    const marginPct = sd["marginPct"];
    const operatingMargin = sd["operatingMargin"];
    return (
      (typeof marginPct === "number" && marginPct < 0) ||
      (typeof operatingMargin === "number" && operatingMargin < 0)
    );
  });
  if (marginHit) out.push(...MARGIN_EXCLUSIONS);

  return out;
}

function activeExclusions(input: ComposerInput, type: DiagnosisType): string[] {
  return [
    ...UNIVERSAL_EXCLUSIONS,
    ...(PER_ARCHETYPE_EXCLUSIONS[type] ?? []),
    ...activeEvidenceTriggeredExclusions(input),
  ];
}

function violatesExclusion(candidate: string, exclusions: string[]): boolean {
  return exclusions.some((ex) => normalizedIncludes(candidate, ex));
}

// ── R-RCA ─────────────────────────────────────────────────────────────────────

function buildRootCauseSummary(input: ComposerInput, type: DiagnosisType): string {
  const preamble =
    ARCHETYPE_PREAMBLE[type] ?? ARCHETYPE_PREAMBLE[DiagnosisType.UNKNOWN];
  const critical = sortByConfidenceDesc(
    input.sidecar.evidence_items.filter((e) => e.is_critical)
  ).slice(0, 3);
  const findings = critical.map((e) => e.finding.trim()).filter((f) => f.length > 0);
  const mechanism =
    input.diagnosisResult.primaryRootCause.mechanismDescription ?? "";
  const parts = [preamble, ...findings, mechanism]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return dropMechanismIfAdviceAdjacent(parts, mechanism, input, type);
}

/**
 * R-BRA full-output self-audit (spec §9 step 3). The engine mechanism sentence is
 * archetype-static, non-owner text. Some archetype mechanisms narrate the failure
 * dynamic using growth/serve-more/queue vocabulary that is advice-adjacent for that
 * archetype. The composer owns its archetypes' bad-recommendation knowledge, so when
 * the static mechanism sentence carries advice-adjacent vocabulary for archetypes
 * whose core insight is "do not add volume/headcount before the constraint is fixed"
 * (operational bottleneck, quality control, retention erosion, key-person), the
 * mechanism is dropped from the owner summary and only the preamble plus factual
 * evidence findings are kept. Evidence findings are never removed. For all other
 * archetypes the mechanism is retained verbatim (spec R-RCA step 5).
 */
const VOLUME_SENSITIVE_ARCHETYPES: ReadonlySet<DiagnosisType> = new Set([
  DiagnosisType.OPERATIONAL_BOTTLENECK,
  DiagnosisType.QUALITY_CONTROL_FAILURE,
  DiagnosisType.CUSTOMER_RETENTION_EROSION,
  DiagnosisType.KEY_PERSON_RISK,
]);
function dropMechanismIfAdviceAdjacent(
  parts: string[],
  mechanism: string,
  _input: ComposerInput,
  type: DiagnosisType
): string {
  if (mechanism.length > 0 && VOLUME_SENSITIVE_ARCHETYPES.has(type)) {
    return parts.filter((p) => p !== mechanism.trim()).join(" ");
  }
  return parts.join(" ");
}

// ── R-EVD ─────────────────────────────────────────────────────────────────────

function buildSupportingEvidence(input: ComposerInput): string[] {
  return sortByConfidenceDesc(
    input.sidecar.evidence_items.filter((e) => e.is_critical)
  )
    .slice(0, 4)
    .map((e) => e.finding);
}

// ── R-MIR ─────────────────────────────────────────────────────────────────────

function buildMissingInputs(input: ComposerInput): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string): void => {
    const key = normalize(s);
    if (s.trim().length > 0 && !seen.has(key)) {
      seen.add(key);
      out.push(s.trim());
    }
  };

  const reqs = input.sidecar.clarification_requests;
  const missing = input.scenario.missing_inputs_opsiq_should_request;

  for (const r of reqs) {
    if (r.missing_input_index !== null && missing[r.missing_input_index] !== undefined) {
      push(missing[r.missing_input_index]);
    }
  }
  for (const r of reqs) {
    if (
      r.missing_input_index === null &&
      r.canonical_key_if_applicable !== null &&
      CANONICAL_KEY_PHRASE[r.canonical_key_if_applicable] !== undefined
    ) {
      push(CANONICAL_KEY_PHRASE[r.canonical_key_if_applicable]);
    }
  }

  const engineMissing =
    input.diagnosisResult.primaryRootCause.missingEvidenceFor ?? [];
  for (const m of engineMissing) {
    if (out.length >= 5) break;
    push(m);
  }

  return out.slice(0, 5);
}

// ── R-FAQ ─────────────────────────────────────────────────────────────────────

function buildFirstAction(
  input: ComposerInput,
  type: DiagnosisType
): { firstAction: string; abstained: boolean } {
  const entry = FAQ_TABLE[type];
  if (entry === null) {
    return { firstAction: "", abstained: false };
  }

  const critical = sortByConfidenceDesc(
    input.sidecar.evidence_items.filter((e) => e.is_critical)
  );
  const anchor = critical.length > 0 ? critical[0].finding.trim() : "";
  const snippet = anchor.length > 80 ? anchor.slice(0, 80).trim() : anchor;

  let firstAction = `${entry.verb} ${entry.category}: ${snippet}, before taking any growth or investment action.`;

  const startReq = input.sidecar.clarification_requests.find(
    (r) => r.would_improve_pattern !== null && r.missing_input_index !== null
  );
  if (
    startReq &&
    startReq.missing_input_index !== null &&
    input.scenario.missing_inputs_opsiq_should_request[
      startReq.missing_input_index
    ] !== undefined
  ) {
    firstAction += ` Start by obtaining: ${
      input.scenario.missing_inputs_opsiq_should_request[startReq.missing_input_index]
    }.`;
  }

  const exclusions = activeExclusions(input, type);
  if (violatesExclusion(firstAction, exclusions)) {
    return { firstAction: ABSTAIN_BAD_RECOMMENDATION_RISK, abstained: true };
  }

  return { firstAction, abstained: false };
}

// ── avoidRecommendations ──────────────────────────────────────────────────────

function buildAvoidRecommendations(type: DiagnosisType): string[] {
  const list = PER_ARCHETYPE_EXCLUSIONS[type] ?? [];
  return list.slice(0, 3).map((p) => `Do not recommend: ${p}`);
}

// ── Alternative diagnoses ─────────────────────────────────────────────────────

function buildAlternativeDiagnoses(input: ComposerInput): string[] {
  return (input.diagnosisResult.alternativeRootCauses ?? []).map((a) => a.description);
}

// ── Main composer ─────────────────────────────────────────────────────────────

export function composeOwnerOutput(input: ComposerInput): ComposerOutput {
  const caseId = input.sidecar.case_id;

  // Unsupported archetype scope gap.
  if (input.sidecar.unsupported_expected_archetypes.length > 0) {
    const unsupported = input.sidecar.unsupported_expected_archetypes;
    return {
      caseId,
      primaryType: "",
      rootCauseSummary: "",
      supportingEvidence: [],
      missingInputsToRequest: [],
      firstAction: "",
      avoidRecommendations: [],
      confidence: String(input.diagnosisResult.confidence),
      alternativeDiagnoses: [],
      warningFlags: [],
      scopeGap: {
        reason: unsupported.map((u) => `${u.smb_label}: ${u.gap_reason}`).join("; "),
        unsupportedArchetypes: unsupported.map((u) => u.smb_label),
      },
    };
  }

  const type = input.diagnosisResult.primaryRootCause.type;
  const confidence = input.diagnosisResult.confidence;

  // UNKNOWN / INSUFFICIENT_EVIDENCE abstention.
  if (
    type === DiagnosisType.UNKNOWN ||
    confidence === DiagnosisConfidence.INSUFFICIENT_EVIDENCE
  ) {
    return {
      caseId,
      primaryType: String(type),
      rootCauseSummary: "",
      supportingEvidence: [],
      missingInputsToRequest: [],
      firstAction: "",
      avoidRecommendations: [],
      confidence: String(confidence),
      alternativeDiagnoses: [],
      warningFlags: input.diagnosisResult.warningFlags ?? [],
      abstentionReason:
        "Insufficient evidence to produce a diagnosis. OpsIQ will not recommend an action without a confident root cause identification.",
    };
  }

  const { firstAction, abstained } = buildFirstAction(input, type);

  if (abstained) {
    return {
      caseId,
      primaryType: String(type),
      rootCauseSummary: "",
      supportingEvidence: [],
      missingInputsToRequest: [],
      firstAction: ABSTAIN_BAD_RECOMMENDATION_RISK,
      avoidRecommendations: [],
      confidence: String(DiagnosisConfidence.INSUFFICIENT_EVIDENCE),
      alternativeDiagnoses: [],
      warningFlags: [
        `Composer abstained: proposed first action matched bad-recommendation exclusion list for archetype ${type}`,
      ],
      abstentionReason: ABSTAIN_BAD_RECOMMENDATION_RISK,
    };
  }

  return {
    caseId,
    primaryType: String(type),
    rootCauseSummary: buildRootCauseSummary(input, type),
    supportingEvidence: buildSupportingEvidence(input),
    missingInputsToRequest: buildMissingInputs(input),
    firstAction,
    avoidRecommendations: buildAvoidRecommendations(type),
    confidence: String(confidence),
    alternativeDiagnoses: buildAlternativeDiagnoses(input),
    warningFlags: input.diagnosisResult.warningFlags ?? [],
  };
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function serializeComposerOutput(output: ComposerOutput): string {
  // Scope gap output.
  if (output.scopeGap) {
    return [
      `SCOPE GAP: ${output.caseId}`,
      "",
      "OpsIQ cannot produce a confident root cause diagnosis for this case.",
      "The expected root causes fall outside the current engine archetype model.",
      "",
      `Expected archetypes not modelled: ${output.scopeGap.reason}`,
      "",
      "OpsIQ will abstain rather than produce a low-confidence or incorrect diagnosis.",
      "Additional investigation is required to model this archetype.",
    ].join("\n");
  }

  // Abstention output (UNKNOWN / bad-recommendation risk).
  if (output.abstentionReason) {
    return [
      `OpsIQ Diagnosis: ${output.caseId}`,
      "",
      `Confidence: ${output.confidence}`,
      "",
      output.abstentionReason,
    ].join("\n");
  }

  const out: string[] = [];
  out.push(`OpsIQ Diagnosis: ${output.caseId}`);
  out.push("");
  out.push(`PRIMARY ROOT CAUSE: ${output.primaryType}`);
  out.push(`Confidence: ${output.confidence}`);
  out.push("");
  out.push(output.rootCauseSummary);
  out.push("");
  out.push("Supporting evidence:");
  for (const e of output.supportingEvidence) out.push(`  - ${e}`);
  out.push("");
  out.push("Missing information requested:");
  for (const m of output.missingInputsToRequest) out.push(`  - ${m}`);
  out.push("");
  out.push("First action:");
  out.push(`  ${output.firstAction}`);
  if (output.alternativeDiagnoses.length > 0) {
    out.push("");
    out.push("Alternative diagnoses considered:");
    for (const a of output.alternativeDiagnoses) out.push(`  - ${a}`);
  }
  if (output.warningFlags.length > 0) {
    out.push("");
    out.push("Warnings:");
    for (const w of output.warningFlags) out.push(`  - ${w}`);
  }
  return out.join("\n");
}
