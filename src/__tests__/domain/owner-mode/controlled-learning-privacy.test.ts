import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  applyPrivacyControl,
  listPrivacyControlsForCandidate,
  listPrivacyControlsForWorkspace,
} from "@/services/controlled-learning-privacy.service";
import {
  recordConsent,
  getLatestConsent,
  listConsentRecords,
} from "@/services/controlled-learning-consent.service";
import {
  setRetentionPolicy,
  getRetentionPolicy,
} from "@/services/controlled-learning-retention.service";

const mockPrivacyControlCreate = vi.fn();
const mockPrivacyControlFindFirst = vi.fn();
const mockPrivacyControlFindMany = vi.fn();
const mockConsentRecordCreate = vi.fn();
const mockConsentRecordFindFirst = vi.fn();
const mockConsentRecordFindMany = vi.fn();
const mockRetentionPolicyUpsert = vi.fn();
const mockRetentionPolicyFindFirst = vi.fn();
const mockCandidateFindFirst = vi.fn();

const mockPrisma = {
  controlledLearningPrivacyControl: {
    create: mockPrivacyControlCreate,
    findFirst: mockPrivacyControlFindFirst,
    findMany: mockPrivacyControlFindMany,
  },
  controlledLearningConsentRecord: {
    create: mockConsentRecordCreate,
    findFirst: mockConsentRecordFindFirst,
    findMany: mockConsentRecordFindMany,
  },
  controlledLearningRetentionPolicy: {
    upsert: mockRetentionPolicyUpsert,
    findFirst: mockRetentionPolicyFindFirst,
  },
  controlledLearningCandidate: {
    findFirst: mockCandidateFindFirst,
  },
} as unknown as PrismaClient;

const WORKSPACE_ID = "ws-test-001";
const CANDIDATE_ID = "cand-test-001";
const APPLIED_BY = "actor-001";
const APPLIED_AT = new Date("2026-06-19T10:00:00Z");

const mockCandidate = { id: CANDIDATE_ID, workspaceId: WORKSPACE_ID };

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Privacy Control Tests ────────────────────────────────────────────────────

describe("applyPrivacyControl", () => {
  it("creates ANONYMIZE control when valid", async () => {
    mockCandidateFindFirst.mockResolvedValue(mockCandidate);
    const mockControl = { id: "ctrl-001", controlType: "ANONYMIZE" };
    mockPrivacyControlCreate.mockResolvedValue(mockControl);

    const result = await applyPrivacyControl(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      controlType: "ANONYMIZE",
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      reason: "GDPR anonymization request",
    });

    expect(result.applied).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.control).toEqual(mockControl);
  });

  it("creates REDACT control when valid", async () => {
    mockCandidateFindFirst.mockResolvedValue(mockCandidate);
    mockPrivacyControlCreate.mockResolvedValue({ id: "ctrl-002", controlType: "REDACT" });

    const result = await applyPrivacyControl(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      controlType: "REDACT",
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      reason: "Sensitive field redaction",
    });

    expect(result.applied).toBe(true);
    expect(result.control).toBeDefined();
  });

  it("creates EXCLUDE control when valid", async () => {
    mockCandidateFindFirst.mockResolvedValue(mockCandidate);
    mockPrivacyControlCreate.mockResolvedValue({ id: "ctrl-003", controlType: "EXCLUDE" });

    const result = await applyPrivacyControl(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      controlType: "EXCLUDE",
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      reason: "Excluded from aggregates",
    });

    expect(result.applied).toBe(true);
  });

  it("creates QUARANTINE control when valid", async () => {
    mockCandidateFindFirst.mockResolvedValue(mockCandidate);
    mockPrivacyControlCreate.mockResolvedValue({ id: "ctrl-004", controlType: "QUARANTINE" });

    const result = await applyPrivacyControl(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      controlType: "QUARANTINE",
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      reason: "Data quality quarantine",
    });

    expect(result.applied).toBe(true);
  });

  it("rejects invalid controlType", async () => {
    const result = await applyPrivacyControl(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      controlType: "INVALID" as any,
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      reason: "test",
    });

    expect(result.applied).toBe(false);
    expect(result.violations).toContain(
      "controlType must be one of: ANONYMIZE, REDACT, EXCLUDE, QUARANTINE"
    );
    expect(mockCandidateFindFirst).not.toHaveBeenCalled();
  });

  it("rejects empty workspaceId with security throw", async () => {
    await expect(
      applyPrivacyControl(mockPrisma, {
        workspaceId: "",
        candidateId: CANDIDATE_ID,
        controlType: "ANONYMIZE",
        appliedBy: APPLIED_BY,
        appliedAt: APPLIED_AT,
        reason: "test",
      })
    ).rejects.toThrow(/SEC-007\/008/);
  });

  it("rejects missing reason", async () => {
    const result = await applyPrivacyControl(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      controlType: "REDACT",
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      reason: "",
    });

    expect(result.applied).toBe(false);
    expect(result.violations).toContain("reason is required");
  });

  it("rejects missing appliedBy", async () => {
    const result = await applyPrivacyControl(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      controlType: "EXCLUDE",
      appliedBy: "",
      appliedAt: APPLIED_AT,
      reason: "test",
    });

    expect(result.applied).toBe(false);
    expect(result.violations).toContain("appliedBy is required");
  });

  it("rejects when candidate not in workspace", async () => {
    mockCandidateFindFirst.mockResolvedValue(null);

    const result = await applyPrivacyControl(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: "other-cand",
      controlType: "ANONYMIZE",
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      reason: "test",
    });

    expect(result.applied).toBe(false);
    expect(result.violations).toContain("Candidate not found in workspace");
  });

  it("enforces workspace scoping on candidate lookup", async () => {
    mockCandidateFindFirst.mockResolvedValue(null);

    await applyPrivacyControl(mockPrisma, {
      workspaceId: "other-ws",
      candidateId: CANDIDATE_ID,
      controlType: "QUARANTINE",
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      reason: "workspace test",
    });

    expect(mockCandidateFindFirst).toHaveBeenCalledWith({
      where: { id: CANDIDATE_ID, workspaceId: "other-ws" },
    });
  });
});

