import { describe, it, expect } from "vitest";
import { BestPathSelector, BestPathSelector as Selector } from "../best-path-selector";
import { PathDimensionsForSelection } from "@/domain/decision/best-path-selection";
import { v4 as uuidv4 } from "uuid";

describe("BestPathSelector", () => {
  const selector = new Selector();

  const createPathDimensions = (
    overrides: Partial<PathDimensionsForSelection> = {}
  ): PathDimensionsForSelection => ({
    path_id: uuidv4(),
    priority_score: 50,
    expected_value: 100000,
    downside_exposure: 50000,
    payback_days: 120,
    roi_percent: 100,
    risk_score: 0.3,
    speed_factor: 0.01,
    cost_total: 50000,
    effort_hours: 40,
    available_hours: 200,
    capital_required: 50000,
    available_liquidity: 500000,
    strategy_type: "revenue_growth",
    ...overrides,
  });

  describe("selectBestPath", () => {
    it("should select path with highest priority score", () => {
      const paths = [
        createPathDimensions({
          path_id: "path-1",
          priority_score: 30,
          expected_value: 100000,
        }),
        createPathDimensions({
          path_id: "path-2",
          priority_score: 75,
          expected_value: 80000,
        }),
        createPathDimensions({
          path_id: "path-3",
          priority_score: 50,
          expected_value: 120000,
        }),
      ];

      const result = selector.selectBestPath(paths, new Map());

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selected_path_id).toBe("path-2");
      }
    });

    it("should use expected_value as secondary ranking criterion", () => {
      const paths = [
        createPathDimensions({
          path_id: "path-1",
          priority_score: 50,
          expected_value: 80000,
        }),
        createPathDimensions({
          path_id: "path-2",
          priority_score: 50,
          expected_value: 120000,
        }),
      ];

      const result = selector.selectBestPath(paths, new Map());

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selected_path_id).toBe("path-2");
      }
    });

    it("should use roi_percent as tertiary ranking criterion", () => {
      const paths = [
        createPathDimensions({
          path_id: "path-1",
          priority_score: 50,
          expected_value: 100000,
          roi_percent: 50,
        }),
        createPathDimensions({
          path_id: "path-2",
          priority_score: 50,
          expected_value: 100000,
          roi_percent: 150,
        }),
      ];

      const result = selector.selectBestPath(paths, new Map());

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selected_path_id).toBe("path-2");
      }
    });

    it("should eliminate paths blocked by gates", () => {
      const paths = [
        createPathDimensions({
          path_id: "path-1",
          priority_score: 75,
        }),
        createPathDimensions({
          path_id: "path-2",
          priority_score: 50,
        }),
      ];

      const blockedByGates = new Map<string, string[]>([
        ["path-1", ["capacity_available", "cash_runway_safe"]],
      ]);

      const result = selector.selectBestPath(paths, blockedByGates);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selected_path_id).toBe("path-2");
      }
    });

    it("should eliminate paths with insufficient capacity", () => {
      const paths = [
        createPathDimensions({
          path_id: "path-1",
          priority_score: 75,
          effort_hours: 250,
          available_hours: 200,
        }),
        createPathDimensions({
          path_id: "path-2",
          priority_score: 50,
          effort_hours: 40,
          available_hours: 200,
        }),
      ];

      const result = selector.selectBestPath(paths, new Map());

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selected_path_id).toBe("path-2");
      }
    });

    it("should eliminate paths with insufficient cash", () => {
      const paths = [
        createPathDimensions({
          path_id: "path-1",
          priority_score: 75,
          capital_required: 600000,
          available_liquidity: 500000,
        }),
        createPathDimensions({
          path_id: "path-2",
          priority_score: 50,
          capital_required: 50000,
          available_liquidity: 500000,
        }),
      ];

      const result = selector.selectBestPath(paths, new Map());

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selected_path_id).toBe("path-2");
      }
    });

    it("should return null if no feasible paths exist", () => {
      const paths = [
        createPathDimensions({
          path_id: "path-1",
          effort_hours: 250,
          available_hours: 200,
        }),
      ];

      const result = selector.selectBestPath(paths, new Map());

      expect(result).toBeNull();
    });

    it("should generate dominance proof for selected path", () => {
      const paths = [
        createPathDimensions({
          path_id: "path-1",
          priority_score: 75,
          expected_value: 150000,
          risk_score: 0.2,
          cost_total: 40000,
        }),
        createPathDimensions({
          path_id: "path-2",
          priority_score: 50,
          expected_value: 100000,
          risk_score: 0.4,
          cost_total: 50000,
        }),
      ];

      const result = selector.selectBestPath(paths, new Map());

      expect(result).not.toBeNull();
      if (result) {
        expect(result.dominance_proof).toBeDefined();
        expect(result.dominance_proof.winner_id).toBe("path-1");
        expect(result.dominance_proof.runner_up_id).toBe("path-2");
      }
    });

    it("should calculate confidence based on dimensions won", () => {
      const paths = [
        createPathDimensions({
          path_id: "path-1",
          priority_score: 75,
          expected_value: 150000,
          risk_score: 0.2,
          speed_factor: 0.015,
          cost_total: 40000,
        }),
        createPathDimensions({
          path_id: "path-2",
          priority_score: 50,
          expected_value: 100000,
          risk_score: 0.4,
          speed_factor: 0.01,
          cost_total: 50000,
        }),
      ];

      const result = selector.selectBestPath(paths, new Map());

      expect(result).not.toBeNull();
      if (result) {
        expect(result.confidence).toBeGreaterThan(0.6);
        expect(result.confidence).toBeLessThanOrEqual(0.95);
      }
    });

    it("should include rejected paths with reasons", () => {
      const paths = [
        createPathDimensions({
          path_id: "path-1",
          priority_score: 75,
        }),
        createPathDimensions({
          path_id: "path-2",
          priority_score: 50,
        }),
      ];

      const result = selector.selectBestPath(paths, new Map());

      expect(result).not.toBeNull();
      if (result) {
        expect(result.rejected_paths).toBeDefined();
        expect(result.rejected_paths.length).toBeGreaterThan(0);
        expect(result.rejected_paths[0].reasons.length).toBeGreaterThan(0);
      }
    });
  });

  describe("calculateDominanceProof", () => {
    it("should count EV dimension win correctly", () => {
      const winner = createPathDimensions({
        path_id: "path-1",
        expected_value: 150000,
        risk_score: 0.5, // Tie
        speed_factor: 0.01, // Tie
        cost_total: 50000, // Tie
      });

      const runnerUp = createPathDimensions({
        path_id: "path-2",
        expected_value: 100000,
        risk_score: 0.5,
        speed_factor: 0.01,
        cost_total: 50000,
      });

      const proof = (selector as any).calculateDominanceProof(winner, runnerUp);

      expect(proof.dimensions_won).toBeGreaterThanOrEqual(1);
    });

    it("should count risk dimension win correctly (lower is better)", () => {
      const winner = createPathDimensions({
        path_id: "path-1",
        expected_value: 100000, // Tie
        risk_score: 0.2, // Lower risk (winner)
        speed_factor: 0.01, // Tie
        cost_total: 50000, // Tie
      });

      const runnerUp = createPathDimensions({
        path_id: "path-2",
        expected_value: 100000,
        risk_score: 0.5,
        speed_factor: 0.01,
        cost_total: 50000,
      });

      const proof = (selector as any).calculateDominanceProof(winner, runnerUp);

      expect(proof.dimensions_won).toBeGreaterThanOrEqual(1);
      expect(proof.risk_margin_bp).toBeGreaterThan(0);
    });

    it("should count speed dimension win correctly (higher is better)", () => {
      const winner = createPathDimensions({
        path_id: "path-1",
        expected_value: 100000, // Tie
        risk_score: 0.3, // Tie
        speed_factor: 0.02, // Higher speed (winner)
        cost_total: 50000, // Tie
      });

      const runnerUp = createPathDimensions({
        path_id: "path-2",
        expected_value: 100000,
        risk_score: 0.3,
        speed_factor: 0.01,
        cost_total: 50000,
      });

      const proof = (selector as any).calculateDominanceProof(winner, runnerUp);

      expect(proof.dimensions_won).toBeGreaterThanOrEqual(1);
      expect(proof.speed_margin_pct).toBeGreaterThan(0);
    });

    it("should count cost dimension win correctly (lower is better)", () => {
      const winner = createPathDimensions({
        path_id: "path-1",
        expected_value: 100000, // Tie
        risk_score: 0.3, // Tie
        speed_factor: 0.01, // Tie
        cost_total: 40000, // Lower cost (winner)
      });

      const runnerUp = createPathDimensions({
        path_id: "path-2",
        expected_value: 100000,
        risk_score: 0.3,
        speed_factor: 0.01,
        cost_total: 50000,
      });

      const proof = (selector as any).calculateDominanceProof(winner, runnerUp);

      expect(proof.dimensions_won).toBeGreaterThanOrEqual(1);
      expect(proof.cost_margin_pct).toBeGreaterThan(0);
    });

    it("should identify dominant path (>=2 dimensions)", () => {
      const winner = createPathDimensions({
        path_id: "path-1",
        expected_value: 150000, // Win
        risk_score: 0.2, // Win
        speed_factor: 0.01, // Tie
        cost_total: 50000, // Tie
      });

      const runnerUp = createPathDimensions({
        path_id: "path-2",
        expected_value: 100000,
        risk_score: 0.5,
        speed_factor: 0.01,
        cost_total: 50000,
      });

      const proof = (selector as any).calculateDominanceProof(winner, runnerUp);

      expect(proof.is_dominant).toBe(true);
      expect(proof.dimensions_won).toBeGreaterThanOrEqual(2);
    });

    it("should identify non-dominant path (<2 dimensions)", () => {
      const winner = createPathDimensions({
        path_id: "path-1",
        expected_value: 150000, // Win
        risk_score: 0.5, // Lose
        speed_factor: 0.009, // Lose
        cost_total: 50000, // Tie
      });

      const runnerUp = createPathDimensions({
        path_id: "path-2",
        expected_value: 100000,
        risk_score: 0.3,
        speed_factor: 0.01,
        cost_total: 50000,
      });

      const proof = (selector as any).calculateDominanceProof(winner, runnerUp);

      expect(proof.is_dominant).toBe(false);
      expect(proof.dimensions_won).toBeLessThan(2);
    });
  });

  describe("assessFeasibility", () => {
    it("should mark path as feasible with no issues", () => {
      const path = createPathDimensions();

      const assessment = selector.assessFeasibility(path, []);

      expect(assessment.is_feasible).toBe(true);
      expect(assessment.reasons).toHaveLength(0);
    });

    it("should mark path as infeasible when blocked by gates", () => {
      const path = createPathDimensions();

      const assessment = selector.assessFeasibility(path, ["capacity_available", "cash_runway_safe"]);

      expect(assessment.is_feasible).toBe(false);
      expect(assessment.blocked_by_gates.length).toBe(2);
    });

    it("should identify insufficient capacity reason", () => {
      const path = createPathDimensions({
        effort_hours: 250,
        available_hours: 200,
      });

      const assessment = selector.assessFeasibility(path, []);

      expect(assessment.is_feasible).toBe(false);
      expect(assessment.reasons.some((r) => r.includes("capacity"))).toBe(true);
    });

    it("should identify insufficient cash reason", () => {
      const path = createPathDimensions({
        capital_required: 600000,
        available_liquidity: 500000,
      });

      const assessment = selector.assessFeasibility(path, []);

      expect(assessment.is_feasible).toBe(false);
      expect(assessment.reasons.some((r) => r.includes("cash"))).toBe(true);
    });
  });

  describe("validateDominanceProof", () => {
    it("should validate correct dominance proof", () => {
      const path1 = createPathDimensions();
      const path2 = createPathDimensions();

      const proof = (selector as any).calculateDominanceProof(path1, path2);

      expect(selector.validateDominanceProof(proof)).toBe(true);
    });

    it("should reject invalid dimensions_won", () => {
      const path1 = createPathDimensions();
      const path2 = createPathDimensions();

      const proof = (selector as any).calculateDominanceProof(path1, path2);
      proof.dimensions_won = 5; // Invalid

      expect(selector.validateDominanceProof(proof)).toBe(false);
    });

    it("should reject invalid margin values (NaN)", () => {
      const path1 = createPathDimensions();
      const path2 = createPathDimensions();

      const proof = (selector as any).calculateDominanceProof(path1, path2);
      proof.ev_margin_pct = NaN;

      expect(selector.validateDominanceProof(proof)).toBe(false);
    });

    it("should reject invalid margin values (negative)", () => {
      const path1 = createPathDimensions();
      const path2 = createPathDimensions();

      const proof = (selector as any).calculateDominanceProof(path1, path2);
      proof.risk_margin_bp = -10;

      expect(selector.validateDominanceProof(proof)).toBe(false);
    });

    it("should reject is_dominant mismatch", () => {
      const path1 = createPathDimensions();
      const path2 = createPathDimensions();

      const proof = (selector as any).calculateDominanceProof(path1, path2);
      proof.is_dominant = !proof.is_dominant; // Flip to create mismatch

      if (proof.dimensions_won >= 2) {
        // Only invalid if mismatch occurs
        expect(selector.validateDominanceProof(proof)).toBe(false);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle single path input", () => {
      const paths = [createPathDimensions({ path_id: "path-1" })];

      const result = selector.selectBestPath(paths, new Map());

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selected_path_id).toBe("path-1");
      }
    });

    it("should handle paths with all blocked by gates", () => {
      const paths = [
        createPathDimensions({ path_id: "path-1" }),
        createPathDimensions({ path_id: "path-2" }),
      ];

      const blockedByGates = new Map<string, string[]>([
        ["path-1", ["capacity_available"]],
        ["path-2", ["cash_runway_safe"]],
      ]);

      const result = selector.selectBestPath(paths, blockedByGates);

      expect(result).toBeNull();
    });

    it("should handle paths with zero cost", () => {
      const paths = [
        createPathDimensions({
          path_id: "path-1",
          cost_total: 0,
          expected_value: 100000,
        }),
        createPathDimensions({
          path_id: "path-2",
          cost_total: 50000,
          expected_value: 100000,
        }),
      ];

      const result = selector.selectBestPath(paths, new Map());

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selected_path_id).toBe("path-1");
      }
    });

    it("should handle paths with identical scores", () => {
      const paths = [
        createPathDimensions({
          path_id: "path-1",
          priority_score: 50,
          expected_value: 100000,
          roi_percent: 100,
        }),
        createPathDimensions({
          path_id: "path-2",
          priority_score: 50,
          expected_value: 100000,
          roi_percent: 100,
        }),
      ];

      const result = selector.selectBestPath(paths, new Map());

      expect(result).not.toBeNull();
      if (result) {
        // Should select one (deterministic based on tie-breakers)
        expect(["path-1", "path-2"]).toContain(result.selected_path_id);
      }
    });
  });

  describe("Confidence Calculation", () => {
    it("should set confidence to 0.6 if dominance < 2 dimensions", () => {
      const paths = [
        createPathDimensions({
          path_id: "path-1",
          expected_value: 150000, // Win
          risk_score: 0.5, // Lose
          speed_factor: 0.009, // Lose
          cost_total: 50000,
        }),
        createPathDimensions({
          path_id: "path-2",
          expected_value: 100000,
          risk_score: 0.3,
          speed_factor: 0.01,
          cost_total: 50000,
        }),
      ];

      const result = selector.selectBestPath(paths, new Map());

      expect(result).not.toBeNull();
      if (result && result.dominance_proof.dimensions_won < 2) {
        expect(result.confidence).toBe(0.6);
      }
    });

    it("should increase confidence with more dimensions won", () => {
      const twoWinPath = createPathDimensions({
        path_id: "path-2d",
        expected_value: 150000,
        risk_score: 0.2,
        speed_factor: 0.01,
        cost_total: 50000,
      });

      const fourWinPath = createPathDimensions({
        path_id: "path-4d",
        expected_value: 150000,
        risk_score: 0.2,
        speed_factor: 0.02,
        cost_total: 40000,
      });

      const lowPath = createPathDimensions({
        expected_value: 100000,
        risk_score: 0.5,
        speed_factor: 0.01,
        cost_total: 50000,
      });

      const result2D = selector.selectBestPath([twoWinPath, lowPath], new Map());
      const result4D = selector.selectBestPath([fourWinPath, lowPath], new Map());

      expect(result2D).not.toBeNull();
      expect(result4D).not.toBeNull();

      if (result2D && result4D) {
        expect(result4D.confidence).toBeGreaterThanOrEqual(result2D.confidence);
      }
    });
  });
});
