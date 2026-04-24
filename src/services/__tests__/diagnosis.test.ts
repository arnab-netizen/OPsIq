import { describe, it, expect, beforeEach, vi } from 'vitest';
import { performDiagnosis, type DiagnosisRequest, type DiagnosisResult } from '../diagnosis';

// Mock audit event emission
vi.mock('@/infra/audit', () => ({
  emitAuditEvent: vi.fn(),
}));

vi.mock('@/infra/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Diagnosis Service', () => {
  const actorId = 'test-user-123';

  it('should perform diagnosis and return structured result', async () => {
    const request: DiagnosisRequest = {
      businessName: 'Test Corp',
      businessType: 'saas',
      problemStatement: 'Facing financial challenges',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 8500,
      customerCount: 50,
    };

    const result = await performDiagnosis(request, actorId);

    expect(result).toHaveProperty('severity');
    expect(result).toHaveProperty('primaryProblemCategory');
    expect(result).toHaveProperty('diagnosticInterventionPhase');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('findings');
    expect(result).toHaveProperty('recommendations');
    expect(result).toHaveProperty('actionPlan');
    expect(result).toHaveProperty('executiveBrief');
    expect(result).toHaveProperty('dataWarnings');
    expect(result).toHaveProperty('engineMetadata');
  });

  it('should include diagnost icInterventionPhase (NOT main engagement phase)', async () => {
    const request: DiagnosisRequest = {
      businessName: 'Test Corp',
      businessType: 'saas',
      problemStatement: 'Test',
      mainIssue: 'high_costs',
      monthlyRevenue: 5000,
      monthlyCosts: 15000, // Critical
    };

    const result = await performDiagnosis(request, actorId);

    // Should have diagnostic phase, not engagement phase
    expect(result.diagnosticInterventionPhase).toBeDefined();
    expect(['triage', 'stabilization', 'recovery', 'growth']).toContain(
      result.diagnosticInterventionPhase
    );

    // Should NOT have engagement phase values
    expect(result.diagnosticInterventionPhase).not.toEqual('assessment');
    expect(result.diagnosticInterventionPhase).not.toEqual('planning');
    expect(result.diagnosticInterventionPhase).not.toEqual('execution');
  });

  it('should include all engine metadata', async () => {
    const request: DiagnosisRequest = {
      businessName: 'Test Corp',
      businessType: 'saas',
      problemStatement: 'Test',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 8500,
    };

    const result = await performDiagnosis(request, actorId);

    expect(result.engineMetadata.orchestratedDiagnosis).toBeDefined();
    expect(result.engineMetadata.enginesUsed).toContain('DataValidation');
    expect(result.engineMetadata.enginesUsed).toContain('Financial');
    expect(result.engineMetadata.diagnosticSources.length).toBeGreaterThan(0);
  });

  it('should map severity to correct diagnostic phase', async () => {
    const criticalRequest: DiagnosisRequest = {
      businessName: 'Crisis',
      businessType: 'saas',
      problemStatement: 'Emergency',
      mainIssue: 'unclear',
      monthlyRevenue: 5000,
      monthlyCosts: 15000,
    };

    const result = await performDiagnosis(criticalRequest, actorId);

    expect(result.severity).toBe('critical');
    expect(result.diagnosticInterventionPhase).toBe('triage');
  });

  it('should generate findings from high-confidence signals', async () => {
    const request: DiagnosisRequest = {
      businessName: 'Test Corp',
      businessType: 'saas',
      problemStatement: 'Cost issues',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 8500,
      customerCount: 50,
    };

    const result = await performDiagnosis(request, actorId);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((f) => typeof f === 'string')).toBe(true);
  });

  it('should generate recommendations based on severity and category', async () => {
    const request: DiagnosisRequest = {
      businessName: 'Critical Case',
      businessType: 'saas',
      problemStatement: 'Emergency situation',
      mainIssue: 'high_costs',
      monthlyRevenue: 5000,
      monthlyCosts: 15000, // Critical
    };

    const result = await performDiagnosis(request, actorId);

    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0].toLowerCase()).toContain('immediate');
  });

  it('should create actionable plan with timeline indicators', async () => {
    const request: DiagnosisRequest = {
      businessName: 'Test Corp',
      businessType: 'saas',
      problemStatement: 'Multiple issues',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 12000, // High severity
    };

    const result = await performDiagnosis(request, actorId);

    expect(result.actionPlan.length).toBeGreaterThan(0);
    const planText = result.actionPlan.join(' ').toUpperCase();
    expect(planText).toMatch(/URGENT|IMMEDIATE|WEEK/);
  });

  it('should generate executive brief with key metrics', async () => {
    const request: DiagnosisRequest = {
      businessName: 'Test Corp',
      businessType: 'saas',
      problemStatement: 'Test',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 8500,
    };

    const result = await performDiagnosis(request, actorId);

    expect(result.executiveBrief).toContain('Test Corp');
    expect(result.executiveBrief).toContain('%');
  });

  it('should include data warnings from validation engine', async () => {
    const request: DiagnosisRequest = {
      businessName: 'Inconsistent Data',
      businessType: 'saas',
      problemStatement: 'Data quality issues',
      mainIssue: 'unclear',
      monthlyRevenue: 10000,
      monthlyCosts: 30000, // Extreme overrun = warning
      customerCount: 1000, // Low revenue per customer = warning
    };

    const result = await performDiagnosis(request, actorId);

    expect(result.dataWarnings.length).toBeGreaterThan(0);
  });

  it('should throw ValidationError for missing required fields', async () => {
    const invalidRequest: any = {
      businessType: 'saas', // Missing businessName
      problemStatement: 'Test',
      mainIssue: 'high_costs',
    };

    await expect(performDiagnosis(invalidRequest, actorId)).rejects.toThrow();
  });

  it('should include confidence score in result', async () => {
    const request: DiagnosisRequest = {
      businessName: 'Test Corp',
      businessType: 'saas',
      problemStatement: 'Test',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 8500,
      customerCount: 50,
    };

    const result = await performDiagnosis(request, actorId);

    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('should set lower confidence with incomplete data', async () => {
    const completeRequest: DiagnosisRequest = {
      businessName: 'Complete',
      businessType: 'saas',
      problemStatement: 'Complete data',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 8500,
      customerCount: 50,
    };

    const incompleteRequest: DiagnosisRequest = {
      businessName: 'Incomplete',
      businessType: 'other',
      problemStatement: '',
      mainIssue: 'unclear',
      // No financial data
    };

    const [complete, incomplete] = await Promise.all([
      performDiagnosis(completeRequest, actorId),
      performDiagnosis(incompleteRequest, actorId),
    ]);

    expect(complete.confidence).toBeGreaterThan(incomplete.confidence);
  });

  it('should NOT modify main engagement phase model', async () => {
    const request: DiagnosisRequest = {
      businessName: 'Test Corp',
      businessType: 'saas',
      problemStatement: 'Test',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 8500,
    };

    const result = await performDiagnosis(request, actorId);

    // Result should have diagnosticInterventionPhase, not interventionPhase
    expect(result).toHaveProperty('diagnosticInterventionPhase');
    expect(result).not.toHaveProperty('interventionPhase');

    // Diagnostic phase should not be engagement phase values
    const engagementPhases = ['assessment', 'planning', 'execution', 'review', 'handover', 'closed'];
    expect(engagementPhases).not.toContain(result.diagnosticInterventionPhase);
  });
});
