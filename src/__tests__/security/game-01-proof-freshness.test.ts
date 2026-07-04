/**
 * GAME-01 regression: the proof freshness window is server-governed. A client cannot
 * disable it (previously by sending maxProofAgeDays=null) or loosen it beyond the server
 * default. This test pins the clamp AND confirms a stale accepted proof is not cleared
 * under the resolved window even when the client asked to disable the gate.
 */
import { describe, it, expect } from "vitest";
import { resolveEffectiveProofAgeDays } from "@/services/execution/task-completion.service";
import { evaluateProofClearance } from "@/domain/execution/proof";
import { ProofStatus } from "@/domain/execution/proof";

describe("GAME-01 server-governed proof freshness window", () => {
  it("null / undefined can NOT disable the gate (fall back to the 30-day default)", () => {
    expect(resolveEffectiveProofAgeDays(null)).toBe(30);
    expect(resolveEffectiveProofAgeDays(undefined)).toBe(30);
  });

  it("a client value may only TIGHTEN the window", () => {
    expect(resolveEffectiveProofAgeDays(7)).toBe(7); // stricter allowed
    expect(resolveEffectiveProofAgeDays(999)).toBe(30); // cannot exceed the ceiling
    expect(resolveEffectiveProofAgeDays(0)).toBe(30); // non-positive rejected
    expect(resolveEffectiveProofAgeDays(-5)).toBe(30);
  });

  it("a stale accepted proof is NOT cleared under the resolved window (null no longer waves it through)", () => {
    const now = new Date("2026-07-04T00:00:00Z");
    const acceptedAt = new Date("2026-05-01T00:00:00Z"); // ~64 days old
    // Simulate what the service now does with a client-supplied null.
    const clearance = evaluateProofClearance(ProofStatus.ACCEPTED, {
      acceptedAt,
      duplicateFlagged: false,
      now,
      maxAgeDays: resolveEffectiveProofAgeDays(null),
    });
    expect(clearance.cleared).toBe(false);
    expect(clearance.reason).toBe("proof_stale");
  });
});
