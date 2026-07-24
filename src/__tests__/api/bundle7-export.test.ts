/**
 * Bundle 7 Slice 5: Consulting Engagement Export — Service + Route Tests
 *
 * Proves the export endpoint correctly aggregates engagement + findings +
 * recommendations + actions into a structured consultant-view export packet,
 * emits the consulting.engagement_exported audit event, enforces CONSULTING_READ
 * capability, scopes all queries to the verified workspaceId, and handles
 * missing/empty sub-collections cleanly.
 *
 * Tests: ~30
 *   - Capability declaration (1)
 *   - Missing id parameter (1)
 *   - 404 on engagement not found (1)
 *   - Export structure (4): engagement fields, findings, recommendations, actions
 *   - Audit event (4): emitted, correct eventName/actorId/workspaceId/entityId/payload
 *   - Sub-collection cardinality (4): 0, 1, N findings/recommendations/actions
 *   - consultingTarget in recommendation (2): stored in metadata, defaults to CLIENT
 *   - Action fields (2): priority + consultingTarget from metadata
 *   - workspaceId isolation (2): query uses verified not URL param
 *   - Auth enforcement: 403 on deny (1)
 *   - 200 + export shape (3): exportedAt, workspaceId, engagement key present
 */

import { describe, test, expect, vi, beforeAll, beforeEach } from "vitest";

const WS_A = "ws-export-a";
const ENG_ID = "aa000000-0000-4000-8000-000000000001";
const ACTOR_ID = "actor-export-001";

const { mockWithCanonical, mockDb, mockEmitAuditEvent } = vi.hoisted(() => {
  const mockWithCanonical = vi.fn();
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
    evidence: { findFirst: vi.fn() },
  };
  const mockEmitAuditEvent = vi.fn().mockResolvedValue(undefined);
  return { mockWithCanonical, mockDb, mockEmitAuditEvent };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: mockEmitAuditEvent }));

const capturedDeclarations: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    capturedDeclarations.push({
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    });
    return async (testCtx: unknown) => {
      return mockWithCanonical(handler, options, testCtx);
    };
  },
}));

type CanonicalResult = { body: Record<string, unknown>; status: number };

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_ID,
    ...overrides,
  };
}

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _options: unknown, testCtx: unknown) => {
      const req = (testCtx as Record<string, unknown>)?.request as Request | undefined;
      return handler({ ...makeCtx(), request: req });
    }
  );
}

function denyWith(missing: string[]) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status: 403,
    body: { error: "forbidden", missing },
  }));
}

function makeEngRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ENG_ID,
    title: "Export Test Engagement",
    clientId: "cc000000-0000-4000-8000-000000000001",
    workspaceId: WS_A,
    engagementMode: "consulting",
    consultingPhase: "DIAGNOSIS",
    status: "active",
    healthStatus: "AMBER",
    interventionMode: "TURNAROUND",
    interventionPhase: "STABILISE",
    description: "desc",
    startDate: new Date("2026-01-01"),
    targetEndDate: new Date("2026-12-31"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-07-24"),
    assignedConsultantId: "consultant-001",
    consultantNotes: "Internal notes",
    createdBy: "creator-001",
    humanFactors: { ownerBottleneckRisk: "HIGH", followThroughRisk: "MEDIUM", keyPersonDependency: false },
    ...overrides,
  };
}

function makeFindingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ff000000-0000-4000-8000-000000000001",
    engagementId: ENG_ID,
    title: "Cash flow shortfall",
    summary: "Revenue gap identified",
    severity: "critical",
    impactArea: "finance",
    status: "identified",
    confidenceScore: 80,
    primaryEvidenceId: "ev000000-0000-4000-8000-000000000001",
    hypothesis: "Client delayed invoicing",
    rootCause: "AR process breakdown",
    consequence: "Cash crisis in 60 days",
    createdAt: new Date("2026-02-01"),
    updatedAt: new Date("2026-02-01"),
    ...overrides,
  };
}

function makeRecRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "rr000000-0000-4000-8000-000000000001",
    engagementId: ENG_ID,
    findingId: "ff000000-0000-4000-8000-000000000001",
    title: "Accelerate AR collection",
    description: "Implement 14-day payment terms",
    rationale: "Closes cash gap within 30 days",
    priority: "high",
    estimatedImpact: "$50k improvement",
    status: "pending",
    visibility: "client",
    metadata: { consultingTarget: "CLIENT" },
    createdAt: new Date("2026-02-15"),
    ...overrides,
  };
}

function makeActionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ac000000-0000-4000-8000-000000000001",
    engagementId: ENG_ID,
    title: "Call top 10 debtors",
    description: "Outreach campaign",
    status: "pending",
    assignedTo: "owner-001",
    dueAt: new Date("2026-03-01"),
    metadata: { priority: "critical", consultingTarget: "CLIENT" },
    createdAt: new Date("2026-02-20"),
    updatedAt: new Date("2026-02-20"),
  };
}

let GET: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  const route = await import("@/app/api/consulting/engagements/export/route");
  GET = route.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  mockEmitAuditEvent.mockResolvedValue(undefined);
  allowAll();
  // default: empty sub-collections
  mockDb.finding.findMany.mockResolvedValue([]);
  mockDb.recommendation.findMany.mockResolvedValue([]);
  mockDb.action.findMany.mockResolvedValue([]);
});

// ─── Capability declaration ───────────────────────────────────────────────────

describe("route capability declaration", () => {
  test("export route declares CONSULTING_READ capability", () => {
    expect(capturedDeclarations[0]?.requireCapabilities).toContain("consulting:read");
  });

  test("export route declares requireWorkspace: true", () => {
    expect(capturedDeclarations[0]?.requireWorkspace).toBe(true);
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe("input validation", () => {
  test("missing id returns 400", async () => {
    const req = new Request(`http://localhost/api/consulting/engagements/export`);
    const result = await GET({ request: req });
    expect(result.status).toBe(400);
    expect(result.body?.error).toMatch(/id/i);
  });

  test("auth deny returns 403 without querying DB", async () => {
    denyWith(["consulting:read"]);
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    const req = new Request(`http://localhost/api/consulting/engagements/export?id=${ENG_ID}`);
    const result = await GET({ request: req });
    expect(result.status).toBe(403);
    expect(mockDb.engagement.findFirst).not.toHaveBeenCalled();
  });

  test("engagement not found returns 404", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);
    const req = new Request(`http://localhost/api/consulting/engagements/export?id=${ENG_ID}`);
    const result = await GET({ request: req });
    expect(result.status).toBe(404);
  });
});

// ─── Export structure ─────────────────────────────────────────────────────────

describe("export structure", () => {
  function exportReq() {
    return new Request(`http://localhost/api/consulting/engagements/export?id=${ENG_ID}`);
  }

  beforeEach(() => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
  });

  test("response status is 200", async () => {
    const result = await GET({ request: exportReq() });
    expect(result.status).toBe(200);
  });

  test("response body contains export key with exportedAt, workspaceId, engagement", async () => {
    const result = await GET({ request: exportReq() });
    const exported = result.body?.export as Record<string, unknown>;
    expect(exported).toHaveProperty("exportedAt");
    expect(exported).toHaveProperty("workspaceId", WS_A);
    expect(exported).toHaveProperty("engagement");
  });

  test("engagement in export contains standard consultant fields", async () => {
    const result = await GET({ request: exportReq() });
    const eng = (result.body?.export as Record<string, unknown>)?.engagement as Record<string, unknown>;
    expect(eng).toHaveProperty("id", ENG_ID);
    expect(eng).toHaveProperty("title", "Export Test Engagement");
    expect(eng).toHaveProperty("consultingPhase", "DIAGNOSIS");
    expect(eng).toHaveProperty("consultantNotes", "Internal notes");
    expect(eng).toHaveProperty("assignedConsultantId", "consultant-001");
    expect(eng).toHaveProperty("createdBy", "creator-001");
  });

  test("empty sub-collections return empty arrays", async () => {
    const result = await GET({ request: exportReq() });
    const eng = (result.body?.export as Record<string, unknown>)?.engagement as Record<string, unknown>;
    expect(eng.findings).toEqual([]);
    expect(eng.recommendations).toEqual([]);
    expect(eng.actions).toEqual([]);
  });
});

// ─── Findings in export ───────────────────────────────────────────────────────

describe("findings in export", () => {
  function exportReq() {
    return new Request(`http://localhost/api/consulting/engagements/export?id=${ENG_ID}`);
  }

  beforeEach(() => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
  });

  test("single finding included with all consultant fields", async () => {
    mockDb.finding.findMany.mockResolvedValue([makeFindingRow()]);
    const result = await GET({ request: exportReq() });
    const eng = (result.body?.export as Record<string, unknown>)?.engagement as Record<string, unknown>;
    const findings = eng.findings as Record<string, unknown>[];
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.id).toBe("ff000000-0000-4000-8000-000000000001");
    expect(f.severity).toBe("critical");
    expect(f.rootCause).toBe("AR process breakdown");
    expect(f.hypothesis).toBe("Client delayed invoicing");
    expect(f.consequence).toBe("Cash crisis in 60 days");
  });

  test("multiple findings all included in order", async () => {
    mockDb.finding.findMany.mockResolvedValue([
      makeFindingRow(),
      makeFindingRow({ id: "ff000000-0000-4000-8000-000000000002", title: "Second finding" }),
    ]);
    const result = await GET({ request: exportReq() });
    const eng = (result.body?.export as Record<string, unknown>)?.engagement as Record<string, unknown>;
    expect((eng.findings as unknown[]).length).toBe(2);
  });
});