describe("listPrivacyControlsForCandidate", () => {
  it("returns controls for candidate in workspace", async () => {
    const controls = [
      { id: "ctrl-001", controlType: "ANONYMIZE" },
      { id: "ctrl-002", controlType: "REDACT" },
    ];
    mockPrivacyControlFindMany.mockResolvedValue(controls);

    const result = await listPrivacyControlsForCandidate(
      mockPrisma,
      WORKSPACE_ID,
      CANDIDATE_ID
    );

    expect(result).toEqual(controls);
    expect(mockPrivacyControlFindMany).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID, candidateId: CANDIDATE_ID },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns empty array when no controls exist", async () => {
    mockPrivacyControlFindMany.mockResolvedValue([]);
    const result = await listPrivacyControlsForCandidate(mockPrisma, WORKSPACE_ID, CANDIDATE_ID);
    expect(result).toEqual([]);
  });
});

describe("listPrivacyControlsForWorkspace", () => {
  it("returns all controls for workspace", async () => {
    const controls = [{ id: "ctrl-001" }, { id: "ctrl-002" }];
    mockPrivacyControlFindMany.mockResolvedValue(controls);

    const result = await listPrivacyControlsForWorkspace(mockPrisma, WORKSPACE_ID);

    expect(result).toEqual(controls);
    expect(mockPrivacyControlFindMany).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID },
      orderBy: { createdAt: "desc" },
    });
  });

  it("scopes to workspace only", async () => {
    mockPrivacyControlFindMany.mockResolvedValue([]);
    await listPrivacyControlsForWorkspace(mockPrisma, "ws-scoped");
    expect(mockPrivacyControlFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws-scoped" } })
    );
  });
});

// ─── Consent Record Tests ─────────────────────────────────────────────────────

