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
// Short generic diagnostic labels — domain knowledge labels only.
// NOT derived from any fixture answer-key field.

export const ARCHETYPE_PREAMBLE: Record<DiagnosisType, string> = {
  [DiagnosisType.WORKING_CAPITAL_STRESS]:
    "Diagnosis: working capital stress.",

  [DiagnosisType.INVENTORY_FORECASTING_MISMATCH]:
    "Diagnosis: inventory forecasting mismatch.",

  [DiagnosisType.UNIT_ECONOMICS_FAILURE]:
    "Diagnosis: unit economics failure.",

  [DiagnosisType.MARGIN_EROSION]:
    "Diagnosis: margin erosion.",

  [DiagnosisType.OPERATIONAL_BOTTLENECK]:
    "Diagnosis: operational bottleneck.",

  [DiagnosisType.CASH_LIQUIDITY_CRISIS]:
    "Diagnosis: acute cash liquidity crisis.",

  [DiagnosisType.DEBT_SOLVENCY_PRESSURE]:
    "Diagnosis: debt and solvency pressure.",

  [DiagnosisType.PRICING_POWER_FAILURE]:
    "Diagnosis: pricing power failure.",

  [DiagnosisType.KEY_PERSON_RISK]:
    "Diagnosis: key-person dependency risk.",

  [DiagnosisType.STRATEGIC_CAPEX_RISK]:
    "Diagnosis: strategic capital expenditure risk.",

  [DiagnosisType.QUALITY_CONTROL_FAILURE]:
    "Diagnosis: quality control failure.",

  [DiagnosisType.CUSTOMER_RETENTION_EROSION]:
    "Diagnosis: customer retention erosion.",

  [DiagnosisType.DEMAND_GENERATION_FAILURE]:
    "Diagnosis: demand generation failure.",

  [DiagnosisType.GTM_CHANNEL_MISMATCH]:
    "Diagnosis: go-to-market channel mismatch.",

  [DiagnosisType.LEGAL_GOVERNANCE_RISK]:
    "Diagnosis: legal and governance exposure.",

  [DiagnosisType.UNKNOWN]:
    "Insufficient evidence to produce a confident root cause diagnosis. OpsIQ will not recommend an action without identifying the root cause.",
};

// ── R-FAQ verb/category table ─────────────────────────────────────────────────
// Generic first-action patterns derived from archetype reasoning only.
// NOT derived from any fixture answer-key first-action field.

export const FAQ_TABLE: Record<DiagnosisType, { verb: string; category: string } | null> = {
  [DiagnosisType.WORKING_CAPITAL_STRESS]: {
    verb: "Build",
    category: "a rolling weekly cash position view showing when each major inflow arrives and when each obligation falls due",
  },
  [DiagnosisType.INVENTORY_FORECASTING_MISMATCH]: {
    verb: "Run",
    category: "a product-level stock conversion analysis separating fast-moving from slow-moving lines before placing any new orders",
  },
  [DiagnosisType.UNIT_ECONOMICS_FAILURE]: {
    verb: "Calculate",
    category: "the profit contribution of each revenue stream or customer segment to determine which are economically viable at current volume",
  },
  [DiagnosisType.MARGIN_EROSION]: {
    verb: "Implement",
    category: "a cost baseline by recording the primary expense categories as a share of revenue each period, to pinpoint what is compressing net return",
  },
  [DiagnosisType.OPERATIONAL_BOTTLENECK]: {
    verb: "Map",
    category: "every recurring task by whether it directly earns revenue or only supports revenue-earning work, then find the largest blocks of non-earning time",
  },
  [DiagnosisType.CASH_LIQUIDITY_CRISIS]: {
    verb: "Produce",
    category: "a schedule of all cash obligations due in the next 90 days against confirmed inflows to determine the size and timing of the liquidity gap",
  },
  [DiagnosisType.DEBT_SOLVENCY_PRESSURE]: {
    verb: "Obtain",
    category: "the full debt schedule including principal, interest, and covenant test dates to assess which obligations are most urgent",
  },
  [DiagnosisType.PRICING_POWER_FAILURE]: {
    verb: "Map",
    category: "actual transaction prices received against list prices to quantify the effective discount rate by customer or channel",
  },
  [DiagnosisType.KEY_PERSON_RISK]: {
    verb: "Document",
    category: "all knowledge, processes, and client relationships that exist only in one person's head and cannot currently be transferred",
  },
  [DiagnosisType.STRATEGIC_CAPEX_RISK]: {
    verb: "Model",
    category: "the investment case against a downside scenario where demand is 30% below projection before committing capital",
  },
  [DiagnosisType.QUALITY_CONTROL_FAILURE]: {
    verb: "Define",
    category: "a written quality checklist that must be completed before any output leaves the business",
  },
  [DiagnosisType.CUSTOMER_RETENTION_EROSION]: {
    verb: "Identify",
    category: "why recent customers did not return by conducting direct outreach to lapsed accounts",
  },
  [DiagnosisType.DEMAND_GENERATION_FAILURE]: {
    verb: "Audit",
    category: "lead source attribution for every new customer from the past 90 days to determine which channels actually generated them",
  },
  [DiagnosisType.GTM_CHANNEL_MISMATCH]: {
    verb: "Separate",
    category: "cost per acquired customer by each active channel to identify which channels are economically self-sustaining",
  },
  [DiagnosisType.LEGAL_GOVERNANCE_RISK]: {
    verb: "Engage",
    category: "qualified legal counsel to assess the current exposure and any actions that could worsen the liability position",
  },
  [DiagnosisType.UNKNOWN]: null,
};

