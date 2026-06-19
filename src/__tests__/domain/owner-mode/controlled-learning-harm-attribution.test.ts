import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import * as harmService from "@/services/controlled-learning-harm.service";
import * as attributionService from "@/services/controlled-learning-attribution.service";

const mockHarmEvent = { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() };
const mockAttributionReview = { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() };
const mockCandidate = { findFirst: vi.fn() };

const mockPrisma = {
  controlledLearningHarmEvent: mockHarmEvent,
  controlledLearningAttributionReview: mockAttributionReview,
  controlledLearningCandidate: mockCandidate,
} as unknown as PrismaClient;

const baseHarmInput = {
  workspaceId: "ws1",
  candidateId: "cand1",
  harmType: "FINANCIAL_LOSS",
  severity: "HIGH",
  detectedBy: "system",
  detectedAt: new Date("2026-06-19T10:00:00Z"),
  harmDescription: "Revenue dropped 20%",
};

const baseAttributionInput = {
  workspaceId: "ws1",
  candidateId: "cand1",
  harmEventId: "harm1",
  reviewedBy: "reviewer1",
  reviewedAt: new Date("2026-06-19T11:00:00Z"),
  verdict: "ATTRIBUTED",
  confidenceScore: 0.85,
  reviewNotes: "Clear causal link identified",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCandidate.findFirst.mockResolvedValue({ id: "cand1", workspaceId: "ws1" });
  mockHarmEvent.findFirst.mockResolvedValue({ id: "harm1", workspaceId: "ws1" });
  mockHarmEvent.create.mockResolvedValue({ id: "evt1", ...baseHarmInput });
  mockHarmEvent.update.mockResolvedValue({ id: "evt1", mitigated: true });
  mockHarmEvent.findMany.mockResolvedValue([]);
  mockAttributionReview.create.mockResolvedValue({ id: "rev1", ...baseAttributionInput });
  mockAttributionReview.findMany.mockResolvedValue([]);
});

describe("recordHarmEvent — harm type validation", () => {
  it("accepts FINANCIAL_LOSS", async () => {
    const r = await harmService.recordHarmEvent(mockPrisma, { ...baseHarmInput, harmType: "FINANCIAL_LOSS" });
    expect(r.recorded).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it("accepts DECISION_ERROR", async () => {
    const r = await harmService.recordHarmEvent(mockPrisma, { ...baseHarmInput, harmType: "DECISION_ERROR" });
    expect(r.recorded).toBe(true);
  });

  it("accepts DATA_CORRUPTION", async () => {
    const r = await harmService.recordHarmEvent(mockPrisma, { ...baseHarmInput, harmType: "DATA_CORRUPTION" });
    expect(r.recorded).toBe(true);
  });

  it("accepts COMPLIANCE_VIOLATION", async () => {
    const r = await harmService.recordHarmEvent(mockPrisma, { ...baseHarmInput, harmType: "COMPLIANCE_VIOLATION" });
    expect(r.recorded).toBe(true);
  });

  it("accepts SAFETY_RISK", async () => {
    const r = await harmService.recordHarmEvent(mockPrisma, { ...baseHarmInput, harmType: "SAFETY_RISK" });
    expect(r.recorded).toBe(true);
  });

  it("rejects invalid harmType", async () => {
    const r = await harmService.recordHarmEvent(mockPrisma, { ...baseHarmInput, harmType: "UNKNOWN_TYPE" });
    expect(r.recorded).toBe(false);
    expect(r.violations).toContain("Invalid harmType: UNKNOWN_TYPE");
  });
});

describe("recordHarmEvent — severity validation", () => {
  it("accepts LOW severity", async () => {
    const r = await harmService.recordHarmEvent(mockPrisma, { ...baseHarmInput, severity: "LOW" });
    expect(r.recorded).toBe(true);
  });

  it("accepts MEDIUM severity", async () => {
    const r = await harmService.recordHarmEvent(mockPrisma, { ...baseHarmInput, severity: "MEDIUM" });
    expect(r.recorded).toBe(true);
  });

  it("accepts HIGH severity", async () => {
    const r = await harmService.recordHarmEvent(mockPrisma, { ...baseHarmInput, severity: "HIGH" });
    expect(r.recorded).toBe(true);
  });

  it("accepts CRITICAL severity", async () => {
    const r = await harmService.recordHarmEvent(mockPrisma, { ...baseHarmInput, severity: "CRITICAL" });
    expect(r.recorded).toBe(true);
  });

  it("rejects invalid severity", async () => {
    const r = await harmService.recordHarmEvent(mockPrisma, { ...baseHarmInput, severity: "EXTREME" });
    expect(r.recorded).toBe(false);
    expect(r.violations).toContain("Invalid severity: EXTREME");
  });
});

describe("recordHarmEvent — candidate and creation", () => {
  it("returns violation when candidate not found", async () => {
    mockCandidate.findFirst.mockResolvedValue(null);
    const r = await harmService.recordHarmEvent(mockPrisma, baseHarmInput);
    expect(r.recorded).toBe(false);
    expect(r.violations).toContain("Candidate not found in workspace");
  });

  it("creates harm event and returns it", async () => {
    const r = await harmService.recordHarmEvent(mockPrisma, baseHarmInput);
    expect(r.recorded).toBe(true);
    expect(r.event).toBeDefined();
    expect(mockHarmEvent.create).toHaveBeenCalledOnce();
  });

  it("does not call create when validation fails", async () => {
    await harmService.recordHarmEvent(mockPrisma, { ...baseHarmInput, harmType: "BAD" });
    expect(mockHarmEvent.create).not.toHaveBeenCalled();
  });
});

describe("markHarmMitigated", () => {
  it("mitigates existing harm event", async () => {
    const r = await harmService.markHarmMitigated(mockPrisma, "ws1", "harm1", new Date());
    expect(r.mitigated).toBe(true);
    expect(r.violations).toHaveLength(0);
    expect(mockHarmEvent.update).toHaveBeenCalledOnce();
  });

  it("returns violation when harm event not found", async () => {
    mockHarmEvent.findFirst.mockResolvedValue(null);
    const r = await harmService.markHarmMitigated(mockPrisma, "ws1", "harm1", new Date());
    expect(r.mitigated).toBe(false);
    expect(r.violations).toContain("Harm event not found in workspace");
  });

  it("enforces workspace isolation — wrong workspace returns not found", async () => {
    mockHarmEvent.findFirst.mockImplementation(({ where }: any) => {
      if (where.workspaceId === "ws-other") return Promise.resolve(null);
      return Promise.resolve({ id: "harm1" });
    });
    const r = await harmService.markHarmMitigated(mockPrisma, "ws-other", "harm1", new Date());
    expect(r.mitigated).toBe(false);
  });
});

describe("listHarmEventsForCandidate", () => {
  it("returns array of events for candidate", async () => {
    const fakeEvents = [{ id: "e1" }, { id: "e2" }];
    mockHarmEvent.findMany.mockResolvedValue(fakeEvents);
    const result = await harmService.listHarmEventsForCandidate(mockPrisma, "ws1", "cand1");
    expect(result).toHaveLength(2);
  });

  it("queries by workspaceId and candidateId", async () => {
    await harmService.listHarmEventsForCandidate(mockPrisma, "ws1", "cand1");
    expect(mockHarmEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "ws1", candidateId: "cand1" }) })
    );
  });
});

