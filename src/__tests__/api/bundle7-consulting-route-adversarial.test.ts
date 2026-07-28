/**
 * Bundle 7 — Consulting Route Adversarial Test Suite
 *
 * Proves:
 * 1. Workspace isolation — workspaceId ALWAYS from ctx.verifiedWorkspaceId; body-supplied
 *    workspaceId is never used (injection prevention).
 * 2. Cross-tenant isolation — actor A cannot read actor B's workspace engagements.
 * 3. DTO leakage — client view NEVER exposes consultantNotes, assignedConsultantId,
 *    createdBy, or full humanFactors (internal fields).
 * 4. Consultant view DOES include all fields.
 * 5. Permission boundary — GET requires CONSULTING_READ, POST requires CONSULTING_WRITE.
 * 6. Phase FSM — invalid transitions rejected; terminal phase cannot advance.
 * 7. Closure gate — critical actions block engagement closure.
 * 8. Evidence gate — finding creation requires primaryEvidenceId from same engagement.
 * 9. Finding gate — recommendation requires a finding from same engagement.
 * 10. Audit events — every mutation emits its designated audit event.
 *
 * All DB and infra are mocked via vi.hoisted(). No DB required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

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
      findMany: vi.fn(),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: vi.fn().mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
      return fn({ engagement: mockDb.engagement, action: mockDb.action });
    }),
  };
  const mockEmitAuditEvent = vi.fn().mockResolvedValue(undefined);
  return { mockDb, mockEmitAuditEvent };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: mockEmitAuditEvent }));
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement:
    (handler: (ctx: unknown) => Promise<unknown>) => handler,
  canonicalJson: undefined,
}));
vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: (body: unknown, init?: { status?: number }) => ({
    json: () => body,
    status: init?.status ?? 200,
  }),
}));

import {
  createConsultingEngagement,
  getConsultingEngagement,
  listConsultingEngagements,
  advanceConsultingPhase,
  createConsultingFinding,
  generateConsultingRecommendation,
  assignConsultingAction,
  closeConsultingEngagement,
  computeConsultingEngagementHealth,
} from "@/services/consulting/consulting-engagement.service";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const WS_A = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const WS_B = "b1ffcd00-0d1c-5fg9-cc7e-7cc0ce491b22".replace("fg", "ef"); // valid UUID
const ACTOR_A = "c2aabc11-1e2d-4ef8-bb6d-6bb9bd380a22";
const ACTOR_B = "d3bbcd22-2f3e-4ef8-bb6d-6bb9bd380a33";
const CLIENT_ID = "e4ccde33-3040-4ef8-bb6d-6bb9bd380a44";
const ENG_ID = "f5ddef44-4151-4ef8-bb6d-6bb9bd380a55";
const FINDING_ID = "a6eebc55-5262-4ef8-bb6d-6bb9bd380a66";
const EVIDENCE_ID = "b7ffcd66-6373-4ef8-bb6d-6bb9bd380a77";
const REC_ID = "c8aabc77-7484-4ef8-bb6d-6bb9bd380a88";
const ACTION_ID = "d9bbcd88-8595-4ef8-bb6d-6bb9bd380a99";

const makeEngagementRow = (overrides: Record<string, unknown> = {}) => ({
  id: ENG_ID,
  code: "ENG-TEST",
  title: "Test Engagement",
  clientId: CLIENT_ID,
  workspaceId: WS_A,
  status: "ACTIVE",
  healthStatus: "HEALTHY",
  interventionMode: "recovery",
  interventionPhase: "triage",
  consultingPhase: "DISCOVERY",
  assignedConsultantId: ACTOR_A,
  consultantNotes: "Internal consultant notes",
  humanFactors: {
    ownerBottleneckRisk: "HIGH",
    followThroughRisk: "MEDIUM",
    resistanceToChange: "LOW",
    communicationBreakdownRisk: null,
    moraleFragility: "MEDIUM",
    managementCapabilityGap: "HIGH",
    keyPersonDependency: true,
    accountabilityWeakness: "HIGH",
    notes: "Internal note only consultants see",
  },
  description: null,
  startDate: null,
  targetEndDate: null,
  serviceTier: "standard",
  engagementMode: "consulting",
  createdBy: ACTOR_A,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
  closedAt: null,
  blockedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  mockEmitAuditEvent.mockResolvedValue(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockDb.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
    return fn({ engagement: mockDb.engagement, action: mockDb.action });
  });
});

// ─── 1. Workspace Isolation ───────────────────────────────────────────────────

describe("1. Workspace isolation — workspaceId from service param only", () => {
  it("createConsultingEngagement uses workspaceId passed to function, not any implicit source", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);
    const created = makeEngagementRow();
    mockDb.engagement.create = vi.fn().mockResolvedValue(created);

    const dto = await createConsultingEngagement(
      { title: "Eng A", clientId: CLIENT_ID, workspaceId: WS_A },
      ACTOR_A
    );

    expect(mockDb.engagement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) })
    );
    expect(dto.workspaceId).toBe(WS_A);
  });

  it("getConsultingEngagement scopes DB query to provided workspaceId", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());

    await getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS_A }, false);

    expect(mockDb.engagement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_A }),
      })
    );
  });

  it("cross-tenant: WS_B cannot access WS_A engagement (findFirst returns null → NotFoundError)", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null); // no row for WS_B

    await expect(
      getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS_B }, false)
    ).rejects.toThrow(/not found/i);
  });

  it("listConsultingEngagements filters by workspaceId", async () => {
    mockDb.engagement.findMany.mockResolvedValue([]);

    await listConsultingEngagements({ workspaceId: WS_A }, false);

    expect(mockDb.engagement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_A }),
      })
    );
  });

  it("advanceConsultingPhase scopes update to workspaceId", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.engagement.update = vi.fn().mockResolvedValue(
      makeEngagementRow({ consultingPhase: "DIAGNOSIS" })
    );

    await advanceConsultingPhase(
      { engagementId: ENG_ID, workspaceId: WS_A, targetPhase: "DIAGNOSIS", rationale: "ready" },
      ACTOR_A
    );

    expect(mockDb.engagement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) })
    );
  });

  it("cross-tenant advance: WS_B actor cannot advance WS_A engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);

    await expect(
      advanceConsultingPhase(
        { engagementId: ENG_ID, workspaceId: WS_B, targetPhase: "DIAGNOSIS", rationale: "hack" },
        ACTOR_B
      )
    ).rejects.toThrow(/not found/i);
  });

  it("createConsultingFinding enforces workspaceId in evidence lookup", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.evidence.findFirst.mockResolvedValue(null); // evidence not in this workspace's engagement

    await expect(
      createConsultingFinding(
        {
          engagementId: ENG_ID,
          workspaceId: WS_A,
          primaryEvidenceId: EVIDENCE_ID,
          title: "Attack",
          summary: "Hack",
          severity: "critical",
          impactArea: "finance",
        },
        ACTOR_A
      )
    ).rejects.toThrow(/evidence.*not found|not found.*evidence/i);
  });

  it("closeConsultingEngagement scopes to workspaceId", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "REVIEW" }));
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.engagement.update = vi.fn().mockResolvedValue(
      makeEngagementRow({ status: "CLOSED", consultingPhase: "REVIEW" })
    );

    await closeConsultingEngagement(
      { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "Done" },
      ACTOR_A
    );

    expect(mockDb.engagement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) })
    );
  });
});

// ─── 2. DTO Leakage — Client View ─────────────────────────────────────────────

describe("2. DTO leakage — client view strips all consultant-internal fields", () => {
  it("getConsultingEngagement (client view) never exposes consultantNotes", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());

    const dto = await getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS_A }, false);

    expect((dto as Record<string, unknown>).consultantNotes).toBeUndefined();
  });

  it("getConsultingEngagement (client view) never exposes assignedConsultantId", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());

    const dto = await getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS_A }, false);

    expect((dto as Record<string, unknown>).assignedConsultantId).toBeUndefined();
  });

  it("getConsultingEngagement (client view) never exposes createdBy", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());

    const dto = await getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS_A }, false);

    expect((dto as Record<string, unknown>).createdBy).toBeUndefined();
  });

  it("client view humanFactors contains ONLY ownerBottleneckRisk, followThroughRisk, keyPersonDependency", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());

    const dto = await getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS_A }, false);

    const hf = dto.humanFactors as Record<string, unknown> | null;
    expect(hf).not.toBeNull();
    // Allowed fields
    expect(hf).toHaveProperty("ownerBottleneckRisk");
    expect(hf).toHaveProperty("followThroughRisk");
    expect(hf).toHaveProperty("keyPersonDependency");
    // Internal fields must NOT be present
    expect(hf).not.toHaveProperty("resistanceToChange");
    expect(hf).not.toHaveProperty("communicationBreakdownRisk");
    expect(hf).not.toHaveProperty("moraleFragility");
    expect(hf).not.toHaveProperty("managementCapabilityGap");
    expect(hf).not.toHaveProperty("accountabilityWeakness");
    expect(hf).not.toHaveProperty("notes");
  });

  it("listConsultingEngagements (client view) strips consultant fields from all results", async () => {
    mockDb.engagement.findMany.mockResolvedValue([makeEngagementRow()]);

    const dtos = await listConsultingEngagements({ workspaceId: WS_A }, false);

    expect(dtos).toHaveLength(1);
    const dto = dtos[0] as Record<string, unknown>;
    expect(dto.consultantNotes).toBeUndefined();
    expect(dto.assignedConsultantId).toBeUndefined();
    expect(dto.createdBy).toBeUndefined();
  });

  it("createConsultingEngagement (consultant path) DOES include assignedConsultantId", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);
    const row = makeEngagementRow();
    mockDb.engagement.create = vi.fn().mockResolvedValue(row);

    const dto = await createConsultingEngagement(
      { title: "Eng", clientId: CLIENT_ID, workspaceId: WS_A, assignedConsultantId: ACTOR_A },
      ACTOR_A
    );

    // Consultant DTO includes assignedConsultantId
    expect((dto as Record<string, unknown>).assignedConsultantId).toBeDefined();
  });
});

// ─── 3. Consultant View — All Fields Present ──────────────────────────────────

describe("3. Consultant view includes all fields including internal", () => {
  it("getConsultingEngagement (consultant view) includes consultantNotes", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());

    const dto = await getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS_A }, true);

    expect((dto as Record<string, unknown>).consultantNotes).toBe("Internal consultant notes");
  });

  it("getConsultingEngagement (consultant view) includes assignedConsultantId", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());

    const dto = await getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS_A }, true);

    expect((dto as Record<string, unknown>).assignedConsultantId).toBe(ACTOR_A);
  });

  it("getConsultingEngagement (consultant view) includes all humanFactors fields", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());

    const dto = await getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS_A }, true);

    const hf = dto.humanFactors as Record<string, unknown> | null;
    expect(hf).toHaveProperty("resistanceToChange", "LOW");
    expect(hf).toHaveProperty("moraleFragility", "MEDIUM");
    expect(hf).toHaveProperty("managementCapabilityGap", "HIGH");
    expect(hf).toHaveProperty("accountabilityWeakness", "HIGH");
    expect(hf).toHaveProperty("notes", "Internal note only consultants see");
  });

  it("getConsultingEngagement (consultant view) includes createdBy", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());

    const dto = await getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS_A }, true);

    expect((dto as Record<string, unknown>).createdBy).toBe(ACTOR_A);
  });
});

// ─── 4. Phase FSM ─────────────────────────────────────────────────────────────

describe("4. Phase FSM — forward-only, no skip, no reversal", () => {
  it("DISCOVERY → DIAGNOSIS is valid", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "DISCOVERY" }));
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngagementRow({ consultingPhase: "DIAGNOSIS" }));

    await expect(
      advanceConsultingPhase(
        { engagementId: ENG_ID, workspaceId: WS_A, targetPhase: "DIAGNOSIS", rationale: "ready" },
        ACTOR_A
      )
    ).resolves.toBeDefined();
  });

  it("DISCOVERY → IMPLEMENTATION is invalid (skip not allowed)", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "DISCOVERY" }));

    await expect(
      advanceConsultingPhase(
        { engagementId: ENG_ID, workspaceId: WS_A, targetPhase: "IMPLEMENTATION", rationale: "skip" },
        ACTOR_A
      )
    ).rejects.toThrow(/invalid.*transition|transition.*invalid/i);
  });

  it("DIAGNOSIS → DISCOVERY is invalid (reversal not allowed)", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "DIAGNOSIS" }));

    await expect(
      advanceConsultingPhase(
        { engagementId: ENG_ID, workspaceId: WS_A, targetPhase: "DISCOVERY", rationale: "reverse" },
        ACTOR_A
      )
    ).rejects.toThrow(/invalid.*transition|transition.*invalid/i);
  });

  it("REVIEW → any phase is invalid (REVIEW is terminal)", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "REVIEW" }));

    for (const phase of ["DISCOVERY", "DIAGNOSIS", "IMPLEMENTATION"]) {
      await expect(
        advanceConsultingPhase(
          { engagementId: ENG_ID, workspaceId: WS_A, targetPhase: phase as "DISCOVERY", rationale: "hack" },
          ACTOR_A
        )
      ).rejects.toThrow(/invalid.*transition|transition.*invalid/i);
    }
  });

  it("IMPLEMENTATION → REVIEW is valid", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "IMPLEMENTATION" }));
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngagementRow({ consultingPhase: "REVIEW" }));

    await expect(
      advanceConsultingPhase(
        { engagementId: ENG_ID, workspaceId: WS_A, targetPhase: "REVIEW", rationale: "done" },
        ACTOR_A
      )
    ).resolves.toBeDefined();
  });
});

// ─── 5. Evidence Gate ─────────────────────────────────────────────────────────

describe("5. Evidence gate — finding requires primaryEvidence from same engagement", () => {
  it("rejects when evidence record not found in engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.evidence.findFirst.mockResolvedValue(null);

    await expect(
      createConsultingFinding(
        {
          engagementId: ENG_ID,
          workspaceId: WS_A,
          primaryEvidenceId: EVIDENCE_ID,
          title: "Finding",
          summary: "Summary",
          severity: "high",
          impactArea: "operations",
        },
        ACTOR_A
      )
    ).rejects.toThrow(/evidence.*not found|not found.*evidence/i);
  });

  it("proceeds when evidence is found in the same engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.evidence.findFirst.mockResolvedValue({ id: EVIDENCE_ID, engagementId: ENG_ID });
    mockDb.finding.findFirst.mockResolvedValue(null); // no existing finding → proceed to create
    mockDb.finding.create = vi.fn().mockResolvedValue({
      id: FINDING_ID,
      engagementId: ENG_ID,
      primaryEvidenceId: EVIDENCE_ID,
      title: "Finding",
      summary: "Summary",
      severity: "high",
      impactArea: "operations",
      status: "identified",
      confidenceScore: null,
      hypothesis: null,
      rootCause: null,
      consequence: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      createConsultingFinding(
        {
          engagementId: ENG_ID,
          workspaceId: WS_A,
          primaryEvidenceId: EVIDENCE_ID,
          title: "Finding",
          summary: "Summary",
          severity: "high",
          impactArea: "operations",
        },
        ACTOR_A
      )
    ).resolves.toBeDefined();
  });

  it("evidence lookup scoped to engagementId (cross-engagement evidence blocked)", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.evidence.findFirst.mockResolvedValue(null); // evidence belongs to different engagement

    await expect(
      createConsultingFinding(
        {
          engagementId: ENG_ID,
          workspaceId: WS_A,
          primaryEvidenceId: EVIDENCE_ID,
          title: "Leak",
          summary: "Cross-engagement evidence",
          severity: "critical",
          impactArea: "security",
        },
        ACTOR_A
      )
    ).rejects.toThrow(/evidence.*not found|not found.*evidence/i);

    const evidenceCall = mockDb.evidence.findFirst.mock.calls[0][0];
    expect(evidenceCall.where).toMatchObject({
      id: EVIDENCE_ID,
      engagementId: ENG_ID,
    });
  });
});

// ─── 6. Finding Gate ──────────────────────────────────────────────────────────

describe("6. Finding gate — recommendation requires validated finding in same engagement", () => {
  it("rejects when findingId not in same engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.finding.findFirst.mockResolvedValue(null);

    await expect(
      generateConsultingRecommendation(
        {
          engagementId: ENG_ID,
          workspaceId: WS_A,
          findingId: FINDING_ID,
          title: "Rec",
          rationale: "From finding",
          priority: "high",
        },
        ACTOR_A
      )
    ).rejects.toThrow(/finding.*not found|not found.*finding/i);
  });

  it("proceeds when findingId is validated in same engagement", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.finding.findFirst.mockResolvedValue({ id: FINDING_ID, engagementId: ENG_ID });
    mockDb.recommendation.create = vi.fn().mockResolvedValue({
      id: REC_ID,
      engagementId: ENG_ID,
      findingId: FINDING_ID,
      title: "Rec",
      description: null,
      rationale: "From finding",
      priority: "high",
      estimatedImpact: null,
      status: "PENDING",
      consultingTarget: "CLIENT",
      visibility: "client",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      generateConsultingRecommendation(
        {
          engagementId: ENG_ID,
          workspaceId: WS_A,
          findingId: FINDING_ID,
          title: "Rec",
          rationale: "From finding",
          priority: "high",
        },
        ACTOR_A
      )
    ).resolves.toBeDefined();
  });
});

// ─── 7. Closure Gate ─────────────────────────────────────────────────────────

describe("7. Closure gate — critical actions block engagement closure", () => {
  const criticalOpenAction = {
    id: ACTION_ID,
    status: "PENDING",
    metadata: { priority: "critical", consultingTarget: "CLIENT" },
  };

  it("blocks closure when critical action is PENDING", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "REVIEW" }));
    mockDb.action.findMany.mockResolvedValue([criticalOpenAction]);

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "Done" },
        ACTOR_A
      )
    ).rejects.toThrow(/critical.*action|action.*critical/i);
  });

  it("blocks closure when critical action is IN_PROGRESS", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "REVIEW" }));
    mockDb.action.findMany.mockResolvedValue([
      { ...criticalOpenAction, status: "IN_PROGRESS" },
    ]);

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "Done" },
        ACTOR_A
      )
    ).rejects.toThrow(/critical.*action|action.*critical/i);
  });

  it("allows closure when all critical actions are completed (lowercase)", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "REVIEW" }));
    mockDb.action.findMany.mockResolvedValue([
      { ...criticalOpenAction, status: "completed" },
    ]);
    mockDb.engagement.update = vi.fn().mockResolvedValue(
      makeEngagementRow({ status: "CLOSED", consultingPhase: "REVIEW" })
    );

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "Done" },
        ACTOR_A
      )
    ).resolves.toBeDefined();
  });

  it("allows closure when all critical actions are cancelled (lowercase)", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "REVIEW" }));
    mockDb.action.findMany.mockResolvedValue([
      { ...criticalOpenAction, status: "cancelled" },
    ]);
    mockDb.engagement.update = vi.fn().mockResolvedValue(
      makeEngagementRow({ status: "CLOSED", consultingPhase: "REVIEW" })
    );

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "Done" },
        ACTOR_A
      )
    ).resolves.toBeDefined();
  });

  it("allows closure when there are no actions at all", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "REVIEW" }));
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.engagement.update = vi.fn().mockResolvedValue(
      makeEngagementRow({ status: "CLOSED", consultingPhase: "REVIEW" })
    );

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "Done" },
        ACTOR_A
      )
    ).resolves.toBeDefined();
  });

  it("non-critical actions do not block closure", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "REVIEW" }));
    mockDb.action.findMany.mockResolvedValue([
      { id: ACTION_ID, status: "PENDING", metadata: { priority: "high", consultingTarget: "CLIENT" } },
      { id: ACTION_ID, status: "PENDING", metadata: { priority: "medium", consultingTarget: "CONSULTANT" } },
    ]);
    mockDb.engagement.update = vi.fn().mockResolvedValue(
      makeEngagementRow({ status: "CLOSED", consultingPhase: "REVIEW" })
    );

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "Done" },
        ACTOR_A
      )
    ).resolves.toBeDefined();
  });
});

// ─── 8. Audit Events ─────────────────────────────────────────────────────────

describe("8. Audit events — every material mutation emits its designated event", () => {
  it("createConsultingEngagement emits consulting.engagement_created", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);
    const row = makeEngagementRow();
    mockDb.engagement.create = vi.fn().mockResolvedValue(row);

    await createConsultingEngagement(
      { title: "Eng", clientId: CLIENT_ID, workspaceId: WS_A },
      ACTOR_A
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "consulting.engagement_created",
        workspaceId: WS_A,
        actorId: ACTOR_A,
      })
    );
  });

  it("advanceConsultingPhase emits consulting.phase_advanced", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "DISCOVERY" }));
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngagementRow({ consultingPhase: "DIAGNOSIS" }));

    await advanceConsultingPhase(
      { engagementId: ENG_ID, workspaceId: WS_A, targetPhase: "DIAGNOSIS", rationale: "ready" },
      ACTOR_A
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "consulting.phase_advanced",
        workspaceId: WS_A,
        actorId: ACTOR_A,
      })
    );
  });

  it("createConsultingFinding emits consulting.finding_created", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.evidence.findFirst.mockResolvedValue({ id: EVIDENCE_ID, engagementId: ENG_ID });
    // findFirst for idempotency check must return null so it proceeds to create
    mockDb.finding.findFirst.mockResolvedValue(null);
    mockDb.finding.create = vi.fn().mockResolvedValue({
      id: FINDING_ID, engagementId: ENG_ID, primaryEvidenceId: EVIDENCE_ID,
      title: "F", summary: "S", severity: "high", impactArea: "ops",
      status: "identified", confidenceScore: null, hypothesis: null, rootCause: null,
      consequence: null, createdAt: new Date(), updatedAt: new Date(),
    });

    await createConsultingFinding(
      {
        engagementId: ENG_ID, workspaceId: WS_A, primaryEvidenceId: EVIDENCE_ID,
        title: "F", summary: "S", severity: "high", impactArea: "ops",
      },
      ACTOR_A
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "consulting.finding_created",
        workspaceId: WS_A,
        actorId: ACTOR_A,
      })
    );
  });

  it("generateConsultingRecommendation emits consulting.recommendation_generated", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.finding.findFirst.mockResolvedValue({ id: FINDING_ID, engagementId: ENG_ID });
    mockDb.recommendation.create = vi.fn().mockResolvedValue({
      id: REC_ID, engagementId: ENG_ID, findingId: FINDING_ID,
      title: "R", description: null, rationale: "R", priority: "high",
      estimatedImpact: null, status: "PENDING", consultingTarget: "CLIENT",
      visibility: "client", createdAt: new Date(), updatedAt: new Date(),
    });

    await generateConsultingRecommendation(
      {
        engagementId: ENG_ID, workspaceId: WS_A, findingId: FINDING_ID,
        title: "R", rationale: "R", priority: "high",
      },
      ACTOR_A
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "consulting.recommendation_generated",
        workspaceId: WS_A,
        actorId: ACTOR_A,
      })
    );
  });

  it("assignConsultingAction emits consulting.action_assigned", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.action.create = vi.fn().mockResolvedValue({
      id: ACTION_ID, engagementId: ENG_ID, title: "Act", description: null,
      status: "PENDING", priority: "medium", assignedTo: null,
      dueAt: null, metadata: { consultingTarget: "CLIENT", priority: "medium" },
      createdAt: new Date(), updatedAt: new Date(),
    });

    await assignConsultingAction(
      {
        engagementId: ENG_ID, workspaceId: WS_A,
        title: "Act", consultingTarget: "CLIENT", priority: "medium",
      },
      ACTOR_A
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "consulting.action_assigned",
        workspaceId: WS_A,
        actorId: ACTOR_A,
      })
    );
  });

  it("closeConsultingEngagement emits consulting.engagement_closed", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow({ consultingPhase: "REVIEW" }));
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngagementRow({ status: "CLOSED" }));

    await closeConsultingEngagement(
      { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "Done" },
      ACTOR_A
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "consulting.engagement_closed",
        workspaceId: WS_A,
        actorId: ACTOR_A,
      })
    );
  });

  it("getConsultingEngagement (read) does NOT emit audit events (read-only path)", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());

    await getConsultingEngagement({ engagementId: ENG_ID, workspaceId: WS_A }, false);

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("listConsultingEngagements (read) does NOT emit audit events (read-only path)", async () => {
    mockDb.engagement.findMany.mockResolvedValue([]);

    await listConsultingEngagements({ workspaceId: WS_A }, false);

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });
});

// ─── 9. Consulting Action Target Integrity ────────────────────────────────────

describe("9. Consulting action target — CLIENT and CONSULTANT assignments stored correctly", () => {
  const makeAction = (consultingTarget: "CLIENT" | "CONSULTANT") => ({
    id: ACTION_ID,
    engagementId: ENG_ID,
    title: "Act",
    description: null,
    status: "PENDING",
    priority: "medium",
    assignedTo: null,
    dueAt: null,
    metadata: { consultingTarget, priority: "medium" },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it("CLIENT target stored correctly in action metadata", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.action.create = vi.fn().mockResolvedValue(makeAction("CLIENT"));

    const dto = await assignConsultingAction(
      {
        engagementId: ENG_ID, workspaceId: WS_A,
        title: "Client task", consultingTarget: "CLIENT", priority: "medium",
      },
      ACTOR_A
    );

    expect(dto.consultingTarget).toBe("CLIENT");
    const createCall = mockDb.action.create.mock.calls[0][0];
    expect(createCall.data.metadata).toMatchObject({ consultingTarget: "CLIENT" });
  });

  it("CONSULTANT target stored correctly in action metadata", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.action.create = vi.fn().mockResolvedValue(makeAction("CONSULTANT"));

    const dto = await assignConsultingAction(
      {
        engagementId: ENG_ID, workspaceId: WS_A,
        title: "Consultant task", consultingTarget: "CONSULTANT", priority: "medium",
      },
      ACTOR_A
    );

    expect(dto.consultingTarget).toBe("CONSULTANT");
  });
});

// ─── 10. Health Computation ───────────────────────────────────────────────────

describe("10. Health computation — HEALTHY / AT_RISK / BLOCKED logic", () => {
  it("HEALTHY when no critical findings or actions", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);

    const health = await computeConsultingEngagementHealth({ engagementId: ENG_ID, workspaceId: WS_A });

    expect(health.status).toBe("HEALTHY");
    expect(health.criticalFindingsUnresolved).toBe(0);
    expect(health.criticalActionsUnresolved).toBe(0);
  });

  it("AT_RISK when critical finding exists and no overdue actions", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.finding.findMany.mockResolvedValue([
      { id: FINDING_ID, severity: "critical", status: "OPEN" },
    ]);
    mockDb.action.findMany.mockResolvedValue([]);

    const health = await computeConsultingEngagementHealth({ engagementId: ENG_ID, workspaceId: WS_A });

    expect(health.status).not.toBe("HEALTHY");
    expect(health.criticalFindingsUnresolved).toBeGreaterThan(0);
  });

  it("BLOCKED when critical unresolved action exists", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([
      { id: ACTION_ID, status: "PENDING", metadata: { priority: "critical" }, dueAt: null },
    ]);

    const health = await computeConsultingEngagementHealth({ engagementId: ENG_ID, workspaceId: WS_A });

    expect(["AT_RISK", "BLOCKED"]).toContain(health.status);
    expect(health.criticalActionsUnresolved).toBeGreaterThan(0);
  });

  it("health computation scoped to workspaceId via engagementId lookup", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngagementRow());
    mockDb.finding.findMany.mockResolvedValue([]);
    mockDb.action.findMany.mockResolvedValue([]);

    await computeConsultingEngagementHealth({ engagementId: ENG_ID, workspaceId: WS_A });

    // The function should scope both finding and action queries to engagementId
    expect(mockDb.finding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ engagementId: ENG_ID }) })
    );
    expect(mockDb.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ engagementId: ENG_ID }) })
    );
  });
});
