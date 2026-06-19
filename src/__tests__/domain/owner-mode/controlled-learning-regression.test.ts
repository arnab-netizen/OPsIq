import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  recordRegressionResult,
  listRegressionResultsForCandidate,
  listRegressionResultsForWorkspace,
  hasRegression,
} from "@/services/controlled-learning-regression.service";

const mockCreate = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockCandidateFindFirst = vi.fn();

const mockPrisma = {
  controlledLearningRegressionResult: {
    create: mockCreate,
    findFirst: mockFindFirst,
    findMany: mockFindMany,
  },
  controlledLearningCandidate: {
    findFirst: mockCandidateFindFirst,
  },
} as unknown as PrismaClient;

const W = "workspace-1";
const C = "candidate-1";
const NOW = new Date("2026-06-19T10:00:00Z");

const validInput = {
  workspaceId: W,
  candidateId: C,
  testRunId: "run-001",
  testVerdict: "PASS" as const,
  regressionScore: 0.05,
  testedBy: "tester-1",
  testedAt: NOW,
  testNotes: "All regression tests passed.",
};

const mockResult = {
  id: "result-1",
  workspaceId: W,
  candidateId: C,
  testRunId: "run-001",
  testVerdict: "PASS",
  regressionScore: 0.05,
  testedBy: "tester-1",
  testedAt: NOW,
  testNotes: "All regression tests passed.",
  createdAt: NOW,
  updatedAt: NOW,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────
// recordRegressionResult — PASS verdict
// ────────────────────────────────────────────────────────
describe("recordRegressionResult — PASS verdict", () => {
  it("records a PASS result when candidate exists", async () => {
    mockCandidateFindFirst.mockResolvedValue({ id: C, workspaceId: W });
    mockCreate.mockResolvedValue(mockResult);
    const out = await recordRegressionResult(mockPrisma, validInput);
    expect(out.recorded).toBe(true);
    expect(out.violations).toHaveLength(0);
    expect(out.result?.testVerdict).toBe("PASS");
  });

  it("passes workspaceId and candidateId to create", async () => {
    mockCandidateFindFirst.mockResolvedValue({ id: C, workspaceId: W });
    mockCreate.mockResolvedValue(mockResult);
    await recordRegressionResult(mockPrisma, validInput);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: W, candidateId: C }) })
    );
  });

  it("passes testRunId and regressionScore to create", async () => {
    mockCandidateFindFirst.mockResolvedValue({ id: C, workspaceId: W });
    mockCreate.mockResolvedValue(mockResult);
    await recordRegressionResult(mockPrisma, validInput);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ testRunId: "run-001", regressionScore: 0.05 }) })
    );
  });
});

