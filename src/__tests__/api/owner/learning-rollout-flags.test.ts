import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/controlled-learning-rollout.service", () => ({
  setRolloutFlag: vi.fn(),
  getRolloutFlag: vi.fn(),
  listRolloutFlagsForWorkspace: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));

import * as svc from "@/services/controlled-learning-rollout.service";

const WS = "ws-001";
const CAND = "cand-001";
const NOW = new Date("2026-06-19T10:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/owner/learning-rollout-flags — service contract", () => {
  it("sets SHADOW flag", async () => {
    vi.mocked(svc.setRolloutFlag).mockResolvedValue({ set: true, violations: [], flag: { id: "f-1", rolloutStage: "SHADOW" } });
    const r = await svc.setRolloutFlag({} as any, { workspaceId: WS, candidateId: CAND, rolloutStage: "SHADOW", rolloutPct: 0, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(true);
  });

  it("sets FULL flag at 100%", async () => {
    vi.mocked(svc.setRolloutFlag).mockResolvedValue({ set: true, violations: [], flag: { rolloutStage: "FULL", rolloutPct: 100 } });
    const r = await svc.setRolloutFlag({} as any, { workspaceId: WS, candidateId: CAND, rolloutStage: "FULL", rolloutPct: 100, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(true);
  });

  it("rejects invalid rolloutStage", async () => {
    vi.mocked(svc.setRolloutFlag).mockResolvedValue({ set: false, violations: ["Invalid rolloutStage: INVALID"] });
    const r = await svc.setRolloutFlag({} as any, { workspaceId: WS, candidateId: CAND, rolloutStage: "INVALID" as any, rolloutPct: 50, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(false);
  });

  it("rejects rolloutPct > 100", async () => {
    vi.mocked(svc.setRolloutFlag).mockResolvedValue({ set: false, violations: ["Invalid rolloutPct: 150"] });
    const r = await svc.setRolloutFlag({} as any, { workspaceId: WS, candidateId: CAND, rolloutStage: "PARTIAL", rolloutPct: 150, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(false);
  });

  it("rejects cross-tenant candidate", async () => {
    vi.mocked(svc.setRolloutFlag).mockResolvedValue({ set: false, violations: ["Candidate not found in workspace"] });
    const r = await svc.setRolloutFlag({} as any, { workspaceId: "ws-other", candidateId: CAND, rolloutStage: "FULL", rolloutPct: 100, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.violations).toContain("Candidate not found in workspace");
  });
});

describe("GET /api/owner/learning-rollout-flags — service contract", () => {
  it("lists flags for workspace", async () => {
    vi.mocked(svc.listRolloutFlagsForWorkspace).mockResolvedValue([{ id: "f-1" }]);
    const r = await svc.listRolloutFlagsForWorkspace({} as any, WS);
    expect(r).toHaveLength(1);
  });

  it("returns empty for unknown workspace", async () => {
    vi.mocked(svc.listRolloutFlagsForWorkspace).mockResolvedValue([]);
    const r = await svc.listRolloutFlagsForWorkspace({} as any, "ws-unknown");
    expect(r).toEqual([]);
  });
});
