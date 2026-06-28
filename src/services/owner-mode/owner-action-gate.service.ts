/**
 * Jarvis 360 owner-flow closure (EH-01, EH-02, EH-09, EH-18) — owner-mode action gate.
 *
 * The extreme hostile audit found the safety-gate spine ran only on the consulting
 * `Recommendation` promotion, while owner-mode domain actions (finance/cashflow/sales/
 * marketing/operations/strategy/sop) transitioned through their own status machine with
 * NO gate. This is the missing default-on gate for the owner's actual runtime flow.
 *
 * It enforces — on a MATERIAL transition (acting on / completing an action) — using the
 * owner's own data (no dependency on the consulting Recommendation model):
 *   - owner gate opt-out (reused resolveOwnerGateMode — audited, owner-authorized only),
 *   - do-not-repeat by domain scope (an active blocking rule for "scope:<domain>"),
 *   - capacity for growth-sensitive domains (saturated/down/overdue equipment).
 * A block throws ConflictError (409, governed) and audits OWNER_GATE_PROMOTION_BLOCKED.
 *
 * Reuses resolveOwnerGateMode + assessFleetCapacity + the do-not-repeat rule table
 * (no new gate engine). Cash/margin owner-mode enforcement is a documented follow-on.
 */

import { ConflictError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { resolveOwnerGateMode, type PolicyDeps } from "@/services/owner-mode/gate-enforcement-policy";
import { assessFleetCapacity, type EquipmentRecord } from "@/domain/owner-mode/equipment-capacity";

/** Material owner-action transitions that must pass the gate. */
export const MATERIAL_ACTION_STATUSES: ReadonlySet<string> = new Set(["in_progress", "completed"]);

/** Domains whose actions consume physical capacity (growth-sensitive). */
export const CAPACITY_SENSITIVE_DOMAINS: ReadonlySet<string> = new Set([
  "marketing",
  "sales",
  "strategy",
  "operations",
]);

interface ActionGateDb {
  clientAccount: PolicyDeps["db"]["clientAccount"];
  ownerDoNotRepeatRule: {
    findFirst(args: {
      where: { workspaceId: string; memoryKey: { in: string[] }; blocksRepetition: boolean; active: boolean };
      orderBy: { createdAt: "desc" };
    }): Promise<{ changedContextExplanation: string | null } | null>;
  };
  ownerEquipment: {
    findMany(args: { where: { workspaceId: string }; select: Record<string, boolean> }): Promise<Array<EquipmentRecord & { name: string }>>;
  };
}

export interface OwnerActionGateDeps {
  db: ActionGateDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<OwnerActionGateDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as ActionGateDb };
}

export interface OwnerActionGateInput {
  workspaceId: string;
  businessId: string | null;
  actionId: string;
  /** Owner domain, e.g. "finance" | "marketing" | "cashflow". */
  domain: string;
  /** Target status of the transition being applied. */
  toStatus: string;
}

async function block(input: OwnerActionGateInput, reason: string, code: string): Promise<never> {
  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED,
    actorType: "system",
    entityType: "owner_action",
    entityId: input.actionId,
    payload: { domain: input.domain, toStatus: input.toStatus, code, errorName: "OwnerActionGateError" },
  });
  throw new ConflictError(reason);
}

/**
 * Enforce the owner-mode safety gate on a material action transition. No-op for
 * non-material transitions (assigned/blocked/cancelled) and when the owner has an
 * active audited opt-out. Throws ConflictError (governed) on a safety block.
 */
export async function enforceOwnerActionGates(input: OwnerActionGateInput, injected?: OwnerActionGateDeps): Promise<void> {
  if (!MATERIAL_ACTION_STATUSES.has(input.toStatus)) return;
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();

  const mode = await resolveOwnerGateMode(input.workspaceId, { db: deps.db as unknown as PolicyDeps["db"], now: () => now });
  if (mode === "OPTED_OUT") return;

  // 1. Do-not-repeat by domain scope (a failed-before decision class the owner marked).
  const rule = await deps.db.ownerDoNotRepeatRule.findFirst({
    where: { workspaceId: input.workspaceId, memoryKey: { in: [`scope:${input.domain}`] }, blocksRepetition: true, active: true },
    orderBy: { createdAt: "desc" },
  });
  if (rule && !(rule.changedContextExplanation && rule.changedContextExplanation.trim())) {
    await block(input, `This ${input.domain} action repeats a decision marked do-not-repeat. Provide a changed-context reason to override.`, "DO_NOT_REPEAT_BLOCKED");
  }

  // 2. Capacity for growth-sensitive domains (don't act on growth while capacity is unsafe).
  if (CAPACITY_SENSITIVE_DOMAINS.has(input.domain)) {
    const fleet = await deps.db.ownerEquipment.findMany({
      where: { workspaceId: input.workspaceId },
      select: { name: true, utilization: true, downtimeState: true, maintenanceDueAt: true, status: true },
    });
    const capacity = assessFleetCapacity(fleet, now);
    if (capacity.status === "blocked" || capacity.status === "high_risk") {
      await block(
        input,
        `Capacity is unsafe (${capacity.reason}${capacity.bottlenecks.length ? `: ${capacity.bottlenecks.join(", ")}` : ""}). Clear the bottleneck before advancing this ${input.domain} action.`,
        "CAPACITY_BLOCKED"
      );
    }
  }
}
