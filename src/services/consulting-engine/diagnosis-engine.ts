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
    name: "Brand Erosion / Market Position Crisis",
    pattern: (evidence) =>
      evidence.some(
        (e) =>
          e.dimension === "market_position" &&
          e.isCritical &&
          (e.finding.toLowerCase().includes("brand") ||
            e.finding.toLowerCase().includes("reputation") ||
            e.finding.toLowerCase().includes("perception") ||
            e.finding.toLowerCase().includes("market share"))
      ),
    confidence: (evidence) => {
      const marketCount = evidence.filter(
        (e) => e.dimension === "market_position" && e.isCritical
      ).length;
      const highConfidence = evidence.filter(
        (e) =>
          e.dimension === "market_position" &&
          e.confidence === ConfidenceLevel.HIGH
      ).length;

      if (marketCount >= 2 && highConfidence >= 1) {
        return DiagnosisConfidence.HIGH;
      } else if (marketCount >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.PROVISIONAL;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.BRAND_EROSION,
      description: "Loss of market position due to brand/reputation damage",
      mechanismDescription:
        "Customer perception of brand has shifted negative. Market position erodes as customers perceive competitors as superior or more trustworthy. Premium positioning collapses.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "market_position")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Actual product quality declined (not perception issue)",
        "Competitive product innovation may be superior",
      ],
      missingEvidenceFor: [
        "Customer perception data vs actual quality",
        "Competitive positioning analysis",
        "Timeline of perception shift",
      ],
    }),
  },
  {
    name: "Demand Forecasting / Inventory Mismatch",
    pattern: (evidence) =>
      evidence.some(
        (e) =>
          e.dimension === "financial_health" &&
          (e.finding.toLowerCase().includes("inventory") ||
            e.finding.toLowerCase().includes("demand") ||
            e.finding.toLowerCase().includes("stockout") ||
            e.finding.toLowerCase().includes("excess"))
      ),
    confidence: (evidence) => {
      const demandCount = evidence.filter(
        (e) =>
          e.dimension === "financial_health" &&
          (e.finding.toLowerCase().includes("inventory") ||
            e.finding.toLowerCase().includes("demand"))
      ).length;
      const highConfidence = evidence.filter(
        (e) =>
          e.dimension === "financial_health" &&
          e.confidence === ConfidenceLevel.HIGH &&
          (e.finding.toLowerCase().includes("inventory") ||
            e.finding.toLowerCase().includes("demand"))
      ).length;

      if (demandCount >= 2 && highConfidence >= 1) {
        return DiagnosisConfidence.HIGH;
      } else if (demandCount >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.PROVISIONAL;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.DEMAND_FORECASTING_MISMATCH,
      description: "Supply-demand imbalance due to forecast error or inventory misalignment",
      mechanismDescription:
        "Demand signal not correctly translated to supply plan. Excess inventory ties up cash; stockouts lose revenue. Forecast error causes bullwhip effect through supply chain.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "financial_health")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Demand may be genuinely volatile (external shock)",
        "Supply chain constraint may be the binding constraint",
      ],
      missingEvidenceFor: [
        "Demand forecast accuracy historical data",
        "Safety stock model",
        "Supply lead time analysis",
      ],
    }),
  },
  {
    name: "Unit Economics Breakdown / Overexpansion",
    pattern: (evidence) =>
      evidence.some(
        (e) =>
          e.dimension === "financial_health" &&
          e.isCritical &&
          (e.finding.toLowerCase().includes("margin") ||
            e.finding.toLowerCase().includes("cost") ||
            e.finding.toLowerCase().includes("expense") ||
            e.finding.toLowerCase().includes("expansion"))
      ),
    confidence: (evidence) => {
      const economicsCount = evidence.filter(
        (e) =>
          e.dimension === "financial_health" &&
          e.isCritical &&
          (e.finding.toLowerCase().includes("margin") ||
            e.finding.toLowerCase().includes("cost"))
      ).length;
      const highConfidence = evidence.filter(
        (e) =>
          e.dimension === "financial_health" &&
          e.confidence === ConfidenceLevel.HIGH &&
          (e.finding.toLowerCase().includes("margin") ||
            e.finding.toLowerCase().includes("cost"))
      ).length;

      if (economicsCount >= 2 && highConfidence >= 1) {
        return DiagnosisConfidence.HIGH;
      } else if (economicsCount >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.PROVISIONAL;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.UNIT_ECONOMICS_BREAKDOWN,
      description: "Unit profitability collapse due to margin compression or fixed-cost burden",
      mechanismDescription:
        "Per-unit contribution has become negative or margins have compressed. Fixed-cost burden grows faster than revenue. Expansion to new units/segments unprofitable.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "financial_health")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Temporary cost inflation (commodity price spike) may recover",
        "Scale benefits may kick in with volume growth",
      ],
      missingEvidenceFor: [
        "Unit contribution margin by segment/location",
        "Cost structure breakdown (COGS vs OpEx)",
        "Projection when scale achieves breakeven",
      ],
    }),
  },
  {
    name: "Go-To-Market Misalignment / Channel Fit",
    pattern: (evidence) =>
      evidence.some(
        (e) =>
          e.dimension === "market_position" &&
          (e.finding.toLowerCase().includes("channel") ||
            e.finding.toLowerCase().includes("customer acquisition") ||
            e.finding.toLowerCase().includes("go-to-market") ||
            e.finding.toLowerCase().includes("segment"))
      ),
    confidence: (evidence) => {
      const gtmCount = evidence.filter(
        (e) =>
          e.dimension === "market_position" &&
          (e.finding.toLowerCase().includes("channel") ||
            e.finding.toLowerCase().includes("customer acquisition") ||
            e.finding.toLowerCase().includes("go-to-market"))
      ).length;
      const highConfidence = evidence.filter(
        (e) =>
          e.dimension === "market_position" &&
          e.confidence === ConfidenceLevel.HIGH &&
          (e.finding.toLowerCase().includes("channel") ||
            e.finding.toLowerCase().includes("customer acquisition"))
      ).length;

      if (gtmCount >= 2 && highConfidence >= 1) {
        return DiagnosisConfidence.HIGH;
      } else if (gtmCount >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.PROVISIONAL;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.GO_TO_MARKET_MISALIGNMENT,
      description: "Go-to-market strategy misaligned with customer needs or channel efficacy",
      mechanismDescription:
        "Customer acquisition cost rising or channel becoming ineffective. Marketing reaches wrong segment or channel saturation. GTM timing may be misaligned with market readiness.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "market_position")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Product may be uncompetitive (not a GTM issue)",
        "Market saturation may be industry-wide trend",
      ],
      missingEvidenceFor: [
        "Customer acquisition cost trend and breakdown by channel",
        "Customer segment profitability analysis",
        "Competitive GTM positioning",
      ],
    }),
  },
  {
    name: "Strategic Pricing Error / Packaging Mismatch",
    pattern: (evidence) =>
      evidence.some(
        (e) =>
          e.dimension === "financial_health" &&
          (e.finding.toLowerCase().includes("price") ||
            e.finding.toLowerCase().includes("pricing") ||
            e.finding.toLowerCase().includes("packaging") ||
            e.finding.toLowerCase().includes("willingness to pay"))
      ),
    confidence: (evidence) => {
      const pricingCount = evidence.filter(
        (e) =>
          e.dimension === "financial_health" &&
          (e.finding.toLowerCase().includes("price") ||
            e.finding.toLowerCase().includes("pricing"))
      ).length;
      const highConfidence = evidence.filter(
        (e) =>
          e.dimension === "financial_health" &&
          e.confidence === ConfidenceLevel.HIGH &&
          (e.finding.toLowerCase().includes("price") ||
            e.finding.toLowerCase().includes("pricing"))
      ).length;

      if (pricingCount >= 2 && highConfidence >= 1) {
        return DiagnosisConfidence.HIGH;
      } else if (pricingCount >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.PROVISIONAL;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.STRATEGIC_PRICING_ERROR,
      description: "Pricing or packaging strategy misaligned with customer value perception",
      mechanismDescription:
        "Price set above customer willingness-to-pay or below optimal revenue capture. Packaging does not match customer segment needs. Pricing power eroded through discounting.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "financial_health")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Low pricing power may reflect poor product differentiation",
        "High price may be justified by superior quality",
      ],
      missingEvidenceFor: [
        "Customer willingness-to-pay analysis",
        "Competitor pricing comparison",
        "Price elasticity data",
      ],
    }),
  },
  {
    name: "Governance / Compliance Failure",
    pattern: (evidence) =>
      evidence.some(
        (e) =>
          e.dimension === "process_maturity" &&
          e.isCritical &&
          (e.finding.toLowerCase().includes("compliance") ||
            e.finding.toLowerCase().includes("governance") ||
            e.finding.toLowerCase().includes("control") ||
            e.finding.toLowerCase().includes("regulatory"))
      ),
    confidence: (evidence) => {
      const governanceCount = evidence.filter(
        (e) =>
          e.dimension === "process_maturity" &&
          e.isCritical &&
          (e.finding.toLowerCase().includes("compliance") ||
            e.finding.toLowerCase().includes("governance"))
      ).length;
      const highConfidence = evidence.filter(
        (e) =>
          e.dimension === "process_maturity" &&
          e.confidence === ConfidenceLevel.HIGH &&
          (e.finding.toLowerCase().includes("compliance") ||
            e.finding.toLowerCase().includes("governance"))
      ).length;

      if (governanceCount >= 2 && highConfidence >= 1) {
        return DiagnosisConfidence.HIGH;
      } else if (governanceCount >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.PROVISIONAL;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.GOVERNANCE_COMPLIANCE_FAILURE,
      description: "Internal control or regulatory compliance failure creating material risk",
      mechanismDescription:
        "Process controls absent or ineffective, creating exposure to fraud, data breach, or regulatory violation. Material weakness in governance structure enables unauthorized actions.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "process_maturity")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Compliance gap may be minor vs material",
        "Control documentation may not reflect actual practice",
      ],
      missingEvidenceFor: [
        "Regulatory requirements and current compliance status",
        "Control testing results",
        "Risk assessment and materiality",
      ],
    }),
  },
  {
    name: "Trust / Quality Crisis (Non-Operational QC)",
    pattern: (evidence) =>
      evidence.some(
        (e) =>
          e.dimension === "quality_delivery" &&
          e.isCritical &&
          (e.finding.toLowerCase().includes("trust") ||
            e.finding.toLowerCase().includes("security") ||
            e.finding.toLowerCase().includes("reliability") ||
            e.finding.toLowerCase().includes("consistency"))
      ) &&
      !evidence.some(
        (e) =>
          e.dimension === "quality_delivery" &&
          e.finding.toLowerCase().includes("complaint")
      ),
    confidence: (evidence) => {
      const trustCount = evidence.filter(
        (e) =>
          e.dimension === "quality_delivery" &&
          e.isCritical &&
          (e.finding.toLowerCase().includes("trust") ||
            e.finding.toLowerCase().includes("security") ||
            e.finding.toLowerCase().includes("reliability"))
      ).length;
      const highConfidence = evidence.filter(
        (e) =>
          e.dimension === "quality_delivery" &&
          e.confidence === ConfidenceLevel.HIGH &&
          (e.finding.toLowerCase().includes("trust") ||
            e.finding.toLowerCase().includes("security"))
      ).length;

      if (trustCount >= 2 && highConfidence >= 1) {
        return DiagnosisConfidence.HIGH;
      } else if (trustCount >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.PROVISIONAL;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.TRUST_QUALITY_CRISIS,
      description: "Quality or trust issue eroding customer confidence and retention",
      mechanismDescription:
        "Product quality failing or service reliability broken, destroying customer trust. Distinct from brand perception: this is actual quality/reliability failure.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "quality_delivery")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Customer perception of quality may be misaligned with actual quality",
        "Expectations may exceed product design specification",
      ],
      missingEvidenceFor: [
        "Quality metrics (defect rate, uptime, MTBF)",
        "Customer satisfaction on quality dimensions",
        "Root cause of quality failure",
      ],
    }),
  },
  {
    name: "Cash Runway Crisis",
    pattern: (evidence) =>
      evidence.some(
        (e) =>
          e.dimension === "financial_health" &&
          e.isCritical &&
          (e.finding.toLowerCase().includes("runway") ||
            e.finding.toLowerCase().includes("cash") ||
            e.finding.toLowerCase().includes("burn"))
      ),
    confidence: (evidence) => {
      const runwayCount = evidence.filter(
        (e) =>
          e.dimension === "financial_health" &&
          e.isCritical &&
          (e.finding.toLowerCase().includes("runway") ||
            e.finding.toLowerCase().includes("cash"))
      ).length;
      const highConfidence = evidence.filter(
        (e) =>
          e.dimension === "financial_health" &&
          e.confidence === ConfidenceLevel.HIGH &&
          (e.finding.toLowerCase().includes("runway") ||
            e.finding.toLowerCase().includes("burn"))
      ).length;

      if (runwayCount >= 2 && highConfidence >= 1) {
        return DiagnosisConfidence.HIGH;
      } else if (runwayCount >= 1) {
        return DiagnosisConfidence.MODERATE;
      }
      return DiagnosisConfidence.PROVISIONAL;
    },
    diagnosis: (evidence) => ({
      id: uuidv4(),
      type: DiagnosisType.CASH_RUNWAY_CRISIS,
      description: "Immediate financial distress from unsustainable burn rate",
      mechanismDescription:
        "Cash balance insufficient to cover operating burn. Negative cash flow requires immediate action: fundraising, burn reduction, or business model reset.",
      evidenceIds: evidence
        .filter((e) => e.dimension === "financial_health")
        .map((e) => e.id),
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [
        "Runway calculation may not reflect available credit facilities",
        "Burn rate may improve with action already underway",
      ],
      missingEvidenceFor: [
        "Detailed cash flow forecast",
        "Access to financing or credit",
        "Path to cash flow break-even",
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