describe("recordConsent", () => {
  it("records WORKSPACE_ONLY consent when given", async () => {
    mockCandidateFindFirst.mockResolvedValue(mockCandidate);
    const mockRecord = { id: "consent-001", consentGiven: true, consentScope: "WORKSPACE_ONLY" };
    mockConsentRecordCreate.mockResolvedValue(mockRecord);

    const result = await recordConsent(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      consentGiven: true,
      consentBy: APPLIED_BY,
      consentAt: APPLIED_AT,
      consentScope: "WORKSPACE_ONLY",
      consentNotes: "Consent obtained at intake",
    });

    expect(result.recorded).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.record).toEqual(mockRecord);
  });

  it("records ANONYMIZED_AGGREGATE consent", async () => {
    mockCandidateFindFirst.mockResolvedValue(mockCandidate);
    mockConsentRecordCreate.mockResolvedValue({ id: "consent-002", consentScope: "ANONYMIZED_AGGREGATE" });

    const result = await recordConsent(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      consentGiven: true,
      consentBy: APPLIED_BY,
      consentAt: APPLIED_AT,
      consentScope: "ANONYMIZED_AGGREGATE",
      consentNotes: "",
    });

    expect(result.recorded).toBe(true);
  });

  it("records NONE consent scope (refusal)", async () => {
    mockCandidateFindFirst.mockResolvedValue(mockCandidate);
    mockConsentRecordCreate.mockResolvedValue({ id: "consent-003", consentGiven: false, consentScope: "NONE" });

    const result = await recordConsent(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      consentGiven: false,
      consentBy: APPLIED_BY,
      consentAt: APPLIED_AT,
      consentScope: "NONE",
      consentNotes: "Candidate refused consent",
    });

    expect(result.recorded).toBe(true);
  });

  it("rejects invalid consentScope", async () => {
    const result = await recordConsent(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      consentGiven: true,
      consentBy: APPLIED_BY,
      consentAt: APPLIED_AT,
      consentScope: "INVALID" as any,
      consentNotes: "",
    });

    expect(result.recorded).toBe(false);
    expect(result.violations).toContain(
      "consentScope must be one of: WORKSPACE_ONLY, ANONYMIZED_AGGREGATE, NONE"
    );
    expect(mockCandidateFindFirst).not.toHaveBeenCalled();
  });

  it("rejects empty workspaceId with security throw", async () => {
    await expect(
      recordConsent(mockPrisma, {
        workspaceId: "",
        candidateId: CANDIDATE_ID,
        consentGiven: true,
        consentBy: APPLIED_BY,
        consentAt: APPLIED_AT,
        consentScope: "WORKSPACE_ONLY",
        consentNotes: "",
      })
    ).rejects.toThrow(/SEC-007\/008/);
  });

  it("rejects missing consentBy", async () => {
    const result = await recordConsent(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      consentGiven: true,
      consentBy: "",
      consentAt: APPLIED_AT,
      consentScope: "WORKSPACE_ONLY",
      consentNotes: "",
    });

    expect(result.recorded).toBe(false);
    expect(result.violations).toContain("consentBy is required");
  });

  it("rejects when candidate not in workspace", async () => {
    mockCandidateFindFirst.mockResolvedValue(null);

    const result = await recordConsent(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: "unknown-cand",
      consentGiven: true,
      consentBy: APPLIED_BY,
      consentAt: APPLIED_AT,
      consentScope: "WORKSPACE_ONLY",
      consentNotes: "",
    });

    expect(result.recorded).toBe(false);
    expect(result.violations).toContain("Candidate not found in workspace");
  });

  it("allows multiple consent records per candidate", async () => {
    mockCandidateFindFirst.mockResolvedValue(mockCandidate);
    mockConsentRecordCreate
      .mockResolvedValueOnce({ id: "consent-001" })
      .mockResolvedValueOnce({ id: "consent-002" });

    const r1 = await recordConsent(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      consentGiven: true,
      consentBy: APPLIED_BY,
      consentAt: new Date("2026-01-01"),
      consentScope: "WORKSPACE_ONLY",
      consentNotes: "First consent",
    });

    const r2 = await recordConsent(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      candidateId: CANDIDATE_ID,
      consentGiven: false,
      consentBy: APPLIED_BY,
      consentAt: new Date("2026-06-01"),
      consentScope: "NONE",
      consentNotes: "Revoked",
    });

    expect(r1.recorded).toBe(true);
    expect(r2.recorded).toBe(true);
    expect(mockConsentRecordCreate).toHaveBeenCalledTimes(2);
  });

  it("enforces workspace scoping on candidate lookup", async () => {
    mockCandidateFindFirst.mockResolvedValue(null);

    await recordConsent(mockPrisma, {
      workspaceId: "ws-other",
      candidateId: CANDIDATE_ID,
      consentGiven: true,
      consentBy: APPLIED_BY,
      consentAt: APPLIED_AT,
      consentScope: "WORKSPACE_ONLY",
      consentNotes: "",
    });

    expect(mockCandidateFindFirst).toHaveBeenCalledWith({
      where: { id: CANDIDATE_ID, workspaceId: "ws-other" },
    });
  });
});

