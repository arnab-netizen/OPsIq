/**
 * Jarvis 360 owner-flow closure (EH-01, EH-02, EH-09, EH-18) — owner-mode action gate.
 *
 * The extreme hostile audit found the safety-gate spine ran only on the consulting
 * `Recommendation` promotion, while owner-mode domain actions (finance/cashflow/sales/
 * marketing/operations/strategy/sop/recovery/budget) transitioned through their own status machine
 * with NO gate. This is the default-on gate for the owner's actual runtime flow — the FINAL,
 * server-side enforcement on every MATERIAL transition (acting on / completing an action).
 *
 * The policy is pure and shared (domain/owner-mode/owner-action-gate-policy.ts): this service loads a
 * business's current safety state (`loadOwnerGateConstraints` — opt-out, do-not-repeat memories,
 * equipment capacity, the ONE current cash/finance reading, gross margin, attributed expired
 * compliance) and evaluates the transition against it. The canonical owner decision evaluates its
 * candidates against the SAME constraints (home.service.ts / owner-candidate-builder.ts), so it never
 * tells the owner to do what this gate would refuse; this gate still re-checks at mutation time.
 *
 * A block audits OWNER_GATE_PROMOTION_BLOCKED and throws ConflictError (409, governed). An allowed
 * transition returns its assessment; a margin abstention in it is recorded by the CALLER after its own
 * mutation is validated and saved (recordOwnerGateAssessment) — never before, so a rejected or retried
 * update leaves no row claiming an accepted transition.
 */

import { ConflictError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { resolveOwnerGateMode, type PolicyDeps } from "@/services/owner-mode/gate-enforcement-policy";
import type { EquipmentRecord } from "@/domain/owner-mode/equipment-capacity";
import type { FinancialHealthState } from "@/domain/owner-finance/cash-safety-gate";
import { grossMarginPctFrom } from "@/domain/owner-finance/margin-safety-gate";
import {
  capacityConstraint,
  evaluateOwnerActionGate,
  expiredComplianceFor,
  MATERIAL_ACTION_STATUSES,
  OWNER_MARGIN_ABSTENTION_CODE,
  type OwnerGateConstraints,
  type OwnerGateDoNotRepeatRule,
} from "@/domain/owner-mode/owner-action-gate-policy";
import { DNR_SCOPE_PREFIX, parseOwnerDnrKey } from "@/domain/owner-mode/do-not-repeat-scope";
import { currentEffectiveFinancialSnapshotQuery, type CurrentEffectiveSnapshotQuery } from "@/services/owner-finance/financial-snapshot-selection";
import { ownerFindingIntent, type OwnerTargetIntent } from "@/domain/owner-spine/owner-imperatives";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER } from "@/services/owner-spine/current-diagnosis-cycle";
import { currentCashFinanceReading } from "@/services/owner-spine/current-cash-finance-reading";

export { MATERIAL_ACTION_STATUSES, OWNER_MARGIN_ABSTENTION_CODE };
export { OWNER_MARGIN_REQUIRED_DATA, CAPACITY_SENSITIVE_DOMAINS } from "@/domain/owner-mode/owner-action-gate-policy";

interface ActionGateDb {
  clientAccount: PolicyDeps["db"]["clientAccount"];
  ownerBusiness: {
    findMany(args: { where: { workspaceId: string; isActive: true; isFixtureBusiness: false }; select: { id: true }; take: number }): Promise<Array<{ id: string }>>;
  };
  ownerDoNotRepeatRule: {
    findMany(args: {
      where: Record<string, unknown>;
      select: { memoryKey: true; changedContextExplanation: true };
    }): Promise<Array<{ memoryKey: string; changedContextExplanation: string | null }>>;
  };
  ownerEquipment: {
    findMany(args: { where: Record<string, unknown>; select: Record<string, boolean> }): Promise<Array<EquipmentRecord & { name: string }>>;
  };
  ownerFinanceCycle: {
    findFirst(args: {
      where: { workspaceId: string; businessId: string };
      orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER;
      select: { survivalState: true; snapshot: { select: { periodEnd: true; supersededById: true } } };
    }): Promise<{ survivalState: string; snapshot?: { periodEnd: Date; supersededById: string | null } | null } | null>;
  };
  ownerCashflowCycle: {
    findFirst(args: {
      where: { workspaceId: string; businessId: string };
      orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER;
      select: { cashflowState: true; snapshot: { select: { periodEnd: true } } };
    }): Promise<{ cashflowState: string; snapshot?: { periodEnd: Date } | null } | null>;
  };
  ownerFinancialSnapshot: {
    findFirst(args: CurrentEffectiveSnapshotQuery<{ revenue: true; costOfGoods: true }>): Promise<{ revenue: number | null; costOfGoods: number | null } | null>;
  };
  ownerComplianceItem: {
    findMany(args: { where: Record<string, unknown>; select: { businessId: true; kind: true; name: true; expiresAt: true } }): Promise<Array<{ businessId: string | null; kind: string; name: string; expiresAt: Date | null }>>;
  };
}

