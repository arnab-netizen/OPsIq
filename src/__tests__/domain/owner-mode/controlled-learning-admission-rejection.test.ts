import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  admitCandidate,
  getAdmission,
  listAdmissionsForWorkspace,
} from "@/services/controlled-learning-admission.service";
import {
  rejectCandidateFinal,
  getRejection,
  listRejectionsForWorkspace,
} from "@/services/controlled-learning-rejection.service";

const makeCandidate = (overrides: object = {}) => ({
  id: "cand-1",
  workspaceId: "ws-1",
  eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
  ...overrides,
});

const makeAdmission = (overrides: object = {}) => ({
  id: "adm-1",
  workspaceId: "ws-1",
  candidateId: "cand-1",
  admittedBy: "user-1",
  admittedAt: new Date("2026-06-19T00:00:00Z"),
  sourceLabel: "outcome-review",
  evidenceOrigin: "KPI-drop",
  eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
  admissionNotes: "Solid evidence",
  ...overrides,
});

const makeRejection = (overrides: object = {}) => ({
  id: "rej-1",
  workspaceId: "ws-1",
  candidateId: "cand-1",
  rejectedBy: "user-1",
  rejectedAt: new Date("2026-06-19T00:00:00Z"),
  rejectionReason: "Insufficient evidence",
  rejectionCode: "EVIDENCE_WEAK",
  ...overrides,
});

const makeMockPrisma = () =>
  ({
    controlledLearningAdmission: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    controlledLearningRejection: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    controlledLearningCandidate: {
      findFirst: vi.fn(),
    },
    controlledLearningReview: {
      findFirst: vi.fn(),
    },
    controlledLearningHarmEvent: {
      findFirst: vi.fn(),
    },
    controlledLearningCandidateAuditEntry: {
      create: vi.fn().mockResolvedValue({}),
    },
  }) as unknown as PrismaClient;

// ── ADMISSION TESTS ───────────────────────────────────────────────────────────

