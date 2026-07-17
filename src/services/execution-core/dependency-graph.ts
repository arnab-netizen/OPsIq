import { logger } from "@/infra/logger";
import {
  ActionDependency,
  DependencyGraph,
  TopologicalSortResult,
  CycleDetectionResult,
  DownstreamImpactResult,
} from "@/domain/execution/dependency";

export class DependencyGraphBuilder {
  /**
   * Build dependency graph with cycle detection and topological sort
   */
  buildGraph(actions: ActionDependency[]): DependencyGraph | null {
    // Check for empty input
    if (actions.length === 0) {
      logger.warn("Empty action list provided");
      return null;
    }

    // Step 1: Validate inputs
    const validation = this.validateInputs(actions);
    if (!validation.is_valid) {
      logger.warn("Invalid dependency graph input", {
        errors: validation.missing_dependencies,
        orphaned: validation.orphaned_actions,
      });
      return null;
    }

    // Step 2: Detect cycles
    const cycle_check = this.detectCycles(actions);
    if (cycle_check.has_cycle) {
      logger.warn("Circular dependency detected", {
        cycle: cycle_check.cycle_path,
      });
      return null;
    }

    // Step 3: Topological sort
    const topo_result = this.topologicalSort(actions);
    if (!topo_result.is_valid) {
      logger.warn("Topological sort failed", {
        cycles: topo_result.cycles,
      });
      return null;
    }

    // Step 4: Calculate downstream impact
    const dependency_map = this.calculateDownstreamImpact(
      actions,
      topo_result.ordered_actions
    );

    // Step 5: Calculate critical path (simplified: longest sequential chain)
    const critical_path = this.findCriticalPath(
      actions,
      topo_result.ordered_actions,
      dependency_map
    );

    const total_duration_days = critical_path.length; // simplified: 1 day per action

    logger.info("Dependency graph built successfully", {
      action_count: actions.length,
      execution_order_length: topo_result.ordered_actions.length,
      critical_path_length: critical_path.length,
    });

    return {
      execution_order: topo_result.ordered_actions,
      cycles_detected: false,
      dependency_map,
      critical_path,
      total_duration_days,
    };
  }

  /**
   * Validate dependency graph inputs
   */
  private validateInputs(actions: ActionDependency[]): TopologicalSortResult {
    const action_ids = new Set(actions.map((a) => a.action_id));
    const missing_dependencies: Array<{
      action_id: string;
      missing_action_ids: string[];
    }> = [];

    // Check for missing dependencies
    for (const action of actions) {
      const missing = action.depends_on.filter((id) => !action_ids.has(id));
      if (missing.length > 0) {
        missing_dependencies.push({
          action_id: action.action_id,
          missing_action_ids: missing,
        });
      }
    }

    // Detect orphaned actions (actions with no path to completion)
    // For now, we'll skip this check as it requires more complex analysis
    const orphaned_actions: string[] = [];

    const is_valid =
      missing_dependencies.length === 0 && orphaned_actions.length === 0;

    return {
      is_valid,
      ordered_actions: [],
      cycles: [],
      missing_dependencies,
      orphaned_actions,
    };
  }

  /**
   * Detect cycles in dependency graph using DFS
   */
  private detectCycles(actions: ActionDependency[]): CycleDetectionResult {
    const action_map = new Map(actions.map((a) => [a.action_id, a]));
    const visited = new Set<string>();
    const rec_stack = new Set<string>();
    const all_cycles: string[][] = [];

    const dfs = (action_id: string, path: string[]): string[] | null => {
      visited.add(action_id);
      rec_stack.add(action_id);
      path.push(action_id);

      const action = action_map.get(action_id);
      if (!action) return null;

      for (const dep_id of action.depends_on) {
        if (!visited.has(dep_id)) {
          const cycle = dfs(dep_id, [...path]);
          if (cycle) return cycle;
        } else if (rec_stack.has(dep_id)) {
          // Found cycle
          const cycle_start_idx = path.indexOf(dep_id);
          return path.slice(cycle_start_idx).concat([dep_id]);
        }
      }

      rec_stack.delete(action_id);
      return null;
    };

    for (const action of actions) {
      if (!visited.has(action.action_id)) {
        const cycle = dfs(action.action_id, []);
        if (cycle) {
          all_cycles.push(cycle);
          return {
            has_cycle: true,
            cycle_path: cycle,
            all_cycles,
          };
        }
      }
    }

    return {
      has_cycle: false,
      all_cycles: [],
    };
  }

