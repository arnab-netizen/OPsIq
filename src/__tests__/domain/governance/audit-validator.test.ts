import { describe, it, expect } from 'vitest';
import {
  GovernanceAuditValidator,
  RecommendationRecord,
  DiagnosisRecord,
  LearningProposal,
} from '@/domain/governance/audit-validator';

describe('B26-S1: Governance Audit Validator — Final Hardening', () => {
  const validator = new GovernanceAuditValidator();

  const mockDiagnosis: DiagnosisRecord = {
    id: 'diag-1',
    problem: 'Revenue decline',
    rootCause: 'Marketing under-investment',
    evidence: ['Q1 revenue -15%', 'Customer survey: low brand awareness', 'Marketing spend trending down'],
    confidence: 0.85,
    dataQualityScore: 0.8,
    missingData: ['Competitor pricing'],
    contradictions: [],
  };

  const mockRecommendations: RecommendationRecord[] = [
    {
      id: 'rec-1',
      title: 'Increase marketing spend',
      description: 'Allocate $5K/month to targeted campaigns based on survey feedback',
      evidence: ['Customer survey', 'Historical spend correlation', 'Competitor analysis'],
      confidenceScore: 0.85,
      constraints: ['Budget: $5K/month available'],
      estimatedImpact: 0.2,
    },
  ];

  describe('Recommendation Audit', () => {
    it('should pass valid recommendation with evidence', () => {
      const result = validator.auditRecommendations(mockRecommendations);

      expect(result.valid).toBe(true);
      expect(result.violations.filter((v) => v.severity === 'P0')).toHaveLength(0);
    });

    it('should fail recommendation without evidence', () => {
      const badRec: RecommendationRecord = {
        id: 'rec-2',
        title: 'Scale marketing spend',
        description: 'Just a hunch',
      };

      const result = validator.auditRecommendations([badRec]);

      expect(result.valid).toBe(false);
      const violation = result.violations.find((v) => v.rule === 'EVIDENCE_REQUIRED');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('P0');
    });

    it('should warn about high-confidence recommendation with insufficient evidence', () => {
      const highConfRec: RecommendationRecord = {
        id: 'rec-3',
        title: 'Expand to new market',
        description: 'Very confident move',
        evidence: ['One source only'],
        confidenceScore: 0.9,
      };

      const result = validator.auditRecommendations([highConfRec]);

      const violation = result.violations.find((v) => v.rule === 'HIGH_CONFIDENCE_EVIDENCE_GAP');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('P1');
    });

    it('should warn about high-impact recommendations without description', () => {
      const highImpactRec: RecommendationRecord = {
        id: 'rec-4',
        title: 'Major restructure',
        evidence: ['Evidence 1', 'Evidence 2', 'Evidence 3'],
        confidenceScore: 0.8,
        estimatedImpact: 0.7,
        description: 'Short',
      };

      const result = validator.auditRecommendations([highImpactRec]);

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Diagnosis Audit', () => {
    it('should pass valid diagnosis with evidence and quality', () => {
      const result = validator.auditDiagnosis(mockDiagnosis);

      expect(result.valid).toBe(true);
      expect(result.violations.filter((v) => v.severity === 'P0')).toHaveLength(0);
    });

    it('should fail diagnosis without evidence', () => {
      const badDiag: DiagnosisRecord = {
        id: 'diag-2',
        problem: 'Unknown issue',
      };

      const result = validator.auditDiagnosis(badDiag);

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.rule === 'DIAGNOSIS_EVIDENCE_REQUIRED')).toBe(true);
    });

    it('should fail when confidence exceeds data quality', () => {
      const mismatchDiag: DiagnosisRecord = {
        id: 'diag-3',
        problem: 'High confidence claim',
        evidence: ['One weak source'],
        confidence: 0.9,
        dataQualityScore: 0.3,
      };

      const result = validator.auditDiagnosis(mismatchDiag);

      const violation = result.violations.find((v) => v.rule === 'CONFIDENCE_DATA_QUALITY_MISMATCH');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('P1');
    });

    it('should warn when root cause is not directly supported', () => {
      const unsupportedDiag: DiagnosisRecord = {
        id: 'diag-4',
        problem: 'Revenue drop',
        evidence: ['Sales data down', 'Customer count stable'],
        rootCause: 'Pricing too high', // Not in evidence
        confidence: 0.7,
        dataQualityScore: 0.7,
      };

      const result = validator.auditDiagnosis(unsupportedDiag);

      const violation = result.violations.find((v) => v.rule === 'ROOT_CAUSE_UNSUPPORTED');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('P1');
    });

    it('should warn about high confidence with unresolved contradictions', () => {
      const contradictDiag: DiagnosisRecord = {
        id: 'diag-5',
        problem: 'Market analysis',
        evidence: ['Evidence 1'],
        confidence: 0.9,
        dataQualityScore: 0.8,
        contradictions: ['Market size estimate vs customer surveys disagree'],
      };

      const result = validator.auditDiagnosis(contradictDiag);

      expect(result.warnings.some((w) => w.includes('contradictions'))).toBe(true);
    });
  });

  describe('Learning Promotion Audit', () => {
    it('should pass approved learning with sufficient outcomes', () => {
      const proposal: LearningProposal = {
        id: 'learn-1',
        status: 'approved',
        approvedBy: 'owner-123',
        approvedAt: new Date(),
        ruleName: 'pricing_elasticity',
        verifiedOutcomeCount: 5,
        failureCount: 0,
      };

      const result = validator.auditLearningPromotion(proposal);

      expect(result.valid).toBe(true);
    });

    it('should fail learning with insufficient outcomes', () => {
      const proposal: LearningProposal = {
        id: 'learn-2',
        status: 'pending',
        ruleName: 'market_expansion',
        verifiedOutcomeCount: 1,
        failureCount: 0,
      };

      const result = validator.auditLearningPromotion(proposal);

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.rule === 'LEARNING_INSUFFICIENT_OUTCOMES')).toBe(true);
    });

    it('should fail learning with high failure rate', () => {
      const proposal: LearningProposal = {
        id: 'learn-3',
        status: 'approved',
        ruleName: 'aggressive_growth',
        verifiedOutcomeCount: 5,
        failureCount: 2,
      };

      const result = validator.auditLearningPromotion(proposal);

      expect(result.valid).toBe(false);
      const violation = result.violations.find((v) => v.rule === 'LEARNING_HIGH_FAILURE_RATE');
      expect(violation).toBeDefined();
    });

    it('should fail learning that is not approved', () => {
      const proposal: LearningProposal = {
        id: 'learn-4',
        status: 'pending',
        ruleName: 'test_rule',
        verifiedOutcomeCount: 10,
        failureCount: 1,
      };

      const result = validator.auditLearningPromotion(proposal);

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.rule === 'LEARNING_APPROVAL_REQUIRED')).toBe(true);
    });
  });

  describe('Public Claim Validation', () => {
    it('should fail "consultant-grade" claim without benchmark', () => {
      const claim = 'Our system provides consultant-grade business analysis';

      const result = validator.validatePublicClaim(claim, false);

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.rule === 'CONSULTANT_GRADE_CLAIM_UNSUPPORTED')).toBe(true);
    });

    it('should pass "consultant-grade" claim with benchmark', () => {
      const claim = 'Our system provides consultant-grade business analysis';

      const result = validator.validatePublicClaim(claim, true);

      expect(result.valid).toBe(true);
    });

    it('should fail guarantee claims', () => {
      const claims = [
        'We guarantee your revenue will improve',
        'This will certainly increase your profits',
        'We will improve your cash flow',
      ];

      for (const claim of claims) {
        const result = validator.validatePublicClaim(claim, true);
        expect(result.valid).toBe(false);
        expect(result.violations.some((v) => v.rule === 'GUARANTEE_CLAIM_FORBIDDEN')).toBe(true);
      }
    });

    it('should allow measured claims with caveats', () => {
      const claim = 'Our system can help identify revenue opportunities, subject to data quality and market conditions';

      const result = validator.validatePublicClaim(claim, false);

      expect(result.valid).toBe(true);
    });
  });

  describe('Audit Summarization', () => {
    it('should summarize passing audit', () => {
      const recAudit = validator.auditRecommendations(mockRecommendations);
      const diagAudit = validator.auditDiagnosis(mockDiagnosis);

      const summary = validator.summarizeAudit(recAudit, diagAudit);

      expect(summary.passed).toBe(true);
      expect(summary.p0Count).toBe(0);
      expect(summary.summary).toContain('PASS');
    });

    it('should report violations in summary', () => {
      const badRec: RecommendationRecord = {
        id: 'rec-bad',
        title: 'Unsupported claim',
      };
      const badDiag: DiagnosisRecord = {
        id: 'diag-bad',
        problem: 'No evidence',
      };

      const recAudit = validator.auditRecommendations([badRec]);
      const diagAudit = validator.auditDiagnosis(badDiag);

      const summary = validator.summarizeAudit(recAudit, diagAudit);

      expect(summary.passed).toBe(false);
      expect(summary.p0Count).toBeGreaterThan(0);
      expect(summary.summary).toContain('FAIL');
    });
  });

  describe('Audit Report Generation', () => {
    it('should generate passing report', () => {
      const report = validator.generateAuditReport(mockRecommendations, mockDiagnosis);

      expect(report.canProceed).toBe(true);
      // Mock data has warnings (missing data not documented), so approval may be needed
      expect(report.blockedReasons).toHaveLength(0);
    });

    it('should block on P0 violations', () => {
      const badRecs: RecommendationRecord[] = [
        {
          id: 'rec-1',
          title: 'Unsupported',
        },
      ];
      const badDiag: DiagnosisRecord = {
        id: 'diag-1',
        problem: 'No evidence',
      };

      const report = validator.generateAuditReport(badRecs, badDiag);

      expect(report.canProceed).toBe(false);
      expect(report.blockedReasons.length).toBeGreaterThan(0);
    });
  });

  describe('Acceptance Gates (Protocol §35)', () => {
    it('should enforce no-hallucinated-facts rule', () => {
      const hallucDiag: DiagnosisRecord = {
        id: 'diag-hallu',
        problem: 'Made-up issue',
        evidence: [], // No evidence
        confidence: 0.9,
        dataQualityScore: 0.1,
      };

      const result = validator.auditDiagnosis(hallucDiag);

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.severity === 'P0')).toBe(true);
    });

    it('should enforce all-calculations-reproducible (via evidence)', () => {
      const unreproducibleRec: RecommendationRecord = {
        id: 'rec-unrep',
        title: 'Magic number improvement',
        description: 'We think 42% improvement is possible',
        // No evidence, no basis for the 42%
      };

      const result = validator.auditRecommendations([unreproducibleRec]);

      expect(result.valid).toBe(false);
    });

    it('should enforce learning-promotions-require-approval', () => {
      const unapprovedLearning: LearningProposal = {
        id: 'learn-unapproved',
        status: 'pending',
        ruleName: 'auto_generated_rule',
        verifiedOutcomeCount: 10,
        failureCount: 1,
      };

      const result = validator.auditLearningPromotion(unapprovedLearning);

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.rule === 'LEARNING_APPROVAL_REQUIRED')).toBe(true);
    });

    it('should enforce consultant-grade claim bounds', () => {
      const unboundedClaim = 'Our system provides top-tier consultant-level analysis guaranteed';

      const result = validator.validatePublicClaim(unboundedClaim, false);

      expect(result.valid).toBe(false);
      // Should fail on both consultant-grade claim AND guarantee
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });
});
