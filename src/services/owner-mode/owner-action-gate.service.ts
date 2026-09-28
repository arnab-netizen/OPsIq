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
  appliesToBusiness,
  CAPACITY_RECORD_FRESH_DAYS,
  capacityConstraint,
  evaluateOwnerActionGate,
  OUT_OF_DATE_EVIDENCE_CONFIDENCE,
  expiredComplianceFor,
  MATERIAL_ACTION_STATUSES,
  OWNER_MARGIN_ABSTENTION_CODE,
  type OwnerGateConstraints,
  type OwnerGateDoNotRepeatRule,
} from "@/domain/owner-mode/owner-action-gate-policy";
import { DNR_SCOPE_PREFIX, parseOwnerDnrKey } from "@/domain/owner-mode/do-not-repeat-scope";
import { currentEffectiveFinancialSnapshotQuery, type CurrentEffectiveSnapshotQuery } from "@/services/owner-finance/financial-snapshot-selection";
import { ownerFindingIntent, type OwnerTargetIntent } from "@/domain/owner-spine/owner-imperatives";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER, currentEvidenceWhere } from "@/services/owner-spine/current-diagnosis-cycle";
import { financeSurvivalDriver } from "@/domain/owner-spine/owner-decision";
import { currentCashFinanceReading } from "@/services/owner-spine/current-cash-finance-reading";
import { loadProvisionalCashFinance, type ProvisionalCashFinanceDb } from "@/services/owner-spine/provisional-cash-finance";
import { loadOwnerDnrOverrides, type DnrOwnerOverrideDb } from "@/services/owner-mode/do-not-repeat.service";

export { MATERIAL_ACTION_STATUSES, OWNER_MARGIN_ABSTENTION_CODE };

interface ActionGateDb extends ProvisionalCashFinanceDb, DnrOwnerOverrideDb {
  clientAccount: PolicyDeps["db"]["clientAccount"];
  ownerBusiness: {
    findMany(args: { where: { workspaceId: string; isActive: true; isFixtureBusiness: false }; select: { id: true }; take: number }): Promise<Array<{ id: string }>>;
  };
  ownerDoNotRepeatRule: {
    findMany(args: {
      where: Record<string, unknown>;
      select: { id: true; businessId: true; memoryKey: true; summary: true; reason: true; changedContextExplanation: true };
    }): Promise<Array<{ id: string; businessId: string | null; memoryKey: string; summary?: string; reason?: string; changedContextExplanation: string | null }>>;
  };
  ownerEquipment: {
    findMany(args: { where: Record<string, unknown>; select: Record<string, boolean> }): Promise<Array<EquipmentRecord & { name: string; businessId: string | null; updatedAt?: Date | null }>>;
  };
  ownerFinanceCycle: {
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER;
      select: Record<string, unknown>;
    }): Promise<{
      survivalState: string;
      dataConfidenceScore?: number | null;
      snapshot?: { periodStart?: Date; periodEnd: Date; supersededById: string | null } | null;
      findings?: Array<{ code: string; severity?: string }>;
    } | null>;
  };
  ownerCashflowCycle: {
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER;
      select: Record<string, unknown>;
    }): Promise<{ cashflowState: string; dataConfidenceScore?: number | null; snapshot?: { periodStart?: Date; periodEnd: Date } | null } | null>;
  };
  ownerFinancialSnapshot: {
    findFirst(args: CurrentEffectiveSnapshotQuery<{ revenue: true; costOfGoods: true; dataConfidenceScore: true; periodEnd: true }>): Promise<{ revenue: number | null; costOfGoods: number | null; dataConfidenceScore?: number | null; periodEnd?: Date | null } | null>;
  };
  ownerComplianceItem: {
    findMany(args: { where: Record<string, unknown>; select: { businessId: true; kind: true; name: true; expiresAt: true } }): Promise<Array<{ businessId: string | null; kind: string; name: string; expiresAt: Date | null }>>;
  };
}

