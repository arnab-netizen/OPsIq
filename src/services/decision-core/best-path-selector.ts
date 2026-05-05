import { logger } from "@/infra/logger";
import {
  DominanceProof,
  RejectedPath,
  BestPathSelectionResult,
  PathDimensionsForSelection,
  FeasibilityAssessment,
} from "@/domain/decision/best-path-selection";

export class BestPathSelector {
  /**
   * Select best path from multiple candidates with dominance proof
   * Returns null if no feasible paths exist
   */
  selectBestPath(
    paths: PathDimensionsForSelection[],
    blockedByGates: Map<string, string[]> // path_id -> list of failed gates
  ): BestPathSelectionResult | null {
    // Step 1: Eliminate infeasible paths
    const feasiblePaths = paths.filter((path) => !blockedByGates.has(path.path_id));

    if (feasiblePaths.length === 0) {
      logger.warn("No feasible paths available", {
        totalPaths: paths.length,
        allBlocked: paths.map((p) => ({
          pathId: p.path_id,
          blockedBy: blockedByGates.get(p.path_id) || [],
        })),
      });
      return null;
    }

    // Step 2: Check capacity constraints for remaining paths
    const capacityFeasible = feasiblePaths.filter(
      (p) => p.effort_hours <= p.available_hours
    );

    if (capacityFeasible.length === 0) {
      logger.warn("No paths have sufficient capacity", {
        feasibleCount: feasiblePaths.length,
      });
      return null;
    }

    // Step 3: Check cash constraints for remaining paths
    const cashFeasible = capacityFeasible.filter(
      (p) => p.capital_required <= p.available_liquidity
    );

    if (cashFeasible.length === 0) {
      logger.warn("No paths have sufficient cash", {
        capacityFeasibleCount: capacityFeasible.length,
      });
      return null;
    }

    // Step 4: Rank by primary, secondary, tertiary criteria
    const ranked = this.rankPaths(cashFeasible);

    if (ranked.length === 0) {
      return null;
    }

    const selectedPath = ranked[0];
    const runnerUpPath = ranked[1] || ranked[0]; // Use selected as runner-up if only 1 path

    // Step 5: Generate dominance proof
    const dominanceProof = this.calculateDominanceProof(
      selectedPath,
      runnerUpPath
    );

    // Step 6: Calculate confidence based on dominance
    const confidence = this.calculateConfidence(dominanceProof);

    // Step 7: Identify rejected paths with reasons
    const rejectedPaths = this.generateRejectedPaths(
      paths,
      selectedPath,
      blockedByGates,
      cashFeasible
    );

    logger.info("Best path selected with dominance proof", {
      selectedPathId: selectedPath.path_id,
      runnerUpId: runnerUpPath.path_id,
      dimensionsWon: dominanceProof.dimensions_won,
      confidence,
      rejectedCount: rejectedPaths.length,
    });

    return {
      selected_path_id: selectedPath.path_id,
      rejected_paths: rejectedPaths,
      dominance_proof: dominanceProof,
      expected_value: selectedPath.expected_value,
      downside_exposure: selectedPath.downside_exposure,
      payback_days: selectedPath.payback_days,
      priority_score: selectedPath.priority_score,
      confidence,
    };
  }

  /**
   * Rank paths by priority_score (primary), expected_value (secondary), roi (tertiary)
   */
  private rankPaths(paths: PathDimensionsForSelection[]): PathDimensionsForSelection[] {
    return [...paths].sort((a, b) => {
      // Primary: priority_score (highest first)
      if (Math.abs(a.priority_score - b.priority_score) > 0.01) {
        return b.priority_score - a.priority_score;
      }

      // Secondary: expected_value (highest first)
      if (Math.abs(a.expected_value - b.expected_value) > 1000) {
        return b.expected_value - a.expected_value;
      }

      // Tertiary: roi_percent (highest first)
      if (Math.abs(a.roi_percent - b.roi_percent) > 5) {
        return b.roi_percent - a.roi_percent;
      }

      // Tie-breaker 1: downside_exposure (higher is better - less risk)
      if (Math.abs(a.downside_exposure - b.downside_exposure) > 1000) {
        return b.downside_exposure - a.downside_exposure;
      }

      // Tie-breaker 2: payback_days (shorter is better)
      if (a.payback_days !== b.payback_days) {
        return a.payback_days - b.payback_days;
      }

      // Tie-breaker 3: effort_hours (fewer is better)
      return a.effort_hours - b.effort_hours;
    });
  }