// ────────────────────────────────────────────────────────
// recordRegressionResult — FAIL verdict
// ────────────────────────────────────────────────────────
describe("recordRegressionResult — FAIL verdict", () => {
  it("records a FAIL result", async () => {
    const failResult = { ...mockResult, testVerdict: "FAIL", regressionScore: 0.9 };
    mockCandidateFindFirst.mockResolvedValue({ id: C, workspaceId: W });
    mockCreate.mockResolvedValue(failResult);
    const out = await recordRegressionResult(mockPrisma, { ...validInput, testVerdict: "FAIL", regressionScore: 0.9 });
    expect(out.recorded).toBe(true);
    expect(out.result?.testVerdict).toBe("FAIL");
    expect(out.result?.regressionScore).toBe(0.9);
  });

  it("records score of exactly 1.0 for FAIL", async () => {
    const failResult = { ...mockResult, testVerdict: "FAIL", regressionScore: 1.0 };
    mockCandidateFindFirst.mockResolvedValue({ id: C, workspaceId: W });
    mockCreate.mockResolvedValue(failResult);
    const out = await recordRegressionResult(mockPrisma, { ...validInput, testVerdict: "FAIL", regressionScore: 1.0 });
    expect(out.recorded).toBe(true);
    expect(out.violations).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────
// recordRegressionResult — INCONCLUSIVE verdict
// ────────────────────────────────────────────────────────
describe("recordRegressionResult — INCONCLUSIVE verdict", () => {
  it("records an INCONCLUSIVE result", async () => {
    const inc = { ...mockResult, testVerdict: "INCONCLUSIVE", regressionScore: 0.5 };
    mockCandidateFindFirst.mockResolvedValue({ id: C, workspaceId: W });
    mockCreate.mockResolvedValue(inc);
    const out = await recordRegressionResult(mockPrisma, { ...validInput, testVerdict: "INCONCLUSIVE", regressionScore: 0.5 });
    expect(out.recorded).toBe(true);
    expect(out.result?.testVerdict).toBe("INCONCLUSIVE");
  });

  it("INCONCLUSIVE allows score of 0.5", async () => {
    const inc = { ...mockResult, testVerdict: "INCONCLUSIVE", regressionScore: 0.5 };
    mockCandidateFindFirst.mockResolvedValue({ id: C, workspaceId: W });
    mockCreate.mockResolvedValue(inc);
    const out = await recordRegressionResult(mockPrisma, { ...validInput, testVerdict: "INCONCLUSIVE", regressionScore: 0.5 });
    expect(out.violations).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────
// recordRegressionResult — invalid verdict
// ────────────────────────────────────────────────────────
describe("recordRegressionResult — invalid verdict", () => {
  it("rejects an invalid verdict string", async () => {
    const out = await recordRegressionResult(mockPrisma, { ...validInput, testVerdict: "UNKNOWN" as any });
    expect(out.recorded).toBe(false);
    expect(out.violations.some((v) => v.includes("testVerdict"))).toBe(true);
  });

  it("does not call create on invalid verdict", async () => {
    await recordRegressionResult(mockPrisma, { ...validInput, testVerdict: "INVALID" as any });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects lowercase verdict", async () => {
    const out = await recordRegressionResult(mockPrisma, { ...validInput, testVerdict: "pass" as any });
    expect(out.recorded).toBe(false);
    expect(out.violations.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────
// recordRegressionResult — score validation
// ────────────────────────────────────────────────────────
describe("recordRegressionResult — score validation", () => {
  it("rejects score below 0", async () => {
    const out = await recordRegressionResult(mockPrisma, { ...validInput, regressionScore: -0.1 });
    expect(out.recorded).toBe(false);
    expect(out.violations.some((v) => v.includes("regressionScore"))).toBe(true);
  });

  it("rejects score above 1", async () => {
    const out = await recordRegressionResult(mockPrisma, { ...validInput, regressionScore: 1.01 });
    expect(out.recorded).toBe(false);
    expect(out.violations.some((v) => v.includes("regressionScore"))).toBe(true);
  });

  it("allows score of exactly 0.0", async () => {
    mockCandidateFindFirst.mockResolvedValue({ id: C, workspaceId: W });
    mockCreate.mockResolvedValue({ ...mockResult, regressionScore: 0.0 });
    const out = await recordRegressionResult(mockPrisma, { ...validInput, regressionScore: 0.0 });
    expect(out.recorded).toBe(true);
  });

  it("allows score of exactly 1.0", async () => {
    mockCandidateFindFirst.mockResolvedValue({ id: C, workspaceId: W });
    mockCreate.mockResolvedValue({ ...mockResult, regressionScore: 1.0 });
    const out = await recordRegressionResult(mockPrisma, { ...validInput, regressionScore: 1.0 });
    expect(out.recorded).toBe(true);
  });

  it("rejects NaN score", async () => {
    const out = await recordRegressionResult(mockPrisma, { ...validInput, regressionScore: NaN });
    expect(out.recorded).toBe(false);
    expect(out.violations.some((v) => v.includes("regressionScore"))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────
// recordRegressionResult — candidate not found
// ────────────────────────────────────────────────────────
describe("recordRegressionResult — candidate not found", () => {
  it("returns violation when candidate not found", async () => {
    mockCandidateFindFirst.mockResolvedValue(null);
    const out = await recordRegressionResult(mockPrisma, validInput);
    expect(out.recorded).toBe(false);
    expect(out.violations.some((v) => v.includes("not found"))).toBe(true);
  });

  it("does not call create when candidate not found", async () => {
    mockCandidateFindFirst.mockResolvedValue(null);
    await recordRegressionResult(mockPrisma, validInput);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("workspace-scopes candidate lookup", async () => {
    mockCandidateFindFirst.mockResolvedValue(null);
    await recordRegressionResult(mockPrisma, { ...validInput, workspaceId: "ws-other" });
    expect(mockCandidateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "ws-other" }) })
    );
  });
});

// ────────────────────────────────────────────────────────
// hasRegression
// ────────────────────────────────────────────────────────
describe("hasRegression", () => {
  it("returns true when a FAIL result exists", async () => {
    mockFindFirst.mockResolvedValue({ id: "r1", testVerdict: "FAIL" });
    const result = await hasRegression(mockPrisma, W, C);
    expect(result).toBe(true);
  });

  it("returns false when no FAIL result exists", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await hasRegression(mockPrisma, W, C);
    expect(result).toBe(false);
  });

  it("queries only FAIL verdict", async () => {
    mockFindFirst.mockResolvedValue(null);
    await hasRegression(mockPrisma, W, C);
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ testVerdict: "FAIL" }) })
    );
  });

  it("scopes query to workspaceId", async () => {
    mockFindFirst.mockResolvedValue(null);
    await hasRegression(mockPrisma, "ws-xyz", C);
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "ws-xyz" }) })
    );
  });

  it("scopes query to candidateId", async () => {
    mockFindFirst.mockResolvedValue(null);
    await hasRegression(mockPrisma, W, "cand-abc");
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ candidateId: "cand-abc" }) })
    );
  });
});

