/**
 * Bundle 7 Slice 3 — Audit Completeness Tests
 *
 * Verifies that every material consulting mutation emits exactly one audit
 * event with the correct eventName, actorId, workspaceId, and entityId, and
 * that all read-only paths emit zero events.
 *
 * Pattern: vi.hoisted + vi.resetAllMocks() (same as Slice 1).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDb, mockEmitAuditEvent } = vi.hoisted(() => {
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
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: vi.fn().mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
      return fn({ engagement: mockDb.engagement, action: mockDb.action });
    }),
  };
  const mockEmitAuditEvent = vi.fn().mockResolvedValue(undefined);
  return { mockDb, mockEmitAuditEvent };
});

vi.mock("@/lib/db", () => ({ db: mockDb, getDbInstance: vi.fn().mockResolvedValue({}) }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: mockEmitAuditEvent }));

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
  updateConsultingEngagementHealth,
  updateConsultingEngagementDimensions,
} from "@/services/consulting/consulting-engagement.service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS = "ws-audit-test";
const ACTOR = "actor-audit-test";
const ENG_ID = "eng-audit-001";
const FINDING_ID = "finding-audit-001";
const REC_ID = "rec-audit-001";
const ACTION_ID = "action-audit-001";
const EVIDENCE_ID = "evidence-audit-001";

function makeEngRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ENG_ID,
    workspaceId: WS,
    title: "Audit Test Engagement",
    clientId: "client-001",
    code: "ENG-AUDIT",
    status: "ACTIVE",
    healthStatus: "HEALTHY",
    engagementMode: "consulting",
    interventionMode: "recovery",
    interventionPhase: "triage",
    serviceTier: "standard",
    consultingPhase: "DISCOVERY",
    consultantNotes: null,
    humanFactors: null,
    assignedConsultantId: null,
    createdBy: ACTOR,
    description: null,
    actualEndDate: null,
    targetEndDate: null,
    createdAt: new Date("2026-07-24T00:00:00Z"),
    updatedAt: new Date("2026-07-24T00:00:00Z"),
    ...overrides,
  };
}

function makeActionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTION_ID,
    engagementId: ENG_ID,
    title: "Audit Action",
    description: null,
    status: "pending",
    assignedTo: null,
    dueAt: null,
    metadata: { consultingTarget: "CLIENT", priority: "high" },
    recommendationId: null,
    version: 1,
    createdAt: new Date("2026-07-24T00:00:00Z"),
    updatedAt: new Date("2026-07-24T00:00:00Z"),
    ...overrides,
  };
}

function makeFindingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: FINDING_ID,
    engagementId: ENG_ID,
    primaryEvidenceId: EVIDENCE_ID,
    title: "Audit Finding",
    summary: "Summary",
    severity: "high",
    impactArea: "ops",
    status: "identified",
    confidenceScore: null,
    hypothesis: null,
    rootCause: null,
    consequence: null,
    version: 1,
    createdAt: new Date("2026-07-24T00:00:00Z"),
    updatedAt: new Date("2026-07-24T00:00:00Z"),
    ...overrides,
  };
}

function makeRecRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REC_ID,
    engagementId: ENG_ID,
    findingId: FINDING_ID,
    workspaceId: WS,
    title: "Audit Rec",
    description: null,
    rationale: "Rationale",
    priority: "high",
    estimatedImpact: null,
    status: "pending",
    visibility: "client",
    version: 1,
    createdBy: ACTOR,
    createdAt: new Date("2026-07-24T00:00:00Z"),
    updatedAt: new Date("2026-07-24T00:00:00Z"),
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockEmitAuditEvent.mockResolvedValue(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockDb.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
    return fn({ engagement: mockDb.engagement, action: mockDb.action });
  });
});

// ─── 1. createConsultingEngagement ────────────────────────────────────────────

describe("createConsultingEngagement — audit event", () => {
  it("emits CONSULTING_ENGAGEMENT_CREATED on new engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null); // no existing
    mockDb.engagement.create = vi.fn().mockResolvedValue(makeEngRow());

    await createConsultingEngagement(
      { title: "Audit Test Engagement", clientId: "client-001", workspaceId: WS },
      ACTOR
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(1);
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.eventName).toBe("consulting.engagement_created");
    expect(call.actorId).toBe(ACTOR);
    expect(call.workspaceId).toBe(WS);
    expect(typeof call.entityId).toBe("string");
    expect(call.entityId.length).toBeGreaterThan(0);
  });

  it("emits event with correct payload fields", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);
    mockDb.engagement.create = vi.fn().mockResolvedValue(makeEngRow());

    await createConsultingEngagement(
      { title: "Audit Test Engagement", clientId: "client-001", workspaceId: WS },
      ACTOR
    );

    const payload = mockEmitAuditEvent.mock.calls[0][0].payload;
    expect(payload).toHaveProperty("title");
    expect(payload).toHaveProperty("clientId");
    expect(payload).toHaveProperty("consultingPhase", "DISCOVERY");
  });

  it("does NOT emit when returning existing idempotent engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());

    await createConsultingEngagement(
      { title: "Audit Test Engagement", clientId: "client-001", workspaceId: WS },
      ACTOR
    );

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });
});

// ─── 2. getConsultingEngagement — READ — no emit ──────────────────────────────

describe("getConsultingEngagement — read path — no audit event", () => {
  it("emits nothing on successful read (consultant view)", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());

    await getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS }, true);

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("emits nothing on successful read (client view)", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());

    await getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS }, false);

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });
});

// ─── 3. listConsultingEngagements — READ — no emit ───────────────────────────

describe("listConsultingEngagements — read path — no audit event", () => {
  it("emits nothing on list (consultant view)", async () => {
    mockDb.engagement.findMany.mockResolvedValue([makeEngRow()]);

    await listConsultingEngagements({ workspaceId: WS }, true);

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("emits nothing on empty list", async () => {
    mockDb.engagement.findMany.mockResolvedValue([]);

    await listConsultingEngagements({ workspaceId: WS }, false);

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });
});

// ─── 4. advanceConsultingPhase ────────────────────────────────────────────────

describe("advanceConsultingPhase — audit event", () => {
  it("emits CONSULTING_PHASE_ADVANCED on valid transition", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow({ consultingPhase: "DISCOVERY" }));
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ consultingPhase: "DIAGNOSIS" }));

    await advanceConsultingPhase(
      { engagementId: ENG_ID, workspaceId: WS, targetPhase: "DIAGNOSIS", rationale: "Ready for diagnosis" },
      ACTOR
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(1);
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.eventName).toBe("consulting.phase_advanced");
    expect(call.actorId).toBe(ACTOR);
    expect(call.workspaceId).toBe(WS);
    expect(call.entityId).toBe(ENG_ID);
  });

  it("emits payload with from, to, rationale", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow({ consultingPhase: "DISCOVERY" }));
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ consultingPhase: "DIAGNOSIS" }));

    await advanceConsultingPhase(
      { engagementId: ENG_ID, workspaceId: WS, targetPhase: "DIAGNOSIS", rationale: "Diagnosis ready" },
      ACTOR
    );

    const payload = mockEmitAuditEvent.mock.calls[0][0].payload;
    expect(payload.from).toBe("DISCOVERY");
    expect(payload.to).toBe("DIAGNOSIS");
    expect(payload.rationale).toBe("Diagnosis ready");
  });

  it("does NOT emit on invalid transition (rejected before audit)", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow({ consultingPhase: "DISCOVERY" }));

    await expect(
      advanceConsultingPhase(
        { engagementId: ENG_ID, workspaceId: WS, targetPhase: "REVIEW", rationale: "skip" },
        ACTOR
      )
    ).rejects.toThrow();

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("emits IMPLEMENTATION phase transition event correctly", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow({ consultingPhase: "DIAGNOSIS" }));
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ consultingPhase: "IMPLEMENTATION" }));

    await advanceConsultingPhase(
      { engagementId: ENG_ID, workspaceId: WS, targetPhase: "IMPLEMENTATION", rationale: "Proceeding" },
      ACTOR
    );

    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.eventName).toBe("consulting.phase_advanced");
    expect(call.payload.from).toBe("DIAGNOSIS");
    expect(call.payload.to).toBe("IMPLEMENTATION");
  });

  it("emits REVIEW transition event correctly", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow({ consultingPhase: "IMPLEMENTATION" }));
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ consultingPhase: "REVIEW" }));

    await advanceConsultingPhase(
      { engagementId: ENG_ID, workspaceId: WS, targetPhase: "REVIEW", rationale: "Final review" },
      ACTOR
    );

    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.eventName).toBe("consulting.phase_advanced");
    expect(call.payload.to).toBe("REVIEW");
  });
});

// ─── 5. createConsultingFinding ───────────────────────────────────────────────

describe("createConsultingFinding — audit event", () => {
  it("emits CONSULTING_FINDING_CREATED on new finding", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.evidence.findFirst.mockResolvedValue({ id: EVIDENCE_ID, engagementId: ENG_ID });
    mockDb.finding.findFirst.mockResolvedValue(null); // no existing
    mockDb.finding.create = vi.fn().mockResolvedValue(makeFindingRow());

    await createConsultingFinding(
      {
        engagementId: ENG_ID,
        workspaceId: WS,
        primaryEvidenceId: EVIDENCE_ID,
        title: "Audit Finding",
        summary: "Summary",
        severity: "high",
        impactArea: "ops",
      },
      ACTOR
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(1);
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.eventName).toBe("consulting.finding_created");
    expect(call.actorId).toBe(ACTOR);
    expect(call.workspaceId).toBe(WS);
    expect(call.entityId).toBe(FINDING_ID);
  });

  it("emits payload with engagementId, severity, title", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.evidence.findFirst.mockResolvedValue({ id: EVIDENCE_ID, engagementId: ENG_ID });
    mockDb.finding.findFirst.mockResolvedValue(null);
    mockDb.finding.create = vi.fn().mockResolvedValue(makeFindingRow());

    await createConsultingFinding(
      {
        engagementId: ENG_ID,
        workspaceId: WS,
        primaryEvidenceId: EVIDENCE_ID,
        title: "Audit Finding",
        summary: "Summary",
        severity: "critical",
        impactArea: "revenue",
      },
      ACTOR
    );

    const payload = mockEmitAuditEvent.mock.calls[0][0].payload;
    expect(payload.engagementId).toBe(ENG_ID);
    expect(payload.severity).toBe("critical");
    expect(payload.title).toBe("Audit Finding");
  });

  it("does NOT emit when returning existing idempotent finding", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.evidence.findFirst.mockResolvedValue({ id: EVIDENCE_ID, engagementId: ENG_ID });
    mockDb.finding.findFirst.mockResolvedValue(makeFindingRow()); // existing → idempotent return

    await createConsultingFinding(
      {
        engagementId: ENG_ID,
        workspaceId: WS,
        primaryEvidenceId: EVIDENCE_ID,
        title: "Audit Finding",
        summary: "Summary",
        severity: "high",
        impactArea: "ops",
      },
      ACTOR
    );

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("does NOT emit when evidence validation fails", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.evidence.findFirst.mockResolvedValue(null); // evidence not found

    await expect(
      createConsultingFinding(
        {
          engagementId: ENG_ID,
          workspaceId: WS,
          primaryEvidenceId: EVIDENCE_ID,
          title: "Finding",
          summary: "Summary",
          severity: "high",
          impactArea: "ops",
        },
        ACTOR
      )
    ).rejects.toThrow();

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });
});

// ─── 6. generateConsultingRecommendation ─────────────────────────────────────

describe("generateConsultingRecommendation — audit event", () => {
  it("emits CONSULTING_RECOMMENDATION_GENERATED on new recommendation", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.finding.findFirst.mockResolvedValue(makeFindingRow());
    mockDb.recommendation.findFirst.mockResolvedValue(null); // no existing
    mockDb.recommendation.create = vi.fn().mockResolvedValue(makeRecRow());

    await generateConsultingRecommendation(
      {
        engagementId: ENG_ID,
        workspaceId: WS,
        findingId: FINDING_ID,
        title: "Audit Rec",
        rationale: "Rationale",
        priority: "high",
        consultingTarget: "CLIENT",
      },
      ACTOR
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(1);
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.eventName).toBe("consulting.recommendation_generated");
    expect(call.actorId).toBe(ACTOR);
    expect(call.workspaceId).toBe(WS);
    expect(call.entityId).toBe(REC_ID);
  });

  it("emits payload with engagementId, findingId, priority, consultingTarget", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.finding.findFirst.mockResolvedValue(makeFindingRow());
    mockDb.recommendation.findFirst.mockResolvedValue(null);
    mockDb.recommendation.create = vi.fn().mockResolvedValue(makeRecRow());

    await generateConsultingRecommendation(
      {
        engagementId: ENG_ID,
        workspaceId: WS,
        findingId: FINDING_ID,
        title: "Audit Rec",
        rationale: "Rationale",
        priority: "critical",
        consultingTarget: "CONSULTANT",
      },
      ACTOR
    );

    const payload = mockEmitAuditEvent.mock.calls[0][0].payload;
    expect(payload.engagementId).toBe(ENG_ID);
    expect(payload.findingId).toBe(FINDING_ID);
    expect(payload.priority).toBe("critical");
    expect(payload.consultingTarget).toBe("CONSULTANT");
  });

  it("does NOT emit when returning idempotent existing recommendation", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.finding.findFirst.mockResolvedValue(makeFindingRow());
    mockDb.recommendation.findFirst.mockResolvedValue(makeRecRow()); // existing

    await generateConsultingRecommendation(
      {
        engagementId: ENG_ID,
        workspaceId: WS,
        findingId: FINDING_ID,
        title: "Audit Rec",
        rationale: "Rationale",
        priority: "high",
        consultingTarget: "CLIENT",
      },
      ACTOR
    );

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("does NOT emit when finding validation fails", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.finding.findFirst.mockResolvedValue(null); // finding not in engagement

    await expect(
      generateConsultingRecommendation(
        {
          engagementId: ENG_ID,
          workspaceId: WS,
          findingId: FINDING_ID,
          title: "Rec",
          rationale: "R",
          priority: "high",
          consultingTarget: "CLIENT",
        },
        ACTOR
      )
    ).rejects.toThrow();

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });
});

// ─── 7. assignConsultingAction ────────────────────────────────────────────────

describe("assignConsultingAction — audit event", () => {
  it("emits CONSULTING_ACTION_ASSIGNED on assignment", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.action.create = vi.fn().mockResolvedValue(makeActionRow());

    await assignConsultingAction(
      {
        engagementId: ENG_ID,
        workspaceId: WS,
        title: "Audit Action",
        priority: "high",
        consultingTarget: "CLIENT",
      },
      ACTOR
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(1);
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.eventName).toBe("consulting.action_assigned");
    expect(call.actorId).toBe(ACTOR);
    expect(call.workspaceId).toBe(WS);
    expect(call.entityId).toBe(ACTION_ID);
  });

  it("emits payload with engagementId, consultingTarget, priority, title", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.action.create = vi.fn().mockResolvedValue(makeActionRow());

    await assignConsultingAction(
      {
        engagementId: ENG_ID,
        workspaceId: WS,
        title: "Audit Action",
        priority: "critical",
        consultingTarget: "CONSULTANT",
      },
      ACTOR
    );

    const payload = mockEmitAuditEvent.mock.calls[0][0].payload;
    expect(payload.engagementId).toBe(ENG_ID);
    expect(payload.consultingTarget).toBe("CONSULTANT");
    expect(payload.priority).toBe("critical");
    expect(payload.title).toBe("Audit Action");
  });

  it("does NOT emit when engagement not found", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);

    await expect(
      assignConsultingAction(
        { engagementId: ENG_ID, workspaceId: WS, title: "Action", priority: "high", consultingTarget: "CLIENT" },
        ACTOR
      )
    ).rejects.toThrow();

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("emits for CLIENT target", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.action.create = vi.fn().mockResolvedValue(makeActionRow({ metadata: { consultingTarget: "CLIENT", priority: "low" } }));

    await assignConsultingAction(
      { engagementId: ENG_ID, workspaceId: WS, title: "Client action", priority: "low", consultingTarget: "CLIENT" },
      ACTOR
    );

    expect(mockEmitAuditEvent.mock.calls[0][0].payload.consultingTarget).toBe("CLIENT");
  });
});

// ─── 8. computeConsultingEngagementHealth — READ — no emit ────────────────────

describe("computeConsultingEngagementHealth — read path — no audit event", () => {
  it("emits nothing on healthy engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);

    await computeConsultingEngagementHealth({ engagementId: ENG_ID, workspaceId: WS });

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("emits nothing on blocked engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.finding.findMany.mockResolvedValue([
      { ...makeFindingRow(), severity: "critical", status: "identified" },
    ]);
    mockDb.action.findMany.mockResolvedValue([]);

    await computeConsultingEngagementHealth({ engagementId: ENG_ID, workspaceId: WS });

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });
});

// ─── 9. closeConsultingEngagement ─────────────────────────────────────────────

describe("closeConsultingEngagement — audit event", () => {
  it("emits CONSULTING_ENGAGEMENT_CLOSED on successful closure", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow({ consultingPhase: "REVIEW" }));
    mockDb.action.findMany.mockResolvedValue([]); // no blocking critical actions
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ status: "CLOSED", consultingPhase: "REVIEW" }));

    await closeConsultingEngagement(
      { engagementId: ENG_ID, workspaceId: WS, closureRationale: "Work complete" },
      ACTOR
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(1);
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.eventName).toBe("consulting.engagement_closed");
    expect(call.actorId).toBe(ACTOR);
    expect(call.workspaceId).toBe(WS);
    expect(call.entityId).toBe(ENG_ID);
  });

  it("emits payload with closureRationale, outcomeSummary, consultingPhase", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow({ consultingPhase: "REVIEW" }));
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ status: "CLOSED", consultingPhase: "REVIEW" }));

    await closeConsultingEngagement(
      { engagementId: ENG_ID, workspaceId: WS, closureRationale: "Project delivered", outcomeSummary: "All goals met" },
      ACTOR
    );

    const payload = mockEmitAuditEvent.mock.calls[0][0].payload;
    expect(payload.closureRationale).toBe("Project delivered");
    expect(payload.outcomeSummary).toBe("All goals met");
    expect(payload.consultingPhase).toBe("REVIEW");
  });

  it("does NOT emit when closure is blocked by unresolved critical actions", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.action.findMany.mockResolvedValue([
      makeActionRow({ status: "pending", metadata: { consultingTarget: "CLIENT", priority: "critical" } }),
    ]);

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS, closureRationale: "Premature" },
        ACTOR
      )
    ).rejects.toThrow();

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("does NOT emit when engagement is already closed", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow({ status: "CLOSED" }));

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS, closureRationale: "Already closed" },
        ACTOR
      )
    ).rejects.toThrow();

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("does NOT emit when engagement is not found", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS, closureRationale: "Not found" },
        ACTOR
      )
    ).rejects.toThrow();

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("emits with outcomeSummary null when not provided", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow({ consultingPhase: "REVIEW" }));
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ status: "CLOSED", consultingPhase: "REVIEW" }));

    await closeConsultingEngagement(
      { engagementId: ENG_ID, workspaceId: WS, closureRationale: "Done" },
      ACTOR
    );

    const payload = mockEmitAuditEvent.mock.calls[0][0].payload;
    expect(payload.outcomeSummary).toBeNull();
  });
});

// ─── 10. Cross-cutting: entityType field ──────────────────────────────────────

describe("audit event entityType field correctness", () => {
  it("createConsultingEngagement emits entityType Engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);
    mockDb.engagement.create = vi.fn().mockResolvedValue(makeEngRow());

    await createConsultingEngagement(
      { title: "ET Test", clientId: "c1", workspaceId: WS },
      ACTOR
    );

    expect(mockEmitAuditEvent.mock.calls[0][0].entityType).toBe("Engagement");
  });

  it("advanceConsultingPhase emits entityType Engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ consultingPhase: "DIAGNOSIS" }));

    await advanceConsultingPhase(
      { engagementId: ENG_ID, workspaceId: WS, targetPhase: "DIAGNOSIS", rationale: "r" },
      ACTOR
    );

    expect(mockEmitAuditEvent.mock.calls[0][0].entityType).toBe("Engagement");
  });

  it("createConsultingFinding emits entityType Finding", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.evidence.findFirst.mockResolvedValue({ id: EVIDENCE_ID, engagementId: ENG_ID });
    mockDb.finding.findFirst.mockResolvedValue(null);
    mockDb.finding.create = vi.fn().mockResolvedValue(makeFindingRow());

    await createConsultingFinding(
      {
        engagementId: ENG_ID, workspaceId: WS, primaryEvidenceId: EVIDENCE_ID,
        title: "F", summary: "S", severity: "high", impactArea: "ops",
      },
      ACTOR
    );

    expect(mockEmitAuditEvent.mock.calls[0][0].entityType).toBe("Finding");
  });

  it("generateConsultingRecommendation emits entityType Recommendation", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.finding.findFirst.mockResolvedValue(makeFindingRow());
    mockDb.recommendation.findFirst.mockResolvedValue(null);
    mockDb.recommendation.create = vi.fn().mockResolvedValue(makeRecRow());

    await generateConsultingRecommendation(
      {
        engagementId: ENG_ID, workspaceId: WS, findingId: FINDING_ID,
        title: "R", rationale: "rat", priority: "high", consultingTarget: "CLIENT",
      },
      ACTOR
    );

    expect(mockEmitAuditEvent.mock.calls[0][0].entityType).toBe("Recommendation");
  });

  it("assignConsultingAction emits entityType Action", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.action.create = vi.fn().mockResolvedValue(makeActionRow());

    await assignConsultingAction(
      { engagementId: ENG_ID, workspaceId: WS, title: "A", priority: "high", consultingTarget: "CLIENT" },
      ACTOR
    );

    expect(mockEmitAuditEvent.mock.calls[0][0].entityType).toBe("Action");
  });

  it("closeConsultingEngagement emits entityType Engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow({ consultingPhase: "REVIEW" }));
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ status: "CLOSED", consultingPhase: "REVIEW" }));

    await closeConsultingEngagement(
      { engagementId: ENG_ID, workspaceId: WS, closureRationale: "Done" },
      ACTOR
    );

    expect(mockEmitAuditEvent.mock.calls[0][0].entityType).toBe("Engagement");
  });
});

// ─── 10b. updateConsultingEngagementHealth ────────────────────────────────────

describe("updateConsultingEngagementHealth — audit event", () => {
  it("emits CONSULTING_HEALTH_UPDATED on successful update", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ healthStatus: "healthy" }));

    await updateConsultingEngagementHealth({ engagementId: ENG_ID, workspaceId: WS }, ACTOR);

    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(1);
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.eventName).toBe("consulting.health_updated");
    expect(call.actorId).toBe(ACTOR);
    expect(call.workspaceId).toBe(WS);
    expect(call.entityId).toBe(ENG_ID);
    expect(call.entityType).toBe("Engagement");
  });

  it("emits payload with status, reasons, and counts", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.finding.findMany.mockResolvedValue([
      { ...makeFindingRow(), severity: "critical", status: "identified" },
    ]);
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ healthStatus: "blocked" }));

    await updateConsultingEngagementHealth({ engagementId: ENG_ID, workspaceId: WS }, ACTOR);

    const payload = mockEmitAuditEvent.mock.calls[0][0].payload;
    expect(payload.status).toBe("BLOCKED");
    expect(Array.isArray(payload.reasons)).toBe(true);
    expect(payload.criticalFindingsUnresolved).toBe(1);
    expect(payload.criticalActionsUnresolved).toBe(0);
    expect(payload.overdueActions).toBe(0);
  });

  it("does NOT emit when engagement not found", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);

    await expect(
      updateConsultingEngagementHealth({ engagementId: ENG_ID, workspaceId: WS }, ACTOR)
    ).rejects.toThrow();

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });
});

// ─── 10c. updateConsultingEngagementDimensions ────────────────────────────────

describe("updateConsultingEngagementDimensions — audit event", () => {
  it("emits CONSULTING_DIMENSION_UPDATED on successful update", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ interventionMode: "growth" }));

    await updateConsultingEngagementDimensions(
      { engagementId: ENG_ID, workspaceId: WS, interventionMode: "growth" },
      ACTOR
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(1);
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.eventName).toBe("consulting.dimension_updated");
    expect(call.actorId).toBe(ACTOR);
    expect(call.workspaceId).toBe(WS);
    expect(call.entityId).toBe(ENG_ID);
    expect(call.entityType).toBe("Engagement");
  });

  it("emits payload recording which dimensions changed", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ interventionPhase: "rebuild" }));

    await updateConsultingEngagementDimensions(
      { engagementId: ENG_ID, workspaceId: WS, interventionPhase: "rebuild" },
      ACTOR
    );

    const payload = mockEmitAuditEvent.mock.calls[0][0].payload;
    expect(payload.interventionPhase).toBe("rebuild");
    expect(payload.interventionMode).toBeNull();
    expect(typeof payload.humanFactorsUpdated).toBe("boolean");
  });

  it("emits humanFactorsUpdated=true when humanFactors provided", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow());

    await updateConsultingEngagementDimensions(
      {
        engagementId: ENG_ID,
        workspaceId: WS,
        humanFactors: {
          ownerBottleneckRisk: "HIGH",
          followThroughRisk: null,
          resistanceToChange: null,
          communicationBreakdownRisk: null,
          moraleFragility: null,
          managementCapabilityGap: null,
          keyPersonDependency: false,
          accountabilityWeakness: null,
        },
      },
      ACTOR
    );

    const payload = mockEmitAuditEvent.mock.calls[0][0].payload;
    expect(payload.humanFactorsUpdated).toBe(true);
  });

  it("does NOT emit when engagement not found", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);

    await expect(
      updateConsultingEngagementDimensions(
        { engagementId: ENG_ID, workspaceId: WS, interventionMode: "growth" },
        ACTOR
      )
    ).rejects.toThrow();

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });
});

// ─── 11. Zero-event guarantee on all 3 read paths in a single run ─────────────

describe("all read paths — combined zero-event guarantee", () => {
  it("three consecutive read operations emit zero events total", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.engagement.findMany.mockResolvedValue([makeEngRow()]);
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);

    await getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS }, true);
    await listConsultingEngagements({ workspaceId: WS }, true);
    await computeConsultingEngagementHealth({ engagementId: ENG_ID, workspaceId: WS });

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });
});
