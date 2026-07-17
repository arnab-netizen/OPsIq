/**
 * Owner write-route contract tests (non-DB).
 *
 * Routes covered:
 *   POST  /api/owner/do-not-repeat          — recordDoNotRepeat (OWNER_MANAGE)
 *   POST  /api/owner/self-evaluation        — recordSelfEvaluation (OWNER_MANAGE)
 *   POST  /api/owner/standing-instructions  — recordStandingInstruction (OWNER_MANAGE)
 *   POST  /api/owner/staff-training         — recordObservedTrainingNeed (OWNER_MANAGE)
 *   POST  /api/owner/sop-documents          — createSopDraft (OWNER_MANAGE)
 *   PATCH /api/owner/sop-documents          — approve/revise/retire (OWNER_MANAGE)
 *   POST  /api/owner/processes              — registerProcess (OWNER_MANAGE)
 *   PATCH /api/owner/processes              — triggerProcessReviewIfDue (OWNER_MANAGE)
 *
 * All routes require OWNER_MANAGE + requireWorkspace.
 * DB-backed services are mocked; tests run without PostgreSQL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { CanonicalJsonResponse } from "@/lib/canonical-json-response";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  recordDoNotRepeat: vi.fn(),
  recordSelfEvaluation: vi.fn(),
  recordStandingInstruction: vi.fn(),
  recordObservedTrainingNeed: vi.fn(),
  createSopDraft: vi.fn(),
  approveSopDocument: vi.fn(),
  reviseSopDocument: vi.fn(),
  retireSopDocument: vi.fn(),
  registerProcess: vi.fn(),
  triggerProcessReviewIfDue: vi.fn(),
}));

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => unknown,
    options?: Record<string, unknown>
  ) => {
    const wrapped = (ctx: unknown) => handler(ctx);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

vi.mock("@/services/owner-mode/do-not-repeat.service", () => ({
  recordDoNotRepeat: mocks.recordDoNotRepeat,
}));

vi.mock("@/services/owner-mode/self-evaluation.service", () => ({
  recordSelfEvaluation: mocks.recordSelfEvaluation,
}));

vi.mock("@/services/owner-mode/owner-load.service", () => ({
  recordStandingInstruction: mocks.recordStandingInstruction,
}));

vi.mock("@/services/owner-mode/staff-training.service", () => ({
  recordObservedTrainingNeed: mocks.recordObservedTrainingNeed,
}));

vi.mock("@/services/owner-mode/sop-document.service", () => ({
  createSopDraft: mocks.createSopDraft,
  approveSopDocument: mocks.approveSopDocument,
  reviseSopDocument: mocks.reviseSopDocument,
  retireSopDocument: mocks.retireSopDocument,
}));

vi.mock("@/services/owner-mode/process-review.service", () => ({
  registerProcess: mocks.registerProcess,
  triggerProcessReviewIfDue: mocks.triggerProcessReviewIfDue,
}));

// ─── Route imports (after mocks) ─────────────────────────────────────────────

import { POST as doNotRepeatPost } from "@/app/api/owner/do-not-repeat/route";
import { POST as selfEvalPost } from "@/app/api/owner/self-evaluation/route";
import { POST as standingPost } from "@/app/api/owner/standing-instructions/route";
import { POST as staffTrainingPost } from "@/app/api/owner/staff-training/route";
import {
  POST as sopPost,
  PATCH as sopPatch,
} from "@/app/api/owner/sop-documents/route";
import {
  POST as processesPost,
  PATCH as processesPatch,
} from "@/app/api/owner/processes/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WS = "ws-write-test";

function makeCtx(body: unknown, workspaceId = WS, actorId = "actor-write-1") {
  return {
    verifiedActorId: actorId,
    verifiedWorkspaceId: workspaceId,
    request: {
      url: `https://x/api/owner/write`,
      json: async () => body,
    },
  } as const;
}

function getBody(res: unknown): Record<string, unknown> {
  return (res as CanonicalJsonResponse).body as Record<string, unknown>;
}

function getStatus(res: unknown): number {
  return (res as CanonicalJsonResponse).status as number;
}

function srcContains(relPath: string, symbol: string) {
  const src = fs.readFileSync(
    path.resolve(__dirname, `../../../app/api/owner/${relPath}`),
    "utf8"
  );
  return src.includes(symbol);
}

beforeEach(() => vi.clearAllMocks());

// ─── Shared OWNER_MANAGE check ────────────────────────────────────────────────

function expectOwnerManage(handler: unknown) {
  const opts = (handler as { __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean } }).__options;
  expect(opts?.requireCapabilities).toContain("owner:manage");
  expect(opts?.requireWorkspace).toBe(true);
}

// ─── do-not-repeat ────────────────────────────────────────────────────────────

const VALID_DNR = {
  businessId: "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5",
  memoryKey: "vendor-price-increase",
  summary: "Do not approve vendor price increases above 10%",
  reason: "Margin impact unacceptable",
};

describe("POST /api/owner/do-not-repeat", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectOwnerManage(doNotRepeatPost));

  it("returns { id } in canonicalJson status 201", async () => {
    mocks.recordDoNotRepeat.mockResolvedValue("dnr-001");
    const res = await doNotRepeatPost(makeCtx(VALID_DNR));
    expect(getStatus(res)).toBe(201);
    expect(getBody(res)).toEqual({ id: "dnr-001" });
  });

  it("passes workspaceId from ctx to service", async () => {
    mocks.recordDoNotRepeat.mockResolvedValue("dnr-x");
    await doNotRepeatPost(makeCtx(VALID_DNR, "ws-SPECIFIC"));
    expect(mocks.recordDoNotRepeat.mock.calls[0][0].workspaceId).toBe("ws-SPECIFIC");
  });

  it("passes businessId and memoryKey to service", async () => {
    mocks.recordDoNotRepeat.mockResolvedValue("dnr-y");
    await doNotRepeatPost(makeCtx(VALID_DNR));
    const arg = mocks.recordDoNotRepeat.mock.calls[0][0];
    expect(arg.businessId).toBe(VALID_DNR.businessId);
    expect(arg.memoryKey).toBe(VALID_DNR.memoryKey);
  });

  it("rejects missing memoryKey", async () => {
    const { memoryKey: _, ...body } = VALID_DNR;
    await expect(doNotRepeatPost(makeCtx(body))).rejects.toThrow();
  });

  it("rejects non-UUID businessId", async () => {
    await expect(doNotRepeatPost(makeCtx({ ...VALID_DNR, businessId: "not-a-uuid" }))).rejects.toThrow();
  });

  it("rejects unknown fields", async () => {
    await expect(doNotRepeatPost(makeCtx({ ...VALID_DNR, extraField: "x" }))).rejects.toThrow();
  });

  it("uses withCanonicalEnforcement and calls recordDoNotRepeat", () => {
    expect(srcContains("do-not-repeat/route.ts", "withCanonicalEnforcement")).toBe(true);
    expect(srcContains("do-not-repeat/route.ts", "recordDoNotRepeat")).toBe(true);
  });
});

// ─── self-evaluation ──────────────────────────────────────────────────────────

const VALID_SELF_EVAL = {
  expectedOutcome: "Revenue up 10%",
  signals: {
    executed: true,
    metExpectation: false,
  },
};

describe("POST /api/owner/self-evaluation", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectOwnerManage(selfEvalPost));

  it("returns service result in canonicalJson status 201", async () => {
    const result = { id: "eval-1", outcome: "failed" };
    mocks.recordSelfEvaluation.mockResolvedValue(result);
    const res = await selfEvalPost(makeCtx(VALID_SELF_EVAL));
    expect(getStatus(res)).toBe(201);
    expect(getBody(res)).toEqual(result);
  });

  it("passes workspaceId and actorId from ctx to service", async () => {
    mocks.recordSelfEvaluation.mockResolvedValue({});
    await selfEvalPost(makeCtx(VALID_SELF_EVAL, "ws-SELF", "actor-999"));
    const arg = mocks.recordSelfEvaluation.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-SELF");
    expect(arg.actorId).toBe("actor-999");
  });

  it("rejects missing expectedOutcome", async () => {
    const { expectedOutcome: _, ...body } = VALID_SELF_EVAL;
    await expect(selfEvalPost(makeCtx(body))).rejects.toThrow();
  });

  it("rejects missing signals", async () => {
    const { signals: _, ...body } = VALID_SELF_EVAL;
    await expect(selfEvalPost(makeCtx(body))).rejects.toThrow();
  });

  it("rejects unknown fields", async () => {
    await expect(selfEvalPost(makeCtx({ ...VALID_SELF_EVAL, extra: "x" }))).rejects.toThrow();
  });
});

// ─── standing-instructions ────────────────────────────────────────────────────

const VALID_STANDING = {
  scope: "vendor-payments",
  riskClass: "financial",
  allowedActionTypes: ["approve-invoice"],
  forbiddenActionTypes: ["emergency-spend"],
};

describe("POST /api/owner/standing-instructions", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectOwnerManage(standingPost));

  it("returns { ok: true } in canonicalJson status 201", async () => {
    mocks.recordStandingInstruction.mockResolvedValue(undefined);
    const res = await standingPost(makeCtx(VALID_STANDING));
    expect(getStatus(res)).toBe(201);
    expect(getBody(res)).toEqual({ ok: true });
  });

  it("passes workspaceId and actorId from ctx to service", async () => {
    mocks.recordStandingInstruction.mockResolvedValue(undefined);
    await standingPost(makeCtx(VALID_STANDING, "ws-STAND", "actor-stand"));
    const arg = mocks.recordStandingInstruction.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-STAND");
    expect(arg.actorId).toBe("actor-stand");
  });

  it("passes actorIsOwner: true to service", async () => {
    mocks.recordStandingInstruction.mockResolvedValue(undefined);
    await standingPost(makeCtx(VALID_STANDING));
    expect(mocks.recordStandingInstruction.mock.calls[0][0].actorIsOwner).toBe(true);
  });

  it("rejects missing scope", async () => {
    const { scope: _, ...body } = VALID_STANDING;
    await expect(standingPost(makeCtx(body))).rejects.toThrow();
  });

  it("rejects missing riskClass", async () => {
    const { riskClass: _, ...body } = VALID_STANDING;
    await expect(standingPost(makeCtx(body))).rejects.toThrow();
  });
});

// ─── staff-training ───────────────────────────────────────────────────────────

const VALID_TRAINING = {
  staffRef: "staff-alice",
  processAffected: "invoice-processing",
  metric: "error_rate",
  expectedImprovement: "Reduce errors by 50%",
  evidence: [{ code: "repeated_error" as const, occurrences: 5 }],
};

describe("POST /api/owner/staff-training", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectOwnerManage(staffTrainingPost));

  it("returns { id } in canonicalJson status 201", async () => {
    mocks.recordObservedTrainingNeed.mockResolvedValue("train-1");
    const res = await staffTrainingPost(makeCtx(VALID_TRAINING));
    expect(getStatus(res)).toBe(201);
    expect(getBody(res)).toEqual({ id: "train-1" });
  });

  it("passes workspaceId and actorId from ctx to service", async () => {
    mocks.recordObservedTrainingNeed.mockResolvedValue("train-2");
    await staffTrainingPost(makeCtx(VALID_TRAINING, "ws-TRAIN", "actor-train"));
    expect(mocks.recordObservedTrainingNeed.mock.calls[0][0].workspaceId).toBe("ws-TRAIN");
    expect(mocks.recordObservedTrainingNeed.mock.calls[0][0].actorId).toBe("actor-train");
  });

  it("rejects missing staffRef", async () => {
    const { staffRef: _, ...body } = VALID_TRAINING;
    await expect(staffTrainingPost(makeCtx(body))).rejects.toThrow();
  });

  it("rejects invalid evidence code", async () => {
    await expect(
      staffTrainingPost(makeCtx({ ...VALID_TRAINING, evidence: [{ code: "invalid_code", occurrences: 1 }] }))
    ).rejects.toThrow();
  });

  it("rejects unknown fields", async () => {
    await expect(staffTrainingPost(makeCtx({ ...VALID_TRAINING, extra: "x" }))).rejects.toThrow();
  });
});

// ─── sop-documents POST ───────────────────────────────────────────────────────

const VALID_SOP_CREATE = {
  process: "invoice-approval",
  title: "Invoice Approval SOP",
  steps: ["Step 1: Receive invoice", "Step 2: Verify details"],
};

describe("POST /api/owner/sop-documents", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectOwnerManage(sopPost));

  it("returns { id } in canonicalJson status 201", async () => {
    mocks.createSopDraft.mockResolvedValue("sop-draft-1");
    const res = await sopPost(makeCtx(VALID_SOP_CREATE));
    expect(getStatus(res)).toBe(201);
    expect(getBody(res)).toEqual({ id: "sop-draft-1" });
  });

  it("passes workspaceId and actorId from ctx to service", async () => {
    mocks.createSopDraft.mockResolvedValue("sop-x");
    await sopPost(makeCtx(VALID_SOP_CREATE, "ws-SOP", "actor-sop"));
    const arg = mocks.createSopDraft.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-SOP");
    expect(arg.actorId).toBe("actor-sop");
  });

  it("rejects missing process", async () => {
    const { process: _, ...body } = VALID_SOP_CREATE;
    await expect(sopPost(makeCtx(body))).rejects.toThrow();
  });

  it("rejects missing title", async () => {
    const { title: _, ...body } = VALID_SOP_CREATE;
    await expect(sopPost(makeCtx(body))).rejects.toThrow();
  });
});

// ─── sop-documents PATCH ─────────────────────────────────────────────────────

const SOP_ID = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";

describe("PATCH /api/owner/sop-documents — approve", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectOwnerManage(sopPatch));

  it("calls approveSopDocument and returns { ok: true } status 200", async () => {
    mocks.approveSopDocument.mockResolvedValue(undefined);
    const res = await sopPatch(makeCtx({ id: SOP_ID, action: "approve" }));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toEqual({ ok: true });
    expect(mocks.approveSopDocument).toHaveBeenCalledWith(SOP_ID, expect.objectContaining({ workspaceId: WS }));
  });

  it("passes actorIsOwner: true to approveSopDocument", async () => {
    mocks.approveSopDocument.mockResolvedValue(undefined);
    await sopPatch(makeCtx({ id: SOP_ID, action: "approve" }));
    expect(mocks.approveSopDocument.mock.calls[0][1].actorIsOwner).toBe(true);
  });
});

describe("PATCH /api/owner/sop-documents — retire", () => {
  it("calls retireSopDocument and returns { ok: true } status 200", async () => {
    mocks.retireSopDocument.mockResolvedValue(undefined);
    const res = await sopPatch(makeCtx({ id: SOP_ID, action: "retire" }));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toEqual({ ok: true });
    expect(mocks.retireSopDocument).toHaveBeenCalledWith(SOP_ID, expect.objectContaining({ workspaceId: WS }));
  });
});

describe("PATCH /api/owner/sop-documents — revise", () => {
  it("calls reviseSopDocument and returns { revisedDraftId } status 200", async () => {
    mocks.reviseSopDocument.mockResolvedValue("sop-revised-1");
    const res = await sopPatch(makeCtx({ id: SOP_ID, action: "revise", steps: ["New step 1"] }));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toEqual({ revisedDraftId: "sop-revised-1" });
  });
});

describe("PATCH /api/owner/sop-documents — validation", () => {
  it("rejects missing id", async () => {
    await expect(sopPatch(makeCtx({ action: "approve" }))).rejects.toThrow();
  });

  it("rejects invalid action", async () => {
    await expect(sopPatch(makeCtx({ id: SOP_ID, action: "delete" }))).rejects.toThrow();
  });

  it("rejects unknown fields", async () => {
    await expect(sopPatch(makeCtx({ id: SOP_ID, action: "approve", extra: "x" }))).rejects.toThrow();
  });
});

// ─── processes POST ───────────────────────────────────────────────────────────

const VALID_PROCESS = {
  name: "invoice-approval",
  processType: "finance",
  ownerRole: "finance-manager",
  metric: "approval_time_hours",
};

describe("POST /api/owner/processes", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectOwnerManage(processesPost));

  it("returns { id } in canonicalJson status 201", async () => {
    mocks.registerProcess.mockResolvedValue("proc-1");
    const res = await processesPost(makeCtx(VALID_PROCESS));
    expect(getStatus(res)).toBe(201);
    expect(getBody(res)).toEqual({ id: "proc-1" });
  });

  it("passes workspaceId and actorId from ctx to service", async () => {
    mocks.registerProcess.mockResolvedValue("proc-2");
    await processesPost(makeCtx(VALID_PROCESS, "ws-PROC", "actor-proc"));
    const arg = mocks.registerProcess.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-PROC");
    expect(arg.actorId).toBe("actor-proc");
  });

  it("rejects missing name", async () => {
    const { name: _, ...body } = VALID_PROCESS;
    await expect(processesPost(makeCtx(body))).rejects.toThrow();
  });

  it("rejects missing ownerRole", async () => {
    const { ownerRole: _, ...body } = VALID_PROCESS;
    await expect(processesPost(makeCtx(body))).rejects.toThrow();
  });

  it("rejects missing metric", async () => {
    const { metric: _, ...body } = VALID_PROCESS;
    await expect(processesPost(makeCtx(body))).rejects.toThrow();
  });
});

// ─── processes PATCH ──────────────────────────────────────────────────────────

const PROC_ID = "c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7";

describe("PATCH /api/owner/processes", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectOwnerManage(processesPatch));

  it("returns service result in canonicalJson status 200", async () => {
    const decision = { reviewDue: true, reason: "repeated_failure" };
    mocks.triggerProcessReviewIfDue.mockResolvedValue(decision);
    const res = await processesPatch(makeCtx({ id: PROC_ID, signals: { repeatedFailure: true } }));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toEqual(decision);
  });

  it("passes workspaceId and actorId from ctx to service", async () => {
    mocks.triggerProcessReviewIfDue.mockResolvedValue({});
    await processesPatch(makeCtx({ id: PROC_ID, signals: {} }, "ws-PATCH", "actor-patch"));
    const args = mocks.triggerProcessReviewIfDue.mock.calls[0];
    expect(args[1].workspaceId).toBe("ws-PATCH");
    expect(args[1].actorId).toBe("actor-patch");
  });

  it("rejects missing id", async () => {
    await expect(processesPatch(makeCtx({ signals: {} }))).rejects.toThrow();
  });

  it("rejects non-UUID id", async () => {
    await expect(processesPatch(makeCtx({ id: "not-a-uuid", signals: {} }))).rejects.toThrow();
  });
});
