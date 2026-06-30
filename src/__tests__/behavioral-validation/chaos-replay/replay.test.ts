/**
 * Chaos replay runtime (§7). Each scenario runs through the APPROVED production runtime in its own
 * isolated workspace/business, and the replay captures the supervisor summary, module/domain usage,
 * dominant constraint, accepted/rejected modules, assumption/confidence/missing-data, and the
 * dashboard-required fields. No static/fallback output can pass; scenarios in distinct workspaces do not
 * leak into one another.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { COUNTED_PUBLIC_CASES } from "@/behavioral-validation/chaos-replay/chaos-corpus";
import { publicCaseToChaosScenario } from "@/behavioral-validation/chaos-replay/chaos-schema";
import { replayScenario, scenarioIds, type ChaosReplayResult } from "@/behavioral-validation/chaos-replay/chaos-replay";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import type { PublicCase } from "@/behavioral-validation/public-cases/schema";

// One case from each of several distinct patterns/categories.
const SAMPLE: PublicCase[] = [
  COUNTED_PUBLIC_CASES.find((p) => p.meta.patternId === "cashflow_squeeze" && p.meta.businessCategory === "laundry")!,
  COUNTED_PUBLIC_CASES.find((p) => p.meta.patternId === "compliance_shutdown_risk" && p.meta.businessCategory === "restaurant")!,
  COUNTED_PUBLIC_CASES.find((p) => p.meta.patternId === "owner_overload" && p.meta.businessCategory === "agency")!,
  COUNTED_PUBLIC_CASES.find((p) => p.meta.patternId === "fake_completion_proof" && p.meta.businessCategory === "logistics")!,
];

let results: ChaosReplayResult[];

beforeAll(async () => {
  const store = new InMemoryLearningStore();
  results = await Promise.all(SAMPLE.map((pc) => replayScenario(pc, store)));
}, 120000);

describe("chaos replay runtime captures (§7)", () => {
  it("runs the approved runtime path and isolates each scenario in its own workspace/business", () => {
    for (let i = 0; i < SAMPLE.length; i++) {
      const r = results[i];
      const ids = scenarioIds(`CHAOS-${SAMPLE[i].meta.caseId}`);
      expect(r.producedFromRuntime).toBe(true);
      expect(r.workspaceId).toBe(ids.workspaceId);
      expect(r.businessId).toBe(ids.businessId);
    }
    // every scenario got a distinct isolated workspace+business
    expect(new Set(results.map((r) => r.workspaceId)).size).toBe(results.length);
    expect(new Set(results.map((r) => r.businessId)).size).toBe(results.length);
  });

  it("captures supervisor summary + module usage + dominant + accepted/rejected modules", () => {
    for (const r of results) {
      expect(r.supervisor.found).toBe(true);
      expect(r.modulesUsed.length).toBeGreaterThan(0);
      expect(typeof r.dominantConstraint).toBe("string");
      expect(r.acceptedModules.length + r.rejectedModules.length).toBeGreaterThan(0);
    }
  });

  it("captures assumption ledger + confidence + missing-data + dashboard-required fields", () => {
    for (const r of results) {
      const s = r.supervisor;
      expect(s.ledger.assumptionsAreMarked).toBe(true);
      expect(typeof s.confidence).toBe("string");
      expect(Array.isArray(r.dataSourceMissing)).toBe(true);
      // dashboard-required fields are all present
      expect(s.mainIssue.length).toBeGreaterThan(0);
      expect(s.doNow.length).toBeGreaterThan(0);
      expect(s.cadence.reassessmentTrigger.length).toBeGreaterThan(0);
      expect(s.proofNeeded.length).toBeGreaterThan(0);
    }
  });

  it("blocks fake confidence — confidence is never high while a critical domain is unbacked", () => {
    for (const r of results) {
      if (!r.criticalDomainsAllReal) expect(r.supervisor.confidence).not.toBe("high");
    }
  });

  it("no static/fallback — each result's dominant matches its own scenario's expected (not another's)", () => {
    for (let i = 0; i < SAMPLE.length; i++) {
      const expected = publicCaseToChaosScenario(SAMPLE[i]).expectedDominantConstraint;
      expect(results[i].dominantConstraint).toBe(expected);
    }
    // distinct scenarios produced distinct dominant/main-issue content (no shared static blob)
    const dominants = results.map((r) => r.dominantConstraint);
    expect(new Set(dominants).size).toBeGreaterThan(1);
  });
});
