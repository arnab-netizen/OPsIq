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
import { normalizeFixtureToEvidence } from "./normalizeFixtureToEvidence";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  ARCHETYPE_PREAMBLE,
  FAQ_TABLE,
  PER_ARCHETYPE_EXCLUSIONS,
} from "./smbOutputComposer";

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

const COMPOSER_SOURCE = readFileSync(
  join(__dirname, "smbOutputComposer.ts"),
  "utf-8"
);

const SIDECAR_DIR = join(__dirname, "evidence-hints");

// ── Guard 7: Composer source does not reference fixture answer-key fields ──
describe("SMB leakage guard: composer source isolation", () => {
  it("composer source does not reference expected_opsiq_diagnosis", () => {
    expect(COMPOSER_SOURCE).not.toContain("expected_opsiq_diagnosis");
  });
  it("composer source does not reference scoring_criteria", () => {
    expect(COMPOSER_SOURCE).not.toContain("scoring_criteria");
  });
  it("composer source does not reference must_identify", () => {
    expect(COMPOSER_SOURCE).not.toContain("must_identify");
  });
  it("composer source does not reference bad_recommendations_to_flag", () => {
    expect(COMPOSER_SOURCE).not.toContain("bad_recommendations_to_flag");
  });
  it("composer source does not reference expected_first_action", () => {
    expect(COMPOSER_SOURCE).not.toContain("expected_first_action");
  });
});

