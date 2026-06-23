/**
 * API route tests for /api/owner/learning-retention
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/controlled-learning-retention.service", () => ({
  setRetentionPolicy: vi.fn(),
  getRetentionPolicy: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import * as svc from "@/services/controlled-learning-retention.service";

const WS = "ws-test-001";

beforeEach(() => {
  vi.clearAllMocks();
});

function retentionInput() {
  return {
    workspaceId: WS,
    retentionDays: 365,
    appliedBy: "admin@example.com",
    appliedAt: new Date("2026-06-19T10:00:00Z"),
    policyNotes: "Standard 1-year retention",
  };
}

describe("POST /api/owner/learning-retention — service contract", () => {
  it("calls setRetentionPolicy with correct input", async () => {
    vi.mocked(svc.setRetentionPolicy).mockResolvedValue({ set: true, violations: [], policy: { id: "pol-001" } });
    await svc.setRetentionPolicy({} as any, retentionInput());
    expect(svc.setRetentionPolicy).toHaveBeenCalledOnce();
  });

  it("returns set=true on success", async () => {
    vi.mocked(svc.setRetentionPolicy).mockResolvedValue({ set: true, violations: [], policy: { id: "pol-001" } });
    const result = await svc.setRetentionPolicy({} as any, retentionInput());
    expect(result.set).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("returns set=false for invalid retentionDays (zero)", async () => {
    vi.mocked(svc.setRetentionPolicy).mockResolvedValue({
      set: false,
      violations: ["retentionDays must be a positive integer"],
    });
    const result = await svc.setRetentionPolicy({} as any, { ...retentionInput(), retentionDays: 0 });
    expect(result.set).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it("returns set=false for retentionDays exceeding max (3650)", async () => {
    vi.mocked(svc.setRetentionPolicy).mockResolvedValue({
      set: false,
      violations: ["retentionDays must not exceed 3650 (10 years)"],
    });
    const result = await svc.setRetentionPolicy({} as any, { ...retentionInput(), retentionDays: 9999 });
    expect(result.set).toBe(false);
    expect(result.violations[0]).toContain("3650");
  });

  it("returns set=false when appliedBy is missing", async () => {
    vi.mocked(svc.setRetentionPolicy).mockResolvedValue({
      set: false,
      violations: ["appliedBy is required"],
    });
    const result = await svc.setRetentionPolicy({} as any, { ...retentionInput(), appliedBy: "" });
    expect(result.set).toBe(false);
  });

  it("upserts policy — second call succeeds too", async () => {
    vi.mocked(svc.setRetentionPolicy).mockResolvedValue({ set: true, violations: [], policy: { retentionDays: 180 } });
    const result = await svc.setRetentionPolicy({} as any, { ...retentionInput(), retentionDays: 180 });
    expect(result.set).toBe(true);
  });
});

describe("GET /api/owner/learning-retention — getRetentionPolicy", () => {
  it("calls getRetentionPolicy with workspaceId", async () => {
    vi.mocked(svc.getRetentionPolicy).mockResolvedValue(null);
    await svc.getRetentionPolicy({} as any, WS);
    expect(svc.getRetentionPolicy).toHaveBeenCalledWith({}, WS);
  });

  it("returns null when no policy set", async () => {
    vi.mocked(svc.getRetentionPolicy).mockResolvedValue(null);
    const result = await svc.getRetentionPolicy({} as any, WS);
    expect(result).toBeNull();
  });

  it("returns policy when set", async () => {
    const policy = { workspaceId: WS, retentionDays: 365 };
    vi.mocked(svc.getRetentionPolicy).mockResolvedValue(policy);
    const result = await svc.getRetentionPolicy({} as any, WS);
    expect(result).toEqual(policy);
  });
});

describe("security invariants", () => {
  it("setRetentionPolicy always scoped to workspace", async () => {
    vi.mocked(svc.setRetentionPolicy).mockResolvedValue({ set: true, violations: [], policy: {} });
    await svc.setRetentionPolicy({} as any, retentionInput());
    expect(svc.setRetentionPolicy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ workspaceId: WS }));
  });
});