describe("listHarmEventsForWorkspace", () => {
  it("returns array of events for workspace", async () => {
    const fakeEvents = [{ id: "e1" }, { id: "e2" }, { id: "e3" }];
    mockHarmEvent.findMany.mockResolvedValue(fakeEvents);
    const result = await harmService.listHarmEventsForWorkspace(mockPrisma, "ws1");
    expect(result).toHaveLength(3);
  });

  it("queries by workspaceId only", async () => {
    await harmService.listHarmEventsForWorkspace(mockPrisma, "ws1");
    expect(mockHarmEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws1" } })
    );
  });
});

describe("hasCriticalHarm", () => {
  it("returns true when CRITICAL event exists", async () => {
    mockHarmEvent.findFirst.mockResolvedValue({ id: "e1", severity: "CRITICAL" });
    const result = await harmService.hasCriticalHarm(mockPrisma, "ws1", "cand1");
    expect(result).toBe(true);
  });

  it("returns false when no CRITICAL event exists", async () => {
    mockHarmEvent.findFirst.mockResolvedValue(null);
    const result = await harmService.hasCriticalHarm(mockPrisma, "ws1", "cand1");
    expect(result).toBe(false);
  });

  it("queries with severity CRITICAL", async () => {
    mockHarmEvent.findFirst.mockResolvedValue(null);
    await harmService.hasCriticalHarm(mockPrisma, "ws1", "cand1");
    expect(mockHarmEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ severity: "CRITICAL" }) })
    );
  });
});

describe("recordAttributionReview — verdict validation", () => {
  it("accepts ATTRIBUTED verdict", async () => {
    const r = await attributionService.recordAttributionReview(mockPrisma, { ...baseAttributionInput, verdict: "ATTRIBUTED" });
    expect(r.recorded).toBe(true);
  });

  it("accepts NOT_ATTRIBUTED verdict", async () => {
    const r = await attributionService.recordAttributionReview(mockPrisma, { ...baseAttributionInput, verdict: "NOT_ATTRIBUTED" });
    expect(r.recorded).toBe(true);
  });

  it("accepts PARTIAL verdict", async () => {
    const r = await attributionService.recordAttributionReview(mockPrisma, { ...baseAttributionInput, verdict: "PARTIAL" });
    expect(r.recorded).toBe(true);
  });

  it("accepts INCONCLUSIVE verdict", async () => {
    const r = await attributionService.recordAttributionReview(mockPrisma, { ...baseAttributionInput, verdict: "INCONCLUSIVE" });
    expect(r.recorded).toBe(true);
  });

  it("rejects invalid verdict", async () => {
    const r = await attributionService.recordAttributionReview(mockPrisma, { ...baseAttributionInput, verdict: "GUILTY" });
    expect(r.recorded).toBe(false);
    expect(r.violations).toContain("Invalid verdict: GUILTY");
  });
});

