import type { EvidenceItem, RootCause } from "@/domain/consulting-engine/types";
import {
  DiagnosisConfidence,
  ConfidenceLevel,
  DiagnosisType,
} from "@/domain/consulting-engine/types";
import { v4 as uuidv4 } from "uuid";

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
      evidence.some(
        (e) =>
          e.dimension === "operational_efficiency" &&
          e.isCritical &&
          (e.finding.toLowerCase().includes("turnaround") ||
            e.finding.toLowerCase().includes("slow") ||
            e.finding.toLowerCase().includes("capacity"))
      ) &&
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
      evidence.some(
        (e) =>
          e.dimension === "quality_delivery" &&
          e.isCritical &&
          e.finding.toLowerCase().includes("complaint")
      ) &&
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
      evidence.some(
        (e) =>
          e.dimension === "customer_retention" &&
          e.isCritical &&
          (e.finding.toLowerCase().includes("low repeat") ||
            e.finding.toLowerCase().includes("one-time") ||
            e.finding.toLowerCase().includes("churn"))
      ),
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
];

// ─── E1 financial-signal helpers (deterministic; no answer keys) ──────────────
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
function fin_isLiquidityCrisis(e: EvidenceItem): boolean {
  if (e.dimension !== "financial_health") return false;
  const t = fin_text(e);
  const textual = /runway|liquidity|cash crunch|cash shortfall|out of cash|cash burn|burning cash|cannot make payroll|missed payroll|insolven/.test(t);
  const r = fin_runwayMonths(e);
  return textual || (r !== undefined && r <= 6);
}
function fin_isUnitEconomicsFailure(e: EvidenceItem): boolean {
  if (e.dimension !== "financial_health") return false;
  const t = fin_text(e);
  const textual = /negative contribution|negative unit|unprofitable|loss per unit|cac exceeds|ltv\s*<\s*cac|ltv below cac|payback too long/.test(t);
  const contrib = fin_num(e, "contribution") ?? fin_num(e, "contributionMargin") ?? fin_num(e, "contributionPerMember");
  const price = fin_num(e, "price");
  const vc = fin_num(e, "variableCost");
  const numeric = (contrib !== undefined && contrib < 0) || (price !== undefined && vc !== undefined && vc > price);
  return textual || numeric;
}
function fin_isMarginErosion(e: EvidenceItem): boolean {
  if (e.dimension !== "financial_health") return false;
  const t = fin_text(e);
  const textual = /margin eros|margin declin|declining margin|negative operating margin|operating loss|profit down|profit declin|cost inflation|cogs rising|rising costs|input cost|gross margin fell/.test(t);
  const pcp = fin_num(e, "profitChangePercent");
  const mp = fin_num(e, "marginPct");
  const om = fin_num(e, "operatingMargin");
  const numeric = (pcp !== undefined && pcp < 0) || (mp !== undefined && mp < 0) || (om !== undefined && om < 0);
  return textual || numeric;
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

  const primary = matchedPatterns[0].pattern.diagnosis(evidence);
  (primary as any).confidence = matchedPatterns[0].confidence;

  const alternatives = matchedPatterns.slice(1).map((m) => {
    const diagnosis = m.pattern.diagnosis(evidence);
    (diagnosis as any).confidence = m.confidence;
    return diagnosis;
  });

  const warningFlags: string[] = [];
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
