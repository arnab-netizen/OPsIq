import type { EvidenceItem, RootCause } from "@/domain/consulting-engine/types";
import {
  DiagnosisConfidence,
  ConfidenceLevel,
  DiagnosisType,
} from "@/domain/consulting-engine/types";
import { v4 as uuidv4 } from "uuid";
import { adjudicateCausalPrimary, type AdjEvidence } from "./causal-adjudication";

/**
 * Diagnosis Engine: Identifies root causes using pattern matching on evidence
 *
 * Never presents inference as fact. Always returns a confidence level that
 * reflects evidence completeness.
 *
 * Deterministic: no external calls, pure function.
 */

interface RootCausePattern {
  name: string;
  pattern: (evidence: EvidenceItem[]) => boolean;
  confidence: (evidence: EvidenceItem[]) => DiagnosisConfidence;
  diagnosis: (evidence: EvidenceItem[]) => RootCause;
}

const rootCausePatterns: RootCausePattern[] = [
  {
    name: "Operational Bottleneck",
    pattern: (evidence) =>
      evidence.some((e) => op_isBottleneckSignal(e)) &&
      evidence.some(
        (e) =>
          e.dimension === "customer_retention" &&
          (e.finding.toLowerCase().includes("low repeat") ||
            e.finding.toLowerCase().includes("defect"))
      ),
    confidence: (evidence) => {
      const efficiencyEvidence = evidence.filter(
        (e) => e.dimension === "operational_efficiency"
      );
      const retentionEvidence = evidence.filter(
        (e) => e.dimension === "customer_retention"
      );
      const highConfidenceEfficiency = efficiencyEvidence.filter(
        (e) => e.confidence === ConfidenceLevel.HIGH
      ).length;
      const highConfidenceRetention = retentionEvidence.filter(
        (e) => e.confidence === ConfidenceLevel.HIGH
      ).length;

      if (
        highConfidenceEfficiency >= 1 &&
        highConfidenceRetention >= 1
      ) {
        return DiagnosisConfidence.HIGH;
      } else if (efficiencyEvidence.length >= 1 && retentionEvidence.length >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.PROVISIONAL;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.OPERATIONAL_BOTTLENECK,
      description:
        "Operational bottleneck limiting speed of service delivery",
      mechanismDescription:
        "High turnaround time prevents customers from using service frequently, driving them to alternatives. Bottleneck creates queue, which increases errors and complaints.",
      evidenceIds: evidence
        .filter(
          (e) =>
            e.dimension === "operational_efficiency" ||
            e.dimension === "customer_retention"
        )
        .map((e) => e.id),
      confidence: DiagnosisConfidence.HIGH,
      alternativeExplanations: [
        "Pricing may be too high relative to speed",
        "Marketing may not communicate speed differentiation",
      ],
      missingEvidenceFor: [
        "Root cause of turnaround delay (equipment vs labor vs process)",
        "Customer awareness of speed-to-market from competitors",
      ],
    }),
  },
  {
    name: "Quality Control Failure",
    pattern: (evidence) =>
      evidence.some((e) => qual_isQualityFailure(e)) &&
      !evidence.some(
        (e) =>
          e.dimension === "process_maturity" &&
          (e.finding.toLowerCase().includes("quality") ||
            e.finding.toLowerCase().includes("check") ||
            e.finding.toLowerCase().includes("standard"))
      ),
    confidence: (evidence) => {
      const qualityCount = evidence.filter(
        (e) => e.dimension === "quality_delivery" && e.isCritical
      ).length;
      const processCount = evidence.filter(
        (e) => e.dimension === "process_maturity"
      ).length;

      if (qualityCount >= 2 && processCount === 0) {
        return DiagnosisConfidence.HIGH;
      } else if (qualityCount >= 1 && processCount === 0) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.INSUFFICIENT_EVIDENCE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.QUALITY_CONTROL_FAILURE,
      description:
        "Absence of quality control process or quality assurance checkpoints",
      mechanismDescription:
        "Without QA checkpoints, defects reach customers. Each complaint damages reputation and reduces repeat business.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "quality_delivery")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Quality standard may be poorly communicated to team",
        "Team may lack skills to meet quality standard",
      ],
      missingEvidenceFor: [
        "What specifically is wrong with quality (consistency, defect rate, etc)",
        "Team awareness of quality standard",
        "Root cause of quality issues (skills, materials, process)",
      ],
    }),
  },
  {
    name: "Customer Retention Erosion",
    pattern: (evidence) =>
      evidence.some((e) => ret_isRetentionErosion(e)),
    confidence: (evidence) => {
      const retentionCount = evidence.filter(
        (e) => e.dimension === "customer_retention" && e.isCritical
      ).length;
      const highConfidence = evidence.filter(
        (e) =>
          e.dimension === "customer_retention" &&
          e.confidence === ConfidenceLevel.HIGH
      ).length;

      if (retentionCount >= 2 && highConfidence >= 1) {
        return DiagnosisConfidence.HIGH;
      } else if (retentionCount >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.PROVISIONAL;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.CUSTOMER_RETENTION_EROSION,
      description: "No systematic customer retention mechanism",
      mechanismDescription:
        "Without follow-up, loyalty program, or service innovation, customers default to shopping for best price on each transaction.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "customer_retention")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Competitors may offer better value",
        "Service may not meet customer needs",
      ],
      missingEvidenceFor: [
        "Customer satisfaction score",
        "Reasons customers don't return",
        "Competitor analysis",
      ],
    }),
  },
  // ─── E1: Financial-health archetypes ──────────────────────────────────────
  // Trigger ONLY on clear financial-distress signals (text or numeric). Generic
  // financial evidence ("performance challenge") must NOT trigger — those remain
  // abstentions (INSUFFICIENT_MODEL_COVERAGE). First actions are low-cost and
  // reversible (see intervention-design-engine).
  {
    name: "Cash / Liquidity Crisis",
    pattern: (evidence) => evidence.some((e) => fin_isLiquidityCrisis(e)),
    confidence: (evidence) => {
      const sev = evidence.filter((e) => fin_isLiquidityCrisis(e));
      const hard = sev.some(
        (e) =>
          fin_text(e).match(/out of cash|cannot make payroll|missed payroll|insolven/) ||
          fin_runwayMonths(e) !== undefined && (fin_runwayMonths(e) as number) <= 3
      );
      if (hard) return DiagnosisConfidence.HIGH;
      return DiagnosisConfidence.MODERATE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.CASH_LIQUIDITY_CRISIS,
      description: "Cash runway / liquidity under acute pressure",
      mechanismDescription:
        "Cash outflows are outpacing inflows and available runway is short, threatening the ability to meet near-term obligations.",
      evidenceIds: evidence.filter((e) => e.dimension === "financial_health").map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "One-off timing of payments rather than structural burn",
        "Undrawn financing available that offsets the shortfall",
      ],
      missingEvidenceFor: [
        "13-week cash flow detail",
        "Committed vs discretionary obligations",
        "Available financing headroom",
      ],
    }),
  },
  {
    name: "Unit Economics Failure",
    pattern: (evidence) => evidence.some((e) => fin_isUnitEconomicsFailure(e)),
    confidence: (evidence) => {
      const numeric = evidence.some(
        (e) =>
          e.dimension === "financial_health" &&
          (fin_num(e, "contribution") !== undefined && (fin_num(e, "contribution") as number) < 0 ||
            fin_num(e, "contributionMargin") !== undefined && (fin_num(e, "contributionMargin") as number) < 0 ||
            (fin_num(e, "variableCost") !== undefined && fin_num(e, "price") !== undefined &&
              (fin_num(e, "variableCost") as number) > (fin_num(e, "price") as number)))
      );
      return numeric ? DiagnosisConfidence.HIGH : DiagnosisConfidence.MODERATE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.UNIT_ECONOMICS_FAILURE,
      description: "Per-unit / per-customer economics are unprofitable",
      mechanismDescription:
        "Contribution margin is negative or acquisition cost exceeds customer value, so growth deepens losses rather than building value.",
      evidenceIds: evidence.filter((e) => e.dimension === "financial_health").map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Blended margin masks a profitable core cohort",
        "Temporary launch-phase costs not representative of steady state",
      ],
      missingEvidenceFor: [
        "Cohort-level contribution margin",
        "CAC payback period",
        "Variable vs fixed cost split",
      ],
    }),
  },
  {
    name: "Margin Erosion / Cost Inflation",
    pattern: (evidence) => evidence.some((e) => fin_isMarginErosion(e)),
    confidence: (evidence) => {
      const numeric = evidence.some(
        (e) =>
          e.dimension === "financial_health" &&
          ((fin_num(e, "profitChangePercent") !== undefined && (fin_num(e, "profitChangePercent") as number) < 0) ||
            (fin_num(e, "marginPct") !== undefined && (fin_num(e, "marginPct") as number) < 0) ||
            (fin_num(e, "operatingMargin") !== undefined && (fin_num(e, "operatingMargin") as number) < 0))
      );
      return numeric ? DiagnosisConfidence.HIGH : DiagnosisConfidence.MODERATE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.MARGIN_EROSION,
      description: "Margin erosion driven by cost inflation or declining profitability",
      mechanismDescription:
        "Costs are rising faster than price, or operating profitability is declining, compressing margin over time.",
      evidenceIds: evidence.filter((e) => e.dimension === "financial_health").map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "A one-off cost event rather than a sustained trend",
        "Deliberate margin investment for growth",
      ],
      missingEvidenceFor: [
        "Multi-period margin trend",
        "Cost-driver decomposition (COGS vs labor vs overhead)",
        "Pricing headroom",
      ],
    }),
  },
  // ─── E2 slice 1: financial-structural archetypes (debt / WC / pricing) ──────
  // Each triggers ONLY on strong, specific, adverse structural evidence so generic
  // cash/revenue/margin pressure does NOT become one of these diagnoses.
  {
    name: "Debt / Solvency Pressure",
    pattern: (evidence) => evidence.some((e) => fin_isDebtSolvency(e)),
    confidence: (evidence) => {
      const sev = evidence.some(
        (e) =>
          fin_isDebtSolvency(e) &&
          ((fin_num(e, "covenantHeadroom") !== undefined && (fin_num(e, "covenantHeadroom") as number) <= 0.06) ||
            (fin_num(e, "interestCoverage") !== undefined && (fin_num(e, "interestCoverage") as number) <= 1.3) ||
            (fin_num(e, "leverageRatio") !== undefined && (fin_num(e, "leverageRatio") as number) >= 4))
      );
      return sev ? DiagnosisConfidence.HIGH : DiagnosisConfidence.MODERATE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.DEBT_SOLVENCY_PRESSURE,
      description: "Debt / solvency pressure from leverage, covenant, or maturity structure",
      mechanismDescription:
        "The cash drain is balance-sheet structural — leverage, covenant headroom, interest burden, or a maturity wall — rather than an operating cash problem.",
      evidenceIds: evidence.filter((e) => e.dimension === "financial_health").map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "A timing issue on operating cash rather than debt structure",
        "Refinancing already secured that relieves the maturity",
      ],
      missingEvidenceFor: [
        "Full debt schedule and covenant test dates",
        "Lender appetite for refinancing/waiver",
      ],
    }),
  },
  {
    name: "Working Capital Stress",
    pattern: (evidence) => evidence.some((e) => fin_isWorkingCapital(e)),
    confidence: (evidence) => {
      const sev = evidence.some(
        (e) =>
          fin_isWorkingCapital(e) &&
          (fin_num(e, "cashConversionDays") !== undefined || (fin_num(e, "dso") !== undefined && (fin_num(e, "dso") as number) >= 70))
      );
      return sev ? DiagnosisConfidence.HIGH : DiagnosisConfidence.MODERATE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.WORKING_CAPITAL_STRESS,
      description: "Working-capital stress from receivables / payables / cash-conversion cycle",
      mechanismDescription:
        "Cash is trapped in the working-capital cycle — stretched receivables (DSO), payables timing, or a lengthening cash-conversion cycle — not an operating loss.",
      evidenceIds: evidence.filter((e) => e.dimension === "financial_health").map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "A one-off large receivable rather than a structural cycle problem",
        "Seasonal build that unwinds without intervention",
      ],
      missingEvidenceFor: [
        "Receivables aging by customer segment",
        "Payables terms and supplier flexibility",
      ],
    }),
  },
  {
    name: "Pricing Power Failure",
    pattern: (evidence) => evidence.some((e) => fin_isPricingPower(e)),
    confidence: (evidence) => {
      const sev = evidence.some(
        (e) =>
          fin_isPricingPower(e) &&
          (fin_num(e, "discountPct") !== undefined && (fin_num(e, "discountPct") as number) >= 15)
      );
      return sev ? DiagnosisConfidence.HIGH : DiagnosisConfidence.MODERATE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.PRICING_POWER_FAILURE,
      description: "Pricing power failure from under-pricing, discount leakage, or price realization gap",
      mechanismDescription:
        "Realized price sits below comparable competitors or below list through uncontrolled discounting; the gap is price realization, not cost.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "market_position" || e.dimension === "financial_health")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "A deliberate penetration-pricing strategy",
        "Mix shift rather than a price-realization gap",
      ],
      missingEvidenceFor: [
        "Win/loss price-sensitivity by segment",
        "Discount-approval governance and leakage by rep",
      ],
    }),
  },
];

