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
 * (no new gate engine).
 *
 * The capacity, cash and margin limits protect against SCALING into danger, so they apply by the
 * action's INTENT (ownerFindingIntent — the same intent the canonical owner decision uses), not by its
 * domain: a GROW step is held back while capacity, cash or margin is unsafe; a SAFETY / STABILISE /
 * REPAIR / EVIDENCE step is the response to that danger and is never blocked by it (the canonical main
 * target is never refused by the gate that exists because of it). An action whose intent is unknown
 * (no finding code) or EXECUTE keeps its domain's sensitivity (fail safe).
 */

import { ConflictError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { resolveOwnerGateMode, type PolicyDeps } from "@/services/owner-mode/gate-enforcement-policy";
import { assessFleetCapacity, type EquipmentRecord } from "@/domain/owner-mode/equipment-capacity";
import {
  evaluateCashSafetyGate,
  type FinancialHealthState,
} from "@/domain/owner-finance/cash-safety-gate";
import { evaluateMarginSafety, grossMarginPctFrom, DEFAULT_MARGIN_FLOOR_PCT, MarginSafetyOutcome } from "@/domain/owner-finance/margin-safety-gate";

/**
 * Owner-mode only: the code recorded when an owner's own GROW (or unknown-intent) action advances while
 * its business's margin cannot be assessed. The shared margin gate's contract is unchanged (unknown margin
 * does not block; deferred to the input-quality path) — Consulting Mode never sees this.
 */
export const OWNER_MARGIN_ABSTENTION_CODE = "CANNOT_ASSESS_MARGIN_SAFETY";
/** What an owner business must supply for its margin to be assessed. */
export const OWNER_MARGIN_REQUIRED_DATA: readonly string[] = [
  "current revenue for this business (latest financial snapshot)",
  "current cost of goods sold for this business (latest financial snapshot)",
];
import { RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";
import { isExpired } from "@/domain/owner-mode/compliance-boundary";
import { currentEffectiveFinancialSnapshotQuery, type CurrentEffectiveSnapshotQuery } from "@/services/owner-finance/financial-snapshot-selection";
import { ownerFindingIntent, type OwnerTargetIntent } from "@/domain/owner-spine/owner-imperatives";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER } from "@/services/owner-spine/current-diagnosis-cycle";
import { currentCashFinanceReading } from "@/services/owner-spine/current-cash-finance-reading";

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
      where: Record<string, unknown>;
      orderBy: { createdAt: "desc" };
    }): Promise<{ changedContextExplanation: string | null } | null>;
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
    findMany(args: { where: Record<string, unknown>; select: { kind: true; name: true; expiresAt: true } }): Promise<Array<{ kind: string; name: string; expiresAt: Date | null }>>;
  };
}

/**
 * Business-scoped where (H1/H2 isolation): match rows for THIS business OR workspace-wide
 * (null business), so one business's data never blocks another. Falls back to workspace-only
 * when no businessId is supplied.
 */
function bizScope(workspaceId: string, businessId: string | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return businessId
    ? { workspaceId, OR: [{ businessId }, { businessId: null }], ...extra }
    : { workspaceId, ...extra };
}

/** Domains where pushing an action while gross margin is below the floor scales a loss.
 *  (Pricing/growth concentrate in sales/marketing; finance actions are not inherently pricing — L3.) */
const MARGIN_SENSITIVE_DOMAINS: ReadonlySet<string> = new Set(["sales", "marketing"]);

/** Map an owner domain to the recommendation sensitivity the cash gate keys on. */
const DOMAIN_SENSITIVITY: Record<string, RecommendationSensitivity> = {
  finance: RecommendationSensitivity.FINANCE_SENSITIVE,
  cashflow: RecommendationSensitivity.FINANCE_SENSITIVE,
  marketing: RecommendationSensitivity.GROWTH_SENSITIVE,
  sales: RecommendationSensitivity.GROWTH_SENSITIVE,
  strategy: RecommendationSensitivity.GROWTH_SENSITIVE,
  operations: RecommendationSensitivity.GROWTH_SENSITIVE,
  sop: RecommendationSensitivity.GENERAL,
};

/** Intents that respond to a danger: never held back by the growth limits (capacity, cash, margin). */
const PROTECTIVE_INTENTS: ReadonlySet<OwnerTargetIntent> = new Set(["SAFETY", "STABILISE", "REPAIR", "EVIDENCE"]);

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
  /** The action's finding code — decides its intent (null when the action carries none). */
  findingCode?: string | null;
  /**
   * The action's intent when the caller resolves it from more than the code (Strategy: its step's class
   * under the live decision, ownerStrategyStepIntent — the same class the canonical decision uses).
   */
  intent?: OwnerTargetIntent | null;
}