describe("recordAttributionReview — confidenceScore validation", () => {
  it("accepts confidenceScore of 0.0", async () => {
    const r = await attributionService.recordAttributionReview(mockPrisma, { ...baseAttributionInput, confidenceScore: 0.0 });
    expect(r.recorded).toBe(true);
  });

  it("accepts confidenceScore of 1.0", async () => {
    const r = await attributionService.recordAttributionReview(mockPrisma, { ...baseAttributionInput, confidenceScore: 1.0 });
    expect(r.recorded).toBe(true);
  });

  it("accepts confidenceScore of 0.5", async () => {
    const r = await attributionService.recordAttributionReview(mockPrisma, { ...baseAttributionInput, confidenceScore: 0.5 });
    expect(r.recorded).toBe(true);
  });

  it("rejects confidenceScore of -0.1", async () => {
    const r = await attributionService.recordAttributionReview(mockPrisma, { ...baseAttributionInput, confidenceScore: -0.1 });
    expect(r.recorded).toBe(false);
    expect(r.violations).toContain("confidenceScore must be between 0.0 and 1.0");
  });

  it("rejects confidenceScore of 1.1", async () => {
    const r = await attributionService.recordAttributionReview(mockPrisma, { ...baseAttributionInput, confidenceScore: 1.1 });
    expect(r.recorded).toBe(false);
    expect(r.violations).toContain("confidenceScore must be between 0.0 and 1.0");
  });
});

describe("recordAttributionReview — entity existence checks", () => {
  it("returns violation when candidate not found", async () => {
    mockCandidate.findFirst.mockResolvedValue(null);
    const r = await attributionService.recordAttributionReview(mockPrisma, baseAttributionInput);
    expect(r.recorded).toBe(false);
    expect(r.violations).toContain("Candidate not found in workspace");
  });

  it("returns violation when harm event not found in workspace", async () => {
    mockHarmEvent.findFirst.mockResolvedValue(null);
    const r = await attributionService.recordAttributionReview(mockPrisma, baseAttributionInput);
    expect(r.recorded).toBe(false);
    expect(r.violations).toContain("Harm event not found in workspace");
  });

  it("creates review and returns it on success", async () => {
    const r = await attributionService.recordAttributionReview(mockPrisma, baseAttributionInput);
    expect(r.recorded).toBe(true);
    expect(r.review).toBeDefined();
    expect(mockAttributionReview.create).toHaveBeenCalledOnce();
  });

  it("does not call create when verdict is invalid", async () => {
    await attributionService.recordAttributionReview(mockPrisma, { ...baseAttributionInput, verdict: "BAD" });
    expect(mockAttributionReview.create).not.toHaveBeenCalled();
  });
});

describe("listAttributionReviewsForHarmEvent", () => {
  it("returns array of reviews for harm event", async () => {
    mockAttributionReview.findMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    const result = await attributionService.listAttributionReviewsForHarmEvent(mockPrisma, "ws1", "harm1");
    expect(result).toHaveLength(2);
  });

  it("queries by workspaceId and harmEventId", async () => {
    await attributionService.listAttributionReviewsForHarmEvent(mockPrisma, "ws1", "harm1");
    expect(mockAttributionReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "ws1", harmEventId: "harm1" }) })
    );
  });

  it("workspace isolation — different workspace returns empty", async () => {
    mockAttributionReview.findMany.mockImplementation(({ where }: any) => {
      if (where.workspaceId === "ws-other") return Promise.resolve([]);
      return Promise.resolve([{ id: "r1" }]);
    });
    const result = await attributionService.listAttributionReviewsForHarmEvent(mockPrisma, "ws-other", "harm1");
    expect(result).toHaveLength(0);
  });
});

describe("listAttributionReviewsForCandidate", () => {
  it("returns array of reviews for candidate", async () => {
    mockAttributionReview.findMany.mockResolvedValue([{ id: "r1" }]);
    const result = await attributionService.listAttributionReviewsForCandidate(mockPrisma, "ws1", "cand1");
    expect(result).toHaveLength(1);
  });

  it("queries by workspaceId and candidateId", async () => {
    await attributionService.listAttributionReviewsForCandidate(mockPrisma, "ws1", "cand1");
    expect(mockAttributionReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "ws1", candidateId: "cand1" }) })
    );
  });

  it("workspace isolation — different workspace returns empty", async () => {
    mockAttributionReview.findMany.mockImplementation(({ where }: any) => {
      if (where.workspaceId === "ws-other") return Promise.resolve([]);
      return Promise.resolve([{ id: "r1" }]);
    });
    const result = await attributionService.listAttributionReviewsForCandidate(mockPrisma, "ws-other", "cand1");
    expect(result).toHaveLength(0);
  });

  it("returns empty array when no reviews exist", async () => {
    mockAttributionReview.findMany.mockResolvedValue([]);
    const result = await attributionService.listAttributionReviewsForCandidate(mockPrisma, "ws1", "cand1");
    expect(result).toHaveLength(0);
  });
});
