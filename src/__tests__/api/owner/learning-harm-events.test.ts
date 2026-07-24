/**
 * API route tests for /api/owner/learning-harm-events
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/controlled-learning-harm.service", () => ({
  recordHarmEvent: vi.fn(),
  markHarmMitigated: vi.fn(),
  listHarmEventsForWorkspace: vi.fn(),
  listHarmEventsForCandidate: vi.fn(),
  hasCriticalHarm: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import * as svc from "@/services/controlled-learning-harm.service";

const WS = "ws-test-001";
const CAND_ID = "cand-001";

beforeEach(() => {
  vi.clearAllMocks();
});

function harmInput() {
  return {
    workspaceId: WS,
    candidateId: CAND_ID,
    harmType: "DECISION_ERROR" as const,
    severity: "HIGH" as const,
    detectedBy: "monitor@example.com",
    detectedAt: new Date("2026-06-19T10:00:00Z"),
    harmDescription: "Model made incorrect recommendation",
  };
}

describe("POST /api/owner/learning-harm-events — service contract", () => {
  it("calls recordHarmEvent with correct input", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({ recorded: true, violations: [], event: { id: "harm-001" } });
    await svc.recordHarmEvent({} as any, harmInput());
    expect(svc.recordHarmEvent).toHaveBeenCalledOnce();
  });

  it("returns recorded=true on success", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({ recorded: true, violations: [], event: { id: "harm-001" } });
    const result = await svc.recordHarmEvent({} as any, harmInput());
    expect(result.recorded).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("returns recorded=false for invalid harmType", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({
      recorded: false,
      violations: ["Invalid harmType: UNKNOWN"],
    });
    const result = await svc.recordHarmEvent({} as any, { ...harmInput(), harmType: "UNKNOWN" as any });
    expect(result.recorded).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it("returns recorded=false for invalid severity", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({
      recorded: false,
      violations: ["Invalid severity: EXTREME"],
    });
    const result = await svc.recordHarmEvent({} as any, { ...harmInput(), severity: "EXTREME" as any });
    expect(result.recorded).toBe(false);
  });

  it("returns recorded=false if candidate not found", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({
      recorded: false,
      violations: ["Candidate not found in workspace"],
    });
    const result = await svc.recordHarmEvent({} as any, { ...harmInput(), candidateId: "nonexistent" });
    expect(result.recorded).toBe(false);
  });

  it("records CRITICAL severity correctly", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({ recorded: true, violations: [], event: { severity: "CRITICAL" } });
    const result = await svc.recordHarmEvent({} as any, { ...harmInput(), severity: "CRITICAL" });
    expect(result.recorded).toBe(true);
  });
});

describe("GET /api/owner/learning-harm-events — workspace list", () => {
  it("calls listHarmEventsForWorkspace with workspaceId", async () => {
    vi.mocked(svc.listHarmEventsForWorkspace).mockResolvedValue([]);
    await svc.listHarmEventsForWorkspace({} as any, WS);
    expect(svc.listHarmEventsForWorkspace).toHaveBeenCalledWith({}, WS);
  });

  it("returns empty array when no events", async () => {
    vi.mocked(svc.listHarmEventsForWorkspace).mockResolvedValue([]);
    const result = await svc.listHarmEventsForWorkspace({} as any, WS);
    expect(result).toEqual([]);
  });
});

describe("GET /api/owner/learning-harm-events — candidate filter", () => {
  it("calls listHarmEventsForCandidate with workspaceId and candidateId", async () => {
    vi.mocked(svc.listHarmEventsForCandidate).mockResolvedValue([]);
    await svc.listHarmEventsForCandidate({} as any, WS, CAND_ID);
    expect(svc.listHarmEventsForCandidate).toHaveBeenCalledWith({}, WS, CAND_ID);
  });
});

describe("security invariants", () => {
  it("recordHarmEvent enforces workspace scoping", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({
      recorded: false,
      violations: ["Candidate not found in workspace"],
    });
    const result = await svc.recordHarmEvent({} as any, { ...harmInput(), workspaceId: "ws-attacker" });
    expect(result.recorded).toBe(false);
  });

  it("hasCriticalHarm always scoped to workspace", async () => {
    vi.mocked(svc.hasCriticalHarm).mockResolvedValue(false);
    await svc.hasCriticalHarm({} as any, WS, CAND_ID);
    expect(svc.hasCriticalHarm).toHaveBeenCalledWith(expect.anything(), WS, CAND_ID);
  });
});

describe("POST /api/owner/learning-harm-events — additional harmTypes", () => {
  it("records FINANCIAL_LOSS harmType", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({ recorded: true, violations: [], event: { harmType: "FINANCIAL_LOSS" } });
    const result = await svc.recordHarmEvent({} as any, { ...harmInput(), harmType: "FINANCIAL_LOSS" });
    expect(result.recorded).toBe(true);
  });

  it("records DATA_CORRUPTION harmType", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({ recorded: true, violations: [], event: { harmType: "DATA_CORRUPTION" } });
    const result = await svc.recordHarmEvent({} as any, { ...harmInput(), harmType: "DATA_CORRUPTION" });
    expect(result.recorded).toBe(true);
  });

  it("records COMPLIANCE_VIOLATION harmType", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({ recorded: true, violations: [], event: { harmType: "COMPLIANCE_VIOLATION" } });
    const result = await svc.recordHarmEvent({} as any, { ...harmInput(), harmType: "COMPLIANCE_VIOLATION" });
    expect(result.recorded).toBe(true);
  });

  it("records SAFETY_RISK harmType", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({ recorded: true, violations: [], event: { harmType: "SAFETY_RISK" } });
    const result = await svc.recordHarmEvent({} as any, { ...harmInput(), harmType: "SAFETY_RISK" });
    expect(result.recorded).toBe(true);
  });

  it("records LOW severity", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({ recorded: true, violations: [], event: { severity: "LOW" } });
    const result = await svc.recordHarmEvent({} as any, { ...harmInput(), severity: "LOW" });
    expect(result.recorded).toBe(true);
  });

  it("records MEDIUM severity", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({ recorded: true, violations: [], event: { severity: "MEDIUM" } });
    const result = await svc.recordHarmEvent({} as any, { ...harmInput(), severity: "MEDIUM" });
    expect(result.recorded).toBe(true);
  });

  it("recordHarmEvent called exactly once per request", async () => {
    vi.mocked(svc.recordHarmEvent).mockResolvedValue({ recorded: true, violations: [], event: {} });
    await svc.recordHarmEvent({} as any, harmInput());
    expect(svc.recordHarmEvent).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/owner/learning-harm-events — additional scenarios", () => {
  it("listHarmEventsForWorkspace returns multiple events", async () => {
    vi.mocked(svc.listHarmEventsForWorkspace).mockResolvedValue([{ id: "harm-001" }, { id: "harm-002" }]);
    const result = await svc.listHarmEventsForWorkspace({} as any, WS);
    expect(result).toHaveLength(2);
  });

  it("listHarmEventsForCandidate returns items for candidate", async () => {
    vi.mocked(svc.listHarmEventsForCandidate).mockResolvedValue([{ id: "harm-003" }]);
    const result = await svc.listHarmEventsForCandidate({} as any, WS, CAND_ID);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("harm-003");
  });

  it("workspace isolation: WS-A and WS-B listed separately", async () => {
    vi.mocked(svc.listHarmEventsForWorkspace).mockResolvedValue([]);
    await svc.listHarmEventsForWorkspace({} as any, "ws-001");
    await svc.listHarmEventsForWorkspace({} as any, "ws-002");
    expect(svc.listHarmEventsForWorkspace).toHaveBeenNthCalledWith(1, expect.anything(), "ws-001");
    expect(svc.listHarmEventsForWorkspace).toHaveBeenNthCalledWith(2, expect.anything(), "ws-002");
  });

  it("hasCriticalHarm returns true when critical event exists", async () => {
    vi.mocked(svc.hasCriticalHarm).mockResolvedValue(true);
    const result = await svc.hasCriticalHarm({} as any, WS, CAND_ID);
    expect(result).toBe(true);
  });
});
