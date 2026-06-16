import { EvidenceItem, DiagnosisType } from "@/domain/consulting-engine/types";

export enum EvidenceRole {
  ROOT_CAUSE = "ROOT_CAUSE",
  SYMPTOM = "SYMPTOM",
  CONTRIBUTING = "CONTRIBUTING",
  UNRELATED = "UNRELATED",
}

export interface EvidenceClassification {
  evidenceId: string;
  role: EvidenceRole;
  confidence: 1 | 2 | 3 | 4 | 5; // 1=uncertain, 5=certain
  reasoning: string;
}

export class SymptomSeparator {
  // Known symptom-to-root-cause mappings
  private readonly symptomMappings: Record<string, Record<string, EvidenceRole>> = {
    "financial_health": {
      "UNIT_ECONOMICS_BREAKDOWN": EvidenceRole.SYMPTOM, // margin decline is symptom, not root
      "DEMAND_FORECASTING_MISMATCH": EvidenceRole.SYMPTOM,
      "OPERATIONAL_BOTTLENECK": EvidenceRole.SYMPTOM,
    },
    "operational_efficiency": {
      "OPERATIONAL_BOTTLENECK": EvidenceRole.ROOT_CAUSE,
      "UNIT_ECONOMICS_BREAKDOWN": EvidenceRole.ROOT_CAUSE,
      "DEMAND_FORECASTING_MISMATCH": EvidenceRole.CONTRIBUTING,
    },
    "customer_retention": {
      "TRUST_QUALITY_CRISIS": EvidenceRole.SYMPTOM,
      "GO_TO_MARKET_MISALIGNMENT": EvidenceRole.SYMPTOM,
      "CUSTOMER_RETENTION_EROSION": EvidenceRole.ROOT_CAUSE,
    },
    "quality_delivery": {
      "TRUST_QUALITY_CRISIS": EvidenceRole.ROOT_CAUSE,
      "QUALITY_CONTROL_FAILURE": EvidenceRole.ROOT_CAUSE,
      "CUSTOMER_RETENTION_EROSION": EvidenceRole.ROOT_CAUSE,
    },
    "team_capability": {
      "OPERATIONAL_BOTTLENECK": EvidenceRole.ROOT_CAUSE,
      "GOVERNANCE_COMPLIANCE_FAILURE": EvidenceRole.ROOT_CAUSE,
    },
    "market_position": {
      "GO_TO_MARKET_MISALIGNMENT": EvidenceRole.ROOT_CAUSE,
      "DEMAND_FORECASTING_MISMATCH": EvidenceRole.ROOT_CAUSE,
    },
  };

  classifyEvidence(
    evidence: EvidenceItem,
    hypothesis: DiagnosisType
  ): EvidenceClassification {
    const dimensionMappings = this.symptomMappings[evidence.dimension] || {};
    const mappedRole = dimensionMappings[hypothesis];

    if (mappedRole) {
      const confidence = this.assessConfidence(evidence, mappedRole);
      return {
        evidenceId: evidence.id,
        role: mappedRole,
        confidence,
        reasoning: this.generateReasoning(evidence, hypothesis, mappedRole),
      };
    }

    // Fallback: classify based on finding content
    return this.inferRole(evidence, hypothesis);
  }

  private assessConfidence(
    evidence: EvidenceItem,
    role: EvidenceRole
  ): 1 | 2 | 3 | 4 | 5 {
    let baseConfidence = 3;

    // Critical evidence increases confidence
    if (evidence.isCritical) baseConfidence = 4;

    // HIGH confidence findings increase confidence
    if (evidence.confidence === "HIGH") baseConfidence = Math.min(5, baseConfidence + 1);

    // PROVISIONAL confidence lowers confidence
    if (evidence.confidence === "PROVISIONAL") baseConfidence = Math.max(1, baseConfidence - 1);

    return Math.min(5, Math.max(1, baseConfidence)) as 1 | 2 | 3 | 4 | 5;
  }

  private generateReasoning(
    evidence: EvidenceItem,
    hypothesis: DiagnosisType,
    role: EvidenceRole
  ): string {
    const dimensionStr = evidence.dimension.replace(/_/g, " ");

    switch (role) {
      case EvidenceRole.ROOT_CAUSE:
        return `${dimensionStr} issue is a root cause of ${hypothesis}`;
      case EvidenceRole.SYMPTOM:
        return `${dimensionStr} issue is a symptom of ${hypothesis}`;
      case EvidenceRole.CONTRIBUTING:
        return `${dimensionStr} issue contributes to ${hypothesis} but is not the root cause`;
      case EvidenceRole.UNRELATED:
        return `${dimensionStr} issue appears unrelated to ${hypothesis}`;
    }
  }

  private inferRole(
    evidence: EvidenceItem,
    hypothesis: DiagnosisType
  ): EvidenceClassification {
    // Infer based on keywords in the finding
    const finding = evidence.finding.toLowerCase();

    let role = EvidenceRole.UNRELATED;
    let confidence: 1 | 2 | 3 | 4 | 5 = 1;

    if (
      finding.includes("decline") ||
      finding.includes("drop") ||
      finding.includes("down")
    ) {
      role = EvidenceRole.SYMPTOM;
      confidence = 2;
    } else if (
      finding.includes("cost") ||
      finding.includes("expense") ||
      finding.includes("inefficient")
    ) {
      role = EvidenceRole.ROOT_CAUSE;
      confidence = 2;
    }

    if (evidence.isCritical) confidence = Math.min(5, (confidence + 2) as any) as 1 | 2 | 3 | 4 | 5;

    return {
      evidenceId: evidence.id,
      role,
      confidence,
      reasoning: this.generateReasoning(evidence, hypothesis, role),
    };
  }
}