// ─── R1 lexical-trigger hardening: semantic guards ────────────────────────────
// A distress trigger must rest on (a) an adverse NUMERIC, (b) an inherently
// adverse "HARD" phrase, or (c) a topic term carrying adverse DIRECTIONALITY and
// NOT dominated by positive/benign framing. This replaces the prior bare-substring
// triggers (e.g. "runway" firing on "long reserve runway"). No thresholds, answer
// keys, case ids, or numeric cutoffs are changed — only the textual matchers are
// made polarity-aware. The numeric paths (runway ≤ 6, contribution < 0, margin < 0)
// are preserved exactly and always license the trigger (hard numbers win).
function fin_text(e: EvidenceItem): string {
  return `${e.finding} ${JSON.stringify(e.supportingData ?? {})}`.toLowerCase();
}
function fin_num(e: EvidenceItem, key: string): number | undefined {
  const v = (e.supportingData ?? {})[key];
  return typeof v === "number" ? v : undefined;
}
function fin_runwayMonths(e: EvidenceItem): number | undefined {
  return fin_num(e, "cashRunwayMonths") ?? fin_num(e, "runwayMonths");
}

/**
 * Positive / benign framing that SUPPRESSES a soft distress trigger. Only words
 * that are unambiguously favorable for the metric in question — deliberately
 * excludes polarity-ambiguous words ("low", "down", "rising") that flip meaning
 * between costs and revenue.
 */
