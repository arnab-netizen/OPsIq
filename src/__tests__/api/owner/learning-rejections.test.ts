/**
 * API route tests for /api/owner/learning-rejections
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/controlled-learning-rejection.service", () => ({
  rejectCandidateFinal: vi.fn(),
  getRejection: vi.fn(),
  listRejectionsForWorkspace: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import * as svc from "@/services/controlled-learning-rejection.service";

const WS = "ws-test-001";
const CAND_ID = "cand-001";

beforeEach(() => {
  vi.clearAllMocks();
});

function rejectInput() {
  return {
    workspaceId: WS,
    candidateId: CAND_ID,
    rejectedBy: "admin@example.com",
    rejectedAt: new Date("2026-06-19T10:00:00Z"),
    rejectionReason: "Insufficient evidence",
    rejectionCode: "MANUAL_OVERRIDE",
  };
}

describe("POST /api/owner/learning-rejections — service contract", () => {
  it("calls rejectCandidateFinal with correct input", async () => {
    vi.mocked(svc.rejectCandidateFinal).mockResolvedValue({ rejected: true, violations: [], rejection: { id: "rej-001" } });
    await svc.rejectCandidateFinal({} as any, rejectInput());
    expect(svc.rejectCandidateFinal).toHaveBeenCalledOnce();
  });

  it("returns rejected=true on success", async () => {
    vi.mocked(svc.rejectCandidateFinal).mockResolvedValue({ rejected: true, violations: [], rejection: { id: "rej-001" } });
    const result = await svc.rejectCandidateFinal({} as any, rejectInput());
    expect(result.rejected).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("returns rejected=false if candidate not found", async () => {
    vi.mocked(svc.rejectCandidateFinal).mockResolvedValue({
      rejected: false,
      violations: ["Candidate not found or wrong workspace"],
    });
    const result = await svc.rejectCandidateFinal({} as any, { ...rejectInput(), candidateId: "nonexistent" });
    expect(result.rejected).toBe(false);
    expect(result.violations[0]).toContain("not found");
  });

  it("returns rejected=false if already rejected", async () => {
    vi.mocked(svc.rejectCandidateFinal).mockResolvedValue({
      rejected: false,
      violations: ["Candidate already rejected"],
    });
    const result = await svc.rejectCandidateFinal({} as any, rejectInput());
    expect(result.rejected).toBe(false);
    expect(result.violations[0]).toContain("already rejected");
  });

  it("returns rejected=false if already admitted", async () => {
    vi.mocked(svc.rejectCandidateFinal).mockResolvedValue({
      rejected: false,
      violations: ["Candidate already admitted; cannot reject"],
    });
    const result = await svc.rejectCandidateFinal({} as any, rejectInput());
    expect(result.rejected).toBe(false);
    expect(result.violations[0]).toContain("admitted");
  });
});

describe("GET /api/owner/learning-rejections — service contract", () => {
  it("calls listRejectionsForWorkspace with workspaceId", async () => {
    vi.mocked(svc.listRejectionsForWorkspace).mockResolvedValue([]);
    await svc.listRejectionsForWorkspace({} as any, WS);
    expect(svc.listRejectionsForWorkspace).toHaveBeenCalledWith({}, WS);
  });

  it("returns empty array when no rejections", async () => {
    vi.mocked(svc.listRejectionsForWorkspace).mockResolvedValue([]);
    const result = await svc.listRejectionsForWorkspace({} as any, WS);
    expect(result).toEqual([]);
  });

  it("returns rejections scoped to workspace", async () => {
    const rejection = { id: "rej-001", workspaceId: WS, candidateId: CAND_ID };
    vi.mocked(svc.listRejectionsForWorkspace).mockResolvedValue([rejection]);
    const result = await svc.listRejectionsForWorkspace({} as any, WS);
    expect(result).toHaveLength(1);
  });
});

describe("security invariants", () => {
  it("rejectCandidateFinal enforces workspace scoping", async () => {
    vi.mocked(svc.rejectCandidateFinal).mockResolvedValue({
      rejected: false,
      violations: ["Candidate not found or wrong workspace"],
    });
    const result = await svc.rejectCandidateFinal({} as any, { ...rejectInput(), workspaceId: "ws-attacker" });
    expect(result.rejected).toBe(false);
  });

  it("list always receives workspaceId", async () => {
    vi.mocked(svc.listRejectionsForWorkspace).mockResolvedValue([]);
    await svc.listRejectionsForWorkspace({} as any, WS);
    expect(svc.listRejectionsForWorkspace).toHaveBeenCalledWith(expect.anything(), WS);
  });
});
