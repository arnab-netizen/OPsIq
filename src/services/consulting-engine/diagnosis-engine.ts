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
  {
    name: "Brand Perception Trust Gap",
    pattern: (evidence) =>
      evidence.some(
        (e) =>
          e.dimension === "market_position" &&
          e.isCritical &&
          (e.finding.toLowerCase().includes("brand") ||
            e.finding.toLowerCase().includes("trust") ||
            e.finding.toLowerCase().includes("reputation"))
      ) &&
      evidence.some(
        (e) =>
          e.dimension === "customer_retention" &&
          (e.finding.toLowerCase().includes("churn") ||
            e.finding.toLowerCase().includes("switch"))
      ),
    confidence: (evidence) => {
      const brandEvidence = evidence.filter(
        (e) =>
          e.dimension === "market_position" &&
          (e.finding.toLowerCase().includes("brand") ||
            e.finding.toLowerCase().includes("trust") ||
            e.finding.toLowerCase().includes("reputation"))
      );
      const retentionEvidence = evidence.filter(
        (e) => e.dimension === "customer_retention"
      );
      const highConfidenceBrand = brandEvidence.filter(
        (e) => e.confidence === ConfidenceLevel.HIGH
      ).length;
      const highConfidenceRetention = retentionEvidence.filter(
        (e) => e.confidence === ConfidenceLevel.HIGH
      ).length;

      if (
        highConfidenceBrand >= 2 &&
        highConfidenceRetention >= 1
      ) {
        return DiagnosisConfidence.HIGH;
      } else if (brandEvidence.length >= 1 && retentionEvidence.length >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.INSUFFICIENT_EVIDENCE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.BRAND_PERCEPTION_TRUST_GAP,
      description: "Brand perception or trust gap driving customer switching",
      mechanismDescription:
        "Damaged brand reputation or lack of market positioning causes customers to perceive competitors as better alternatives. Trust deficit leads to churn despite product quality.",
      evidenceIds: evidence
        .filter(
          (e) =>
            (e.dimension === "market_position" &&
              (e.finding.toLowerCase().includes("brand") ||
                e.finding.toLowerCase().includes("trust") ||
                e.finding.toLowerCase().includes("reputation"))) ||
            e.dimension === "customer_retention"
        )
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Competitors may offer lower prices",
        "Product features may not match market expectations",
      ],
      missingEvidenceFor: [
        "Specific brand perception metrics",
        "Customer perception vs competitor perception",
        "Awareness of brand strengths in target market",
      ],
    }),
  },
  {
    name: "Unit Economics Breakdown",
    pattern: (evidence) =>
      evidence.some(
        (e) =>
          e.dimension === "financial_health" &&
          (e.finding.toLowerCase().includes("margin") ||
            e.finding.toLowerCase().includes("cogs") ||
            e.finding.toLowerCase().includes("acquisition"))
      ) &&
      evidence.some(
        (e) =>
          e.dimension === "financial_health" &&
          e.confidence === ConfidenceLevel.HIGH
      ),
    confidence: (evidence) => {
      const financialEvidence = evidence.filter(
        (e) =>
          e.dimension === "financial_health" &&
          (e.finding.toLowerCase().includes("margin") ||
            e.finding.toLowerCase().includes("cogs") ||
            e.finding.toLowerCase().includes("acquisition"))
      );
      const highConfidence = financialEvidence.filter(
        (e) => e.confidence === ConfidenceLevel.HIGH
      ).length;

      if (highConfidence >= 2) {
        return DiagnosisConfidence.HIGH;
      } else if (financialEvidence.length >= 1 && highConfidence >= 1) {
        return DiagnosisConfidence.MODERATE;
      } else if (financialEvidence.length >= 1) {
        return DiagnosisConfidence.PROVISIONAL;
      }
      return DiagnosisConfidence.INSUFFICIENT_EVIDENCE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.UNIT_ECONOMICS_BREAKDOWN,
      description: "Unit economics unsustainable below required scale",
      mechanismDescription:
        "Acquisition cost, cost of goods sold, or delivery cost make individual unit unprofitable. Business cannot reach profitability without either scale, price increase, or cost reduction.",
      evidenceIds: evidence
        .filter(
          (e) =>
            e.dimension === "financial_health" &&
            (e.finding.toLowerCase().includes("margin") ||
              e.finding.toLowerCase().includes("cogs") ||
              e.finding.toLowerCase().includes("acquisition"))
        )
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Scale may improve unit economics",
        "Process improvements may reduce costs",
      ],
      missingEvidenceFor: [
        "Detailed cost breakdown by unit",
        "Customer lifetime value vs acquisition cost",
        "Contribution margin by product line",
      ],
    }),
  },
  {
    name: "Demand Forecasting Capacity Mismatch",
    pattern: (evidence) =>
      evidence.some(
        (e) =>
          e.dimension === "process_maturity" &&
          (e.finding.toLowerCase().includes("demand") ||
            e.finding.toLowerCase().includes("forecast") ||
            e.finding.toLowerCase().includes("capacity"))
      ) &&
      evidence.some(
        (e) =>
          e.dimension === "operational_efficiency" &&
          (e.finding.toLowerCase().includes("bottleneck") ||
            e.finding.toLowerCase().includes("backlog"))
      ),
    confidence: (evidence) => {
      const demandEvidence = evidence.filter(
        (e) =>
          e.dimension === "process_maturity" &&
          (e.finding.toLowerCase().includes("demand") ||
            e.finding.toLowerCase().includes("forecast") ||
            e.finding.toLowerCase().includes("capacity"))
      );
      const operationalEvidence = evidence.filter(
        (e) =>
          e.dimension === "operational_efficiency" &&
          (e.finding.toLowerCase().includes("bottleneck") ||
            e.finding.toLowerCase().includes("backlog"))
      );
      const highConfidence = evidence.filter(
        (e) => e.confidence === ConfidenceLevel.HIGH
      ).length;

      if (demandEvidence.length >= 1 && operationalEvidence.length >= 1 && highConfidence >= 2) {
        return DiagnosisConfidence.HIGH;
      } else if (demandEvidence.length >= 1 && operationalEvidence.length >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.INSUFFICIENT_EVIDENCE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.DEMAND_FORECASTING_CAPACITY_MISMATCH,
      description: "Capacity planning not aligned with demand forecasting",
      mechanismDescription:
        "Business lacks formal demand forecasting or capacity planning. Unmet demand creates backlog and lost sales; excess capacity creates waste and cash drag.",
      evidenceIds: evidence
        .filter(
          (e) =>
            (e.dimension === "process_maturity" &&
              (e.finding.toLowerCase().includes("demand") ||
                e.finding.toLowerCase().includes("forecast") ||
                e.finding.toLowerCase().includes("capacity"))) ||
            (e.dimension === "operational_efficiency" &&
              (e.finding.toLowerCase().includes("bottleneck") ||
                e.finding.toLowerCase().includes("backlog")))
        )
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Demand may be unpredictable due to market volatility",
        "Capacity may be fixed and cannot scale",
      ],
      missingEvidenceFor: [
        "Historical demand patterns",
        "Capacity utilization metrics",
        "Lead time variability",
      ],
    }),
  },
  {
    name: "Overexpansion Operating Model Break",
    pattern: (evidence) =>
      evidence.some(
        (e) =>
          e.dimension === "team_capability" &&
          (e.finding.toLowerCase().includes("growth") ||
            e.finding.toLowerCase().includes("expansion") ||
            e.finding.toLowerCase().includes("scale"))
      ) &&
      evidence.some(
        (e) =>
          e.dimension === "financial_health" &&
          (e.finding.toLowerCase().includes("burn") ||
            e.finding.toLowerCase().includes("cash") ||
            e.finding.toLowerCase().includes("loss"))
      ),
    confidence: (evidence) => {
      const teamEvidence = evidence.filter(
        (e) =>
          e.dimension === "team_capability" &&
          (e.finding.toLowerCase().includes("growth") ||
            e.finding.toLowerCase().includes("expansion") ||
            e.finding.toLowerCase().includes("scale"))
      );
      const financialEvidence = evidence.filter(
        (e) =>
          e.dimension === "financial_health" &&
          (e.finding.toLowerCase().includes("burn") ||
            e.finding.toLowerCase().includes("cash") ||
            e.finding.toLowerCase().includes("loss"))
      );
      const highConfidence = evidence.filter(
        (e) => e.confidence === ConfidenceLevel.HIGH
      ).length;

      if (teamEvidence.length >= 1 && financialEvidence.length >= 1 && highConfidence >= 2) {
        return DiagnosisConfidence.HIGH;
      } else if (teamEvidence.length >= 1 && financialEvidence.length >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.INSUFFICIENT_EVIDENCE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.OVEREXPANSION_OPERATING_MODEL_BREAK,
      description: "Operating model cannot support current scale or growth ambition",
      mechanismDescription:
        "Business expanded before systems, processes, and team capability matured. Current organizational structure cannot handle revenue and complexity. Cash burn accelerates as overhead grows faster than revenue.",
      evidenceIds: evidence
        .filter(
          (e) =>
            (e.dimension === "team_capability" &&
              (e.finding.toLowerCase().includes("growth") ||
                e.finding.toLowerCase().includes("expansion") ||
                e.finding.toLowerCase().includes("scale"))) ||
            (e.dimension === "financial_health" &&
              (e.finding.toLowerCase().includes("burn") ||
                e.finding.toLowerCase().includes("cash") ||
                e.finding.toLowerCase().includes("loss")))
        )
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Growth may be sustainable with operational improvements",
        "Team capability may improve with training and hiring",
      ],
      missingEvidenceFor: [
        "Specific operational bottlenecks",
        "Team skill gaps",
        "Process bottlenecks",
      ],
    }),
  },
  {
    name: "Pricing Packaging Misalignment",
    pattern: (evidence) =>
      evidence.some(
        (e) =>
          e.dimension === "market_position" &&
          (e.finding.toLowerCase().includes("price") ||
            e.finding.toLowerCase().includes("positioning") ||
            e.finding.toLowerCase().includes("competitor"))
      ) &&
      evidence.some(
        (e) =>
          e.dimension === "customer_retention" &&
          (e.finding.toLowerCase().includes("value") ||
            e.finding.toLowerCase().includes("benefit") ||
            e.finding.toLowerCase().includes("price-sensitive"))
      ),
    confidence: (evidence) => {
      const marketEvidence = evidence.filter(
        (e) =>
          e.dimension === "market_position" &&
          (e.finding.toLowerCase().includes("price") ||
            e.finding.toLowerCase().includes("positioning") ||
            e.finding.toLowerCase().includes("competitor"))
      );
      const retentionEvidence = evidence.filter(
        (e) =>
          e.dimension === "customer_retention" &&
          (e.finding.toLowerCase().includes("value") ||
            e.finding.toLowerCase().includes("benefit") ||
            e.finding.toLowerCase().includes("price-sensitive"))
      );
      const highConfidence = marketEvidence.filter(
        (e) => e.confidence === ConfidenceLevel.HIGH
      ).length;

      if (marketEvidence.length >= 1 && retentionEvidence.length >= 1 && highConfidence >= 1) {
        return DiagnosisConfidence.HIGH;
      } else if (marketEvidence.length >= 1 && retentionEvidence.length >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.INSUFFICIENT_EVIDENCE;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.PRICING_PACKAGING_MISALIGNMENT,
      description: "Pricing or packaging does not align with customer value perception",
      mechanismDescription:
        "Price is too high relative to perceived value, or packaging does not match customer needs. Customers choose competitors perceived as better value. Revenue per customer or customer acquisition is impacted.",
      evidenceIds: evidence
        .filter(
          (e) =>
            (e.dimension === "market_position" &&
              (e.finding.toLowerCase().includes("price") ||
                e.finding.toLowerCase().includes("positioning") ||
                e.finding.toLowerCase().includes("competitor"))) ||
            (e.dimension === "customer_retention" &&
              (e.finding.toLowerCase().includes("value") ||
                e.finding.toLowerCase().includes("benefit") ||
                e.finding.toLowerCase().includes("price-sensitive")))
        )
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Product differentiation may not be clear to market",
        "Packaging may be right but marketing ineffective",
      ],
      missingEvidenceFor: [
        "Customer willingness-to-pay analysis",
        "Competitor pricing and packaging",
        "Perceived value vs actual price",
      ],
    }),
  },
];

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
