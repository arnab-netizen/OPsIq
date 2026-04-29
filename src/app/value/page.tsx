'use client';

import { useState, useEffect } from 'react';

interface ValueMetrics {
  totalGain: number;
  totalLoss: number;
  netImpact: number;
  successRate: number;
}

interface ApiResponse {
  metrics: ValueMetrics;
}

export default function ValuePage() {
  const [metrics, setMetrics] = useState<ValueMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/value/7day');
        if (!response.ok) {
          throw new Error('Failed to fetch metrics');
        }

        const data: ApiResponse = await response.json();
        setMetrics(data.metrics);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        setMetrics(null);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getImpactColor = (impact: number): string => {
    if (impact > 0) return 'text-green-600';
    if (impact < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-6">
      <div className="w-full max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Value Dashboard
          </h1>
          <p className="mt-2 text-xs md:text-sm text-muted-foreground">
            Last 7 days performance
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/5 p-3 md:p-4 mb-6">
            <p className="text-xs md:text-sm font-medium text-destructive">
              {error}
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="space-y-3 md:space-y-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-muted p-4 md:p-6 animate-pulse"
              >
                <div className="h-6 bg-muted-foreground/20 rounded mb-2 w-1/3"></div>
                <div className="h-8 bg-muted-foreground/20 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        )}

        {/* Metrics Grid */}
        {!loading && metrics && (
          <div className="space-y-3 md:space-y-4">
            {/* Gained */}
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 md:p-6">
              <p className="text-xs md:text-sm font-medium uppercase text-muted-foreground">
                Revenue Gained
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <p className="text-2xl md:text-4xl font-bold text-green-600">
                  {formatCurrency(metrics.totalGain)}
                </p>
              </div>
              <p className="mt-2 text-xs text-green-700">
                Positive decisions realized
              </p>
            </div>

            {/* Lost */}
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 md:p-6">
              <p className="text-xs md:text-sm font-medium uppercase text-muted-foreground">
                Revenue Lost
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <p className="text-2xl md:text-4xl font-bold text-red-600">
                  {formatCurrency(metrics.totalLoss)}
                </p>
              </div>
              <p className="mt-2 text-xs text-red-700">
                Negative decisions impact
              </p>
            </div>

            {/* Net Impact */}
            <div
              className={`rounded-lg border p-4 md:p-6 ${
                metrics.netImpact >= 0
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-orange-200 bg-orange-50'
              }`}
            >
              <p className="text-xs md:text-sm font-medium uppercase text-muted-foreground">
                Net Impact
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <p
                  className={`text-2xl md:text-4xl font-bold ${getImpactColor(
                    metrics.netImpact
                  )}`}
                >
                  {metrics.netImpact >= 0 ? '+' : ''}
                  {formatCurrency(metrics.netImpact)}
                </p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {metrics.netImpact >= 0
                  ? 'Organization created value'
                  : 'Organization lost value'}
              </p>
            </div>

            {/* System Reliability */}
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 md:p-6">
              <p className="text-xs md:text-sm font-medium uppercase text-muted-foreground">
                System Reliability
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <p className="text-2xl md:text-4xl font-bold text-purple-600">
                  {metrics.successRate.toFixed(1)}%
                </p>
              </div>
              <div className="mt-3 w-full bg-purple-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(metrics.successRate, 100)}%` }}
                ></div>
              </div>
              <p className="mt-2 text-xs text-purple-700">
                Decision success rate
              </p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !metrics && !error && (
          <div className="rounded-lg border border-border bg-muted/5 p-6 md:p-8 text-center">
            <p className="text-sm md:text-base text-muted-foreground">
              No data available
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Complete some decisions to see metrics
            </p>
          </div>
        )}

        {/* Info Footer */}
        <div className="mt-6 md:mt-8 rounded-lg border border-border bg-muted/5 p-3 md:p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium">Last 7 Days:</span> This dashboard shows
            metrics for decisions completed in the last 7 days. Net Impact = Revenue
            Gained - Revenue Lost. System Reliability = percentage of decisions with
            positive outcomes.
          </p>
        </div>
      </div>
    </div>
  );
}
