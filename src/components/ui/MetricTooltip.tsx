/**
 * Metric Tooltip Component
 *
 * Explains what each metric means in plain, non-technical language.
 * Appears as "?" icon that shows explanation on hover/click.
 */

"use client";

import { useState } from "react";

export type MetricType = "confidence" | "priority" | "impact";

interface MetricTooltipProps {
  metric: MetricType;
  value?: number | string;
  className?: string;
}

const METRIC_EXPLANATIONS: Record<MetricType, { title: string; explanation: string; examples: string[] }> = {
  confidence: {
    title: "How sure are we this will work?",
    explanation:
      "This is how confident we are in this recommendation based on the evidence we've gathered. " +
      "Higher confidence means we have strong data supporting this decision.",
    examples: [
      "0-50: Uncertain, multiple unknowns or limited data",
      "50-75: Pretty confident, solid evidence and experience",
      "75-100: Very confident, strong data and clear patterns",
    ],
  },
  priority: {
    title: "When should you do this?",
    explanation:
      "This tells you how urgent this action is. HIGH priority items block other work and should be done soon. " +
      "LOW priority items can wait until you have time.",
    examples: [
      "HIGH: Do today or tomorrow - this is blocking something else",
      "MEDIUM: Do this week - important but not urgent",
      "LOW: Do when you can - nice to have, no deadline",
    ],
  },
  impact: {
    title: "How much will this improve things?",
    explanation:
      "This shows how much this decision will change your business metrics if you go ahead with it. " +
      "HIGH impact means big improvements. LOW impact means small improvements.",
    examples: [
      "HIGH: Major change in key business metrics",
      "MEDIUM: Noticeable improvement in how things work",
      "LOW: Small incremental improvement",
    ],
  },
};

export function MetricTooltip({ metric, value, className = "" }: MetricTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const explanation = METRIC_EXPLANATIONS[metric];

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Help Icon */}
      <button
        type="button"
        onClick={() => setShowTooltip(!showTooltip)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
        aria-label={`Help: ${explanation.title}`}
        title={explanation.title}
      >
        <span className="text-xs font-semibold">?</span>
      </button>

      {/* Tooltip Popup */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
          {/* Title */}
          <div className="mb-2 font-semibold text-blue-300">{explanation.title}</div>

          {/* Explanation */}
          <div className="mb-3 text-xs leading-relaxed text-gray-200">{explanation.explanation}</div>

          {/* Examples */}
          <div className="space-y-1 border-t border-gray-700 pt-2">
            {explanation.examples.map((example, i) => (
              <div key={i} className="text-xs text-gray-300">
                • {example}
              </div>
            ))}
          </div>

          {/* Arrow pointer */}
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

/**
 * Inline Help Text Component
 * Shows explanation without tooltip, useful in forms
 */
export function MetricHelp({ metric }: { metric: MetricType }) {
  const explanation = METRIC_EXPLANATIONS[metric];
  return (
    <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
      <div className="font-semibold text-blue-900">{explanation.title}</div>
      <p className="mt-1 text-blue-700">{explanation.explanation}</p>
      <ul className="mt-2 space-y-1 text-xs text-blue-600">
        {explanation.examples.map((example, i) => (
          <li key={i}>• {example}</li>
        ))}
      </ul>
    </div>
  );
}
