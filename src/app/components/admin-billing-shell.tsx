/**
 * ADDENDUM F: Admin Billing UI Mock-Backed Shell
 *
 * React component for admin billing interface with mock Stripe responses.
 * Provides UI for plan management, usage tracking, invoicing.
 * Ready for integration with real Stripe API once database available.
 *
 * Non-DB: Contains only UI rendering with mock data (no persistence).
 */

'use client';

import React, { useState } from 'react';
import { z } from 'zod';

// ============================================================================
// MOCK DATA SCHEMAS
// ============================================================================

export const BillingPlanSchema = z.object({
  planId: z.string(),
  name: z.string(),
  monthlyPrice: z.number(),
  features: z.array(z.string()),
  usageLimit: z.number().optional(),
  billingCycle: z.enum(['monthly', 'annual']),
  isCurrentPlan: z.boolean(),
  nextBillingDate: z.date().optional(),
});

export type BillingPlan = z.infer<typeof BillingPlanSchema>;

export const UsageMetricSchema = z.object({
  metric: z.string(),
  current: z.number(),
  limit: z.number().optional(),
  unit: z.string(),
  percentageUsed: z.number().min(0).max(100),
  status: z.enum(['normal', 'warning', 'critical']),
});

export type UsageMetric = z.infer<typeof UsageMetricSchema>;

export const InvoiceSchema = z.object({
  invoiceId: z.string(),
  date: z.date(),
  amount: z.number(),
  status: z.enum(['paid', 'pending', 'failed', 'draft']),
  description: z.string(),
  downloadUrl: z.string().optional(),
  dueDate: z.date().optional(),
});

export type Invoice = z.infer<typeof InvoiceSchema>;

export const BillingAccountSchema = z.object({
  workspaceId: z.string(),
  currentPlan: BillingPlanSchema,
  billingEmail: z.string().email(),
  usageMetrics: z.array(UsageMetricSchema),
  upcomingInvoice: z.number().optional(),
  nextBillingDate: z.date(),
  recentInvoices: z.array(InvoiceSchema),
  paymentMethods: z.array(
    z.object({
      methodId: z.string(),
      type: z.enum(['card', 'bank']),
      last4: z.string(),
      isDefault: z.boolean(),
      expiryDate: z.string().optional(),
    }),
  ),
  subscriptionStatus: z.enum(['active', 'paused', 'canceled']),
});

export type BillingAccount = z.infer<typeof BillingAccountSchema>;

// ============================================================================
// MOCK DATA GENERATORS
// ============================================================================