/**
 * Business-scoped where (H1/H2 isolation): rows for THIS business OR recorded with no business, so one
 * business's data never blocks another. Falls back to workspace-only when no businessId is supplied.
 */
function bizScope(workspaceId: string, businessId: string | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return businessId
    ? { workspaceId, OR: [{ businessId }, { businessId: null }], ...extra }
    : { workspaceId, ...extra };
}

export interface OwnerActionGateDeps {
  db: ActionGateDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<OwnerActionGateDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as ActionGateDb };
}

/**
 * A business's current safety state as the gate reads it. Also loaded by the canonical owner decision
 * (the same constraints), so a step the decision elects is one this gate permits at that state.
 */
export async function loadOwnerGateConstraints(
  workspaceId: string,
  businessId: string | null,
  injected?: OwnerActionGateDeps
): Promise<OwnerGateConstraints> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const mode = await resolveOwnerGateMode(workspaceId, { db: deps.db as unknown as PolicyDeps["db"], now: () => now });
  const scope = businessId ? { workspaceId, businessId } : null;
  const [rules, fleet, finCycle, cashCycle, snap, complianceItems, realBusinesses] = await Promise.all([
    deps.db.ownerDoNotRepeatRule.findMany({
      where: bizScope(workspaceId, businessId, { memoryKey: { startsWith: DNR_SCOPE_PREFIX }, blocksRepetition: true, active: true }),
      select: { memoryKey: true, changedContextExplanation: true },
    }),
    deps.db.ownerEquipment.findMany({
      where: bizScope(workspaceId, businessId),
      select: { name: true, utilization: true, downtimeState: true, maintenanceDueAt: true, status: true },
    }),
    scope
      ? deps.db.ownerFinanceCycle.findFirst({ where: scope, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { survivalState: true, snapshot: { select: { periodEnd: true, supersededById: true } } } })
      : Promise.resolve(null),
    scope
      ? deps.db.ownerCashflowCycle.findFirst({ where: scope, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { cashflowState: true, snapshot: { select: { periodEnd: true } } } })
      : Promise.resolve(null),
    scope
      ? deps.db.ownerFinancialSnapshot.findFirst(currentEffectiveFinancialSnapshotQuery(scope, { revenue: true, costOfGoods: true }))
      : Promise.resolve(null),
    deps.db.ownerComplianceItem.findMany({
      where: bizScope(workspaceId, businessId, { status: "active" }),
      select: { businessId: true, kind: true, name: true, expiresAt: true },
    }),
    deps.db.ownerBusiness.findMany({ where: { workspaceId, isActive: true, isFixtureBusiness: false }, select: { id: true }, take: 2 }),
  ]);

  // Do-not-repeat memories without a changed-context override, parsed through the ONE scope taxonomy.
  const doNotRepeat: OwnerGateDoNotRepeatRule[] = [];
  for (const r of rules) {
    if (r.changedContextExplanation && r.changedContextExplanation.trim()) continue;
    const parsed = parseOwnerDnrKey(r.memoryKey);
    if (parsed) doNotRepeat.push(parsed);
  }

  // The ONE current cash/finance reading (current-cash-finance-reading.ts): the current diagnosis cycles,
  // arbitrated by evidence period; an amended-but-undiagnosed unsafe Finance reading still counts until
  // it is re-diagnosed. No reading at all → nothing to enforce.
  const reading = currentCashFinanceReading(
    cashCycle ? { state: cashCycle.cashflowState, snapshot: cashCycle.snapshot } : null,
    finCycle ? { state: finCycle.survivalState, snapshot: finCycle.snapshot } : null,
    now.getTime()
  );
  const basis = reading.conflicting
    ? " (Cash flow and Finance disagree and neither is more current; the worse reading applies until they are reconciled)"
    : reading.financeAmendedLastKnown && !reading.financeState
      ? " (the last Finance diagnosis, whose figures were amended since; re-run the Finance diagnosis)"
      : "";

  return {
    optedOut: mode === "OPTED_OUT",
    businessScoped: businessId !== null,
    doNotRepeat,
    capacity: capacityConstraint(fleet, now),
    cash: { gateState: (reading.gateState as FinancialHealthState | null) ?? null, basis },
    grossMarginPct: grossMarginPctFrom(snap?.revenue ?? null, snap?.costOfGoods ?? null),
    expiredCompliance: expiredComplianceFor(complianceItems, businessId, realBusinesses.length === 1, now),
  };
}

