/**
 * Bundle 4.2 — Owner BCP service tests.
 *
 * Covers: derivation engine, create (idempotent), evaluate (version snapshots),
 * validation guards, DTO boundary (inputFactsJson excluded), workspace isolation,
 * audit events, all four OpsIQ dimensions updated on every re-evaluation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
// vi.hoisted ensures these are available when vi.mock factories run (hoisted before const).

const { mockDb, mockEmitAuditEvent } = vi.hoisted(() => {
  const mockDb = {
    ownerBusinessConditionProfile: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const mockEmitAuditEvent = vi.fn();
  return { mockDb, mockEmitAuditEvent };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: mockEmitAuditEvent }));

vi.mock("@/domain/constants/audit-events", () => ({
  AUDIT_EVENTS: {
    OWNER_BCP_CREATED: "owner_bcp.created",
    OWNER_BCP_EVALUATED: "owner_bcp.evaluated",
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  createConditionProfile,
  evaluateConditionProfile,
  getCurrentConditionProfile,
  getConditionProfileById,
  getConditionProfileHistory,
  deriveOverallScore,
  deriveConditionCode,
  deriveConditionSeverity,
  deriveInterventionMode,
  deriveInterventionPhase,
  deriveRecommendationPriority,
  deriveReviewCadence,
  deriveHealthStatus,
  deriveConsultingLifecycleStage,
  deriveAllBcpFields,
  clampScore,
  type BcpInputFacts,
} from "@/services/owner-mode/owner-bcp.service";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HEALTHY_FACTS: BcpInputFacts = {
  financialHealthScore: 80,
  operationalHealthScore: 75,
  salesHealthScore: 85,
  sopHealthScore: 78,
  humanExecutionRisk: "LOW",
};

const CRITICAL_FACTS: BcpInputFacts = {
  financialHealthScore: 10,
  operationalHealthScore: 15,
  salesHealthScore: 8,
  sopHealthScore: 20,
  humanExecutionRisk: "CRITICAL",
};

const DISTRESSED_FACTS: BcpInputFacts = {
  financialHealthScore: 40,
  operationalHealthScore: 35,
  salesHealthScore: 45,
  sopHealthScore: 38,
  humanExecutionRisk: "HIGH",
};

const STABLE_FACTS: BcpInputFacts = {
  financialHealthScore: 60,
  operationalHealthScore: 65,
  salesHealthScore: 55,
  sopHealthScore: 62,
  humanExecutionRisk: "MEDIUM",
};

const GROWING_FACTS: BcpInputFacts = {
  financialHealthScore: 75,
  operationalHealthScore: 78,
  salesHealthScore: 80,
  sopHealthScore: 72,
  humanExecutionRisk: "LOW",
};

function makeBcpRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "bcp-1",
    workspaceId: "ws-1",
    businessId: "biz-1",
    version: 1,
    isCurrent: true,
    conditionCode: "STABLE",
    conditionSeverity: "MEDIUM",
    consultingLifecycleStage: "STABILIZATION",
    businessConditionScore: 61,
    interventionMode: "OPTIMIZE",
    interventionPhase: "EXECUTION",
    humanExecutionRisk: "MEDIUM",
    financialHealthScore: 60,
    operationalHealthScore: 65,
    salesHealthScore: 55,
    sopHealthScore: 62,
    recommendationPriority: "MEDIUM",
    reviewCadence: "BIWEEKLY",
    healthStatus: "STABLE",
    triggerType: "INITIAL",
    triggerDescription: "Initial assessment",
    triggeredBy: "actor-1",
    inputFactsJson: JSON.stringify(STABLE_FACTS),
    sourceReassessmentEventId: null,
    createdAt: new Date("2026-07-24T00:00:00Z"),
    ...overrides,
  };
}

function resetMocks() {
  vi.clearAllMocks();
  mockEmitAuditEvent.mockResolvedValue(undefined);
}

// ─── Derivation engine ────────────────────────────────────────────────────────

describe("clampScore", () => {
  it("clamps below 0 to 0", () => expect(clampScore(-5)).toBe(0));
  it("clamps above 100 to 100", () => expect(clampScore(150)).toBe(100));
  it("rounds 60.6 to 61", () => expect(clampScore(60.6)).toBe(61));
  it("passes 50 through", () => expect(clampScore(50)).toBe(50));
});

describe("deriveOverallScore", () => {
  it("averages four domain scores", () => {
    expect(deriveOverallScore({ financialHealthScore: 80, operationalHealthScore: 80, salesHealthScore: 80, sopHealthScore: 80, humanExecutionRisk: "LOW" })).toBe(80);
  });
  it("rounds to nearest integer", () => {
    expect(deriveOverallScore({ financialHealthScore: 61, operationalHealthScore: 62, salesHealthScore: 63, sopHealthScore: 64, humanExecutionRisk: "LOW" })).toBe(63);
  });
});

describe("deriveConditionCode", () => {
  it("score < 30 → CRITICAL", () => expect(deriveConditionCode(20)).toBe("CRITICAL"));
  it("score 29 → CRITICAL", () => expect(deriveConditionCode(29)).toBe("CRITICAL"));
  it("score 30 → DISTRESSED", () => expect(deriveConditionCode(30)).toBe("DISTRESSED"));
  it("score 49 → DISTRESSED", () => expect(deriveConditionCode(49)).toBe("DISTRESSED"));
  it("score 50 → STABLE", () => expect(deriveConditionCode(50)).toBe("STABLE"));
  it("score 69 → STABLE", () => expect(deriveConditionCode(69)).toBe("STABLE"));
  it("score 70 → GROWING", () => expect(deriveConditionCode(70)).toBe("GROWING"));
  it("score 84 → GROWING", () => expect(deriveConditionCode(84)).toBe("GROWING"));
  it("score 85 → THRIVING", () => expect(deriveConditionCode(85)).toBe("THRIVING"));
  it("score 100 → THRIVING", () => expect(deriveConditionCode(100)).toBe("THRIVING"));
});

describe("deriveConditionSeverity", () => {
  it("CRITICAL → CRITICAL", () => expect(deriveConditionSeverity("CRITICAL")).toBe("CRITICAL"));
  it("DISTRESSED → HIGH", () => expect(deriveConditionSeverity("DISTRESSED")).toBe("HIGH"));
  it("STABLE → MEDIUM", () => expect(deriveConditionSeverity("STABLE")).toBe("MEDIUM"));
  it("GROWING → LOW", () => expect(deriveConditionSeverity("GROWING")).toBe("LOW"));
  it("THRIVING → LOW", () => expect(deriveConditionSeverity("THRIVING")).toBe("LOW"));
});

describe("deriveInterventionMode", () => {
  it("CRITICAL → RECOVER", () => expect(deriveInterventionMode("CRITICAL")).toBe("RECOVER"));
  it("DISTRESSED → STABILIZE", () => expect(deriveInterventionMode("DISTRESSED")).toBe("STABILIZE"));
  it("STABLE → OPTIMIZE", () => expect(deriveInterventionMode("STABLE")).toBe("OPTIMIZE"));
  it("GROWING → SCALE", () => expect(deriveInterventionMode("GROWING")).toBe("SCALE"));
  it("THRIVING → MAINTAIN", () => expect(deriveInterventionMode("THRIVING")).toBe("MAINTAIN"));
});

describe("deriveInterventionPhase", () => {
  it("RECOVER defaults to TRIAGE", () => expect(deriveInterventionPhase("RECOVER")).toBe("TRIAGE"));
  it("STABILIZE defaults to PLANNING", () => expect(deriveInterventionPhase("STABILIZE")).toBe("PLANNING"));
  it("OPTIMIZE defaults to EXECUTION", () => expect(deriveInterventionPhase("OPTIMIZE")).toBe("EXECUTION"));
  it("SCALE defaults to REVIEW", () => expect(deriveInterventionPhase("SCALE")).toBe("REVIEW"));
  it("MAINTAIN defaults to MONITORING", () => expect(deriveInterventionPhase("MAINTAIN")).toBe("MONITORING"));
  it("uses supplied phase when provided", () => expect(deriveInterventionPhase("RECOVER", "EXECUTION")).toBe("EXECUTION"));
});

describe("deriveRecommendationPriority", () => {
  it("CRITICAL → URGENT regardless of human risk", () => {
    expect(deriveRecommendationPriority("CRITICAL", "LOW")).toBe("URGENT");
  });
  it("DISTRESSED → HIGH", () => {
    expect(deriveRecommendationPriority("DISTRESSED", "LOW")).toBe("HIGH");
  });
  it("STABLE + HIGH human risk → HIGH", () => {
    expect(deriveRecommendationPriority("STABLE", "HIGH")).toBe("HIGH");
  });
  it("STABLE + CRITICAL human risk → HIGH", () => {
    expect(deriveRecommendationPriority("STABLE", "CRITICAL")).toBe("HIGH");
  });
  it("STABLE + MEDIUM human risk → MEDIUM", () => {
    expect(deriveRecommendationPriority("STABLE", "MEDIUM")).toBe("MEDIUM");
  });
  it("GROWING → LOW", () => {
    expect(deriveRecommendationPriority("GROWING", "LOW")).toBe("LOW");
  });
  it("THRIVING → LOW", () => {
    expect(deriveRecommendationPriority("THRIVING", "LOW")).toBe("LOW");
  });
});

describe("deriveReviewCadence", () => {
  it("CRITICAL → DAILY", () => expect(deriveReviewCadence("CRITICAL")).toBe("DAILY"));
  it("DISTRESSED → WEEKLY", () => expect(deriveReviewCadence("DISTRESSED")).toBe("WEEKLY"));
  it("STABLE → BIWEEKLY", () => expect(deriveReviewCadence("STABLE")).toBe("BIWEEKLY"));
  it("GROWING → MONTHLY", () => expect(deriveReviewCadence("GROWING")).toBe("MONTHLY"));
  it("THRIVING → MONTHLY", () => expect(deriveReviewCadence("THRIVING")).toBe("MONTHLY"));
});

describe("deriveHealthStatus", () => {
  it("score < 30 → CRITICAL", () => expect(deriveHealthStatus(20)).toBe("CRITICAL"));
  it("score 30 → AT_RISK", () => expect(deriveHealthStatus(30)).toBe("AT_RISK"));
  it("score 49 → AT_RISK", () => expect(deriveHealthStatus(49)).toBe("AT_RISK"));
  it("score 50 → STABLE", () => expect(deriveHealthStatus(50)).toBe("STABLE"));
  it("score 74 → STABLE", () => expect(deriveHealthStatus(74)).toBe("STABLE"));
  it("score 75 → HEALTHY", () => expect(deriveHealthStatus(75)).toBe("HEALTHY"));
  it("score 100 → HEALTHY", () => expect(deriveHealthStatus(100)).toBe("HEALTHY"));
});

describe("deriveConsultingLifecycleStage", () => {
  it("CRITICAL → INTERVENTION", () => expect(deriveConsultingLifecycleStage("CRITICAL")).toBe("INTERVENTION"));
  it("DISTRESSED → DIAGNOSIS", () => expect(deriveConsultingLifecycleStage("DISTRESSED")).toBe("DIAGNOSIS"));
  it("STABLE → STABILIZATION", () => expect(deriveConsultingLifecycleStage("STABLE")).toBe("STABILIZATION"));
  it("GROWING → GROWTH", () => expect(deriveConsultingLifecycleStage("GROWING")).toBe("GROWTH"));
  it("THRIVING → MAINTENANCE", () => expect(deriveConsultingLifecycleStage("THRIVING")).toBe("MAINTENANCE"));
  it("uses supplied stage when provided", () => expect(deriveConsultingLifecycleStage("CRITICAL", "CLOSURE")).toBe("CLOSURE"));
});

describe("deriveAllBcpFields", () => {
  it("critical facts produce all CRITICAL/RECOVER/URGENT/DAILY outputs", () => {
    const d = deriveAllBcpFields(CRITICAL_FACTS);
    expect(d.conditionCode).toBe("CRITICAL");
    expect(d.interventionMode).toBe("RECOVER");
    expect(d.recommendationPriority).toBe("URGENT");
    expect(d.reviewCadence).toBe("DAILY");
    expect(d.healthStatus).toBe("CRITICAL");
    expect(d.consultingLifecycleStage).toBe("INTERVENTION");
  });

  it("healthy facts produce GROWING/SCALE/LOW/MONTHLY outputs", () => {
    const d = deriveAllBcpFields(HEALTHY_FACTS);
    expect(d.conditionCode).toBe("GROWING");
    expect(d.interventionMode).toBe("SCALE");
    expect(d.recommendationPriority).toBe("LOW");
    expect(d.reviewCadence).toBe("MONTHLY");
    expect(d.healthStatus).toBe("HEALTHY");
  });

  it("all four OpsIQ dimensions present in result", () => {
    const d = deriveAllBcpFields(STABLE_FACTS);
    expect(d.consultingLifecycleStage).toBeDefined(); // dimension 1
    expect(d.conditionCode).toBeDefined();            // dimension 2
    expect(d.interventionMode).toBeDefined();         // dimension 3
    expect(d.interventionPhase).toBeDefined();        // dimension 3
    // dimension 4 (human execution) is in input, not derived
  });
});

// ─── createConditionProfile ───────────────────────────────────────────────────

describe("createConditionProfile", () => {
  beforeEach(resetMocks);

  it("returns existing profile if one is already current (idempotent)", async () => {
    const existing = makeBcpRow();
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(existing);
    const result = await createConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1", facts: STABLE_FACTS,
    });
    expect(result.id).toBe("bcp-1");
    expect(mockDb.ownerBusinessConditionProfile.create).not.toHaveBeenCalled();
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("creates new profile when none exists", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    const created = makeBcpRow({ conditionCode: "STABLE", version: 1 });
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(created);
    const result = await createConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1", facts: STABLE_FACTS,
    });
    expect(result.conditionCode).toBe("STABLE");
    expect(mockDb.ownerBusinessConditionProfile.create).toHaveBeenCalledOnce();
  });

  it("emits OWNER_BCP_CREATED audit event", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow());
    await createConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1", facts: STABLE_FACTS,
    });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "owner_bcp.created" })
    );
  });

  it("passes workspaceId to audit event", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow());
    await createConditionProfile({
      workspaceId: "ws-SCOPED", actorId: "actor-1", businessId: "biz-1", facts: STABLE_FACTS,
    });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-SCOPED" })
    );
  });

  it("stores triggerType=INITIAL", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow());
    await createConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1", facts: STABLE_FACTS,
    });
    const createCall = mockDb.ownerBusinessConditionProfile.create.mock.calls[0][0];
    expect(createCall.data.triggerType).toBe("INITIAL");
  });

  it("stores version=1", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow());
    await createConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1", facts: STABLE_FACTS,
    });
    const createCall = mockDb.ownerBusinessConditionProfile.create.mock.calls[0][0];
    expect(createCall.data.version).toBe(1);
  });

  it("stores inputFactsJson (not in DTO)", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow());
    await createConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1", facts: STABLE_FACTS,
    });
    const createCall = mockDb.ownerBusinessConditionProfile.create.mock.calls[0][0];
    expect(createCall.data.inputFactsJson).toBeTruthy();
    expect(JSON.parse(createCall.data.inputFactsJson)).toEqual(STABLE_FACTS);
  });

  it("throws ValidationError for score > 100", async () => {
    await expect(
      createConditionProfile({
        workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1",
        facts: { ...STABLE_FACTS, financialHealthScore: 110 },
      })
    ).rejects.toThrow("0 and 100");
  });

  it("throws ValidationError for negative score", async () => {
    await expect(
      createConditionProfile({
        workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1",
        facts: { ...STABLE_FACTS, salesHealthScore: -1 },
      })
    ).rejects.toThrow("0 and 100");
  });

  it("throws ValidationError for invalid humanExecutionRisk", async () => {
    await expect(
      createConditionProfile({
        workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1",
        facts: { ...STABLE_FACTS, humanExecutionRisk: "EXTREME" as never },
      })
    ).rejects.toThrow("humanExecutionRisk");
  });

  it("links sourceReassessmentEventId when provided", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow());
    await createConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1",
      facts: STABLE_FACTS, sourceReassessmentEventId: "reass-event-1",
    });
    const createCall = mockDb.ownerBusinessConditionProfile.create.mock.calls[0][0];
    expect(createCall.data.sourceReassessmentEventId).toBe("reass-event-1");
  });
});

// ─── evaluateConditionProfile ─────────────────────────────────────────────────

describe("evaluateConditionProfile", () => {
  beforeEach(resetMocks);

  it("creates a new version snapshot", async () => {
    const current = { id: "bcp-1", version: 1 };
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(current);
    mockDb.ownerBusinessConditionProfile.update.mockResolvedValue(undefined);
    const newRow = makeBcpRow({ version: 2, conditionCode: "CRITICAL" });
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(newRow);

    const result = await evaluateConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1",
      facts: CRITICAL_FACTS, triggerType: "KPI_CHANGE",
      triggerDescription: "Cash dropped below threshold",
    });
    expect(result.version).toBe(2);
    expect(mockDb.ownerBusinessConditionProfile.update).toHaveBeenCalledOnce();
    expect(mockDb.ownerBusinessConditionProfile.create).toHaveBeenCalledOnce();
  });

  it("sets isCurrent=false on old profile", async () => {
    const current = { id: "bcp-OLD", version: 3 };
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(current);
    mockDb.ownerBusinessConditionProfile.update.mockResolvedValue(undefined);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow({ version: 4 }));

    await evaluateConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1",
      facts: STABLE_FACTS, triggerType: "EVIDENCE_UPDATE",
      triggerDescription: "New evidence received",
    });

    const updateCall = mockDb.ownerBusinessConditionProfile.update.mock.calls[0][0];
    expect(updateCall.where.id).toBe("bcp-OLD");
    expect(updateCall.data.isCurrent).toBe(false);
  });

  it("increments version by 1 from current", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue({ id: "bcp-5", version: 5 });
    mockDb.ownerBusinessConditionProfile.update.mockResolvedValue(undefined);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow({ version: 6 }));

    await evaluateConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1",
      facts: STABLE_FACTS, triggerType: "BLOCKER_EVENT",
      triggerDescription: "Critical blocker identified",
    });

    const createCall = mockDb.ownerBusinessConditionProfile.create.mock.calls[0][0];
    expect(createCall.data.version).toBe(6);
  });

  it("starts at version 1 when no prior profile exists", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow({ version: 1 }));

    await evaluateConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1",
      facts: STABLE_FACTS, triggerType: "SIGNAL_REASSESSMENT",
      triggerDescription: "Reassessment triggered",
    });

    const createCall = mockDb.ownerBusinessConditionProfile.create.mock.calls[0][0];
    expect(createCall.data.version).toBe(1);
    expect(mockDb.ownerBusinessConditionProfile.update).not.toHaveBeenCalled();
  });

  it("emits OWNER_BCP_EVALUATED audit event", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow());

    await evaluateConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1",
      facts: STABLE_FACTS, triggerType: "KPI_CHANGE",
      triggerDescription: "KPI changed",
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "owner_bcp.evaluated" })
    );
  });

  it("throws ValidationError for invalid triggerType", async () => {
    await expect(
      evaluateConditionProfile({
        workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1",
        facts: STABLE_FACTS, triggerType: "RANDOM_TRIGGER",
        triggerDescription: "desc",
      })
    ).rejects.toThrow("triggerType");
  });

  it("derives conditionCode from facts — CRITICAL facts → CRITICAL conditionCode", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(
      makeBcpRow({ conditionCode: "CRITICAL" })
    );
    const result = await evaluateConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1",
      facts: CRITICAL_FACTS, triggerType: "SHOCK_EVENT",
      triggerDescription: "Shock event",
    });
    expect(result.conditionCode).toBe("CRITICAL");
  });

  it("all four OpsIQ dimensions updated on re-evaluation", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue({ id: "old", version: 1 });
    mockDb.ownerBusinessConditionProfile.update.mockResolvedValue(undefined);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow());
    await evaluateConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1",
      facts: STABLE_FACTS, triggerType: "EVIDENCE_UPDATE",
      triggerDescription: "evidence",
    });
    const createCall = mockDb.ownerBusinessConditionProfile.create.mock.calls[0][0];
    // Dimension 1: consulting lifecycle
    expect(createCall.data.consultingLifecycleStage).toBeDefined();
    // Dimension 2: business condition
    expect(createCall.data.conditionCode).toBeDefined();
    expect(createCall.data.businessConditionScore).toBeTypeOf("number");
    // Dimension 3: intervention mode + phase
    expect(createCall.data.interventionMode).toBeDefined();
    expect(createCall.data.interventionPhase).toBeDefined();
    // Dimension 4: human execution
    expect(createCall.data.humanExecutionRisk).toBeDefined();
  });

  it("stores triggerType on new version", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow());
    await evaluateConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1",
      facts: STABLE_FACTS, triggerType: "BLOCKER_EVENT",
      triggerDescription: "blocker",
    });
    const createCall = mockDb.ownerBusinessConditionProfile.create.mock.calls[0][0];
    expect(createCall.data.triggerType).toBe("BLOCKER_EVENT");
  });
});

// ─── DTO boundary — inputFactsJson never exposed ──────────────────────────────

describe("DTO boundary", () => {
  beforeEach(resetMocks);

  it("does not expose inputFactsJson in PublicBcpDTO", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow());
    const result = await createConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1", facts: STABLE_FACTS,
    });
    expect((result as Record<string, unknown>).inputFactsJson).toBeUndefined();
  });

  it("does not expose triggeredBy in PublicBcpDTO", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow());
    const result = await createConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1", facts: STABLE_FACTS,
    });
    expect((result as Record<string, unknown>).triggeredBy).toBeUndefined();
  });

  it("exposes all expected public fields", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow());
    const result = await createConditionProfile({
      workspaceId: "ws-1", actorId: "actor-1", businessId: "biz-1", facts: STABLE_FACTS,
    });
    const EXPECTED_PUBLIC_FIELDS = [
      "id", "workspaceId", "businessId", "version", "isCurrent",
      "conditionCode", "conditionSeverity", "consultingLifecycleStage",
      "businessConditionScore", "interventionMode", "interventionPhase",
      "humanExecutionRisk", "financialHealthScore", "operationalHealthScore",
      "salesHealthScore", "sopHealthScore", "recommendationPriority",
      "reviewCadence", "healthStatus", "triggerType", "triggerDescription",
      "sourceReassessmentEventId", "createdAt",
    ];
    for (const field of EXPECTED_PUBLIC_FIELDS) {
      expect(result).toHaveProperty(field);
    }
  });
});

// ─── Workspace isolation ──────────────────────────────────────────────────────

describe("workspace isolation", () => {
  beforeEach(resetMocks);

  it("getCurrentConditionProfile scopes by workspaceId", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    await getCurrentConditionProfile({ workspaceId: "ws-ISOLATED", businessId: "biz-1" });
    const call = mockDb.ownerBusinessConditionProfile.findFirst.mock.calls[0][0];
    expect(call.where.workspaceId).toBe("ws-ISOLATED");
  });

  it("getConditionProfileHistory scopes by workspaceId", async () => {
    mockDb.ownerBusinessConditionProfile.findMany.mockResolvedValue([]);
    await getConditionProfileHistory({ workspaceId: "ws-SCOPED", businessId: "biz-1" });
    const call = mockDb.ownerBusinessConditionProfile.findMany.mock.calls[0][0];
    expect(call.where.workspaceId).toBe("ws-SCOPED");
  });

  it("getConditionProfileById scopes by workspaceId", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(makeBcpRow());
    await getConditionProfileById({ workspaceId: "ws-EXACT", profileId: "bcp-1" });
    const call = mockDb.ownerBusinessConditionProfile.findFirst.mock.calls[0][0];
    expect(call.where.workspaceId).toBe("ws-EXACT");
  });

  it("create scopes findFirst by workspaceId", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    mockDb.ownerBusinessConditionProfile.create.mockResolvedValue(makeBcpRow());
    await createConditionProfile({ workspaceId: "ws-TENANT", actorId: "a", businessId: "b", facts: STABLE_FACTS });
    const call = mockDb.ownerBusinessConditionProfile.findFirst.mock.calls[0][0];
    expect(call.where.workspaceId).toBe("ws-TENANT");
  });
});

// ─── Query functions ──────────────────────────────────────────────────────────

describe("getCurrentConditionProfile", () => {
  beforeEach(resetMocks);

  it("returns null when no current profile", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    const result = await getCurrentConditionProfile({ workspaceId: "ws-1", businessId: "biz-1" });
    expect(result).toBeNull();
  });

  it("returns public DTO when found", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(makeBcpRow());
    const result = await getCurrentConditionProfile({ workspaceId: "ws-1", businessId: "biz-1" });
    expect(result?.id).toBe("bcp-1");
  });

  it("queries only isCurrent=true", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    await getCurrentConditionProfile({ workspaceId: "ws-1", businessId: "biz-1" });
    const call = mockDb.ownerBusinessConditionProfile.findFirst.mock.calls[0][0];
    expect(call.where.isCurrent).toBe(true);
  });
});

describe("getConditionProfileHistory", () => {
  beforeEach(resetMocks);

  it("returns empty array when no history", async () => {
    mockDb.ownerBusinessConditionProfile.findMany.mockResolvedValue([]);
    const result = await getConditionProfileHistory({ workspaceId: "ws-1", businessId: "biz-1" });
    expect(result).toEqual([]);
  });

  it("orders by version desc", async () => {
    mockDb.ownerBusinessConditionProfile.findMany.mockResolvedValue([makeBcpRow({ version: 3 }), makeBcpRow({ version: 2 }), makeBcpRow({ version: 1 })]);
    await getConditionProfileHistory({ workspaceId: "ws-1", businessId: "biz-1" });
    const call = mockDb.ownerBusinessConditionProfile.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ version: "desc" });
  });

  it("applies limit parameter", async () => {
    mockDb.ownerBusinessConditionProfile.findMany.mockResolvedValue([]);
    await getConditionProfileHistory({ workspaceId: "ws-1", businessId: "biz-1", limit: 5 });
    const call = mockDb.ownerBusinessConditionProfile.findMany.mock.calls[0][0];
    expect(call.take).toBe(5);
  });

  it("defaults limit to 50", async () => {
    mockDb.ownerBusinessConditionProfile.findMany.mockResolvedValue([]);
    await getConditionProfileHistory({ workspaceId: "ws-1", businessId: "biz-1" });
    const call = mockDb.ownerBusinessConditionProfile.findMany.mock.calls[0][0];
    expect(call.take).toBe(50);
  });
});

describe("getConditionProfileById", () => {
  beforeEach(resetMocks);

  it("throws NotFoundError when profile does not exist", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(null);
    await expect(
      getConditionProfileById({ workspaceId: "ws-1", profileId: "missing" })
    ).rejects.toThrow("OwnerBusinessConditionProfile");
  });

  it("returns public DTO when found", async () => {
    mockDb.ownerBusinessConditionProfile.findFirst.mockResolvedValue(makeBcpRow());
    const result = await getConditionProfileById({ workspaceId: "ws-1", profileId: "bcp-1" });
    expect(result.id).toBe("bcp-1");
    expect((result as Record<string, unknown>).inputFactsJson).toBeUndefined();
  });
});
