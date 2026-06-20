/**
 * Leakage guard tests for the SMB normalization layer.
 * Permanent regression guards — hand-mapping or outcome-leakage re-injection will
 * be caught here before passing the integration harness.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { loadRealWorldSmbFixtures } from "./loadFixtures";
import { runCaseAgainstOpsiq } from "./runCaseAgainstOpsiq";

// Strict leakage-detection scoring — 80% threshold for >3-token phrases (vs 70% in scoring contract)
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function guardContainsPhrase(haystack: string, phrase: string): boolean {
  const h = normalizeText(haystack);
  const p = normalizeText(phrase);
  const tokens = p.split(" ").filter((t) => t.length > 2);
  if (tokens.length === 0) return h.includes(p);
  if (tokens.length <= 3) return h.includes(p);
  const matchCount = tokens.filter((t) => h.includes(t)).length;
  return matchCount / tokens.length >= 0.8;
}

const RUNNER_SOURCE = readFileSync(
  join(__dirname, "runCaseAgainstOpsiq.ts"),
  "utf-8"
);

const SIDECAR_DIR = join(__dirname, "evidence-hints");

// ── Guard 1: Runner source does not reference fixture scoring/diagnosis fields ──
describe("SMB leakage guard: runner source isolation", () => {
  it("runner source does not import or reference expected_opsiq_diagnosis", () => {
    expect(RUNNER_SOURCE).not.toContain("expected_opsiq_diagnosis");
  });
  it("runner source does not reference scoring_criteria", () => {
    expect(RUNNER_SOURCE).not.toContain("scoring_criteria");
  });
  it("runner source does not reference must_identify", () => {
    expect(RUNNER_SOURCE).not.toContain("must_identify");
  });
  it("runner source does not reference bad_recommendations_to_flag", () => {
    expect(RUNNER_SOURCE).not.toContain("bad_recommendations_to_flag");
  });
});

// ── Guard 2: Runner source contains no hardcoded must_identify phrases ──
// Detects future vocabulary re-injection: if must_identify terms appear as string
// literals in the runner source, that is evidence the answer key was used to construct
// the vocabulary. Engine descriptions naturally use industry terms — that is legitimate.
// This guard catches injected hardcoded strings, not engine output.
describe("SMB leakage guard: runner source vs must_identify", () => {
  it("runner source contains no hardcoded must_identify phrase string literals", () => {
    const fixtures = loadRealWorldSmbFixtures();
    const violations: string[] = [];

    for (const fixture of fixtures) {
      const mustIdentify = fixture.expected_opsiq_diagnosis.scoring_criteria.must_identify;
      for (const term of mustIdentify) {
        // Check for exact term as string literal in source
        if (RUNNER_SOURCE.includes(`"${term}"`) || RUNNER_SOURCE.includes(`'${term}'`)) {
          violations.push(`${fixture.case_id}: must_identify term "${term}" appears as string literal in runner source`);
        }
      }
    }

    expect(
      violations,
      `Runner source contains hardcoded must_identify phrases (vocabulary injection detected):\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});

// ── Guard 3: Runner output contains no bad recommendation phrase ──
describe("SMB leakage guard: runner output vs bad recommendations", () => {
  it("runner output for supported cases contains no bad_recommendations_to_flag phrase", async () => {
    const fixtures = loadRealWorldSmbFixtures();
    const violations: string[] = [];

    for (const fixture of fixtures) {
      const result = await runCaseAgainstOpsiq(fixture);
      if (result.unsupportedArchetype) continue;

      const badRecs = fixture.expected_opsiq_diagnosis.bad_recommendations_to_flag;
      for (const bad of badRecs) {
        if (guardContainsPhrase(result.output, bad)) {
          violations.push(`${fixture.case_id}: bad_rec "${bad}" found in runner output`);
        }
      }
    }

    expect(
      violations,
      `Runner output contains bad recommendations:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});

// ── Guard 4: Sidecar findings do not leak must_identify terms ──
describe("SMB leakage guard: sidecar findings vs must_identify", () => {
  it("no sidecar evidence finding matches a must_identify term at strict 80% threshold", () => {
    const fixtures = loadRealWorldSmbFixtures();
    const violations: string[] = [];

    for (const fixture of fixtures) {
      const caseId = fixture.case_id;
      const sidecarPath = join(SIDECAR_DIR, `${caseId}.evidence-hints.json`);
      const sidecar = JSON.parse(readFileSync(sidecarPath, "utf-8"));
      const mustIdentify = fixture.expected_opsiq_diagnosis.scoring_criteria.must_identify;

      for (let idx = 0; idx < sidecar.evidence_items.length; idx++) {
        const item = sidecar.evidence_items[idx];
        for (const term of mustIdentify) {
          if (guardContainsPhrase(item.finding, term)) {
            violations.push(
              `${caseId}[${idx}]: finding leaks must_identify term "${term}"`
            );
          }
        }
      }
    }

    expect(
      violations,
      `Sidecar findings contain must_identify leakage:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});

// ── Guard 5: Engine-only output covers <60% of must_identify terms ──
describe("SMB leakage guard: must_identify coverage from engine output alone", () => {
  it("engine output covers less than 60% of must_identify terms for each supported case", async () => {
    const fixtures = loadRealWorldSmbFixtures();
    const violations: string[] = [];

    for (const fixture of fixtures) {
      const result = await runCaseAgainstOpsiq(fixture);
      if (result.unsupportedArchetype) continue;

      const mustIdentify = fixture.expected_opsiq_diagnosis.scoring_criteria.must_identify;
      const matchCount = mustIdentify.filter((term) => {
        const h = normalizeText(result.output);
        const p = normalizeText(term);
        const tokens = p.split(" ").filter((t) => t.length > 2);
        if (tokens.length === 0) return h.includes(p);
        if (tokens.length <= 3) return h.includes(p);
        const mc = tokens.filter((t) => h.includes(t)).length;
        return mc / tokens.length >= 0.7;
      }).length;

      const coverage = matchCount / mustIdentify.length;
      if (coverage >= 0.6) {
        violations.push(
          `${fixture.case_id}: engine output covers ${Math.round(coverage * 100)}% of must_identify terms (≥60% signals hand-mapping)`
        );
      }
    }

    expect(
      violations,
      `Engine output covers ≥60% of must_identify terms — possible hand-mapping:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});

// ── Guard 6: Unsupported cases return scope gap, not diagnosis ──
describe("SMB leakage guard: unsupported cases excluded", () => {
  it("unsupported cases return unsupportedArchetype=true and scope gap output", async () => {
    const fixtures = loadRealWorldSmbFixtures();
    const unsupportedIds = ["SMB-005", "SMB-009", "SMB-011"];

    for (const caseId of unsupportedIds) {
      const fixture = fixtures.find((f) => f.case_id === caseId)!;
      expect(fixture).toBeDefined();
      const result = await runCaseAgainstOpsiq(fixture);
      expect(result.unsupportedArchetype, `${caseId} should be unsupported`).toBe(true);
      expect(result.output).toContain("SCOPE GAP");
      expect(result.output).not.toContain("PRIMARY ROOT CAUSE:");
    }
  });

  it("harness excludes unsupported cases from denominator (verified via direct count)", async () => {
    const fixtures = loadRealWorldSmbFixtures();
    let supportedCount = 0;
    let unsupportedCount = 0;

    for (const fixture of fixtures) {
      const result = await runCaseAgainstOpsiq(fixture);
      if (result.unsupportedArchetype) {
        unsupportedCount++;
      } else {
        supportedCount++;
      }
    }

    expect(unsupportedCount).toBe(3);
    expect(supportedCount).toBe(9);
  });
});