export interface OwnerActionGateInput {
  workspaceId: string;
  businessId: string | null;
  actionId: string;
  /** Owner domain, e.g. "finance" | "marketing" | "cashflow". */
  domain: string;
  /** Target status of the transition being applied. */
  toStatus: string;
  /** The action's finding code — decides its intent (null when the action carries none). */
  findingCode?: string | null;
  /** The action's finding (matches an exact, finding-specific do-not-repeat memory). */
  findingId?: string | null;
  /**
   * The action's intent when the caller resolves it from more than the code (Strategy: its step's class
   * under the live decision; Budget: its decision type). Every caller supplies a code or an intent
   * (src/__tests__/governance/owner-action-gate-callers.test.ts).
   */
  intent?: OwnerTargetIntent | null;
}

/** An allowed transition's assessment, for the caller to record after its mutation succeeds. */
export interface OwnerGateAssessment {
  workspaceId: string;
  businessId: string | null;
  actionId: string;
  domain: string;
  toStatus: string;
  /** Data needed to assess margin (Owner-mode abstention); null when margin was assessed or not relevant. */
  marginAbstention: readonly string[] | null;
}

/** The action's intent as the gate and the canonical decision classify it (null ⇒ unknown). */
export function ownerActionGateIntent(input: Pick<OwnerActionGateInput, "intent" | "findingCode">): OwnerTargetIntent | null {
  return input.intent ?? (input.findingCode ? ownerFindingIntent(input.findingCode) : null);
}

/**
 * Enforce the owner-mode safety gate on a material action transition. Non-material transitions
 * (assigned/blocked/cancelled) and an active audited opt-out pass. Throws ConflictError (governed) on a
 * safety block. Returns the assessment of an allowed transition.
 */
export async function enforceOwnerActionGates(input: OwnerActionGateInput, injected?: OwnerActionGateDeps): Promise<OwnerGateAssessment> {
  const allowed = (marginAbstention: readonly string[] | null): OwnerGateAssessment => ({
    workspaceId: input.workspaceId, businessId: input.businessId, actionId: input.actionId, domain: input.domain, toStatus: input.toStatus, marginAbstention,
  });
  if (!MATERIAL_ACTION_STATUSES.has(input.toStatus)) return allowed(null);
  const constraints = await loadOwnerGateConstraints(input.workspaceId, input.businessId, injected);
  const verdict = evaluateOwnerActionGate(constraints, { domain: input.domain, intent: ownerActionGateIntent(input), findingId: input.findingId ?? null });
  if (!verdict.allowed) {
    await emitAuditEvent({
      workspaceId: input.workspaceId,
      eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED,
      actorType: "system",
      entityType: "owner_action",
      entityId: input.actionId,
      payload: { domain: input.domain, businessId: input.businessId, toStatus: input.toStatus, code: verdict.code, errorName: "OwnerActionGateError" },
    });
    throw new ConflictError(verdict.reason);
  }
  return allowed(verdict.marginAbstention);
}

/**
 * Record an allowed transition's Owner-mode margin abstention. Called by the action service AFTER its
 * update is validated and saved, alongside its own update audit — never before the write.
 */
export async function recordOwnerGateAssessment(assessment: OwnerGateAssessment): Promise<void> {
  if (!assessment.marginAbstention) return;
  await emitAuditEvent({
    workspaceId: assessment.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_GATE_ASSESSMENT_ABSTAINED,
    actorType: "system",
    entityType: "owner_action",
    entityId: assessment.actionId,
    payload: {
      domain: assessment.domain,
      businessId: assessment.businessId,
      toStatus: assessment.toStatus,
      code: OWNER_MARGIN_ABSTENTION_CODE,
      requiredData: assessment.marginAbstention,
    },
  });
}