describe("admitCandidate", () => {
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
  });

  it("succeeds when candidate is LEARNING_ELIGIBLE_ and not already admitted", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue({ id: "rev-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(null);
    const admissionRecord = makeAdmission();
    (mockPrisma as any).controlledLearningAdmission.create.mockResolvedValue(admissionRecord);

    const result = await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-1",
      admittedAt: new Date("2026-06-19T00:00:00Z"),
      sourceLabel: "outcome-review",
      evidenceOrigin: "KPI-drop",
      eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
      admissionNotes: "Solid evidence",
    });

    expect(result.admitted).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.admission).toEqual(admissionRecord);
  });

  it("succeeds with LEARNING_ELIGIBLE_MEDIUM status", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(
      makeCandidate({ eligibilityStatus: "LEARNING_ELIGIBLE_HUMAN_REVIEWED" })
    );
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue({ id: "rev-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.create.mockResolvedValue(
      makeAdmission({ eligibilityStatus: "LEARNING_ELIGIBLE_HUMAN_REVIEWED" })
    );

    const result = await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-1",
      admittedAt: new Date(),
      sourceLabel: "outcome-review",
      evidenceOrigin: "KPI-drop",
      eligibilityStatus: "LEARNING_ELIGIBLE_HUMAN_REVIEWED",
      admissionNotes: "Moderate evidence",
    });

    expect(result.admitted).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("returns violation when candidate not found", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);

    const result = await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-missing",
      admittedBy: "user-1",
      admittedAt: new Date(),
      sourceLabel: "outcome-review",
      evidenceOrigin: "KPI-drop",
      eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
      admissionNotes: "Notes",
    });

    expect(result.admitted).toBe(false);
    expect(result.violations).toContain("Candidate not found or wrong workspace");
  });

  it("returns violation when eligibility status is LEARNING_INELIGIBLE_*", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(
      makeCandidate({ eligibilityStatus: "LEARNING_INELIGIBLE_LOW_EVIDENCE" })
    );

    const result = await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-1",
      admittedAt: new Date(),
      sourceLabel: "outcome-review",
      evidenceOrigin: "KPI-drop",
      eligibilityStatus: "LEARNING_INELIGIBLE_LOW_EVIDENCE",
      admissionNotes: "Notes",
    });

    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("LEARNING_INELIGIBLE_LOW_EVIDENCE");
  });

  it("returns violation when eligibility status is PENDING", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(
      makeCandidate({ eligibilityStatus: "PENDING" })
    );

    const result = await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-1",
      admittedAt: new Date(),
      sourceLabel: "label",
      evidenceOrigin: "origin",
      eligibilityStatus: "PENDING",
      admissionNotes: "Notes",
    });

    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("PENDING");
  });

  it("returns violation when candidate already admitted", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue({ id: "rev-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(makeAdmission());

    const result = await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-2",
      admittedAt: new Date(),
      sourceLabel: "label",
      evidenceOrigin: "origin",
      admissionNotes: "Duplicate",
    });

    expect(result.admitted).toBe(false);
    expect(result.violations).toContain("Candidate already admitted");
  });

  it("does not create admission record when candidate not found", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);

    await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-missing",
      admittedBy: "user-1",
      admittedAt: new Date(),
      sourceLabel: "label",
      evidenceOrigin: "origin",
      eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
      admissionNotes: "Notes",
    });

    expect((mockPrisma as any).controlledLearningAdmission.create).not.toHaveBeenCalled();
  });

  it("does not create admission record on ineligible status", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(
      makeCandidate({ eligibilityStatus: "LEARNING_INELIGIBLE_DUPLICATE" })
    );

    await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-1",
      admittedAt: new Date(),
      sourceLabel: "label",
      evidenceOrigin: "origin",
      eligibilityStatus: "LEARNING_INELIGIBLE_DUPLICATE",
      admissionNotes: "Notes",
    });

    expect((mockPrisma as any).controlledLearningAdmission.create).not.toHaveBeenCalled();
  });

  it("enforces workspace isolation — cross-tenant candidate not found", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);

    const result = await admitCandidate(mockPrisma, {
      workspaceId: "ws-attacker",
      candidateId: "cand-1",
      admittedBy: "user-attacker",
      admittedAt: new Date(),
      sourceLabel: "label",
      evidenceOrigin: "origin",
      eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
      admissionNotes: "Notes",
    });

    expect(result.admitted).toBe(false);
    expect(result.violations).toContain("Candidate not found or wrong workspace");
    expect((mockPrisma as any).controlledLearningCandidate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cand-1", workspaceId: "ws-attacker" } })
    );
  });

  it("passes workspaceId to admission create", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue({ id: "rev-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.create.mockResolvedValue(makeAdmission());

    await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-1",
      admittedAt: new Date("2026-06-19T00:00:00Z"),
      sourceLabel: "outcome-review",
      evidenceOrigin: "KPI-drop",
      eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
      admissionNotes: "Solid evidence",
    });

    expect((mockPrisma as any).controlledLearningAdmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: "ws-1" }),
      })
    );
  });

  it("result admission is undefined on failure", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);

    const result = await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-missing",
      admittedBy: "user-1",
      admittedAt: new Date(),
      sourceLabel: "label",
      evidenceOrigin: "origin",
      eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
      admissionNotes: "Notes",
    });

    expect(result.admission).toBeUndefined();
  });
});

// ── getAdmission ──────────────────────────────────────────────────────────────

describe("getAdmission", () => {
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
  });

  it("returns admission when found", async () => {
    const record = makeAdmission();
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(record);

    const result = await getAdmission(mockPrisma, "ws-1", "cand-1");
    expect(result).toEqual(record);
  });

  it("returns null when not found", async () => {
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(null);

    const result = await getAdmission(mockPrisma, "ws-1", "cand-99");
    expect(result).toBeNull();
  });

  it("queries with correct workspaceId and candidateId", async () => {
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(null);

    await getAdmission(mockPrisma, "ws-2", "cand-5");
    expect((mockPrisma as any).controlledLearningAdmission.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: "ws-2", candidateId: "cand-5" },
    });
  });
});

// ── listAdmissionsForWorkspace ────────────────────────────────────────────────

