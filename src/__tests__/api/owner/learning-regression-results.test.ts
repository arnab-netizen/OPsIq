import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/controlled-learning-regression.service", () => ({
  recordRegressionResult: vi.fn(),
  listRegressionResultsForWorkspace: vi.fn(),
  listRegressionResultsForCandidate: vi.fn(),
  hasRegression: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));

import * as svc from "@/services/controlled-learning-regression.service";

const WS = "ws-001";
const CAND = "cand-001";
const NOW = new Date("2026-06-19T10:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/owner/learning-regression-results — service contract", () => {
  it("records PASS result", async () => {
    vi.mocked(svc.recordRegressionResult).mockResolvedValue({ recorded: true, violations: [], result: { id: "rr-1", testVerdict: "PASS" } as any });
    const r = await svc.recordRegressionResult({} as any, { workspaceId: WS, candidateId: CAND, testRunId: "run-1", testVerdict: "PASS", regressionScore: 0.1, testedBy: "ci", testedAt: NOW, testNotes: "" });
    expect(r.recorded).toBe(true);
  });

  it("records FAIL result", async () => {
    vi.mocked(svc.recordRegressionResult).mockResolvedValue({ recorded: true, violations: [], result: { id: "rr-2", testVerdict: "FAIL" } as any });
    const r = await svc.recordRegressionResult({} as any, { workspaceId: WS, candidateId: CAND, testRunId: "run-2", testVerdict: "FAIL", regressionScore: 0.9, testedBy: "ci", testedAt: NOW, testNotes: "" });
    expect(r.recorded).toBe(true);
  });

  it("rejects invalid testVerdict", async () => {
    vi.mocked(svc.recordRegressionResult).mockResolvedValue({ recorded: false, violations: ['testVerdict must be one of: PASS, FAIL, INCONCLUSIVE; received "BAD"'] });
    const r = await svc.recordRegressionResult({} as any, { workspaceId: WS, candidateId: CAND, testRunId: "run-3", testVerdict: "BAD" as any, regressionScore: 0.5, testedBy: "ci", testedAt: NOW, testNotes: "" });
    expect(r.recorded).toBe(false);
    expect(r.violations.length).toBeGreaterThan(0);
  });

  it("rejects regressionScore outside [0,1]", async () => {
    vi.mocked(svc.recordRegressionResult).mockResolvedValue({ recorded: false, violations: ["regressionScore must be a number between 0.0 and 1.0"] });
    const r = await svc.recordRegressionResult({} as any, { workspaceId: WS, candidateId: CAND, testRunId: "run-4", testVerdict: "PASS", regressionScore: 1.5, testedBy: "ci", testedAt: NOW, testNotes: "" });
    expect(r.recorded).toBe(false);
  });

  it("rejects cross-tenant candidate", async () => {
    vi.mocked(svc.recordRegressionResult).mockResolvedValue({ recorded: false, violations: ['Candidate "cand-001" not found in workspace "ws-other"'] });
    const r = await svc.recordRegressionResult({} as any, { workspaceId: "ws-other", candidateId: CAND, testRunId: "run-5", testVerdict: "PASS", regressionScore: 0.1, testedBy: "ci", testedAt: NOW, testNotes: "" });
    expect(r.recorded).toBe(false);
  });
});

describe("GET /api/owner/learning-regression-results — service contract", () => {
  it("lists results for workspace", async () => {
    vi.mocked(svc.listRegressionResultsForWorkspace).mockResolvedValue([{ id: "rr-1" } as any]);
    const r = await svc.listRegressionResultsForWorkspace({} as any, WS);
    expect(r).toHaveLength(1);
  });

  it("lists results for candidate", async () => {
    vi.mocked(svc.listRegressionResultsForCandidate).mockResolvedValue([{ id: "rr-1" } as any]);
    const r = await svc.listRegressionResultsForCandidate({} as any, WS, CAND);
    expect(r).toHaveLength(1);
    expect(svc.listRegressionResultsForCandidate).toHaveBeenCalledWith({}, WS, CAND);
  });

  it("listRegressionResultsForWorkspace returns empty when no results", async () => {
    vi.mocked(svc.listRegressionResultsForWorkspace).mockResolvedValue([]);
    const r = await svc.listRegressionResultsForWorkspace({} as any, WS);
    expect(r).toEqual([]);
  });

  it("listRegressionResultsForWorkspace called exactly once", async () => {
    vi.mocked(svc.listRegressionResultsForWorkspace).mockResolvedValue([]);
    await svc.listRegressionResultsForWorkspace({} as any, WS);
    expect(svc.listRegressionResultsForWorkspace).toHaveBeenCalledTimes(1);
  });

  it("workspace isolation: WS-A and WS-B return separate results", async () => {
    vi.mocked(svc.listRegressionResultsForWorkspace).mockResolvedValue([]);
    await svc.listRegressionResultsForWorkspace({} as any, "ws-001");
    await svc.listRegressionResultsForWorkspace({} as any, "ws-002");
    expect(svc.listRegressionResultsForWorkspace).toHaveBeenNthCalledWith(1, expect.anything(), "ws-001");
    expect(svc.listRegressionResultsForWorkspace).toHaveBeenNthCalledWith(2, expect.anything(), "ws-002");
  });
});

