import { describe, it, expect } from 'vitest';
import {
  BillingPlanSchema,
  UsageMetricSchema,
  InvoiceSchema,
  BillingAccountSchema,
  generateMockBillingPlans,
  generateMockUsageMetrics,
  generateMockInvoices,
  generateMockBillingAccount,
  type BillingPlan,
  type UsageMetric,
  type Invoice,
  type BillingAccount,
} from '@/app/components/admin-billing-shell';

describe('ADDENDUM F: Admin Billing UI Mock-Backed Shell', () => {
  describe('Billing Plan Schema', () => {
    it('should validate billing plan schema', () => {
      const plan: BillingPlan = {
        planId: 'starter',
        name: 'Starter',
        monthlyPrice: 29,
        features: ['Feature 1', 'Feature 2'],
        billingCycle: 'monthly',
        isCurrentPlan: true,
      };

      const result = BillingPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it('should validate plan with optional fields', () => {
      const plan: BillingPlan = {
        planId: 'professional',
        name: 'Professional',
        monthlyPrice: 99,
        features: ['Feature 1', 'Feature 2', 'Feature 3'],
        usageLimit: 100,
        billingCycle: 'monthly',
        isCurrentPlan: false,
        nextBillingDate: new Date(),
      };

      const result = BillingPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it('should require plan name and price', () => {
      const invalidPlan = {
        planId: 'starter',
        features: [],
        billingCycle: 'monthly',
        isCurrentPlan: true,
      };

      const result = BillingPlanSchema.safeParse(invalidPlan);
      expect(result.success).toBe(false);
    });
  });

  describe('Usage Metric Schema', () => {
    it('should validate usage metric schema', () => {
      const metric: UsageMetric = {
        metric: 'API Calls',
        current: 45000,
        limit: 100000,
        unit: 'calls/month',
        percentageUsed: 45,
        status: 'normal',
      };

      const result = UsageMetricSchema.safeParse(metric);
      expect(result.success).toBe(true);
    });

    it('should validate warning status', () => {
      const metric: UsageMetric = {
        metric: 'Storage',
        current: 8,
        limit: 10,
        unit: 'GB',
        percentageUsed: 80,
        status: 'warning',
      };

      const result = UsageMetricSchema.safeParse(metric);
      expect(result.success).toBe(true);
    });

    it('should validate critical status', () => {
      const metric: UsageMetric = {
        metric: 'Users',
        current: 5,
        limit: 5,
        unit: 'users',
        percentageUsed: 100,
        status: 'critical',
      };

      const result = UsageMetricSchema.safeParse(metric);
      expect(result.success).toBe(true);
    });

    it('should enforce percentage bounds 0-100', () => {
      const invalidMetric = {
        metric: 'Test',
        current: 100,
        unit: 'units',
        percentageUsed: 150,
        status: 'normal',
      };

      const result = UsageMetricSchema.safeParse(invalidMetric);
      expect(result.success).toBe(false);
    });
  });

  describe('Invoice Schema', () => {
    it('should validate invoice schema', () => {
      const invoice: Invoice = {
        invoiceId: 'inv_001',
        date: new Date(),
        amount: 29.0,
        status: 'paid',
        description: 'Monthly subscription',
      };

      const result = InvoiceSchema.safeParse(invoice);
      expect(result.success).toBe(true);
    });

    it('should validate invoice with optional fields', () => {
      const invoice: Invoice = {
        invoiceId: 'inv_002',
        date: new Date(),
        amount: 99.0,
        status: 'pending',
        description: 'Professional plan',
        downloadUrl: '/invoices/inv_002.pdf',
        dueDate: new Date(),
      };

      const result = InvoiceSchema.safeParse(invoice);
      expect(result.success).toBe(true);
    });

    it('should validate all invoice statuses', () => {
      const statuses: Array<'paid' | 'pending' | 'failed' | 'draft'> = ['paid', 'pending', 'failed', 'draft'];

      for (const status of statuses) {
        const invoice: Invoice = {
          invoiceId: `inv_${status}`,
          date: new Date(),
          amount: 29.0,
          status,
          description: 'Test invoice',
        };

        const result = InvoiceSchema.safeParse(invoice);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Billing Account Schema', () => {
    it('should validate billing account schema', () => {
      const account: BillingAccount = {
        workspaceId: 'ws_1',
        currentPlan: {
          planId: 'starter',
          name: 'Starter',
          monthlyPrice: 29,
          features: ['Feature 1'],
          billingCycle: 'monthly',
          isCurrentPlan: true,
        },
        billingEmail: 'admin@example.com',
        usageMetrics: [
          {
            metric: 'API Calls',
            current: 45000,
            limit: 100000,
            unit: 'calls/month',
            percentageUsed: 45,
            status: 'normal',
          },
        ],
        nextBillingDate: new Date(),
        recentInvoices: [],
        paymentMethods: [],
        subscriptionStatus: 'active',
      };

      const result = BillingAccountSchema.safeParse(account);
      expect(result.success).toBe(true);
    });

    it('should validate subscription statuses', () => {
      const account: BillingAccount = {
        workspaceId: 'ws_1',
        currentPlan: {
          planId: 'starter',
          name: 'Starter',
          monthlyPrice: 29,
          features: [],
          billingCycle: 'monthly',
          isCurrentPlan: true,
        },
        billingEmail: 'admin@example.com',
        usageMetrics: [],
        nextBillingDate: new Date(),
        recentInvoices: [],
        paymentMethods: [],
        subscriptionStatus: 'active',
      };

      const result = BillingAccountSchema.safeParse(account);
      expect(result.success).toBe(true);
    });
  });

  describe('Mock Plan Generation', () => {
    it('should generate billing plans', () => {
      const plans = generateMockBillingPlans();
      expect(plans.length).toBeGreaterThan(0);
    });

    it('should include starter, professional, and enterprise plans', () => {
      const plans = generateMockBillingPlans();
      const planIds = plans.map((p) => p.planId);

      expect(planIds).toContain('starter');
      expect(planIds).toContain('professional');
      expect(planIds).toContain('enterprise');
    });

    it('should mark one plan as current', () => {
      const plans = generateMockBillingPlans();
      const currentPlans = plans.filter((p) => p.isCurrentPlan);

      expect(currentPlans.length).toBeGreaterThanOrEqual(1);
    });

    it('should have realistic pricing', () => {
      const plans = generateMockBillingPlans();

      expect(plans[0]?.monthlyPrice).toBeLessThan(plans[1]?.monthlyPrice ?? 0);
      expect(plans[1]?.monthlyPrice).toBeLessThan(plans[2]?.monthlyPrice ?? 0);
    });

    it('should validate all generated plans', () => {
      const plans = generateMockBillingPlans();

      for (const plan of plans) {
        const result = BillingPlanSchema.safeParse(plan);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Mock Usage Metrics Generation', () => {
    it('should generate usage metrics', () => {
      const metrics = generateMockUsageMetrics();
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should track multiple metric types', () => {
      const metrics = generateMockUsageMetrics();
      const metricNames = metrics.map((m) => m.metric);

      expect(metricNames.some((m) => m.includes('Users'))).toBe(true);
      expect(metricNames.some((m) => m.includes('API'))).toBe(true);
      expect(metricNames.some((m) => m.includes('Storage'))).toBe(true);
    });

    it('should have varied statuses', () => {
      const metrics = generateMockUsageMetrics();
      const statuses = new Set(metrics.map((m) => m.status));

      expect(statuses.size).toBeGreaterThan(1);
    });

    it('should validate all generated metrics', () => {
      const metrics = generateMockUsageMetrics();

      for (const metric of metrics) {
        const result = UsageMetricSchema.safeParse(metric);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Mock Invoice Generation', () => {
    it('should generate invoices', () => {
      const invoices = generateMockInvoices();
      expect(invoices.length).toBeGreaterThan(0);
    });

    it('should have invoices from different months', () => {
      const invoices = generateMockInvoices();
      const dates = invoices.map((i) => i.date.toISOString().substring(0, 7));
      const uniqueDates = new Set(dates);

      expect(uniqueDates.size).toBeGreaterThan(1);
    });

    it('should mark invoices as paid', () => {
      const invoices = generateMockInvoices();
      const paidInvoices = invoices.filter((i) => i.status === 'paid');

      expect(paidInvoices.length).toBeGreaterThan(0);
    });

    it('should validate all generated invoices', () => {
      const invoices = generateMockInvoices();

      for (const invoice of invoices) {
        const result = InvoiceSchema.safeParse(invoice);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Mock Billing Account Generation', () => {
    it('should generate complete billing account', () => {
      const account = generateMockBillingAccount();

      expect(account.workspaceId).toBeDefined();
      expect(account.billingEmail).toBeDefined();
      expect(account.currentPlan).toBeDefined();
      expect(account.usageMetrics.length).toBeGreaterThan(0);
      expect(account.recentInvoices.length).toBeGreaterThan(0);
    });

    it('should have valid subscription status', () => {
      const account = generateMockBillingAccount();

      expect(['active', 'paused', 'canceled']).toContain(account.subscriptionStatus);
    });

    it('should have payment methods', () => {
      const account = generateMockBillingAccount();

      expect(account.paymentMethods.length).toBeGreaterThan(0);
    });

    it('should mark default payment method', () => {
      const account = generateMockBillingAccount();
      const defaultMethods = account.paymentMethods.filter((pm) => pm.isDefault);

      expect(defaultMethods.length).toBeGreaterThanOrEqual(1);
    });

    it('should validate generated account', () => {
      const account = generateMockBillingAccount();
      const result = BillingAccountSchema.safeParse(account);

      expect(result.success).toBe(true);
    });

    it('should have valid next billing date', () => {
      const account = generateMockBillingAccount();

      expect(account.nextBillingDate.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Comprehensive Billing UI Coverage', () => {
    it('should provide all billing components', () => {
      const account = generateMockBillingAccount();
      const plans = generateMockBillingPlans();

      expect(account.currentPlan).toBeDefined();
      expect(plans.length).toBeGreaterThan(0);
      expect(account.usageMetrics.length).toBeGreaterThan(0);
      expect(account.recentInvoices.length).toBeGreaterThan(0);
    });

    it('should support plan upgrades/downgrades', () => {
      const plans = generateMockBillingPlans();

      expect(plans.some((p) => !p.isCurrentPlan)).toBe(true);
    });

    it('should track usage with limits', () => {
      const metrics = generateMockUsageMetrics();
      const withLimits = metrics.filter((m) => m.limit !== undefined);

      expect(withLimits.length).toBeGreaterThan(0);
    });

    it('should have invoice download capability', () => {
      const invoices = generateMockInvoices();
      const downloadable = invoices.filter((i) => i.downloadUrl);

      expect(downloadable.length).toBeGreaterThan(0);
    });

    it('should handle large number of plans', () => {
      const plans = Array.from({ length: 10 }, (_, i) => {
        const basePlan = generateMockBillingPlans()[0]!;
        return {
          ...basePlan,
          planId: `plan_${i}`,
          monthlyPrice: 29 + i * 20,
        };
      });

      expect(plans).toHaveLength(10);
      for (const plan of plans) {
        const result = BillingPlanSchema.safeParse(plan);
        expect(result.success).toBe(true);
      }
    });
  });
});
