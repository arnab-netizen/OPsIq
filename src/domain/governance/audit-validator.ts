/**
 * Governance Audit Validator (B26-S1).
 * Final hardening layer that enforces safety rules across the system.
 * Ensures no recommendations escape without evidence, no hallucinated facts, etc.
 */

export interface GovernanceAuditResult {
  valid: boolean;
  violations: GovernanceViolation[];
  warnings: string[];
}

export interface GovernanceViolation {
  rule: string;
  severity: 'P0' | 'P1' | 'P2';
  message: string;
  affectedRecords?: string[];
}

export interface RecommendationRecord {
  id: string;
  title: string;
  description?: string;
  evidence?: string[];
  confidenceScore?: number;
  constraints?: string[];
  estimatedImpact?: number;
}

export interface DiagnosisRecord {
  id: string;
  problem: string;
  rootCause?: string;
  evidence?: string[];
  confidence?: number;
  dataQualityScore?: number;
  missingData?: string[];
  contradictions?: string[];
}

export interface LearningPromosal {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: Date;
  ruleName: string;
  verifiedOutcomeCount: number;
  failureCount: number;
}

export class GovernanceAuditValidator {
  /**
   * Audit recommendations for safety violations.
   * Rules:
   * - All recommendations must cite evidence
   * - Confidence must reflect evidence quality
   * - High-confidence recommendations must have high-quality evidence
   * - Risk disclosures required for high-impact recommendations
   */
  auditRecommendations(recommendations: RecommendationRecord[]): GovernanceAuditResult {
    const violations: GovernanceViolation[] = [];
    const warnings: string[] = [];

    for (const rec of recommendations) {
      // Rule 1: Evidence requirement
      if (!rec.evidence || rec.evidence.length === 0) {
        violations.push({
          rule: 'EVIDENCE_REQUIRED',
          severity: 'P0',
          message: `Recommendation "${rec.title}" has no evidence`,
          affectedRecords: [rec.id],
        });
      }

      // Rule 2: High confidence requires high-quality evidence
      if (rec.confidenceScore && rec.confidenceScore > 0.8) {
        if (!rec.evidence || rec.evidence.length < 2) {
          violations.push({
            rule: 'HIGH_CONFIDENCE_EVIDENCE_GAP',
            severity: 'P1',
            message: `High-confidence recommendation "${rec.title}" lacks sufficient evidence (${rec.evidence?.length ?? 0} sources)`,
            affectedRecords: [rec.id],
          });
        }
      }

      // Rule 3: High-impact recommendations need risk disclosure
      if (rec.estimatedImpact && rec.estimatedImpact > 0.5) {
        // In real impl, would check for risk/mitigation fields
        if (!rec.description || rec.description.length < 20) {
          warnings.push(
            `High-impact recommendation "${rec.title}" has minimal description (${rec.description?.length ?? 0} chars)`,
          );
        }
      }

      // Rule 4: Constraint alignment
      if (rec.constraints && rec.constraints.length > 0) {
        // Recommendations should acknowledge known constraints
        // This is advisory in current implementation
      }
    }

    return {
      valid: violations.filter((v) => v.severity === 'P0' || v.severity === 'P1').length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Audit diagnosis for hallucination and data quality issues.
   * Rules:
   * - Evidence must be non-empty for diagnosis
   * - Confidence must be supported by evidence quality
   * - Missing data must be disclosed
   * - Contradictions must be flagged
   * - No unsupported root causes
   */
  auditDiagnosis(diagnosis: DiagnosisRecord): GovernanceAuditResult {
    const violations: GovernanceViolation[] = [];
    const warnings: string[] = [];

    // Rule 1: Evidence for diagnosis
    if (!diagnosis.evidence || diagnosis.evidence.length === 0) {
      violations.push({
        rule: 'DIAGNOSIS_EVIDENCE_REQUIRED',
        severity: 'P0',
        message: `Diagnosis "${diagnosis.problem}" has no evidence`,
        affectedRecords: [diagnosis.id],
      });
    }

    // Rule 2: Confidence reflects data quality
    if (diagnosis.confidence && diagnosis.dataQualityScore) {
      if (diagnosis.dataQualityScore < 0.5 && diagnosis.confidence > 0.7) {
        violations.push({
          rule: 'CONFIDENCE_DATA_QUALITY_MISMATCH',
          severity: 'P1',
          message: `Diagnosis has high confidence (${diagnosis.confidence}) but low data quality (${diagnosis.dataQualityScore})`,
          affectedRecords: [diagnosis.id],
        });
      }
    }

    // Rule 3: Missing data disclosure
    if (!diagnosis.missingData || diagnosis.missingData.length === 0) {
      if (diagnosis.dataQualityScore && diagnosis.dataQualityScore < 0.7) {
        warnings.push(
          `Diagnosis with low data quality (${diagnosis.dataQualityScore}) does not document missing data`,
        );
      }
    }

    // Rule 4: Contradiction disclosure
    if (diagnosis.contradictions && diagnosis.contradictions.length > 0) {
      // Contradictions should lower confidence
      if (diagnosis.confidence && diagnosis.confidence > 0.8) {
        warnings.push(
          `Diagnosis has unresolved contradictions but high confidence (${diagnosis.confidence})`,
        );
      }
    }

    // Rule 5: Root cause support
    if (diagnosis.rootCause && diagnosis.evidence) {
      const rootCauseSupported = diagnosis.evidence.some((e) =>
        e.toLowerCase().includes(diagnosis.rootCause?.toLowerCase() ?? ''),
      );
      if (!rootCauseSupported) {
        violations.push({
          rule: 'ROOT_CAUSE_UNSUPPORTED',
          severity: 'P1',
          message: `Root cause "${diagnosis.rootCause}" is not directly supported by evidence`,
          affectedRecords: [diagnosis.id],
        });
      }
    }

    return {
      valid: violations.filter((v) => v.severity === 'P0').length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Audit learning promotions before approval.
   * Rules:
   * - Only approved with sufficient verified outcomes
   * - Low failure rate required
   * - Must have explicit approval before production use
   */
  auditLearningPromotion(proposal: LearningPromosal): GovernanceAuditResult {
    const violations: GovernanceViolation[] = [];
    const warnings: string[] = [];

    // Rule 1: Verified outcome requirement
    if (proposal.verifiedOutcomeCount < 3) {
      violations.push({
        rule: 'LEARNING_INSUFFICIENT_OUTCOMES',
        severity: 'P1',
        message: `Learning proposal "${proposal.ruleName}" has only ${proposal.verifiedOutcomeCount} verified outcomes (minimum 3 required)`,
        affectedRecords: [proposal.id],
      });
    }

    // Rule 2: Failure rate check
    if (proposal.verifiedOutcomeCount > 0) {
      const failureRate = proposal.failureCount / (proposal.verifiedOutcomeCount + proposal.failureCount);
      if (failureRate > 0.2) {
        violations.push({
          rule: 'LEARNING_HIGH_FAILURE_RATE',
          severity: 'P1',
          message: `Learning proposal has ${(failureRate * 100).toFixed(1)}% failure rate (max 20% allowed)`,
          affectedRecords: [proposal.id],
        });
      }
    }

    // Rule 3: Approval requirement
    if (proposal.status !== 'approved') {
      violations.push({
        rule: 'LEARNING_APPROVAL_REQUIRED',
        severity: 'P0',
        message: `Learning proposal "${proposal.ruleName}" is in "${proposal.status}" status (must be approved)`,
        affectedRecords: [proposal.id],
      });
    }

    return {
      valid: violations.filter((v) => v.severity === 'P0' || v.severity === 'P1').length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Validate public-facing claims about the system.
   * Rules:
   * - Cannot claim "consultant-grade" without benchmark evidence
   * - Cannot guarantee outcomes
   * - Must disclose limitations
   */
  validatePublicClaim(claim: string, hasConsultantBenchmark: boolean): GovernanceAuditResult {
    const violations: GovernanceViolation[] = [];

    // Rule 1: "Consultant-grade" requires evidence
    if (
      claim.toLowerCase().includes('consultant-grade') ||
      claim.toLowerCase().includes('expert-level') ||
      claim.toLowerCase().includes('top-tier')
    ) {
      if (!hasConsultantBenchmark) {
        violations.push({
          rule: 'CONSULTANT_GRADE_CLAIM_UNSUPPORTED',
          severity: 'P0',
          message: 'Cannot claim "consultant-grade" without benchmark evidence supporting this level',
          affectedRecords: [],
        });
      }
    }

    // Rule 2: Guarantee prohibition
    if (
      claim.toLowerCase().includes('guarantee') ||
      claim.toLowerCase().includes('will improve') ||
      claim.toLowerCase().includes('certain')
    ) {
      violations.push({
        rule: 'GUARANTEE_CLAIM_FORBIDDEN',
        severity: 'P0',
        message: 'System cannot make outcome guarantees',
        affectedRecords: [],
      });
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings: [],
    };
  }

  /**
   * Summarize audit results with severity breakdown.
   */
  summarizeAudit(
    recommendations: GovernanceAuditResult,
    diagnosis: GovernanceAuditResult,
    learning?: GovernanceAuditResult,
  ): {
    summary: string;
    p0Count: number;
    p1Count: number;
    passed: boolean;
  } {
    const allResults = [recommendations, diagnosis, ...(learning ? [learning] : [])];
    const allViolations = allResults.flatMap((r) => r.violations);

    const p0 = allViolations.filter((v) => v.severity === 'P0').length;
    const p1 = allViolations.filter((v) => v.severity === 'P1').length;

    const passed = p0 === 0;

    let summary = 'Governance Audit: ';
    if (passed) {
      summary += `✅ PASS (${p1} P1 warnings)`;
    } else {
      summary += `❌ FAIL (${p0} P0 violations, ${p1} P1 warnings)`;
    }

    return { summary, p0Count: p0, p1Count: p1, passed };
  }

  /**
   * Generate audit report suitable for approval workflow.
   */
  generateAuditReport(
    recommendations: RecommendationRecord[],
    diagnosis: DiagnosisRecord,
  ): {
    summary: string;
    canProceed: boolean;
    requiresApproval: boolean;
    blockedReasons: string[];
  } {
    const recAudit = this.auditRecommendations(recommendations);
    const diagAudit = this.auditDiagnosis(diagnosis);

    const summary = this.summarizeAudit(recAudit, diagAudit);
    const blockedReasons = [
      ...recAudit.violations.filter((v) => v.severity === 'P0').map((v) => v.message),
      ...diagAudit.violations.filter((v) => v.severity === 'P0').map((v) => v.message),
    ];

    return {
      summary: summary.summary,
      canProceed: summary.passed && blockedReasons.length === 0,
      requiresApproval: !summary.passed || recAudit.warnings.length > 0 || diagAudit.warnings.length > 0,
      blockedReasons,
    };
  }
}