/**
 * Business-scoped read (H1/H2 isolation): rows for THIS business OR recorded with no business; a
 * business-less row then applies only when this business is the workspace's sole real business
 * (appliesToBusiness) — one business's data never blocks another, and null never means "every business".
 */
function bizScope(workspaceId: string, businessId: string | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return businessId
    ? { workspaceId, OR: [{ businessId }, { businessId: null }], ...extra }
    : { workspaceId, ...extra };
}

/** A 0..100 data-confidence score as 0..1 (null when absent). */
function unitScore(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : null;
}

/**
 * Confidence in the margin figure (0..1, null ⇒ unknown): the snapshot's data confidence, capped at
 * OUT_OF_DATE_EVIDENCE_CONFIDENCE when its period ended more than the freshness window ago.
 */
export function marginConfidence(snap: { dataConfidenceScore?: number | null; periodEnd?: Date | null } | null, now: Date): number | null {
  const base = unitScore(snap?.dataConfidenceScore);
  const end = snap?.periodEnd instanceof Date ? snap.periodEnd.getTime() : null;
  const outOfDate = end === null || now.getTime() - end > CAPACITY_RECORD_FRESH_DAYS * 86_400_000;
  if (!outOfDate) return base;
  return base === null ? OUT_OF_DATE_EVIDENCE_CONFIDENCE : Math.min(base, OUT_OF_DATE_EVIDENCE_CONFIDENCE);
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
  // Current evidence only: a period that has not ended by `now` is never the current reading.
  const cycleWhere = scope ? { ...scope, ...currentEvidenceWhere(now) } : null;
  const [rules, fleet, finCycle, cashCycle, snap, complianceItems, realBusinesses, provisional, overrides] = await Promise.all([
    deps.db.ownerDoNotRepeatRule.findMany({
      where: bizScope(workspaceId, businessId, { memoryKey: { startsWith: DNR_SCOPE_PREFIX }, blocksRepetition: true, active: true }),
      select: { id: true, businessId: true, memoryKey: true, summary: true, reason: true, changedContextExplanation: true },
    }),
    deps.db.ownerEquipment.findMany({
      where: bizScope(workspaceId, businessId),
      select: { name: true, businessId: true, utilization: true, downtimeState: true, maintenanceDueAt: true, status: true, updatedAt: true },
    }),
    cycleWhere
      ? deps.db.ownerFinanceCycle.findFirst({
          where: cycleWhere,
          orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER,
          select: {
            survivalState: true, dataConfidenceScore: true,
            snapshot: { select: { periodStart: true, periodEnd: true, supersededById: true } },
            findings: { select: { code: true, severity: true } },
          },
        })
      : Promise.resolve(null),
    cycleWhere
      ? deps.db.ownerCashflowCycle.findFirst({
          where: cycleWhere,
          orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER,
          select: { cashflowState: true, dataConfidenceScore: true, snapshot: { select: { periodStart: true, periodEnd: true } } },
        })
      : Promise.resolve(null),
    scope
      ? deps.db.ownerFinancialSnapshot.findFirst(currentEffectiveFinancialSnapshotQuery(scope, { revenue: true, costOfGoods: true, dataConfidenceScore: true, periodEnd: true }, now))
      : Promise.resolve(null),
    deps.db.ownerComplianceItem.findMany({
      where: bizScope(workspaceId, businessId, { status: "active" }),
      select: { businessId: true, kind: true, name: true, expiresAt: true },
    }),
    deps.db.ownerBusiness.findMany({ where: { workspaceId, isActive: true, isFixtureBusiness: false }, select: { id: true }, take: 2 }),
    // The in-progress current period (provisional): may only tighten the cash/finance state.
    scope ? loadProvisionalCashFinance(deps.db, scope, now) : Promise.resolve(null),
    // This business's Owner overrides (Decision 3): lift a rule for Owner Mode of this business only.
    loadOwnerDnrOverrides(deps.db, workspaceId, businessId, now),
  ]);
  const soleRealBusinessId = realBusinesses.length === 1 ? realBusinesses[0].id : null;
  const applies = (rowBusinessId: string | null) => appliesToBusiness(rowBusinessId, businessId, soleRealBusinessId);

  // Do-not-repeat memories attributable to this business, parsed through the ONE scope taxonomy, minus those
  // lifted: by the rule's own recorded change, or by this business's Owner override (never another's).
  const doNotRepeat: OwnerGateDoNotRepeatRule[] = [];
  for (const r of rules) {
    if (!applies(r.businessId)) continue;
    if (r.changedContextExplanation && r.changedContextExplanation.trim()) continue;
    if (overrides.has(r.id)) continue;
    const parsed = parseOwnerDnrKey(r.memoryKey);
    if (parsed) doNotRepeat.push({ id: r.id, ...parsed, memoryKey: r.memoryKey, summary: r.summary ?? null, reason: r.reason ?? null });
  }

  // The ONE current cash/finance reading (current-cash-finance-reading.ts): the current diagnosis cycles,
  // arbitrated by evidence period; an amended-but-undiagnosed unsafe Finance reading still counts until
  // it is re-diagnosed; figures that are not current are never safe. No reading at all → nothing to enforce.
  const reading = currentCashFinanceReading(
    cashCycle ? { state: cashCycle.cashflowState, snapshot: cashCycle.snapshot, confidence: unitScore(cashCycle.dataConfidenceScore) } : null,
    finCycle
      ? { state: finCycle.survivalState, snapshot: finCycle.snapshot, driver: financeSurvivalDriver(finCycle.findings), confidence: unitScore(finCycle.dataConfidenceScore) }
      : null,
    now.getTime(),
    provisional
  );
  const basis = reading.conflicting && !reading.provisional
    ? " (Cash flow and Finance disagree and neither is more current; the worse reading applies until they are reconciled)"
    : "";

  return {
    optedOut: mode === "OPTED_OUT",
    businessScoped: businessId !== null,
    doNotRepeat,
    capacity: capacityConstraint(fleet.filter((e) => applies(e.businessId)), now),
    cash: {
      gateState: (reading.gateState as FinancialHealthState | null) ?? null,
      basis,
      driver: reading.gateDriver,
      confidence: reading.gateConfidence,
      provisional: reading.provisional,
      source: reading.gateSource,
    },
    grossMarginPct: grossMarginPctFrom(snap?.revenue ?? null, snap?.costOfGoods ?? null),
    grossMarginConfidence: marginConfidence(snap, now),
    expiredCompliance: expiredComplianceFor(complianceItems, businessId, soleRealBusinessId, now),
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
  const verdict = evaluateOwnerActionGate(constraints, { domain: input.domain, intent: ownerActionGateIntent(input), findingId: input.findingId ?? null, findingCode: input.findingCode ?? null });
  if (!verdict.allowed) {
    await emitAuditEvent({
      workspaceId: input.workspaceId,
      eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED,
      actorType: "system",
      entityType: "owner_action",
      entityId: input.actionId,
      payload: { domain: input.domain, businessId: input.businessId, toStatus: input.toStatus, code: verdict.code, codes: verdict.blocks.map((b) => b.code), errorName: "OwnerActionGateError" },
    });
    // The first failing check is enforced (deterministic); every other check that holds it is named too, so
    // clearing one never reveals a surprise second block.
    const others = verdict.blocks.slice(1).map((b) => b.reason);
    throw new ConflictError(others.length === 0 ? verdict.reason : `${verdict.reason} It is also held: ${others.join(" ")}`, { codes: verdict.blocks.map((b) => b.code) });
  }
  return allowed(verdict.marginAbstention);
}

/**
 * Record an allowed transition's Owner-mode margin abstention. Recorded with the action's own update, in the
 * same transaction (applyGuardedActionTransition) — never before the write, never without it.
 */
export async function recordOwnerGateAssessment(assessment: OwnerGateAssessment, tx?: Parameters<typeof emitAuditEvent>[1]): Promise<void> {
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
  }, tx);
}