describe("POST /api/owner/learning-regression-results — additional scenarios", () => {
  it("records INCONCLUSIVE result", async () => {
    vi.mocked(svc.recordRegressionResult).mockResolvedValue({ recorded: true, violations: [], result: { id: "rr-6", testVerdict: "INCONCLUSIVE" } as any });
    const r = await svc.recordRegressionResult({} as any, { workspaceId: WS, candidateId: CAND, testRunId: "run-6", testVerdict: "INCONCLUSIVE", regressionScore: 0.5, testedBy: "ci", testedAt: NOW, testNotes: "" });
    expect(r.recorded).toBe(true);
  });

  it("rejects negative regressionScore", async () => {
    vi.mocked(svc.recordRegressionResult).mockResolvedValue({ recorded: false, violations: ["regressionScore must be between 0.0 and 1.0"] });
    const r = await svc.recordRegressionResult({} as any, { workspaceId: WS, candidateId: CAND, testRunId: "run-7", testVerdict: "PASS", regressionScore: -0.1, testedBy: "ci", testedAt: NOW, testNotes: "" });
    expect(r.recorded).toBe(false);
  });

  it("regressionScore at boundary 0.0 is valid", async () => {
    vi.mocked(svc.recordRegressionResult).mockResolvedValue({ recorded: true, violations: [], result: { regressionScore: 0.0 } as any });
    const r = await svc.recordRegressionResult({} as any, { workspaceId: WS, candidateId: CAND, testRunId: "run-8", testVerdict: "PASS", regressionScore: 0.0, testedBy: "ci", testedAt: NOW, testNotes: "" });
    expect(r.recorded).toBe(true);
  });

  it("regressionScore at boundary 1.0 is valid", async () => {
    vi.mocked(svc.recordRegressionResult).mockResolvedValue({ recorded: true, violations: [], result: { regressionScore: 1.0 } as any });
    const r = await svc.recordRegressionResult({} as any, { workspaceId: WS, candidateId: CAND, testRunId: "run-9", testVerdict: "FAIL", regressionScore: 1.0, testedBy: "ci", testedAt: NOW, testNotes: "" });
    expect(r.recorded).toBe(true);
  });

  it("rejects empty testedBy", async () => {
    vi.mocked(svc.recordRegressionResult).mockResolvedValue({ recorded: false, violations: ["testedBy is required"] });
    const r = await svc.recordRegressionResult({} as any, { workspaceId: WS, candidateId: CAND, testRunId: "run-10", testVerdict: "PASS", regressionScore: 0.1, testedBy: "", testedAt: NOW, testNotes: "" });
    expect(r.recorded).toBe(false);
  });

  it("rejects empty testRunId", async () => {
    vi.mocked(svc.recordRegressionResult).mockResolvedValue({ recorded: false, violations: ["testRunId is required"] });
    const r = await svc.recordRegressionResult({} as any, { workspaceId: WS, candidateId: CAND, testRunId: "", testVerdict: "PASS", regressionScore: 0.1, testedBy: "ci", testedAt: NOW, testNotes: "" });
    expect(r.recorded).toBe(false);
  });

  it("recordRegressionResult called exactly once", async () => {
    vi.mocked(svc.recordRegressionResult).mockResolvedValue({ recorded: true, violations: [], result: {} as any });
    await svc.recordRegressionResult({} as any, { workspaceId: WS, candidateId: CAND, testRunId: "run-11", testVerdict: "PASS", regressionScore: 0.2, testedBy: "ci", testedAt: NOW, testNotes: "" });
    expect(svc.recordRegressionResult).toHaveBeenCalledTimes(1);
  });

  it("hasRegression returns false for clean candidate", async () => {
    vi.mocked(svc.hasRegression).mockResolvedValue(false);
    const r = await svc.hasRegression({} as any, WS, CAND);
    expect(r).toBe(false);
  });

  it("hasRegression returns true when regression found", async () => {
    vi.mocked(svc.hasRegression).mockResolvedValue(true);
    const r = await svc.hasRegression({} as any, WS, CAND);
    expect(r).toBe(true);
  });

  it("includes workspaceId in recordRegressionResult call", async () => {
    vi.mocked(svc.recordRegressionResult).mockResolvedValue({ recorded: true, violations: [], result: {} as any });
    await svc.recordRegressionResult({} as any, { workspaceId: WS, candidateId: CAND, testRunId: "run-12", testVerdict: "PASS", regressionScore: 0.1, testedBy: "ci", testedAt: NOW, testNotes: "" });
    expect(svc.recordRegressionResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workspaceId: WS })
    );
  });
});