const POSITIVE_FRAMING =
  /\b(healthy|strong|robust|comfortabl\w*|ample|plenti\w*|plenty|long|lengthy|extended|generous|solid|stable|steady|improv\w*|expand\w*|expanded|grew|growing|grown|surplus|well[- ]?capitali[sz]ed|well[- ]?funded|well[- ]?covered|positive|profitabl\w*|favou?rabl\w*|reassur\w*|on track|on target|above target|ahead of target|no (?:concern|issue|problem|risk)|not (?:a |an |the )?(?:concern|issue|problem)|not the (?:issue|problem|underlying))\b/;

/**
 * Adverse directionality / risk language that LICENSES a soft distress trigger.
 * Unambiguous adverse direction only (no bare "low"/"down"/"rising" — those are
 * handled by metric-specific HARD phrases where polarity is clear).
 */
const ADVERSE_FRAMING =
  /\b(fell|fall\w*|declin\w*|drop\w*|dropped|shrank|shrink\w*|short(?:fall|ening)?|\bmiss(?:ed|es|ing)?\b|negativ\w*|loss\w*|losing|crunch|shortage|deplet\w*|tighten\w*|\bthin\b|eros\w*|erod\w*|deteriorat\w*|worsen\w*|spik\w*|surg\w*|doubl\w*|tripl\w*|breach\w*|insolven\w*|cannot|unable|out of (?:cash|stock|money)|at risk|critical|sever\w*|acute|distress\w*|overrun|overdue|past due|falling behind|behind target|exceed\w*)\b/;

