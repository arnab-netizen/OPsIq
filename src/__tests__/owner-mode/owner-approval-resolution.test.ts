/**
 * Jarvis 360 gap-closure (G07,G08,G10) — live owner approval resolution (DI).
 * Proves standing instructions + approval memory are consulted at runtime, that
 * OpsIQ auto-handles when allowed/remembered (recording a handled-by-OpsIQ attention
 * event), and that a genuine owner decision still surfaces.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));
// workflow.ts top-level imports @/lib/db (the generated Prisma client). Mock it so the
// module graph resolves without a generated client; all DB access here is DI-injected.
vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));

import { resolveOwnerApproval } from "@/services/owner-mode/owner-approval-resolution.service";
import { enforceApprovalRequirement } from "@/services/approval/workflow";

beforeEach(() => emitAuditEvent.mockClear());

function makeDeps(opts: {
  instruction?: {
    scope: string;
    allowedActionTypes: string[];
    forbiddenActionTypes: string[];
    maxAmount: number | null;
    status: string;
    validUntil: Date | null;
  } | null;
  memoryReusable?: boolean;
}) {
  const attentionCreate = vi.fn(async () => ({ id: "att1" }));
  return {
    attentionCreate,
    deps: {
      load: {
        db: {
          ownerStandingInstruction: { findFirst: vi.fn(async () => (opts.instruction ?? null)), create: vi.fn() },
          ownerAttentionEvent: { create: attentionCreate },
        },
        now: () => new Date("2026-06-28T00:00:00.000Z"),
      },
      memory: {
        db: {
          ownerApprovalMemory: {
            findUnique: vi.fn(async () =>
              opts.memoryReusable
                ? {
                    id: "m1",
                    version: 1,
                    workspaceId: "ws1",
                    scope: "pricing.discount",
                    contentHash: "hash12345678",
                    riskClass: "medium",
                    approvalStatus: "approved",
                    validUntil: null,
                  }
                : null
            ),
            upsert: vi.fn(),
          },
        },
        now: () => new Date("2026-06-28T00:00:00.000Z"),
      },
    },
  };
}

const baseInput = {
  workspaceId: "ws1",
  scope: "pricing.discount",
  contentHash: "hash12345678",
  riskClass: "medium" as const,
  actionType: "apply_discount",
};

describe("resolveOwnerApproval", () => {
  it("auto-handles when a standing instruction allows the action", async () => {
    const { deps, attentionCreate } = makeDeps({
      instruction: { scope: "pricing.discount", allowedActionTypes: ["apply_discount"], forbiddenActionTypes: [], maxAmount: 1000, status: "active", validUntil: null },
    });
    const r = await resolveOwnerApproval({ ...baseInput, amount: 500 }, deps);
    expect(r.outcome).toBe("auto_handled");
    expect(r.ownerActionRequired).toBe(false);
    expect(r.handledByOpsIQ).toBe(true);
    // recorded a handled-by-OpsIQ attention event (workload reduction signal)
    expect(attentionCreate).toHaveBeenCalledTimes(1);
    expect(attentionCreate.mock.calls[0][0].data.handledByOpsIQ).toBe(true);
  });

  it("blocks (forbidden) without asking the owner when a standing instruction forbids", async () => {
    const { deps } = makeDeps({
      instruction: { scope: "pricing.discount", allowedActionTypes: [], forbiddenActionTypes: ["apply_discount"], maxAmount: null, status: "active", validUntil: null },
    });
    const r = await resolveOwnerApproval(baseInput, deps);
    expect(r.outcome).toBe("forbidden");
    expect(r.ownerActionRequired).toBe(false);
  });

  it("auto-handles when an approval is remembered (memory reuse)", async () => {
    const { deps } = makeDeps({ instruction: null, memoryReusable: true });
    const r = await resolveOwnerApproval(baseInput, deps);
    expect(r.outcome).toBe("auto_handled");
    expect(r.reason).toBe("approval_memory");
    expect(r.handledByOpsIQ).toBe(true);
  });

  it("requires an owner decision when nothing matches", async () => {
    const { deps, attentionCreate } = makeDeps({ instruction: null, memoryReusable: false });
    const r = await resolveOwnerApproval(baseInput, deps);
    expect(r.outcome).toBe("needs_owner_approval");
    expect(r.ownerActionRequired).toBe(true);
    expect(r.handledByOpsIQ).toBe(false);
    expect(attentionCreate.mock.calls[0][0].data.ownerDecisionRequired).toBe(true);
  });
});

describe("enforceApprovalRequirement with owner context", () => {
  it("auto-handles a high-impact approval when remembered (no approval request created)", async () => {
    const { deps } = makeDeps({ instruction: null, memoryReusable: true });
    const result = await enforceApprovalRequirement(
      "op1",
      200000, // above APPROVAL_THRESHOLD
      "user1",
      "approver1",
      baseInput,
      deps
    );
    expect(result.requiresApproval).toBe(true);
    expect(result.approvalCreated).toBe(false);
    expect(result.autoHandled).toBe(true);
    expect(result.autoHandledReason).toBe("approval_memory");
  });

  it("returns no approval needed below threshold without consulting owner memory", async () => {
    const { deps } = makeDeps({ instruction: null, memoryReusable: true });
    const result = await enforceApprovalRequirement("op1", 1, "user1", "approver1", baseInput, deps);
    expect(result.requiresApproval).toBe(false);
    expect(result.autoHandled).toBeUndefined();
  });
});
