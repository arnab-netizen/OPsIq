/**
 * Jarvis 360 gap-closure (G06) — regression: every registered material owner path still
 * invokes its safety/decision gate. If a future change removes a gate call from a material
 * path (a silent bypass), this fails. Reads source statically (no DB, deterministic).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MATERIAL_GATE_PATHS } from "@/services/owner-mode/material-gate-registry";

const repoRoot = resolve(__dirname, "../../..");

describe("material gate registry — structural assertions", () => {
  it("has at least 12 registered paths (4 core + 7 domain + 1 budget)", () => {
    expect(MATERIAL_GATE_PATHS.length).toBeGreaterThanOrEqual(12);
  });
  it("all path IDs are unique strings", () => {
    const ids = MATERIAL_GATE_PATHS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("all paths have a non-empty file field ending in .ts", () => {
    for (const p of MATERIAL_GATE_PATHS) {
      expect(p.file.endsWith(".ts")).toBe(true);
    }
  });
  it("all paths have a non-empty enforcingSymbol", () => {
    for (const p of MATERIAL_GATE_PATHS) {
      expect(p.enforcingSymbol.length).toBeGreaterThan(0);
    }
  });
  it("all paths have a non-empty rationale", () => {
    for (const p of MATERIAL_GATE_PATHS) {
      expect(p.rationale.length).toBeGreaterThan(0);
    }
  });
  it("task.complete path enforces evaluateProofClearance", () => {
    const p = MATERIAL_GATE_PATHS.find((x) => x.id === "task.complete");
    expect(p?.enforcingSymbol).toBe("evaluateProofClearance");
  });
  it("approval.enforce path enforces resolveOwnerApproval", () => {
    const p = MATERIAL_GATE_PATHS.find((x) => x.id === "approval.enforce");
    expect(p?.enforcingSymbol).toBe("resolveOwnerApproval");
  });
  it("recommendation.approve path enforces enforceOwnerGatesForPromotion", () => {
    const p = MATERIAL_GATE_PATHS.find((x) => x.id === "recommendation.approve");
    expect(p?.enforcingSymbol).toBe("enforceOwnerGatesForPromotion");
  });
  it("recommendation.generate.arbitrate path enforces arbitrateInterventions", () => {
    const p = MATERIAL_GATE_PATHS.find((x) => x.id === "recommendation.generate.arbitrate");
    expect(p?.enforcingSymbol).toBe("arbitrateInterventions");
  });
  it("owner.budget.action path is registered with enforceOwnerActionGates", () => {
    const p = MATERIAL_GATE_PATHS.find((x) => x.id === "owner.budget.action");
    expect(p).toBeDefined();
    expect(p?.enforcingSymbol).toBe("enforceOwnerActionGates");
  });
  it("all 7 core domain action paths are registered", () => {
    const domains = ["finance", "cashflow", "sales", "marketing", "operations", "sop", "strategy"];
    for (const d of domains) {
      expect(MATERIAL_GATE_PATHS.find((x) => x.id === `owner.${d}.action`), `missing owner.${d}.action`).toBeDefined();
    }
  });
  it("all domain action paths enforce enforceOwnerActionGates", () => {
    const domainPaths = MATERIAL_GATE_PATHS.filter((x) => x.id.startsWith("owner.") && x.id.endsWith(".action"));
    for (const p of domainPaths) {
      expect(p.enforcingSymbol).toBe("enforceOwnerActionGates");
    }
  });
  it("owner.finance.action targets the correct file", () => {
    const p = MATERIAL_GATE_PATHS.find((x) => x.id === "owner.finance.action");
    expect(p?.file).toBe("src/services/owner-finance/action.service.ts");
  });
  it("owner.sales.action targets the correct file", () => {
    const p = MATERIAL_GATE_PATHS.find((x) => x.id === "owner.sales.action");
    expect(p?.file).toBe("src/services/owner-sales/action.service.ts");
  });
  it("owner.strategy.action targets the correct file", () => {
    const p = MATERIAL_GATE_PATHS.find((x) => x.id === "owner.strategy.action");
    expect(p?.file).toBe("src/services/owner-strategy/action.service.ts");
  });
  it("all path IDs are lowercase (no uppercase letters)", () => {
    for (const p of MATERIAL_GATE_PATHS) {
      expect(p.id).toBe(p.id.toLowerCase());
    }
  });
  it("recommendation.approve file targets src/services/recommendation.ts", () => {
    const p = MATERIAL_GATE_PATHS.find((x) => x.id === "recommendation.approve");
    expect(p?.file).toBe("src/services/recommendation.ts");
  });
  it("task.complete file targets src/services/execution/task-completion.service.ts", () => {
    const p = MATERIAL_GATE_PATHS.find((x) => x.id === "task.complete");
    expect(p?.file).toBe("src/services/execution/task-completion.service.ts");
  });
  it("MATERIAL_GATE_PATHS is a non-null array", () => {
    expect(Array.isArray(MATERIAL_GATE_PATHS)).toBe(true);
  });
});

describe("material gate registry", () => {
  it("registers at least the known material owner paths", () => {
    const ids = MATERIAL_GATE_PATHS.map((p) => p.id);
    expect(ids).toContain("recommendation.approve");
    expect(ids).toContain("task.complete");
    expect(ids).toContain("approval.enforce");
    expect(ids).toContain("recommendation.generate.arbitrate");
  });

  it.each(MATERIAL_GATE_PATHS.map((p) => [p.id, p]))(
    "path %s still invokes its enforcing symbol",
    (_id, path) => {
      const src = readFileSync(resolve(repoRoot, (path as { file: string }).file), "utf8");
      expect(src).toContain((path as { enforcingSymbol: string }).enforcingSymbol);
    }
  );
});
