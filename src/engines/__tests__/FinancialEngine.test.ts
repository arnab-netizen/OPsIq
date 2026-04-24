import { describe, it, expect } from '@jest/globals';
import { FinancialEngine } from '../FinancialEngine';
import type { BusinessAssessment } from '../contracts';

describe('FinancialEngine', () => {
  const engine = new FinancialEngine();

  it('should signal CRITICAL when costs exceed revenue by >25%', async () => {
    const input: BusinessAssessment = {
      businessName: 'Test Co',
      businessType: 'saas',
      problemStatement: 'Losing money',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 13000, // 130% = >25% loss
      customerCount: 10,
    };

    const result = await engine.assess(input);

    const criticalSignal = result.signals.find((s) => s.severity === 'critical');
    expect(criticalSignal).toBeDefined();
    expect(criticalSignal?.category).toBe('cost_control');
    expect(criticalSignal?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('should signal HIGH when costs exceed revenue', async () => {
    const input: BusinessAssessment = {
      businessName: 'Test Co',
      businessType: 'saas',
      problemStatement: 'Breaking even issues',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 11000, // 110% = high
      customerCount: 10,
    };

    const result = await engine.assess(input);

    const highSignal = result.signals.find((s) => s.severity === 'high');
    expect(highSignal).toBeDefined();
    expect(highSignal?.message).toContain('Costs exceed revenue');
  });

  it('should signal CRITICAL when customer count is zero', async () => {
    const input: BusinessAssessment = {
      businessName: 'Test Co',
      businessType: 'saas',
      problemStatement: 'No customers',
      mainIssue: 'low_sales',
      customerCount: 0,
    };

    const result = await engine.assess(input);

    const criticalSignal = result.signals.find((s) => s.severity === 'critical');
    expect(criticalSignal).toBeDefined();
    expect(criticalSignal?.message).toContain('No sustainable customer base');
  });

  it('should signal HIGH when customer count is very low (<5) with revenue', async () => {
    const input: BusinessAssessment = {
      businessName: 'Test Co',
      businessType: 'saas',
      problemStatement: 'Few customers',
      mainIssue: 'customer_retention',
      monthlyRevenue: 1000,
      customerCount: 3,
    };

    const result = await engine.assess(input);

    const highSignal = result.signals.find((s) => s.severity === 'high');
    expect(highSignal).toBeDefined();
    expect(highSignal?.category).toBe('customer_retention');
  });

  it('should return low confidence with insufficient financial data', async () => {
    const input: BusinessAssessment = {
      businessName: 'Test Co',
      businessType: 'saas',
      problemStatement: 'No financial data',
      mainIssue: 'unclear',
    };

    const result = await engine.assess(input);

    const lowConfidenceSignal = result.signals.find((s) => s.confidence <= 0.3);
    expect(lowConfidenceSignal).toBeDefined();
    expect(lowConfidenceSignal?.message).toContain('Insufficient financial data');
  });

  it('should classify revenue scale correctly', async () => {
    const input: BusinessAssessment = {
      businessName: 'Test Co',
      businessType: 'saas',
      problemStatement: 'Micro business',
      mainIssue: 'low_sales',
      monthlyRevenue: 5000,
      customerCount: 5,
    };

    const result = await engine.assess(input);

    expect(result.metadata.revenueScale).toBe('micro');
  });

  it('should calculate revenue per customer', async () => {
    const input: BusinessAssessment = {
      businessName: 'Test Co',
      businessType: 'saas',
      problemStatement: 'Revenue analysis',
      mainIssue: 'unclear',
      monthlyRevenue: 10000,
      customerCount: 100,
    };

    const result = await engine.assess(input);

    expect(result.metadata.revenuePerCustomer).toBe(100);
  });

  it('should signal MEDIUM for healthy but low margin (80% costs)', async () => {
    const input: BusinessAssessment = {
      businessName: 'Test Co',
      businessType: 'saas',
      problemStatement: 'Tight margins',
      mainIssue: 'high_costs',
      monthlyRevenue: 10000,
      monthlyCosts: 8000, // 80% = medium warning
      customerCount: 10,
    };

    const result = await engine.assess(input);

    const mediumSignal = result.signals.find((s) => s.severity === 'medium');
    expect(mediumSignal).toBeDefined();
    expect(mediumSignal?.message).toContain('80%+');
  });

  it('should signal LOW for healthy cost structure', async () => {
    const input: BusinessAssessment = {
      businessName: 'Test Co',
      businessType: 'saas',
      problemStatement: 'Good margins',
      mainIssue: 'unclear',
      monthlyRevenue: 10000,
      monthlyCosts: 6000, // 60% = healthy
      customerCount: 100,
    };

    const result = await engine.assess(input);

    const lowSignal = result.signals.find((s) => s.severity === 'low' && s.message.includes('healthy'));
    expect(lowSignal).toBeDefined();
  });
});
