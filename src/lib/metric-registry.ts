/**
 * Metric Registry Governance
 *
 * Centralizes metric definitions, thresholds, explanations, and recommended actions.
 * Every metric display must reference this registry to ensure consistency.
 */

export type MetricName =
  | "confidence"
  | "priority"
  | "impact"
  | "urgency"
  | "complexity"
  | "completionRate"
  | "riskLevel";

export interface MetricDefinition {
  name: MetricName;
  displayName: string;
  shortDescription: string; // <15 chars, shown next to metric
  fullExplanation: string; // For tooltip, 1-2 sentences
  examples: string[]; // Real-world examples
  scale: {
    min: number;
    max: number;
    unit: string; // "%" or "points" or "0-5"
  };
  thresholds: {
    critical: [number, number]; // [min, max]
    warning: [number, number];
    normal: [number, number];
  };
  interpretation: {
    low: string; // What low value means
    medium: string;
    high: string;
  };
  recommendedAction?: {
    threshold: number;
    action: string;
  };
  relatedMetrics?: MetricName[];
}

/**
 * Metric registry - source of truth for all operator-visible metrics
 */
const METRIC_DEFINITIONS: Record<MetricName, MetricDefinition> = {
  confidence: {
    name: "confidence",
    displayName: "Confidence",
    shortDescription: "How sure we are this will work",
    fullExplanation:
      "This is how confident the system is that the recommended action will achieve the desired outcome. Higher confidence means we have more evidence it will work well.",
    examples: [
      "95% = We've seen this work many times with very similar situations",
      "60% = We think this will work, but there are some unknowns",
      "25% = This might work, but it's experimental or uncertain",
    ],
    scale: { min: 0, max: 100, unit: "%" },
    thresholds: {
      critical: [0, 25],
      warning: [25, 60],
      normal: [60, 100],
    },
    interpretation: {
      low: "Uncertain outcome. Consider gathering more information before proceeding.",
      medium: "Moderate confidence. This is likely to work.",
      high: "High confidence. We have strong evidence this will succeed.",
    },
    recommendedAction: {
      threshold: 50,
      action: "Consider alternative approaches if confidence is below 50%",
    },
    relatedMetrics: ["complexity", "completionRate"],
  },

  priority: {
    name: "priority",
    displayName: "Priority",
    shortDescription: "How urgent is this",
    fullExplanation:
      "This indicates how soon you should take action. HIGH means do this today, MEDIUM means this week, LOW means whenever time permits.",
    examples: [
      "HIGH = Customer issue, revenue at risk, or compliance deadline today",
      "MEDIUM = Important but can wait a few days",
      "LOW = Nice to have, no time pressure",
    ],
    scale: { min: 0, max: 100, unit: "priority" },
    thresholds: {
      critical: [75, 100],
      warning: [40, 74],
      normal: [0, 39],
    },
    interpretation: {
      low: "No rush. You can address this whenever convenient.",
      medium: "Should be handled within a week.",
      high: "Action needed today to prevent problems.",
    },
  },

  impact: {
    name: "impact",
    displayName: "Impact",
    shortDescription: "How much this will improve things",
    fullExplanation:
      "This measures how much positive change this action will create. HIGH impact means significant improvement, MEDIUM means noticeable change, LOW means incremental.",
    examples: [
      "HIGH = Resolves major customer complaint, saves 20% time",
      "MEDIUM = Improves process, small efficiency gain",
      "LOW = Nice to have, minor improvement",
    ],
    scale: { min: 0, max: 100, unit: "%" },
    thresholds: {
      critical: [75, 100],
      warning: [40, 74],
      normal: [0, 39],
    },
    interpretation: {
      low: "Minimal improvement. Worth doing only if time allows.",
      medium: "Noticeable improvement worth the effort.",
      high: "Significant positive impact. Should be prioritized.",
    },
  },

  urgency: {
    name: "urgency",
    displayName: "Urgency",
    shortDescription: "Time sensitivity",
    fullExplanation:
      "How time-sensitive the decision is. Urgent items have a deadline or risk if delayed.",
    examples: [
      "HIGH = Deadline in hours, critical dependency",
      "MEDIUM = Deadline in days",
      "LOW = No immediate deadline",
    ],
    scale: { min: 0, max: 100, unit: "%" },
    thresholds: {
      critical: [80, 100],
      warning: [40, 79],
      normal: [0, 39],
    },
    interpretation: {
      low: "No time pressure. Can be delayed.",
      medium: "Has a deadline within days.",
      high: "Urgent. Deadline today or tomorrow.",
    },
  },

  complexity: {
    name: "complexity",
    displayName: "Complexity",
    shortDescription: "How complex to implement",
    fullExplanation:
      "Measures how much effort and coordination is needed to execute this action.",
    examples: [
      "LOW = Simple, one person, minimal coordination",
      "MEDIUM = Requires some planning and coordination",
      "HIGH = Complex, multiple teams, significant planning needed",
    ],
    scale: { min: 0, max: 100, unit: "%" },
    thresholds: {
      normal: [0, 39],
      warning: [40, 74],
      critical: [75, 100],
    },
    interpretation: {
      low: "Simple to execute. Can start immediately.",
      medium: "Some complexity. Plan for 1-2 days.",
      high: "Complex implementation. Requires planning.",
    },
  },

  completionRate: {
    name: "completionRate",
    displayName: "Completion Rate",
    shortDescription: "Progress toward goal",
    fullExplanation:
      "What percentage of the required work is already done. 100% means ready to complete.",
    examples: [
      "0% = Not started",
      "50% = Half done, waiting on one dependency",
      "100% = Ready to complete, just need approval",
    ],
    scale: { min: 0, max: 100, unit: "%" },
    thresholds: {
      normal: [0, 39],
      warning: [40, 99],
      critical: [100, 100],
    },
    interpretation: {
      low: "Early stage. More work needed.",
      medium: "Most work done. Final steps remaining.",
      high: "Complete. Ready for final approval.",
    },
  },

  riskLevel: {
    name: "riskLevel",
    displayName: "Risk Level",
    shortDescription: "Potential downside",
    fullExplanation:
      "Assessment of what could go wrong if this action is taken or not taken.",
    examples: [
      "LOW = Low probability of negative outcome",
      "MEDIUM = Moderate risk, manageable",
      "HIGH = Significant risk, needs mitigation plan",
    ],
    scale: { min: 0, max: 100, unit: "%" },
    thresholds: {
      normal: [0, 39],
      warning: [40, 74],
      critical: [75, 100],
    },
    interpretation: {
      low: "Low risk. Safe to proceed.",
      medium: "Moderate risk. Have a mitigation plan.",
      high: "High risk. Needs careful planning.",
    },
  },
};

