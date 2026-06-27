/**
 * Deep Action-System Linkage — reuse / no-parallel-engine regression proof.
 *
 * Proves the budget linkage does NOT introduce a parallel action engine: it reuses
 * the SHARED owner action status machine (`@/domain/founder-recovery/action-status`)
 * and the existing audit ledger, and that the shared FSM's contract is intact
 * (so existing guided execution is not weakened).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  RECOVERY_ACTION_STATUSES,
  canTransition,
  requiresCompletionEvidence,
} from "@/domain/founder-recovery/action-status";

const serviceSrc = fs.readFileSync(
  path.resolve(__dirname, "../../services/owner-budget/action-link.service.ts"),
  "utf8"
);

describe("Deep Action-System Linkage reuse", () => {
  it("reuses the shared owner action status machine (no parallel FSM)", () => {
    expect(serviceSrc).toContain('from "@/domain/founder-recovery/action-status"');
    expect(serviceSrc).toContain("canTransition");
    expect(serviceSrc).toContain("requiresCompletionEvidence");
  });

  it("emits audit events for create/link/update through the shared ledger", () => {
    expect(serviceSrc).toContain("emitAuditEvent");
    expect(serviceSrc).toContain("OWNER_BUDGET_ACTION_CREATED");
    expect(serviceSrc).toContain("OWNER_BUDGET_ACTION_LINKED");
    expect(serviceSrc).toContain("OWNER_BUDGET_ACTION_UPDATED");
  });

  it("does not define its own status-transition table", () => {
    // No locally-redefined transition map — the shared FSM is the single source.
    expect(serviceSrc).not.toMatch(/const\s+\w*TRANSITIONS\b/);
  });

  it("shared FSM contract is intact (existing guided execution not weakened)", () => {
    expect(RECOVERY_ACTION_STATUSES).toEqual([
      "proposed", "assigned", "in_progress", "blocked", "completed", "cancelled",
    ]);
    expect(canTransition("proposed", "assigned")).toBe(true);
    expect(canTransition("proposed", "completed")).toBe(false);
    expect(canTransition("completed", "assigned")).toBe(false);
    expect(requiresCompletionEvidence("completed")).toBe(true);
    expect(requiresCompletionEvidence("assigned")).toBe(false);
  });
});
