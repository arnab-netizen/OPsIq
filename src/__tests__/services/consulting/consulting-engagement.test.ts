/**
 * Bundle 6 — Consulting Engagement service tests.
 *
 * Covers: phase FSM, client boundary (DTO redaction), closure gate,
 * all four OpsIQ dimensions, finding evidence requirement, recommendation
 * finding requirement, workspace isolation, audit events, idempotency.
 *
 * 50+ tests — all non-DB mocked via vi.hoisted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDb, mockEmitAuditEvent } = vi.hoisted(() => {
  const mockEngagement = {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    title: "Acme Recovery Engagement",
    clientId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    workspaceId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
    code: "ENG-TEST",
    serviceTier: "standard",
    engagementMode: "consulting",
    status: "ACTIVE",
    healthStatus: "HEALTHY",
    interventionMode: "recovery",
    interventionPhase: "triage",
    consultingPhase: "DISCOVERY",
    consultantNotes: "Internal notes for consultant only",
    humanFactors: {
      ownerBottleneckRisk: "HIGH",
      followThroughRisk: "MEDIUM",
      resistanceToChange: "LOW",
      communicationBreakdownRisk: null,
      moraleFragility: null,
      managementCapabilityGap: "MEDIUM",
      keyPersonDependency: true,
      accountabilityWeakness: "HIGH",
      notes: "Owner tends to delay decisions",
    },
    description: null,
    startDate: null,
    targetEndDate: null,
    actualEndDate: null,
    assignedConsultantId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
    currentScopeVersionId: null,
    parentEngagementId: null,
    version: 1,
    visibility: "internal",
    isBlocked: false,
    blockerReason: null,
    blockedAt: null,
    ownerId: null,
    createdBy: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
    createdAt: new Date("2026-07-01T10:00:00Z"),
    updatedAt: new Date("2026-07-01T10:00:00Z"),
  };

  const mockFinding = {
    id: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55",
    engagementId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    primaryEvidenceId: "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66",
    title: "Cash flow critical",
    summary: "Business at risk of insolvency",
    severity: "critical",
    impactArea: "finance",
    status: "identified",
    confidenceScore: 85,
    hypothesis: "Hypothesis here",
    rootCause: "Root cause internal",
    consequence: "Business failure",
    stageId: null,
    ownerId: null,
    dueAt: null,
    validatedAt: null,
    resolvedAt: null,
    dismissedAt: null,
    metadata: null,
    version: 1,
    archivedAt: null,
    createdAt: new Date("2026-07-01T11:00:00Z"),
    updatedAt: new Date("2026-07-01T11:00:00Z"),
  };

  const mockRecommendation = {
    id: "a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    engagementId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    workspaceId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
    findingId: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55",
    title: "Reduce expenses immediately",
    description: null,
    rationale: "Cash crunch requires immediate action",
    priority: "critical",
    estimatedImpact: "Saves 20% opex",
    status: "pending",
    visibility: "client",
    version: 1,
    approvedBy: null,
    approvedAt: null,
    evidenceValidationScore: null,
    reliabilityLevel: null,
    kpiHealthScore: null,
    kpiRiskLevel: null,
    rollbackPlan: null,
    constraintsConsidered: null,
    confidenceLevel: null,
    expiresAt: null,
    isAiProposal: false,
    createdBy: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
    createdAt: new Date("2026-07-01T12:00:00Z"),
    updatedAt: new Date("2026-07-01T12:00:00Z"),
  };

  const mockAction = {
    id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    engagementId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    stageId: null,
    recommendationId: null,
    title: "Cut marketing spend",
    description: null,
    status: "pending",
    assignedTo: null,
    dueAt: null,
    startedAt: null,
    completedAt: null,
    verifiedAt: null,
    metadata: { consultingTarget: "CLIENT", priority: "critical" },
    version: 1,
    createdAt: new Date("2026-07-01T13:00:00Z"),
    updatedAt: new Date("2026-07-01T13:00:00Z"),
  };

  const mockEvidence = {
    id: "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66",
    engagementId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    title: "Bank statement",
  };

  const mockDb = {
    engagement: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    finding: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    recommendation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    action: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    evidence: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: vi.fn().mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
      return fn({ engagement: mockDb.engagement, action: mockDb.action });
    }),
  };

  const mockEmitAuditEvent = vi.fn().mockResolvedValue(undefined);

  return { mockDb, mockEmitAuditEvent, mockEngagement, mockFinding, mockRecommendation, mockAction, mockEvidence };
});

vi.mock("@/lib/db", () => ({ db: mockDb, getDbInstance: vi.fn().mockResolvedValue({}) }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: mockEmitAuditEvent }));

// Fixtures accessible in tests
const WORKSPACE_ID = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";
const ACTOR_ID = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44";
const ENGAGEMENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const CLIENT_ID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const FINDING_ID = "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55";
const EVIDENCE_ID = "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66";

const baseEngagement = {
  id: ENGAGEMENT_ID,
  title: "Acme Recovery Engagement",
  clientId: CLIENT_ID,
  workspaceId: WORKSPACE_ID,
  code: "ENG-TEST",
  serviceTier: "standard",
  engagementMode: "consulting",
  status: "ACTIVE",
  healthStatus: "HEALTHY",
  interventionMode: "recovery",
  interventionPhase: "triage",
  consultingPhase: "DISCOVERY",
  consultantNotes: "Internal notes for consultant only",
  humanFactors: {
    ownerBottleneckRisk: "HIGH",
    followThroughRisk: "MEDIUM",
    resistanceToChange: "LOW",
    communicationBreakdownRisk: null,
    moraleFragility: null,
    managementCapabilityGap: "MEDIUM",
    keyPersonDependency: true,
    accountabilityWeakness: "HIGH",
  },
  description: null,
  startDate: null,
  targetEndDate: null,
  actualEndDate: null,
  assignedConsultantId: ACTOR_ID,
  currentScopeVersionId: null,
  parentEngagementId: null,
  version: 1,
  visibility: "internal",
  isBlocked: false,
  blockerReason: null,
  blockedAt: null,
  ownerId: null,
  createdBy: ACTOR_ID,
  createdAt: new Date("2026-07-01T10:00:00Z"),
  updatedAt: new Date("2026-07-01T10:00:00Z"),
};

const baseFinding = {
  id: FINDING_ID,
  engagementId: ENGAGEMENT_ID,
  primaryEvidenceId: EVIDENCE_ID,
  title: "Cash flow critical",
  summary: "Business at risk of insolvency",
  severity: "critical",
  impactArea: "finance",
  status: "identified",
  confidenceScore: 85,
  hypothesis: "Hypothesis here",
  rootCause: "Root cause internal",
  consequence: "Business failure",
  stageId: null,
  ownerId: null,
  dueAt: null,
  validatedAt: null,
  resolvedAt: null,
  dismissedAt: null,
  metadata: null,
  version: 1,
  archivedAt: null,
  createdAt: new Date("2026-07-01T11:00:00Z"),
  updatedAt: new Date("2026-07-01T11:00:00Z"),
};

const baseRecommendation = {
  id: "a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  engagementId: ENGAGEMENT_ID,
  workspaceId: WORKSPACE_ID,
  findingId: FINDING_ID,
  title: "Reduce expenses immediately",
  description: null,
  rationale: "Cash crunch requires immediate action",
  priority: "critical",
  estimatedImpact: "Saves 20% opex",
  status: "pending",
  visibility: "client",
  version: 1,
  approvedBy: null,
  approvedAt: null,
  evidenceValidationScore: null,
  reliabilityLevel: null,
  kpiHealthScore: null,
  kpiRiskLevel: null,
  rollbackPlan: null,
  constraintsConsidered: null,
  confidenceLevel: null,
  expiresAt: null,
  isAiProposal: false,
  createdBy: ACTOR_ID,
  createdAt: new Date("2026-07-01T12:00:00Z"),
  updatedAt: new Date("2026-07-01T12:00:00Z"),
};

const baseAction = {
  id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  engagementId: ENGAGEMENT_ID,
  stageId: null,
  recommendationId: null,
  title: "Cut marketing spend",
  description: null,
  status: "pending",
  assignedTo: null,
  dueAt: null,
  startedAt: null,
  completedAt: null,
  verifiedAt: null,
  metadata: { consultingTarget: "CLIENT", priority: "critical" },
  version: 1,
  createdAt: new Date("2026-07-01T13:00:00Z"),
  updatedAt: new Date("2026-07-01T13:00:00Z"),
};

import {
  createConsultingEngagement,
  getConsultingEngagement,
  listConsultingEngagements,
  advanceConsultingPhase,
  createConsultingFinding,
  generateConsultingRecommendation,
  assignConsultingAction,
  computeConsultingEngagementHealth,
  closeConsultingEngagement,
} from "@/services/consulting/consulting-engagement.service";

import {
  isValidPhaseTransition,
  getNextPhase,
  toClientDTO,
  toConsultantDTO,
} from "@/domain/consulting/consulting-contracts";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── FSM contract tests ────────────────────────────────────────────────────────

describe("Phase FSM — isValidPhaseTransition", () => {
  it("allows DISCOVERY → DIAGNOSIS", () => {
    expect(isValidPhaseTransition("DISCOVERY", "DIAGNOSIS")).toBe(true);
  });
  it("allows DIAGNOSIS → IMPLEMENTATION", () => {
    expect(isValidPhaseTransition("DIAGNOSIS", "IMPLEMENTATION")).toBe(true);
  });
  it("allows IMPLEMENTATION → REVIEW", () => {
    expect(isValidPhaseTransition("IMPLEMENTATION", "REVIEW")).toBe(true);
  });
  it("blocks DISCOVERY → IMPLEMENTATION (skip)", () => {
    expect(isValidPhaseTransition("DISCOVERY", "IMPLEMENTATION")).toBe(false);
  });
  it("blocks DISCOVERY → REVIEW (skip)", () => {
    expect(isValidPhaseTransition("DISCOVERY", "REVIEW")).toBe(false);
  });
  it("blocks DIAGNOSIS → DISCOVERY (reversal)", () => {
    expect(isValidPhaseTransition("DIAGNOSIS", "DISCOVERY")).toBe(false);
  });
  it("blocks IMPLEMENTATION → DIAGNOSIS (reversal)", () => {
    expect(isValidPhaseTransition("IMPLEMENTATION", "DIAGNOSIS")).toBe(false);
  });
  it("blocks REVIEW → IMPLEMENTATION (reversal)", () => {
    expect(isValidPhaseTransition("REVIEW", "IMPLEMENTATION")).toBe(false);
  });
  it("REVIEW has no next phase (terminal)", () => {
    expect(getNextPhase("REVIEW")).toBeNull();
  });
  it("DISCOVERY next phase is DIAGNOSIS", () => {
    expect(getNextPhase("DISCOVERY")).toBe("DIAGNOSIS");
  });
  it("DIAGNOSIS next phase is IMPLEMENTATION", () => {
    expect(getNextPhase("DIAGNOSIS")).toBe("IMPLEMENTATION");
  });
  it("IMPLEMENTATION next phase is REVIEW", () => {
    expect(getNextPhase("IMPLEMENTATION")).toBe("REVIEW");
  });
});

// ─── DTO redaction tests ───────────────────────────────────────────────────────

describe("DTO boundary — client vs consultant", () => {
  const row = {
    ...baseEngagement,
    consultantNotes: "Secret internal notes",
    assignedConsultantId: ACTOR_ID,
    createdBy: ACTOR_ID,
  };

  it("client DTO omits consultantNotes", () => {
    const dto = toClientDTO(row);
    expect((dto as Record<string, unknown>).consultantNotes).toBeUndefined();
  });

  it("client DTO omits assignedConsultantId", () => {
    const dto = toClientDTO(row);
    expect((dto as Record<string, unknown>).assignedConsultantId).toBeUndefined();
  });

  it("client DTO omits createdBy", () => {
    const dto = toClientDTO(row);
    expect((dto as Record<string, unknown>).createdBy).toBeUndefined();
  });

  it("client DTO includes only summary humanFactors fields", () => {
    const dto = toClientDTO(row);
    expect(dto.humanFactors).not.toBeNull();
    expect(Object.keys(dto.humanFactors!)).toEqual(
      expect.arrayContaining(["ownerBottleneckRisk", "followThroughRisk", "keyPersonDependency"])
    );
    // Full human factors fields must not leak
    expect((dto.humanFactors as Record<string, unknown>).accountabilityWeakness).toBeUndefined();
    expect((dto.humanFactors as Record<string, unknown>).moraleFragility).toBeUndefined();
  });

  it("client DTO includes core engagement fields", () => {
    const dto = toClientDTO(row);
    expect(dto.id).toBe(ENGAGEMENT_ID);
    expect(dto.title).toBe("Acme Recovery Engagement");
    expect(dto.consultingPhase).toBe("DISCOVERY");
    expect(dto.workspaceId).toBe(WORKSPACE_ID);
  });

  it("consultant DTO includes consultantNotes", () => {
    const dto = toConsultantDTO(row);
    expect(dto.consultantNotes).toBe("Secret internal notes");
  });

  it("consultant DTO includes assignedConsultantId", () => {
    const dto = toConsultantDTO(row);
    expect(dto.assignedConsultantId).toBe(ACTOR_ID);
  });

  it("consultant DTO includes full humanFactors", () => {
    const dto = toConsultantDTO(row);
    expect(dto.humanFactors).not.toBeNull();
    expect((dto.humanFactors as Record<string, unknown>).accountabilityWeakness).toBe("HIGH");
    expect((dto.humanFactors as Record<string, unknown>).managementCapabilityGap).toBe("MEDIUM");
  });

  it("null humanFactors renders as null in both DTOs", () => {
    const rowNoHF = { ...row, humanFactors: null };
    expect(toClientDTO(rowNoHF).humanFactors).toBeNull();
    expect(toConsultantDTO(rowNoHF).humanFactors).toBeNull();
  });
});

// ─── createConsultingEngagement ────────────────────────────────────────────────

describe("createConsultingEngagement", () => {
  it("creates new engagement with DISCOVERY phase", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(null);
    mockDb.engagement.create.mockResolvedValueOnce(baseEngagement);

    const result = await createConsultingEngagement(
      { title: "Acme Recovery Engagement", clientId: CLIENT_ID, workspaceId: WORKSPACE_ID },
      ACTOR_ID
    );

    expect(result.consultingPhase).toBe("DISCOVERY");
    expect(mockDb.engagement.create).toHaveBeenCalledTimes(1);
  });

  it("emits CONSULTING_ENGAGEMENT_CREATED audit event", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(null);
    mockDb.engagement.create.mockResolvedValueOnce(baseEngagement);

    await createConsultingEngagement(
      { title: "Acme Recovery Engagement", clientId: CLIENT_ID, workspaceId: WORKSPACE_ID },
      ACTOR_ID
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "consulting.engagement_created", workspaceId: WORKSPACE_ID })
    );
  });

  it("is idempotent — returns existing ACTIVE engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);

    const result = await createConsultingEngagement(
      { title: "Acme Recovery Engagement", clientId: CLIENT_ID, workspaceId: WORKSPACE_ID },
      ACTOR_ID
    );

    expect(mockDb.engagement.create).not.toHaveBeenCalled();
    expect(result.id).toBe(ENGAGEMENT_ID);
  });

  it("includes humanFactors in created engagement (4th OpsIQ dimension)", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(null);
    const withHF = {
      ...baseEngagement,
      humanFactors: { ownerBottleneckRisk: "HIGH", followThroughRisk: "LOW", keyPersonDependency: true },
    };
    mockDb.engagement.create.mockResolvedValueOnce(withHF);

    const result = await createConsultingEngagement(
      {
        title: "New Engagement",
        clientId: CLIENT_ID,
        workspaceId: WORKSPACE_ID,
        humanFactors: {
          ownerBottleneckRisk: "HIGH",
          followThroughRisk: "LOW",
          resistanceToChange: null,
          communicationBreakdownRisk: null,
          moraleFragility: null,
          managementCapabilityGap: null,
          keyPersonDependency: true,
          accountabilityWeakness: null,
        },
      },
      ACTOR_ID
    );

    expect(result.humanFactors).not.toBeNull();
  });

  it("sets interventionMode and interventionPhase (OpsIQ dimensions 3)", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(null);
    mockDb.engagement.create.mockResolvedValueOnce(baseEngagement);

    await createConsultingEngagement(
      {
        title: "Engagement",
        clientId: CLIENT_ID,
        workspaceId: WORKSPACE_ID,
        interventionMode: "transformation",
        interventionPhase: "rebuild",
      },
      ACTOR_ID
    );

    const createCall = mockDb.engagement.create.mock.calls[0][0].data;
    expect(createCall.interventionMode).toBe("transformation");
    expect(createCall.interventionPhase).toBe("rebuild");
  });

  it("returns consultant DTO with all fields", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(null);
    mockDb.engagement.create.mockResolvedValueOnce(baseEngagement);

    const result = await createConsultingEngagement(
      { title: "Acme Recovery Engagement", clientId: CLIENT_ID, workspaceId: WORKSPACE_ID },
      ACTOR_ID
    );

    // Consultant DTO should include assignedConsultantId
    expect(result).toHaveProperty("assignedConsultantId");
    expect(result).toHaveProperty("consultantNotes");
  });
});

// ─── advanceConsultingPhase ────────────────────────────────────────────────────

describe("advanceConsultingPhase", () => {
  it("advances DISCOVERY → DIAGNOSIS", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce({ ...baseEngagement, consultingPhase: "DISCOVERY" });
    const updated = { ...baseEngagement, consultingPhase: "DIAGNOSIS" };
    mockDb.engagement.update.mockResolvedValueOnce(updated);

    const result = await advanceConsultingPhase(
      { engagementId: ENGAGEMENT_ID, workspaceId: WORKSPACE_ID, targetPhase: "DIAGNOSIS", rationale: "Sufficient data gathered" },
      ACTOR_ID
    );

    expect(result.consultingPhase).toBe("DIAGNOSIS");
  });

  it("emits CONSULTING_PHASE_ADVANCED audit event with from/to payload", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce({ ...baseEngagement, consultingPhase: "DISCOVERY" });
    mockDb.engagement.update.mockResolvedValueOnce({ ...baseEngagement, consultingPhase: "DIAGNOSIS" });

    await advanceConsultingPhase(
      { engagementId: ENGAGEMENT_ID, workspaceId: WORKSPACE_ID, targetPhase: "DIAGNOSIS", rationale: "Ready" },
      ACTOR_ID
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "consulting.phase_advanced",
        payload: expect.objectContaining({ from: "DISCOVERY", to: "DIAGNOSIS" }),
      })
    );
  });

  it("throws InvalidStateTransitionError on invalid transition (skip)", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce({ ...baseEngagement, consultingPhase: "DISCOVERY" });

    await expect(
      advanceConsultingPhase(
        { engagementId: ENGAGEMENT_ID, workspaceId: WORKSPACE_ID, targetPhase: "IMPLEMENTATION", rationale: "Skipping" },
        ACTOR_ID
      )
    ).rejects.toThrow();
  });

  it("throws InvalidStateTransitionError on reversal attempt", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce({ ...baseEngagement, consultingPhase: "IMPLEMENTATION" });

    await expect(
      advanceConsultingPhase(
        { engagementId: ENGAGEMENT_ID, workspaceId: WORKSPACE_ID, targetPhase: "DISCOVERY", rationale: "Reverse" },
        ACTOR_ID
      )
    ).rejects.toThrow();
  });

  it("throws ConflictError for closed engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce({ ...baseEngagement, status: "CLOSED" });

    await expect(
      advanceConsultingPhase(
        { engagementId: ENGAGEMENT_ID, workspaceId: WORKSPACE_ID, targetPhase: "DIAGNOSIS", rationale: "Try" },
        ACTOR_ID
      )
    ).rejects.toThrow();
  });

  it("throws NotFoundError for unknown engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(null);

    await expect(
      advanceConsultingPhase(
        { engagementId: ENGAGEMENT_ID, workspaceId: WORKSPACE_ID, targetPhase: "DIAGNOSIS", rationale: "Try" },
        ACTOR_ID
      )
    ).rejects.toThrow();
  });
});

// ─── createConsultingFinding ───────────────────────────────────────────────────

describe("createConsultingFinding", () => {
  it("creates finding when evidence is linked to engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.evidence.findFirst.mockResolvedValueOnce({ id: EVIDENCE_ID, engagementId: ENGAGEMENT_ID });
    mockDb.finding.findFirst.mockResolvedValueOnce(null);
    mockDb.finding.create.mockResolvedValueOnce(baseFinding);

    const result = await createConsultingFinding(
      {
        engagementId: ENGAGEMENT_ID,
        workspaceId: WORKSPACE_ID,
        primaryEvidenceId: EVIDENCE_ID,
        title: "Cash flow critical",
        summary: "Business at risk",
        severity: "critical",
        impactArea: "finance",
      },
      ACTOR_ID
    );

    expect(result.id).toBe(FINDING_ID);
    expect(result.severity).toBe("critical");
  });

  it("rejects finding creation when evidence not found (evidence required)", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.evidence.findFirst.mockResolvedValueOnce(null);

    await expect(
      createConsultingFinding(
        {
          engagementId: ENGAGEMENT_ID,
          workspaceId: WORKSPACE_ID,
          primaryEvidenceId: EVIDENCE_ID,
          title: "Finding without evidence",
          summary: "Should fail",
          severity: "high",
          impactArea: "ops",
        },
        ACTOR_ID
      )
    ).rejects.toThrow();
  });

  it("emits CONSULTING_FINDING_CREATED audit event", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.evidence.findFirst.mockResolvedValueOnce({ id: EVIDENCE_ID, engagementId: ENGAGEMENT_ID });
    mockDb.finding.findFirst.mockResolvedValueOnce(null);
    mockDb.finding.create.mockResolvedValueOnce(baseFinding);

    await createConsultingFinding(
      {
        engagementId: ENGAGEMENT_ID,
        workspaceId: WORKSPACE_ID,
        primaryEvidenceId: EVIDENCE_ID,
        title: "Cash flow critical",
        summary: "Business at risk",
        severity: "critical",
        impactArea: "finance",
      },
      ACTOR_ID
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "consulting.finding_created", workspaceId: WORKSPACE_ID })
    );
  });

  it("is idempotent by engagement+title — returns existing finding", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.evidence.findFirst.mockResolvedValueOnce({ id: EVIDENCE_ID, engagementId: ENGAGEMENT_ID });
    mockDb.finding.findFirst.mockResolvedValueOnce(baseFinding);

    const result = await createConsultingFinding(
      {
        engagementId: ENGAGEMENT_ID,
        workspaceId: WORKSPACE_ID,
        primaryEvidenceId: EVIDENCE_ID,
        title: "Cash flow critical",
        summary: "Business at risk",
        severity: "critical",
        impactArea: "finance",
      },
      ACTOR_ID
    );

    expect(mockDb.finding.create).not.toHaveBeenCalled();
    expect(result.id).toBe(FINDING_ID);
  });

  it("blocks finding creation on closed engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce({ ...baseEngagement, status: "CLOSED" });

    await expect(
      createConsultingFinding(
        {
          engagementId: ENGAGEMENT_ID,
          workspaceId: WORKSPACE_ID,
          primaryEvidenceId: EVIDENCE_ID,
          title: "Finding",
          summary: "Summary",
          severity: "high",
          impactArea: "ops",
        },
        ACTOR_ID
      )
    ).rejects.toThrow();
  });

  it("includes rootCause and hypothesis in consultant view", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.evidence.findFirst.mockResolvedValueOnce({ id: EVIDENCE_ID, engagementId: ENGAGEMENT_ID });
    mockDb.finding.findFirst.mockResolvedValueOnce(null);
    mockDb.finding.create.mockResolvedValueOnce(baseFinding);

    const result = await createConsultingFinding(
      {
        engagementId: ENGAGEMENT_ID,
        workspaceId: WORKSPACE_ID,
        primaryEvidenceId: EVIDENCE_ID,
        title: "Cash flow critical",
        summary: "Business at risk",
        severity: "critical",
        impactArea: "finance",
        rootCause: "Overspending on marketing",
        hypothesis: "Cost reduction will fix it",
      },
      ACTOR_ID
    );

    expect(result.rootCause).toBeTruthy();
    expect(result.hypothesis).toBeTruthy();
  });
});

// ─── generateConsultingRecommendation ─────────────────────────────────────────

describe("generateConsultingRecommendation", () => {
  it("generates recommendation linked to finding", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.finding.findFirst.mockResolvedValueOnce(baseFinding);
    mockDb.recommendation.findFirst.mockResolvedValueOnce(null);
    mockDb.recommendation.create.mockResolvedValueOnce(baseRecommendation);

    const result = await generateConsultingRecommendation(
      {
        engagementId: ENGAGEMENT_ID,
        workspaceId: WORKSPACE_ID,
        findingId: FINDING_ID,
        title: "Reduce expenses immediately",
        rationale: "Cash crunch requires immediate action",
        priority: "critical",
        consultingTarget: "CLIENT",
      },
      ACTOR_ID
    );

    expect(result.findingId).toBe(FINDING_ID);
    expect(result.consultingTarget).toBe("CLIENT");
  });

  it("rejects recommendation when finding not found (finding evidence chain required)", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.finding.findFirst.mockResolvedValueOnce(null);

    await expect(
      generateConsultingRecommendation(
        {
          engagementId: ENGAGEMENT_ID,
          workspaceId: WORKSPACE_ID,
          findingId: FINDING_ID,
          title: "Rec without finding",
          rationale: "Should fail",
          priority: "high",
          consultingTarget: "CLIENT",
        },
        ACTOR_ID
      )
    ).rejects.toThrow();
  });

  it("emits CONSULTING_RECOMMENDATION_GENERATED audit event", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.finding.findFirst.mockResolvedValueOnce(baseFinding);
    mockDb.recommendation.findFirst.mockResolvedValueOnce(null);
    mockDb.recommendation.create.mockResolvedValueOnce(baseRecommendation);

    await generateConsultingRecommendation(
      {
        engagementId: ENGAGEMENT_ID,
        workspaceId: WORKSPACE_ID,
        findingId: FINDING_ID,
        title: "Reduce expenses immediately",
        rationale: "Cash crunch",
        priority: "critical",
        consultingTarget: "CLIENT",
      },
      ACTOR_ID
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "consulting.recommendation_generated",
        payload: expect.objectContaining({ consultingTarget: "CLIENT" }),
      })
    );
  });

  it("assigns CONSULTANT target for internal recommendations", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.finding.findFirst.mockResolvedValueOnce(baseFinding);
    mockDb.recommendation.findFirst.mockResolvedValueOnce(null);
    const consultantRec = { ...baseRecommendation, id: "c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };
    mockDb.recommendation.create.mockResolvedValueOnce(consultantRec);

    const result = await generateConsultingRecommendation(
      {
        engagementId: ENGAGEMENT_ID,
        workspaceId: WORKSPACE_ID,
        findingId: FINDING_ID,
        title: "Internal review plan",
        rationale: "For consultant only",
        priority: "medium",
        consultingTarget: "CONSULTANT",
        visibility: "internal",
      },
      ACTOR_ID
    );

    expect(result.consultingTarget).toBe("CONSULTANT");
  });

  it("is idempotent by finding+title", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.finding.findFirst.mockResolvedValueOnce(baseFinding);
    mockDb.recommendation.findFirst.mockResolvedValueOnce(baseRecommendation);

    const result = await generateConsultingRecommendation(
      {
        engagementId: ENGAGEMENT_ID,
        workspaceId: WORKSPACE_ID,
        findingId: FINDING_ID,
        title: "Reduce expenses immediately",
        rationale: "Duplicate",
        priority: "critical",
        consultingTarget: "CLIENT",
      },
      ACTOR_ID
    );

    expect(mockDb.recommendation.create).not.toHaveBeenCalled();
    expect(result.id).toBe(baseRecommendation.id);
  });
});

// ─── assignConsultingAction ────────────────────────────────────────────────────

describe("assignConsultingAction", () => {
  it("assigns action to CLIENT target", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.action.create.mockResolvedValueOnce(baseAction);

    const result = await assignConsultingAction(
      {
        engagementId: ENGAGEMENT_ID,
        workspaceId: WORKSPACE_ID,
        title: "Cut marketing spend",
        priority: "critical",
        consultingTarget: "CLIENT",
      },
      ACTOR_ID
    );

    expect(result.consultingTarget).toBe("CLIENT");
    expect(result.status).toBe("pending");
  });

  it("assigns action to CONSULTANT target", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    const consultantAction = { ...baseAction, metadata: { consultingTarget: "CONSULTANT", priority: "medium" } };
    mockDb.action.create.mockResolvedValueOnce(consultantAction);

    const result = await assignConsultingAction(
      {
        engagementId: ENGAGEMENT_ID,
        workspaceId: WORKSPACE_ID,
        title: "Prepare diagnostic report",
        priority: "medium",
        consultingTarget: "CONSULTANT",
      },
      ACTOR_ID
    );

    expect(result.consultingTarget).toBe("CONSULTANT");
  });

  it("emits CONSULTING_ACTION_ASSIGNED audit event", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.action.create.mockResolvedValueOnce(baseAction);

    await assignConsultingAction(
      {
        engagementId: ENGAGEMENT_ID,
        workspaceId: WORKSPACE_ID,
        title: "Cut marketing spend",
        priority: "critical",
        consultingTarget: "CLIENT",
      },
      ACTOR_ID
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "consulting.action_assigned", workspaceId: WORKSPACE_ID })
    );
  });

  it("blocks action assignment on closed engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce({ ...baseEngagement, status: "CLOSED" });

    await expect(
      assignConsultingAction(
        {
          engagementId: ENGAGEMENT_ID,
          workspaceId: WORKSPACE_ID,
          title: "Should fail",
          priority: "critical",
          consultingTarget: "CLIENT",
        },
        ACTOR_ID
      )
    ).rejects.toThrow();
  });
});

// ─── computeConsultingEngagementHealth ────────────────────────────────────────

describe("computeConsultingEngagementHealth", () => {
  it("returns HEALTHY when no issues", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.finding.findMany.mockResolvedValueOnce([]);
    mockDb.action.findMany.mockResolvedValueOnce([]);

    const health = await computeConsultingEngagementHealth({
      engagementId: ENGAGEMENT_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(health.status).toBe("HEALTHY");
    expect(health.reasons).toHaveLength(0);
  });

  it("returns BLOCKED when unresolved critical findings exist", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.finding.findMany.mockResolvedValueOnce([{ ...baseFinding, severity: "critical", status: "identified" }]);
    mockDb.action.findMany.mockResolvedValueOnce([]);

    const health = await computeConsultingEngagementHealth({
      engagementId: ENGAGEMENT_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(health.status).toBe("BLOCKED");
    expect(health.criticalFindingsUnresolved).toBe(1);
  });

  it("returns AT_RISK when critical actions are unresolved", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.finding.findMany.mockResolvedValueOnce([]);
    mockDb.action.findMany.mockResolvedValueOnce([
      { ...baseAction, status: "pending", metadata: { consultingTarget: "CLIENT", priority: "critical" } },
    ]);

    const health = await computeConsultingEngagementHealth({
      engagementId: ENGAGEMENT_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(health.status).toBe("AT_RISK");
    expect(health.criticalActionsUnresolved).toBe(1);
  });

  it("does not count resolved critical findings as blocking", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.finding.findMany.mockResolvedValueOnce([{ ...baseFinding, severity: "critical", status: "resolved" }]);
    mockDb.action.findMany.mockResolvedValueOnce([]);

    const health = await computeConsultingEngagementHealth({
      engagementId: ENGAGEMENT_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(health.status).toBe("HEALTHY");
  });

  it("counts overdue actions as AT_RISK", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);
    mockDb.finding.findMany.mockResolvedValueOnce([]);
    mockDb.action.findMany.mockResolvedValueOnce([
      {
        ...baseAction,
        status: "pending",
        dueAt: new Date("2020-01-01"),
        metadata: { consultingTarget: "CLIENT", priority: "medium" },
      },
    ]);

    const health = await computeConsultingEngagementHealth({
      engagementId: ENGAGEMENT_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(health.status).toBe("AT_RISK");
    expect(health.overdueActions).toBe(1);
  });
});

// ─── closeConsultingEngagement — closure gate ──────────────────────────────────

describe("closeConsultingEngagement", () => {
  it("closes engagement when no critical actions are unresolved", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce({ ...baseEngagement, consultingPhase: "REVIEW" });
    mockDb.action.findMany.mockResolvedValueOnce([
      { ...baseAction, status: "completed", metadata: { consultingTarget: "CLIENT", priority: "critical" } },
    ]);
    const closed = { ...baseEngagement, status: "CLOSED", actualEndDate: new Date() };
    mockDb.engagement.update.mockResolvedValueOnce(closed);

    const result = await closeConsultingEngagement(
      { engagementId: ENGAGEMENT_ID, workspaceId: WORKSPACE_ID, closureRationale: "All actions completed" },
      ACTOR_ID
    );

    expect(result.status).toBe("CLOSED");
  });

  it("emits CONSULTING_ENGAGEMENT_CLOSED audit event", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce({ ...baseEngagement, consultingPhase: "REVIEW" });
    mockDb.action.findMany.mockResolvedValueOnce([]);
    mockDb.engagement.update.mockResolvedValueOnce({ ...baseEngagement, status: "CLOSED" });

    await closeConsultingEngagement(
      { engagementId: ENGAGEMENT_ID, workspaceId: WORKSPACE_ID, closureRationale: "Done" },
      ACTOR_ID
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "consulting.engagement_closed", workspaceId: WORKSPACE_ID })
    );
  });

  it("closure gate: blocks when unresolved critical actions exist", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce({ ...baseEngagement, consultingPhase: "REVIEW" });
    mockDb.action.findMany.mockResolvedValueOnce([
      { ...baseAction, status: "pending", metadata: { consultingTarget: "CLIENT", priority: "critical" } },
    ]);

    await expect(
      closeConsultingEngagement(
        { engagementId: ENGAGEMENT_ID, workspaceId: WORKSPACE_ID, closureRationale: "Trying to close early" },
        ACTOR_ID
      )
    ).rejects.toThrow(/critical action/i);
  });

  it("closure gate: allows close when critical action is cancelled", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce({ ...baseEngagement, consultingPhase: "REVIEW" });
    mockDb.action.findMany.mockResolvedValueOnce([
      { ...baseAction, status: "cancelled", metadata: { consultingTarget: "CLIENT", priority: "critical" } },
    ]);
    mockDb.engagement.update.mockResolvedValueOnce({ ...baseEngagement, status: "CLOSED" });

    const result = await closeConsultingEngagement(
      { engagementId: ENGAGEMENT_ID, workspaceId: WORKSPACE_ID, closureRationale: "Critical action cancelled" },
      ACTOR_ID
    );

    expect(result.status).toBe("CLOSED");
  });

  it("throws ConflictError for already-closed engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce({ ...baseEngagement, status: "CLOSED" });

    await expect(
      closeConsultingEngagement(
        { engagementId: ENGAGEMENT_ID, workspaceId: WORKSPACE_ID, closureRationale: "Re-close" },
        ACTOR_ID
      )
    ).rejects.toThrow();
  });
});

// ─── getConsultingEngagement — workspace isolation ────────────────────────────

describe("getConsultingEngagement — workspace isolation", () => {
  it("returns not found when engagement is in different workspace", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(null);

    await expect(
      getConsultingEngagement({ engagementId: ENGAGEMENT_ID, workspaceId: "wrong-workspace-id" }, true)
    ).rejects.toThrow();
  });

  it("returns consultant DTO for consultant view", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);

    const result = await getConsultingEngagement({ engagementId: ENGAGEMENT_ID, workspaceId: WORKSPACE_ID }, true);

    expect((result as Record<string, unknown>).consultantNotes).toBeDefined();
  });

  it("returns client DTO for client view (redacted)", async () => {
    mockDb.engagement.findFirst.mockResolvedValueOnce(baseEngagement);

    const result = await getConsultingEngagement({ engagementId: ENGAGEMENT_ID, workspaceId: WORKSPACE_ID }, false);

    expect((result as Record<string, unknown>).consultantNotes).toBeUndefined();
    expect((result as Record<string, unknown>).assignedConsultantId).toBeUndefined();
  });
});

// ─── listConsultingEngagements ─────────────────────────────────────────────────

describe("listConsultingEngagements", () => {
  it("returns all consulting-mode engagements for workspace", async () => {
    mockDb.engagement.findMany.mockResolvedValueOnce([baseEngagement, { ...baseEngagement, id: "a2eebc99-9c0b-4ef8-bb6d-6bb9bd380a99", title: "Second" }]);

    const results = await listConsultingEngagements({ workspaceId: WORKSPACE_ID }, true);

    expect(results).toHaveLength(2);
  });

  it("returns empty array when no engagements", async () => {
    mockDb.engagement.findMany.mockResolvedValueOnce([]);

    const results = await listConsultingEngagements({ workspaceId: WORKSPACE_ID }, true);

    expect(results).toHaveLength(0);
  });
});
