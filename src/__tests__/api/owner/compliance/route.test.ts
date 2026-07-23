/**
 * /api/owner/compliance — route-level tests.
 *
 * Covers:
 * 1. Static source enforcement (canonical, OWNER_MANAGE/OWNER_VIEW, requireWorkspace)
 * 2. POST Zod schema validation (kind enum, required name, optional fields, rejects extra)
 * 3. GET handler — workspace isolation, full ComplianceReviewItem shape
 * 4. POST handler — recordComplianceItem called with verifiedWorkspaceId, 201
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

vi.mock("@/services/owner-mode/compliance.service", () => ({
  recordComplianceItem: vi.fn().mockResolvedValue("new-compliance-id"),
  getComplianceReviewItems: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/validation", () => ({
  parseRequestBody: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------
import { GET, POST } from "@/app/api/owner/compliance/route";
import {
  recordComplianceItem,
  getComplianceReviewItems,
} from "@/services/owner-mode/compliance.service";
import { parseRequestBody } from "@/lib/validation";

const WS = "a1b2c3d4-e5f6-4789-8abc-def012345678";
const ACTOR = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";

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
describe("/api/owner/compliance — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve("src/app/api/owner/compliance/route.ts"),
    "utf-8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("POST requires OWNER_MANAGE", () => {
    expect(src).toContain("OWNER_MANAGE");
  });

  it("GET requires OWNER_VIEW", () => {
    expect(src).toContain("OWNER_VIEW");
  });

  it("both handlers use requireWorkspace: true", () => {
    const matches = src.match(/requireWorkspace\s*:\s*true/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("uses ctx.verifiedWorkspaceId (not body-supplied)", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
  });

  it("uses ctx.verifiedActorId (not body-supplied)", () => {
    expect(src).toContain("ctx.verifiedActorId");
  });

  it("POST handler is dynamic + nodejs runtime", () => {
    expect(src).toContain('force-dynamic');
    expect(src).toContain('"nodejs"');
  });
});

// ---------------------------------------------------------------------------
// 2. POST Zod schema validation (via parseRequestBody)
// ---------------------------------------------------------------------------
describe("/api/owner/compliance — POST schema", () => {
  const src = fs.readFileSync(
    path.resolve("src/app/api/owner/compliance/route.ts"),
    "utf-8"
  );

  it("schema enforces kind as enum", () => {
    expect(src).toContain('z.enum(["licence", "permit", "insurance", "tax", "document"])');
  });

  it("schema enforces name min(1)", () => {
    expect(src).toContain("z.string().trim().min(1)");
  });

  it("schema allows optional provenanceSource enum", () => {
    expect(src).toContain("owner_input");
    expect(src).toContain("professional_input");
    expect(src).toContain("authoritative_document");
  });

  it("schema has optional expiresAt as datetime string", () => {
    expect(src).toContain("z.string().datetime()");
  });

  it("evidenceValidityDays bounded 1–3650", () => {
    expect(src).toContain("max(3650)");
  });

  it("recurrenceMonths bounded 1–120", () => {
    expect(src).toContain("max(120)");
  });
});

// ---------------------------------------------------------------------------
// 3. GET handler
// ---------------------------------------------------------------------------
describe("GET /api/owner/compliance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns items from getComplianceReviewItems", async () => {
    const mockItems = [
      {
        id: "item-1",
        kind: "licence",
        name: "Business licence",
        reference: "LIC-001",
        expiresAt: "2024-01-01T00:00:00.000Z",
        status: "active",
        jurisdiction: "NSW",
        obligationOwner: "Owner",
        penaltyDescription: "Fine",
        state: "expired",
        createdAt: "2023-01-01T00:00:00.000Z",
      },
    ];
    vi.mocked(getComplianceReviewItems).mockResolvedValueOnce(mockItems as never);

    const ctx = makeCtx();
    const result = await GET(ctx as never);

    expect(result).toMatchObject({ body: { items: mockItems }, status: 200 });
  });

  it("calls getComplianceReviewItems with verifiedWorkspaceId only", async () => {
    vi.mocked(getComplianceReviewItems).mockResolvedValueOnce([]);
    const ctx = makeCtx(undefined, WS);
    await GET(ctx as never);
    expect(getComplianceReviewItems).toHaveBeenCalledWith(WS);
  });

  it("workspace isolation: different workspaceIds produce isolated calls", async () => {
    const WS2 = "c2d3e4f5-a6b7-4c8d-9e0f-a1b2c3d4e5f6";
    vi.mocked(getComplianceReviewItems).mockResolvedValue([]);

    await GET(makeCtx(undefined, WS) as never);
    await GET(makeCtx(undefined, WS2) as never);

    const calls = vi.mocked(getComplianceReviewItems).mock.calls;
    expect(calls[0][0]).toBe(WS);
    expect(calls[1][0]).toBe(WS2);
  });

  it("returns empty items when no review items exist", async () => {
    vi.mocked(getComplianceReviewItems).mockResolvedValueOnce([]);
    const result = await GET(makeCtx() as never);
    expect(result).toMatchObject({ body: { items: [] }, status: 200 });
  });

  it("returns status 200", async () => {
    vi.mocked(getComplianceReviewItems).mockResolvedValueOnce([]);
    const result = await GET(makeCtx() as never);
    expect(result.status).toBe(200);
  });

  it("returns multiple items with full ComplianceReviewItem shape", async () => {
    const mockItems = [
      {
        id: "id-1",
        kind: "insurance",
        name: "Public liability",
        reference: null,
        expiresAt: "2024-06-01T00:00:00.000Z",
        status: "active",
        jurisdiction: null,
        obligationOwner: null,
        penaltyDescription: null,
        state: "expiring_soon",
        createdAt: "2023-06-01T00:00:00.000Z",
      },
      {
        id: "id-2",
        kind: "tax",
        name: "BAS",
        reference: "BAS-2024",
        expiresAt: null,
        status: "active",
        jurisdiction: "AU",
        obligationOwner: "Accountant",
        penaltyDescription: "Penalty units",
        state: "expired",
        createdAt: "2022-01-01T00:00:00.000Z",
      },
    ];
    vi.mocked(getComplianceReviewItems).mockResolvedValueOnce(mockItems as never);
    const result = await GET(makeCtx() as never);
    expect(result.body.items).toHaveLength(2);
    expect(result.body.items[0].state).toBe("expiring_soon");
    expect(result.body.items[1].state).toBe("expired");
  });
});

// ---------------------------------------------------------------------------
// 4. POST handler
// ---------------------------------------------------------------------------
describe("POST /api/owner/compliance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 201 with created id", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      kind: "licence",
      name: "Business licence",
    });
    vi.mocked(recordComplianceItem).mockResolvedValueOnce("created-id");

    const result = await POST(makeCtx() as never);
    expect(result).toMatchObject({ body: { id: "created-id" }, status: 201 });
  });

  it("calls recordComplianceItem with verifiedWorkspaceId", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      kind: "permit",
      name: "Building permit",
    });
    vi.mocked(recordComplianceItem).mockResolvedValueOnce("p-id");

    await POST(makeCtx() as never);

    const call = vi.mocked(recordComplianceItem).mock.calls[0][0];
    expect(call.workspaceId).toBe(WS);
  });

  it("calls recordComplianceItem with verifiedActorId", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      kind: "insurance",
      name: "Public liability",
    });
    vi.mocked(recordComplianceItem).mockResolvedValueOnce("i-id");

    await POST(makeCtx() as never);

    const call = vi.mocked(recordComplianceItem).mock.calls[0][0];
    expect(call.actorId).toBe(ACTOR);
  });

  it("does NOT pass workspace from body (uses ctx only)", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      kind: "tax",
      name: "GST",
      workspaceId: "attacker-ws",
    });
    vi.mocked(recordComplianceItem).mockResolvedValueOnce("t-id");

    await POST(makeCtx() as never);

    const call = vi.mocked(recordComplianceItem).mock.calls[0][0];
    expect(call.workspaceId).toBe(WS);
    expect(call.workspaceId).not.toBe("attacker-ws");
  });

  it("passes optional fields through (jurisdiction, legalBasis, reference)", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      kind: "licence",
      name: "Food licence",
      reference: "FOOD-123",
      jurisdiction: "VIC",
      legalBasis: "Food Act 2023",
    });
    vi.mocked(recordComplianceItem).mockResolvedValueOnce("f-id");

    await POST(makeCtx() as never);

    const call = vi.mocked(recordComplianceItem).mock.calls[0][0];
    expect(call.reference).toBe("FOOD-123");
    expect(call.jurisdiction).toBe("VIC");
    expect(call.legalBasis).toBe("Food Act 2023");
  });

  it("converts expiresAt ISO string to Date", async () => {
    const iso = "2025-12-31T00:00:00.000Z";
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      kind: "document",
      name: "Certificate",
      expiresAt: iso,
    });
    vi.mocked(recordComplianceItem).mockResolvedValueOnce("d-id");

    await POST(makeCtx() as never);

    const call = vi.mocked(recordComplianceItem).mock.calls[0][0];
    expect(call.expiresAt).toBeInstanceOf(Date);
    expect(call.expiresAt?.toISOString()).toBe(iso);
  });

  it("sets expiresAt to null when not provided", async () => {
    vi.mocked(parseRequestBody).mockResolvedValueOnce({
      kind: "licence",
      name: "No expiry licence",
    });
    vi.mocked(recordComplianceItem).mockResolvedValueOnce("ne-id");

    await POST(makeCtx() as never);

    const call = vi.mocked(recordComplianceItem).mock.calls[0][0];
    expect(call.expiresAt).toBeNull();
  });

  it("workspace isolation: POST uses workspaceId from ctx, not from a different workspace", async () => {
    const WS2 = "d3e4f5a6-b7c8-4d9e-8f0a-b1c2d3e4f5a6";
    vi.mocked(parseRequestBody).mockResolvedValueOnce({ kind: "permit", name: "P" });
    vi.mocked(recordComplianceItem).mockResolvedValueOnce("x");

    await POST(makeCtx(undefined, WS2) as never);

    const call = vi.mocked(recordComplianceItem).mock.calls[0][0];
    expect(call.workspaceId).toBe(WS2);
  });
});

// ---------------------------------------------------------------------------
// 5. withCanonicalEnforcement options wiring
// ---------------------------------------------------------------------------
describe("/api/owner/compliance — options wiring", () => {
  it("POST uses OWNER_MANAGE capability", () => {
    const opts = (POST as { __options?: Record<string, unknown> }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
  });

  it("GET uses OWNER_VIEW capability", () => {
    const opts = (GET as { __options?: Record<string, unknown> }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
  });

  it("POST requires workspace", () => {
    const opts = (POST as { __options?: Record<string, unknown> }).__options;
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("GET requires workspace", () => {
    const opts = (GET as { __options?: Record<string, unknown> }).__options;
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("static: POST capability is owner:manage string", () => {
    const src = fs.readFileSync(
      path.resolve("src/app/api/owner/compliance/route.ts"),
      "utf-8"
    );
    expect(src).toContain("CAPABILITIES.OWNER_MANAGE");
    expect(src).toContain("CAPABILITIES.OWNER_VIEW");
  });
});