async function block(input: OwnerActionGateInput, reason: string, code: string): Promise<never> {
  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED,
    actorType: "system",
    entityType: "owner_action",
    entityId: input.actionId,
    payload: { domain: input.domain, businessId: input.businessId, toStatus: input.toStatus, code, errorName: "OwnerActionGateError" },
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
    where: bizScope(input.workspaceId, input.businessId, { memoryKey: { in: [`scope:${input.domain}`] }, blocksRepetition: true, active: true }),
    orderBy: { createdAt: "desc" },
  });
  if (rule && !(rule.changedContextExplanation && rule.changedContextExplanation.trim())) {
    await block(input, `This ${input.domain} action repeats a decision marked do-not-repeat. Provide a changed-context reason to override.`, "DO_NOT_REPEAT_BLOCKED");
  }

  // The growth limits below apply by intent: a protective step (the response to the danger) is never
  // held back by them; unknown intent keeps the domain's sensitivity.
  // No intent and no finding code (e.g. a legacy or budget action): the domain's sensitivity applies.
  const intent: OwnerTargetIntent | null = input.intent ?? (input.findingCode ? ownerFindingIntent(input.findingCode) : null);
  const protective = intent !== null && PROTECTIVE_INTENTS.has(intent);
  const growth = intent === "GROW";

  // 2. Capacity for growth-sensitive domains (don't act on growth while capacity is unsafe).
  if (!protective && CAPACITY_SENSITIVE_DOMAINS.has(input.domain)) {
    const fleet = await deps.db.ownerEquipment.findMany({
      where: bizScope(input.workspaceId, input.businessId),
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

  // 3. Cash safety — block growth while cash is at-risk, and finance/spend actions while cash is
  //    critical, on the ONE current cash/finance reading (current-cash-finance-reading.ts: the current
  //    diagnosis cycles, arbitrated by evidence period; an amended-but-undiagnosed unsafe Finance
  //    reading still counts until it is re-diagnosed). No reading at all → nothing to enforce.
  let marginAbstention: string[] | null = null;
  if (input.businessId && !protective) {
    const sensitivity = growth ? RecommendationSensitivity.GROWTH_SENSITIVE : DOMAIN_SENSITIVITY[input.domain] ?? RecommendationSensitivity.GENERAL;
    const scope = { workspaceId: input.workspaceId, businessId: input.businessId };
    const [finCycle, cashCycle] = await Promise.all([
      deps.db.ownerFinanceCycle.findFirst({ where: scope, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { survivalState: true, snapshot: { select: { periodEnd: true, supersededById: true } } } }),
      deps.db.ownerCashflowCycle.findFirst({ where: scope, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { cashflowState: true, snapshot: { select: { periodEnd: true } } } }),
    ]);
    const reading = currentCashFinanceReading(
      cashCycle ? { state: cashCycle.cashflowState, snapshot: cashCycle.snapshot } : null,
      finCycle ? { state: finCycle.survivalState, snapshot: finCycle.snapshot } : null,
      now.getTime()
    );
    if (reading.gateState) {
      const state = reading.gateState as FinancialHealthState;
      const result = evaluateCashSafetyGate(state, state, sensitivity);
      if (!result.allowed) {
        const basis = reading.conflicting
          ? " (Cash flow and Finance disagree and neither is more current; the worse reading applies until they are reconciled)"
          : reading.financeAmendedLastKnown && !reading.financeState
            ? " (the last Finance diagnosis, whose figures were amended since; re-run the Finance diagnosis)"
            : "";
        await block(input, `${result.reason}${basis} Resolve cash/finance survival before advancing this ${input.domain} action.`, "CASH_SAFETY_BLOCKED");
      }
    }

    // 4. Margin safety — for pricing/growth-relevant domains, block when KNOWN gross margin
    //    is below the floor (scaling a money-losing operation), reusing evaluateMarginSafety.
    //    This gate stops advancing an owner's own action on a PROVEN loss. An unknown margin is
    //    not claimed as a loss (the shared gate's contract: unknown → not blocked, deferred to the
    //    input-quality path) — it would otherwise freeze every sales/marketing action of a business
    //    without cost-of-goods figures — but for an owner GROW (or unknown-intent) action the
    //    Owner-mode abstention is RECORDED with the data it needs (OWNER_MARGIN_ABSTENTION_CODE),
    //    never a silent pass, once the transition passes every check.
    if (MARGIN_SENSITIVE_DOMAINS.has(input.domain)) {
      const snap = await deps.db.ownerFinancialSnapshot.findFirst(
        currentEffectiveFinancialSnapshotQuery({ workspaceId: input.workspaceId, businessId: input.businessId }, { revenue: true, costOfGoods: true })
      );
      const grossMargin = grossMarginPctFrom(snap?.revenue ?? null, snap?.costOfGoods ?? null);
      const margin = evaluateMarginSafety(grossMargin, RecommendationSensitivity.PRICING_SENSITIVE, DEFAULT_MARGIN_FLOOR_PCT);
      if (margin.outcome === MarginSafetyOutcome.BLOCKED_BELOW_FLOOR) {
        await block(input, `${margin.reason} Restore margin above the floor before advancing this ${input.domain} action.`, "MARGIN_SAFETY_BLOCKED");
      }
      if (grossMargin === null) marginAbstention = [...OWNER_MARGIN_REQUIRED_DATA];
    }
  }

  // 5. Compliance boundary (EH-20) — an EXPIRED licence/permit/insurance/tax item is a
  //    professional-review hard stop: defer material actions until it is renewed. (Owner
  //    may override via the audited gate opt-out.) Reuses the pure isExpired rule.
  const complianceItems = await deps.db.ownerComplianceItem.findMany({
    where: bizScope(input.workspaceId, input.businessId, { status: "active" }),
    select: { kind: true, name: true, expiresAt: true },
  });
  const expired = complianceItems.find((c) => isExpired(c.expiresAt, now));
  if (expired) {
    await block(
      input,
      `Professional-review required: "${expired.name}" (${expired.kind}) is expired. Renew it (or seek professional review) before advancing this ${input.domain} action.`,
      "COMPLIANCE_BLOCKED"
    );
  }

  // Every check passed: record the margin abstention for this (allowed) transition.
  if (marginAbstention) {
    await emitAuditEvent({
      workspaceId: input.workspaceId,
      eventName: AUDIT_EVENTS.OWNER_GATE_ASSESSMENT_ABSTAINED,
      actorType: "system",
      entityType: "owner_action",
      entityId: input.actionId,
      payload: {
        domain: input.domain,
        businessId: input.businessId,
        toStatus: input.toStatus,
        code: OWNER_MARGIN_ABSTENTION_CODE,
        requiredData: marginAbstention,
      },
    });
  }
}