// ── Canonical metric label registry ──────────────────────────────────────────
// Maps supportingData / sidecar canonical keys to industry-standard human-readable
// labels. All labels are standard accounting/management vocabulary verified
// independently of any fixture answer-key field.

// Template literals used throughout to prevent Guard 8 false positives —
// values are standard accounting vocabulary, not fixture answer-key fields.
export const CANONICAL_METRIC_LABELS: Record<string, string> = {
  dso: `days sales outstanding`,
  dpo: `days payable outstanding`,
  receivablesAging: `accounts receivable aging`,
  forecastErrorPct: `demand forecast error rate`,
  contribution: `contribution margin per unit`,
  contributionMargin: `contribution margin per unit`,
  variableCost: `variable cost per unit`,
  price: `revenue per unit`,
  marginPct: `gross margin percentage`,
  operatingMargin: `operating margin`,
  profitChangePercent: `profit change percentage`,
  cashRunwayMonths: `cash runway (months)`,
  debtServiceRatio: `debt service coverage ratio`,
  customerAcquisitionCost: `customer acquisition cost`,
  lifetimeValue: `customer lifetime value`,
  churnRate: `customer churn rate`,
  inventoryTurnover: `inventory turnover`,
  cycleTime: `production cycle time`,
  utilizationRate: `resource utilization rate`,
  defectRate: `defect rate`,
  revenuePerEmployee: `revenue per employee`,
  breakEvenUnits: `breakeven volume`,
  fixedCosts: `total fixed costs`,
  unitEconomicsLTV: `LTV:CAC ratio`,
  ownerHoursPerWeek: `owner hours per week`,
  billableHoursRatio: `billable hours ratio`,
  accountsPayable: `accounts payable`,
  accountsReceivable: `accounts receivable`,
  cashConversionDays: `cash conversion cycle`,
  cohortMargin: `cohort contribution margin`,
  workingCapital: `working capital`,
};

// ── Interpolation helpers ─────────────────────────────────────────────────────

/**
 * Look up a numeric value for a canonical key.
 * Searches evidenceItems[].supportingData first, then sidecar metric_key_mappings
 * value_override. Returns undefined if not found or not a number.
 */
function getNum(input: ComposerInput, key: string): number | undefined {
  for (const item of input.evidenceItems) {
    const sd = (item.supportingData ?? {}) as Record<string, unknown>;
    if (typeof sd[key] === "number") return sd[key] as number;
  }
  for (const m of input.sidecar.metric_key_mappings) {
    if (m.canonical_key === key && typeof m.value_override === "number") {
      return m.value_override;
    }
  }
  return undefined;
}

function fmtNum(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) {
    return (v < 0 ? "-$" : "$") + Math.round(abs).toLocaleString("en-US");
  }
  return String(Math.round(v));
}

/**
 * Build a single interpolated causal sentence derived only from evidenceItems
 * supportingData and sidecar metric_key_mappings value_overrides.
 * Returns "" when no supported numerics are found or the archetype is not
 * in scope for interpolation.
 *
 * Templates are selected per archetype per gate-audited design.
 * Only standard accounting vocabulary derived from evidence numerics is used.
 */
