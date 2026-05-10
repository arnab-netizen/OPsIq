/**
 * Action Selection Engine (Phase 6 Slice 4)
 *
 * Selects and sequences actionable recommendations based on:
 * - Priority scores (from Slice 3)
 * - Dependencies between recommendations
 * - Resource availability and constraints
 * - Execution capacity (effort budget)
 *
 * Produces an executable action plan ranked by:
 * 1. Priority (CRITICAL > HIGH > MEDIUM > LOW)
 * 2. Dependency order (prerequisite actions first)
 * 3. Resource feasibility (effort and cost within capacity)
 *
 * Non-DB foundation: pure TypeScript action selection logic.
 * Tenant-scoped: all selections bound to workspaceId.
 */

import {
  Recommendation,
  PriorityLevel,
  RecommendationStatus,
  ActionItem,
} from "@/domain/recommendation/recommendation";

/**
 * Action execution plan
 */
export interface ActionExecutionPlan {
  workspaceId: string;
  plan_id: string;
  created_at: Date;
  created_by: string;

  // Selection criteria
  max_total_effort_hours?: number;
  max_total_cost?: number;
  focus_priority?: PriorityLevel; // CRITICAL, HIGH, etc
  include_dependencies?: boolean;

  // Selected recommendations and their sequencing
  selected_recommendations: SelectedRecommendation[];

  // Plan summary
  total_selected: number;
  total_effort_hours: number;
  total_cost: number;
  earliest_start?: Date;
  estimated_completion?: Date;

  // Feasibility
  is_feasible: boolean;
  feasibility_gaps?: string[];

  // Sequencing
  execution_phases: ExecutionPhase[];
}

/**
 * Selected recommendation with execution context
 */
export interface SelectedRecommendation {
  recommendation_id: string;
  title: string;
  priority: PriorityLevel;
  priority_score: number;

  // Action sequencing
  phase: number; // 1, 2, 3... based on dependencies
  sequence_order: number; // order within phase

  // Resource commitment
  committed_effort_hours: number;
  committed_cost: number;

  // Dependency tracking
  dependent_on_recs?: string[];
  blocks_recs?: string[];

  // Selection reason
  selection_reason: "CRITICAL" | "CAPACITY_FIT" | "DEPENDENCY" | "BLOCKED";

  // Execution readiness
  is_ready_to_start: boolean;
  blockers?: string[];
}

/**
 * Execution phase (group of parallel-safe actions)
 */
export interface ExecutionPhase {
  phase_number: number;
  title: string;
  description: string;

  // Timing
  estimated_start_day: number;
  estimated_duration_days: number;

  // Contents
  actions: SelectedRecommendation[];
  total_effort: number;
  total_cost: number;

  // Success criteria
  completion_criteria: string[];
}

/**
 * Action selection context
 */
export interface ActionSelectionContext {
  workspaceId: string;
  userId: string;

  // Capacity constraints
  available_effort_hours_per_day?: number; // e.g., 8 hours
  available_budget?: number;
  time_horizon_days?: number; // e.g., 90 days

  // Selection strategy
  strategy?: "MAXIMIZE_CRITICAL" | "BALANCED" | "QUICK_WINS";

  // Dependency resolution
  resolve_dependencies?: boolean;
  force_sequential?: boolean; // If true, no parallel execution
}

/**
 * Action selection engine
 */
export class ActionSelectionEngine {
  /**
   * Select recommendations for execution based on constraints
   */
  static selectActions(
    recommendations: Recommendation[],
    context: ActionSelectionContext
  ): ActionExecutionPlan {
    if (!context.workspaceId) {
      throw new Error("Action selection requires workspaceId");
    }

    // Filter and sort by priority
    const sorted = this.sortByPriority(recommendations);

    // Apply capacity constraints
    const selected = this.applyCapacityConstraints(sorted, context);

    // Build dependency graph
    const sequenced = this.sequenceByDependencies(selected, context);

    // Create execution phases
    const phases = this.createExecutionPhases(sequenced, context);

    // Assess feasibility
    const feasibility = this.assessFeasibility(selected, phases, context);

    return {
      workspaceId: context.workspaceId,
      plan_id: `plan-${context.workspaceId}-${Date.now()}`,
      created_at: new Date(),
      created_by: context.userId,
      max_total_effort_hours: context.available_effort_hours_per_day
        ? context.available_effort_hours_per_day * (context.time_horizon_days ?? 90)
        : undefined,
      max_total_cost: context.available_budget,
      selected_recommendations: selected,
      total_selected: selected.length,
      total_effort_hours: selected.reduce((sum, r) => sum + (r.committed_effort_hours || 0), 0),
      total_cost: selected.reduce((sum, r) => sum + (r.committed_cost || 0), 0),
      is_feasible: feasibility.is_feasible,
      feasibility_gaps: feasibility.gaps,
      execution_phases: phases,
    };
  }

