/**
 * Jarvis 360 Slice 12 — do-not-repeat enforcement at recommendation promotion (DI).
 *
 * Derives a memory key from the recommendation's linked finding code, looks up an
 * active do_not_repeat memory in OwnerDecisionMemory (reused), and blocks promotion
 * unless an explicit changed-context override exists. Also records do_not_repeat
 * memories. Reuses the pure rules; emits an audit event on block.
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { evaluateDoNotRepeat, type DoNotRepeatMemory } from "@/domain/owner-mode/do-not-repeat";

interface DnrDb {
  recommendation: {
    findUnique(args: { where: { id: string; workspaceId: string }; select: { findingId: true } }): Promise<{ findingId: string | null } | null>;
  };
  finding: {
    findUnique(args: { where: { id: string; workspaceId: string }; select: { code: true } }): Promise<{ code: string | null } | null>;
  };
  ownerDoNotRepeatRule: {
    findFirst(args: {
      where: { workspaceId: string; memoryKey: string; blocksRepetition: boolean; active: boolean };
      orderBy: { createdAt: "desc" };
    }): Promise<{ blocksRepetition: boolean; changedContextExplanation: string | null } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

export interface DnrDeps {
  db: DnrDb;
}

async function resolveDefaultDeps(): Promise<DnrDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as DnrDb };
}

export class DoNotRepeatBlockedError extends Error {
  readonly code = "DO_NOT_REPEAT_BLOCKED";
  constructor(recommendationId: string, reason: string) {
    super(`Recommendation ${recommendationId} blocked by a do-not-repeat rule: ${reason}`);
    this.name = "DoNotRepeatBlockedError";
  }
}

async function memoryKeyFor(recommendationId: string, workspaceId: string, deps: DnrDeps): Promise<string | null> {
  const rec = await deps.db.recommendation.findUnique({ where: { id: recommendationId, workspaceId }, select: { findingId: true } });
  if (!rec?.findingId) return null;
  const finding = await deps.db.finding.findUnique({ where: { id: rec.findingId, workspaceId }, select: { code: true } });
  return finding?.code ?? null;
}

/** Block promotion when an active do_not_repeat memory matches the recommendation's key. */
export async function enforceDoNotRepeatForPromotion(recommendationId: string, workspaceId: string, injected?: DnrDeps): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());
  const key = await memoryKeyFor(recommendationId, workspaceId, deps);
  if (!key) return;
  const rule = await deps.db.ownerDoNotRepeatRule.findFirst({
    where: { workspaceId, memoryKey: key, blocksRepetition: true, active: true },
    orderBy: { createdAt: "desc" },
  });
  // Adapt the dedicated rule row to the pure evaluator's shape (category is implicit).
  const memory: DoNotRepeatMemory | null = rule
    ? { category: "do_not_repeat", blocksRepetition: rule.blocksRepetition, memoryKey: key }
    : null;
  const decision = evaluateDoNotRepeat(memory, rule?.changedContextExplanation ?? null);
  if (decision.blocked) {
    await emitAuditEvent({
      workspaceId,
      eventName: AUDIT_EVENTS.OWNER_DO_NOT_REPEAT_BLOCKED,
      actorType: "system",
      entityType: "recommendation",
      entityId: recommendationId,
      payload: { memoryKey: key },
    });
    throw new DoNotRepeatBlockedError(recommendationId, decision.reason ?? "blocked");
  }
}

export interface RecordDoNotRepeatInput {
  workspaceId: string;
  businessId: string;
  memoryKey: string;
  summary: string;
  reason: string;
  recommendationId?: string | null;
}

/** Record a do_not_repeat memory so future matching recommendations are blocked. */
export async function recordDoNotRepeat(input: RecordDoNotRepeatInput, injected?: DnrDeps): Promise<string> {
  const deps = injected ?? (await resolveDefaultDeps());
  const created = await deps.db.ownerDoNotRepeatRule.create({
    data: {
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      memoryKey: input.memoryKey,
      recommendationId: input.recommendationId ?? null,
      summary: input.summary,
      reason: input.reason,
      blocksRepetition: true,
      active: true,
    },
  });
  return created.id;
}