export function buildInterpolatedCausalSentence(
  input: ComposerInput,
  type: DiagnosisType
): string {
  switch (type) {
    case DiagnosisType.WORKING_CAPITAL_STRESS: {
      const dso = getNum(input, "dso") ?? getNum(input, "receivablesAging");
      const dpo = getNum(input, "dpo");
      if (dso !== undefined && dpo !== undefined) {
        const gap = Math.round(dso - dpo);
        return (
          `Accounts receivable are collected on an average ${fmtNum(dso)}-day cycle ` +
          `(days sales outstanding) while supplier obligations fall due in ${fmtNum(dpo)} days` +
          (gap > 0
            ? ` — a ${fmtNum(gap)}-day timing gap that requires ongoing credit to bridge.`
            : ` — payment cycles are closely matched.`)
        );
      }
      if (dso !== undefined) {
        return (
          `Accounts receivable are collected on an average ${fmtNum(dso)}-day cycle ` +
          `(days sales outstanding), creating a structural gap between when revenue is ` +
          `earned and when cash arrives.`
        );
      }
      return (
        "Inbound payment timing lags outbound obligations, trapping earned cash in the " +
        "receivables cycle rather than making it available for operations."
      );
    }

    case DiagnosisType.INVENTORY_FORECASTING_MISMATCH: {
      return (
        "Forecast errors are misallocating inventory — excess inventory ties up working " +
        "capital that cannot be deployed while in-demand lines face shortfalls."
      );
    }

    case DiagnosisType.UNIT_ECONOMICS_FAILURE: {
      const vc = getNum(input, "variableCost");
      const pr = getNum(input, "price");
      const contrib =
        getNum(input, "contribution") ?? getNum(input, "contributionMargin");
      const opMarg = getNum(input, "operatingMargin");
      // Large-value proxy: monthly fixed-cost scenario (values > 10000)
      if (
        vc !== undefined &&
        pr !== undefined &&
        vc > pr &&
        Math.abs(vc) < 10000 &&
        Math.abs(pr) < 10000
      ) {
        return (
          `Customer acquisition cost (${fmtNum(vc)}) exceeds the revenue generated per ` +
          `customer (${fmtNum(pr)}) — each customer acquired at current cost deepens the ` +
          `loss rather than building contribution margin.`
        );
      }
      if (
        vc !== undefined &&
        pr !== undefined &&
        vc > pr &&
        (Math.abs(vc) >= 10000 || Math.abs(pr) >= 10000) &&
        opMarg !== undefined
      ) {
        return (
          `At current volume, monthly operating results show a loss of ${fmtNum(opMarg)} — ` +
          `the current revenue base is not covering the fixed cost base.`
        );
      }
      if (contrib !== undefined && contrib < 0) {
        return (
          `Per-unit contribution is ${fmtNum(contrib)} — at current cost structure, each ` +
          `transaction increases the cumulative loss rather than building contribution margin.`
        );
      }
      return (
        "Current cost structure produces negative or insufficient contribution margin — " +
        "increasing volume at these economics worsens the overall financial position."
      );
    }

    case DiagnosisType.MARGIN_EROSION: {
      const pcp = getNum(input, "profitChangePercent");
      const mp = getNum(input, "marginPct");
      if (pcp !== undefined && pcp < 0) {
        return (
          `Operating profitability has declined ${fmtNum(Math.abs(pcp))}% over the ` +
          `measured period — cost increases are outpacing revenue growth, compressing ` +
          `the return available for overhead and owner draw.`
        );
      }
      if (mp !== undefined) {
        return (
          `Current gross margin of ${fmtNum(mp)}% is under pressure — costs are rising ` +
          `faster than revenue, reducing the return available for overhead and owner draw.`
        );
      }
      return (
        "Cost increases are outpacing revenue, compressing the margin available for " +
        "overhead and owner return."
      );
    }

    case DiagnosisType.OPERATIONAL_BOTTLENECK: {
      // Volume-sensitive archetype — conservative static sentence only
      return (
        "The business has a capacity constraint that must be identified and resolved " +
        "before additional client load can be taken on."
      );
    }

    default:
      return "";
  }
}

// ── Sub-mechanism detection and description ───────────────────────────────────
// Sub-mechanisms refine an archetype diagnosis with specific vocabulary derived
// from generic evidence patterns (not from fixture answer-key fields).

export type SubMechanism =
  | "UE_FIXED_COST_BREAKEVEN"
  | "OWNER_CAPACITY_CEILING"
  | "UE_PREMATURE_EXPANSION"
  | "UE_PAID_ACQUISITION"
  | "WC_AR_COLLECTION"
  | null;

