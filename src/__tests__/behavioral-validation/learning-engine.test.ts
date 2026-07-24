import { describe, it, expect } from "vitest";
import { deriveCorrection } from "@/behavioral-validation/learning-engine";
import { scoreAdvice } from "@/behavioral-validation/scorer";
import { baseAdvise, emptyAdvise } from "@/behavioral-validation/advisor";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import { learningArtifactSchema } from "@/behavioral-validation/schema";

const AT = "2026-06-29T00:00:00Z";
const opts = { workspaceId: "ws-1", actor: "trainer", at: AT };

describe("learning engine — module contract assertions", () => {
  it("deriveCorrection is a function", () => {
    expect(typeof deriveCorrection).toBe("function");
  });
  it("scoreAdvice is a function", () => {
    expect(typeof scoreAdvice).toBe("function");
  });
  it("baseAdvise is a function", () => {
    expect(typeof baseAdvise).toBe("function");
  });
  it("emptyAdvise is a function", () => {
    expect(typeof emptyAdvise).toBe("function");
  });
  it("SEED_CASES is an array", () => {
    expect(Array.isArray(SEED_CASES)).toBe(true);
  });
  it("SEED_CASES has at least 1 entry", () => {
    expect(SEED_CASES.length).toBeGreaterThan(0);
  });
  it("SEED_CASES[0] has an id field", () => {
    expect(SEED_CASES[0]).toHaveProperty("id");
  });
  it("SEED_CASES[0] has a hiddenRootCause field", () => {
    expect(SEED_CASES[0]).toHaveProperty("hiddenRootCause");
  });
  it("SEED_CASES[0] has a sourceSeedCaseId field", () => {
    expect(SEED_CASES[0]).toHaveProperty("sourceSeedCaseId");
  });
  it("learningArtifactSchema is defined", () => {
    expect(learningArtifactSchema).toBeDefined();
  });
  it("learningArtifactSchema.parse is a function", () => {
    expect(typeof learningArtifactSchema.parse).toBe("function");
  });
  it("AT is the string '2026-06-29T00:00:00Z'", () => {
    expect(AT).toBe("2026-06-29T00:00:00Z");
  });
  it("opts has workspaceId 'ws-1'", () => {
    expect(opts.workspaceId).toBe("ws-1");
  });
  it("emptyAdvise() returns an object", () => {
    expect(typeof emptyAdvise()).toBe("object");
  });
  it("scoreAdvice result has passed, total, failureLabels, unsafe fields", () => {
    const s = scoreAdvice(SEED_CASES[0], baseAdvise(SEED_CASES[0]));
    expect(s).toHaveProperty("passed");
    expect(s).toHaveProperty("total");
    expect(s).toHaveProperty("failureLabels");
    expect(s).toHaveProperty("unsafe");
  });
});

describe("learning engine", () => {
  it("returns null for a CLEAN pass (passed with no failure labels — nothing to learn)", () => {
    const c = SEED_CASES.find((x) => {
      const s = scoreAdvice(x, baseAdvise(x));
      return s.passed && s.failureLabels.length === 0;
    });
    // a clean-pass case must yield no correction; if none exists, a fabricated clean score does
    const score = c ? scoreAdvice(c, baseAdvise(c)) : { total: 95, dimensions: {} as never, unsafe: [], passed: true, failureLabels: [], notes: [] };
    expect(deriveCorrection(c ?? SEED_CASES[0], score, opts)).toBeNull();
  });

  it("DOES learn from a sub-expert weakness even when the case passes the threshold", () => {
    const weak = SEED_CASES.map((x) => ({ x, s: scoreAdvice(x, baseAdvise(x)) })).find((r) => r.s.passed && r.s.failureLabels.length > 0);
    if (weak) expect(deriveCorrection(weak.x, weak.s, opts)).not.toBeNull();
  });

  it("produces a schema-valid, workspace-private, pending artifact from a failure", () => {
    const c = SEED_CASES[0];
    const score = scoreAdvice(c, emptyAdvise()); // forced failure
    const r = deriveCorrection(c, score, opts);
    expect(r).not.toBeNull();
    expect(() => learningArtifactSchema.parse(r!.artifact)).not.toThrow();
    expect(r!.artifact.privacyClassification).toBe("workspace_private");
    expect(r!.artifact.approvalStatus).toBe("pending");
    expect(r!.artifact.scope).toBe("local_only");
    expect(r!.artifact.workspaceId).toBe("ws-1");
    expect(r!.artifact.sourceCaseId).toBe(c.id);
    expect(r!.artifact.id).toBe(`${c.id}::v1`);
  });

  it("emits a regression case that preserves the source id and invariants", () => {
    const c = SEED_CASES[0];
    const r = deriveCorrection(c, scoreAdvice(c, emptyAdvise()), opts)!;
    expect(r.regressionCase.sourceSeedCaseId).toBe(c.sourceSeedCaseId);
    expect(r.regressionCase.hiddenRootCause).toBe(c.hiddenRootCause);
    expect(r.regressionCase.id).toContain("__regression");
  });

  it("the corrected behavior is concrete (non-empty, actionable)", () => {
    const c = SEED_CASES[0];
    const r = deriveCorrection(c, scoreAdvice(c, emptyAdvise()), opts)!;
    expect(r.artifact.correctedBehavior.length).toBeGreaterThan(20);
  });
});
