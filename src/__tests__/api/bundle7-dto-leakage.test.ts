/**
 * Bundle 7 Slice 4: DTO Leakage Scan — Consulting Route
 *
 * Proves that the consulting GET endpoint never exposes internal consultant-only
 * fields when the client view is requested (?view=client), and that the consultant
 * view correctly includes them.
 *
 * Internal fields tested (must NOT appear in client view):
 *   - consultantNotes
 *   - assignedConsultantId
 *   - createdBy
 *   - humanFactors.resistanceToChange
 *   - humanFactors.communicationBreakdownRisk
 *   - humanFactors.moraleFragility
 *   - humanFactors.managementCapabilityGap
 *   - humanFactors.accountabilityWeakness
 *
 * Allowed fields in client humanFactors (must be present):
 *   - humanFactors.ownerBottleneckRisk
 *   - humanFactors.followThroughRisk
 *   - humanFactors.keyPersonDependency
 *
 * Test strategy: mock DB layer with "poison" rows whose internal fields contain
 * recognizable sentinel values. Assert sentinels never appear in client-view
 * response body; assert they DO appear in consultant-view response body.
 * Full DTO pipeline (service → toClientDTO/toConsultantDTO → route) is exercised.
 */

import { describe, test, expect, vi, beforeAll, beforeEach } from "vitest";

const WS_A = "ws-dto-leak-a";

const POISON_CONSULTANT_NOTES = "CONFIDENTIAL_CONSULTANT_NOTES_MUST_NOT_LEAK";
const POISON_ASSIGNED_CONSULTANT_ID = "CONFIDENTIAL_ASSIGNED_CONSULTANT_ID_MUST_NOT_LEAK";
const POISON_CREATED_BY = "CONFIDENTIAL_CREATED_BY_MUST_NOT_LEAK";

const ENG_ID = "ee000000-0000-4000-8000-000000000001";

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
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => Promise<unknown>,
    _options: Record<string, unknown>
  ) => {
    return async (testCtx: unknown) => {
      return mockWithCanonical(handler, _options, testCtx);
    };
  },
}));

type CanonicalResult = { body: Record<string, unknown>; status: number };

function makeCtx(): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: "actor-dto-test",
  };
}

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (
      handler: (ctx: unknown) => Promise<unknown>,
      _options: unknown,
      testCtx: unknown
    ) => {
      const req = (testCtx as Record<string, unknown>)?.request as Request | undefined;
      return handler({ ...makeCtx(), request: req });
    }
  );
}

function makePoisonRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ENG_ID,
    title: "Poison Row Engagement",
    clientId: "cc000000-0000-4000-8000-000000000001",
    workspaceId: WS_A,
    engagementMode: "consulting",
    consultingPhase: "DISCOVERY",
    status: "active",
    healthStatus: "GREEN",
    interventionMode: "PERFORMANCE_IMPROVEMENT",
    interventionPhase: "STABILISE",
    description: "desc",
    startDate: new Date("2026-01-01"),
    targetEndDate: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    // Internal fields — must be stripped in client view
    consultantNotes: POISON_CONSULTANT_NOTES,
    assignedConsultantId: POISON_ASSIGNED_CONSULTANT_ID,
    createdBy: POISON_CREATED_BY,
    humanFactors: {
      ownerBottleneckRisk: "MEDIUM",
      followThroughRisk: "LOW",
      keyPersonDependency: true,
      // Restricted humanFactors — must be stripped in client view
      resistanceToChange: "HIGH",
      communicationBreakdownRisk: "HIGH",
      moraleFragility: "HIGH",
      managementCapabilityGap: "HIGH",
      accountabilityWeakness: "HIGH",
    },
    ...overrides,
  };
}

let GET: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  const route = await import("@/app/api/consulting/engagements/route");
  GET = route.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  mockEmitAuditEvent.mockResolvedValue(undefined);
  allowAll();
});

// ─── Client view: single GET ──────────────────────────────────────────────────