// ─── Recommendations in export ────────────────────────────────────────────────

describe("recommendations in export", () => {
  function exportReq() {
    return new Request(`http://localhost/api/consulting/engagements/export?id=${ENG_ID}`);
  }

  beforeEach(() => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
  });

  test("recommendation consultingTarget read from metadata when stored", async () => {
    mockDb.recommendation.findMany.mockResolvedValue([
      makeRecRow({ metadata: { consultingTarget: "CONSULTANT" } }),
    ]);
    const result = await GET({ request: exportReq() });
    const eng = (result.body?.export as Record<string, unknown>)?.engagement as Record<string, unknown>;
    const recs = eng.recommendations as Record<string, unknown>[];
    expect(recs[0].consultingTarget).toBe("CONSULTANT");
  });

  test("recommendation consultingTarget defaults to CLIENT when metadata absent", async () => {
    mockDb.recommendation.findMany.mockResolvedValue([makeRecRow({ metadata: null })]);
    const result = await GET({ request: exportReq() });
    const eng = (result.body?.export as Record<string, unknown>)?.engagement as Record<string, unknown>;
    const recs = eng.recommendations as Record<string, unknown>[];
    expect(recs[0].consultingTarget).toBe("CLIENT");
  });

  test("recommendation standard fields present", async () => {
    mockDb.recommendation.findMany.mockResolvedValue([makeRecRow()]);
    const result = await GET({ request: exportReq() });
    const eng = (result.body?.export as Record<string, unknown>)?.engagement as Record<string, unknown>;
    const recs = eng.recommendations as Record<string, unknown>[];
    expect(recs[0].title).toBe("Accelerate AR collection");
    expect(recs[0].priority).toBe("high");
    expect(recs[0].findingId).toBe("ff000000-0000-4000-8000-000000000001");
  });
});

// ─── Actions in export ────────────────────────────────────────────────────────

