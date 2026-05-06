export interface ActionDependency {
  action_id: string;
  depends_on: string[]; // list of action_ids that must complete first
}

export interface DependencyGraph {
  execution_order: string[]; // topologically sorted action IDs
  cycles_detected: boolean;
  dependency_map: Record<string, string[]>; // action_id -> [downstream action_ids]
  critical_path: string[]; // longest path by duration
  total_duration_days: number;
}

export interface TopologicalSortResult {
  is_valid: boolean;
  ordered_actions: string[];
  cycles: string[][]; // list of cycles (each cycle is a path that loops)
  missing_dependencies: Array<{
    action_id: string;
    missing_action_ids: string[];
  }>;
  orphaned_actions: string[]; // actions with no path to completion
}

export interface CycleDetectionResult {
  has_cycle: boolean;
  cycle_path?: string[]; // first cycle found
  all_cycles?: string[][]; // all cycles in graph
}

export interface DownstreamImpactResult {
  action_id: string;
  downstream_actions: string[]; // all actions blocked if this one fails
  downstream_count: number;
}
