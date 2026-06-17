import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  buildRound2Manifest,
  makeUnfinishedTemplate,
  DIAGNOSES,
  Round2CaseSchema,
} from "@/services/benchmark/round2-case-schema";
import { validateRound2Case } from "@/services/benchmark/round2-intake-validator";

const manifest = buildRound2Manifest();

describe("round2 case-pack schema/template tooling", () => {
  it("manifest has exactly 150 cases", () => {
    expect(manifest.length).toBe(150);
  });

  it("every D1-D15 diagnosis has at least 6 single cases", () => {
    for (const d of DIAGNOSES) {
      const n = manifest.filter((m) => m.case_type === "single" && m.diagnosis_bucket === d.dx).length;
      expect(n).toBeGreaterThanOrEqual(6);
    }
  });

  it("case-type counts match the spec (90 single / 20 multi / 20 abstention / 20 adversarial)", () => {
    const c = (t: string) => manifest.filter((m) => m.case_type === t).length;
    expect(c("single")).toBe(90);
    expect(c("multi")).toBe(20);
    expect(c("abstention")).toBe(20);
    expect(c("adversarial")).toBe(20);
  });

  it("every generated UNFINISHED template FAILS the intake validator", () => {
    for (const entry of manifest) {
      const r = validateRound2Case(makeUnfinishedTemplate(entry));
      expect(r.valid).toBe(false);
      // TODO content must be caught as placeholder, and missing key must fire
      const codes = r.failures.map((f) => f.code);
      expect(codes).toContain("PLACEHOLDER_FINDING");
      expect(codes).toContain("MISSING_GROUND_TRUTH_DIAGNOSIS");
    }
  });

  it("no template can pass with TODO/placeholder content even if a key is bolted on", () => {
    const entry = manifest[0];
    const tmpl = makeUnfinishedTemplate(entry);
    tmpl.key = {
      true_primary_diagnosis: "margin_erosion",
      expected_first_action: "x",
      acceptable_first_actions: ["x"],
      unsafe_first_actions: ["y"],
      expected_safety_label: "SAFE_TO_PROCEED",
      adversarial_type: "none",
      expected_gate_outcome: "PROCEED",
      abstention_eligible: false,
    };
    const r = validateRound2Case(tmpl);
    expect(r.valid).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("PLACEHOLDER_FINDING");
  });

  it("the sample valid fixture passes the intake validator and the structural schema", () => {
    const p = path.resolve(__dirname, "../../../simulation_runs/round_002_case_pack_template/_SAMPLE_VALID_CASE.json");
    const sample = JSON.parse(fs.readFileSync(p, "utf-8"));
    const c = { input: sample.input, key: sample.key };
    expect(Round2CaseSchema.safeParse(c).success).toBe(true);
    const r = validateRound2Case(c);
    expect(r.failures).toHaveLength(0);
    expect(r.valid).toBe(true);
  });
});
