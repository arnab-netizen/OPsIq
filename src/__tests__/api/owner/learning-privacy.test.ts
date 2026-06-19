/**
 * API route tests for /api/owner/learning-privacy
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/controlled-learning-privacy.service", () => ({
  applyPrivacyControl: vi.fn(),
  listPrivacyControlsForWorkspace: vi.fn(),
  listPrivacyControlsForCandidate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import * as svc from "@/services/controlled-learning-privacy.service";

const WS = "ws-test-001";
const CAND_ID = "cand-001";

beforeEach(() => {
  vi.clearAllMocks();
});

function privacyInput() {
  return {
    workspaceId: WS,
    candidateId: CAND_ID,
    controlType: "REDACT" as const,
    appliedBy: "admin@example.com",
    appliedAt: new Date("2026-06-19T10:00:00Z"),
    reason: "PII detected",
  };
}

describe("POST /api/owner/learning-privacy — service contract", () => {
  it("calls applyPrivacyControl with correct input", async () => {
    vi.mocked(svc.applyPrivacyControl).mockResolvedValue({ applied: true, violations: [], control: { id: "ctrl-001" } });
    await svc.applyPrivacyControl({} as any, privacyInput());
    expect(svc.applyPrivacyControl).toHaveBeenCalledOnce();
  });

  it("returns applied=true on success", async () => {
    vi.mocked(svc.applyPrivacyControl).mockResolvedValue({ applied: true, violations: [], control: { id: "ctrl-001" } });
    const result = await svc.applyPrivacyControl({} as any, privacyInput());
    expect(result.applied).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("returns applied=false if candidate not found", async () => {
    vi.mocked(svc.applyPrivacyControl).mockResolvedValue({
      applied: false,
      violations: ["Candidate not found in workspace"],
    });
    const result = await svc.applyPrivacyControl({} as any, { ...privacyInput(), candidateId: "nonexistent" });
    expect(result.applied).toBe(false);
    expect(result.violations[0]).toContain("not found");
  });

  it("returns applied=false for invalid controlType", async () => {
    vi.mocked(svc.applyPrivacyControl).mockResolvedValue({
      applied: false,
      violations: ["controlType must be one of: ANONYMIZE, REDACT, EXCLUDE, QUARANTINE"],
    });
    const result = await svc.applyPrivacyControl({} as any, { ...privacyInput(), controlType: "INVALID" as any });
    expect(result.applied).toBe(false);
  });

  it("returns applied=false if reason is empty", async () => {
    vi.mocked(svc.applyPrivacyControl).mockResolvedValue({
      applied: false,
      violations: ["reason is required"],
    });
    const result = await svc.applyPrivacyControl({} as any, { ...privacyInput(), reason: "" });
    expect(result.applied).toBe(false);
  });
});

describe("GET /api/owner/learning-privacy — workspace list", () => {
  it("calls listPrivacyControlsForWorkspace with workspaceId", async () => {
    vi.mocked(svc.listPrivacyControlsForWorkspace).mockResolvedValue([]);
    await svc.listPrivacyControlsForWorkspace({} as any, WS);
    expect(svc.listPrivacyControlsForWorkspace).toHaveBeenCalledWith({}, WS);
  });

  it("returns empty array when no controls", async () => {
    vi.mocked(svc.listPrivacyControlsForWorkspace).mockResolvedValue([]);
    const result = await svc.listPrivacyControlsForWorkspace({} as any, WS);
    expect(result).toEqual([]);
  });
});

describe("GET /api/owner/learning-privacy — candidate filter", () => {
  it("calls listPrivacyControlsForCandidate with workspaceId and candidateId", async () => {
    vi.mocked(svc.listPrivacyControlsForCandidate).mockResolvedValue([]);
    await svc.listPrivacyControlsForCandidate({} as any, WS, CAND_ID);
    expect(svc.listPrivacyControlsForCandidate).toHaveBeenCalledWith({}, WS, CAND_ID);
  });
});

describe("security invariants", () => {
  it("applyPrivacyControl enforces workspace scoping", async () => {
    vi.mocked(svc.applyPrivacyControl).mockResolvedValue({
      applied: false,
      violations: ["Candidate not found in workspace"],
    });
    const result = await svc.applyPrivacyControl({} as any, { ...privacyInput(), workspaceId: "ws-attacker" });
    expect(result.applied).toBe(false);
  });
});
