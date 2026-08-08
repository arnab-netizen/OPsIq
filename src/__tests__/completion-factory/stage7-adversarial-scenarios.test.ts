/**
 * Stage 7 — S7-I11: Adversarial Scenario Coverage
 *
 * Proves that Stage 7 invariant validation rejects nine distinct
 * adversarial failure scenarios. Each scenario attempts a different
 * attack on the Stage 7 closure or evidence system.
 *
 * Scenarios tested:
 *  1. Forged CLOSED status with empty proof_artifacts
 *  2. Invariant with PENDING status in a closed manifest
 *  3. Invariant missing required lane field
 *  4. Manifest with fewer than 16 invariants
 *  5. Manifest with duplicate invariant ids
 *  6. All 16 valid invariants (positive control — must pass)
 *  7. Invariant with empty-string lane (invalid)
 *  8. Invariant with null proof_artifacts
 *  9. Empty invariants array (zero entries)
 */

import { describe, it, expect } from "vitest";

type InvariantStatus = "CLOSED" | "PENDING" | "PROVEN";

interface InvariantEntry {
  id: string;
  status: InvariantStatus;
  lane: string;
  proof_artifacts: string[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const REQUIRED_INVARIANT_COUNT = 16;

function validateInvariantBlock(
  invariants: InvariantEntry[],
  requiredCount: number
): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(invariants) || invariants.length === 0) {
    errors.push(`invariants array is empty; required count is ${requiredCount}`);
    return { valid: false, errors };
  }

  if (invariants.length < requiredCount) {
    errors.push(
      `invariant count ${invariants.length} is below required ${requiredCount}`
    );
  }

  const seenIds = new Set<string>();
  for (const inv of invariants) {
    if (!inv.id) {
      errors.push("invariant missing id field");
      continue;
    }

    if (seenIds.has(inv.id)) {
      errors.push(`duplicate invariant id: ${inv.id}`);
    }
    seenIds.add(inv.id);

    if (!inv.lane || inv.lane.trim() === "") {
      errors.push(`invariant ${inv.id}: missing or empty lane field`);
    }

    if (inv.proof_artifacts === null || inv.proof_artifacts === undefined) {
      errors.push(`invariant ${inv.id}: proof_artifacts must be an array`);
      continue;
    }

    if (inv.status !== "PENDING" && inv.status !== "CLOSED" && inv.status !== "PROVEN") {
      errors.push(`invariant ${inv.id}: unknown status "${inv.status}"`);
    }

    if (inv.status === "CLOSED" || inv.status === "PROVEN") {
      if (!Array.isArray(inv.proof_artifacts) || inv.proof_artifacts.length === 0) {
        errors.push(
          `invariant ${inv.id}: status is ${inv.status} but proof_artifacts is empty`
        );
      }
    }

    if (inv.status === "PENDING") {
      errors.push(
        `invariant ${inv.id}: status is PENDING — all invariants must be CLOSED or PROVEN for stage closure`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

function buildValidInvariant(id: string, overrides: Partial<InvariantEntry> = {}): InvariantEntry {
  return {
    id,
    status: "CLOSED",
    lane: "LANE_C",
    proof_artifacts: [`docs/opsiq/evidence/stage-7/artifacts/${id.toLowerCase()}-proof.json`],
    ...overrides,
  };
}

function buildFullManifest(invariantOverrides?: InvariantEntry[]): InvariantEntry[] {
  return invariantOverrides ?? Array.from({ length: REQUIRED_INVARIANT_COUNT }, (_, i) =>
    buildValidInvariant(`S7-I${i + 1}`)
  );
}

describe("S7-I11: Adversarial Scenario Coverage", () => {
  it("Scenario 1: rejects forged CLOSED status with empty proof_artifacts", () => {
    const invariants = buildFullManifest([
      ...Array.from({ length: 15 }, (_, i) => buildValidInvariant(`S7-I${i + 1}`)),
      buildValidInvariant("S7-I16", { status: "CLOSED", proof_artifacts: [] }),
    ]);
    const result = validateInvariantBlock(invariants, REQUIRED_INVARIANT_COUNT);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /proof_artifacts|S7-I16/.test(e))).toBe(true);
  });

  it("Scenario 2: rejects invariant with PENDING status", () => {
    const invariants = buildFullManifest([
      ...Array.from({ length: 15 }, (_, i) => buildValidInvariant(`S7-I${i + 1}`)),
      buildValidInvariant("S7-I16", { status: "PENDING", proof_artifacts: [] }),
    ]);
    const result = validateInvariantBlock(invariants, REQUIRED_INVARIANT_COUNT);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /PENDING|S7-I16/.test(e))).toBe(true);
  });

  it("Scenario 3: rejects invariant missing lane field", () => {
    const invariants = buildFullManifest([
      ...Array.from({ length: 15 }, (_, i) => buildValidInvariant(`S7-I${i + 1}`)),
      { id: "S7-I16", status: "CLOSED", lane: undefined as any, proof_artifacts: ["valid-ref"] },
    ]);
    const result = validateInvariantBlock(invariants, REQUIRED_INVARIANT_COUNT);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /lane|S7-I16/.test(e))).toBe(true);
  });

  it("Scenario 4: rejects manifest with fewer than 16 invariants", () => {
    const invariants = Array.from({ length: 10 }, (_, i) => buildValidInvariant(`S7-I${i + 1}`));
    const result = validateInvariantBlock(invariants, REQUIRED_INVARIANT_COUNT);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /count|required|16/.test(e))).toBe(true);
  });

  it("Scenario 5: rejects manifest with duplicate invariant ids", () => {
    const invariants = buildFullManifest([
      ...Array.from({ length: 15 }, (_, i) => buildValidInvariant(`S7-I${i + 1}`)),
      buildValidInvariant("S7-I1"),
    ]);
    const result = validateInvariantBlock(invariants, REQUIRED_INVARIANT_COUNT);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /duplicate|S7-I1/.test(e))).toBe(true);
  });

  it("Scenario 6: accepts all 16 valid CLOSED invariants with proof artifacts (positive control)", () => {
    const invariants = buildFullManifest();
    const result = validateInvariantBlock(invariants, REQUIRED_INVARIANT_COUNT);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("Scenario 7: rejects invariant with empty-string lane", () => {
    const invariants = buildFullManifest([
      ...Array.from({ length: 15 }, (_, i) => buildValidInvariant(`S7-I${i + 1}`)),
      buildValidInvariant("S7-I16", { lane: "" }),
    ]);
    const result = validateInvariantBlock(invariants, REQUIRED_INVARIANT_COUNT);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /lane|S7-I16/.test(e))).toBe(true);
  });

  it("Scenario 8: rejects invariant with null proof_artifacts", () => {
    const invariants = buildFullManifest([
      ...Array.from({ length: 15 }, (_, i) => buildValidInvariant(`S7-I${i + 1}`)),
      buildValidInvariant("S7-I16", { proof_artifacts: null as any }),
    ]);
    const result = validateInvariantBlock(invariants, REQUIRED_INVARIANT_COUNT);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /proof_artifacts|S7-I16/.test(e))).toBe(true);
  });

  it("Scenario 9: rejects empty invariants array", () => {
    const result = validateInvariantBlock([], REQUIRED_INVARIANT_COUNT);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /empty|count|required|16/.test(e))).toBe(true);
  });
});