/** Soft-trigger combinator: topic-relevant adverse signal without positive override. */
function softDistress(t: string, topic: RegExp): boolean {
  if (!topic.test(t)) return false;
  return ADVERSE_FRAMING.test(t) && !POSITIVE_FRAMING.test(t);
}

const LIQUIDITY_HARD =
  /out of cash|cannot make payroll|missed payroll|cannot meet payroll|cash crunch|cash shortfall|liquidity crisis|burning (?:through )?cash|insolven/;
// Soft topic deliberately NARROW — only terms whose distress polarity is decided
// by the adverse gate. Bare "cash"/"reserve" are EXCLUDED: they appear in benign
// ("healthy cash reserve") and non-liquidity ("operating cash flow", "cannot
// supply cash-flow figures") findings, so admitting them re-introduces the very
// false positives R1 removes. Hard phrases (cash crunch/out of cash/…) and the
// runway numeric still cover genuine cash distress.
const LIQUIDITY_TOPIC = /runway|liquidity|burn rate/;
function fin_isLiquidityCrisis(e: EvidenceItem): boolean {
  if (e.dimension !== "financial_health") return false;
  const t = fin_text(e);
  const r = fin_runwayMonths(e);
  if (r !== undefined && r <= 6) return true; // adverse numeric (existing threshold)
  if (LIQUIDITY_HARD.test(t)) return true; // inherently adverse phrasing
  return softDistress(t, LIQUIDITY_TOPIC); // topic + adverse direction, not positive
}

