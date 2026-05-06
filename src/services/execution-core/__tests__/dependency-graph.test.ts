import { describe, it, expect } from "vitest";
import { DependencyGraphBuilder } from "../dependency-graph";
import { ActionDependency } from "@/domain/execution/dependency";
import { v4 as uuidv4 } from "uuid";

describe("DependencyGraphBuilder", () => {
  const builder = new DependencyGraphBuilder();

  describe("buildGraph", () => {
    it("should build graph for independent actions", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: [] },
        { action_id: "C", depends_on: [] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph).not.toBeNull();
      expect(graph!.execution_order).toContain("A");
      expect(graph!.execution_order).toContain("B");
      expect(graph!.execution_order).toContain("C");
      expect(graph!.cycles_detected).toBe(false);
    });

    it("should build graph for sequential actions", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
        { action_id: "C", depends_on: ["B"] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph).not.toBeNull();
      expect(graph!.cycles_detected).toBe(false);
      const order = graph!.execution_order;
      expect(order.indexOf("A")).toBeLessThan(order.indexOf("B"));
      expect(order.indexOf("B")).toBeLessThan(order.indexOf("C"));
    });

    it("should build graph for diamond dependency", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
        { action_id: "C", depends_on: ["A"] },
        { action_id: "D", depends_on: ["B", "C"] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph).not.toBeNull();
      expect(graph!.cycles_detected).toBe(false);
      const order = graph!.execution_order;
      expect(order.indexOf("A")).toBeLessThan(order.indexOf("B"));
      expect(order.indexOf("A")).toBeLessThan(order.indexOf("C"));
      expect(order.indexOf("B")).toBeLessThan(order.indexOf("D"));
      expect(order.indexOf("C")).toBeLessThan(order.indexOf("D"));
    });

    it("should fail on circular dependency", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: ["B"] },
        { action_id: "B", depends_on: ["A"] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph).toBeNull();
    });

    it("should fail on self-referencing cycle", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: ["A"] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph).toBeNull();
    });

    it("should fail on missing dependency", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["NONEXISTENT"] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph).toBeNull();
    });

    it("should fail on complex cycle A→B→C→A", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: ["C"] },
        { action_id: "B", depends_on: ["A"] },
        { action_id: "C", depends_on: ["B"] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph).toBeNull();
    });

    it("should calculate dependency_map correctly", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
        { action_id: "C", depends_on: ["A"] },
        { action_id: "D", depends_on: ["B", "C"] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph).not.toBeNull();
      expect(graph!.dependency_map["A"]).toContain("B");
      expect(graph!.dependency_map["A"]).toContain("C");
      expect(graph!.dependency_map["A"]).toContain("D");
      expect(graph!.dependency_map["B"]).toContain("D");
      expect(graph!.dependency_map["C"]).toContain("D");
    });
  });

  describe("detectCycles", () => {
    it("should detect simple 2-node cycle", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: ["B"] },
        { action_id: "B", depends_on: ["A"] },
      ];

      const graph = builder.buildGraph(actions);
      expect(graph).toBeNull(); // Cycle detected, buildGraph returns null
    });

    it("should detect 3-node cycle", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: ["B"] },
        { action_id: "B", depends_on: ["C"] },
        { action_id: "C", depends_on: ["A"] },
      ];

      const graph = builder.buildGraph(actions);
      expect(graph).toBeNull();
    });

    it("should not fail on graph without cycles", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
        { action_id: "C", depends_on: ["B"] },
      ];

      const graph = builder.buildGraph(actions);
      expect(graph).not.toBeNull();
      expect(graph!.cycles_detected).toBe(false);
    });
  });

  describe("topologicalSort", () => {
    it("should produce deterministic ordering", () => {
      const actions: ActionDependency[] = [
        { action_id: "Z", depends_on: [] },
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
      ];

      const graph1 = builder.buildGraph(actions);
      const graph2 = builder.buildGraph(actions);

      expect(graph1!.execution_order).toEqual(graph2!.execution_order);
    });

    it("should preserve dependency order", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
        { action_id: "C", depends_on: ["B"] },
      ];

      const graph = builder.buildGraph(actions);
      const order = graph!.execution_order;

      expect(order.indexOf("A")).toBeLessThan(order.indexOf("B"));
      expect(order.indexOf("B")).toBeLessThan(order.indexOf("C"));
    });

    it("should handle parallel actions", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
        { action_id: "C", depends_on: ["A"] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph!.execution_order.indexOf("A")).toBeLessThan(
        graph!.execution_order.indexOf("B")
      );
      expect(graph!.execution_order.indexOf("A")).toBeLessThan(
        graph!.execution_order.indexOf("C")
      );
    });
  });

  describe("calculateDownstreamImpact", () => {
    it("should calculate downstream for single branch", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
        { action_id: "C", depends_on: ["B"] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph!.dependency_map["A"]).toContain("B");
      expect(graph!.dependency_map["A"]).toContain("C");
      expect(graph!.dependency_map["B"]).toContain("C");
      expect(graph!.dependency_map["C"]).toEqual([]);
    });

    it("should calculate downstream for branching", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
        { action_id: "C", depends_on: ["A"] },
        { action_id: "D", depends_on: ["B", "C"] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph!.dependency_map["A"]).toContain("B");
      expect(graph!.dependency_map["A"]).toContain("C");
      expect(graph!.dependency_map["A"]).toContain("D");
    });

    it("should return empty downstream for leaf actions", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph!.dependency_map["B"]).toEqual([]);
    });
  });

  describe("getDownstreamImpact", () => {
    it("should return correct downstream impact", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
        { action_id: "C", depends_on: ["A"] },
      ];

      const graph = builder.buildGraph(actions)!;
      const impact = builder.getDownstreamImpact(graph, "A");

      expect(impact.action_id).toBe("A");
      expect(impact.downstream_actions).toContain("B");
      expect(impact.downstream_actions).toContain("C");
      expect(impact.downstream_count).toBe(2);
    });

    it("should return zero downstream for leaf action", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
      ];

      const graph = builder.buildGraph(actions)!;
      const impact = builder.getDownstreamImpact(graph, "B");

      expect(impact.downstream_count).toBe(0);
      expect(impact.downstream_actions).toEqual([]);
    });
  });

  describe("findCriticalPath", () => {
    it("should identify critical path in linear chain", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
        { action_id: "C", depends_on: ["B"] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph!.critical_path).toContain("A");
      expect(graph!.critical_path).toContain("B");
      expect(graph!.critical_path).toContain("C");
      expect(graph!.critical_path[0]).toBe("A");
      expect(graph!.critical_path[graph!.critical_path.length - 1]).toBe("C");
    });

    it("should identify longest path in branching", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
        { action_id: "C", depends_on: ["A"] },
        { action_id: "D", depends_on: ["B"] },
        { action_id: "E", depends_on: ["D"] },
      ];

      const graph = builder.buildGraph(actions);

      // Critical path should be A → B → D → E
      expect(graph!.critical_path).toContain("A");
      expect(graph!.critical_path).toContain("E");
    });
  });

  describe("validateGraphConsistency", () => {
    it("should validate consistent graph", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
      ];

      const graph = builder.buildGraph(actions)!;
      const is_valid = builder.validateGraphConsistency(graph);

      expect(is_valid).toBe(true);
    });

    it("should reject graph with cycles", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: ["B"] },
        { action_id: "B", depends_on: ["A"] },
      ];

      const graph = builder.buildGraph(actions);
      expect(graph).toBeNull();
    });

    it("should reject empty graph", () => {
      const actions: ActionDependency[] = [];
      const graph = builder.buildGraph(actions);
      expect(graph).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("should handle single action", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph).not.toBeNull();
      expect(graph!.execution_order).toEqual(["A"]);
      expect(graph!.dependency_map["A"]).toEqual([]);
    });

    it("should handle large dependency chain", () => {
      const actions: ActionDependency[] = [];
      for (let i = 0; i < 100; i++) {
        actions.push({
          action_id: `A${i}`,
          depends_on: i > 0 ? [`A${i - 1}`] : [],
        });
      }

      const graph = builder.buildGraph(actions);

      expect(graph).not.toBeNull();
      expect(graph!.execution_order).toHaveLength(100);
      expect(graph!.cycles_detected).toBe(false);
    });

    it("should handle wide branching (many parallel actions)", () => {
      const actions: ActionDependency[] = [
        { action_id: "ROOT", depends_on: [] },
      ];
      for (let i = 0; i < 50; i++) {
        actions.push({
          action_id: `LEAF${i}`,
          depends_on: ["ROOT"],
        });
      }

      const graph = builder.buildGraph(actions);

      expect(graph).not.toBeNull();
      expect(graph!.execution_order).toHaveLength(51);
      expect(graph!.dependency_map["ROOT"]).toHaveLength(50);
    });

    it("should handle complex multi-layer graph", () => {
      const actions: ActionDependency[] = [
        { action_id: "A", depends_on: [] },
        { action_id: "B", depends_on: ["A"] },
        { action_id: "C", depends_on: ["A"] },
        { action_id: "D", depends_on: ["B", "C"] },
        { action_id: "E", depends_on: ["D"] },
        { action_id: "F", depends_on: ["E"] },
      ];

      const graph = builder.buildGraph(actions);

      expect(graph).not.toBeNull();
      expect(graph!.cycles_detected).toBe(false);
      expect(graph!.execution_order.length).toBe(6);
    });
  });
});