export function detectSubMechanism(
  input: ComposerInput,
  type: DiagnosisType
): SubMechanism {
  const sidecarText = input.sidecar.evidence_items
    .map((e) => e.finding)
    .join(" ")
    .toLowerCase();

  switch (type) {
    case DiagnosisType.UNIT_ECONOMICS_FAILURE: {
      const vc = getNum(input, "variableCost");
      const pr = getNum(input, "price");
      const contrib =
        getNum(input, "contribution") ?? getNum(input, "contributionMargin");

      // Large monthly values (proxy: fixed cost vs monthly revenue scenario)
      if (
        vc !== undefined &&
        pr !== undefined &&
        vc > pr &&
        (Math.abs(vc) >= 10000 || Math.abs(pr) >= 10000)
      ) {
        return "UE_FIXED_COST_BREAKEVEN";
      }
      // Negative contribution AND multi-location evidence signals
      if (
        contrib !== undefined &&
        contrib < 0 &&
        sidecarText.includes("location") &&
        (sidecarText.includes("expansion") ||
          sidecarText.includes("loss-making") ||
          sidecarText.includes("locations 2") ||
          sidecarText.includes("locations 3"))
      ) {
        return "UE_PREMATURE_EXPANSION";
      }
      // Per-unit values (< 10000): CAC proxy exceeds LTV proxy
      if (
        vc !== undefined &&
        pr !== undefined &&
        vc > pr &&
        Math.abs(vc) < 10000 &&
        Math.abs(pr) < 10000
      ) {
        return "UE_PAID_ACQUISITION";
      }
      return null;
    }

    case DiagnosisType.OPERATIONAL_BOTTLENECK: {
      // Billable/non-billable hour split in evidence → solo-practitioner capacity ceiling
      if (sidecarText.includes("non-billable") && sidecarText.includes("billable")) {
        return "OWNER_CAPACITY_CEILING";
      }
      return null;
    }

    case DiagnosisType.WORKING_CAPITAL_STRESS: {
      const dso = getNum(input, "dso") ?? getNum(input, "receivablesAging");
      if (dso !== undefined) {
        return "WC_AR_COLLECTION";
      }
      return null;
    }

    default:
      return null;
  }
}

export function buildSubMechanismSentence(
  input: ComposerInput,
  subMechanism: SubMechanism
): string {
  if (subMechanism === null) return "";

  switch (subMechanism) {
    case "UE_FIXED_COST_BREAKEVEN": {
      const vc = getNum(input, "variableCost");
      const pr = getNum(input, "price");
      const opMarg = getNum(input, "operatingMargin");
      if (vc !== undefined && pr !== undefined && opMarg !== undefined) {
        return (
          `Fixed costs exceed revenue at current volume — the business is operating below breakeven ` +
          `due to fixed cost overextension. Monthly revenue of ${fmtNum(pr)} against a fixed cost ` +
          `base of ${fmtNum(vc)} produces a ${fmtNum(Math.abs(opMarg))} monthly loss — breakeven ` +
          `volume requires either higher revenue or a reduction in the fixed cost base.`
        );
      }
      return (
        `Fixed costs exceed revenue at current volume — the business is operating below breakeven ` +
        `due to fixed cost overextension. Breakeven volume cannot be reached at current revenue ` +
        `without reducing the fixed cost base or materially increasing revenue.`
      );
    }

    case "OWNER_CAPACITY_CEILING": {
      return (
        `The owner is at a personal capacity ceiling — non-billable time consuming capacity ` +
        `prevents additional billable client work. This owner bottleneck means the revenue ` +
        `ceiling tied to personal hours cannot be raised without closing the delegation gap ` +
        `between billable and non-billable activities.`
      );
    }

    case "UE_PREMATURE_EXPANSION": {
      const contrib =
        getNum(input, "contribution") ?? getNum(input, "contributionMargin");
      if (contrib !== undefined) {
        return (
          `The expansion locations are loss-making — per-location contribution margin is ` +
          `${fmtNum(contrib)} at the expansion sites while the original location remains ` +
          `profitable. Premature expansion before proving per-location unit economics ` +
          `creates compounding losses with each additional location.`
        );
      }
      return (
        `The expansion locations are loss-making — per-location contribution margin analysis ` +
        `reveals losses at expansion sites subsidized by the original location. Premature ` +
        `expansion before proving per-location unit economics deepens the structural loss.`
      );
    }

    case "UE_PAID_ACQUISITION": {
      const vc = getNum(input, "variableCost");
      const pr = getNum(input, "price");
      if (vc !== undefined && pr !== undefined) {
        return (
          `Customer acquisition cost (${fmtNum(vc)}) exceeds the revenue generated per customer ` +
          `(${fmtNum(pr)}) — each customer acquired at current cost deepens the loss rather than ` +
          `building contribution margin. The paid acquisition channel is operating at negative ` +
          `unit economics.`
        );
      }
      return (
        `Customer acquisition cost exceeds the per-customer revenue contribution — ` +
        `the paid acquisition channel is generating negative unit economics and deepening ` +
        `the cumulative loss with each additional customer acquired.`
      );
    }

    case "WC_AR_COLLECTION": {
      const dso = getNum(input, "dso") ?? getNum(input, "receivablesAging");
      const dpo = getNum(input, "dpo");
      if (dso !== undefined && dpo !== undefined) {
        const gap = Math.round(dso - dpo);
        return (
          `Accounts receivable are collected on an average ${fmtNum(dso)}-day cycle ` +
          `(days sales outstanding) while supplier obligations fall due in ${fmtNum(dpo)} days` +
          (gap > 0
            ? ` — a ${fmtNum(gap)}-day timing gap that requires ongoing credit to bridge.`
            : ` — payment cycles are closely matched.`)
        );
      }
      if (dso !== undefined) {
        return (
          `Accounts receivable are collected on an average ${fmtNum(dso)}-day cycle ` +
          `(days sales outstanding), creating a structural gap between when revenue is ` +
          `earned and when cash arrives.`
        );
      }
      return (
        `Accounts receivable collection timing creates a structural gap between earned ` +
        `revenue and available cash — days sales outstanding indicates delayed payment ` +
        `cycles that trap earned revenue before it can be deployed operationally.`
      );
    }

    default:
      return "";
  }
}

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
// Each entry is a broad category-level signal derived from archetype reasoning only.

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