/**
 * Get metric definition by name
 */
export function getMetricDefinition(name: MetricName): MetricDefinition {
  const definition = METRIC_DEFINITIONS[name];
  if (!definition) {
    throw new Error(`Unknown metric: ${name}`);
  }
  return definition;
}

/**
 * Get interpretation for a metric value
 */
export function getMetricInterpretation(
  name: MetricName,
  value: number
): string {
  const definition = getMetricDefinition(name);
  const { thresholds, interpretation } = definition;

  if (value >= thresholds.critical[0] && value <= thresholds.critical[1]) {
    return interpretation.high;
  }
  if (value >= thresholds.warning[0] && value <= thresholds.warning[1]) {
    return interpretation.medium;
  }
  return interpretation.low;
}

/**
 * Get severity level for threshold
 */
export function getMetricSeverity(
  name: MetricName,
  value: number
): "normal" | "warning" | "critical" {
  const definition = getMetricDefinition(name);
  const { thresholds } = definition;

  if (
    value >= thresholds.critical[0] &&
    value <= thresholds.critical[1]
  ) {
    return "critical";
  }
  if (value >= thresholds.warning[0] && value <= thresholds.warning[1]) {
    return "warning";
  }
  return "normal";
}

/**
 * Validate metric value against definition
 */
export function validateMetricValue(
  name: MetricName,
  value: number
): { valid: boolean; error?: string } {
  const definition = getMetricDefinition(name);
  const { scale } = definition;

  if (value < scale.min || value > scale.max) {
    return {
      valid: false,
      error: `${name} must be between ${scale.min} and ${scale.max}`,
    };
  }

  return { valid: true };
}

/**
 * Format metric value for display
 */
export function formatMetricValue(
  name: MetricName,
  value: number
): string {
  const definition = getMetricDefinition(name);
  return `${value.toFixed(0)}${definition.scale.unit}`;
}

/**
 * Get all metrics for a given context
 * Used by governance components to ensure consistent rendering
 */
export function getMetricsForContext(context: string): MetricName[] {
  // Different surfaces show different metrics
  const contextMetrics: Record<string, MetricName[]> = {
    decision: ["confidence", "priority", "impact"],
    action: ["urgency", "complexity", "completionRate"],
    risk: ["riskLevel"],
    engagement: ["priority", "impact", "completionRate"],
  };

  return contextMetrics[context] ?? ["confidence", "priority"];
}

/**
 * Check if metric governance is enforced
 * Used by CI scanner
 */
export function isMetricGovernanceEnforced(metricName: string): boolean {
  return Object.keys(METRIC_DEFINITIONS).includes(metricName as MetricName);
}
