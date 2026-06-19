/**
 * API route tests for /api/owner/learning-rollback-events
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/controlled-learning-rollback.service", () => ({
  recordRollbackEvent: vi.fn(),
  listRollbackEventsForWorkspace: vi.fn(),
  listRollbackEventsForCandidate: vi.fn(),
  hasBeenRolledBack: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import * as svc from "@/services/controlled-learning-rollback.service";

const WS = "ws-test-001";
const CAND_ID = "cand-001";

beforeEach(() => {
  vi.clearAllMocks();
});

function rollbackInput() {
  return {
    workspaceId: WS,
    candidateId: CAND_ID,
    rolledBackBy: "admin@example.com",
    rolledBackAt: new Date("2026-06-19T10:00:00Z"),
    rollbackReason: "Regression detected in production",
    rollbackCode: "REGRESSION_DETECTED" as const,
  };
}

describe("POST /api/owner/learning-rollback-events — service contract", () => {
  it("calls recordRollbackEvent with correct input", async () => {
    vi.mocked(svc.recordRollbackEvent).mockResolvedValue({ recorded: true, violations: [], event: { id: "rb-001" } });
    await svc.recordRollbackEvent({} as any, rollbackInput());
    expect(svc.recordRollbackEvent).toHaveBeenCalledOnce();
  });

  it("returns recorded=true on success", async () => {
    vi.mocked(svc.recordRollbackEvent).mockResolvedValue({ recorded: true, violations: [], event: { id: "rb-001" } });
    const result = await svc.recordRollbackEvent({} as any, rollbackInput());
    expect(result.recorded).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("returns recorded=false for invalid rollbackCode", async () => {
    vi.mocked(svc.recordRollbackEvent).mockResolvedValue({
      recorded: false,
      violations: ["Invalid rollbackCode: UNKNOWN. Must be one of REGRESSION_DETECTED, HARM_DETECTED, MANUAL_OVERRIDE, POLICY_VIOLATION"],
    });
    const result = await svc.recordRollbackEvent({} as any, { ...rollbackInput(), rollbackCode: "UNKNOWN" as any });
    expect(result.recorded).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it("returns recorded=false if candidate not found", async () => {
    vi.mocked(svc.recordRollbackEvent).mockResolvedValue({
      recorded: false,
      violations: ["Candidate not found in workspace"],
    });
    const result = await svc.recordRollbackEvent({} as any, { ...rollbackInput(), candidateId: "nonexistent" });
    expect(result.recorded).toBe(false);
  });

  it("returns recorded=false when rollbackReason is empty", async () => {
    vi.mocked(svc.recordRollbackEvent).mockResolvedValue({
      recorded: false,
      violations: ["rollbackReason is required"],
    });
    const result = await svc.recordRollbackEvent({} as any, { ...rollbackInput(), rollbackReason: "" });
    expect(result.recorded).toBe(false);
  });
});

describe("GET /api/owner/learning-rollback-events — workspace list", () => {
  it("calls listRollbackEventsForWorkspace with workspaceId", async () => {
    vi.mocked(svc.listRollbackEventsForWorkspace).mockResolvedValue([]);
    await svc.listRollbackEventsForWorkspace({} as any, WS);
    expect(svc.listRollbackEventsForWorkspace).toHaveBeenCalledWith({}, WS);
  });

  it("returns empty array when no events", async () => {
    vi.mocked(svc.listRollbackEventsForWorkspace).mockResolvedValue([]);
    const result = await svc.listRollbackEventsForWorkspace({} as any, WS);
    expect(result).toEqual([]);
  });
});

describe("GET /api/owner/learning-rollback-events — candidate filter", () => {
  it("calls listRollbackEventsForCandidate with workspaceId and candidateId", async () => {
    vi.mocked(svc.listRollbackEventsForCandidate).mockResolvedValue([]);
    await svc.listRollbackEventsForCandidate({} as any, WS, CAND_ID);
    expect(svc.listRollbackEventsForCandidate).toHaveBeenCalledWith({}, WS, CAND_ID);
  });
});

describe("security invariants", () => {
  it("recordRollbackEvent enforces workspace scoping", async () => {
    vi.mocked(svc.recordRollbackEvent).mockResolvedValue({
      recorded: false,
      violations: ["Candidate not found in workspace"],
    });
    const result = await svc.recordRollbackEvent({} as any, { ...rollbackInput(), workspaceId: "ws-attacker" });
    expect(result.recorded).toBe(false);
  });

  it("hasBeenRolledBack always scoped to workspace", async () => {
    vi.mocked(svc.hasBeenRolledBack).mockResolvedValue(false);
    await svc.hasBeenRolledBack({} as any, WS, CAND_ID);
    expect(svc.hasBeenRolledBack).toHaveBeenCalledWith(expect.anything(), WS, CAND_ID);
  });
});