describe("listAdmissionsForWorkspace", () => {
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
  });

  it("returns all admissions for workspace", async () => {
    const records = [makeAdmission(), makeAdmission({ id: "adm-2", candidateId: "cand-2" })];
    (mockPrisma as any).controlledLearningAdmission.findMany.mockResolvedValue(records);

    const result = await listAdmissionsForWorkspace(mockPrisma, "ws-1");
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no admissions", async () => {
    (mockPrisma as any).controlledLearningAdmission.findMany.mockResolvedValue([]);

    const result = await listAdmissionsForWorkspace(mockPrisma, "ws-empty");
    expect(result).toHaveLength(0);
  });

  it("queries with correct workspaceId", async () => {
    (mockPrisma as any).controlledLearningAdmission.findMany.mockResolvedValue([]);

    await listAdmissionsForWorkspace(mockPrisma, "ws-specific");
    expect((mockPrisma as any).controlledLearningAdmission.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-specific" },
    });
  });
});

// ── REJECTION TESTS ───────────────────────────────────────────────────────────

describe("rejectCandidateFinal", () => {
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
  });

  it("succeeds when candidate found, not rejected, not admitted", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningRejection.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(null);
    const rejectionRecord = makeRejection();
    (mockPrisma as any).controlledLearningRejection.create.mockResolvedValue(rejectionRecord);

    const result = await rejectCandidateFinal(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      rejectedBy: "user-1",
      rejectedAt: new Date("2026-06-19T00:00:00Z"),
      rejectionReason: "Insufficient evidence",
      rejectionCode: "EVIDENCE_WEAK",
    });

    expect(result.rejected).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.rejection).toEqual(rejectionRecord);
  });

  it("returns violation when candidate not found", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);

    const result = await rejectCandidateFinal(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-missing",
      rejectedBy: "user-1",
      rejectedAt: new Date(),
      rejectionReason: "reason",
      rejectionCode: "CODE",
    });

    expect(result.rejected).toBe(false);
    expect(result.violations).toContain("Candidate not found or wrong workspace");
  });

  it("returns violation when candidate already rejected", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningRejection.findFirst.mockResolvedValue(makeRejection());

    const result = await rejectCandidateFinal(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      rejectedBy: "user-2",
      rejectedAt: new Date(),
      rejectionReason: "Duplicate rejection",
      rejectionCode: "DUPLICATE",
    });

    expect(result.rejected).toBe(false);
    expect(result.violations).toContain("Candidate already rejected");
  });

  it("returns violation when candidate already admitted", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningRejection.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(makeAdmission());

    const result = await rejectCandidateFinal(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      rejectedBy: "user-1",
      rejectedAt: new Date(),
      rejectionReason: "Changed mind",
      rejectionCode: "POST_ADMIT",
    });

    expect(result.rejected).toBe(false);
    expect(result.violations[0]).toContain("already admitted");
  });

  it("does not create rejection record when candidate not found", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);

    await rejectCandidateFinal(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-missing",
      rejectedBy: "user-1",
      rejectedAt: new Date(),
      rejectionReason: "reason",
      rejectionCode: "CODE",
    });

    expect((mockPrisma as any).controlledLearningRejection.create).not.toHaveBeenCalled();
  });

  it("does not create rejection record when already rejected", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningRejection.findFirst.mockResolvedValue(makeRejection());

    await rejectCandidateFinal(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      rejectedBy: "user-2",
      rejectedAt: new Date(),
      rejectionReason: "reason",
      rejectionCode: "CODE",
    });

    expect((mockPrisma as any).controlledLearningRejection.create).not.toHaveBeenCalled();
  });

  it("does not create rejection record when already admitted", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningRejection.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(makeAdmission());

    await rejectCandidateFinal(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      rejectedBy: "user-1",
      rejectedAt: new Date(),
      rejectionReason: "reason",
      rejectionCode: "CODE",
    });

    expect((mockPrisma as any).controlledLearningRejection.create).not.toHaveBeenCalled();
  });

  it("enforces workspace isolation — cross-tenant candidate not found", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);

    const result = await rejectCandidateFinal(mockPrisma, {
      workspaceId: "ws-attacker",
      candidateId: "cand-1",
      rejectedBy: "attacker",
      rejectedAt: new Date(),
      rejectionReason: "reason",
      rejectionCode: "CODE",
    });

    expect(result.rejected).toBe(false);
    expect(result.violations).toContain("Candidate not found or wrong workspace");
    expect((mockPrisma as any).controlledLearningCandidate.findFirst).toHaveBeenCalledWith({
      where: { id: "cand-1", workspaceId: "ws-attacker" },
    });
  });

  it("passes workspaceId to rejection create", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningRejection.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningRejection.create.mockResolvedValue(makeRejection());

    await rejectCandidateFinal(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      rejectedBy: "user-1",
      rejectedAt: new Date(),
      rejectionReason: "reason",
      rejectionCode: "CODE",
    });

    expect((mockPrisma as any).controlledLearningRejection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: "ws-1" }),
      })
    );
  });

  it("result rejection is undefined on failure", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);

    const result = await rejectCandidateFinal(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-missing",
      rejectedBy: "user-1",
      rejectedAt: new Date(),
      rejectionReason: "reason",
      rejectionCode: "CODE",
    });

    expect(result.rejection).toBeUndefined();
  });
});

