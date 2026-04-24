import { describe, it, expect } from '@jest/globals';
import { DataValidationEngine } from '../DataValidationEngine';
import type { BusinessAssessment } from '../contracts';

describe('DataValidationEngine', () => {
  const engine = new DataValidationEngine();

  it('should detect unusually high revenue per customer', async () => {
    const input: BusinessAssessment = {
      businessName: 'Premium Service',
      businessType: 'services',
      problemStatement: 'High ticket sales',
      mainIssue: 'unclear',
      monthlyRevenue: 50000,
      customerCount: 10, // $5000 per customer = high
    };

    const result = await engine.assess(input);

    const anomalySignal = result.signals.find((s) =>
      s.message.includes('unusually high')
    );
    expect(anomalySignal).toBeDefined();
    expect(anomalySignal?.severity).toBe('medium');
  });

  it('should detect unusually low revenue per customer', async () => {
    const input: BusinessAssessment = {
      businessName: 'Low Price Service',
      businessType: 'services',
      problemStatement: 'Low ticket sales',
      mainIssue: 'unclear',
      monthlyRevenue: 100,
      customerCount: 100, // $1 per customer = very low
    };

    const result = await engine.assess(input);

    const anomalySignal = result.signals.find((s) =>
      s.message.includes('unusually low')
    );
    expect(anomalySignal).toBeDefined();
    expect(anomalySignal?.severity).toBe('medium');
  });

  it('should detect severe cost overrun (>2x revenue)', async () => {
    const input: BusinessAssessment = {
      businessName: 'Burning Cash',
      businessType: 'saas',
      problemStatement: 'Cash burn crisis',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 25000, // 2.5x = critical burn
    };

    const result = await engine.assess(input);

    const costSignal = result.signals.find((s) =>
      s.message.includes('Costs exceed revenue by >2x')
    );
    expect(costSignal).toBeDefined();
    expect(costSignal?.severity).toBe('high');
  });

  it('should flag limited financial data when completeness <60%', async () => {
    const input: BusinessAssessment = {
      businessName: 'Minimal Data',
      businessType: 'other',
      problemStatement: '',
      mainIssue: 'unclear',
      // Only providing 3 fields out of 7 = 43% completeness
    };

    const result = await engine.assess(input);

    const dataSignal = result.signals.find((s) =>
      s.message.includes('Limited financial data')
    );
    expect(dataSignal).toBeDefined();
    expect(dataSignal?.severity).toBe('low');
  });

  it('should calculate data completeness correctly', async () => {
    const input: BusinessAssessment = {
      businessName: 'Full Data',
      businessType: 'saas',
      problemStatement: 'Full assessment',
      mainIssue: 'low_sales',
      monthlyRevenue: 10000,
      monthlyCosts: 8000,
      customerCount: 50,
      // All 7 fields provided = 100% completeness
    };

    const result = await engine.assess(input);

    expect(result.metadata.dataCompleteness).toBe(1);
  });

  it('should calculate data quality score based on signals and completeness', async () => {
    const input: BusinessAssessment = {
      businessName: 'Test Co',
      businessType: 'saas',
      problemStatement: 'Test',
      mainIssue: 'unclear',
      monthlyRevenue: 10000,
      monthlyCosts: 8000,
      customerCount: 50,
    };

    const result = await engine.assess(input);

    expect(result.metadata.dataQualityScore).toBeGreaterThan(0);
    expect(result.metadata.dataQualityScore).toBeLessThanOrEqual(1);
  });

  it('should not flag anomalies for normal revenue per customer ($10-$2000)', async () => {
    const input: BusinessAssessment = {
      businessName: 'Normal Business',
      businessType: 'ecommerce',
      problemStatement: 'Normal metrics',
      mainIssue: 'unclear',
      monthlyRevenue: 10000,
      customerCount: 200, // $50 per customer = normal
    };

    const result = await engine.assess(input);

    const anomalySignals = result.signals.filter((s) =>
      s.source === 'data_quality'
    );
    expect(anomalySignals.length).toBe(0);
  });

  it('should penalize data quality score for critical data issues', async () => {
    const input: BusinessAssessment = {
      businessName: 'Inconsistent',
      businessType: 'saas',
      problemStatement: 'Red flags',
      mainIssue: 'unclear',
      monthlyRevenue: 10000,
      monthlyCosts: 30000, // Critical cost overrun
      customerCount: 1, // Low customer count
    };

    const result = await engine.assess(input);

    expect(result.metadata.dataQualityScore).toBeLessThan(0.8);
  });
});