describe("client view (?view=client) — internal fields must NOT appear in single GET", () => {
  function clientReq() {
    return new Request(`http://localhost/api/consulting/engagements?id=${ENG_ID}&view=client`);
  }

  test("consultantNotes absent from response", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: clientReq() });
    expect(result.body?.engagement).not.toHaveProperty("consultantNotes");
  });

  test("assignedConsultantId absent from response", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: clientReq() });
    expect(result.body?.engagement).not.toHaveProperty("assignedConsultantId");
  });

  test("createdBy absent from response", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: clientReq() });
    expect(result.body?.engagement).not.toHaveProperty("createdBy");
  });

  test("standard fields present: id, title, clientId, consultingPhase, status", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: clientReq() });
    const eng = result.body?.engagement as Record<string, unknown>;
    expect(eng).toHaveProperty("id", ENG_ID);
    expect(eng).toHaveProperty("title", "Poison Row Engagement");
    expect(eng).toHaveProperty("clientId");
    expect(eng).toHaveProperty("consultingPhase", "DISCOVERY");
    expect(eng).toHaveProperty("status", "active");
  });

  test("response status is 200", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: clientReq() });
    expect(result.status).toBe(200);
  });
});

// ─── humanFactors field-level restriction ─────────────────────────────────────

describe("humanFactors client restriction — restricted fields absent, allowed fields present", () => {
  function clientReq() {
    return new Request(`http://localhost/api/consulting/engagements?id=${ENG_ID}&view=client`);
  }

  function hf(result: CanonicalResult): Record<string, unknown> | null {
    return ((result.body?.engagement as Record<string, unknown>)?.humanFactors as Record<string, unknown>) ?? null;
  }

  test("resistanceToChange absent from client humanFactors", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: clientReq() });
    expect(hf(result)).not.toHaveProperty("resistanceToChange");
  });

  test("communicationBreakdownRisk absent from client humanFactors", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: clientReq() });
    expect(hf(result)).not.toHaveProperty("communicationBreakdownRisk");
  });

  test("moraleFragility absent from client humanFactors", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: clientReq() });
    expect(hf(result)).not.toHaveProperty("moraleFragility");
  });

  test("managementCapabilityGap absent from client humanFactors", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: clientReq() });
    expect(hf(result)).not.toHaveProperty("managementCapabilityGap");
  });

  test("accountabilityWeakness absent from client humanFactors", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: clientReq() });
    expect(hf(result)).not.toHaveProperty("accountabilityWeakness");
  });

  test("ownerBottleneckRisk present in client humanFactors", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: clientReq() });
    expect(hf(result)).toHaveProperty("ownerBottleneckRisk", "MEDIUM");
  });

  test("followThroughRisk present in client humanFactors", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: clientReq() });
    expect(hf(result)).toHaveProperty("followThroughRisk", "LOW");
  });

  test("keyPersonDependency present in client humanFactors", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: clientReq() });
    expect(hf(result)).toHaveProperty("keyPersonDependency", true);
  });
});

// ─── Client view: list path ───────────────────────────────────────────────────

describe("client view (?view=client) — list path", () => {
  test("consultantNotes absent from every item in list", async () => {
    mockDb.engagement.findMany.mockResolvedValue([
      makePoisonRow(),
      makePoisonRow({ id: "ee000000-0000-4000-8000-000000000002" }),
    ]);
    const req = new Request(`http://localhost/api/consulting/engagements?view=client`);
    const result = await GET({ request: req });
    const engagements = result.body?.engagements as Record<string, unknown>[];
    expect(engagements).toHaveLength(2);
    for (const eng of engagements) {
      expect(eng).not.toHaveProperty("consultantNotes");
      expect(eng).not.toHaveProperty("assignedConsultantId");
      expect(eng).not.toHaveProperty("createdBy");
    }
  });

  test("restricted humanFactors absent from every item in list", async () => {
    mockDb.engagement.findMany.mockResolvedValue([makePoisonRow()]);
    const req = new Request(`http://localhost/api/consulting/engagements?view=client`);
    const result = await GET({ request: req });
    const engagements = result.body?.engagements as Record<string, unknown>[];
    const hf = engagements[0]?.humanFactors as Record<string, unknown> | null;
    expect(hf).not.toHaveProperty("resistanceToChange");
    expect(hf).not.toHaveProperty("communicationBreakdownRisk");
    expect(hf).not.toHaveProperty("moraleFragility");
    expect(hf).not.toHaveProperty("managementCapabilityGap");
    expect(hf).not.toHaveProperty("accountabilityWeakness");
  });

  test("empty list returns status 200 with empty array", async () => {
    mockDb.engagement.findMany.mockResolvedValue([]);
    const req = new Request(`http://localhost/api/consulting/engagements?view=client`);
    const result = await GET({ request: req });
    expect(result.status).toBe(200);
    expect(result.body?.engagements).toEqual([]);
  });
});

