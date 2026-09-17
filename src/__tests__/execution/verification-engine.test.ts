/**
 * Unit tests for detectFakeCompletion — the guard behind the production defect where
 * POST /api/owner/process-execution COMPLETE always returned 400 EVIDENCE_REQUIRED even with
 * real evidence attached (process-execution-bridge.service.ts's completeProcessTask, line ~308).
 *
 * Root cause: the guard used `(!evidence_attached || operator_notes_empty)` -- an OR -- so it
 * fired whenever EITHER was missing, even when the other was present. The owner cockpit's
 * Complete form (MinimumOwnerCockpit.tsx) never collects an operator note for COMPLETE, so
 * operator_notes_empty was always true, and every completion with evidence but no note was
 * wrongly flagged as fake. The contract (per this function's own caller's comment: "claimed
 * complete but no evidence and no notes") is AND: only flag fake when NEITHER is present.
 */
import { describe, it, expect } from "vitest";
import { detectFakeCompletion } from "@/services/execution/verification-engine";

describe("detectFakeCompletion", () => {
  it("is fake: no evidence and no notes (nothing to verify the claim)", () => {
    expect(detectFakeCompletion(true, false, false, true)).toBe(true);
  });

  it("is NOT fake: evidence attached, no notes — the exact production regression shape (owner cockpit Complete form never sends notes)", () => {
    expect(detectFakeCompletion(true, true, false, true)).toBe(false);
  });

  it("is NOT fake: notes present, no evidence", () => {
    expect(detectFakeCompletion(true, false, false, false)).toBe(false);
  });

  it("is NOT fake: both evidence and notes present", () => {
    expect(detectFakeCompletion(true, true, false, false)).toBe(false);
  });

  it("is NOT fake whenever the KPI moved, regardless of evidence/notes", () => {
    expect(detectFakeCompletion(true, false, true, true)).toBe(false);
  });

  it("is never fake when completion isn't even claimed", () => {
    expect(detectFakeCompletion(false, false, false, true)).toBe(false);
  });
});