describe("getLatestConsent", () => {
  it("returns most recent consent record", async () => {
    const latest = { id: "consent-latest", consentAt: new Date("2026-06-19") };
    mockConsentRecordFindFirst.mockResolvedValue(latest);

    const result = await getLatestConsent(mockPrisma, WORKSPACE_ID, CANDIDATE_ID);

    expect(result).toEqual(latest);
    expect(mockConsentRecordFindFirst).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID, candidateId: CANDIDATE_ID },
      orderBy: { consentAt: "desc" },
    });
  });

  it("returns null when no consent exists", async () => {
    mockConsentRecordFindFirst.mockResolvedValue(null);
    const result = await getLatestConsent(mockPrisma, WORKSPACE_ID, CANDIDATE_ID);
    expect(result).toBeNull();
  });
});

describe("listConsentRecords", () => {
  it("returns all consent records for candidate", async () => {
    const records = [{ id: "c-001" }, { id: "c-002" }];
    mockConsentRecordFindMany.mockResolvedValue(records);

    const result = await listConsentRecords(mockPrisma, WORKSPACE_ID, CANDIDATE_ID);

    expect(result).toEqual(records);
    expect(mockConsentRecordFindMany).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID, candidateId: CANDIDATE_ID },
      orderBy: { consentAt: "desc" },
    });
  });

  it("scopes to workspace and candidate", async () => {
    mockConsentRecordFindMany.mockResolvedValue([]);
    await listConsentRecords(mockPrisma, "ws-x", "cand-x");
    expect(mockConsentRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws-x", candidateId: "cand-x" } })
    );
  });
});

// ─── Retention Policy Tests ───────────────────────────────────────────────────

describe("setRetentionPolicy", () => {
  it("creates retention policy with valid retentionDays", async () => {
    const mockPolicy = { id: "rp-001", retentionDays: 365, workspaceId: WORKSPACE_ID };
    mockRetentionPolicyUpsert.mockResolvedValue(mockPolicy);

    const result = await setRetentionPolicy(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      retentionDays: 365,
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      policyNotes: "Standard 1-year retention",
    });

    expect(result.set).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.policy).toEqual(mockPolicy);
  });

  it("upserts policy (one per workspace)", async () => {
    mockRetentionPolicyUpsert.mockResolvedValue({ id: "rp-001", retentionDays: 730 });

    const result = await setRetentionPolicy(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      retentionDays: 730,
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      policyNotes: "Updated to 2 years",
    });

    expect(result.set).toBe(true);
    expect(mockRetentionPolicyUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WORKSPACE_ID } })
    );
  });

  it("accepts maximum retention of 3650 days", async () => {
    mockRetentionPolicyUpsert.mockResolvedValue({ id: "rp-002", retentionDays: 3650 });

    const result = await setRetentionPolicy(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      retentionDays: 3650,
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      policyNotes: "Maximum 10-year retention",
    });

    expect(result.set).toBe(true);
  });

  it("rejects retentionDays of 0", async () => {
    const result = await setRetentionPolicy(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      retentionDays: 0,
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      policyNotes: "",
    });

    expect(result.set).toBe(false);
    expect(result.violations).toContain("retentionDays must be a positive integer");
  });

  it("rejects negative retentionDays", async () => {
    const result = await setRetentionPolicy(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      retentionDays: -1,
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      policyNotes: "",
    });

    expect(result.set).toBe(false);
    expect(result.violations).toContain("retentionDays must be a positive integer");
  });

  it("rejects retentionDays exceeding 3650", async () => {
    const result = await setRetentionPolicy(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      retentionDays: 3651,
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      policyNotes: "",
    });

    expect(result.set).toBe(false);
    expect(result.violations).toContain("retentionDays must not exceed 3650 (10 years)");
  });

  it("rejects empty workspaceId with security throw", async () => {
    await expect(
      setRetentionPolicy(mockPrisma, {
        workspaceId: "",
        retentionDays: 365,
        appliedBy: APPLIED_BY,
        appliedAt: APPLIED_AT,
        policyNotes: "",
      })
    ).rejects.toThrow(/SEC-007\/008/);
  });

  it("rejects missing appliedBy", async () => {
    const result = await setRetentionPolicy(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      retentionDays: 365,
      appliedBy: "",
      appliedAt: APPLIED_AT,
      policyNotes: "",
    });

    expect(result.set).toBe(false);
    expect(result.violations).toContain("appliedBy is required");
  });

  it("rejects non-integer retentionDays", async () => {
    const result = await setRetentionPolicy(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      retentionDays: 30.5,
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      policyNotes: "",
    });

    expect(result.set).toBe(false);
    expect(result.violations).toContain("retentionDays must be a positive integer");
  });

  it("accepts minimum of 1 day", async () => {
    mockRetentionPolicyUpsert.mockResolvedValue({ id: "rp-min", retentionDays: 1 });

    const result = await setRetentionPolicy(mockPrisma, {
      workspaceId: WORKSPACE_ID,
      retentionDays: 1,
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      policyNotes: "Minimal retention",
    });

    expect(result.set).toBe(true);
  });
});