const UNITECON_HARD =
  /negative contribution|negative unit|unprofitabl\w*|loss per unit|loss-making|cac exceeds|cac\s*>\s*ltv|ltv\s*<\s*cac|ltv below cac|payback too long|burning (?:money )?on each|lose money on each|upside[- ]?down unit/;
const UNITECON_TOPIC = /contribution|unit econom|\bcac\b|payback|ltv|per[- ]?(?:unit|customer|subscriber|member) econ/;
function fin_isUnitEconomicsFailure(e: EvidenceItem): boolean {
  if (e.dimension !== "financial_health") return false;
  const t = fin_text(e);
  const contrib = fin_num(e, "contribution") ?? fin_num(e, "contributionMargin") ?? fin_num(e, "contributionPerMember");
  const price = fin_num(e, "price");
  const vc = fin_num(e, "variableCost");
  if ((contrib !== undefined && contrib < 0) || (price !== undefined && vc !== undefined && vc > price)) {
    return true; // adverse numeric
  }
  if (UNITECON_HARD.test(t)) return true;
  return softDistress(t, UNITECON_TOPIC);
}

const MARGIN_HARD =
  /margin eros\w*|margin declin\w*|declining margin|compress\w* margin|margin compress\w*|negative operating margin|operating loss|profit (?:down|declin\w*|fell|fall\w*)|cost inflation|cogs rising|rising (?:input )?costs|input costs? (?:rose|rising|climb\w*|up\b)|gross margin (?:fell|declin\w*|compress\w*|eroded)/;
const MARGIN_TOPIC = /margin|cogs|gross profit|operating profit|overhead|input cost/;
function fin_isMarginErosion(e: EvidenceItem): boolean {
  if (e.dimension !== "financial_health") return false;
  const t = fin_text(e);
  const pcp = fin_num(e, "profitChangePercent");
  const mp = fin_num(e, "marginPct");
  const om = fin_num(e, "operatingMargin");
  if ((pcp !== undefined && pcp < 0) || (mp !== undefined && mp < 0) || (om !== undefined && om < 0)) {
    return true; // adverse numeric
  }
  if (MARGIN_HARD.test(t)) return true;
  return softDistress(t, MARGIN_TOPIC);
}