// ────────────────────────────────────────────────────────
// listRegressionResultsForCandidate
// ────────────────────────────────────────────────────────
describe("listRegressionResultsForCandidate", () => {
  it("returns results when candidate exists in workspace", async () => {
    mockCandidateFindFirst.mockResolvedValue({ id: C, workspaceId: W });
    mockFindMany.mockResolvedValue([mockResult]);
    const results = await listRegressionResultsForCandidate(mockPrisma, W, C);
    expect(results).toHaveLength(1);
    expect(results[0].testVerdict).toBe("PASS");
  });

  it("returns empty array when candidate not found in workspace", async () => {
    mockCandidateFindFirst.mockResolvedValue(null);
    const results = await listRegressionResultsForCandidate(mockPrisma, W, C);
    expect(results).toHaveLength(0);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("orders results by testedAt desc", async () => {
    mockCandidateFindFirst.mockResolvedValue({ id: C, workspaceId: W });
    mockFindMany.mockResolvedValue([]);
    await listRegressionResultsForCandidate(mockPrisma, W, C);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { testedAt: "desc" } })
    );
  });

  it("scopes findMany to workspaceId and candidateId", async () => {
    mockCandidateFindFirst.mockResolvedValue({ id: C, workspaceId: W });
    mockFindMany.mockResolvedValue([]);
    await listRegressionResultsForCandidate(mockPrisma, W, C);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: W, candidateId: C } })
    );
  });

  it("does not return results from a different workspace", async () => {
    mockCandidateFindFirst.mockResolvedValue(null); // candidate not in "ws-other"
    const results = await listRegressionResultsForCandidate(mockPrisma, "ws-other", C);
    expect(results).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────
// listRegressionResultsForWorkspace
// ────────────────────────────────────────────────────────
describe("listRegressionResultsForWorkspace", () => {
  it("returns all results for workspace", async () => {
    const results = [mockResult, { ...mockResult, id: "r2", testVerdict: "FAIL" }];
    mockFindMany.mockResolvedValue(results);
    const out = await listRegressionResultsForWorkspace(mockPrisma, W);
    expect(out).toHaveLength(2);
  });

  it("orders by testedAt desc", async () => {
    mockFindMany.mockResolvedValue([]);
    await listRegressionResultsForWorkspace(mockPrisma, W);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { testedAt: "desc" } })
    );
  });

  it("scopes query to workspaceId", async () => {
    mockFindMany.mockResolvedValue([]);
    await listRegressionResultsForWorkspace(mockPrisma, "ws-target");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws-target" } })
    );
  });

  it("returns empty array when no results exist", async () => {
    mockFindMany.mockResolvedValue([]);
    const out = await listRegressionResultsForWorkspace(mockPrisma, W);
    expect(out).toHaveLength(0);
  });
});
