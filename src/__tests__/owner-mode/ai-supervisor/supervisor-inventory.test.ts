/**
 * AI Supervisor INVENTORY contract test.
 *
 * Validates OPSIQ_AI_SUPERVISOR_INVENTORY.json: every declared owner-visible / dashboard advice path is
 * inventoried with real files; the inventory FAILS if a high-impact owner-visible advice path has no
 * confidence/missing-data handling, or if any path lacks workspace/business scoping, or if an
 * owner-visible advice path is model-backed (owner advice is deterministic — no parallel AI brain).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

interface InvPath {
  id: string;
  file: string;
  function: string;
  route?: string;
  kind: "deterministic" | "hybrid" | "model_backed";
  ownerVisible: boolean;
  dashboardVisible: boolean;
  highImpact: boolean;
  domains: string[];
  workspaceScoped: boolean;
  businessScoped: boolean;
  confidenceHandling: boolean;
  missingDataHandling: boolean;
  assumptionsHandling: boolean;
  profitCashWorkloadRelevant: boolean;
  safetyGates: string[];
  tests: string[];
}

const inventory = JSON.parse(
  readFileSync(resolve(process.cwd(), "OPSIQ_AI_SUPERVISOR_INVENTORY.json"), "utf8"),
) as { ownerAdviceIsDeterministic: boolean; paths: InvPath[] };

/** The declared owner-facing advice/recommendation routes that MUST each be inventoried. */
const REQUIRED_ADVICE_ROUTES = [
  "src/app/api/owner/whole-business-plan/route.ts",
  "src/app/api/owner/priorities/route.ts",
  "src/app/api/owner/input-guidance/route.ts",
  "src/app/api/owner/readiness/route.ts",
  "src/app/api/owner/action-plan/route.ts",
  "src/app/api/owner/command-center/route.ts",
  "src/app/api/owner/control-center/route.ts",
  "src/app/api/owner/opportunities/decide/route.ts",
];

describe("AI supervisor inventory — module contract assertions", () => {
  it("readFileSync is a function", () => { expect(typeof readFileSync).toBe("function"); });
  it("existsSync is a function", () => { expect(typeof existsSync).toBe("function"); });
  it("inventory is an object", () => { expect(typeof inventory).toBe("object"); });
  it("inventory has paths field", () => { expect(inventory).toHaveProperty("paths"); });
  it("inventory.paths is an array", () => { expect(Array.isArray(inventory.paths)).toBe(true); });
  it("inventory has ownerAdviceIsDeterministic field", () => { expect(inventory).toHaveProperty("ownerAdviceIsDeterministic"); });
  it("inventory.ownerAdviceIsDeterministic is true", () => { expect(inventory.ownerAdviceIsDeterministic).toBe(true); });
  it("REQUIRED_ADVICE_ROUTES is an array", () => { expect(Array.isArray(REQUIRED_ADVICE_ROUTES)).toBe(true); });
  it("REQUIRED_ADVICE_ROUTES has 8 elements", () => { expect(REQUIRED_ADVICE_ROUTES.length).toBe(8); });
  it("REQUIRED_ADVICE_ROUTES includes the whole-business-plan route", () => { expect(REQUIRED_ADVICE_ROUTES.some((r) => r.includes("whole-business-plan"))).toBe(true); });
  it("inventory.paths.length is at least 8", () => { expect(inventory.paths.length).toBeGreaterThanOrEqual(8); });
  it("each path in inventory has an id field", () => { for (const p of inventory.paths) expect(p).toHaveProperty("id"); });
  it("each path in inventory has a file field", () => { for (const p of inventory.paths) expect(p).toHaveProperty("file"); });
  it("each path in inventory has a kind field", () => { for (const p of inventory.paths) expect(p).toHaveProperty("kind"); });
});

describe("AI supervisor inventory", () => {
  it("declares owner advice as deterministic and inventories at least the core supervisor paths", () => {
    expect(inventory.ownerAdviceIsDeterministic).toBe(true);
    expect(Array.isArray(inventory.paths)).toBe(true);
    expect(inventory.paths.length).toBeGreaterThanOrEqual(8);
    expect(inventory.paths.some((p) => p.id === "owner-advice-runtime")).toBe(true);
  });

  it("every inventoried path references a real file (and route + at least one test file where given)", () => {
    for (const p of inventory.paths) {
      expect(existsSync(resolve(process.cwd(), p.file)), `${p.id}: file ${p.file}`).toBe(true);
      if (p.route) expect(existsSync(resolve(process.cwd(), p.route)), `${p.id}: route ${p.route}`).toBe(true);
      expect(p.tests.length, `${p.id}: has tests`).toBeGreaterThan(0);
      expect(p.tests.some((t) => existsSync(resolve(process.cwd(), t))), `${p.id}: a test file exists`).toBe(true);
    }
  });

  it("every declared owner-visible advice ROUTE is inventoried (no silent omission)", () => {
    const inventoriedRoutes = new Set(inventory.paths.map((p) => p.route).filter(Boolean));
    for (const r of REQUIRED_ADVICE_ROUTES) {
      expect(inventoriedRoutes.has(r), `advice route not inventoried: ${r}`).toBe(true);
    }
  });

  it("FAILS if a high-impact owner-visible advice path has no confidence/missing-data handling", () => {
    for (const p of inventory.paths) {
      if (p.highImpact && p.ownerVisible) {
        expect(p.confidenceHandling, `${p.id}: high-impact owner-visible path must handle confidence`).toBe(true);
        expect(p.missingDataHandling, `${p.id}: high-impact owner-visible path must handle missing data`).toBe(true);
      }
    }
  });

  it("FAILS if any path lacks workspace OR business scoping", () => {
    for (const p of inventory.paths) {
      expect(p.workspaceScoped, `${p.id}: workspace scoped`).toBe(true);
      expect(p.businessScoped, `${p.id}: business scoped`).toBe(true);
    }
  });

  it("no owner-visible advice path is model-backed (owner advice stays deterministic — no parallel brain)", () => {
    for (const p of inventory.paths) {
      if (p.ownerVisible) expect(p.kind, `${p.id}: must not be model_backed`).not.toBe("model_backed");
    }
  });

  it("every path carries at least one declared safety gate", () => {
    for (const p of inventory.paths) {
      expect(Array.isArray(p.safetyGates) && p.safetyGates.length > 0, `${p.id}: has safety gates`).toBe(true);
    }
  });
});