// ── getRejection ──────────────────────────────────────────────────────────────

describe("getRejection", () => {
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
  });

  it("returns rejection when found", async () => {
    const record = makeRejection();
    (mockPrisma as any).controlledLearningRejection.findFirst.mockResolvedValue(record);

    const result = await getRejection(mockPrisma, "ws-1", "cand-1");
    expect(result).toEqual(record);
  });

  it("returns null when not found", async () => {
    (mockPrisma as any).controlledLearningRejection.findFirst.mockResolvedValue(null);

    const result = await getRejection(mockPrisma, "ws-1", "cand-99");
    expect(result).toBeNull();
  });

  it("queries with correct workspaceId and candidateId", async () => {
    (mockPrisma as any).controlledLearningRejection.findFirst.mockResolvedValue(null);

    await getRejection(mockPrisma, "ws-3", "cand-7");
    expect((mockPrisma as any).controlledLearningRejection.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: "ws-3", candidateId: "cand-7" },
    });
  });
});

// ── listRejectionsForWorkspace ────────────────────────────────────────────────

describe("listRejectionsForWorkspace", () => {
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
  });

  it("returns all rejections for workspace", async () => {
    const records = [makeRejection(), makeRejection({ id: "rej-2", candidateId: "cand-2" })];
    (mockPrisma as any).controlledLearningRejection.findMany.mockResolvedValue(records);

    const result = await listRejectionsForWorkspace(mockPrisma, "ws-1");
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no rejections", async () => {
    (mockPrisma as any).controlledLearningRejection.findMany.mockResolvedValue([]);

    const result = await listRejectionsForWorkspace(mockPrisma, "ws-empty");
    expect(result).toHaveLength(0);
  });

  it("queries with correct workspaceId", async () => {
    (mockPrisma as any).controlledLearningRejection.findMany.mockResolvedValue([]);

    await listRejectionsForWorkspace(mockPrisma, "ws-specific");
    expect((mockPrisma as any).controlledLearningRejection.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-specific" },
    });
  });
});

// ── AUDIT EMISSION TESTS ──────────────────────────────────────────────────────