  /**
   * Calculate dominance proof comparing winner vs runner-up across 4 dimensions
   */
  private calculateDominanceProof(
    winner: PathDimensionsForSelection,
    runnerUp: PathDimensionsForSelection
  ): DominanceProof {
    // Dimension 1: EV Margin
    const evMarginPct = this.calculateMarginPercent(
      winner.expected_value,
      runnerUp.expected_value
    );

    // Dimension 2: Risk Margin (lower risk is better)
    const riskMarginBp = Math.abs(winner.risk_score - runnerUp.risk_score) * 100;

    // Dimension 3: Speed Margin (higher speed is better)
    const speedMarginPct = Math.abs(winner.speed_factor - runnerUp.speed_factor) * 100;

    // Dimension 4: Cost Margin (lower cost is better)
    const costMarginPct = this.calculateMarginPercent(
      runnerUp.cost_total,
      winner.cost_total
    ); // Note: inverted (winner has lower cost)

    // Count dimensions won (winner better than runner-up)
    let dimensionsWon = 0;

    if (winner.expected_value > runnerUp.expected_value) dimensionsWon++;
    if (winner.risk_score < runnerUp.risk_score) dimensionsWon++; // Lower risk is better
    if (winner.speed_factor > runnerUp.speed_factor) dimensionsWon++; // Higher speed is better
    if (winner.cost_total < runnerUp.cost_total) dimensionsWon++; // Lower cost is better

    const isDominant = dimensionsWon >= 2;

    return {
      winner_id: winner.path_id,
      runner_up_id: runnerUp.path_id,
      ev_margin_pct: Math.round(evMarginPct * 100) / 100,
      risk_margin_bp: Math.round(riskMarginBp),
      speed_margin_pct: Math.round(speedMarginPct * 100) / 100,
      cost_margin_pct: Math.round(costMarginPct * 100) / 100,
      dimensions_won: dimensionsWon,
      is_dominant: isDominant,
    };
  }

  /**
   * Calculate margin percentage: |a - b| / b * 100
   */
  private calculateMarginPercent(a: number, b: number): number {
    if (b === 0) return 0;
    return Math.abs(a - b) / Math.abs(b);
  }

  /**
   * Calculate confidence based on dominance
   * If dimensions_won < 2: confidence = 0.6
   * Otherwise: confidence = 0.7 + (dimensions_won / 4 * 0.25) = 0.7 to 0.95
   */
  private calculateConfidence(dominanceProof: DominanceProof): number {
    if (dominanceProof.dimensions_won < 2) {
      return 0.6;
    }

    // Confidence increases with more dimensions won
    // 2 dims: 0.8, 3 dims: 0.875, 4 dims: 0.95
    return 0.7 + (dominanceProof.dimensions_won / 4) * 0.25;
  }

  /**
   * Generate list of rejected paths with reasons
   */
  private generateRejectedPaths(
    allPaths: PathDimensionsForSelection[],
    selectedPath: PathDimensionsForSelection,
    blockedByGates: Map<string, string[]>,
    cashFeasible: PathDimensionsForSelection[]
  ): RejectedPath[] {
    const rejected: RejectedPath[] = [];

    allPaths.forEach((path) => {
      if (path.path_id === selectedPath.path_id) {
        return; // Skip selected path
      }

      const reasons: string[] = [];

      // Check if blocked by gates
      const gateFailures = blockedByGates.get(path.path_id);
      if (gateFailures && gateFailures.length > 0) {
        reasons.push(`Failed gates: ${gateFailures.join(", ")}`);
      }

      // Check if capacity insufficient
      if (path.effort_hours > path.available_hours) {
        reasons.push(
          `Insufficient capacity: ${path.effort_hours}h required, ${path.available_hours}h available`
        );
      }

      // Check if cash insufficient
      if (path.capital_required > path.available_liquidity) {
        reasons.push(
          `Insufficient cash: $${path.capital_required} required, $${path.available_liquidity} available`
        );
      }

      // Check if lower score than selected
      if (reasons.length === 0 && cashFeasible.includes(path)) {
        reasons.push(
          `Lower priority score: ${path.priority_score.toFixed(2)} vs selected ${selectedPath.priority_score.toFixed(2)}`
        );
      }

      if (reasons.length > 0) {
        rejected.push({
          path_id: path.path_id,
          reasons,
        });
      }
    });

    return rejected;
  }

  /**
   * Assess feasibility of individual path against gate failures
   */
  assessFeasibility(
    path: PathDimensionsForSelection,
    blockedByGates: string[]
  ): FeasibilityAssessment {
    const reasons: string[] = [];

    if (blockedByGates.length > 0) {
      reasons.push(`Failed gates: ${blockedByGates.join(", ")}`);
    }

    if (path.effort_hours > path.available_hours) {
      reasons.push(`Insufficient capacity: ${path.effort_hours}h > ${path.available_hours}h`);
    }

    if (path.capital_required > path.available_liquidity) {
      reasons.push(`Insufficient cash: $${path.capital_required} > $${path.available_liquidity}`);
    }

    return {
      path_id: path.path_id,
      is_feasible: blockedByGates.length === 0 && reasons.length === 0,
      blocked_by_gates: blockedByGates,
      reasons,
    };
  }

  /**
   * Validate dominance proof
   */
  validateDominanceProof(proof: DominanceProof): boolean {
    // dimensions_won must be 0-4
    if (proof.dimensions_won < 0 || proof.dimensions_won > 4) {
      logger.warn("Invalid dimensions_won", {
        dimensionsWon: proof.dimensions_won,
      });
      return false;
    }

    // All margin values must be finite and non-negative
    const margins = [
      proof.ev_margin_pct,
      proof.risk_margin_bp,
      proof.speed_margin_pct,
      proof.cost_margin_pct,
    ];

    for (const margin of margins) {
      if (!Number.isFinite(margin) || margin < 0) {
        logger.warn("Invalid margin value", {
          margin,
        });
        return false;
      }
    }

    // is_dominant must match dimensions_won >= 2
    if (proof.is_dominant !== (proof.dimensions_won >= 2)) {
      logger.warn("is_dominant mismatch with dimensions_won", {
        isDominant: proof.is_dominant,
        dimensionsWon: proof.dimensions_won,
      });
      return false;
    }

    return true;
  }
}

export const bestPathSelector = new BestPathSelector();
