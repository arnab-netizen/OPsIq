'use client';

import { useEffect, useState } from 'react';
import type { CalibrationMetrics } from '@/services/calibration/engine';

interface TrustCardProps {
  metrics?: CalibrationMetrics | null;
  loading?: boolean;
  error?: string | null;
}

export function TrustCard({ metrics, loading = false, error = null }: TrustCardProps) {
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
        </div>
      ) : metrics && metrics.valid ? (
        <div className="space-y-4">
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
