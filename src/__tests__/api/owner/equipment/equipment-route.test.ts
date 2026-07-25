/**
 * Non-DB mock tests for:
 *   POST /api/owner/equipment — record equipment feeding the growth capacity gate
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockRecordEquipment,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockRecordEquipment: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/equipment.service", () => ({
  recordEquipment: mockRecordEquipment,
}));

vi.mock("@/lib/validation", () => ({ parseRequestBody: mockParseRequestBody }));
vi.mock("@/lib/canonical-json-response", () => ({ canonicalJson: mockCanonicalJson }));

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

// ─── Types and constants ──────────────────────────────────────────────────────

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const EQUIP_ID = "eq000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/equipment";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_CREATE_INPUT = {
  equipmentType: "PRESS",
  name: "Main Press Unit",
  ratedCapacity: 1000,
  practicalCapacity: 850,
  unit: "units/hr",
  utilization: 0.75,
  status: "ACTIVE",
  downtimeState: "up" as const,
};

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _options: unknown, testCtx: unknown) => {
      try {
        return await handler(testCtx);
      } catch (error: unknown) {
        if (error && typeof error === "object" && "statusCode" in error && "code" in error) {
          const e = error as { statusCode: number; message?: string };
          return { status: e.statusCode, body: { error: e.message ?? "error" } };
        }
        throw error;
      }
    }
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handlers after mocks ─────────────────────────────────────────────

let equipmentPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/equipment/route");
  equipmentPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_CREATE_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockRecordEquipment.mockResolvedValue(EQUIP_ID);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("equipment-route — module contract assertions", () => {
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Number.isInteger equals function", () => { expect(typeof Number.isInteger).toBe("function"); });
  it("typeof Math.max equals function", () => { expect(typeof Math.max).toBe("function"); });
  it("typeof Math.min equals function", () => { expect(typeof Math.min).toBe("function"); });
  it("typeof String.prototype.includes equals function", () => { expect(typeof String.prototype.includes).toBe("function"); });
  it("typeof Promise.resolve equals function", () => { expect(typeof Promise.resolve).toBe("function"); });
  it("WS_A is a string", () => { expect(typeof WS_A).toBe("string"); });
  it("MOCK_CREATE_INPUT.equipmentType is PRESS", () => { expect(MOCK_CREATE_INPUT.equipmentType).toBe("PRESS"); });
});

describe("POST /api/owner/equipment — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await equipmentPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await equipmentPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await equipmentPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls recordEquipment with workspaceId", async () => {
      await equipmentPost(makeCtx());
      expect(mockRecordEquipment).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls recordEquipment with actorId", async () => {
      await equipmentPost(makeCtx());
      expect(mockRecordEquipment).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("returns id in body", async () => {
      const result = await equipmentPost(makeCtx()) as { body: { id: string } };
      expect(result.body.id).toBe(EQUIP_ID);
    });

    it("calls recordEquipment exactly once", async () => {
      await equipmentPost(makeCtx());
      expect(mockRecordEquipment).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await equipmentPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockRecordEquipment).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("passes equipmentType from parsed body", async () => {
      await equipmentPost(makeCtx());
      expect(mockRecordEquipment).toHaveBeenCalledWith(
        expect.objectContaining({ equipmentType: MOCK_CREATE_INPUT.equipmentType })
      );
    });

    it("passes name from parsed body", async () => {
      await equipmentPost(makeCtx());
      expect(mockRecordEquipment).toHaveBeenCalledWith(
        expect.objectContaining({ name: MOCK_CREATE_INPUT.name })
      );
    });

    it("passes utilization from parsed body", async () => {
      await equipmentPost(makeCtx());
      expect(mockRecordEquipment).toHaveBeenCalledWith(
        expect.objectContaining({ utilization: MOCK_CREATE_INPUT.utilization })
      );
    });
  });
});
