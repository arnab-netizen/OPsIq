/**
 * POST /api/owner/opportunities/* — Opportunity Finder routes (Module #10).
 *
 * Route-level tests covering static enforcement, schema validation, and
 * handler response shaping with mocked DB services. The underlying services
 * are DB-backed; all DB calls are mocked so tests run without a database.
 *
 * Routes under test:
 *   - POST /api/owner/opportunities/signals
 *   - POST /api/owner/opportunities/decide
 *   - POST /api/owner/opportunities/execution-task
 *   - POST /api/owner/opportunities/validation-outcome
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Canonical enforcement mock ────────────────────────────────────────────────

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

// ── Service mocks ─────────────────────────────────────────────────────────────

vi.mock("@/services/owner-mode/external-opportunity-intake.service", () => ({
  submitExternalOpportunitySignal: vi.fn(),
}));

vi.mock("@/services/owner-mode/opportunity-decision.service", () => ({
  decideOpportunity: vi.fn(),
}));

vi.mock("@/services/owner-mode/opportunity-execution.service", () => ({
  recordExecutionTaskUpdate: vi.fn(),
}));

vi.mock("@/services/owner-mode/validation-outcome.service", () => ({
  recordValidationOutcome: vi.fn(),
}));

import { POST as signalsPost } from "@/app/api/owner/opportunities/signals/route";
import { POST as decidePost } from "@/app/api/owner/opportunities/decide/route";
import { POST as execTaskPost } from "@/app/api/owner/opportunities/execution-task/route";
import { POST as validationPost } from "@/app/api/owner/opportunities/validation-outcome/route";

import { submitExternalOpportunitySignal } from "@/services/owner-mode/external-opportunity-intake.service";
import { decideOpportunity } from "@/services/owner-mode/opportunity-decision.service";
import { recordExecutionTaskUpdate } from "@/services/owner-mode/opportunity-execution.service";
import { recordValidationOutcome } from "@/services/owner-mode/validation-outcome.service";
import type { CanonicalJsonResponse } from "@/lib/canonical-json-response";

// Helper: extract body from a CanonicalJsonResponse (handler is mocked, so no real Response)
function getBody(res: unknown): Record<string, unknown> {
  return (res as CanonicalJsonResponse).body as Record<string, unknown>;
}

const WS = "ws-opp-test";

function makeCtx(body: Record<string, unknown>, workspaceId = WS) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: workspaceId,
    verifiedSessionSnapshot: { role: "owner" },
    request: {
      url: "https://x/api/owner/opportunities",
      json: async () => body,
    },
  } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── 1. Static enforcement — signals route ────────────────────────────────────

describe("[module-10] opportunities/signals route — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../../app/api/owner/opportunities/signals/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_MANAGE capability", () => {
    expect(src).toContain("CAPABILITIES.OWNER_MANAGE");
  });

  it("requires workspace", () => {
    expect(src).toContain("requireWorkspace: true");
  });

  it("uses ctx.verifiedWorkspaceId (never body.workspaceId)", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
    expect(src).not.toContain("body.workspaceId");
  });

  it("calls submitExternalOpportunitySignal service", () => {
    expect(src).toContain("submitExternalOpportunitySignal");
  });

  it("exports POST only", () => {
    expect(src).toContain("export const POST");
    expect(src).not.toContain("export const GET");
  });
});

// ─── 2. Static enforcement — decide route ────────────────────────────────────

describe("[module-10] opportunities/decide route — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../../app/api/owner/opportunities/decide/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_MANAGE capability", () => {
    expect(src).toContain("CAPABILITIES.OWNER_MANAGE");
  });

  it("requires workspace", () => {
    expect(src).toContain("requireWorkspace: true");
  });

  it("calls decideOpportunity service", () => {
    expect(src).toContain("decideOpportunity");
  });
});

// ─── 3. Static enforcement — execution-task route ─────────────────────────────

describe("[module-10] opportunities/execution-task route — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../../app/api/owner/opportunities/execution-task/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_MANAGE capability", () => {
    expect(src).toContain("CAPABILITIES.OWNER_MANAGE");
  });

  it("requires workspace", () => {
    expect(src).toContain("requireWorkspace: true");
  });

  it("calls recordExecutionTaskUpdate service", () => {
    expect(src).toContain("recordExecutionTaskUpdate");
  });
});

// ─── 4. Static enforcement — validation-outcome route ────────────────────────

describe("[module-10] opportunities/validation-outcome route — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../../app/api/owner/opportunities/validation-outcome/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_MANAGE capability", () => {
    expect(src).toContain("CAPABILITIES.OWNER_MANAGE");
  });

  it("requires workspace", () => {
    expect(src).toContain("requireWorkspace: true");
  });

  it("calls recordValidationOutcome service", () => {
    expect(src).toContain("recordValidationOutcome");
  });
});

// ─── 5. Capability declarations ──────────────────────────────────────────────

describe("[module-10] POST handlers — capability declarations", () => {
  it("signals: requireCapabilities includes owner:manage", () => {
    const opts = (signalsPost as unknown as { __options?: { requireCapabilities?: string[] } }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
  });

  it("decide: requireCapabilities includes owner:manage", () => {
    const opts = (decidePost as unknown as { __options?: { requireCapabilities?: string[] } }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
  });

  it("execution-task: requireCapabilities includes owner:manage", () => {
    const opts = (execTaskPost as unknown as { __options?: { requireCapabilities?: string[] } }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
  });

  it("validation-outcome: requireCapabilities includes owner:manage", () => {
    const opts = (validationPost as unknown as { __options?: { requireCapabilities?: string[] } }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
  });

  it("all handlers requireWorkspace=true", () => {
    for (const handler of [signalsPost, decidePost, execTaskPost, validationPost]) {
      const opts = (handler as unknown as { __options?: { requireWorkspace?: boolean } }).__options;
      expect(opts?.requireWorkspace).toBe(true);
    }
  });
});

// ─── 6. signals route — handler behaviour ────────────────────────────────────

describe("[module-10] POST /api/owner/opportunities/signals — handler", () => {
  const VALID_SIGNAL = {
    rawSignalType: "GOVERNMENT_TENDER",
    rawDescription: "Government tender for IT services",
    discoveredAt: "2026-07-11T10:00:00Z",
  };

  it("returns signal data on success", async () => {
    vi.mocked(submitExternalOpportunitySignal).mockResolvedValueOnce({
      ok: true,
      signalId: "sig-123",
      classification: "TENDER",
      initialStatus: "PENDING_REVIEW",
      deduped: false,
      topOpportunity: null,
    } as ReturnType<typeof submitExternalOpportunitySignal> extends Promise<infer T> ? T : never);

    const res = await signalsPost(makeCtx(VALID_SIGNAL));
    const body = getBody(res);
    expect(body.signalId).toBe("sig-123");
    expect(body.classification).toBe("TENDER");
    expect(body.deduped).toBe(false);
  });

  it("passes workspaceId from ctx (not body) to service", async () => {
    vi.mocked(submitExternalOpportunitySignal).mockResolvedValueOnce({
      ok: true,
      signalId: "sig-789",
      classification: "LEAD",
      initialStatus: "PENDING_REVIEW",
      deduped: false,
      topOpportunity: null,
    } as ReturnType<typeof submitExternalOpportunitySignal> extends Promise<infer T> ? T : never);

    await signalsPost(makeCtx(VALID_SIGNAL, "ws-SPECIFIC"));
    expect(vi.mocked(submitExternalOpportunitySignal)).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-SPECIFIC" })
    );
  });

  it("passes actorId from ctx to service", async () => {
    vi.mocked(submitExternalOpportunitySignal).mockResolvedValueOnce({
      ok: true,
      signalId: "s",
      classification: "LEAD",
      initialStatus: "PENDING_REVIEW",
      deduped: false,
      topOpportunity: null,
    } as ReturnType<typeof submitExternalOpportunitySignal> extends Promise<infer T> ? T : never);

    await signalsPost(makeCtx(VALID_SIGNAL));
    expect(vi.mocked(submitExternalOpportunitySignal)).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "actor-1" })
    );
  });

  it("returns 400 error response on service failure", async () => {
    vi.mocked(submitExternalOpportunitySignal).mockResolvedValueOnce({
      ok: false,
      reason: "INVALID_SIGNAL",
    } as ReturnType<typeof submitExternalOpportunitySignal> extends Promise<infer T> ? T : never);

    const res = await signalsPost(makeCtx(VALID_SIGNAL));
    const body = getBody(res);
    expect(body.error).toBeDefined();
  });

  it("rejects rawDescription shorter than 3 chars", async () => {
    await expect(
      signalsPost(makeCtx({ ...VALID_SIGNAL, rawDescription: "ab" }))
    ).rejects.toThrow();
  });

  it("rejects unknown body fields", async () => {
    await expect(
      signalsPost(makeCtx({ ...VALID_SIGNAL, unknownField: true }))
    ).rejects.toThrow();
  });
});

// ─── 7. decide route — handler behaviour ─────────────────────────────────────

describe("[module-10] POST /api/owner/opportunities/decide — handler", () => {
  const VALID_DECIDE = {
    businessId: "550e8400-e29b-41d4-a716-446655440001",
    fitScore: 0.75,
    paymentRisk: "medium",
  };

  it("returns decision result from service", async () => {
    vi.mocked(decideOpportunity).mockResolvedValueOnce({
      decision: "ACCEPT",
      reasons: ["Fit score above threshold"],
      nextAction: "Prepare proposal",
    } as ReturnType<typeof decideOpportunity> extends Promise<infer T> ? T : never);

    const res = await decidePost(makeCtx(VALID_DECIDE));
    const body = getBody(res);
    expect(body.decision).toBe("ACCEPT");
    expect(Array.isArray(body.reasons)).toBe(true);
  });

  it("passes workspaceId from ctx to service", async () => {
    vi.mocked(decideOpportunity).mockResolvedValueOnce({
      decision: "DEFER",
      reasons: [],
      nextAction: null,
    } as ReturnType<typeof decideOpportunity> extends Promise<infer T> ? T : never);

    const decideCtx = { ...makeCtx(VALID_DECIDE, "ws-DECIDE") };
    await decidePost(decideCtx);
    expect(vi.mocked(decideOpportunity)).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-DECIDE" })
    );
  });

  it("rejects fitScore > 1", async () => {
    await expect(
      decidePost(makeCtx({ ...VALID_DECIDE, fitScore: 1.5 }))
    ).rejects.toThrow();
  });

  it("rejects invalid paymentRisk value", async () => {
    await expect(
      decidePost(makeCtx({ ...VALID_DECIDE, paymentRisk: "extreme" }))
    ).rejects.toThrow();
  });

  it("rejects non-UUID businessId", async () => {
    // Use a clearly invalid UUID format
    await expect(
      decidePost(makeCtx({ ...VALID_DECIDE, businessId: "not-a-uuid-at-all" }))
    ).rejects.toThrow();
  });
});

// ─── 8. execution-task route — handler behaviour ──────────────────────────────

describe("[module-10] POST /api/owner/opportunities/execution-task — handler", () => {
  const VALID_TASK = {
    taskKey: "task-001",
    opportunityKey: "opp-001",
    taskType: "COLLECT_DOCUMENTS",
    sourceType: "PREP_CHECKLIST",
    sourceKey: "checklist-001",
    nextActionOwner: "OWNER",
    approvalLevel: "OWNER",
    action: "START",
  };

  it("returns task update result from service", async () => {
    vi.mocked(recordExecutionTaskUpdate).mockResolvedValueOnce({
      ok: true,
      taskId: "task-id-123",
      status: "IN_PROGRESS",
    } as ReturnType<typeof recordExecutionTaskUpdate> extends Promise<infer T> ? T : never);

    const res = await execTaskPost(makeCtx(VALID_TASK));
    const body = getBody(res);
    expect(body.taskId).toBe("task-id-123");
    expect(body.status).toBe("IN_PROGRESS");
  });

  it("passes workspaceId from ctx to service", async () => {
    vi.mocked(recordExecutionTaskUpdate).mockResolvedValueOnce({
      ok: true,
      taskId: "t",
      status: "ASSIGNED",
    } as ReturnType<typeof recordExecutionTaskUpdate> extends Promise<infer T> ? T : never);

    await execTaskPost(makeCtx(VALID_TASK, "ws-TASK"));
    expect(vi.mocked(recordExecutionTaskUpdate)).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-TASK" })
    );
  });

  it("rejects invalid action value", async () => {
    await expect(
      execTaskPost(makeCtx({ ...VALID_TASK, action: "INVALID" }))
    ).rejects.toThrow();
  });

  it("rejects invalid taskType", async () => {
    await expect(
      execTaskPost(makeCtx({ ...VALID_TASK, taskType: "UNKNOWN_TYPE" }))
    ).rejects.toThrow();
  });
});

// ─── 9. validation-outcome route — handler behaviour ─────────────────────────

describe("[module-10] POST /api/owner/opportunities/validation-outcome — handler", () => {
  const VALID_OUTCOME = {
    experimentKey: "exp-001",
    opportunityKey: "opp-001",
    status: "COMPLETED",
    result: "PASSED",
  };

  it("returns outcome result from service", async () => {
    vi.mocked(recordValidationOutcome).mockResolvedValueOnce({
      ok: true,
      outcomeId: "out-001",
      result: "PASSED",
      nextRecommendedDecision: "SCALE",
      deduped: false,
      updated: false,
    } as ReturnType<typeof recordValidationOutcome> extends Promise<infer T> ? T : never);

    const res = await validationPost(makeCtx(VALID_OUTCOME));
    const body = getBody(res);
    expect(body.outcomeId).toBe("out-001");
    expect(body.nextRecommendedDecision).toBe("SCALE");
  });

  it("passes workspaceId from ctx (never body) to service", async () => {
    vi.mocked(recordValidationOutcome).mockResolvedValueOnce({
      ok: true,
      outcomeId: "o",
      result: "FAILED",
      nextRecommendedDecision: "KILL",
      deduped: false,
      updated: false,
    } as ReturnType<typeof recordValidationOutcome> extends Promise<infer T> ? T : never);

    await validationPost(makeCtx(VALID_OUTCOME, "ws-OUTCOME"));
    expect(vi.mocked(recordValidationOutcome)).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-OUTCOME" })
    );
  });

  it("rejects invalid status value", async () => {
    await expect(
      validationPost(makeCtx({ ...VALID_OUTCOME, status: "INVALID_STATUS" }))
    ).rejects.toThrow();
  });

  it("rejects invalid result value", async () => {
    await expect(
      validationPost(makeCtx({ ...VALID_OUTCOME, result: "INVALID_RESULT" }))
    ).rejects.toThrow();
  });
});
