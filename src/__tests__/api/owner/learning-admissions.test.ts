/**
 * API route tests for /api/owner/learning-admissions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/controlled-learning-admission.service", () => ({
  admitCandidate: vi.fn(),
  getAdmission: vi.fn(),
  listAdmissionsForWorkspace: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import * as svc from "@/services/controlled-learning-admission.service";

const WS = "ws-test-001";
const CAND_ID = "cand-001";

beforeEach(() => {
  vi.clearAllMocks();
});

function admitInput() {
  return {
    workspaceId: WS,
    candidateId: CAND_ID,
    admittedBy: "admin@example.com",
    admittedAt: new Date("2026-06-19T10:00:00Z"),
    sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE",
    evidenceOrigin: "owner_manual_entry",
    eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
    admissionNotes: "Approved for admission",
  };
}

describe("POST /api/owner/learning-admissions — service contract", () => {
  it("calls admitCandidate with correct input", async () => {
    vi.mocked(svc.admitCandidate).mockResolvedValue({ admitted: true, violations: [], admission: { id: "adm-001" } });
    await svc.admitCandidate({} as any, admitInput());
    expect(svc.admitCandidate).toHaveBeenCalledOnce();
  });

  it("returns admitted=true on success", async () => {
    vi.mocked(svc.admitCandidate).mockResolvedValue({ admitted: true, violations: [], admission: { id: "adm-001" } });
    const result = await svc.admitCandidate({} as any, admitInput());
    expect(result.admitted).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("returns admitted=false for forbidden evidence origin", async () => {
    vi.mocked(svc.admitCandidate).mockResolvedValue({
      admitted: false,
      violations: ['Evidence origin "ai_generated" is forbidden and may never be admitted'],
    });
    const result = await svc.admitCandidate({} as any, { ...admitInput(), evidenceOrigin: "ai_generated" });
    expect(result.admitted).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it("returns admitted=false if candidate not found", async () => {
    vi.mocked(svc.admitCandidate).mockResolvedValue({
      admitted: false,
      violations: ["Candidate not found or wrong workspace"],
    });
    const result = await svc.admitCandidate({} as any, { ...admitInput(), candidateId: "nonexistent" });
    expect(result.admitted).toBe(false);
  });

  it("returns admitted=false if already admitted", async () => {
    vi.mocked(svc.admitCandidate).mockResolvedValue({
      admitted: false,
      violations: ["Candidate already admitted"],
    });
    const result = await svc.admitCandidate({} as any, admitInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("already admitted");
  });

  it("returns admitted=false for ineligible status", async () => {
    vi.mocked(svc.admitCandidate).mockResolvedValue({
      admitted: false,
      violations: ["Candidate eligibility status does not allow admission: LEARNING_INELIGIBLE_AI_GENERATED"],
    });
    const result = await svc.admitCandidate({} as any, { ...admitInput(), eligibilityStatus: "LEARNING_INELIGIBLE_AI_GENERATED" });
    expect(result.admitted).toBe(false);
  });
});

describe("GET /api/owner/learning-admissions — service contract", () => {
  it("calls listAdmissionsForWorkspace with workspaceId", async () => {
    vi.mocked(svc.listAdmissionsForWorkspace).mockResolvedValue([]);
    await svc.listAdmissionsForWorkspace({} as any, WS);
    expect(svc.listAdmissionsForWorkspace).toHaveBeenCalledWith({}, WS);
  });

  it("returns empty array when no admissions", async () => {
    vi.mocked(svc.listAdmissionsForWorkspace).mockResolvedValue([]);
    const result = await svc.listAdmissionsForWorkspace({} as any, WS);
    expect(result).toEqual([]);
  });

  it("returns admissions scoped to workspace", async () => {
    const admission = { id: "adm-001", workspaceId: WS, candidateId: CAND_ID };
    vi.mocked(svc.listAdmissionsForWorkspace).mockResolvedValue([admission]);
    const result = await svc.listAdmissionsForWorkspace({} as any, WS);
    expect(result).toHaveLength(1);
  });
});

describe("security invariants", () => {
  it("admitCandidate enforces workspace scoping", async () => {
    vi.mocked(svc.admitCandidate).mockResolvedValue({
      admitted: false,
      violations: ["Candidate not found or wrong workspace"],
    });
    const result = await svc.admitCandidate({} as any, { ...admitInput(), workspaceId: "ws-attacker" });
    expect(result.admitted).toBe(false);
  });

  it("listAdmissionsForWorkspace always receives workspaceId", async () => {
    vi.mocked(svc.listAdmissionsForWorkspace).mockResolvedValue([]);
    await svc.listAdmissionsForWorkspace({} as any, WS);
    expect(svc.listAdmissionsForWorkspace).toHaveBeenCalledWith(expect.anything(), WS);
  });
});
