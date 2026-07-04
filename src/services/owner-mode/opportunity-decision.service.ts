/**
 * Jarvis 360 owner-flow closure (EH-17/EH-19) — live opportunity decision (DI).
 *
 * The opportunity/contract guardrail screens existed but were only reachable via
 * /api/owner/guardrails/screen with HAND-ENTERED capacity/margin. This runs the proven
 * screenOpportunity with the owner's REAL data: capacity derived from the live fleet and
 * margin from the latest financial snapshot. The owner supplies only the opportunity-
 * specific attributes (fit, payment risk). Returns a real accept/reject/defer verdict +
 * reasons + next action; audited. Reuses assessFleetCapacity + grossMarginPctFrom +
 * screenOpportunity (no new scoring engine).
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { assessFleetCapacity, type EquipmentRecord } from "@/domain/owner-mode/equipment-capacity";
import { grossMarginPctFrom, DEFAULT_MARGIN_FLOOR_PCT } from "@/domain/owner-finance/margin-safety-gate";
import { screenOpportunity, type ScreenVerdict } from "@/domain/owner-mode/opportunity-contract-guardrails";
import { buildOpportunityEnvelope, type OpportunityDecisionEnvelope } from "@/domain/owner-mode/opportunity-decision-envelope";

interface OppDb {
  ownerEquipment: { findMany(args: { where: Record<string, unknown>; select: Record<string, boolean> }): Promise<Array<EquipmentRecord & { name: string }>> };
  ownerFinancialSnapshot: { findFirst(args: { where: Record<string, unknown>; orderBy: { createdAt: "desc" }; select: { revenue: true; costOfGoods: true } }): Promise<{ revenue: number | null; costOfGoods: number | null } | null> };
}

export interface OpportunityDecisionDeps {
  db: OppDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<OpportunityDecisionDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as OppDb };
}

export interface DecideOpportunityInput {
  workspaceId: string;
  businessId: string;
  fitScore: number; // 0..1
  paymentRisk: "low" | "medium" | "high";
  /** Optional explicit margin (0..1); otherwise derived from the latest snapshot. */
  marginPct?: number | null;
  actorId?: string;
  /** What kind of opportunity this is (e.g. "B2B contract", "retention campaign"). */
  opportunityType?: string;
  /** Owner-supplied capital outlay for this move, if known. */
  estimatedCapitalOutlay?: number | null;
}

export interface OpportunityDecision {
  verdict: ScreenVerdict;
  reasons: string[];
  nextAction: string;
  derived: { capacityStatus: string; marginPct: number | null };
  /** Full owner-reviewable decision envelope (Wealth Standard). */
  envelope: OpportunityDecisionEnvelope;
}

const NEXT_ACTION: Record<ScreenVerdict, string> = {
  accept: "Proceed — pursue this opportunity.",
  defer: "Defer — revisit once the blocking condition clears.",
  reject: "Reject — do not pursue under current conditions.",
};

/** Decide an opportunity using the owner's live capacity + margin. Audited. */
export async function decideOpportunity(input: DecideOpportunityInput, injected?: OpportunityDecisionDeps): Promise<OpportunityDecision> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();

  // H2 — scope capacity + margin to THIS business (or workspace-wide), never another business's.
  const fleet = await deps.db.ownerEquipment.findMany({
    where: { workspaceId: input.workspaceId, OR: [{ businessId: input.businessId }, { businessId: null }] },
    select: { name: true, utilization: true, downtimeState: true, maintenanceDueAt: true, status: true },
  });
  const capacity = assessFleetCapacity(fleet, now);

  let marginPct = input.marginPct ?? null;
  if (marginPct == null) {
    const snap = await deps.db.ownerFinancialSnapshot.findFirst({
      where: { workspaceId: input.workspaceId, businessId: input.businessId },
      orderBy: { createdAt: "desc" },
      select: { revenue: true, costOfGoods: true },
    });
    const gm = grossMarginPctFrom(snap?.revenue ?? null, snap?.costOfGoods ?? null);
    marginPct = gm == null ? null : gm / 100; // screenOpportunity wants 0..1
  }

  const marginFloorPct = DEFAULT_MARGIN_FLOOR_PCT / 100;
  const result = screenOpportunity({
    fitScore: input.fitScore,
    marginPct,
    marginFloorPct,
    capacityStatus: capacity.status,
    paymentRisk: input.paymentRisk,
  });

  // Owner-decision envelope (Wealth Standard): confidence, missing-data disclosure,
  // cash/operational burden, owner-approval gate, first-test-action, success metric,
  // stop-loss, and reassessment trigger — deterministic, no fabricated ROI.
  const envelope = buildOpportunityEnvelope({
    opportunityType: input.opportunityType ?? "opportunity",
    screen: result,
    marginPct,
    marginFloorPct,
    capacityStatus: capacity.status,
    paymentRisk: input.paymentRisk,
    fitScore: input.fitScore,
    estimatedCapitalOutlay: input.estimatedCapitalOutlay ?? null,
  });

  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_OPPORTUNITY_DECIDED,
    actorId: input.actorId ?? undefined,
    actorType: input.actorId ? "user" : "system",
    entityType: "owner_opportunity",
    entityId: input.businessId,
    payload: {
      verdict: result.verdict,
      capacityStatus: capacity.status,
      marginPct,
      confidence: envelope.confidence,
      riskClass: envelope.riskClass,
      ownerApprovalRequired: envelope.ownerApprovalRequired,
    },
  });

  return { verdict: result.verdict, reasons: result.reasons, nextAction: NEXT_ACTION[result.verdict], derived: { capacityStatus: capacity.status, marginPct }, envelope };
}