// ─── Consultant view: internal fields must be present ────────────────────────

describe("consultant view (no ?view=client) — internal fields must be present", () => {
  function consultantReq(id = true) {
    return id
      ? new Request(`http://localhost/api/consulting/engagements?id=${ENG_ID}`)
      : new Request(`http://localhost/api/consulting/engagements`);
  }

  test("consultantNotes present with sentinel value in consultant single view", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: consultantReq() });
    expect(result.body?.engagement).toHaveProperty("consultantNotes", POISON_CONSULTANT_NOTES);
  });

  test("assignedConsultantId present with sentinel value in consultant single view", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: consultantReq() });
    expect(result.body?.engagement).toHaveProperty("assignedConsultantId", POISON_ASSIGNED_CONSULTANT_ID);
  });

  test("createdBy present with sentinel value in consultant single view", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: consultantReq() });
    expect(result.body?.engagement).toHaveProperty("createdBy", POISON_CREATED_BY);
  });

  test("full humanFactors (all restricted fields) present in consultant single view", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow());
    const result = await GET({ request: consultantReq() });
    const hf = ((result.body?.engagement as Record<string, unknown>)?.humanFactors as Record<string, unknown>) ?? null;
    expect(hf).toHaveProperty("resistanceToChange", "HIGH");
    expect(hf).toHaveProperty("communicationBreakdownRisk", "HIGH");
    expect(hf).toHaveProperty("moraleFragility", "HIGH");
    expect(hf).toHaveProperty("managementCapabilityGap", "HIGH");
    expect(hf).toHaveProperty("accountabilityWeakness", "HIGH");
  });

  test("list consultant view: consultantNotes present in all items", async () => {
    mockDb.engagement.findMany.mockResolvedValue([makePoisonRow()]);
    const result = await GET({ request: consultantReq(false) });
    const engagements = result.body?.engagements as Record<string, unknown>[];
    expect(engagements[0]).toHaveProperty("consultantNotes", POISON_CONSULTANT_NOTES);
    expect(engagements[0]).toHaveProperty("assignedConsultantId", POISON_ASSIGNED_CONSULTANT_ID);
  });
});

// ─── Null humanFactors edge cases ─────────────────────────────────────────────

describe("null humanFactors — clean handling in both views", () => {
  test("null humanFactors in client view returns null without error", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow({ humanFactors: null }));
    const req = new Request(`http://localhost/api/consulting/engagements?id=${ENG_ID}&view=client`);
    const result = await GET({ request: req });
    expect(result.status).toBe(200);
    const eng = result.body?.engagement as Record<string, unknown>;
    expect(eng.humanFactors).toBeNull();
  });

  test("null humanFactors in consultant view returns null without error", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makePoisonRow({ humanFactors: null }));
    const req = new Request(`http://localhost/api/consulting/engagements?id=${ENG_ID}`);
    const result = await GET({ request: req });
    expect(result.status).toBe(200);
    const eng = result.body?.engagement as Record<string, unknown>;
    expect(eng.humanFactors).toBeNull();
  });
});
