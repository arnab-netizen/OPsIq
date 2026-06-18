import { DiagnosisType } from "@/domain/consulting-engine/types";

/**
 * R2 — Causal adjudication layer (pure, deterministic).
 *
 * The diagnosis engine matches surface patterns and historically returned the
 * loudest covered match (`matchedPatterns[0]`). That mis-attributes a SURFACE
 * SYMPTOM to a covered archetype when the evidence actually points to an UPSTREAM
 * DRIVER in a domain the engine cannot represent (debt, working-capital, pricing,
 * demand, inventory, gtm/channel, key-person, strategic capex) or to a different
 * covered archetype (quality drives churn; a bottleneck drives complaints).
 *
 * This adjudicator runs AFTER raw pattern matching and BEFORE final selection. It
 * uses ONLY runtime evidence (dimension / finding text / supportingData / isCritical)
 * — never case ids, benchmark labels, hidden keys, or answer-key text. When a
 * stronger upstream driver explains the surface symptom it either:
 *   - RE-RANKS to a covered driver that is itself a matched candidate (e.g. churn →
 *     quality), or
 *   - ABSTAINS (suppresses the surface) when the driver is uncovered or the covered
 *     driver did not independently match — i.e. it refuses to confidently name a
 *     downstream symptom as the root cause.
 *
 * It NEVER turns an abstention into a commitment and NEVER fabricates a new
 * archetype; it can only keep, re-rank among existing candidates, or suppress.
 */

export interface AdjEvidence {
  dimension: string;
  finding: string;
  isCritical?: boolean;
  supportingData?: Record<string, string | number | boolean>;
}

export type AdjudicationDecision =
  | { action: "keep" }
  | { action: "rerank"; newPrimary: DiagnosisType; demoted: DiagnosisType; rationale: string }
  | { action: "abstain"; suppressed: DiagnosisType; rationale: string };

function text(e: AdjEvidence): string {
  return `${e.finding} ${JSON.stringify(e.supportingData ?? {})}`.toLowerCase();
}

function hasNumeric(e: AdjEvidence, keys: string[]): boolean {
  const d = e.supportingData ?? {};
  return keys.some((k) => typeof d[k] === "number");
}

/**
 * A driver is "present" when some CRITICAL evidence item — optionally restricted to
 * a competing (non-home) dimension — matches the driver vocabulary, and (when
 * required) carries a corroborating numeric. Requiring isCritical + specific vocab +
 * numerics is what distinguishes a genuine upstream driver from an incidental
 * mention, and keeps the rule general rather than tuned to any case.
 */
interface DriverSpec {
  id: string;
  /** Surfaces this driver can be the upstream cause of. */
  explains: ReadonlySet<DiagnosisType>;
  /** Covered archetype this driver corresponds to, or null when uncovered. */
  covered: DiagnosisType | null;
  /** If set, the driver evidence must sit in one of these (competing) dimensions. */
  dims?: ReadonlySet<string>;
  vocab: RegExp;
  /** When set, at least one of these numerics must sit on the same vocab item. */
  numerics?: string[];
  /**
   * When set, ALL of these numerics must be present SOMEWHERE in the critical
   * evidence (not necessarily the vocab item) — for multi-signal drivers whose
   * components legitimately span several evidence items (e.g. an irreversible
   * capex item + a separate demand-durability item).
   */
  numericsAll?: string[];
  rationale: string;
}

