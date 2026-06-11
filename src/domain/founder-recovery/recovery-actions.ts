/**
 * Founder Recovery — recovery action generation.
 *
 * Pure function. Each finding is converted into a concrete, persisted-ready
 * recovery action that keeps its owner role, due date, metric-to-move,
 * baseline, target, verification window, effort, confidence and completion
 * criteria. Nothing is dropped at this layer (persistence preserves all of it).
 */
import type { ActionEffort, ActionPriority, ActionSpec, Finding, Severity } from "./types";

interface ActionTemplate {
  role: string;
  effort: ActionEffort;
  /** verification window in days */
  windowDays: number;
  direction: "up" | "down";
  /** target improvement: relative % toward/away the threshold or absolute floor */
  buildTarget: (f: Finding) => number | null;
  completion: string;
}

/** Map severity to action priority and due window. */
function priorityFor(severity: Severity): { priority: ActionPriority; dueInDays: number } {
  switch (severity) {
    case "critical":
      return { priority: "critical", dueInDays: 3 };
    case "high":
      return { priority: "high", dueInDays: 7 };
    case "medium":
      return { priority: "medium", dueInDays: 14 };
    default:
      return { priority: "low", dueInDays: 21 };
  }
}

/**
 * Target builders move the metric toward the threshold (the documented guard),
 * computed from the finding's own current value and threshold — not invented.
 */
function targetTowardThreshold(f: Finding): number | null {
  if (f.threshold === null) return null;
  return f.threshold;
}

const TEMPLATES: Record<string, ActionTemplate> = {
  LOW_REVENUE: {
    role: "Owner",
    effort: "high",
    windowDays: 30,
    direction: "up",
    buildTarget: (f) => (f.currentValue === null ? null : Math.abs(f.currentValue) < 5 ? 5 : 0),
    completion: "Reactivation campaign executed and period revenue recovered to prior level.",
  },
  HIGH_COST_RATIO: {
    role: "Owner",
    effort: "medium",
    windowDays: 30,
    direction: "up",
    buildTarget: targetTowardThreshold,
    completion: "Top cost line reduced and net margin verified above guard.",
  },
  WEAK_REPEAT_RATE: {
    role: "Operations Lead",
    effort: "medium",
    windowDays: 30,
    direction: "up",
    buildTarget: targetTowardThreshold,
    completion: "Reactivation offer sent; repeat rate verified at or above guard.",
  },
  DISCOUNT_LEAKAGE: {
    role: "Owner",
    effort: "low",
    windowDays: 14,
    direction: "down",
    buildTarget: targetTowardThreshold,
    completion: "Discount policy enforced; leakage verified below guard.",
  },
  QUALITY_FAILURE: {
    role: "Operations Lead",
    effort: "medium",
    windowDays: 21,
    direction: "down",
    buildTarget: targetTowardThreshold,
    completion: "Pre-dispatch QC live; complaint+rewash rate verified below guard.",
  },
  DELIVERY_COST_LEAKAGE: {
    role: "Operations Lead",
    effort: "medium",
    windowDays: 21,
    direction: "down",
    buildTarget: targetTowardThreshold,
    completion: "Delivery batching live; delivery cost ratio verified below guard.",
  },
  B2B_CONCENTRATION: {
    role: "Owner",
    effort: "high",
    windowDays: 60,
    direction: "down",
    buildTarget: targetTowardThreshold,
    completion: "B2B pricing reviewed and B2C grown; B2B share verified below guard.",
  },
  LOW_STAFF_PRODUCTIVITY: {
    role: "Operations Lead",
    effort: "medium",
    windowDays: 30,
    direction: "up",
    buildTarget: (f) => f.comparisonValue,
    completion: "Scheduling adjusted; productivity verified at or above prior period.",
  },
  SLOW_TURNAROUND: {
    role: "Operations Lead",
    effort: "medium",
    windowDays: 21,
    direction: "down",
    buildTarget: targetTowardThreshold,
    completion: "Bottleneck stage fixed; turnaround verified below guard.",
  },
  RECEIVABLES_PRESSURE: {
    role: "Owner",
    effort: "low",
    windowDays: 30,
    direction: "down",
    buildTarget: targetTowardThreshold,
    completion: "Oldest receivables collected; exposure verified below guard.",
  },
  POOR_CAMPAIGN_CONVERSION: {
    role: "Owner",
    effort: "low",
    windowDays: 30,
    direction: "up",
    buildTarget: targetTowardThreshold,
    completion: "Spend reallocated to best channel; conversion efficiency verified above guard.",
  },
  LOW_AOV: {
    role: "Operations Lead",
    effort: "medium",
    windowDays: 30,
    direction: "up",
    buildTarget: (f) => f.comparisonValue,
    completion: "Bundles launched; AOV verified at or above prior period.",
  },
};

/** Convert findings into persisted-ready action specs. */
export function buildActionsFromFindings(findings: Finding[]): ActionSpec[] {
  const specs: ActionSpec[] = [];
  for (const f of findings) {
    const tpl = TEMPLATES[f.code];
    if (!tpl) continue;
    const { priority, dueInDays } = priorityFor(f.severity);
    specs.push({
      findingCode: f.code,
      title: f.recommendedAction,
      description: `${f.title}: ${f.whyItMatters}`,
      assignedToRole: tpl.role,
      priority,
      dueInDays,
      expectedOutcome: `Move ${f.verificationMetric} in the right direction within the verification window.`,
      metricToMove: f.verificationMetric,
      baselineValue: f.currentValue,
      targetValue: tpl.buildTarget(f),
      verificationWindowDays: tpl.windowDays,
      effort: tpl.effort,
      confidence: f.confidence,
      completionCriteria: tpl.completion,
      direction: tpl.direction,
    });
  }
  return specs;
}
