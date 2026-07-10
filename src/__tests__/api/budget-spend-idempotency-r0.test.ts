/**
 * Phase R0 — D3-01: POST /api/owner/budget/spend idempotency guard
 *
 * Verifies that the spend route enforces the idempotency-key header,
 * deduplicates requests via checkIdempotencyKey, and does not create a
 * duplicate SpendEntry on retry.
 */
import { POST } from "@/app/api/owner/budget/spend/route";

// ── mock canonical enforcement (passthrough with deterministic context) ──
const mockVerifiedActorId = "actor-001";
const mockVerifiedWorkspaceId = "workspace-001";

jest.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown) => Promise<unknown>) => {
    return async (request: Request) => {
      const ctx = {
        request,
        verifiedActorId: mockVerifiedActorId,
        verifiedWorkspaceId: mockVerifiedWorkspaceId,
        verifiedCapabilities: ["OWNER_MANAGE"],
      };
      return handler(ctx);
    };
  },
}));

jest.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: jest.fn((body: unknown, opts: { status: number }) => ({
    __canonicalJsonResponse: true,
    body,
    status: opts?.status ?? 200,
  })),
}));

jest.mock("@/lib/validation", () => ({
  parseRequestBody: jest.fn(),
}));

jest.mock("@/domain/owner-budget/validation", () => ({
  budgetSpendCreateSchema: {},
}));

const mockCheckIdempotencyKey = jest.fn();
const mockRecordIdempotencyResponse = jest.fn();
const mockRecordIdempotencyError = jest.fn();

jest.mock("@/services/idempotency", () => ({
  checkIdempotencyKey: (...args: unknown[]) => mockCheckIdempotencyKey(...args),
  recordIdempotencyResponse: (...args: unknown[]) => mockRecordIdempotencyResponse(...args),
  recordIdempotencyError: (...args: unknown[]) => mockRecordIdempotencyError(...args),
}));

const mockRecordSpendEntry = jest.fn();
jest.mock("@/services/owner-budget/budget.service", () => ({
  recordSpendEntry: (...args: unknown[]) => mockRecordSpendEntry(...args),
}));

jest.mock("@/domain/constants/capabilities", () => ({
  CAPABILITIES: { OWNER_MANAGE: "OWNER_MANAGE" },
}));

import { parseRequestBody } from "@/lib/validation";
import { canonicalJson } from "@/lib/canonical-json-response";

const parseRequestBodyMock = parseRequestBody as jest.Mock;
const canonicalJsonMock = canonicalJson as jest.Mock;

function makeRequest(headers: Record<string, string> = {}): Request {
  const h = new Headers(headers);
  return {
    headers: h,
    json: async () => ({}),
  } as unknown as Request;
}

const validBody = {
  businessId: "biz-001",
  amount: 500,
  category: "operations",
  description: "Q2 supplies",
};

const spendResult = { id: "spend-001", ...validBody };

beforeEach(() => {
  jest.clearAllMocks();
  canonicalJsonMock.mockImplementation((body: unknown, opts: { status: number }) => ({
    __canonicalJsonResponse: true,
    body,
    status: opts?.status ?? 200,
  }));
});