// Operational / quality / retention families: dimension + isCritical already gate
// these patterns. R1 adds positive-framing suppression so a critical-flagged but
// positively-worded finding cannot fabricate distress, without otherwise changing
// what fires (isCritical remains the analyst's adverse signal).
const OPERATIONAL_TOPIC =
  /turnaround|slow|capacity|delay|utiliz\w*|utilis\w*|backlog|throughput|queue|bottleneck|lead time|wait|cycle time/;
function op_isBottleneckSignal(e: EvidenceItem): boolean {
  if (e.dimension !== "operational_efficiency" || !e.isCritical) return false;
  const t = fin_text(e);
  if (!OPERATIONAL_TOPIC.test(t)) return false;
  return !POSITIVE_FRAMING.test(t);
}

const QUALITY_TOPIC = /complaint|defect|\bsla\b|\bnps\b|return rate|recall|quality issue|fault|reject|rework|escalation/;
const QUALITY_SEVERE = /sever\w*|critical|acute|doubl\w*|tripl\w*|surg\w*|spik\w*|recall|breach\w*|safety|soar\w*|rose|rising|climb\w*|mount\w*/;
function qual_isQualityFailure(e: EvidenceItem): boolean {
  if (e.dimension !== "quality_delivery" || !e.isCritical) return false;
  const t = fin_text(e);
  if (!QUALITY_TOPIC.test(t)) return false;
  if (QUALITY_SEVERE.test(t)) return true; // severe/critical complaints fire regardless
  return !POSITIVE_FRAMING.test(t);
}

const RETENTION_TOPIC = /low repeat|one-time|one time|churn/;
function ret_isRetentionErosion(e: EvidenceItem): boolean {
  if (e.dimension !== "customer_retention" || !e.isCritical) return false;
  const t = fin_text(e);
  if (!RETENTION_TOPIC.test(t)) return false;
  return !POSITIVE_FRAMING.test(t);
}

// ─── E2 slice 1 financial-structural triggers (strict; specific evidence only) ─
const DEBT_TEXT = /covenant|leverage|interest cover|refinanc|maturity|debt service|debt-service|gearing|solvency|debt load|payables.*due|short-term (debt|facility)/;
function fin_isDebtSolvency(e: EvidenceItem): boolean {
  if (e.dimension !== "financial_health") return false;
  const t = fin_text(e);
  const numeric =
    fin_num(e, "leverageRatio") !== undefined ||
    fin_num(e, "covenantHeadroom") !== undefined ||
    fin_num(e, "interestCoverage") !== undefined;
  // Require debt-structural vocabulary; a corroborating structural numeric or an
  // explicit covenant/maturity phrase. Generic cash pressure has neither.
  return DEBT_TEXT.test(t) && (numeric || /covenant|maturity|debt service|debt-service|refinanc/.test(t));
}

const WC_TEXT = /receivabl|days sales outstanding|\bdso\b|cash conversion|days payable|\bdpo\b|working capital|cash[- ]conversion cycle|collections (timing|cycle)/;
function fin_isWorkingCapital(e: EvidenceItem): boolean {
  if (e.dimension !== "financial_health") return false;
  const t = fin_text(e);
  const numeric =
    fin_num(e, "dso") !== undefined ||
    fin_num(e, "cashConversionDays") !== undefined ||
    (fin_num(e, "receivablesAging") !== undefined && fin_num(e, "dpo") !== undefined);
  // Require AR/AP/CCC vocabulary AND a working-capital numeric (DSO / cash-conversion
  // / receivables+payables). Generic "collections slowed" (no DSO/CCC) does NOT fire.
  return WC_TEXT.test(t) && numeric;
}

