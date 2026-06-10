import { describe, it, expect } from "vitest";
import {
  assertTransition,
  canTransition,
  isValidRecoveryStatus,
  requiresCompletionEvidence,
} from "@/domain/founder-recovery/action-status";

describe("founder-recovery action status machine", () => {
  it("allows the intended forward flow", () => {
    expect(canTransition("proposed", "assigned")).toBe(true);
    expect(canTransition("assigned", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
    expect(canTransition("assigned", "blocked")).toBe(true);
    expect(canTransition("blocked", "in_progress")).toBe(true);
  });

  it("rejects invalid transitions (no skipping, no resurrecting terminal states)", () => {
    expect(canTransition("proposed", "completed")).toBe(false);
    expect(canTransition("proposed", "in_progress")).toBe(false);
    expect(canTransition("completed", "in_progress")).toBe(false);
    expect(canTransition("cancelled", "assigned")).toBe(false);
  });

  it("assertTransition throws on invalid transition", () => {
    expect(() => assertTransition("proposed", "completed")).toThrow(/Invalid recovery action transition/);
    expect(assertTransition("assigned", "in_progress")).toBe("in_progress");
  });

  it("validates status strings", () => {
    expect(isValidRecoveryStatus("in_progress")).toBe(true);
    expect(isValidRecoveryStatus("open")).toBe(false); // legacy broken enum value rejected
    expect(isValidRecoveryStatus("deferred")).toBe(false);
  });

  it("requires completion evidence when completing", () => {
    expect(requiresCompletionEvidence("completed")).toBe(true);
    expect(requiresCompletionEvidence("in_progress")).toBe(false);
  });
});