  /**
   * Topological sort using Kahn's algorithm
   */
  private topologicalSort(actions: ActionDependency[]): TopologicalSortResult {
    const action_map = new Map(actions.map((a) => [a.action_id, a]));
    const in_degree = new Map<string, number>();
    const adj_list = new Map<string, string[]>();

    // Initialize
    for (const action of actions) {
      in_degree.set(action.action_id, 0);
      adj_list.set(action.action_id, []);
    }

    // Build adjacency list (reverse edges)
    for (const action of actions) {
      for (const dep_id of action.depends_on) {
        if (action_map.has(dep_id)) {
          const existing = adj_list.get(dep_id) || [];
          existing.push(action.action_id);
          adj_list.set(dep_id, existing);
          in_degree.set(action.action_id, (in_degree.get(action.action_id) || 0) + 1);
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [action_id, degree] of in_degree) {
      if (degree === 0) {
        queue.push(action_id);
      }
    }

    const ordered_actions: string[] = [];
    while (queue.length > 0) {
      // Sort queue for deterministic ordering
      queue.sort();
      const action_id = queue.shift()!;
      ordered_actions.push(action_id);

      for (const neighbor of adj_list.get(action_id) || []) {
        const new_degree = (in_degree.get(neighbor) || 0) - 1;
        in_degree.set(neighbor, new_degree);
        if (new_degree === 0) {
          queue.push(neighbor);
        }
      }
    }

    const is_valid = ordered_actions.length === actions.length;

    return {
      is_valid,
      ordered_actions,
      cycles: is_valid ? [] : [[]],
      missing_dependencies: [],
      orphaned_actions: is_valid ? [] : actions.map((a) => a.action_id),
    };
  }

  /**
   * Calculate downstream impact: which actions are blocked if action X fails
   */
  private calculateDownstreamImpact(
    actions: ActionDependency[],
    execution_order: string[]
  ): Record<string, string[]> {
    const dependency_map: Record<string, string[]> = {};
    const action_map = new Map(actions.map((a) => [a.action_id, a]));

    // For each action, find all downstream actions
    for (const action_id of execution_order) {
      dependency_map[action_id] = this.findDownstreamActions(
        action_id,
        action_map,
        execution_order
      );
    }

    return dependency_map;
  }

  /**
   * Find all actions that depend on action_id (directly or indirectly)
   */
  private findDownstreamActions(
    action_id: string,
    action_map: Map<string, ActionDependency>,
    execution_order: string[]
  ): string[] {
    const downstream = new Set<string>();
    const visited = new Set<string>();
    const queue: string[] = [action_id];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      // Find all actions that depend on current
      for (const other of execution_order) {
        const action = action_map.get(other);
        if (action && action.depends_on.includes(current) && other !== action_id) {
          if (!downstream.has(other)) {
            downstream.add(other);
            queue.push(other);
          }
        }
      }
    }

    return Array.from(downstream).sort();
  }

  /**
   * Find critical path (longest chain of sequential actions)
   */
  private findCriticalPath(
    actions: ActionDependency[],
    execution_order: string[],
    dependency_map: Record<string, string[]>
  ): string[] {
    // Simplified approach: just return top 5 actions by critical path depth
    // This avoids exponential recursion on diamond dependencies
    const depths = new Map<string, number>();

    for (const action_id of execution_order) {
      depths.set(action_id, this.calculateDepth(action_id, dependency_map, new Map()));
    }

    // Sort by depth descending
    const sorted = Array.from(depths.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.min(5, execution_order.length))
      .map(([id]) => id);

    return sorted.length > 0 ? sorted : execution_order.slice(0, 1);
  }

  /**
   * Calculate depth of action in dependency graph
   */
  private calculateDepth(
    action_id: string,
    dependency_map: Record<string, string[]>,
    memo: Map<string, number>
  ): number {
    if (memo.has(action_id)) {
      return memo.get(action_id)!;
    }

    const downstream = dependency_map[action_id] || [];
    if (downstream.length === 0) {
      memo.set(action_id, 1);
      return 1;
    }

    let max_depth = 0;
    for (const next_action of downstream) {
      const depth = this.calculateDepth(next_action, dependency_map, memo);
      max_depth = Math.max(max_depth, depth);
    }

    const result = 1 + max_depth;
    memo.set(action_id, result);
    return result;
  }

  /**
   * Get downstream impact for specific action
   */
  getDownstreamImpact(
    graph: DependencyGraph,
    action_id: string
  ): DownstreamImpactResult {
    const downstream_actions = graph.dependency_map[action_id] || [];

    return {
      action_id,
      downstream_actions,
      downstream_count: downstream_actions.length,
    };
  }

  /**
   * Validate graph consistency
   */
  validateGraphConsistency(graph: DependencyGraph): boolean {
    if (graph.cycles_detected) {
      logger.warn("Graph contains cycles");
      return false;
    }

    if (graph.execution_order.length === 0) {
      logger.warn("Empty execution order");
      return false;
    }

    return true;
  }
}

export const dependencyGraphBuilder = new DependencyGraphBuilder();
