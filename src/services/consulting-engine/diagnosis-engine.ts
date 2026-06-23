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
    // W4: co-requirement extended to also accept market_position critical evidence with
    // declining order signal — covers manufacturing/service throughput cases where lead
    // time extension causes order rejection (market impact) rather than customer churn
    // (retention impact). Safety: still requires op_isBottleneckSignal() (operational_efficiency
    // + isCritical + OPERATIONAL_TOPIC) as the primary gate; market_position alone does not fire.
    pattern: (evidence) =>
      evidence.some((e) => op_isBottleneckSignal(e)) &&
      (evidence.some(
        (e) =>
          e.dimension === "customer_retention" &&
          (e.finding.toLowerCase().includes("low repeat") ||
            e.finding.toLowerCase().includes("defect"))
      ) ||
      evidence.some(
        (e) =>
          e.dimension === "market_position" &&
          e.isCritical &&
          /declin\w*|turn\w* away|turn\w* down|rejecti\w*|refus\w*|cannot.*commit|unable.*commit/i.test(e.finding)
      )),
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
    pattern: (evidence) => evidence.some((e) => fin_isLiquidityCrisis(e)) || fin_isLiquidityPressurePaired(evidence),
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
            (fin_num(e, "leverageRatio") !== undefined && (fin_num(e, "leverageRatio") as number) >= 4) ||
            // P4-A: FCCB failure / CDR referral are HIGH-severity structural events even
            // without a covenant or leverage numeric — they represent formal debt distress.
            DEBT_HIGH_SEVERITY.test(fin_text(e)))
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
    // W1: also fires on fin_isWorkingCapitalPaired (two independent WC narrative signals).
    pattern: (evidence) => evidence.some((e) => fin_isWorkingCapital(e)) || fin_isWorkingCapitalPaired(evidence),
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
    // P4-B: extended to include pricing-model transition risk (fin_isPricingTransition)
    // alongside the original price-realization gap path (fin_isPricingPower).
    pattern: (evidence) => evidence.some((e) => fin_isPricingPower(e) || fin_isPricingTransition(e)),
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
  // ─── E2 slice 2: demand / GTM / inventory archetypes ────────────────────────
  // Each requires strong, specific, ADVERSE domain evidence; generic revenue /
  // margin / cash pressure (and proposed-cut adversarial framings) do NOT fire.
  {
    name: "Demand Generation Failure",
    // W3: second path via fin_isChurnDrivenDemandFailure for service businesses where
    // demand declines through early client departure (retention-driven demand failure).
    pattern: (evidence) =>
      evidence.some((e) => fin_isDemandFailure(e)) || fin_isChurnDrivenDemandFailure(evidence),
    confidence: (evidence) => {
      const sev = evidence.some(
        (e) => fin_isDemandFailure(e) && (fin_num(e, "newCustomerRate") !== undefined || fin_num(e, "leadVolume") !== undefined)
      );
      return sev ? DiagnosisConfidence.HIGH : DiagnosisConfidence.MODERATE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.DEMAND_GENERATION_FAILURE,
      description: "Demand-generation failure: top-of-funnel / new-customer demand has deteriorated",
      mechanismDescription:
        "New-customer acquisition, lead flow, or top-of-funnel demand has collapsed; the gap is new demand, not unit economics or cost.",
      evidenceIds: evidence.filter((e) => e.dimension === "market_position").map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "A temporary seasonal dip rather than a structural demand problem",
        "A tracking/attribution gap rather than a real demand fall",
      ],
      missingEvidenceFor: [
        "Channel-level lead-source attribution",
        "Funnel conversion by stage",
      ],
    }),
  },
  {
    name: "GTM / Channel Mismatch",
    pattern: (evidence) => evidence.some((e) => fin_isGtmMismatch(e)),
    confidence: (evidence) => {
      // W1: HIGH when any strong channel-level numeric is present (original channelCac/
      // channelMix plus funnelConversionPct and leadVolume from the W1 gate expansion).
      const sev = evidence.some(
        (e) =>
          fin_isGtmMismatch(e) &&
          (fin_num(e, "channelCac") !== undefined ||
            fin_num(e, "channelMix") !== undefined ||
            fin_num(e, "funnelConversionPct") !== undefined ||
            fin_num(e, "leadVolume") !== undefined)
      );
      return sev ? DiagnosisConfidence.HIGH : DiagnosisConfidence.MODERATE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.GTM_CHANNEL_MISMATCH,
      description: "Go-to-market / channel mismatch: spend concentrated in an underperforming acquisition channel",
      mechanismDescription:
        "Acquisition is concentrated in a channel with poor conversion or punitive CAC; the issue is channel allocation, not the product or blended economics.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "market_position" || e.dimension === "financial_health")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "A short-term channel-pricing fluctuation rather than a structural mismatch",
        "An attribution gap masking a profitable channel",
      ],
      missingEvidenceFor: [
        "Channel-level CAC / payback",
        "Channel-level conversion and reallocation headroom",
      ],
    }),
  },
  {
    name: "Inventory / Forecasting Mismatch",
    pattern: (evidence) => evidence.some((e) => fin_isInventoryMismatch(e)),
    confidence: (evidence) => {
      const sev = evidence.some(
        (e) => fin_isInventoryMismatch(e) && fin_num(e, "forecastErrorPct") !== undefined
      );
      return sev ? DiagnosisConfidence.HIGH : DiagnosisConfidence.MODERATE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.INVENTORY_FORECASTING_MISMATCH,
      description: "Inventory / forecasting mismatch: stock misallocated against demand (stockouts + overstock)",
      mechanismDescription:
        "Forecast error misallocates stock — stockouts on fast lines alongside overstock on slow lines — trapping cash and forcing markdowns; the issue is planning, not demand or cost.",
      evidenceIds: evidence.filter((e) => e.dimension === "operational_efficiency").map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "A one-off supplier disruption rather than a forecasting problem",
        "A deliberate stock build rather than a forecast error",
      ],
      missingEvidenceFor: [
        "Forecast accuracy by SKU/ABC class",
        "Demand variability and lead-time data",
      ],
    }),
  },
  // ─── E2 slice 3: legal-governance / key-person / strategic-capex archetypes ──
  // Each requires strong, specific, archetype-home evidence with a corroborating
  // numeric. Generic poor performance / management issue / customer complaint
  // (legal), generic labour shortage / operational delay (key-person), and generic
  // capacity / growth / cash pressure (capex) do NOT fire. The first actions are
  // low-cost, reversible, diagnostic, and owner-constrained (intervention engine /
  // R3 survival ladder). These triggers deliberately do NOT fire on the adversarial
  // proposed-cut / immediate-commit framings — those stay abstained at the gate.
  {
    name: "Legal / Governance Risk",
    // A safety/quality recall case that merely MENTIONS a regulatory constraint is a
    // quality_control_failure, not a legal-governance case — the quality archetype
    // owns it. Legal fires only when the governance/regulatory breach is the issue and
    // no critical safety/recall/defect quality signal is competing.
    pattern: (evidence) =>
      (evidence.some((e) => fin_isLegalGovernance(e)) || fin_isLegalGovernanceByText(evidence)) &&
      !fin_hasCriticalSafetyQuality(evidence),
    confidence: (evidence) => {
      const sev = evidence.some(
        (e) =>
          fin_isLegalGovernance(e) &&
          ((fin_num(e, "complianceGapCount") !== undefined && (fin_num(e, "complianceGapCount") as number) >= 1) ||
            (fin_num(e, "regulatoryDeadlineDays") !== undefined && (fin_num(e, "regulatoryDeadlineDays") as number) <= 60))
      );
      return sev ? DiagnosisConfidence.HIGH : DiagnosisConfidence.MODERATE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.LEGAL_GOVERNANCE_RISK,
      description: "Legal / governance / regulatory exposure requiring containment and counsel",
      mechanismDescription:
        "A regulatory, compliance, governance, or conduct breach has surfaced; the exposure is legal/regulatory and must be contained and met with qualified counsel before operational change.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "process_maturity" || e.dimension === "market_position")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "An isolated administrative lapse rather than a systemic governance failure",
        "A regulator enquiry that closes without remediation exposure",
      ],
      missingEvidenceFor: [
        "Scope of the regulatory requirement and the remediation timeline",
        "Counsel assessment of liability and disclosure obligations",
      ],
    }),
  },
  {
    name: "Key-Person Dependency",
    pattern: (evidence) => evidence.some((e) => fin_isKeyPerson(e)) || evidence.some((e) => fin_isFounderDeath(e)),
    confidence: (evidence) => {
      // Founder death is irreversible and unambiguous — always HIGH
      if (evidence.some((e) => fin_isFounderDeath(e))) return DiagnosisConfidence.HIGH;
      const sev = evidence.some(
        (e) =>
          fin_isKeyPerson(e) &&
          ((fin_num(e, "keyPersonCount") !== undefined && (fin_num(e, "keyPersonCount") as number) <= 1) ||
            (fin_num(e, "successionReady") !== undefined && (fin_num(e, "successionReady") as number) === 0))
      );
      return sev ? DiagnosisConfidence.HIGH : DiagnosisConfidence.MODERATE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.KEY_PERSON_RISK,
      description: "Key-person dependency: critical knowledge / relationships concentrated in one person",
      mechanismDescription:
        "Critical system knowledge, client relationships, or revenue are concentrated in a single undocumented person with no succession — a single point of failure that survives any program-level fix.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "team_capability" || e.dimension === "process_maturity")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "A general staffing constraint rather than a single-person dependency",
        "A documented role that can be back-filled without knowledge loss",
      ],
      missingEvidenceFor: [
        "The exact knowledge and relationships held only by that person",
        "Cross-training / succession readiness of the next-best resource",
      ],
    }),
  },
  {
    name: "Strategic Capex Misallocation",
    pattern: (evidence) => fin_isStrategicCapex(evidence),
    confidence: (evidence) => {
      const fragile = evidence.some(
        (e) =>
          e.dimension === "market_position" &&
          fin_num(e, "demandDurabilityMonths") !== undefined &&
          (fin_num(e, "demandDurabilityMonths") as number) <= 12
      );
      return fragile ? DiagnosisConfidence.HIGH : DiagnosisConfidence.MODERATE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.STRATEGIC_CAPEX_RISK,
      description: "Strategic capex misallocation: large irreversible capital weighed against non-durable demand",
      mechanismDescription:
        "A large, largely irreversible capital investment is being weighed against demand whose durability is unproven; committing before durability is validated risks a value-destroying, irreversible loss.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "financial_health" || e.dimension === "market_position")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Demand that proves durable, making the investment sound",
        "A reversible / leasable alternative that removes the irreversibility",
      ],
      missingEvidenceFor: [
        "Independent validation of demand durability beyond the near-term driver",
        "Downside / reversibility modelling of the committed capital",
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
  /out of cash|cannot make payroll|missed payroll|cannot meet payroll|cash crunch|cash shortfall|liquidity crisis|burning (?:through )?cash|insolven|active default|asset.?liability mismatch|salary arrears|wage arrears|payroll arrears/;
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

// P3-F: "liquidity pressure" paired with a corroborating financial-decline signal.
// "Liquidity pressure" alone is insufficiently specific (could appear in forward-looking
// or management commentary without genuine crisis). It fires only when a second critical
// financial_health item confirms operational/debt decline (asset monetisation to fund
// operations, comparable-store-sales decline, debt-limiting investment, revenue decline).
// "business pressure" / "financial pressure" alone do NOT match LIQUIDITY_PRESSURE_PHRASE.
const LIQUIDITY_PRESSURE_PHRASE =
  /liquidity pressure|liquidity.*constrain\w*|constrain\w*.*liquidity|limited.*(?:capital|financial) flexib\w*|(?:capital|financial) flexib\w*.*limited|constrain\w*.*(?:capital|financial) flexib\w*/;
const LIQUIDITY_CORROBORATOR =
  /asset (sale|monetiz)|fund(?:ing)? operations|comparable.*(?:store )?sales.*down|comp\w* sales.*down|revenue.*declin|operating.*declin|debt.*limit|leverage.*constrain/;
function fin_isLiquidityPressurePaired(evidence: EvidenceItem[]): boolean {
  const fh = evidence.filter((e) => e.dimension === "financial_health" && e.isCritical);
  const pressureItems = fh.filter((e) => LIQUIDITY_PRESSURE_PHRASE.test(fin_text(e)));
  if (pressureItems.length === 0) return false;
  // Corroborator must be a DISTINCT item — the pressure finding alone is not enough
  const otherItems = fh.filter((e) => !pressureItems.includes(e));
  return otherItems.some((e) => LIQUIDITY_CORROBORATOR.test(fin_text(e)));
}

const UNITECON_HARD =
  /negative contribution|negative unit|unprofitabl\w*|loss per unit|loss-making|cac exceeds|cac\s*>\s*ltv|ltv\s*<\s*cac|ltv below cac|payback too long|burning (?:money )?on each|lose money on each|upside[- ]?down unit/;
const UNITECON_TOPIC = /contribution|unit econom|\bcac\b|payback|ltv|per[- ]?(?:unit|customer|subscriber|member) econ/;
// W4: location-level fixed-cost overcommitment — captures multi-site expansion cases
// where individual locations never cover their own operating costs. Requires isCritical
// financial_health evidence; generic "costs increased" without location-level framing
// does NOT fire. Safety guard: isCritical=true prevents generic cost commentary from
// triggering this path (non-critical cost observations do not establish a structural unit
// economics failure).
const LOCATION_UNIT_PATTERN =
  /cover.{0,40}(own|their).{0,30}(cost|operating)|never.{0,30}(generat|cover|produc)\w*.{0,30}(surplus|profit|cost)|locat\w*.{0,30}not.{0,20}(cover|generat|viab|sustain)|sites?.{0,20}not.{0,20}(cover|viab|sustain)/;
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
  // W4: location-level fixed-cost signal — isCritical required to exclude generic cost mentions
  if (e.isCritical && LOCATION_UNIT_PATTERN.test(t)) return true;
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
// P4-A additions: \bfccb\b (foreign currency convertible bond), foreign currency convertible,
// corporate debt restructuring, \bcdr\b (CDR abbreviation in financial context), liability
// management — all unambiguous formal debt-restructuring vocabulary that cannot arise from
// ordinary operations discussions; each requires financial_health dimension context via the
// dimension guard in fin_isDebtSolvency.
const DEBT_TEXT = /covenant|leverage|interest cover|refinanc|maturity|debt service|debt-service|gearing|solvency|debt load|payables.*due|short-term (debt|facility)|debt[- ]laden|obligation.*unpaid|\bfccb\b|foreign currency convertible|corporate debt restructuring|\bcdr\b|liability management/;
// Self-corroborating debt-distress phrases: inherently indicate structural debt distress
// with no additional numeric or phrase needed. Includes P4-A additions for CDR/FCCB events.
// P4-A: added \bfccb\b, foreign currency convertible, corporate debt restructuring, \bcdr\b,
// high leverage, debt restructur (covers "debt restructuring"), liability management —
// all self-sufficient evidence of formal debt distress in the financial_health dimension.
const DEBT_SELF_CORROBORATING = /covenant|maturity|debt service|debt-service|refinanc|acute solvency|solvency.*acute|cannot service|debt[- ]laden|obligation.*unpaid|\bfccb\b|foreign currency convertible|corporate debt restructuring|\bcdr\b|high leverage|debt restructur|liability management/;
// HIGH-severity signals within debt-solvency evidence: formal restructuring events that
// are unambiguously severe (FCCB failure/negotiation, CDR referral, FCCB outstanding).
// Used to elevate confidence to HIGH when no leverageRatio/covenantHeadroom/interestCoverage
// numeric is present.
const DEBT_HIGH_SEVERITY = /\bfccb\b|foreign currency convertible|corporate debt restructuring|\bcdr\b/;
function fin_isDebtSolvency(e: EvidenceItem): boolean {
  if (e.dimension !== "financial_health") return false;
  const t = fin_text(e);
  const numeric =
    fin_num(e, "leverageRatio") !== undefined ||
    fin_num(e, "covenantHeadroom") !== undefined ||
    fin_num(e, "interestCoverage") !== undefined;
  // Require debt-structural vocabulary; a corroborating structural numeric or an
  // explicit covenant/maturity/debt-distress phrase. Generic cash pressure has neither.
  // P3-C additions: "acute solvency", "solvency.*acute", "cannot service" are unambiguous
  // debt-distress corroborators when paired with an existing DEBT_TEXT match (e.g. solvency);
  // "debt-laden" and "obligation.*unpaid" are self-corroborating debt-structural terms.
  // P4-A: added FCCB, CDR, high-leverage as self-corroborating terms in DEBT_SELF_CORROBORATING.
  return DEBT_TEXT.test(t) && (numeric || DEBT_SELF_CORROBORATING.test(t));
}

// W1: extended with AR/AP narrative synonyms. `receivabl` already matches the JSON key
// "receivablesAging" via fin_text serialisation; the synonyms cover business-English
// paraphrases ("slow-paying clients", "payment delays", "outstanding invoices") that
// appear in narrative evidence without the canonical WC field name.
const WC_TEXT = /receivabl|days sales outstanding|\bdso\b|cash conversion|days payable|\bdpo\b|working capital|cash[- ]conversion cycle|collections (timing|cycle)|receivable aging|invoice aging|payable timing|cash conversion mismatch|billed but uncollected|payment collection lag|slow[- ]pay\w*|late[- ]pay\w*|payment delay\w*|overdue invoice\w*|outstanding invoice\w*|debtor day\w*/;
function fin_isWorkingCapital(e: EvidenceItem): boolean {
  if (e.dimension !== "financial_health") return false;
  const t = fin_text(e);
  // W1: receivablesAging alone is now sufficient (was: required dpo pairing). dso and
  // cashConversionDays remain independently sufficient as before. Generic "cash pressure"
  // still does NOT fire — it lacks WC_TEXT vocabulary.
  const numeric =
    fin_num(e, "dso") !== undefined ||
    fin_num(e, "cashConversionDays") !== undefined ||
    fin_num(e, "receivablesAging") !== undefined;
  // Require AR/AP/CCC vocabulary AND a WC numeric. Generic inventory cash lockup or
  // "collections slowed" (no WC vocabulary) does NOT fire.
  return WC_TEXT.test(t) && numeric;
}

// W1: paired narrative path — fires when 2+ distinct financial_health items match
// WC_TEXT with at least one carrying a WC numeric. Satisfies the "two independent WC
// signals" requirement for partial-numeric cases. Generic "cash pressure" alone has no
// WC_TEXT match and cannot trigger this path.
function fin_isWorkingCapitalPaired(evidence: EvidenceItem[]): boolean {
  const fh = evidence.filter((e) => e.dimension === "financial_health");
  const wcItems = fh.filter((e) => WC_TEXT.test(fin_text(e)));
  if (wcItems.length < 2) return false;
  return wcItems.some(
    (e) =>
      fin_num(e, "dso") !== undefined ||
      fin_num(e, "cashConversionDays") !== undefined ||
      fin_num(e, "receivablesAging") !== undefined ||
      fin_num(e, "dpo") !== undefined
  );
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

// P4-B: Pricing-model transition failure — a separate pricing_power failure mode from
// price-realization gap. Fires when a SINGLE market_position/process_maturity item
// contains BOTH a pricing-model-change signal (coupon/promotional → everyday pricing)
// AND a customer-behavior/perception risk signal (promo-sensitive customer base,
// behavior change required, price perception mismatch). Requiring both signals in the
// same evidence item prevents generic "coupons" or "everyday pricing" mentions (which
// appear in normal retail commentary) from triggering without an explicit risk pairing.
//
// Deliberate non-matches: "pricing pressure from competitors" (no model-change signal),
// "summer discount sale" (bare "discount" without the model-change pattern), "retail
// sales declined" (no pricing signals at all).
const PRICING_MODEL_CHANGE =
  /coupon\w*|promotional pricing|everyday (?:low )?pric\w*|\bedlp\b|pricing model change|pricing transition|promo.?to.?everyday|from.*(?:coupon|promotional).*to.*(?:everyday|value pric\w*)/;
const PRICING_CUSTOMER_RISK =
  /behav\w+ change.*(?:requir|strateg\w*|pric\w*)|promo.?sensitiv\w*|accustom\w+ to.*(?:promo|coupon|discount)|price perception|perceived.*(?:value|price\b)|cognitive repricing|repricing.*customer|traffic.*(?:risk|loss)|conversion.*(?:risk|loss)/;
function fin_isPricingTransition(e: EvidenceItem): boolean {
  if (e.dimension !== "market_position" && e.dimension !== "process_maturity") return false;
  const t = fin_text(e);
  return PRICING_MODEL_CHANGE.test(t) && PRICING_CUSTOMER_RISK.test(t);
}

// ─── E2 slice 2 demand / GTM / inventory triggers (strict; adverse-specific) ──
const DEMAND_TEXT = /new-customer (acquisition|demand|volume|footfall|count).*(stall|collaps|fell|fall|weak|down)|collaps\w*[^.]{0,40}new[- ]?customer|acquisition has stalled|top-of-funnel.*(collaps|fell|weak)|lead volume (collaps|fell|weak|down)|demand (collaps|fell|softened|deteriorat|dried)|funnel.*(collaps|deteriorat)|online sessions (fell|collaps)|traffic (fell|collaps|weak)|volume deleverage|new[- ]customer demand collaps/;

// W1: stagnation extensions — adverse demand framing without explicit collapse verbs.
// Requires market_position dimension AND a demand numeric (gate in fin_isDemandFailure).
// Fires on sustained stagnation / plateau framing with a demand context; does NOT fire
// on generic seasonal softness ("sales were light", "revenue slowed") which has no
// subscriber / membership / flatlined / attrition context.
const DEMAND_STAGNATION_TEXT = /subscriber.*(count|base|number|growth).*(flat\b|stagnant|plateau\w*|not grow\w*|unchanged|constant)|flat.{0,20}(subscription\b|subscriber\b|membership\b)|stagnant.{0,20}(subscription\b|subscriber\b|membership\b)|membership.*(flat\b|stagnant|plateau\w*|not grow\w*|unchanged)|lead.*(flow|volume|count|rate).*(flat\b|stagnant|plateau\w*|slow\w*|not grow\w*|weak\w*)|demand.*(stagnant|plateau\w*|flatlined|not grow\w*)|acquisition.*(stagnant|flat\b|plateau\w*|not grow\w*|unchanged)|pipeline.*(stagnant|flat\b)|attrition.{0,20}(exceed\w*|offset\w*|outpac\w*).{0,30}(new|acquisition|intake|join\w*)|departure.rate.{0,20}(exceed\w*|offset\w*|outpac\w*)|\bflatlined\b|qualified lead.*(weak\w*|slow\w*|thin)|pipeline slow\w*/;

function fin_isDemandFailure(e: EvidenceItem): boolean {
  if (e.dimension !== "market_position") return false;
  const t = fin_text(e);
  // Require ADVERSE demand framing (collapse/stall/fell/weak OR W1 stagnation) AND a
  // demand numeric; generic revenue/margin decline or a proposed marketing CUT does NOT fire.
  if (!DEMAND_TEXT.test(t) && !DEMAND_STAGNATION_TEXT.test(t)) return false;
  return fin_num(e, "newCustomerRate") !== undefined || fin_num(e, "leadVolume") !== undefined || fin_num(e, "pipelineValue") !== undefined || fin_num(e, "funnelConversionPct") !== undefined;
}

// W3: Churn-driven demand failure — fires when customer_retention evidence shows critical
// early client departure AND a demandDurabilityMonths numeric exists (short client tenure).
// This captures service businesses where demand declines because existing clients leave
// early (retention failure), not because new customer acquisition has collapsed.
// Safety guards: requires is_critical=true departure signal AND demandDurabilityMonths numeric;
// generic satisfaction complaints alone do NOT fire; financial_health or market_position
// evidence alone does NOT fire.
const CHURN_DEPARTURE_TEXT =
  /stop.{0,20}(engaging|after[\s\w]{0,10}session)|client.{0,30}(depart|leave|stop|exit|tenure)|depart\w*.{0,20}client|early.{0,20}(departure|churn|exit)|replac\w*.{0,20}(client|customer)/;

function fin_isChurnDrivenDemandFailure(evidence: EvidenceItem[]): boolean {
  const hasCriticalDepartureSignal = evidence.some(
    (e) =>
      e.dimension === "customer_retention" &&
      e.isCritical === true &&
      CHURN_DEPARTURE_TEXT.test(fin_text(e))
  );
  if (!hasCriticalDepartureSignal) return false;
  return evidence.some((e) => fin_num(e, "demandDurabilityMonths") !== undefined);
}

// W1: extended with pipeline/conversion/win-rate/CAC-payback vocabulary that describes
// channel performance without explicit "paid-search" / "channel mix" terminology.
const GTM_TEXT = /paid[- ]search|paid[- ]social|channel mix|channel-driven|acquisition (cost|channel)|go-to-market|\bgtm\b|distribution channel|sales motion|market segment|channel attribution|pipeline conversion|win rate|\bwin-rate\b|qualified lead conversion|sales cycle|demo[- ]to[- ]close|cac payback|channel roi|digital advertising|online advertising|advertising targeting|lead generation channel/;
function fin_isGtmMismatch(e: EvidenceItem): boolean {
  if (e.dimension !== "market_position") return false;
  const t = fin_text(e);
  // Require channel/GTM vocabulary AND a channel-economics or funnel numeric; a generic
  // growth slowdown (no channel signal) does NOT fire.
  if (!GTM_TEXT.test(t)) return false;
  // W1: added funnelConversionPct, leadVolume, winRate, pipelineConversionPct,
  // salesCycleDays, cacPaybackMonths, channelRoi as valid GTM corroborators.
  return (
    fin_num(e, "channelCac") !== undefined ||
    fin_num(e, "channelMix") !== undefined ||
    fin_num(e, "channelConversionPct") !== undefined ||
    fin_num(e, "funnelConversionPct") !== undefined ||
    fin_num(e, "leadVolume") !== undefined ||
    fin_num(e, "winRate") !== undefined ||
    fin_num(e, "pipelineConversionPct") !== undefined ||
    fin_num(e, "salesCycleDays") !== undefined ||
    fin_num(e, "cacPaybackMonths") !== undefined ||
    fin_num(e, "channelRoi") !== undefined
  );
}

function fin_isInventoryMismatch(e: EvidenceItem): boolean {
  if (e.dimension !== "operational_efficiency") return false;
  const t = fin_text(e);
  const forecastErr = fin_num(e, "forecastErrorPct") !== undefined || /forecast (error|accuracy)|demand[- ]planning mismatch/.test(t);
  const overstockStockout = /overstock/.test(t) && /stock-?out/.test(t);
  const swing = /(inventory|stock).*(swung|swing|ballooned)|inventory (turns|aging) (deteriorat|fell|worsen)/.test(t);
  // Require a forecasting-mismatch signal (forecast error, BOTH overstock+stockout, or
  // an inventory-days swing) — a stockout-only proposed CUT or generic cash/margin
  // pressure does NOT fire.
  return forecastErr || overstockStockout || swing;
}

// ─── E2 slice 3 legal / key-person / strategic-capex triggers (strict) ────────
// Home dimensions: legal → process_maturity/market_position; key-person →
// team_capability; capex → financial_health (+ market_position demand-durability).
// Each requires specific archetype vocabulary AND a corroborating numeric so generic
// performance / management / capacity / growth / cash framings do NOT fire.
const LEGAL_TEXT =
  /regulat\w*|complian\w*|non-?complian\w*|governance|misconduct|\bfraud\b|\baudit\b|enforcement|licens\w*|consent order|investigation|inquiry|enquiry|conduct (rule|breach|failure)|control failure|unauthori[sz]ed account|sanction|penalt\w*|\bbreach\b/;

// Specific legal/governance terms that are unambiguous without numeric corroboration.
// Excludes "enforcement" (overloaded: creditor enforcement ≠ regulatory enforcement)
// and generic regulatory/governance vocabulary that appears in non-legal cases.
// P3-G additions: off-balance-sheet, related-party, conflicts of interest, structural/
// accounting opacity — circumspect accounting / SPV / governance-risk vocabulary that
// signals Enron-style financial-engineering risk without using the word "fraud".
// W3: "enquiry" removed from STRONG_LEGAL_TEXT — it is a common British-English word for
// client contact/intake volume and fires false-positive LEGAL in market_position context.
// "enquiry" remains in LEGAL_TEXT (and LEGAL_TEXT_G) so it still contributes to the 2+
// distinct-hit count threshold, but a single standalone "enquiry" no longer triggers LEGAL alone.
const STRONG_LEGAL_TEXT =
  /misconduct|\bfraud\b|consent order|investigation|inquiry|conduct (rule|breach|failure)|control failure|unauthori[sz]ed account|sanction\w*|penalt\w*|non-?complian\w*|moratorium|misappropriat\w*|embezzl\w*|\baudit\b|off-?balance-?sheet|related.?party|conflicts? of interest|structural opacity|accounting opacity|regulatory intervention|capital inadequac\w*|capital.?adequacy.*insufficient|insufficient.*capital.?adequacy|rbi.*intervention|central bank.*intervention|intervention.*(?:rbi|central bank|regulator)|regulator.*(?:seize|take over|supersede|appoint|place|put).*bank|banking.*licen[sc]e.*(?:revoke|cancel|suspend)|licen[sc]e.*(?:revoke|cancel|suspend).*bank/;

// Global version for counting distinct LEGAL_TEXT hits within a single finding
const LEGAL_TEXT_G =
  /regulat\w*|complian\w*|non-?complian\w*|governance|misconduct|\bfraud\b|\baudit\b|enforcement|licens\w*|consent order|investigation|inquiry|enquiry|conduct (rule|breach|failure)|control failure|unauthori[sz]ed account|sanction|penalt\w*|\bbreach\b/g;

function fin_isLegalGovernance(e: EvidenceItem): boolean {
  if (e.dimension !== "process_maturity" && e.dimension !== "market_position") return false;
  const t = fin_text(e);
  if (!LEGAL_TEXT.test(t)) return false;
  // Corroborate with a regulatory/compliance/exposure numeric; bare governance
  // vocabulary in a generic-performance finding (no numeric) does NOT fire.
  return (
    fin_num(e, "complianceGapCount") !== undefined ||
    fin_num(e, "regulatoryDeadlineDays") !== undefined ||
    fin_num(e, "exposureAmount") !== undefined
  );
}

// Textual-only path: fires when historical evidence contains strong governance/legal/fraud
// signals that are unambiguous without numeric corroboration. An item is "substantive" if
// it matches STRONG_LEGAL_TEXT (specific fraud/regulatory terms) OR contains 2+ distinct
// LEGAL_TEXT hits (indicating the finding is centrally about legal/governance, not a passing
// mention). Requires 2+ matching items with at least one substantive, or 1 substantive item.
// Guards against weak incidental mentions ("regulated industries", "technology licensing").
function fin_isLegalGovernanceByText(evidence: EvidenceItem[]): boolean {
  const relevant = evidence.filter(
    (e) =>
      (e.dimension === "process_maturity" || e.dimension === "market_position") &&
      (LEGAL_TEXT.test(fin_text(e)) || STRONG_LEGAL_TEXT.test(fin_text(e)))
  );
  if (relevant.length === 0) return false;
  const isSubstantive = (e: EvidenceItem): boolean => {
    const t = fin_text(e);
    return STRONG_LEGAL_TEXT.test(t) || (t.match(LEGAL_TEXT_G) ?? []).length >= 2;
  };
  const hasSubstantive = relevant.some(isSubstantive);
  if (relevant.length >= 2 && hasSubstantive) return true;
  if (relevant.length === 1 && isSubstantive(relevant[0])) return true;
  return false;
}
function fin_hasCriticalSafetyQuality(evidence: EvidenceItem[]): boolean {
  return evidence.some(
    (e) =>
      e.dimension === "quality_delivery" &&
      e.isCritical &&
      /recall|safety|defect|contamination|hazard|health-related/.test(fin_text(e))
  );
}

const KEYPERSON_TEXT =
  /founder-?engineer|owner-?operator|single (founder|owner|senior|specialist|operator|engineer|principal)|one (senior )?(specialist|person|engineer|operator|principal)|only one (senior|person|specialist|engineer)|sole (operator|specialist|owner|principal|trader)|rainmaker|key[- ]person|single point of failure|holds all (the )?(critical|client|system|pricing|recurring)|undocumented|no (documentation|backup|succession|cross-training)|senior (departure|rainmaker)|senior \w+ (left|departed)|took (their|the) client/;
function fin_isKeyPerson(e: EvidenceItem): boolean {
  if (e.dimension !== "team_capability") return false;
  const t = fin_text(e);
  if (!KEYPERSON_TEXT.test(t)) return false;
  // Corroborate with a key-person numeric (single count / no succession / revenue
  // concentration). A generic labour shortage or staffing gap has none of these.
  return (
    fin_num(e, "keyPersonCount") !== undefined ||
    fin_num(e, "successionReady") !== undefined ||
    fin_num(e, "revenueConcentrationPct") !== undefined
  );
}

// P3-D fix: founder-death path. Fires on process_maturity dimension when explicit
// founder/key-person death vocabulary is present. "Founder died" is self-sufficient —
// no numeric required (death is irreversible and unambiguous). Ordinary leadership
// changes ("CEO resigned", "new CEO appointed") do not match.
const FOUNDER_DEATH_TEXT =
  /founder.*died|founder.*death|founder.*deceased|death.*founder|sudden.*death|key.?person.*died|key.?person.*death|complete.*key.?person.*loss/;
function fin_isFounderDeath(e: EvidenceItem): boolean {
  if (e.dimension !== "process_maturity") return false;
  if (!e.isCritical) return false;
  return FOUNDER_DEATH_TEXT.test(fin_text(e));
}

// Capex is multi-signal: a capital INVESTMENT amount + an irreversibility signal +
// fragile/unproven demand — components that legitimately span several evidence items.
// A capex CUT (capexCutAmount, e.g. cancelling maintenance) is NOT an investment and
// does NOT fire; the adversarial immediate-commit / runway cases are held at the gate.
// The capexAmount numeric is the strong investment guard (a capex CUT carries
// capexCutAmount, not capexAmount), so the text only needs to confirm a capital-
// investment framing. Kept broad enough to catch "irreversible automated build",
// "facility expansion", "automated-warehouse build", "automation line", etc.
const CAPEX_INVEST_TEXT =
  /facility|expansion|automat\w*|warehouse|\bplant\b|\bbuild\b|equipment|capacity (expansion|build)|capital (expenditure|investment|commitment)|\bcapex\b|irreversible/;
function fin_isStrategicCapex(evidence: EvidenceItem[]): boolean {
  const fh = evidence.filter((e) => e.dimension === "financial_health");
  const mp = evidence.filter((e) => e.dimension === "market_position");
  const hasCapexInvestment = fh.some(
    (e) => fin_num(e, "capexAmount") !== undefined && CAPEX_INVEST_TEXT.test(fin_text(e))
  );
  const hasIrreversible = fh.some(
    (e) => fin_num(e, "reversibility") === 0 || /irreversible/.test(fin_text(e))
  );
  const hasFragileDemand = mp.some(
    (e) =>
      fin_num(e, "demandDurabilityMonths") !== undefined ||
      /unproven|short-term contract|single (new )?contract|one[- ]off|not (yet )?proven|unlikely to persist/.test(fin_text(e))
  );
  return hasCapexInvestment && hasIrreversible && hasFragileDemand;
}

// ─── Survival-dominance selection helpers (PC-01; selection-only, no new thresholds) ─
// Optimization/growth diagnoses that survival pressure outranks for PRIMARY. Cash,
// debt, working-capital, unit-economics, capex, legal, key-person, inventory are NOT
// here — only genuine optimization/growth archetypes can be demoted by survival.
const OPTIMIZATION_DIAGNOSES: ReadonlySet<DiagnosisType> = new Set([
  DiagnosisType.CUSTOMER_RETENTION_EROSION,
  DiagnosisType.DEMAND_GENERATION_FAILURE,
  DiagnosisType.GTM_CHANNEL_MISMATCH,
  DiagnosisType.PRICING_POWER_FAILURE,
  DiagnosisType.MARGIN_EROSION,
]);

/**
 * Critical survival/cash pressure in the runtime evidence: a ≤3-month (~90-day) cash
 * runway, or an inherently-acute liquidity phrase (payroll/insolvency/cash-shortfall/
 * supplier-shutdown/liquidity-emergency). Reuses the existing runway numeric (no new
 * trigger threshold); the ≤3-month bar matches the R3 survival ladder's SURVIVAL_RUNWAY_MONTHS.
 */
const SURVIVAL_HARD =
  /cannot make payroll|missed payroll|cannot meet payroll|out of cash|insolven|cash shortfall|cannot meet (?:its )?obligations|unable to meet (?:its )?obligations|supplier shutdown|liquidity (?:crisis|emergency)/;
function fin_hasCriticalSurvivalPressure(evidence: EvidenceItem[]): boolean {
  return evidence.some((e) => {
    if (e.dimension !== "financial_health") return false;
    const r = fin_runwayMonths(e);
    if (r !== undefined && r <= 3) return true;
    return SURVIVAL_HARD.test(fin_text(e));
  });
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

  // ── Survival dominance (PC-01): when cash/liquidity is ALREADY a matched candidate
  // at HIGH/MODERATE confidence and the evidence shows CRITICAL survival pressure
  // (≤3-month runway, payroll/insolvency/cash-shortfall, supplier-shutdown), it must
  // beat a matched OPTIMIZATION diagnosis (retention/demand/gtm/pricing/margin) for
  // primary — survival precedes optimization. Selection-only: it never creates a cash
  // match from unmatched evidence, never changes any trigger threshold, and only
  // reorders already-matched candidates. The downstream R2 adjudication and the safety
  // gate are unchanged.
  if (matchedPatterns.length > 1 && fin_hasCriticalSurvivalPressure(evidence)) {
    const primaryType = matchedPatterns[0].pattern.diagnosis(evidence).type;
    if (OPTIMIZATION_DIAGNOSES.has(primaryType)) {
      const cashIdx = matchedPatterns.findIndex(
        (m) =>
          m.pattern.diagnosis(evidence).type === DiagnosisType.CASH_LIQUIDITY_CRISIS &&
          (m.confidence === DiagnosisConfidence.HIGH ||
            m.confidence === DiagnosisConfidence.MODERATE)
      );
      if (cashIdx > 0) {
        const [cash] = matchedPatterns.splice(cashIdx, 1);
        matchedPatterns.unshift(cash);
      }
    }
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