export function generateMockBillingPlans(): BillingPlan[] {
  return [
    {
      planId: 'starter',
      name: 'Starter',
      monthlyPrice: 29,
      features: [
        'Up to 5 users',
        '10GB storage',
        'Basic analytics',
        'Email support',
      ],
      usageLimit: 10,
      billingCycle: 'monthly',
      isCurrentPlan: true,
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    {
      planId: 'professional',
      name: 'Professional',
      monthlyPrice: 99,
      features: [
        'Up to 25 users',
        '100GB storage',
        'Advanced analytics',
        'Priority support',
        'Custom integrations',
      ],
      usageLimit: 100,
      billingCycle: 'monthly',
      isCurrentPlan: false,
    },
    {
      planId: 'enterprise',
      name: 'Enterprise',
      monthlyPrice: 299,
      features: [
        'Unlimited users',
        'Unlimited storage',
        'Custom analytics',
        '24/7 phone support',
        'Dedicated account manager',
        'SLA guarantee',
      ],
      billingCycle: 'monthly',
      isCurrentPlan: false,
    },
  ];
}

export function generateMockUsageMetrics(): UsageMetric[] {
  return [
    {
      metric: 'Active Users',
      current: 4,
      limit: 5,
      unit: 'users',
      percentageUsed: 80,
      status: 'warning',
    },
    {
      metric: 'API Calls',
      current: 45000,
      limit: 100000,
      unit: 'calls/month',
      percentageUsed: 45,
      status: 'normal',
    },
    {
      metric: 'Storage Used',
      current: 7.5,
      limit: 10,
      unit: 'GB',
      percentageUsed: 75,
      status: 'warning',
    },
    {
      metric: 'Email Notifications',
      current: 2500,
      limit: 5000,
      unit: 'emails/month',
      percentageUsed: 50,
      status: 'normal',
    },
  ];
}

export function generateMockInvoices(): Invoice[] {
  const now = new Date();
  return [
    {
      invoiceId: 'inv_2024_03_001',
      date: new Date(now.getFullYear(), now.getMonth(), 1),
      amount: 29.0,
      status: 'paid',
      description: 'Starter plan - March 2026',
      downloadUrl: '/invoices/inv_2024_03_001.pdf',
      dueDate: new Date(now.getFullYear(), now.getMonth(), 15),
    },
    {
      invoiceId: 'inv_2024_02_001',
      date: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      amount: 29.0,
      status: 'paid',
      description: 'Starter plan - February 2026',
      downloadUrl: '/invoices/inv_2024_02_001.pdf',
    },
    {
      invoiceId: 'inv_2024_01_001',
      date: new Date(now.getFullYear(), now.getMonth() - 2, 1),
      amount: 29.0,
      status: 'paid',
      description: 'Starter plan - January 2026',
      downloadUrl: '/invoices/inv_2024_01_001.pdf',
    },
  ];
}

export function generateMockBillingAccount(): BillingAccount {
  const now = new Date();
  return {
    workspaceId: 'ws_test',
    currentPlan: generateMockBillingPlans()[0]!,
    billingEmail: 'admin@example.com',
    usageMetrics: generateMockUsageMetrics(),
    upcomingInvoice: 29.0,
    nextBillingDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    recentInvoices: generateMockInvoices(),
    paymentMethods: [
      {
        methodId: 'pm_1',
        type: 'card',
        last4: '4242',
        isDefault: true,
        expiryDate: '12/26',
      },
      {
        methodId: 'pm_2',
        type: 'card',
        last4: '5555',
        isDefault: false,
        expiryDate: '06/25',
      },
    ],
    subscriptionStatus: 'active',
  };
}

// ============================================================================
// ADMIN BILLING UI COMPONENT
// ============================================================================

export function AdminBillingShell() {
  const [billingAccount] = useState<BillingAccount>(generateMockBillingAccount());
  const [availablePlans] = useState<BillingPlan[]>(generateMockBillingPlans());
  const [showPlanSelector, setShowPlanSelector] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(null);

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'normal':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'critical':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusBgColor = (status: string): string => {
    switch (status) {
      case 'normal':
        return 'bg-green-50';
      case 'warning':
        return 'bg-yellow-50';
      case 'critical':
        return 'bg-red-50';
      default:
        return 'bg-gray-50';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Billing & Plans</h1>
          <p className="text-gray-600 mt-2">Manage your subscription, usage, and billing information</p>
        </div>

        {/* Current Plan Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Plan</h2>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-lg font-semibold text-gray-900">{billingAccount.currentPlan.name}</p>
              <p className="text-gray-600">{formatCurrency(billingAccount.currentPlan.monthlyPrice)}/month</p>
              <p className="text-sm text-gray-500 mt-2">
                Next billing date: {billingAccount.nextBillingDate.toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => setShowPlanSelector(!showPlanSelector)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Change Plan
            </button>
          </div>

          {/* Plan Features */}
          <div className="mt-6 pt-6 border-t">
            <p className="text-sm font-semibold text-gray-900 mb-3">Included Features:</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {billingAccount.currentPlan.features.map((feature, idx) => (
                <li key={idx} className="text-sm text-gray-600 flex items-center">
                  <span className="text-green-600 mr-2">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Plan Selector Modal */}
        {showPlanSelector && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full">
              <h3 className="text-2xl font-semibold text-gray-900 mb-6">Select a Plan</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {availablePlans.map((plan) => (
                  <div
                    key={plan.planId}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition ${
                      selectedPlan?.planId === plan.planId
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-400'
                    }`}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    <p className="font-semibold text-lg text-gray-900">{plan.name}</p>
                    <p className="text-xl font-bold text-gray-900 mt-2">{formatCurrency(plan.monthlyPrice)}</p>
                    <p className="text-sm text-gray-600 mt-4">Features:</p>
                    <ul className="mt-2 space-y-1">
                      {plan.features.slice(0, 3).map((feature, idx) => (
                        <li key={idx} className="text-xs text-gray-600">
                          • {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setShowPlanSelector(false);
                    setSelectedPlan(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  disabled={!selectedPlan}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
                >
                  Upgrade Plan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Usage Metrics */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Usage This Month</h2>
          <div className="space-y-4">
            {billingAccount.usageMetrics.map((metric) => (
              <div
                key={metric.metric}
                className={`p-4 rounded-lg ${getStatusBgColor(metric.status)}`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold text-gray-900">{metric.metric}</span>
                  <span className={`font-bold ${getStatusColor(metric.status)}`}>
                    {metric.current} {metric.unit}
                    {metric.limit && ` / ${metric.limit} ${metric.unit}`}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition ${
                      metric.status === 'normal'
                        ? 'bg-green-600'
                        : metric.status === 'warning'
                          ? 'bg-yellow-600'
                          : 'bg-red-600'
                    }`}
                    style={{ width: `${Math.min(metric.percentageUsed, 100)}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600 mt-2">{metric.percentageUsed.toFixed(1)}% used</p>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Invoice */}
        {billingAccount.upcomingInvoice && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8 border-l-4 border-blue-600">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Upcoming Invoice</h2>
            <p className="text-lg text-gray-900">
              {formatCurrency(billingAccount.upcomingInvoice)}
            </p>
            <p className="text-sm text-gray-600">
              Due on {billingAccount.nextBillingDate.toLocaleDateString()}
            </p>
          </div>
        )}

        {/* Billing History */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Billing History</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Invoice</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Date</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Amount</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {billingAccount.recentInvoices.map((invoice) => (
                  <tr key={invoice.invoiceId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{invoice.invoiceId}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{invoice.date.toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{formatCurrency(invoice.amount)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          invoice.status === 'paid'
                            ? 'bg-green-100 text-green-800'
                            : invoice.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button className="text-blue-600 hover:text-blue-800 font-medium">
                        {invoice.downloadUrl ? 'Download' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Methods (Simple Display) */}
        <div className="bg-white rounded-lg shadow-md p-6 mt-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Methods</h2>
          <div className="space-y-3">
            {billingAccount.paymentMethods.map((method) => (
              <div key={method.methodId} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center">
                  <span className="text-gray-600 mr-3">
                    {method.type === 'card' ? '💳' : '🏦'}
                  </span>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {method.type === 'card' ? 'Card' : 'Bank Account'} ending in {method.last4}
                    </p>
                    {method.expiryDate && (
                      <p className="text-sm text-gray-600">Expires {method.expiryDate}</p>
                    )}
                  </div>
                </div>
                {method.isDefault && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-semibold">
                    Default
                  </span>
                )}
              </div>
            ))}
          </div>
          <button className="mt-4 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition w-full">
            Add Payment Method
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminBillingShell;