describe("audit emission — admitCandidate", () => {
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
  });

  it("emits ADMISSION_CREATED audit entry on success", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue({ id: "rev-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.create.mockResolvedValue(makeAdmission());

    await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-1",
      admittedAt: new Date("2026-06-19T00:00:00Z"),
      sourceLabel: "outcome-review",
      evidenceOrigin: "KPI-drop",
      admissionNotes: "Solid evidence",
    });

    expect((mockPrisma as any).controlledLearningCandidateAuditEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "ws-1",
          candidateId: "cand-1",
          action: "ADMISSION_CREATED",
        }),
      })
    );
  });

  it("emits ADMISSION_BLOCKED_INELIGIBLE audit on ineligible status", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(
      makeCandidate({ eligibilityStatus: "LEARNING_INELIGIBLE_LOW_EVIDENCE" })
    );

    await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-1",
      admittedAt: new Date(),
      sourceLabel: "label",
      evidenceOrigin: "KPI-drop",
      admissionNotes: "Notes",
    });

    expect((mockPrisma as any).controlledLearningCandidateAuditEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "ws-1",
          candidateId: "cand-1",
          action: "ADMISSION_BLOCKED_INELIGIBLE",
        }),
      })
    );
  });

  it("emits ADMISSION_BLOCKED_NO_APPROVED_REVIEW when review missing", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue(null);

    await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-1",
      admittedAt: new Date(),
      sourceLabel: "label",
      evidenceOrigin: "KPI-drop",
      admissionNotes: "Notes",
    });

    expect((mockPrisma as any).controlledLearningCandidateAuditEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ADMISSION_BLOCKED_NO_APPROVED_REVIEW",
          workspaceId: "ws-1",
          candidateId: "cand-1",
        }),
      })
    );
  });

  it("emits ADMISSION_BLOCKED_CRITICAL_HARM when unmitigated critical harm exists", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue({ id: "rev-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue({ id: "harm-1" });

    await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-1",
      admittedAt: new Date(),
      sourceLabel: "label",
      evidenceOrigin: "KPI-drop",
      admissionNotes: "Notes",
    });

    expect((mockPrisma as any).controlledLearningCandidateAuditEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ADMISSION_BLOCKED_CRITICAL_HARM",
          workspaceId: "ws-1",
          candidateId: "cand-1",
        }),
      })
    );
  });

  it("audit emission failure does not block admission success", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue({ id: "rev-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.create.mockResolvedValue(makeAdmission());
    (mockPrisma as any).controlledLearningCandidateAuditEntry.create.mockRejectedValue(
      new Error("DB down")
    );

    const result = await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-1",
      admittedAt: new Date(),
      sourceLabel: "outcome-review",
      evidenceOrigin: "KPI-drop",
      admissionNotes: "Solid evidence",
    });

    expect(result.admitted).toBe(true);
  });

  it("audit entry includes workspaceId on success", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningReview.findFirst.mockResolvedValue({ id: "rev-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.create.mockResolvedValue(makeAdmission());

    await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-1",
      admittedAt: new Date(),
      sourceLabel: "label",
      evidenceOrigin: "KPI-drop",
      admissionNotes: "Notes",
    });

    const auditCall = (mockPrisma as any).controlledLearningCandidateAuditEntry.create.mock.calls.find(
      (c: any[]) => c[0]?.data?.action === "ADMISSION_CREATED"
    );
    expect(auditCall).toBeDefined();
    expect(auditCall[0].data.workspaceId).toBe("ws-1");
  });

  it("no audit for forbidden origin guard (candidateId not yet confirmed)", async () => {
    const result = await admitCandidate(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      admittedBy: "user-1",
      admittedAt: new Date(),
      sourceLabel: "label",
      evidenceOrigin: "public_source_unverified",
      admissionNotes: "Notes",
    });

    expect(result.admitted).toBe(false);
    expect((mockPrisma as any).controlledLearningCandidateAuditEntry.create).not.toHaveBeenCalled();
  });
});

describe("audit emission — rejectCandidateFinal", () => {
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
  });

  it("emits REJECTION_CREATED audit entry on success", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningRejection.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningRejection.create.mockResolvedValue(makeRejection());

    await rejectCandidateFinal(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      rejectedBy: "user-1",
      rejectedAt: new Date(),
      rejectionReason: "Insufficient evidence",
      rejectionCode: "EVIDENCE_WEAK",
    });

    expect((mockPrisma as any).controlledLearningCandidateAuditEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "REJECTION_CREATED",
          workspaceId: "ws-1",
          candidateId: "cand-1",
        }),
      })
    );
  });

  it("audit emission failure does not block rejection success", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(makeCandidate());
    (mockPrisma as any).controlledLearningRejection.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningAdmission.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningRejection.create.mockResolvedValue(makeRejection());
    (mockPrisma as any).controlledLearningCandidateAuditEntry.create.mockRejectedValue(
      new Error("DB down")
    );

    const result = await rejectCandidateFinal(mockPrisma, {
      workspaceId: "ws-1",
      candidateId: "cand-1",
      rejectedBy: "user-1",
      rejectedAt: new Date(),
      rejectionReason: "reason",
      rejectionCode: "CODE",
    });

    expect(result.rejected).toBe(true);
  });
});
