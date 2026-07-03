/**
 * Jarvis 360 gap-closure (G28) — service-level owner loop proof (DI, no DB).
 *
 * Uses the laundry archetype seed to drive ONE complete owner loop through the REAL wired
 * services (not mocked helpers): capacity detection → arbitration (chosen + what-not-to-do)
 * → live approval resolution (workload reduction) → proof-gated task completion → self-eval
 * failure → business memory → next promotion blocked by that memory. Proves the pieces
 * compose end-to-end at the service/API layer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));
const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

import { buildLaundryArchetypeSeed } from "@/infra/owner-archetype-seed";
import { assessFleetCapacity, type EquipmentRecord } from "@/domain/owner-mode/equipment-capacity";
import { arbitrateInterventions } from "@/services/owner-mode/intervention-arbitration.service";
import { resolveOwnerApproval } from "@/services/owner-mode/owner-approval-resolution.service";
import { completeTask, TaskCompletionBlockedError } from "@/services/execution/task-completion.service";
import { recordSelfEvaluation } from "@/services/owner-mode/self-evaluation.service";
import { enforceDoNotRepeatForPromotion, recordDoNotRepeat, DoNotRepeatBlockedError } from "@/services/owner-mode/do-not-repeat.service";
import { ProofStatus } from "@/domain/execution/proof";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import type { PrioritizedIntervention } from "@/domain/consulting-engine/types";

const NOW = new Date("2026-06-28T00:00:00.000Z");
beforeEach(() => emitAuditEvent.mockClear());

function intervention(id: string, title: string, cost: string, klass: string, score: number): PrioritizedIntervention {
  return {
    intervention: {
      id, title, class: klass as never, objective: "o", rationale: "r", whyThisNow: "n", ownerRole: "owner",
      steps: [{ order: 1, description: "s", ownerRole: "owner" }] as never,
      estimatedCostBand: cost as never, expectedImpactOnRevenue: "SIGNIFICANT" as never,
      successMetrics: ["m"], failureRisks: ["x"], fallbackPlan: "fb", evidenceBasis: [], estimatedTotalDays: 5, priorityScore: score,
    } as PrioritizedIntervention["intervention"],
    priorityScore: score, factors: [], sequencingReason: "seq",
  };
}

describe("owner loop (service-level)", () => {
  it("runs condition → arbitration → approval → completion → self-eval → memory → block", async () => {
    const seed = buildLaundryArchetypeSeed();

    // 1. Capacity detection from seeded equipment (real domain).
    const fleet: Array<EquipmentRecord & { name: string }> = seed.equipment.map((e) => ({
      name: e.name,
      utilization: e.utilization,
      downtimeState: e.downtimeState === "down" ? "down" : "up",
      maintenanceDueAt: new Date(NOW.getTime() + e.maintenanceDueInDays * 24 * 60 * 60 * 1000),
      status: "operational",
    }));
    const capacity = assessFleetCapacity(fleet, NOW);
    expect(capacity.bottlenecks.length).toBeGreaterThan(0); // overdue washer + saturated dryer

    // 2. Arbitration over two candidate interventions derived from seeded opportunities.
    const interventions = [
      intervention("express", "Same-day express tier (no new capacity)", "LOW", "GROWTH_ENABLEMENT", 78),
      intervention("hotel2", "Second hotel contract (needs capacity)", "HIGH", "STRUCTURAL_REPAIR", 55),
    ];
    const arb = await arbitrateInterventions("ws1", interventions);
    expect(arb.recommendedInterventionId).toBe("express");
    expect(arb.whatNotToDo.join(" ")).toContain("Second hotel contract");

    // 3. Live approval resolution — a remembered approval auto-handles (workload reduction).
    const approval = await resolveOwnerApproval(
      { workspaceId: "ws1", scope: "pricing.express", contentHash: "hash-express-1", riskClass: "medium", actionType: "launch_tier" },
      {
        load: {
          db: {
            ownerStandingInstruction: { findFirst: vi.fn(async () => null), create: vi.fn() },
            ownerAttentionEvent: { create: vi.fn(async () => ({ id: "a" })) },
          },
          now: () => NOW,
        },
        memory: {
          db: {
            ownerApprovalMemory: {
              findUnique: vi.fn(async () => ({ id: "m", version: 1, workspaceId: "ws1", scope: "pricing.express", contentHash: "hash-express-1", riskClass: "medium", approvalStatus: "approved", validUntil: null })),
              upsert: vi.fn(),
            },
          },
          now: () => NOW,
        },
      }
    );
    expect(approval.handledByOpsIQ).toBe(true);

    // 4a. Task completion BLOCKED without accepted proof.
    const taskDeps = (proofStatus: string) => ({
      db: {
        delegatedTask: {
          findFirst: vi.fn(async () => ({
            id: "task1", workspaceId: "ws1", assignedUserId: "emp1", assignedRole: "EMPLOYEE",
            status: "COMPLETED_PENDING_REVIEW", workOrderId: null, approvedBoundaryId: null,
            approvedBoundaryVersion: null, boundaryContentHash: null, proofRequirementId: "pr1",
          })),
          updateMany: vi.fn(async () => ({ count: 1 })),
        },
        proof: { findFirst: vi.fn(async () => ({ status: proofStatus, duplicateFlagged: false, reviewedAt: NOW })) },
        auditEvent: { create: vi.fn(async () => ({})) },
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ delegatedTask: { updateMany: vi.fn(async () => ({ count: 1 })) }, auditEvent: { create: vi.fn(async () => ({})) } }),
      },
      now: () => NOW,
    });
    const ownerActor = { role: TaskActorRole.OWNER, isAssignee: false, canApproveCompletion: true, canReviewProof: true, canAssign: true };
    await expect(
      completeTask({ taskId: "task1", workspaceId: "ws1", actor: ownerActor, actorId: "owner1" }, taskDeps(ProofStatus.SUBMITTED) as never)
    ).rejects.toBeInstanceOf(TaskCompletionBlockedError);

    // 4b. Completion ALLOWED once proof is accepted.
    const status = await completeTask({ taskId: "task1", workspaceId: "ws1", actor: ownerActor, actorId: "owner1" }, taskDeps(ProofStatus.ACCEPTED) as never);
    expect(status).toBe("APPROVED_COMPLETE");

    // 5 + 6. A failed self-evaluation records business memory that blocks the repeat.
    const rules: Array<{ memoryKey: string; blocksRepetition: boolean; active: boolean; changedContextExplanation: string | null }> = [];
    const dnrDeps = {
      db: {
        recommendation: { findUnique: vi.fn(async () => ({ findingId: "f1" })) },
        finding: { findFirst: vi.fn(async () => ({ code: "EXPRESS_TIER_UNDERPRICED", impactArea: "pricing" })) },
        ownerDoNotRepeatRule: {
          findFirst: vi.fn(async (args: { where: { memoryKey: { in: string[] } } }) =>
            rules.find((r) => args.where.memoryKey.in.includes(r.memoryKey) && r.blocksRepetition && r.active) ?? null
          ),
          create: vi.fn(async (args: { data: { memoryKey: string; blocksRepetition: boolean; active: boolean } }) => {
            rules.push({ memoryKey: args.data.memoryKey, blocksRepetition: args.data.blocksRepetition, active: args.data.active, changedContextExplanation: null });
            return { id: `r${rules.length}` };
          }),
        },
      },
    };
    const evalResult = await recordSelfEvaluation(
      {
        workspaceId: "ws1", businessId: "biz1", recommendationId: "rec-express",
        memoryKey: "EXPRESS_TIER_UNDERPRICED", expectedOutcome: "margin up 5%",
        signals: { executed: true, metExpectation: false }, // bad_recommendation → blocking caution
      },
      { db: { ownerSelfEvaluation: { create: vi.fn(async () => ({ id: "se1" })) } }, now: () => NOW, recordCaution: (input) => recordDoNotRepeat(input, dnrDeps as never) }
    );
    expect(evalResult.cautionRecorded).toBe(true);
    expect(rules).toHaveLength(1);

    // The next attempt to promote the same finding is now blocked by the recorded memory.
    await expect(enforceDoNotRepeatForPromotion("rec-express-2", "ws1", dnrDeps as never)).rejects.toBeInstanceOf(DoNotRepeatBlockedError);
  });
});
