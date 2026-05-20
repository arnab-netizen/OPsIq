'use client';

import { useEffect, useState } from 'react';
import type { CalibrationMetrics } from '@/services/calibration/engine';
import type { ValueMetrics } from '@/services/value/tracker';
import {
  classifyOperatorError,
  type ErrorGovernanceContext,
} from '@/lib/operator-error-governance';

interface TrustCardProps {
  calibrationMetrics?: CalibrationMetrics | null;
  valueMetrics?: ValueMetrics | null;
  loading?: boolean;
  error?: string | null;
}

export function TrustCard({
  calibrationMetrics,
  valueMetrics,
  loading: initialLoading = false,
  error: initialError = null
}: TrustCardProps) {
  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState(initialError);
  const [calibration, setCalibration] = useState<CalibrationMetrics | null>(calibrationMetrics || null);
  const [value, setValue] = useState<ValueMetrics | null>(valueMetrics || null);

  useEffect(() => {
    if (calibrationMetrics && valueMetrics) {
      return; // Data provided as props
    }

    const fetchMetrics = async () => {
      setLoading(true);
      setError(null);
      try {
        const [calibRes, valueRes] = await Promise.all([
          fetch('/api/calibration'),
          fetch('/api/value'),
        ]);

        if (!calibRes.ok || !valueRes.ok) {
          throw new Error('Failed to fetch metrics');
        }

        const calibData = await calibRes.json();
        const valueData = await valueRes.json();

        // Handle new segmented response format: extract overall metrics
        const calibMetrics = calibData.overall || calibData;
        setCalibration(calibMetrics);
        setValue(valueData);
      } catch (err) {
        const context: ErrorGovernanceContext = {
          context: "load",
        };
        const governed = classifyOperatorError(err, context);
        setError(governed.operatorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [calibrationMetrics, valueMetrics]);

  // Use provided data or fetched data
  const metrics = calibrationMetrics || calibration;
  const valueInfo = valueMetrics || value;

  const getAccuracyColor = (accuracy: number | null) => {
    if (accuracy === null) return 'text-muted-foreground';
    if (accuracy >= 0.9 && accuracy <= 1.1) return 'text-success';
    if (accuracy < 0.9) return 'text-warning';
    return 'text-warning';
  };

  const getAccuracyLabel = (accuracy: number | null) => {
    if (accuracy === null) return 'Unknown';
    if (accuracy >= 0.9 && accuracy <= 1.1) return 'On Track';
    if (accuracy < 0.9) return 'Underperforming';
    return 'Overperforming';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="mt-6 md:mt-8 rounded-lg border border-border bg-card p-4 md:p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base md:text-lg font-semibold text-foreground">
            System Trust Score
          </h3>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Based on prediction vs reality across past decisions
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded border border-destructive bg-destructive/5 p-3 mb-4">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <div className="h-16 rounded bg-muted animate-pulse" />
          <div className="h-12 rounded bg-muted animate-pulse" />
          <div className="h-12 rounded bg-muted animate-pulse" />
        </div>
      ) : metrics && metrics.valid ? (
        <div className="space-y-4">
          {/* Business Value Metrics */}
          {valueInfo && valueInfo.valid && (
            <div className="border-b border-border pb-4 space-y-3">
              {valueInfo.totalDelta > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Financial Gain</span>
                  <span className="text-lg font-bold text-success">
                    {formatCurrency(valueInfo.totalDelta)}
                  </span>
                </div>
              )}
              {valueInfo.lossFromWrongDecisions > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Loss from Wrong Decisions</span>
                  <span className="text-lg font-bold text-destructive">
                    -{formatCurrency(valueInfo.lossFromWrongDecisions)}
                  </span>
                </div>
              )}
              {valueInfo.roi !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">ROI</span>
                  <span className={`text-lg font-bold ${valueInfo.roi >= 1 ? 'text-success' : 'text-destructive'}`}>
                    {(valueInfo.roi * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* System Reliability (Weighted Accuracy) */}
          {metrics.weightedAccuracy !== null && (
            <div className="border-b border-border pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">System Reliability</span>
                <span className={`text-lg font-bold ${
                  metrics.weightedAccuracy * 100 >= 80 ? 'text-success' :
                  metrics.weightedAccuracy * 100 >= 60 ? 'text-warning' :
                  'text-destructive'
                }`}>
                  {(metrics.weightedAccuracy * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Weighted by decision impact
              </p>
            </div>
          )}

          {/* Success Rate */}
          <div className="border-b border-border pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Success Rate</span>
              <span className={`text-lg font-bold ${metrics.successRate !== null && metrics.successRate >= 70 ? 'text-success' : metrics.successRate !== null && metrics.successRate >= 50 ? 'text-warning' : 'text-destructive'}`}>
                {metrics.successRate !== null ? `${metrics.successRate.toFixed(1)}%` : 'N/A'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.itemsAnalyzed} decision{metrics.itemsAnalyzed !== 1 ? 's' : ''} completed
            </p>
          </div>

          {/* Accuracy */}
          <div className="border-b border-border pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Prediction Accuracy</span>
              <div className="text-right">
                <div className={`text-lg font-bold ${getAccuracyColor(metrics.avgAccuracy)}`}>
                  {metrics.avgAccuracy !== null ? `${(metrics.avgAccuracy * 100).toFixed(0)}%` : 'N/A'}
                </div>
                <div className={`text-xs font-medium ${getAccuracyColor(metrics.avgAccuracy)}`}>
                  {getAccuracyLabel(metrics.avgAccuracy)}
                </div>
              </div>
            </div>
          </div>

          {/* Average Error */}
          <div className="pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Avg Error (actual vs expected)</span>
              <span className="text-lg font-bold text-foreground">
                {metrics.avgError !== null ? `${metrics.avgError > 0 ? '+' : ''}${metrics.avgError.toFixed(2)}` : 'N/A'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.avgError !== null && metrics.avgError > 0
                ? 'Outcomes tend to exceed expectations'
                : metrics.avgError !== null && metrics.avgError < 0
                ? 'Outcomes tend to fall short of expectations'
                : 'Outcomes match expectations on average'}
            </p>
          </div>

          {/* Trust Summary */}
          <div className="rounded bg-muted/50 p-3 mt-4">
            <p className="text-xs md:text-sm text-foreground leading-relaxed">
              <span className="font-semibold">Prediction vs Reality:</span> Over {metrics.itemsAnalyzed} past decisions,
              the system predicts outcomes with {metrics.avgAccuracy !== null ? `~${(Math.abs(1 - metrics.avgAccuracy) * 100).toFixed(0)}%` : 'unknown'} average deviation from actual results.
              {metrics.successRate !== null && metrics.successRate >= 70
                ? ' High confidence in system predictions.'
                : metrics.successRate !== null && metrics.successRate >= 50
                ? ' Moderate confidence in system predictions.'
                : ' Low confidence - review predictions carefully.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded bg-muted/50 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            No calibration data available yet. Submit decisions to build system reliability metrics.
          </p>
        </div>
      )}
    </div>
  );
}