const PRICING_TEXT = /priced (well )?below|below (comparable|competitor)|under-?pric|self-inflicted discount|discount (granted|reached|leakage)|realized price.*below|discount.*freely|no pricing governance|no discount-approval|price realization/;
function fin_isPricingPower(e: EvidenceItem): boolean {
  if (e.dimension !== "market_position" && e.dimension !== "process_maturity") return false;
  const t = fin_text(e);
  if (!PRICING_TEXT.test(t)) return false;
  // Corroborate with a discount/price-realization numeric where present; the strict
  // adverse vocabulary above already excludes "pricing headroom" opportunity framing.
  const numeric =
    fin_num(e, "discountPct") !== undefined ||
    (fin_num(e, "realizedPrice") !== undefined && fin_num(e, "listPrice") !== undefined &&
      (fin_num(e, "realizedPrice") as number) < (fin_num(e, "listPrice") as number));
  return numeric || /priced (well )?below|below (comparable|competitor)|self-inflicted discount|no pricing governance|no discount-approval/.test(t);
}

export interface DiagnosisResult {
  primaryRootCause: RootCause;
  alternativeRootCauses: RootCause[];
  confidence: DiagnosisConfidence;
  readinessForIntervention: "READY" | "PROVISIONAL" | "BLOCKED";
  warningFlags: string[];
}

export function diagnoseRootCause(
  evidence: EvidenceItem[],
  businessProblem: string
): DiagnosisResult {
  const matchedPatterns: {
    pattern: RootCausePattern;
    confidence: DiagnosisConfidence;
  }[] = [];

  for (const pattern of rootCausePatterns) {
    if (pattern.pattern(evidence)) {
      matchedPatterns.push({
        pattern,
        confidence: pattern.confidence(evidence),
      });
    }
  }

  // Sort by confidence descending
  matchedPatterns.sort((a, b) => {
    const confidenceOrder = {
      [DiagnosisConfidence.DEFINITIVE]: 5,
      [DiagnosisConfidence.HIGH]: 4,
      [DiagnosisConfidence.MODERATE]: 3,
      [DiagnosisConfidence.PROVISIONAL]: 2,
      [DiagnosisConfidence.INSUFFICIENT_EVIDENCE]: 1,
    };
    return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
  });

  if (matchedPatterns.length === 0) {
    // Return a generic insufficient evidence diagnosis
    return {
      primaryRootCause: {
        id: uuidv4(),
        type: DiagnosisType.UNKNOWN,
        description: "Evidence insufficient for definitive diagnosis",
        mechanismDescription:
          "The evidence provided does not clearly match known root cause patterns.",
        evidenceIds: evidence.map((e) => e.id),
        confidence: DiagnosisConfidence.INSUFFICIENT_EVIDENCE,
        alternativeExplanations: [
          "Multiple root causes may be present",
          "Root cause may be unique to this business",
        ],
        missingEvidenceFor: [
          "Deeper investigation required on each dimension",
          "Customer interviews",
          "Process observation",
        ],
      },
      alternativeRootCauses: [],
      confidence: DiagnosisConfidence.INSUFFICIENT_EVIDENCE,
      readinessForIntervention: "BLOCKED",
      warningFlags: [
        "Cannot proceed with confident diagnosis. Additional investigation required.",
      ],
    };
  }

  // ── R2 causal adjudication: re-attribute a surface symptom to its upstream
  // driver before final selection. Pure; uses only runtime evidence (no keys).
  const candidateTypes = matchedPatterns.map((m) => m.pattern.diagnosis(evidence).type);
  const adjEvidence: AdjEvidence[] = evidence.map((e) => ({
    dimension: e.dimension,
    finding: e.finding,
    isCritical: e.isCritical,
    supportingData: e.supportingData,
  }));
  const adjudication = adjudicateCausalPrimary({ candidates: candidateTypes, evidence: adjEvidence });

  if (adjudication.action === "abstain") {
    return {
      primaryRootCause: {
        id: uuidv4(),
        type: DiagnosisType.UNKNOWN,
        description: "Surface symptom suppressed; root cause is upstream and unmodeled",
        mechanismDescription:
          "Causal adjudication found a stronger upstream driver that explains the matched surface symptom; the engine refuses to name the downstream symptom as the root cause.",
        evidenceIds: evidence.map((e) => e.id),
        confidence: DiagnosisConfidence.INSUFFICIENT_EVIDENCE,
        alternativeExplanations: [
          `Suppressed surface diagnosis: ${adjudication.suppressed}`,
          adjudication.rationale,
        ],
        missingEvidenceFor: [
          "An archetype for the upstream driver (out of current model coverage)",
          "Confirmation the surface symptom is not independently the root cause",
        ],
      },
      alternativeRootCauses: [],
      confidence: DiagnosisConfidence.INSUFFICIENT_EVIDENCE,
      readinessForIntervention: "BLOCKED",
      warningFlags: [
        `Causal adjudication: abstained — ${adjudication.rationale}`,
        `Raw matched candidates: ${candidateTypes.join(", ")}`,
      ],
    };
  }

  if (adjudication.action === "rerank") {
    const idx = matchedPatterns.findIndex(
      (m) => m.pattern.diagnosis(evidence).type === adjudication.newPrimary
    );
    if (idx > 0) {
      const [chosen] = matchedPatterns.splice(idx, 1);
      matchedPatterns.unshift(chosen);
    }
  }

  const primary = matchedPatterns[0].pattern.diagnosis(evidence);
  (primary as any).confidence = matchedPatterns[0].confidence;

  const alternatives = matchedPatterns.slice(1).map((m) => {
    const diagnosis = m.pattern.diagnosis(evidence);
    (diagnosis as any).confidence = m.confidence;
    return diagnosis;
  });

  const warningFlags: string[] = [];
  if (adjudication.action === "rerank") {
    warningFlags.push(
      `Causal adjudication: re-ranked to ${adjudication.newPrimary} over surface ${adjudication.demoted} — ${adjudication.rationale}`
    );
  }
  if (matchedPatterns[0].confidence === DiagnosisConfidence.PROVISIONAL) {
    warningFlags.push(
      "Diagnosis confidence is PROVISIONAL. Recommend deeper investigation before major intervention."
    );
  }
  if (matchedPatterns[0].confidence === DiagnosisConfidence.INSUFFICIENT_EVIDENCE) {
    warningFlags.push(
      "Insufficient evidence. Root cause diagnosis cannot proceed."
    );
  }

  const readiness =
    matchedPatterns[0].confidence === DiagnosisConfidence.INSUFFICIENT_EVIDENCE
      ? "BLOCKED"
      : matchedPatterns[0].confidence === DiagnosisConfidence.PROVISIONAL
        ? "PROVISIONAL"
        : "READY";

  return {
    primaryRootCause: primary,
    alternativeRootCauses: alternatives,
    confidence: matchedPatterns[0].confidence,
    readinessForIntervention: readiness,
    warningFlags,
  };
}

