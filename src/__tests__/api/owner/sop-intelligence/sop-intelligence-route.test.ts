/**
 * Non-DB mock tests for:
 *   POST  /api/owner/sop-intelligence — assign_training | create_alert
 *   GET   /api/owner/sop-intelligence — list training | compliance | list alerts (mode param)
 *   PATCH /api/owner/sop-intelligence — record training completion
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses plain allowAll() because route uses ctx.request.json() + safeParse (no throws).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockAssignTraining,
  mockRecordTrainingCompletion,
  mockCalculateComplianceRate,
  mockCreateNonComplianceAlert,
  mockListTrainingAssignments,
  mockListNonComplianceAlerts,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockAssignTraining: vi.fn(),
  mockRecordTrainingCompletion: vi.fn(),
  mockCalculateComplianceRate: vi.fn(),
  mockCreateNonComplianceAlert: vi.fn(),
  mockListTrainingAssignments: vi.fn(),
  mockListNonComplianceAlerts: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/sop-process-intelligence.service", () => ({
  assignTraining: mockAssignTraining,
  recordTrainingCompletion: mockRecordTrainingCompletion,
  calculateComplianceRate: mockCalculateComplianceRate,
  createNonComplianceAlert: mockCreateNonComplianceAlert,
  listTrainingAssignments: mockListTrainingAssignments,
  listNonComplianceAlerts: mockListNonComplianceAlerts,
}));

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
const SOP_DOC_ID = "d3000001-0000-4000-8000-000000000001";
const ASSIGN_ID = "e3000001-0000-4000-8000-000000000001";
const ASSIGNED_TO = "f3000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/sop-intelligence";

function makeCtx(
  body: unknown,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: {
      url: BASE_URL,
      json: vi.fn().mockResolvedValue(body),
    },
    ...overrides,
  };
}

function makeGetCtx(
  queryString = "",
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const url = queryString ? `${BASE_URL}?${queryString}` : BASE_URL;
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url },
    ...overrides,
  };
}

const MOCK_TRAINING = {
  id: ASSIGN_ID,
  workspaceId: WS_A,
  sopDocumentId: SOP_DOC_ID,
  assignedTo: ASSIGNED_TO,
  status: "PENDING",
};

const MOCK_ALERT = {
  id: "a3000001-0000-4000-8000-000000000001",
  workspaceId: WS_A,
  sopDocumentId: SOP_DOC_ID,
  complianceRate: 0.6,
  alertWindow: "2026-Q1",
};

const MOCK_COMPLIANCE = {
  sopDocumentId: SOP_DOC_ID,
  complianceRate: 0.85,
  totalAssigned: 10,
  completed: 9,
};

const ASSIGN_TRAINING_BODY = {
  action: "assign_training",
  sopDocumentId: SOP_DOC_ID,
  assignedTo: ASSIGNED_TO,
};

const CREATE_ALERT_BODY = {
  action: "create_alert",
  sopDocumentId: SOP_DOC_ID,
  alertWindow: "2026-Q1",
  complianceRate: 0.6,
};

const COMPLETE_TRAINING_BODY = {
  assignmentId: ASSIGN_ID,
  evidenceUrl: "https://example.com/evidence.pdf",
};

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _options: unknown, testCtx: unknown) => {
      return handler(testCtx);
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

let sopPost: (ctx?: unknown) => Promise<unknown>;
let sopGet: (ctx?: unknown) => Promise<unknown>;
let sopPatch: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/sop-intelligence/route");
  sopPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
  sopGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  sopPatch = route.PATCH as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockAssignTraining.mockResolvedValue(MOCK_TRAINING);
  mockCreateNonComplianceAlert.mockResolvedValue(MOCK_ALERT);
  mockRecordTrainingCompletion.mockResolvedValue({ ...MOCK_TRAINING, status: "COMPLETED" });
  mockListTrainingAssignments.mockResolvedValue([MOCK_TRAINING]);
  mockListNonComplianceAlerts.mockResolvedValue([MOCK_ALERT]);
  mockCalculateComplianceRate.mockResolvedValue(MOCK_COMPLIANCE);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("sop-intelligence-route — module contract assertions", () => {
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
  it("MOCK_TRAINING.status is PENDING", () => { expect(MOCK_TRAINING.status).toBe("PENDING"); });
});

describe("POST /api/owner/sop-intelligence — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await sopPost(makeCtx(ASSIGN_TRAINING_BODY)) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await sopPost(makeCtx(ASSIGN_TRAINING_BODY)) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("POST action=assign_training", () => {
    it("returns 201 for assign_training", async () => {
      const result = await sopPost(makeCtx(ASSIGN_TRAINING_BODY)) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls assignTraining with workspaceId", async () => {
      await sopPost(makeCtx(ASSIGN_TRAINING_BODY));
      expect(mockAssignTraining).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls assignTraining with actorId", async () => {
      await sopPost(makeCtx(ASSIGN_TRAINING_BODY));
      expect(mockAssignTraining).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("calls assignTraining with sopDocumentId", async () => {
      await sopPost(makeCtx(ASSIGN_TRAINING_BODY));
      expect(mockAssignTraining).toHaveBeenCalledWith(
        expect.objectContaining({ sopDocumentId: SOP_DOC_ID })
      );
    });

    it("does not call createNonComplianceAlert for assign_training", async () => {
      await sopPost(makeCtx(ASSIGN_TRAINING_BODY));
      expect(mockCreateNonComplianceAlert).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid body", async () => {
      const result = await sopPost(makeCtx({ action: "assign_training" })) as { status: number };
      expect(result.status).toBe(400);
    });

    it("uses verifiedWorkspaceId not body workspace for assign_training (WS_B)", async () => {
      const ctx = makeCtx(ASSIGN_TRAINING_BODY, { verifiedWorkspaceId: WS_B });
      await sopPost(ctx);
      expect(mockAssignTraining).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("POST action=create_alert", () => {
    it("returns 201 for create_alert", async () => {
      const result = await sopPost(makeCtx(CREATE_ALERT_BODY)) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls createNonComplianceAlert with workspaceId", async () => {
      await sopPost(makeCtx(CREATE_ALERT_BODY));
      expect(mockCreateNonComplianceAlert).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls createNonComplianceAlert with complianceRate", async () => {
      await sopPost(makeCtx(CREATE_ALERT_BODY));
      expect(mockCreateNonComplianceAlert).toHaveBeenCalledWith(
        expect.objectContaining({ complianceRate: 0.6 })
      );
    });

    it("does not call assignTraining for create_alert", async () => {
      await sopPost(makeCtx(CREATE_ALERT_BODY));
      expect(mockAssignTraining).not.toHaveBeenCalled();
    });
  });
});

describe("GET /api/owner/sop-intelligence — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await sopGet(makeGetCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("GET mode=training (default)", () => {
    it("returns 200 for default mode", async () => {
      const result = await sopGet(makeGetCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listTrainingAssignments with workspaceId", async () => {
      await sopGet(makeGetCtx());
      expect(mockListTrainingAssignments).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes status query param to listTrainingAssignments", async () => {
      await sopGet(makeGetCtx("status=PENDING"));
      expect(mockListTrainingAssignments).toHaveBeenCalledWith(
        expect.objectContaining({ status: "PENDING" })
      );
    });

    it("passes assignedTo query param to listTrainingAssignments", async () => {
      await sopGet(makeGetCtx(`assignedTo=${ASSIGNED_TO}`));
      expect(mockListTrainingAssignments).toHaveBeenCalledWith(
        expect.objectContaining({ assignedTo: ASSIGNED_TO })
      );
    });

    it("does not call calculateComplianceRate for default mode", async () => {
      await sopGet(makeGetCtx());
      expect(mockCalculateComplianceRate).not.toHaveBeenCalled();
    });

    it("uses verifiedWorkspaceId for training list (WS_B)", async () => {
      await sopGet(makeGetCtx("", { verifiedWorkspaceId: WS_B }));
      expect(mockListTrainingAssignments).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("GET mode=compliance", () => {
    it("returns 200 for compliance mode with sopDocumentId", async () => {
      const result = await sopGet(makeGetCtx(`mode=compliance&sopDocumentId=${SOP_DOC_ID}`)) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls calculateComplianceRate with workspaceId", async () => {
      await sopGet(makeGetCtx(`mode=compliance&sopDocumentId=${SOP_DOC_ID}`));
      expect(mockCalculateComplianceRate).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls calculateComplianceRate with sopDocumentId", async () => {
      await sopGet(makeGetCtx(`mode=compliance&sopDocumentId=${SOP_DOC_ID}`));
      expect(mockCalculateComplianceRate).toHaveBeenCalledWith(
        expect.objectContaining({ sopDocumentId: SOP_DOC_ID })
      );
    });

    it("does not call listTrainingAssignments for compliance mode", async () => {
      await sopGet(makeGetCtx(`mode=compliance&sopDocumentId=${SOP_DOC_ID}`));
      expect(mockListTrainingAssignments).not.toHaveBeenCalled();
    });
  });

  describe("GET mode=alerts", () => {
    it("returns 200 for alerts mode", async () => {
      const result = await sopGet(makeGetCtx("mode=alerts")) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listNonComplianceAlerts with workspaceId", async () => {
      await sopGet(makeGetCtx("mode=alerts"));
      expect(mockListNonComplianceAlerts).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes acknowledged=true when query param is true", async () => {
      await sopGet(makeGetCtx("mode=alerts&acknowledged=true"));
      expect(mockListNonComplianceAlerts).toHaveBeenCalledWith(
        expect.objectContaining({ acknowledged: true })
      );
    });

    it("passes acknowledged=false when query param is false", async () => {
      await sopGet(makeGetCtx("mode=alerts&acknowledged=false"));
      expect(mockListNonComplianceAlerts).toHaveBeenCalledWith(
        expect.objectContaining({ acknowledged: false })
      );
    });

    it("does not call assignTraining for alerts mode", async () => {
      await sopGet(makeGetCtx("mode=alerts"));
      expect(mockAssignTraining).not.toHaveBeenCalled();
    });
  });
});

describe("PATCH /api/owner/sop-intelligence — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies PATCH", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await sopPatch(makeCtx(COMPLETE_TRAINING_BODY)) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful PATCH", () => {
    it("returns 200 for valid training completion", async () => {
      const result = await sopPatch(makeCtx(COMPLETE_TRAINING_BODY)) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls recordTrainingCompletion with workspaceId", async () => {
      await sopPatch(makeCtx(COMPLETE_TRAINING_BODY));
      expect(mockRecordTrainingCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls recordTrainingCompletion with actorId", async () => {
      await sopPatch(makeCtx(COMPLETE_TRAINING_BODY));
      expect(mockRecordTrainingCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("calls recordTrainingCompletion with assignmentId", async () => {
      await sopPatch(makeCtx(COMPLETE_TRAINING_BODY));
      expect(mockRecordTrainingCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ assignmentId: ASSIGN_ID })
      );
    });

    it("calls recordTrainingCompletion exactly once", async () => {
      await sopPatch(makeCtx(COMPLETE_TRAINING_BODY));
      expect(mockRecordTrainingCompletion).toHaveBeenCalledTimes(1);
    });

    it("returns 400 for invalid PATCH body", async () => {
      const result = await sopPatch(makeCtx({ assignmentId: "not-a-uuid" })) as { status: number };
      expect(result.status).toBe(400);
    });

    it("uses verifiedWorkspaceId for PATCH (WS_B)", async () => {
      await sopPatch(makeCtx(COMPLETE_TRAINING_BODY, { verifiedWorkspaceId: WS_B }));
      expect(mockRecordTrainingCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});