  /**
   * Sort recommendations by priority
   */
  private static sortByPriority(recommendations: Recommendation[]): Recommendation[] {
    const priorityOrder = {
      [PriorityLevel.CRITICAL]: 0,
      [PriorityLevel.HIGH]: 1,
      [PriorityLevel.MEDIUM]: 2,
      [PriorityLevel.LOW]: 3,
      [PriorityLevel.DEFER]: 4,
    };

    return [...recommendations].sort((a, b) => {
      const aPriority = priorityOrder[a.priority_score.priority_level] ?? 5;
      const bPriority = priorityOrder[b.priority_score.priority_level] ?? 5;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // Tie-break by composite priority score
      return b.priority_score.composite_priority - a.priority_score.composite_priority;
    });
  }

  /**
   * Apply capacity constraints (effort hours and budget)
   */
  private static applyCapacityConstraints(
    sorted: Recommendation[],
    context: ActionSelectionContext
  ): SelectedRecommendation[] {
    const selected: SelectedRecommendation[] = [];
    let totalEffort = 0;
    let totalCost = 0;

    const maxEffort = context.available_effort_hours_per_day
      ? context.available_effort_hours_per_day * (context.time_horizon_days ?? 90)
      : Infinity;
    const maxCost = context.available_budget ?? Infinity;

    for (const rec of sorted) {
      const effortHours = rec.estimated_total_hours ?? this.estimateEffort(rec);
      const cost = rec.estimated_total_cost ?? 0;

      // Stop if capacity exceeded
      if (totalEffort + effortHours > maxEffort || totalCost + cost > maxCost) {
        if (rec.priority_score.priority_level === PriorityLevel.CRITICAL) {
          // Force-include CRITICAL even if over capacity, mark as blocked
          selected.push({
            recommendation_id: rec.id,
            title: rec.title,
            priority: rec.priority_score.priority_level,
            priority_score: rec.priority_score.composite_priority,
            phase: 0,
            sequence_order: selected.length,
            committed_effort_hours: effortHours,
            committed_cost: cost,
            dependent_on_recs: rec.dependencies_on_other_recs,
            blocks_recs: rec.competing_recommendations,
            selection_reason: "CRITICAL",
            is_ready_to_start: true,
          });
        } else {
          // Skip lower priority if capacity exceeded
          continue;
        }
      } else {
        totalEffort += effortHours;
        totalCost += cost;

        selected.push({
          recommendation_id: rec.id,
          title: rec.title,
          priority: rec.priority_score.priority_level,
          priority_score: rec.priority_score.composite_priority,
          phase: 0,
          sequence_order: selected.length,
          committed_effort_hours: effortHours,
          committed_cost: cost,
          dependent_on_recs: rec.dependencies_on_other_recs,
          blocks_recs: rec.competing_recommendations,
          selection_reason: "CAPACITY_FIT",
          is_ready_to_start: true,
        });
      }
    }

    return selected;
  }

  /**
   * Sequence recommendations by dependencies
   */
  private static sequenceByDependencies(
    selected: SelectedRecommendation[],
    context: ActionSelectionContext
  ): SelectedRecommendation[] {
    if (!context.resolve_dependencies) {
      return selected;
    }

    const sequenced: SelectedRecommendation[] = [];
    const processed = new Set<string>();
    const selectedIds = new Set(selected.map((r) => r.recommendation_id));

    const processRec = (rec: SelectedRecommendation, phase: number) => {
      if (processed.has(rec.recommendation_id)) {
        return;
      }

      // Process dependencies first
      if (rec.dependent_on_recs) {
        for (const depId of rec.dependent_on_recs) {
          const depRec = selected.find((r) => r.recommendation_id === depId);
          if (depRec && selectedIds.has(depId) && !processed.has(depId)) {
            processRec(depRec, phase);
          }
        }
      }

      rec.phase = phase;
      rec.sequence_order = sequenced.length;
      rec.is_ready_to_start = !rec.dependent_on_recs || rec.dependent_on_recs.length === 0;
      sequenced.push(rec);
      processed.add(rec.recommendation_id);
    };

    let phase = 1;
    for (const rec of selected) {
      if (!processed.has(rec.recommendation_id)) {
        processRec(rec, phase);
        phase++;
      }
    }

    return sequenced;
  }