export function formatDiagnosis(result: DiagnosisResult): string {
  const lines: string[] = [];
  lines.push(`PRIMARY ROOT CAUSE TYPE: ${result.primaryRootCause.type}`);
  lines.push(`Description: ${result.primaryRootCause.description}`);
  lines.push(`Confidence: ${result.confidence}`);
  lines.push(`Mechanism: ${result.primaryRootCause.mechanismDescription}`);

  if (result.primaryRootCause.alternativeExplanations && result.primaryRootCause.alternativeExplanations.length > 0) {
    lines.push(`\nAlternative explanations:`);
    for (const alt of result.primaryRootCause.alternativeExplanations) {
      lines.push(`  - ${alt}`);
    }
  }

  if (result.alternativeRootCauses.length > 0) {
    lines.push(`\nAlternative root causes:`);
    for (const altCause of result.alternativeRootCauses) {
      lines.push(`  - ${altCause.description}`);
    }
  }

  if (result.warningFlags.length > 0) {
    lines.push(`\n⚠ WARNINGS:`);
    for (const flag of result.warningFlags) {
      lines.push(`  - ${flag}`);
    }
  }

  if (
    result.primaryRootCause.missingEvidenceFor &&
    result.primaryRootCause.missingEvidenceFor.length > 0
  ) {
    lines.push(`\nMissing evidence for stronger diagnosis:`);
    for (const missing of result.primaryRootCause.missingEvidenceFor) {
      lines.push(`  - ${missing}`);
    }
  }

  return lines.join("\n");
}
