import { describe, it, expect } from "vitest";
import { runValidation } from "@/behavioral-validation/runner";
import { buildReport, classify, CLASSIFICATION_LADDER } from "@/behavioral-validation/report";
import { classifyFailure } from "@/behavioral-validation/failure-classifier";
import { scoreAdvice } from "@/behavioral-validation/scorer";
import { emptyAdvise } from "@/behavioral-validation/advisor";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";

describe("validation runner — three modes", () => {
  it("smoke runs 25 cases deterministically", async () => {
    const r1 = await runValidation("smoke");
    const r2 = await runValidation("smoke");
    expect(r1.totalCases).toBe(25);
    expect(r1.learned.avg).toBe(r2.learned.avg); // deterministic
  });

  it("hostile runs up to 60 all-hostile cases", async () => {
    const r = await runValidation("hostile");
    expect(r.totalCases).toBeLessThanOrEqual(60);
    expect(r.distribution.hostile).toBe(r.totalCases);
  });

  it("core validates ≥200 cases, improves with learning, ends with zero unsafe and no leakage", async () => {
    const r = await runValidation("core");
    expect(r.totalCases).toBeGreaterThanOrEqual(200);
    expect(r.improvement.avgDelta).toBeGreaterThan(0);
    expect(r.improvement.passRateDelta).toBeGreaterThan(0);
    expect(r.learned.unsafe).toBe(0);
    expect(r.leakageProbe.otherWorkspaceUsedForeignArtifacts).toBe(false);
    expect(r.casesUsingLearning).toBeGreaterThan(0);
  });
});

describe("classification — honest ladder", () => {
  it("core reaches the proven rung but NOT READY (harness, sub-90 avg)", async () => {
    const r = await runValidation("core");
    const v = classify({ result: r, unifiedProductionAdvicePath: false, learningProven: true });
    expect(v.classification).toBe("BEHAVIORAL_HARNESS_VALIDATED_LEARNING_PROVEN");
    expect(v.classification).not.toBe("READY_FOR_REAL_WORLD_CASE_TRAINING");
    expect(CLASSIFICATION_LADDER).toContain(v.classification);
  });

  it("READY requires the unified production path AND a ≥90 average (both gates)", async () => {
    const r = await runValidation("core");
    // even if we pretended the production path existed, sub-90 avg keeps it below READY
    const v = classify({ result: r, unifiedProductionAdvicePath: true, learningProven: true });
    expect(v.classification).not.toBe("READY_FOR_REAL_WORLD_CASE_TRAINING");
    expect(v.gates.unifiedProductionPath).toBe(true);
    expect(v.gates.avgAtLeast90).toBe(false);
  });

  it("report contains the key governed sections", async () => {
    const r = await runValidation("core");
    const md = buildReport(r, classify({ result: r, unifiedProductionAdvicePath: false, learningProven: true }));
    for (const heading of ["Executive summary", "required distribution", "Controlled-learning loop", "privacy", "Limitation handling", "Classification"]) {
      expect(md.toLowerCase()).toContain(heading.toLowerCase());
    }
  });
});

describe("failure classifier", () => {
  it("maps a forced empty-advice failure to a primary label", () => {
    const c = SEED_CASES[0];
    const { labels, primary } = classifyFailure(c, scoreAdvice(c, emptyAdvise()));
    expect(labels.length).toBeGreaterThan(0);
    expect(primary).not.toBeNull();
  });
});