  /**
   * Create execution phases
   */
  private static createExecutionPhases(
    sequenced: SelectedRecommendation[],
    context: ActionSelectionContext
  ): ExecutionPhase[] {
    const phases: ExecutionPhase[] = [];
    const dailyEffortCapacity = context.available_effort_hours_per_day ?? 8;

    for (let phase = 1; phase <= (Math.max(...sequenced.map((r) => r.phase), 0) || 1); phase++) {
      const phaseRecs = sequenced.filter((r) => r.phase === phase);

      if (phaseRecs.length === 0) continue;

      const totalEffort = phaseRecs.reduce((sum, r) => sum + r.committed_effort_hours, 0);
      const totalCost = phaseRecs.reduce((sum, r) => sum + r.committed_cost, 0);
      const estimatedDuration = Math.ceil(totalEffort / dailyEffortCapacity);

      phases.push({
        phase_number: phase,
        title: `Phase ${phase}: ${this.phaseTitle(phaseRecs)}`,
        description: `Execute ${phaseRecs.length} recommendations`,
        estimated_start_day: phase === 1 ? 1 : (phases[phase - 2]?.estimated_start_day ?? 1) + (phases[phase - 2]?.estimated_duration_days ?? 1),
        estimated_duration_days: estimatedDuration,
        actions: phaseRecs,
        total_effort: totalEffort,
        total_cost: totalCost,
        completion_criteria: phaseRecs.flatMap((r) => r.blocks_recs || []),
      });
    }

    return phases;
  }

  /**
   * Generate phase title from recommendations
   */
  private static phaseTitle(recs: SelectedRecommendation[]): string {
    if (recs.length === 0) return "Empty Phase";
    if (recs.length === 1) return recs[0].title.substring(0, 40);
    const categories = [...new Set(recs.map((r) => r.title.split(":")[0]))];
    return categories.join(" + ").substring(0, 50);
  }

  /**
   * Assess feasibility of the plan
   */
  private static assessFeasibility(
    selected: SelectedRecommendation[],
    phases: ExecutionPhase[],
    context: ActionSelectionContext
  ): { is_feasible: boolean; gaps: string[] } {
    const gaps: string[] = [];

    // Check effort capacity
    const totalEffort = selected.reduce((sum, r) => sum + r.committed_effort_hours, 0);
    const maxEffort = context.available_effort_hours_per_day
      ? context.available_effort_hours_per_day * (context.time_horizon_days ?? 90)
      : Infinity;

    if (totalEffort > maxEffort) {
      gaps.push(`Effort shortage: ${Math.ceil(totalEffort - maxEffort)} hours over capacity`);
    }

    // Check budget
    const totalCost = selected.reduce((sum, r) => sum + r.committed_cost, 0);
    if (context.available_budget && totalCost > context.available_budget) {
      gaps.push(`Budget shortage: $${Math.ceil(totalCost - context.available_budget)} over budget`);
    }

    // Check time horizon
    const lastPhase = phases[phases.length - 1];
    if (lastPhase && context.time_horizon_days) {
      const completionDay = lastPhase.estimated_start_day + lastPhase.estimated_duration_days;
      if (completionDay > context.time_horizon_days) {
        gaps.push(`Timeline: Plan completes on day ${completionDay}, exceeds ${context.time_horizon_days}-day horizon`);
      }
    }

    return {
      is_feasible: gaps.length === 0,
      gaps,
    };
  }

  /**
   * Estimate effort from action items
   */
  private static estimateEffort(rec: Recommendation): number {
    if (rec.estimated_total_hours) {
      return rec.estimated_total_hours;
    }

    // Estimate from action items
    const effortMap: Record<string, number> = {
      MINIMAL: 2,
      SMALL: 8,
      MEDIUM: 20,
      LARGE: 40,
      VERY_LARGE: 80,
    };

    let total = 0;
    for (const action of rec.action_items) {
      total += effortMap[action.estimated_effort] ?? 20;
    }

    return total;
  }

  /**
   * Validate workspace scope
   */
  static validateWorkspaceId(workspaceId: string, plan: ActionExecutionPlan): void {
    if (!workspaceId) {
      throw new Error("Action selection requires workspaceId");
    }
    if (plan.workspaceId !== workspaceId) {
      throw new Error(`Plan workspace mismatch: expected ${workspaceId}, got ${plan.workspaceId}`);
    }
  }
}