describe("getRetentionPolicy", () => {
  it("returns existing retention policy", async () => {
    const policy = { id: "rp-001", workspaceId: WORKSPACE_ID, retentionDays: 365 };
    mockRetentionPolicyFindFirst.mockResolvedValue(policy);

    const result = await getRetentionPolicy(mockPrisma, WORKSPACE_ID);

    expect(result).toEqual(policy);
    expect(mockRetentionPolicyFindFirst).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID },
    });
  });

  it("returns null when no policy set", async () => {
    mockRetentionPolicyFindFirst.mockResolvedValue(null);
    const result = await getRetentionPolicy(mockPrisma, WORKSPACE_ID);
    expect(result).toBeNull();
  });

  it("scopes to workspace", async () => {
    mockRetentionPolicyFindFirst.mockResolvedValue(null);
    await getRetentionPolicy(mockPrisma, "ws-scoped-check");
    expect(mockRetentionPolicyFindFirst).toHaveBeenCalledWith({
      where: { workspaceId: "ws-scoped-check" },
    });
  });
});

// ── Cross-tenant isolation: applyPrivacyControl ─────────────────────────────

describe("applyPrivacyControl — cross-tenant isolation", () => {
  it("denies control when candidateId belongs to a different workspace", async () => {
    mockCandidateFindFirst.mockResolvedValue(null); // candidate not found in OTHER workspace
    const result = await applyPrivacyControl(mockPrisma, {
      workspaceId: "ws-other-tenant",
      candidateId: CANDIDATE_ID,
      controlType: "ANONYMIZE",
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      reason: "cross-tenant attempt",
    });
    expect(result.applied).toBe(false);
    expect(result.violations).toContain("Candidate not found in workspace");
  });

  it("scopes candidate lookup to requesting workspaceId", async () => {
    mockCandidateFindFirst.mockResolvedValue(null);
    await applyPrivacyControl(mockPrisma, {
      workspaceId: "ws-other-tenant",
      candidateId: CANDIDATE_ID,
      controlType: "ANONYMIZE",
      appliedBy: APPLIED_BY,
      appliedAt: APPLIED_AT,
      reason: "cross-tenant attempt",
    });
    expect(mockCandidateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CANDIDATE_ID, workspaceId: "ws-other-tenant" } })
    );
  });

  it("throws on whitespace workspaceId before reaching DB", async () => {
    await expect(
      applyPrivacyControl(mockPrisma, {
        workspaceId: "   ",
        candidateId: CANDIDATE_ID,
        controlType: "ANONYMIZE",
        appliedBy: APPLIED_BY,
        appliedAt: APPLIED_AT,
        reason: "test",
      })
    ).rejects.toThrow(/SEC-007\/008/);
    expect(mockCandidateFindFirst).not.toHaveBeenCalled();
  });
});
