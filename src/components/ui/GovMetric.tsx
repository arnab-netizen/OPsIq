"use client";

/**
 * Governed Metric Component
 *
 * Renders metrics with mandatory explanation, interpretation, and guidance.
 * Every metric must use this component - raw metric display is not allowed.
 */

import { useState } from "react";
import {
  getMetricDefinition,
  getMetricInterpretation,
  getMetricSeverity,
  formatMetricValue,
  type MetricName,
} from "@/lib/metric-registry";

export interface GovMetricProps {
  name: MetricName;
  value: number;
  size?: "sm" | "md" | "lg";
  showInterpretation?: boolean;
  showAction?: boolean;
  onActionClick?: () => void;
}

/**
 * Governed metric display with mandatory explanation
 */
export function GovMetric({
  name,
  value,
  size = "md",
  showInterpretation = true,
  showAction = true,
  onActionClick,
}: GovMetricProps) {
  const [showExplanation, setShowExplanation] = useState(false);
  const definition = getMetricDefinition(name);
  const severity = getMetricSeverity(name, value);
  const interpretation = getMetricInterpretation(name, value);
  const formatted = formatMetricValue(name, value);

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  const severityColors = {
    normal: "text-gray-700",
    warning: "text-yellow-600",
    critical: "text-red-600",
  };

  const severityBg = {
    normal: "bg-gray-50",
    warning: "bg-yellow-50",
    critical: "bg-red-50",
  };

  return (
    <div
      className={`rounded-lg p-3 ${severityBg[severity]} border ${
        severity === "normal"
          ? "border-gray-200"
          : severity === "warning"
            ? "border-yellow-200"
            : "border-red-200"
      }`}
    >
      {/* Main metric display */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <div className="text-xs font-medium text-gray-500 uppercase">
            {definition.displayName}
          </div>
          <div
            className={`${sizeClasses[size]} font-semibold ${severityColors[severity]}`}
          >
            {formatted}
          </div>
        </div>

        {/* Help icon - click to show explanation */}
        <button
          type="button"
          onClick={() => setShowExplanation(!showExplanation)}
          className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition"
          title={`What is ${definition.displayName}?`}
          aria-label={`Explanation for ${definition.displayName}`}
        >
          <span className="text-xs font-bold">?</span>
        </button>
      </div>

      {/* Interpretation (always shown by default) */}
      {showInterpretation && (
        <div className="mt-2 text-sm text-gray-600">
          <strong>What this means:</strong> {interpretation}
        </div>
      )}

      {/* Explanation popup (shown on click) */}
      {showExplanation && (
        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
          <div className="text-sm font-medium text-gray-700">
            {definition.displayName}
          </div>
          <p className="text-sm text-gray-600">{definition.fullExplanation}</p>

          {definition.examples.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-gray-600 mb-1">
                Examples:
              </div>
              <ul className="text-xs text-gray-600 space-y-1">
                {definition.examples.map((example, i) => (
                  <li key={i} className="list-disc list-inside">
                    {example}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended action */}
          {showAction && definition.recommendedAction && (
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded p-2">
              <div className="text-xs font-medium text-blue-700 mb-1">
                Suggested action:
              </div>
              <p className="text-xs text-blue-600 mb-2">
                {definition.recommendedAction.action}
              </p>
              {onActionClick && (
                <button
                  type="button"
                  onClick={onActionClick}
                  className="inline-block text-xs font-medium text-blue-600 hover:text-blue-700 underline"
                >
                  View options →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Severity indicator label */}
      {severity !== "normal" && (
        <div className="mt-2 text-xs font-medium">
          {severity === "warning" && (
            <span className="text-yellow-600">⚠️ Worth noting</span>
          )}
          {severity === "critical" && (
            <span className="text-red-600">🔴 Needs attention</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Inline metric help - smaller version for table cells, lists
 */
export function GovMetricInline({
  name,
  value,
}: {
  name: MetricName;
  value: number;
}) {
  const definition = getMetricDefinition(name);
  const interpretation = getMetricInterpretation(name, value);
  const severity = getMetricSeverity(name, value);
  const formatted = formatMetricValue(name, value);

  const severityIndicator = {
    normal: "🟢",
    warning: "🟡",
    critical: "🔴",
  };

  return (
    <div
      className="inline-flex items-center gap-1 group relative"
      title={`${definition.displayName}: ${interpretation}`}
    >
      <span className="font-semibold">{formatted}</span>
      <span className="text-xs">{severityIndicator[severity]}</span>

      {/* Tooltip on hover */}
      <div className="absolute bottom-full left-0 mb-2 w-48 bg-gray-900 text-white text-xs rounded px-2 py-1 opacity-0 pointer-events-none group-hover:opacity-100 transition">
        {interpretation}
      </div>
    </div>
  );
}

/**
 * Metric card for dashboards
 */
export function GovMetricCard({
  name,
  value,
  trend,
  target,
}: {
  name: MetricName;
  value: number;
  trend?: "up" | "down" | "stable";
  target?: number;
}) {
  const definition = getMetricDefinition(name);
  const severity = getMetricSeverity(name, value);
  const formatted = formatMetricValue(name, value);

  const trendIcon = {
    up: "📈",
    down: "📉",
    stable: "➡️",
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase">
            {definition.displayName}
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatted}</div>
        </div>
        {trend && (
          <span className="text-lg" title={`Trend: ${trend}`}>
            {trendIcon[trend]}
          </span>
        )}
      </div>

      {target && (
        <div className="text-xs text-gray-600 mb-2">
          Target: {target}
          {definition.scale.unit}
        </div>
      )}

      <div className="text-sm text-gray-600">
        {severity === "critical" && (
          <span className="text-red-600">🔴 Needs immediate attention</span>
        )}
        {severity === "warning" && (
          <span className="text-yellow-600">🟡 Monitor closely</span>
        )}
        {severity === "normal" && (
          <span className="text-green-600">🟢 On track</span>
        )}
      </div>
    </div>
  );
}

/**
 * Metric comparison (side by side)
 */
export function GovMetricComparison({
  metrics,
}: {
  metrics: Array<{ name: MetricName; value: number; label: string }>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {metrics.map((metric) => (
        <div key={metric.name}>
          <div className="text-xs font-medium text-gray-600 mb-2">
            {metric.label}
          </div>
          <GovMetric
            name={metric.name}
            value={metric.value}
            size="lg"
            showInterpretation={true}
            showAction={false}
          />
        </div>
      ))}
    </div>
  );
}
