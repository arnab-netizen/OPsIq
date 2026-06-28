/**
 * Jarvis 360 gap-closure (G03) — live owner block metrics (DI).
 *
 * The owner control center previously hardcoded blockedRecommendations/proofBlocked/
 * financeBlocked to 0. This derives them from the append-only audit log over a recent
 * window, workspace-scoped, so the owner sees what was actually blocked. No new tables
 * (reuses AuditEvent); read-only.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

interface BlockMetricsDb {
  auditEvent: {
    findMany(args: {
      where: { workspaceId: string; eventName: { in: string[] }; occurredAt: { gte: Date } };
      select: { eventName: true; payload: true };
    }): Promise<Array<{ eventName: string; payload: unknown }>>;
  };
}

export interface BlockMetricsDeps {
  db: BlockMetricsDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<BlockMetricsDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as BlockMetricsDb };
}

export interface OwnerBlockMetrics {
  blockedRecommendations: number;
  financeBlocked: number;
  proofBlocked: number;
  /** EH-16 — approvals OpsIQ auto-handled (memory/standing instruction) in the window. */
  approvalsAvoided: number;
}

/** Finance-domain gate errors/codes whose blocks count as finance/cash/margin blocks. */
const FINANCE_GATE_ERRORS = new Set(["CashSafetyGateError", "MarginSafetyGateError"]);
const FINANCE_GATE_CODES = new Set(["CASH_SAFETY_BLOCKED", "MARGIN_SAFETY_BLOCKED"]);

const DEFAULT_WINDOW_DAYS = 30;

/**
 * Aggregate recent block events for a workspace. `blockedRecommendations` counts every
 * gate/do-not-repeat block; `financeBlocked` is the cash/margin subset; `proofBlocked`
 * counts task-completion blocks (proof not cleared).
 */
export async function getOwnerBlockMetrics(
  workspaceId: string,
  injected?: BlockMetricsDeps & { windowDays?: number }
): Promise<OwnerBlockMetrics> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const windowDays = injected?.windowDays ?? DEFAULT_WINDOW_DAYS;
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const events = await deps.db.auditEvent.findMany({
    where: {
      workspaceId,
      eventName: {
        in: [
          AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED,
          AUDIT_EVENTS.OWNER_DO_NOT_REPEAT_BLOCKED,
          AUDIT_EVENTS.OWNER_TASK_COMPLETION_BLOCKED,
          AUDIT_EVENTS.OWNER_APPROVAL_AUTO_HANDLED,
        ],
      },
      occurredAt: { gte: since },
    },
    select: { eventName: true, payload: true },
  });

  let blockedRecommendations = 0;
  let financeBlocked = 0;
  let proofBlocked = 0;
  let approvalsAvoided = 0;

  for (const e of events) {
    if (e.eventName === AUDIT_EVENTS.OWNER_TASK_COMPLETION_BLOCKED) {
      proofBlocked += 1;
      continue;
    }
    if (e.eventName === AUDIT_EVENTS.OWNER_APPROVAL_AUTO_HANDLED) {
      approvalsAvoided += 1;
      continue;
    }
    blockedRecommendations += 1;
    if (e.eventName === AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED) {
      const payload = (e.payload && typeof e.payload === "object" ? e.payload : {}) as Record<string, unknown>;
      const errorName = payload.errorName;
      const code = payload.code;
      if (
        (typeof errorName === "string" && FINANCE_GATE_ERRORS.has(errorName)) ||
        (typeof code === "string" && FINANCE_GATE_CODES.has(code))
      ) {
        financeBlocked += 1;
      }
    }
  }

  return { blockedRecommendations, financeBlocked, proofBlocked, approvalsAvoided };
}