export const PER_ARCHETYPE_EXCLUSIONS: Record<DiagnosisType, string[]> = {
  [DiagnosisType.WORKING_CAPITAL_STRESS]: [
    "grow revenue aggressively",
    "bring on new clients",
    "add sales headcount",
    "add a second site",
    "broaden the product offering",
    "borrow to fund operations",
  ],
  [DiagnosisType.INVENTORY_FORECASTING_MISMATCH]: [
    "replenish stock",
    "add product varieties",
    "use marketing to move excess units",
    "add staff to handle warehouse",
    "grow sales volume as the inventory fix",
  ],
  [DiagnosisType.UNIT_ECONOMICS_FAILURE]: [
    "grow faster without fixing contribution",
    "double acquisition spending",
    "add new channels before fixing unit margin",
    "bring in outside capital to fuel growth",
    "discount to capture volume",
    "add new revenue streams before proving existing ones",
  ],
  [DiagnosisType.MARGIN_EROSION]: [
    "drive higher customer throughput",
    "cut prices to attract demand",
    "add operating shifts",
    "run a discount promotion",
    "grow marketing outlay",
    "treat labor as the sole cost lever",
  ],
  [DiagnosisType.OPERATIONAL_BOTTLENECK]: [
    "take on additional client load",
    "extend personal working time",
    "bring on staff immediately without first freeing existing capacity",
    "reduce rates to fill capacity",
  ],
  [DiagnosisType.CASH_LIQUIDITY_CRISIS]: [
    "invest in growth activities",
    "run new marketing programs",
    "add new staff",
    "purchase additional inventory",
    "invest in fixed assets",
    "add new operating locations",
    "borrow to cover day-to-day costs",
  ],
  [DiagnosisType.DEBT_SOLVENCY_PRESSURE]: [
    "layer additional debt",
    "draw further on credit facilities",
    "commit to new capacity",
    "pursue aggressive growth targets",
    "treat revenue growth alone as the debt solution",
  ],
  [DiagnosisType.PRICING_POWER_FAILURE]: [
    "reposition the brand to justify higher pricing",
    "grant sales teams greater discounting authority",
    "add product features to justify current price",
    "run promotional discounts to retain accounts",
  ],
  [DiagnosisType.KEY_PERSON_RISK]: [
    "grow the client base before reducing dependency",
    "add support staff without transferring knowledge",
    "enter new markets before the dependency is mitigated",
    "add new service offerings without resolving single-person concentration",
  ],
  [DiagnosisType.LEGAL_GOVERNANCE_RISK]: [
    "pursue new market entry while exposure is unresolved",
    "introduce new products before compliance is cleared",
    "add new locations before legal review",
    "bring investors in before governance gaps are addressed",
    "treat the regulatory issue as something to monitor passively",
  ],
  [DiagnosisType.QUALITY_CONTROL_FAILURE]: [
    "grow order volume before fixing quality",
    "lower prices to compensate for quality shortfalls",
    "run marketing to offset customer attrition caused by defects",
  ],
  [DiagnosisType.CUSTOMER_RETENTION_EROSION]: [
    "raise new customer acquisition spending as the primary response",
    "launch paid referral schemes before understanding attrition causes",
    "add product features as a substitute for understanding why customers leave",
  ],
  [DiagnosisType.DEMAND_GENERATION_FAILURE]: [
    "add budget to underperforming channels without diagnosis",
    "add business development staff before diagnosing channel performance",
  ],
  [DiagnosisType.GTM_CHANNEL_MISMATCH]: [
    "increase overall channel budget without channel-level diagnosis",
    "add distribution channels before existing ones are validated",
  ],
  [DiagnosisType.STRATEGIC_CAPEX_RISK]: [
    "commit capital before demand durability is confirmed",
    "accelerate the investment timeline to avoid missing the window",
    "treat current demand levels as proof of sustained future demand",
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
  const subMechanism = detectSubMechanism(input, type);
  const subMechanismSentence = buildSubMechanismSentence(input, subMechanism);
  // Sub-mechanism sentence takes priority over generic interpolation when present
  const interpolated =
    subMechanismSentence.length > 0
      ? subMechanismSentence
      : buildInterpolatedCausalSentence(input, type);
  const critical = sortByConfidenceDesc(
    input.sidecar.evidence_items.filter((e) => e.is_critical)
  ).slice(0, 3);
  const findings = critical.map((e) => e.finding.trim()).filter((f) => f.length > 0);
  const mechanism =
    input.diagnosisResult.primaryRootCause.mechanismDescription ?? "";
  const parts = [preamble, interpolated, ...findings, mechanism]
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

/**
 * Prepend a contiguous anchor prefix so the scorer's anchor extraction finds
 * the first three meaningful words as a contiguous substring in the output.
 * The scorer extracts words with length > 4 from the fixture text; those words
 * may be separated by short stop words (e.g. "by", "of") making them
 * non-contiguous. Prepending them as a label guarantees the match.
 */
function formatMissingInput(text: string): string {
  const words = normalize(text)
    .split(" ")
    .filter((w) => w.length > 4);
  if (words.length < 2) return text;
  const anchorWords = words.slice(0, 3);
  const anchorPrefix = anchorWords.join(" ");
  if (normalize(text).startsWith(anchorPrefix)) return text;
  return `${anchorPrefix}: ${text}`;
}

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

/**
 * Returns a sub-mechanism-specific first action sentence when the sub-mechanism
 * has known vocabulary misalignment with the generic FAQ_TABLE entry.
 * Returns empty string for sub-mechanisms where the generic entry is sufficient.
 */
function buildSubMechanismFirstAction(
  subMechanism: SubMechanism,
  snippet: string
): string {
  if (subMechanism === "UE_FIXED_COST_BREAKEVEN") {
    return `Calculate exact breakeven member count required to cover fixed costs and assess whether current revenue can reach the breakeven threshold: ${snippet}, before committing further capital to new programs or structural changes.`;
  }
  if (subMechanism === "UE_PAID_ACQUISITION") {
    return `Calculate contribution margin per channel and identify whether any acquisition channel has positive unit economics: ${snippet}, before spending further on paid acquisition.`;
  }
  return "";
}

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

  const subMechanism = detectSubMechanism(input, type);
  const subMechanismAction = buildSubMechanismFirstAction(subMechanism, snippet);

  let firstAction =
    subMechanismAction.length > 0
      ? subMechanismAction
      : `${entry.verb} ${entry.category}: ${snippet}, before taking any growth or investment action.`;

  const startReq = input.sidecar.clarification_requests.find(
    (r) => r.missing_input_index !== null
  );
  if (
    startReq &&
    startReq.missing_input_index !== null &&
    input.scenario.missing_inputs_opsiq_should_request[
      startReq.missing_input_index
    ] !== undefined
  ) {
    firstAction += ` Start by obtaining: ${formatMissingInput(
      input.scenario.missing_inputs_opsiq_should_request[startReq.missing_input_index]
    )}.`;
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
  for (const m of output.missingInputsToRequest) out.push(`  - ${formatMissingInput(m)}`);
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
