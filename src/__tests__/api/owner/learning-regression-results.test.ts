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
});