// ── Guard 8: Composer source contains no hardcoded must_identify phrases ──
describe("SMB leakage guard: composer source vs must_identify", () => {
  it("composer source contains no hardcoded must_identify phrase string literals", () => {
    const fixtures = loadRealWorldSmbFixtures();
    const violations: string[] = [];
    for (const fixture of fixtures) {
      for (const term of fixture.expected_opsiq_diagnosis.scoring_criteria
        .must_identify) {
        if (
          COMPOSER_SOURCE.includes(`"${term}"`) ||
          COMPOSER_SOURCE.includes(`'${term}'`)
        ) {
          violations.push(
            `${fixture.case_id}: must_identify term "${term}" appears as string literal in composer source`
          );
        }
      }
    }
    expect(
      violations,
      `Composer source contains hardcoded must_identify phrases:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});

// ── Guard 9: Composer source contains no bad_recommendations_to_flag literals ──
describe("SMB leakage guard: composer source vs bad recommendations", () => {
  it("composer source contains no hardcoded bad_recommendations_to_flag phrase literals", () => {
    const fixtures = loadRealWorldSmbFixtures();
    const violations: string[] = [];
    for (const fixture of fixtures) {
      for (const bad of fixture.expected_opsiq_diagnosis
        .bad_recommendations_to_flag) {
        if (
          COMPOSER_SOURCE.includes(`"${bad}"`) ||
          COMPOSER_SOURCE.includes(`'${bad}'`)
        ) {
          violations.push(
            `${fixture.case_id}: bad_rec "${bad}" appears as string literal in composer source`
          );
        }
      }
    }
    expect(
      violations,
      `Composer source contains hardcoded bad_recommendations_to_flag phrases:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});

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
// Anti-hand-mapping guard: the ENGINE'S OWN text fields (description + mechanism +
// missingEvidenceFor) must not, by themselves, cover ≥60% of must_identify terms —
// that would indicate the engine archetype strings were hand-tuned to the answer key.
// The runner now serializes COMPOSER output (which legitimately raises must_identify
// coverage — that is the composer's purpose), so this guard reconstructs the
// engine-only serialization directly to preserve its original intent rather than
// reading the composer-enriched runner output.
describe("SMB leakage guard: must_identify coverage from engine output alone", () => {
  it("engine output covers less than 60% of must_identify terms for each supported case", () => {
    const fixtures = loadRealWorldSmbFixtures();
    const violations: string[] = [];

    for (const fixture of fixtures) {
      const norm = normalizeFixtureToEvidence(fixture);
      if (norm.unsupportedArchetype) continue;
      const diagnosis = diagnoseRootCause(norm.evidenceItems, fixture.scenario.business);
      const primary = diagnosis.primaryRootCause;
      // Engine-only serialization (the pre-composer runner format).
      const engineOutput = [
        `PRIMARY ROOT CAUSE: ${primary.type}`,
        `Description: ${primary.description}`,
        `Confidence: ${diagnosis.confidence}`,
        `Mechanism: ${primary.mechanismDescription}`,
        ...(primary.missingEvidenceFor ?? []).map((m) => `  - ${m}`),
        ...diagnosis.warningFlags.map((w) => `  - ${w}`),
      ].join("\n");

      const mustIdentify = fixture.expected_opsiq_diagnosis.scoring_criteria.must_identify;
      const matchCount = mustIdentify.filter((term) => {
        const h = normalizeText(engineOutput);
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

// ── Guard 10: Composer preamble covers <60% of must_identify terms ──
// The preamble is now a short diagnostic label. It must not contain enough
// must_identify vocabulary to artificially boost ROOT_CAUSE_ALIGNMENT scoring.
describe("SMB leakage guard: composer preamble must_identify coverage", () => {
  it("composer preamble covers less than 60% of must_identify terms for each supported case", () => {
    const fixtures = loadRealWorldSmbFixtures();
    const violations: string[] = [];

    for (const fixture of fixtures) {
      const norm = normalizeFixtureToEvidence(fixture);
      if (norm.unsupportedArchetype) continue;

      const diagnosis = diagnoseRootCause(norm.evidenceItems, fixture.scenario.business);
      const type = diagnosis.primaryRootCause.type;
      const preamble = ARCHETYPE_PREAMBLE[type] ?? "";
      const mustIdentify = fixture.expected_opsiq_diagnosis.scoring_criteria.must_identify;

      const matchCount = mustIdentify.filter((term) => {
        const h = normalizeText(preamble);
        const p = normalizeText(term);
        const tokens = p.split(" ").filter((t) => t.length > 2);
        if (tokens.length === 0) return h.includes(p);
        if (tokens.length <= 3) return h.includes(p);
        const mc = tokens.filter((t) => h.includes(t)).length;
        return mc / tokens.length >= 0.7;
      }).length;

      const coverage = mustIdentify.length > 0 ? matchCount / mustIdentify.length : 0;
      if (coverage >= 0.6) {
        violations.push(
          `${fixture.case_id}: preamble covers ${Math.round(coverage * 100)}% of must_identify terms (>=60% signals contamination)`
        );
      }
    }

    expect(
      violations,
      `Composer preamble covers >=60% of must_identify terms — contamination detected:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});

// ── Guard 11: FAQ_TABLE first-action text has <50% key-token overlap with expected_first_action ──
// Key tokens = first 6 words >4 chars from expected_first_action.
// If the match ratio is >=0.5, the FAQ entry was likely derived from the fixture.
describe("SMB leakage guard: FAQ_TABLE key-token overlap with expected_first_action", () => {
  it("FAQ_TABLE first-action text has less than 50% key-token overlap with expected_first_action for each supported case", () => {
    const fixtures = loadRealWorldSmbFixtures();
    const violations: string[] = [];

    for (const fixture of fixtures) {
      const norm = normalizeFixtureToEvidence(fixture);
      if (norm.unsupportedArchetype) continue;

      const diagnosis = diagnoseRootCause(norm.evidenceItems, fixture.scenario.business);
      const type = diagnosis.primaryRootCause.type;
      const faqEntry = FAQ_TABLE[type];
      if (!faqEntry) continue;

      const faqText = normalizeText(`${faqEntry.verb} ${faqEntry.category}`);
      const expectedFirstAction = fixture.expected_opsiq_diagnosis.expected_first_action;

      // Key tokens: first 6 words longer than 4 chars from expected_first_action
      const keyTokens = normalizeText(expectedFirstAction)
        .split(" ")
        .filter((t) => t.length > 4)
        .slice(0, 6);

      if (keyTokens.length === 0) continue;

      const matchCount = keyTokens.filter((t) => faqText.includes(t)).length;
      const ratio = matchCount / keyTokens.length;

      if (ratio >= 0.5) {
        violations.push(
          `${fixture.case_id}: FAQ_TABLE[${type}] has ${Math.round(ratio * 100)}% key-token overlap with expected_first_action (>=50% signals contamination). Key tokens: [${keyTokens.join(", ")}]. Matched: ${matchCount}/${keyTokens.length}`
        );
      }
    }

    expect(
      violations,
      `FAQ_TABLE entries share >=50% key-token overlap with fixture expected_first_action:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});

// ── Guard 12: No PER_ARCHETYPE_EXCLUSIONS entry is an exact substring of any bad_recommendations_to_flag phrase ──
describe("SMB leakage guard: PER_ARCHETYPE_EXCLUSIONS vs bad_recommendations_to_flag", () => {
  it("no PER_ARCHETYPE_EXCLUSIONS entry is an exact substring of any fixture bad_recommendations_to_flag phrase", () => {
    const fixtures = loadRealWorldSmbFixtures();
    const violations: string[] = [];

    // Collect all bad_recommendations_to_flag phrases across all fixtures
    const allBadRecs: Array<{ caseId: string; phrase: string }> = [];
    for (const fixture of fixtures) {
      for (const phrase of fixture.expected_opsiq_diagnosis.bad_recommendations_to_flag) {
        allBadRecs.push({ caseId: fixture.case_id, phrase });
      }
    }

    // Check every exclusion entry against every bad_rec phrase
    for (const [archetype, exclusions] of Object.entries(PER_ARCHETYPE_EXCLUSIONS)) {
      for (const exclusion of exclusions) {
        const normExclusion = normalizeText(exclusion);
        for (const { caseId, phrase } of allBadRecs) {
          const normPhrase = normalizeText(phrase);
          if (normPhrase.includes(normExclusion)) {
            violations.push(
              `PER_ARCHETYPE_EXCLUSIONS[${archetype}]: "${exclusion}" is an exact substring of ${caseId} bad_rec "${phrase}"`
            );
          }
        }
      }
    }

    expect(
      violations,
      `PER_ARCHETYPE_EXCLUSIONS entries derived from fixture bad_recommendations_to_flag:\n${violations.join("\n")}`
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

// ── Guard 10: Composer preamble alone covers <60% of must_identify terms ──
describe("SMB leakage guard: composer preamble coverage vs must_identify", () => {
  it("composer preamble alone covers less than 60% of must_identify terms for each supported case", () => {
    const fixtures = loadRealWorldSmbFixtures();
    const SUPPORTED = ["SMB-001","SMB-002","SMB-003","SMB-004","SMB-006","SMB-007","SMB-008","SMB-010","SMB-012"];
    const violations: string[] = [];

    for (const fixture of fixtures) {
      if (!SUPPORTED.includes(fixture.case_id)) continue;

      const norm = normalizeFixtureToEvidence(fixture);
      if (norm.unsupportedArchetype) continue;
      const diagnosis = diagnoseRootCause(norm.evidenceItems, fixture.scenario.business);
      const type = diagnosis.primaryRootCause.type;
      const preamble = ARCHETYPE_PREAMBLE[type] ?? "";

      const mustIdentify = fixture.expected_opsiq_diagnosis.scoring_criteria.must_identify;
      const matchCount = mustIdentify.filter((term) => {
        const h = normalizeText(preamble);
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
          `${fixture.case_id}: preamble covers ${Math.round(coverage * 100)}% of must_identify (≥60% signals leakage)`
        );
      }
    }

    expect(
      violations,
      `Preamble covers ≥60% of must_identify — leakage detected:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});

// ── Guard 11: FAQ_TABLE overlap with expected_first_action ──
describe("SMB leakage guard: FAQ_TABLE overlap with expected_first_action", () => {
  it("FAQ_TABLE first-action text has less than 50% key-token overlap with expected_first_action for each supported case", () => {
    const fixtures = loadRealWorldSmbFixtures();
    const SUPPORTED = ["SMB-001","SMB-002","SMB-003","SMB-004","SMB-006","SMB-007","SMB-008","SMB-010","SMB-012"];
    const violations: string[] = [];

    for (const fixture of fixtures) {
      if (!SUPPORTED.includes(fixture.case_id)) continue;

      const norm = normalizeFixtureToEvidence(fixture);
      if (norm.unsupportedArchetype) continue;
      const diagnosis = diagnoseRootCause(norm.evidenceItems, fixture.scenario.business);
      const type = diagnosis.primaryRootCause.type;
      const faqEntry = FAQ_TABLE[type];
      if (!faqEntry) continue;

      const faqText = `${faqEntry.verb} ${faqEntry.category}`;
      const expected = fixture.expected_opsiq_diagnosis.expected_first_action;

      const normalize = (t: string) =>
        t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      const keyTokens = normalize(expected).split(" ").filter((w) => w.length > 4).slice(0, 6);
      const faqNorm = normalize(faqText);
      const matched = keyTokens.filter((t) => faqNorm.includes(t));
      const ratio = keyTokens.length > 0 ? matched.length / keyTokens.length : 0;

      if (ratio >= 0.5) {
        violations.push(
          `${fixture.case_id}: FAQ entry has ${Math.round(ratio * 100)}% key-token overlap with expected_first_action (≥50% signals derivation)`
        );
      }
    }

    expect(
      violations,
      `FAQ_TABLE entries derived from expected_first_action:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});

// ── Guard 12: PER_ARCHETYPE_EXCLUSIONS vs bad_recommendations_to_flag ──
describe("SMB leakage guard: PER_ARCHETYPE_EXCLUSIONS vs bad_recommendations_to_flag", () => {
  it("no exclusion entry is an exact substring of any fixture bad_recommendations_to_flag phrase", () => {
    const fixtures = loadRealWorldSmbFixtures();
    const violations: string[] = [];

    const normalize = (t: string) =>
      t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

    for (const fixture of fixtures) {
      const badRecs = fixture.expected_opsiq_diagnosis.bad_recommendations_to_flag;
      for (const [, exclusions] of Object.entries(PER_ARCHETYPE_EXCLUSIONS)) {
        for (const ex of exclusions) {
          const normEx = normalize(ex);
          for (const bad of badRecs) {
            const normBad = normalize(bad);
            if (normBad.includes(normEx)) {
              violations.push(
                `${fixture.case_id}: exclusion "${ex}" is substring of bad_rec "${bad}"`
              );
            }
          }
        }
      }
    }

    expect(
      violations,
      `Exclusion entries are substrings of bad_recommendations_to_flag:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});