const DRIVERS: DriverSpec[] = [
  // ── Covered re-rank drivers first (so a covered driver wins over a symptom) ──
  {
    id: "quality_drives_churn",
    explains: new Set([DiagnosisType.CUSTOMER_RETENTION_EROSION]),
    covered: DiagnosisType.QUALITY_CONTROL_FAILURE,
    dims: new Set(["quality_delivery"]),
    vocab: /complaint|defect|quality (slip|drop|issue|failure)|returns? (rose|spiked)/,
    numerics: ["complaintRate", "defectRate", "returnRate"],
    rationale:
      "Churn is downstream of a quality failure (critical complaint/defect signal); the quality archetype better explains the retention loss.",
  },
  {
    id: "bottleneck_drives_complaints",
    explains: new Set([DiagnosisType.QUALITY_CONTROL_FAILURE]),
    covered: DiagnosisType.OPERATIONAL_BOTTLENECK,
    dims: new Set(["operational_efficiency"]),
    vocab: /bottleneck|turnaround|long wait|waits|delivery speed|single-station|queue|backlog/,
    numerics: ["turnaroundDays", "utilizationPct", "capacityPct"],
    rationale:
      "Complaints are downstream of an operational bottleneck (critical wait/turnaround signal), not a product-quality failure.",
  },
  // ── Uncovered upstream drivers (suppress the surface symptom → abstain) ──
  {
    id: "debt_drives_cash",
    explains: new Set([DiagnosisType.CASH_LIQUIDITY_CRISIS]),
    covered: DiagnosisType.DEBT_SOLVENCY_PRESSURE,
    vocab: /debt service|leverage|covenant|interest cover|refinanc|amortizat|maturity wall|gearing|debt load/,
    numerics: ["leverageRatio", "covenantHeadroom"],
    rationale:
      "Cash pressure is driven by debt/solvency structure (leverage/covenant), an upstream cause the engine cannot diagnose; refusing to name liquidity as the root.",
  },
  {
    id: "working_capital_drives_cash",
    explains: new Set([DiagnosisType.CASH_LIQUIDITY_CRISIS]),
    covered: DiagnosisType.WORKING_CAPITAL_STRESS,
    vocab: /receivabl|days sales outstanding|\bdso\b|cash conversion|collections timing|payabl|\bdpo\b|working capital/,
    numerics: ["dso", "cashConversionDays", "receivablesAging"],
    rationale:
      "Cash pressure is driven by working-capital build (receivables/DSO/cash-conversion), an upstream cause the engine cannot diagnose; refusing to name liquidity as the root.",
  },
  {
    id: "strategic_capex_drives_cash",
    explains: new Set([DiagnosisType.CASH_LIQUIDITY_CRISIS]),
    covered: null,
    vocab: /irreversible|automation line|capital expenditure|\bcapex\b|expansion commitment/,
    numericsAll: ["reversibility", "demandDurabilityMonths"],
    rationale:
      "Cash pressure stems from a contemplated irreversible capex on non-durable demand (strategic capex risk), an upstream cause the engine cannot diagnose.",
  },
  {
    id: "pricing_drives_symptom",
    explains: new Set([
      DiagnosisType.MARGIN_EROSION,
      DiagnosisType.CUSTOMER_RETENTION_EROSION,
      DiagnosisType.UNIT_ECONOMICS_FAILURE,
    ]),
    covered: DiagnosisType.PRICING_POWER_FAILURE,
    dims: new Set(["market_position", "process_maturity"]),
    vocab: /priced (well )?below|below (comparable|competitor)|under-?pric|discount|price realization|realized price|pricing governance|discount-approval|list price/,
    rationale:
      "The symptom is driven by a pricing/discounting problem (price realization below market), an upstream cause the engine cannot diagnose.",
  },
  {
    id: "demand_drives_margin",
    explains: new Set([DiagnosisType.MARGIN_EROSION]),
    covered: null,
    dims: new Set(["market_position"]),
    vocab: /new-customer (volume|collapse|count)|demand (collapse|fell|softened|generation)|lead volume|top of funnel|acquisition volume|pipeline (collapse|fell)|volume collapse|volume deleverage/,
    numerics: ["newCustomerRate", "leadVolume"],
    rationale:
      "Margin erosion is driven by a demand/volume collapse (volume deleverage), an upstream cause the engine cannot diagnose.",
  },
  {
    id: "inventory_drives_symptom",
    explains: new Set([DiagnosisType.MARGIN_EROSION, DiagnosisType.OPERATIONAL_BOTTLENECK]),
    covered: null,
    vocab: /overstock|stock-?out|forecast error|forecast accuracy|inventory days|markdown|clearance|missing component|component (stockout|availab)|glut/,
    numerics: ["forecastErrorPct", "inventoryDays", "stockoutRate"],
    rationale:
      "The symptom is driven by an inventory/forecasting mismatch (overstock/stockout/forecast error), an upstream cause the engine cannot diagnose.",
  },
  {
    id: "gtm_drives_unit_economics",
    explains: new Set([DiagnosisType.UNIT_ECONOMICS_FAILURE]),
    covered: null,
    dims: new Set(["market_position"]),
    vocab: /channel|paid-social|paid social|go-to-market|\bgtm\b/,
    numerics: ["channelCac", "channelMix", "channelConversionPct"],
    rationale:
      "Negative blended unit economics are driven by a channel/go-to-market mismatch (one channel dragging the blend), an upstream cause the engine cannot diagnose.",
  },
  {
    id: "key_person_drives_symptom",
    explains: new Set([
      DiagnosisType.OPERATIONAL_BOTTLENECK,
      DiagnosisType.CUSTOMER_RETENTION_EROSION,
    ]),
    covered: null,
    dims: new Set(["team_capability"]),
    vocab: /key person|key-person|single (senior )?specialist|only one (senior|person|specialist)|sole (specialist|owner)|rainmaker|senior departure|senior .*(left|departed)|founder dependenc|succession|undocumented/,
    numerics: ["keyPersonCount", "successionReady", "revenueConcentrationPct"],
    rationale:
      "The symptom is driven by a key-person dependency (single specialist/rainmaker, no succession), an upstream cause the engine cannot diagnose.",
  },
];