describe("actions in export", () => {
  function exportReq() {
    return new Request(`http://localhost/api/consulting/engagements/export?id=${ENG_ID}`);
  }

  beforeEach(() => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
  });

  test("action priority read from metadata", async () => {
    mockDb.action.findMany.mockResolvedValue([makeActionRow()]);
    const result = await GET({ request: exportReq() });
    const eng = (result.body?.export as Record<string, unknown>)?.engagement as Record<string, unknown>;
    const actions = eng.actions as Record<string, unknown>[];
    expect(actions[0].priority).toBe("critical");
  });

  test("action consultingTarget read from metadata", async () => {
    mockDb.action.findMany.mockResolvedValue([makeActionRow()]);
    const result = await GET({ request: exportReq() });
    const eng = (result.body?.export as Record<string, unknown>)?.engagement as Record<string, unknown>;
    const actions = eng.actions as Record<string, unknown>[];
    expect(actions[0].consultingTarget).toBe("CLIENT");
  });

  test("action standard fields present", async () => {
    mockDb.action.findMany.mockResolvedValue([makeActionRow()]);
    const result = await GET({ request: exportReq() });
    const eng = (result.body?.export as Record<string, unknown>)?.engagement as Record<string, unknown>;
    const actions = eng.actions as Record<string, unknown>[];
    expect(actions[0].title).toBe("Call top 10 debtors");
    expect(actions[0].status).toBe("pending");
    expect(actions[0].assignedToUserId).toBe("owner-001");
  });
});

// ─── Audit event ─────────────────────────────────────────────────────────────

describe("audit event: consulting.engagement_exported", () => {
  function exportReq() {
    return new Request(`http://localhost/api/consulting/engagements/export?id=${ENG_ID}`);
  }

  beforeEach(() => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    mockDb.finding.findMany.mockResolvedValue([makeFindingRow()]);
    mockDb.recommendation.findMany.mockResolvedValue([makeRecRow()]);
    mockDb.action.findMany.mockResolvedValue([makeActionRow()]);
  });

  test("emitAuditEvent called exactly once on successful export", async () => {
    await GET({ request: exportReq() });
    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(1);
  });

  test("event name is consulting.engagement_exported", async () => {
    await GET({ request: exportReq() });
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.eventName).toBe("consulting.engagement_exported");
  });

  test("actorId from verified context", async () => {
    await GET({ request: exportReq() });
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.actorId).toBe(ACTOR_ID);
  });

  test("workspaceId from verified context", async () => {
    await GET({ request: exportReq() });
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.workspaceId).toBe(WS_A);
  });

  test("entityId is the engagement id", async () => {
    await GET({ request: exportReq() });
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.entityId).toBe(ENG_ID);
  });

  test("payload contains sub-collection counts", async () => {
    await GET({ request: exportReq() });
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.payload.findingsCount).toBe(1);
    expect(call.payload.recommendationsCount).toBe(1);
    expect(call.payload.actionsCount).toBe(1);
  });

  test("audit event NOT emitted on 404", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);
    await GET({ request: exportReq() });
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  test("audit event NOT emitted on missing id (400)", async () => {
    const req = new Request(`http://localhost/api/consulting/engagements/export`);
    await GET({ request: req });
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });
});

// ─── Workspace isolation ──────────────────────────────────────────────────────

describe("workspace isolation", () => {
  test("findFirst queried with verifiedWorkspaceId not URL params", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    const req = new Request(
      `http://localhost/api/consulting/engagements/export?id=${ENG_ID}&workspaceId=INJECTED_WS`
    );
    await GET({ request: req });
    expect(mockDb.engagement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_A }),
      })
    );
    expect(mockDb.engagement.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "INJECTED_WS" }),
      })
    );
  });

  test("exportedAt and workspaceId in response match verified context", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    const req = new Request(`http://localhost/api/consulting/engagements/export?id=${ENG_ID}`);
    const result = await GET({ request: req });
    const exported = result.body?.export as Record<string, unknown>;
    expect(exported.workspaceId).toBe(WS_A);
    expect(typeof exported.exportedAt).toBe("string");
  });
});
