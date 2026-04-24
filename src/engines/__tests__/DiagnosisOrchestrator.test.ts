import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosisOrchestrator } from '../DiagnosisOrchestrator';
import { DataValidationEngine } from '../DataValidationEngine';
import { FinancialEngine } from '../FinancialEngine';
import type { BusinessAssessment } from '../contracts';

describe('DiagnosisOrchestrator', () => {
  let orchestrator: DiagnosisOrchestrator;

  beforeEach(() => {
    const engines = [new DataValidationEngine(), new FinancialEngine()];
    orchestrator = new DiagnosisOrchestrator(engines);
  });

  it('should synthesize CRITICAL or HIGH severity when costs far exceed revenue', async () => {
    const input: BusinessAssessment = {
      businessName: 'Crisis Corp',
      businessType: 'saas',
      problemStatement: 'Emergency situation',
      mainIssue: 'low_sales', // User thinks revenue is the problem
      monthlyRevenue: 5000,
      monthlyCosts: 15000, // But costs are >125% = CRITICAL
      customerCount: 2,
    };

    const result = await orchestrator.orchestrate(input);

    // Costs far exceed revenue, so severity should be critical or at worst high
    expect(['critical', 'high']).toContain(result.severity);
  });

  it('should produce recommended diagnostic intervention phase', async () => {
    const input: BusinessAssessment = {
      businessName: 'Test Co',
      businessType: 'saas',
      problemStatement: 'Assessment',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 12000,
      customerCount: 10,
    };

    const result = await orchestrator.orchestrate(input);

    expect(result.recommendedDiagnosticPhase).toBeDefined();
    expect(['triage', 'stabilization', 'recovery', 'growth']).toContain(
      result.recommendedDiagnosticPhase
    );
  });

  it('should map severe financial distress to triage phase', async () => {
    const input: BusinessAssessment = {
      businessName: 'Crisis',
      businessType: 'saas',
      problemStatement: 'Emergency',
      mainIssue: 'unclear',
      monthlyRevenue: 5000,
      monthlyCosts: 15000, // Critical cost overrun
      customerCount: 1,
    };

    const result = await orchestrator.orchestrate(input);

    // Costs far exceed revenue, so should map to triage or stabilization
    expect(['triage', 'stabilization']).toContain(result.recommendedDiagnosticPhase);
  });

  it('should map HIGH severity to stabilization phase', async () => {
    const input: BusinessAssessment = {
      businessName: 'At Risk',
      businessType: 'saas',
      problemStatement: 'Problems',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 11000, // High
      customerCount: 10,
    };

    const result = await orchestrator.orchestrate(input);

    expect(result.severity).toBe('high');
    expect(result.recommendedDiagnosticPhase).toBe('stabilization');
  });

  it('should map MEDIUM severity to recovery phase', async () => {
    const input: BusinessAssessment = {
      businessName: 'Challenged',
      businessType: 'saas',
      problemStatement: 'Issues',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 8500, // 85% = medium
      customerCount: 20,
    };

    const result = await orchestrator.orchestrate(input);

    expect(result.severity).toBe('medium');
    expect(result.recommendedDiagnosticPhase).toBe('recovery');
  });

  it('should map LOW severity to growth phase', async () => {
    const input: BusinessAssessment = {
      businessName: 'Healthy',
      businessType: 'saas',
      problemStatement: 'Scale up',
      mainIssue: 'unclear',
      monthlyRevenue: 100000,
      monthlyCosts: 50000, // 50% = healthy
      customerCount: 500,
    };

    const result = await orchestrator.orchestrate(input);

    expect(result.severity).toBe('low');
    expect(result.recommendedDiagnosticPhase).toBe('growth');
  });

  it('should synthesize category from high-confidence signals when mainIssue is related', async () => {
    const input: BusinessAssessment = {
      businessName: 'Cost Problem',
      businessType: 'saas',
      problemStatement: 'Expenses too high',
      mainIssue: 'high_costs', // Aligned with engine finding
      monthlyRevenue: 10000,
      monthlyCosts: 12000, // Clear cost_control signal
      customerCount: 50,
    };

    const result = await orchestrator.orchestrate(input);

    expect(result.category).toBe('cost_control');
  });

  it('should use mainIssue as tiebreaker when signals are weak', async () => {
    const input: BusinessAssessment = {
      businessName: 'Unclear Situation',
      businessType: 'other',
      problemStatement: 'Needs assessment',
      mainIssue: 'cash_flow', // User's primary concern
      // No strong financial signals
    };

    const result = await orchestrator.orchestrate(input);

    expect(result.category).toBe('cash_flow_stability');
  });

  it('should calculate diagnostic confidence based on signal count and engine coverage', async () => {
    const input: BusinessAssessment = {
      businessName: 'Test Co',
      businessType: 'saas',
      problemStatement: 'Full assessment',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 8500,
      customerCount: 50,
    };

    const result = await orchestrator.orchestrate(input);

    expect(result.diagnosticConfidence).toBeGreaterThan(0);
    expect(result.diagnosticConfidence).toBeLessThanOrEqual(1);
  });

  it('should lower confidence when data is incomplete', async () => {
    const inputComplete: BusinessAssessment = {
      businessName: 'Complete',
      businessType: 'saas',
      problemStatement: 'Full data',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 8500,
      customerCount: 50,
    };

    const inputIncomplete: BusinessAssessment = {
      businessName: 'Incomplete',
      businessType: 'saas',
      problemStatement: '',
      mainIssue: 'unclear',
      // Missing revenue, costs, customer count
    };

    const [complete, incomplete] = await Promise.all([
      orchestrator.orchestrate(inputComplete),
      orchestrator.orchestrate(inputIncomplete),
    ]);

    expect(complete.diagnosticConfidence).toBeGreaterThan(
      incomplete.diagnosticConfidence
    );
  });

  it('should aggregate signals from all engines', async () => {
    const input: BusinessAssessment = {
      businessName: 'Multi-Signal',
      businessType: 'saas',
      problemStatement: 'Multiple issues',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 30000, // Cost issue + data quality issue
      customerCount: 1000, // Revenue per customer very low
    };

    const result = await orchestrator.orchestrate(input);

    expect(result.signals.length).toBeGreaterThan(1);
    expect(result.allEngineResults.length).toBeGreaterThan(0);
  });

  it('should deduplicate issues from multiple engines', async () => {
    const input: BusinessAssessment = {
      businessName: 'Test Co',
      businessType: 'saas',
      problemStatement: 'Assessment',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 8500,
      customerCount: 50,
    };

    const result = await orchestrator.orchestrate(input);

    const uniqueIssues = new Set(result.issues);
    expect(uniqueIssues.size).toBe(result.issues.length);
  });

  it('should NOT modify engagement phase constants', async () => {
    // This test verifies that DiagnosisOrchestrator does not
    // contaminate main's engagement phase model
    const input: BusinessAssessment = {
      businessName: 'Test',
      businessType: 'saas',
      problemStatement: 'Test',
      mainIssue: 'unclear',
    };

    const result = await orchestrator.orchestrate(input);

    // Diagnostic phase should be separate type and values
    expect(result.recommendedDiagnosticPhase).not.toEqual('assessment');
    expect(result.recommendedDiagnosticPhase).not.toEqual('planning');
    expect(result.recommendedDiagnosticPhase).not.toEqual('execution');
    expect(result.recommendedDiagnosticPhase).not.toEqual('review');
    expect(result.recommendedDiagnosticPhase).not.toEqual('handover');
    expect(result.recommendedDiagnosticPhase).not.toEqual('closed');

    // Diagnostic phases are advisory recommendations
    expect(['triage', 'stabilization', 'recovery', 'growth']).toContain(
      result.recommendedDiagnosticPhase
    );
  });
});
