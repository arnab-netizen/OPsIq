import { describe, it, expect } from "vitest";
import {
  assertTransition,
  canTransition,
  isValidRecoveryStatus,
  requiresCompletionEvidence,
} from "@/domain/founder-recovery/action-status";

describe("founder-recovery action status — module contract assertions", () => {
  it("assertTransition is a function", () => {
    expect(typeof assertTransition).toBe("function");
  });
  it("canTransition is a function", () => {
    expect(typeof canTransition).toBe("function");
  });
  it("isValidRecoveryStatus is a function", () => {
    expect(typeof isValidRecoveryStatus).toBe("function");
  });
  it("requiresCompletionEvidence is a function", () => {
    expect(typeof requiresCompletionEvidence).toBe("function");
  });
  it("canTransition returns a boolean", () => {
    expect(typeof canTransition("proposed", "assigned")).toBe("boolean");
  });
  it("canTransition('proposed','assigned') is true", () => {
    expect(canTransition("proposed", "assigned")).toBe(true);
  });
  it("canTransition('proposed','completed') is false", () => {
    expect(canTransition("proposed", "completed")).toBe(false);
  });
  it("canTransition('assigned','in_progress') is true", () => {
    expect(canTransition("assigned", "in_progress")).toBe(true);
  });
  it("canTransition('completed','in_progress') is false", () => {
    expect(canTransition("completed", "in_progress")).toBe(false);
  });
  it("isValidRecoveryStatus returns a boolean", () => {
    expect(typeof isValidRecoveryStatus("in_progress")).toBe("boolean");
  });
  it("isValidRecoveryStatus('in_progress') is true", () => {
    expect(isValidRecoveryStatus("in_progress")).toBe(true);
  });
  it("isValidRecoveryStatus('open') is false", () => {
    expect(isValidRecoveryStatus("open")).toBe(false);
  });
  it("requiresCompletionEvidence('completed') is true", () => {
    expect(requiresCompletionEvidence("completed")).toBe(true);
  });
  it("requiresCompletionEvidence('proposed') is false", () => {
    expect(requiresCompletionEvidence("proposed")).toBe(false);
  });
  it("requiresCompletionEvidence returns a boolean", () => {
    expect(typeof requiresCompletionEvidence("in_progress")).toBe("boolean");
  });
  it("assertTransition('assigned','in_progress') returns 'in_progress'", () => {
    expect(assertTransition("assigned", "in_progress")).toBe("in_progress");
  });
});

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
