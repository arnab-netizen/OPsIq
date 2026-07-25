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

describe("GAME-01 proof freshness — function contract assertions", () => {
  it("resolveEffectiveProofAgeDays is a function", () => {
    expect(typeof resolveEffectiveProofAgeDays).toBe("function");
  });
  it("evaluateProofClearance is a function", () => {
    expect(typeof evaluateProofClearance).toBe("function");
  });
  it("ProofStatus.ACCEPTED is defined", () => {
    expect(ProofStatus.ACCEPTED).toBeDefined();
  });
  it("resolveEffectiveProofAgeDays returns 30 for null", () => {
    expect(resolveEffectiveProofAgeDays(null)).toBe(30);
  });
  it("resolveEffectiveProofAgeDays returns 30 for undefined", () => {
    expect(resolveEffectiveProofAgeDays(undefined)).toBe(30);
  });
  it("resolveEffectiveProofAgeDays returns 7 for 7 (tighter than default)", () => {
    expect(resolveEffectiveProofAgeDays(7)).toBe(7);
  });
  it("resolveEffectiveProofAgeDays clamps 999 to 30 (server ceiling)", () => {
    expect(resolveEffectiveProofAgeDays(999)).toBe(30);
  });
  it("resolveEffectiveProofAgeDays clamps 0 to 30 (non-positive rejected)", () => {
    expect(resolveEffectiveProofAgeDays(0)).toBe(30);
  });
  it("resolveEffectiveProofAgeDays clamps -5 to 30 (negative rejected)", () => {
    expect(resolveEffectiveProofAgeDays(-5)).toBe(30);
  });
  it("evaluateProofClearance returns an object with cleared and reason fields", () => {
    const now = new Date("2026-07-04T00:00:00Z");
    const result = evaluateProofClearance(ProofStatus.ACCEPTED, { acceptedAt: new Date("2026-06-30T00:00:00Z"), duplicateFlagged: false, now, maxAgeDays: 30 });
    expect(result).toHaveProperty("cleared");
    expect(result).toHaveProperty("reason");
  });
  it("a fresh accepted proof is cleared", () => {
    const now = new Date("2026-07-04T00:00:00Z");
    const acceptedAt = new Date("2026-07-01T00:00:00Z"); // 3 days old, within 30
    const r = evaluateProofClearance(ProofStatus.ACCEPTED, { acceptedAt, duplicateFlagged: false, now, maxAgeDays: 30 });
    expect(r.cleared).toBe(true);
  });
  it("a stale accepted proof is NOT cleared (64 days > 30 day ceiling)", () => {
    const now = new Date("2026-07-04T00:00:00Z");
    const acceptedAt = new Date("2026-05-01T00:00:00Z"); // 64 days old
    const r = evaluateProofClearance(ProofStatus.ACCEPTED, { acceptedAt, duplicateFlagged: false, now, maxAgeDays: 30 });
    expect(r.cleared).toBe(false);
  });
  it("a duplicate-flagged proof is NOT cleared even if fresh", () => {
    const now = new Date("2026-07-04T00:00:00Z");
    const acceptedAt = new Date("2026-07-03T00:00:00Z"); // 1 day old
    const r = evaluateProofClearance(ProofStatus.ACCEPTED, { acceptedAt, duplicateFlagged: true, now, maxAgeDays: 30 });
    expect(r.cleared).toBe(false);
  });
  it("the reason for a stale proof is 'proof_stale'", () => {
    const now = new Date("2026-07-04T00:00:00Z");
    const acceptedAt = new Date("2026-05-01T00:00:00Z");
    const r = evaluateProofClearance(ProofStatus.ACCEPTED, { acceptedAt, duplicateFlagged: false, now, maxAgeDays: 30 });
    expect(r.reason).toBe("proof_stale");
  });
  it("resolveEffectiveProofAgeDays(30) returns 30 (equal to ceiling)", () => {
    expect(resolveEffectiveProofAgeDays(30)).toBe(30);
  });
  it("resolveEffectiveProofAgeDays(1) returns 1 (tightest valid window)", () => {
    expect(resolveEffectiveProofAgeDays(1)).toBe(1);
  });
  it("resolveEffectiveProofAgeDays return type is a number", () => {
    expect(typeof resolveEffectiveProofAgeDays(7)).toBe("number");
    expect(typeof resolveEffectiveProofAgeDays(null)).toBe("number");
  });
});

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