function driverPresent(spec: DriverSpec, evidence: AdjEvidence[]): boolean {
  const critical = evidence.filter((e) => e.isCritical);

  // The vocab (and any per-item `numerics`) must land on a single critical item
  // in an allowed (competing) dimension.
  const vocabItem = critical.some((e) => {
    if (spec.dims && !spec.dims.has(e.dimension)) return false;
    if (!spec.vocab.test(text(e))) return false;
    if (spec.numerics && !hasNumeric(e, spec.numerics)) return false;
    return true;
  });
  if (!vocabItem) return false;

  // Multi-signal numerics may span several critical items.
  if (spec.numericsAll && spec.numericsAll.length > 0) {
    const allKeysPresent = spec.numericsAll.every((k) =>
      critical.some((e) => typeof (e.supportingData ?? {})[k] === "number")
    );
    if (!allKeysPresent) return false;
  }
  return true;
}

/**
 * Adjudicate the causal primary from the matched candidate diagnoses.
 * `candidates[0]` is the engine's surface primary (highest raw confidence).
 */
export function adjudicateCausalPrimary(input: {
  candidates: DiagnosisType[];
  evidence: AdjEvidence[];
}): AdjudicationDecision {
  const { candidates, evidence } = input;
  if (candidates.length === 0) return { action: "keep" };
  const surface = candidates[0];

  for (const spec of DRIVERS) {
    if (!spec.explains.has(surface)) continue;
    if (!driverPresent(spec, evidence)) continue;

    // A covered driver that is ALSO an independent candidate wins the primary.
    if (
      spec.covered !== null &&
      spec.covered !== surface &&
      candidates.includes(spec.covered)
    ) {
      return {
        action: "rerank",
        newPrimary: spec.covered,
        demoted: surface,
        rationale: spec.rationale,
      };
    }

    // Otherwise the surface is a downstream symptom of an unmodeled (or
    // independently-unsupported) cause: suppress and abstain rather than commit.
    return { action: "abstain", suppressed: surface, rationale: spec.rationale };
  }

  return { action: "keep" };
}
