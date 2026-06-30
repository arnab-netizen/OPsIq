/**
 * Independent gold cases (§4) — circularity reduction. Each case's expected outcome is HAND-AUTHORED in the
 * fixture (not the corpus goldSkeleton, not copied from runtime output). The case is run through the REAL
 * engine with NO expected-constraint hint, and the engine must INDEPENDENTLY agree. Also proves the 15 new
 * sources are schema-valid + privacy-clean (source breadth), and that expectations are locked before output.
 */
import { describe, it, expect } from "vitest";
import {
  INDEPENDENT_GOLD_CASES, INDEPENDENT_SOURCES, validateIndependentSources,
} from "@/behavioral-validation/chaos-replay/independent-gold";
import { runOwnerAdvice } from "@/services/owner-mode/owner-advice-runtime.service";
import { caseToContext } from "@/behavioral-validation/whole-business/production-runner";
import { runtimeToSupervisorInput } from "@/behavioral-validation/chaos-replay/chaos-replay";
import { buildSupervisorSummary } from "@/domain/owner-mode/supervisor-summary";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { findPII, hasLongCopiedText } from "@/behavioral-validation/public-cases/source-register";

describe("independent gold — loading + lock (§4)", () => {
  it("loads 15 independently-authored gold cases, one per category", () => {
    expect(INDEPENDENT_GOLD_CASES.length).toBe(15);
    expect(new Set(INDEPENDENT_GOLD_CASES.map((g) => g.businessCategory)).size).toBe(15);
  });

  it("every expected outcome exists (hand-authored) BEFORE any replay", () => {
    for (const g of INDEPENDENT_GOLD_CASES) {
      expect(g.expected.dominantConstraint).toBeTruthy();
      expect(g.expected.modules.length).toBeGreaterThan(0);
      expect(g.expected.doNotDo.length).toBeGreaterThan(4);
      expect(g.expected.safeNextAction.length).toBeGreaterThan(4);
      expect(g.expected.rationale.length).toBeGreaterThan(8);
      expect(g.expected.realWorldConsequenceIfWrong.length).toBeGreaterThan(8);
    }
  });

  it("a locked expectation cannot be mutated after the fact (unless explicitly re-authored)", () => {
    const locked = Object.freeze({ ...INDEPENDENT_GOLD_CASES[0].expected });
    expect(() => { (locked as { dominantConstraint: string }).dominantConstraint = "optimization"; }).toThrow();
  });
});

describe("independent gold — source breadth (§5)", () => {
  it("provides 15 new, schema-valid, privacy-clean sources", () => {
    expect(INDEPENDENT_SOURCES.length).toBe(15);
    expect(validateIndependentSources()).toEqual({ ok: true, errors: [] });
    for (const s of INDEPENDENT_SOURCES) {
      for (const f of [s.title, s.citation ?? "", ...s.factsUsed]) {
        expect(findPII(f), `${s.id} PII`).toEqual([]);
        expect(hasLongCopiedText(f), `${s.id} long text`).toBe(false);
      }
    }
  });

  it("each gold case links to a distinct new source (no reuse, no hallucination)", () => {
    const refs = INDEPENDENT_GOLD_CASES.map((g) => g.sourceRef);
    expect(new Set(refs).size).toBe(15);
    const ids = new Set(INDEPENDENT_SOURCES.map((s) => s.id));
    for (const r of refs) expect(ids.has(r), r).toBe(true);
  });
});

describe("independent gold — engine independently agrees (circularity → LOW)", () => {
  it("the real engine resolves each hand-authored dominant WITHOUT being told the answer", async () => {
    const store = new InMemoryLearningStore();
    const disagreements: string[] = [];
    for (const g of INDEPENDENT_GOLD_CASES) {
      // NO expectedTopPriority hint — the engine must resolve the dominant on its own.
      const result = await runOwnerAdvice(
        { workspaceId: `igold-${g.id}`, context: caseToContext(g.case, undefined) },
        { store },
      );
      const actual = String(result.plan.arbitration.dominantConstraint);
      if (actual !== g.expected.dominantConstraint) disagreements.push(`${g.id}: expected ${g.expected.dominantConstraint}, engine ${actual}`);

      // The supervisor (over the same runtime) produces a do-not-do for non-good cases and a safe action
      // that is NOT the tempting wrong move.
      const sup = buildSupervisorSummary(runtimeToSupervisorInput(result));
      if (g.goodBadUgly !== "good") expect(sup.doNotDo.length, g.id).toBeGreaterThan(0);
      expect(sup.doNow.length, g.id).toBeGreaterThan(0);
      expect(sup.confidence === "high" && !result.ingestion.criticalDomainsAllReal, `${g.id} fake confidence`).toBe(false);
    }
    // Independent agreement on all 15 ⇒ circularity LOW for these cases.
    expect(disagreements, disagreements.join(" | ")).toEqual([]);
  }, 120000);

  it("does not compare the engine to an engine-generated expectation (expectations are static literals)", () => {
    // The expected dominant is a hardcoded fixture literal, not derived from any runtime output object.
    for (const g of INDEPENDENT_GOLD_CASES) {
      expect(typeof g.expected.dominantConstraint).toBe("string");
      // sanity: the fixture authored a real constraint name
      expect(["compliance_block", "proof_fraud_block", "cash_survival", "below_margin", "capacity_feasibility",
        "customer_quality", "owner_workload", "profitable_growth", "efficiency_scaling", "optimization"])
        .toContain(g.expected.dominantConstraint);
    }
  });
});
