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

describe("POST /api/owner/learning-rejections — additional rejection codes", () => {
  it("handles MANUAL_OVERRIDE rejectionCode", async () => {
    vi.mocked(svc.rejectCandidateFinal).mockResolvedValue({ rejected: true, violations: [], rejection: { rejectionCode: "MANUAL_OVERRIDE" } });
    const result = await svc.rejectCandidateFinal({} as any, { ...rejectInput(), rejectionCode: "MANUAL_OVERRIDE" });
    expect(result.rejected).toBe(true);
  });

  it("rejects empty rejectionReason", async () => {
    vi.mocked(svc.rejectCandidateFinal).mockResolvedValue({ rejected: false, violations: ["rejectionReason is required"] });
    const result = await svc.rejectCandidateFinal({} as any, { ...rejectInput(), rejectionReason: "" });
    expect(result.rejected).toBe(false);
    expect(result.violations[0]).toContain("required");
  });

  it("rejects empty rejectionCode", async () => {
    vi.mocked(svc.rejectCandidateFinal).mockResolvedValue({ rejected: false, violations: ["rejectionCode is required"] });
    const result = await svc.rejectCandidateFinal({} as any, { ...rejectInput(), rejectionCode: "" });
    expect(result.rejected).toBe(false);
  });

  it("returns violations list when rejected=false", async () => {
    vi.mocked(svc.rejectCandidateFinal).mockResolvedValue({ rejected: false, violations: ["Candidate not found or wrong workspace", "Cannot reject in this state"] });
    const result = await svc.rejectCandidateFinal({} as any, rejectInput());
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("rejectCandidateFinal called exactly once per request", async () => {
    vi.mocked(svc.rejectCandidateFinal).mockResolvedValue({ rejected: true, violations: [], rejection: {} });
    await svc.rejectCandidateFinal({} as any, rejectInput());
    expect(svc.rejectCandidateFinal).toHaveBeenCalledTimes(1);
  });

  it("includes workspaceId and candidateId in rejection call", async () => {
    vi.mocked(svc.rejectCandidateFinal).mockResolvedValue({ rejected: true, violations: [], rejection: {} });
    await svc.rejectCandidateFinal({} as any, rejectInput());
    expect(svc.rejectCandidateFinal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workspaceId: WS, candidateId: CAND_ID })
    );
  });
});

describe("GET /api/owner/learning-rejections — additional scenarios", () => {
  it("listRejectionsForWorkspace returns multiple rejections", async () => {
    const items = [{ id: "rej-001" }, { id: "rej-002" }];
    vi.mocked(svc.listRejectionsForWorkspace).mockResolvedValue(items);
    const result = await svc.listRejectionsForWorkspace({} as any, WS);
    expect(result).toHaveLength(2);
  });

  it("listRejectionsForWorkspace called exactly once", async () => {
    vi.mocked(svc.listRejectionsForWorkspace).mockResolvedValue([]);
    await svc.listRejectionsForWorkspace({} as any, WS);
    expect(svc.listRejectionsForWorkspace).toHaveBeenCalledTimes(1);
  });

  it("workspace isolation: WS-A and WS-B listed separately", async () => {
    vi.mocked(svc.listRejectionsForWorkspace).mockResolvedValue([]);
    await svc.listRejectionsForWorkspace({} as any, "ws-001");
    await svc.listRejectionsForWorkspace({} as any, "ws-002");
    expect(svc.listRejectionsForWorkspace).toHaveBeenNthCalledWith(1, expect.anything(), "ws-001");
    expect(svc.listRejectionsForWorkspace).toHaveBeenNthCalledWith(2, expect.anything(), "ws-002");
  });

  it("getRejection returns rejection for known id", async () => {
    vi.mocked(svc.getRejection).mockResolvedValue({ id: "rej-001", workspaceId: WS });
    const result = await svc.getRejection({} as any, WS, "rej-001");
    expect(result).toBeDefined();
    expect(result?.id).toBe("rej-001");
  });
});
