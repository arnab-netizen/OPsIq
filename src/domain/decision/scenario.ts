export interface ScenarioCase {
  value: number; // Financial outcome in dollars
  prob: number; // Probability (0-1)
  trigger?: string; // Trigger condition description
}

export interface ScenarioAnalysis {
  pathId: string;
  bestCase: ScenarioCase;
  baseCase: ScenarioCase;
  worstCase: ScenarioCase;
  expectedValue: number; // Weighted average: (best.value × best.prob) + (base.value × base.prob) + (worst.value × worst.prob)
  downsideExposure: number; // worst_case.value (may be negative)
  failureTriggers: string[]; // Explicit conditions causing worst-case
  scenarios: {
    best: ScenarioCase;
    base: ScenarioCase;
    worst: ScenarioCase;
  };
}

export interface PathWithScenarios {
  pathId: string;
  impactValue: number;
  probability: number;
  riskScore: number;
  scenarios: ScenarioAnalysis;
}
