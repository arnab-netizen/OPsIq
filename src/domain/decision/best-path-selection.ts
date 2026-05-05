export interface DominanceProof {
  winner_id: string;
  runner_up_id: string;
  ev_margin_pct: number; // |winner.EV - runner_up.EV| / runner_up.EV * 100
  risk_margin_bp: number; // |winner.risk - runner_up.risk| * 100 (basis points)
  speed_margin_pct: number; // |winner.speed - runner_up.speed| * 100
  cost_margin_pct: number; // |winner.cost - runner_up.cost| / winner.cost * 100
  dimensions_won: number; // 2-4 (winner beats runner-up on this many dimensions)
  is_dominant: boolean; // dimensions_won >= 2
}

export interface RejectedPath {
  path_id: string;
  reasons: string[];
}

export interface BestPathSelectionResult {
  selected_path_id: string;
  rejected_paths: RejectedPath[];
  dominance_proof: DominanceProof;
  expected_value: number;
  downside_exposure: number;
  payback_days: number;
  priority_score: number;
  confidence: number; // 0.6 if dominance < 2 dims, otherwise calculated from margins
}

export interface PathDimensionsForSelection {
  path_id: string;
  priority_score: number; // (risk_adjusted_impact × speed_factor) / (cost_total × (1 + dependency_count))
  expected_value: number; // From scenarios
  downside_exposure: number; // Worst case value
  payback_days: number; // From monetization
  roi_percent: number; // From monetization
  risk_score: number; // 0-1 (inverse of success probability)
  speed_factor: number; // 1 / time_to_result_days
  cost_total: number; // direct_cost + (effort_hours × hourly_rate)
  effort_hours: number;
  available_hours: number;
  capital_required: number;
  available_liquidity: number;
  strategy_type?: string;
}

export interface FeasibilityAssessment {
  path_id: string;
  is_feasible: boolean;
  blocked_by_gates: string[];
  reasons: string[];
}