describe("POST /api/owner/budget/spend — idempotency guard (D3-01)", () => {
  test("missing idempotency-key header → throws BadRequestError", async () => {
    const req = makeRequest({}); // no idempotency-key
    await expect(POST(req as unknown as never)).rejects.toMatchObject({
      message: expect.stringContaining("idempotency-key"),
    });
    expect(mockCheckIdempotencyKey).not.toHaveBeenCalled();
    expect(mockRecordSpendEntry).not.toHaveBeenCalled();
  });

  test("new request → recordSpendEntry called, idempotency recorded, 201 returned", async () => {
    const req = makeRequest({ "idempotency-key": "key-new-001" });
    parseRequestBodyMock.mockResolvedValue(validBody);
    mockCheckIdempotencyKey.mockResolvedValue({ isNew: true, cachedResponse: null });
    mockRecordSpendEntry.mockResolvedValue(spendResult);
    mockRecordIdempotencyResponse.mockResolvedValue(undefined);

    const result = await POST(req as unknown as never);

    expect(mockCheckIdempotencyKey).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "key-new-001",
        operationName: "recordSpendEntry",
        actorId: mockVerifiedActorId,
        workspaceId: mockVerifiedWorkspaceId,
      })
    );
    expect(mockRecordSpendEntry).toHaveBeenCalledWith(
      validBody.businessId,
      expect.objectContaining({ amount: 500, category: "operations" }),
      mockVerifiedActorId,
      mockVerifiedWorkspaceId
    );
    expect(mockRecordIdempotencyResponse).toHaveBeenCalledWith(
      "key-new-001",
      201,
      spendResult,
      mockVerifiedWorkspaceId
    );
    expect(result).toMatchObject({ __canonicalJsonResponse: true, status: 201 });
  });

  test("idempotent retry with cached response → returns cached body, service NOT called again", async () => {
    const req = makeRequest({ "idempotency-key": "key-replay-001" });
    parseRequestBodyMock.mockResolvedValue(validBody);
    const cachedBody = { id: "spend-001", cached: true };
    mockCheckIdempotencyKey.mockResolvedValue({
      isNew: false,
      cachedResponse: { body: cachedBody, statusCode: 201 },
    });

    const result = await POST(req as unknown as never);

    expect(mockRecordSpendEntry).not.toHaveBeenCalled();
    expect(result).toBe(cachedBody);
  });

  test("idempotency cache miss but service throws → recordIdempotencyError called, error re-thrown", async () => {
    const req = makeRequest({ "idempotency-key": "key-err-001" });
    parseRequestBodyMock.mockResolvedValue(validBody);
    mockCheckIdempotencyKey.mockResolvedValue({ isNew: true, cachedResponse: null });
    const serviceError = new Error("DB write failed");
    mockRecordSpendEntry.mockRejectedValue(serviceError);
    mockRecordIdempotencyError.mockResolvedValue(undefined);

    await expect(POST(req as unknown as never)).rejects.toBe(serviceError);

    expect(mockRecordIdempotencyError).toHaveBeenCalledWith(
      "key-err-001",
      expect.any(Error),
      mockVerifiedWorkspaceId
    );
    expect(mockRecordIdempotencyResponse).not.toHaveBeenCalled();
  });

  test("businessId is extracted from body, not forwarded to recordSpendEntry input", async () => {
    const req = makeRequest({ "idempotency-key": "key-split-001" });
    parseRequestBodyMock.mockResolvedValue(validBody);
    mockCheckIdempotencyKey.mockResolvedValue({ isNew: true, cachedResponse: null });
    mockRecordSpendEntry.mockResolvedValue(spendResult);
    mockRecordIdempotencyResponse.mockResolvedValue(undefined);

    await POST(req as unknown as never);

    const [calledBusinessId, calledInput] = mockRecordSpendEntry.mock.calls[0];
    expect(calledBusinessId).toBe("biz-001");
    expect(calledInput).not.toHaveProperty("businessId");
  });

  test("full body passed to checkIdempotencyKey payload for dedup fingerprinting", async () => {
    const req = makeRequest({ "idempotency-key": "key-payload-001" });
    parseRequestBodyMock.mockResolvedValue(validBody);
    mockCheckIdempotencyKey.mockResolvedValue({ isNew: true, cachedResponse: null });
    mockRecordSpendEntry.mockResolvedValue(spendResult);
    mockRecordIdempotencyResponse.mockResolvedValue(undefined);

    await POST(req as unknown as never);

    expect(mockCheckIdempotencyKey).toHaveBeenCalledWith(
      expect.objectContaining({ payload: validBody })
    );
  });
});
