/**
 * PHASE H-3: EXECUTION COMPRESSION ENGINE
 *
 * Prevent operator overload by merging and compressing work.
 * DO NOT increase recommendation count unnecessarily.
 */

export interface CompressionAnalysis {
  compressed_execution_sets: string[][];
  merged_actions: string[];
  deferred_actions: string[];
  dropped_actions: string[];
  operator_load_score: number;
  compression_ratio: number;
  actions_consolidated: number;
}

/**
 * Analyze and compress execution plan
 */
export function analyzeCompressionNeeds(
  active_executions: string[],
  duplicate_threshold: number,
  operator_capacity_used: number,
  execution_spam_count: number
): CompressionAnalysis {
  const compressed_execution_sets: string[][] = [];
  const merged_actions: string[] = [];
  const deferred_actions: string[] = [];
  const dropped_actions: string[] = [];

  let operator_load_score = operator_capacity_used;
  let actions_consolidated = 0;

  // Merge similar/related actions
  if (operator_capacity_used > 0.8) {
    // Identify similar actions (hypothetically grouped by prefix pattern)
    const actionsByPrefix = new Map<string, string[]>();
    for (const action of active_executions) {
      const prefix = action.split("-")[0];
      if (!actionsByPrefix.has(prefix)) {
        actionsByPrefix.set(prefix, []);
      }
      actionsByPrefix.get(prefix)!.push(action);
    }

    // Merge groups with 2+ similar actions
    for (const [prefix, actions] of actionsByPrefix) {
      if (actions.length > 1) {
        compressed_execution_sets.push(actions);
        merged_actions.push(`${prefix}-merged`);
        actions_consolidated += actions.length - 1;
        operator_load_score -= 0.05 * actions.length;
      }
    }
  }

  // Defer low-priority work if overloaded
  if (operator_capacity_used > 0.85) {
    const low_priority_count = Math.floor(active_executions.length * 0.2);
    for (let i = 0; i < low_priority_count; i++) {
      deferred_actions.push(active_executions[i]);
    }
  }

  // Drop execution spam
  if (execution_spam_count > 0) {
    for (let i = 0; i < Math.min(execution_spam_count, 3); i++) {
      dropped_actions.push(`spam-${i}`);
    }
  }

  const original_count = active_executions.length;
  const compressed_count =
    original_count - merged_actions.length - deferred_actions.length - dropped_actions.length;
  const compression_ratio = Math.max(0, 1 - compressed_count / (original_count || 1));

  return {
    compressed_execution_sets,
    merged_actions,
    deferred_actions,
    dropped_actions,
    operator_load_score: Math.max(0, operator_load_score),
    compression_ratio,
    actions_consolidated,
  };
}

/**
 * Detect execution spam
 */
export function detectExecutionSpam(
  active_executions: string[],
  created_in_last_hour: number,
  abandoned_rate: number
): boolean {
  return created_in_last_hour > 10 || abandoned_rate > 0.5 || active_executions.length > 30;
}

/**
 * Should compress execution plan
 */
export function shouldCompress(operator_capacity_used: number, active_count: number): boolean {
  return operator_capacity_used > 0.75 || active_count > 20;
}
