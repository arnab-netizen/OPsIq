/**
 * /api/owner/risks — route-level tests.
 *
 * Covers:
 * 1. Static source enforcement (canonical, OWNER_MANAGE, requireWorkspace)
 * 2. POST Zod schema validation (action enum, uuid fields, numeric ranges)
 * 3. GET handler — listBusinessRisks called with verifiedWorkspaceId, 200
 * 4. POST CREATE — title+category required, createBusinessRisk called, 201
 * 5. POST UPDATE — riskId required, updateBusinessRisk called, 200
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Mocks — hoisted before any imports
// ---------------------------------------------------------------------------
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: Record<string, unknown>) => unknown,
    options?: Record<string, unknown>
  ) => {
    const wrapped = (ctx: Record<string, unknown>) => handler(ctx);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: (body: unknown, init?: { status?: number }) => ({
    body,
    status: init?.status ?? 200,
  }),
}));

vi.mock("@/services/owner-mode/business-risk.service", () => ({
  listBusinessRisks: vi.fn().mockResolvedValue([]),
  createBusinessRisk: vi.fn().mockResolvedValue({
    id: "risk-uuid-0001",
    riskCode: "RISK-ABCD1234",
    title: "Supply chain disruption",
    description: null,
    category: "OPERATIONAL",
    likelihood: 70,
    impact: 80,
    severity: 56,
    status: "IDENTIFIED",
    mitigationAction: null,
    residualRisk: null,
    linkedObjectiveId: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  }),
  updateBusinessRisk: vi.fn().mockResolvedValue({
    id: "risk-uuid-0001",
    riskCode: "RISK-ABCD1234",
    title: "Supply chain disruption",
    description: null,
    category: "OPERATIONAL",
    likelihood: 70,
    impact: 80,
    severity: 56,
    status: "IDENTIFIED",
    mitigationAction: null,
    residualRisk: null,
    linkedObjectiveId: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  }),
}));

vi.mock("@/lib/validation", () => ({
  parseRequestBody: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------
import { GET, POST } from "@/app/api/owner/risks/route";
import {
  listBusinessRisks,
  createBusinessRisk,
  updateBusinessRisk,
} from "@/services/owner-mode/business-risk.service";
import { parseRequestBody } from "@/lib/validation";

const WS = "a1b2c3d4-e5f6-4789-8abc-def012345678";
const ACTOR = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";
const RISK_ID = "c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7";

const mockRisk = {
  id: "risk-uuid-0001",
  riskCode: "RISK-ABCD1234",
  title: "Supply chain disruption",
  description: null,
  category: "OPERATIONAL",
  likelihood: 70,
  impact: 80,
  severity: 56,
  status: "IDENTIFIED",
  mitigationAction: null,
  residualRisk: null,
  linkedObjectiveId: null,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
};

function makeCtx(body?: unknown, workspaceId = WS) {
  return {
    verifiedWorkspaceId: workspaceId,
    verifiedActorId: ACTOR,
    request: { json: async () => body },
  };
}

// ---------------------------------------------------------------------------
// 1. Static source enforcement
// ---------------------------------------------------------------------------
describe("/api/owner/risks — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve("src/app/api/owner/risks/route.ts"),
    "utf-8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_MANAGE capability", () => {
    expect(src).toContain("OWNER_MANAGE");
  });

  it("both GET and POST use requireWorkspace: true", () => {
    const matches = src.match(/requireWorkspace\s*:\s*true/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("uses ctx.verifiedWorkspaceId", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
  });

  it("uses ctx.verifiedActorId", () => {
    expect(src).toContain("ctx.verifiedActorId");
  });

  it("is dynamic + nodejs runtime", () => {
    expect(src).toContain("force-dynamic");
    expect(src).toContain('"nodejs"');
  });
});

// ---------------------------------------------------------------------------
// 2. POST Zod schema validation
// ---------------------------------------------------------------------------
describe("/api/owner/risks — POST schema", () => {
  const src = fs.readFileSync(
    path.resolve("src/app/api/owner/risks/route.ts"),
    "utf-8"
  );

  it("action is enum CREATE/UPDATE with default CREATE", () => {
    expect(src).toContain('z.enum(["CREATE", "UPDATE"]).default("CREATE")');
  });

  it("category is enum with all 6 risk categories", () => {
    expect(src).toContain("OPERATIONAL");
    expect(src).toContain("FINANCIAL");
    expect(src).toContain("MARKET");
    expect(src).toContain("COMPLIANCE");
    expect(src).toContain("EXECUTION");
    expect(src).toContain("STRATEGIC");
  });

  it("status is enum with all 6 statuses", () => {
    expect(src).toContain("IDENTIFIED");
    expect(src).toContain("ASSESSED");
    expect(src).toContain("MITIGATING");
    expect(src).toContain("ACCEPTED");
    expect(src).toContain("RESOLVED");
    expect(src).toContain("CLOSED");
  });

  it("likelihood bounded 0–100", () => {
    expect(src).toContain("z.number().int().min(0).max(100)");
  });

  it("riskId validated as uuid", () => {
    expect(src).toContain(".uuid()");
  });
});

// ---------------------------------------------------------------------------
// 3. GET handler
// ---------------------------------------------------------------------------
describe("GET /api/owner/risks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty risks array when none exist", async () => {
    vi.mocked(listBusinessRisks).mockResolvedValueOnce([]);
    const result = await GET(makeCtx() as never);
    expect(result).toMatchObject({ body: { risks: [] }, status: 200 });
  });

  it("calls listBusinessRisks with verifiedWorkspaceId", async () => {
    vi.mocked(listBusinessRisks).mockResolvedValueOnce([]);
    await GET(makeCtx() as never);
    expect(listBusinessRisks).toHaveBeenCalledWith(WS);
  });

  it("workspace isolation: uses workspaceId from ctx, not from body", async () => {
    const WS2 = "d2e3f4a5-b6c7-4d8e-9f0a-b1c2d3e4f5a6";
    vi.mocked(listBusinessRisks).mockResolvedValueOnce([]);
    await GET(makeCtx(undefined, WS2) as never);
    expect(listBusinessRisks).toHaveBeenCalledWith(WS2);
  });

  it("returns risks list with all items", async () => {
    vi.mocked(listBusinessRisks).mockResolvedValueOnce([mockRisk] as never);
    const result = await GET(makeCtx() as never);
    expect(result.body.risks).toHaveLength(1);
    expect(result.body.risks[0].riskCode).toBe("RISK-ABCD1234");
  });

  it("returns status 200", async () => {
    vi.mocked(listBusinessRisks).mockResolvedValueOnce([]);
    const result = await GET(makeCtx() as never);
    expect(result.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 4. POST CREATE
// ---------------------------------------------------------------------------
describe("POST /api/owner/risks — CREATE", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when title is missing for CREATE", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "CREATE",
      category: "OPERATIONAL",
    });

    const result = await POST(makeCtx() as never);
    expect(result.status).toBe(400);
  });

  it("returns 400 when category is missing for CREATE", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "CREATE",
      title: "Some risk",
    });

    const result = await POST(makeCtx() as never);
    expect(result.status).toBe(400);
  });

  it("returns 201 on successful CREATE", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "CREATE",
      title: "Supply chain disruption",
      category: "OPERATIONAL",
    });
    vi.mocked(createBusinessRisk).mockResolvedValueOnce(mockRisk as never);

    const result = await POST(makeCtx() as never);
    expect(result.status).toBe(201);
    expect(result.body.risk).toEqual(mockRisk);
  });

  it("calls createBusinessRisk with verifiedWorkspaceId", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "CREATE",
      title: "Risk title",
      category: "FINANCIAL",
    });
    vi.mocked(createBusinessRisk).mockResolvedValueOnce(mockRisk as never);

    await POST(makeCtx() as never);

    const call = vi.mocked(createBusinessRisk).mock.calls[0][0];
    expect(call.workspaceId).toBe(WS);
  });

  it("calls createBusinessRisk with verifiedActorId", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "CREATE",
      title: "Risk title",
      category: "MARKET",
    });
    vi.mocked(createBusinessRisk).mockResolvedValueOnce(mockRisk as never);

    await POST(makeCtx() as never);

    const call = vi.mocked(createBusinessRisk).mock.calls[0][0];
    expect(call.actorId).toBe(ACTOR);
  });

  it("does NOT pass workspace from body (uses ctx only)", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "CREATE",
      title: "Injection attempt",
      category: "COMPLIANCE",
      workspaceId: "attacker-ws-id",
    });
    vi.mocked(createBusinessRisk).mockResolvedValueOnce(mockRisk as never);

    await POST(makeCtx() as never);

    const call = vi.mocked(createBusinessRisk).mock.calls[0][0];
    expect(call.workspaceId).toBe(WS);
    expect(call.workspaceId).not.toBe("attacker-ws-id");
  });

  it("auto-generates riskCode when not provided", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "CREATE",
      title: "Risk no code",
      category: "EXECUTION",
    });
    vi.mocked(createBusinessRisk).mockResolvedValueOnce(mockRisk as never);

    await POST(makeCtx() as never);

    const call = vi.mocked(createBusinessRisk).mock.calls[0][0];
    expect(call.riskCode).toBeDefined();
    expect(typeof call.riskCode).toBe("string");
    expect(call.riskCode.length).toBeGreaterThan(0);
  });

  it("uses provided riskCode when supplied", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "CREATE",
      title: "Risk with code",
      category: "STRATEGIC",
      riskCode: "RISK-001",
    });
    vi.mocked(createBusinessRisk).mockResolvedValueOnce(mockRisk as never);

    await POST(makeCtx() as never);

    const call = vi.mocked(createBusinessRisk).mock.calls[0][0];
    expect(call.riskCode).toBe("RISK-001");
  });

  it("passes optional likelihood and impact", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "CREATE",
      title: "Risk with scores",
      category: "FINANCIAL",
      likelihood: 60,
      impact: 70,
    });
    vi.mocked(createBusinessRisk).mockResolvedValueOnce(mockRisk as never);

    await POST(makeCtx() as never);

    const call = vi.mocked(createBusinessRisk).mock.calls[0][0];
    expect(call.likelihood).toBe(60);
    expect(call.impact).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// 5. POST UPDATE
// ---------------------------------------------------------------------------
describe("POST /api/owner/risks — UPDATE", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when riskId is missing for UPDATE", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "UPDATE",
      title: "Updated title",
    });

    const result = await POST(makeCtx() as never);
    expect(result.status).toBe(400);
    expect(result.body.error).toContain("riskId");
  });

  it("returns 200 on successful UPDATE", async () => {
    const updatedRisk = { ...mockRisk, title: "Updated title", status: "ASSESSED" };
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "UPDATE",
      riskId: RISK_ID,
      title: "Updated title",
      status: "ASSESSED",
    });
    vi.mocked(updateBusinessRisk).mockResolvedValueOnce(updatedRisk as never);

    const result = await POST(makeCtx() as never);
    expect(result.status).toBe(200);
    expect(result.body.risk).toEqual(updatedRisk);
  });

  it("calls updateBusinessRisk with verifiedWorkspaceId", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "UPDATE",
      riskId: RISK_ID,
      status: "MITIGATING",
    });
    vi.mocked(updateBusinessRisk).mockResolvedValueOnce(mockRisk as never);

    await POST(makeCtx() as never);

    const call = vi.mocked(updateBusinessRisk).mock.calls[0][0];
    expect(call.workspaceId).toBe(WS);
  });

  it("calls updateBusinessRisk with riskId from body", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "UPDATE",
      riskId: RISK_ID,
      status: "RESOLVED",
    });
    vi.mocked(updateBusinessRisk).mockResolvedValueOnce(mockRisk as never);

    await POST(makeCtx() as never);

    const call = vi.mocked(updateBusinessRisk).mock.calls[0][0];
    expect(call.riskId).toBe(RISK_ID);
  });

  it("workspace isolation: UPDATE uses workspaceId from ctx", async () => {
    const WS2 = "e3f4a5b6-c7d8-4e9f-8a0b-c1d2e3f4a5b6";
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "UPDATE",
      riskId: RISK_ID,
      status: "ACCEPTED",
    });
    vi.mocked(updateBusinessRisk).mockResolvedValueOnce(mockRisk as never);

    await POST(makeCtx(undefined, WS2) as never);

    const call = vi.mocked(updateBusinessRisk).mock.calls[0][0];
    expect(call.workspaceId).toBe(WS2);
  });

  it("passes residualRisk to updateBusinessRisk", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "UPDATE",
      riskId: RISK_ID,
      residualRisk: 20,
    });
    vi.mocked(updateBusinessRisk).mockResolvedValueOnce(mockRisk as never);

    await POST(makeCtx() as never);

    const call = vi.mocked(updateBusinessRisk).mock.calls[0][0];
    expect(call.residualRisk).toBe(20);
  });

  it("passes mitigationAction to updateBusinessRisk", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      action: "UPDATE",
      riskId: RISK_ID,
      mitigationAction: "Implement supplier diversity",
    });
    vi.mocked(updateBusinessRisk).mockResolvedValueOnce(mockRisk as never);

    await POST(makeCtx() as never);

    const call = vi.mocked(updateBusinessRisk).mock.calls[0][0];
    expect(call.mitigationAction).toBe("Implement supplier diversity");
  });
});

// ---------------------------------------------------------------------------
// 6. withCanonicalEnforcement options wiring
// ---------------------------------------------------------------------------
describe("/api/owner/risks — options wiring", () => {
  it("GET uses OWNER_MANAGE capability", () => {
    const opts = (GET as { __options?: Record<string, unknown> }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
  });

  it("POST uses OWNER_MANAGE capability", () => {
    const opts = (POST as { __options?: Record<string, unknown> }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
  });

  it("GET requires workspace", () => {
    const opts = (GET as { __options?: Record<string, unknown> }).__options;
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("POST requires workspace", () => {
    const opts = (POST as { __options?: Record<string, unknown> }).__options;
    expect(opts?.requireWorkspace).toBe(true);
  });
});
