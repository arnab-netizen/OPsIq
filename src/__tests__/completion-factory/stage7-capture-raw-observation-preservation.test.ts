/**
 * Stage 7 evidence capture — raw observation preservation (PR-D18-SUPERSESSION).
 *
 * Runs 34047579394 (S7-I5) and 34047585763 (S7-I10-LANE_C) each reached a
 * controlled observation verdict and a validly signed artifact was written to
 * disk, but the composite action's own post-write self-check
 * (`validate-evidence-artifacts.mjs`, no flags) then REJECTED both — correctly,
 * because their `supersedes` target was not yet auditable from that directory.
 * "Create evidence branch and open PR" was skipped as a result, so the artifact
 * was never committed anywhere, and the ephemeral runner workspace holding the
 * only copy of the verbatim observation and the signed-but-unfiled artifact was
 * destroyed at the end of the job. Neither is recoverable from the Actions logs
 * (which never echo the observation) or from any git ref.
 *
 * These tests hold the composite action to the fix: the raw observation file
 * and the written (possibly rejected) artifact are always uploaded as a
 * diagnostic build artifact — regardless of whether the self-check later
 * passes or fails — so a human can retrieve exactly what was observed. This
 * upload is read by nothing else in the pipeline: it never resolves a proof
 * reference, is never fed to the validator, and is not filed under
 * docs/opsiq/evidence/stage-7/artifacts. It does not weaken acceptance in any
 * way; it only prevents a real observation from becoming unrecoverable.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";

const ACTION_PATH = join(
  process.cwd(),
  ".github/actions/stage7-evidence-capture/action.yml",
);
const ACTION_SRC = readFileSync(ACTION_PATH, "utf-8");

interface CompositeStep {
  id?: string;
  name?: string;
  if?: string;
  uses?: string;
  with?: Record<string, string>;
  run?: string;
}

const STEPS = (
  yaml.load(ACTION_SRC) as { runs: { steps: CompositeStep[] } }
).runs.steps;

function stepIndex(nameStartsWith: string): number {
  const idx = STEPS.findIndex((s) => s.name?.startsWith(nameStartsWith));
  if (idx === -1) throw new Error(`step '${nameStartsWith}' not found in ${ACTION_PATH}`);
  return idx;
}

describe("stage7-evidence-capture — raw observation preservation", () => {
  it("uploads the observation file and the written artifact unconditionally (if: always())", () => {
    const preserve = STEPS[stepIndex("Preserve raw observation")];
    expect(preserve.if).toBe("always()");
    expect(preserve.uses).toMatch(/^actions\/upload-artifact@v\d/);
  });

  it("uploads the exact observation_file input and the capture step's own artifact_path output", () => {
    const preserve = STEPS[stepIndex("Preserve raw observation")];
    const path = preserve.with?.path ?? "";
    expect(path).toContain("${{ inputs.observation_file }}");
    expect(path).toContain("${{ steps.capture.outputs.artifact_path }}");
  });

  it("never fails the job when the observation file or artifact is unexpectedly absent", () => {
    const preserve = STEPS[stepIndex("Preserve raw observation")];
    expect(preserve.with?.["if-no-files-found"]).not.toBe("error");
    expect(["warn", "ignore"]).toContain(preserve.with?.["if-no-files-found"]);
  });

  it("retains the upload well past GitHub's 24h token/log window", () => {
    const preserve = STEPS[stepIndex("Preserve raw observation")];
    const days = Number(preserve.with?.["retention-days"]);
    expect(days).toBeGreaterThanOrEqual(30);
  });

  it("runs after the artifact has actually been written, and before or alongside the self-check that can reject it", () => {
    const captureIdx = stepIndex("Capture evidence artifact");
    const preserveIdx = stepIndex("Preserve raw observation");
    const validateIdx = stepIndex("Validate what was just written");
    expect(preserveIdx).toBeGreaterThan(captureIdx);
    // Must not depend on the self-check having already run: if: always() only
    // protects the job if this step does not sit conditionally behind success.
    expect(preserveIdx).toBeLessThanOrEqual(validateIdx);
  });

  it("names the upload distinctly per invariant and run/attempt, so concurrent captures cannot collide or overwrite each other", () => {
    const preserve = STEPS[stepIndex("Preserve raw observation")];
    const name = preserve.with?.name ?? "";
    expect(name).toContain("${{ inputs.invariant }}");
    expect(name).toContain("${{ github.run_id }}");
    expect(name).toContain("${{ github.run_attempt }}");
  });

  it("is documented as diagnostic only — never evidence, never validated, never filed", () => {
    // The comment immediately preceding the step in the source is the contract
    // a future editor reads before touching this step; assert it says the thing
    // that actually matters, not just that a comment exists.
    const marker = "Preserve raw observation and unfiled artifact (diagnostic only — never evidence)";
    expect(ACTION_SRC).toContain(marker);
    const commentBlock = ACTION_SRC.slice(
      ACTION_SRC.lastIndexOf("# Diagnostic safety net"),
      ACTION_SRC.indexOf(marker),
    );
    expect(commentBlock).toMatch(/never read by/i);
    expect(commentBlock).toMatch(/never resolves a proof reference/i);
    expect(commentBlock).toContain("docs/opsiq/evidence/stage-7/artifacts");
  });

  it("the step name and upload name never claim this is Stage 7 evidence", () => {
    const preserve = STEPS[stepIndex("Preserve raw observation")];
    const name = preserve.with?.name ?? "";
    expect(preserve.name).toMatch(/diagnostic/i);
    expect(name).not.toMatch(/evd_/);
  });
});
