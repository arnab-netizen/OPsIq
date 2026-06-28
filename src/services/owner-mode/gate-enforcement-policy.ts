/**
 * Jarvis 360 Slice 0 — central owner safety-gate enforcement policy.
 *
 * Audit finding: the cash-safety, input-quality, business-impact and confidence
 * gates were opt-in (only enforced when `requireBusinessImpactAssessment === true`),
 * so default deployments promoted growth/spend recommendations on weak data and
 * unsafe cash. This module makes those existing gates DEFAULT-ON and routes the
 * recommendation-promotion path through a single helper, while still allowing an
 * explicit, audited owner OPT-OUT (never silent).
 *
 * Reuse: this does NOT add a new gate engine. It orchestrates the four existing,
 * proven promotion gates (enforce*ForPromotion) and chooses their strictness.
 *
 * Three modes (resolveOwnerGateMode):
 *   - OPTED_OUT  : an active, audited owner opt-out exists → skip enforcement.
 *   - STRICT     : legacy `requireBusinessImpactAssessment === true` → full
 *                  fail-closed (missing input-quality assessment ⇒ critical_missing).
 *   - DEFAULT_ON : the new default → enforce, but when no input-quality assessment
 *                  exists treat it as `data_limited` so MATERIAL (sensitive) recs are
 *                  blocked/downgraded while low-risk GENERAL recs proceed with caution.
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { enforceBusinessImpactForPromotion } from "@/services/business-impact/recommendation-business-impact.service";
import { enforceInputQualityForPromotion } from "@/services/owner-mode/recommendation-input-quality.service";
import { enforceConfidenceForPromotion } from "@/services/decision-confidence/recommendation-confidence.service";
import { enforceCashSafetyForPromotion } from "@/services/owner-finance/recommendation-cash-safety.service";
import { enforceMarginSafetyForPromotion } from "@/services/owner-finance/recommendation-margin-safety.service";
import { enforceCapacitySafetyForPromotion } from "@/services/owner-mode/recommendation-capacity-safety.service";

export type OwnerGateMode = "OPTED_OUT" | "STRICT" | "DEFAULT_ON";

/** Risk classes an owner must attach to a gate opt-out (no silent opt-out). */
export const GATE_OPT_OUT_RISK_CLASSES = ["low", "medium", "high", "critical"] as const;
export type GateOptOutRiskClass = (typeof GATE_OPT_OUT_RISK_CLASSES)[number];

interface PolicyAccountRow {
  requireBusinessImpactAssessment: boolean;
  ownerGateOptOutAt: Date | null;
  ownerGateOptOutExpiresAt: Date | null;
}

interface PolicyDb {
  clientAccount: {
    findUnique(args: {
      where: { id: string };
      select: {
        requireBusinessImpactAssessment: true;
        ownerGateOptOutAt: true;
        ownerGateOptOutExpiresAt: true;
      };
    }): Promise<PolicyAccountRow | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

export interface PolicyDeps {
  db: PolicyDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<PolicyDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as PolicyDb };
}

/** True when an opt-out record is present and not past its expiry. */
function optOutActive(row: PolicyAccountRow | null, now: Date): boolean {
  if (!row?.ownerGateOptOutAt) return false;
  if (row.ownerGateOptOutExpiresAt && row.ownerGateOptOutExpiresAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

/** Resolve the enforcement mode for a workspace. Default is DEFAULT_ON. */
export async function resolveOwnerGateMode(workspaceId: string, injected?: PolicyDeps): Promise<OwnerGateMode> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const row = await deps.db.clientAccount.findUnique({
    where: { id: workspaceId },
    select: {
      requireBusinessImpactAssessment: true,
      ownerGateOptOutAt: true,
      ownerGateOptOutExpiresAt: true,
    },
  });
  if (optOutActive(row, now)) return "OPTED_OUT";
  if (row?.requireBusinessImpactAssessment === true) return "STRICT";
  return "DEFAULT_ON";
}

/** Convenience: whether gates run at all for this workspace. */
export async function shouldEnforceOwnerGates(workspaceId: string, injected?: PolicyDeps): Promise<boolean> {
  return (await resolveOwnerGateMode(workspaceId, injected)) !== "OPTED_OUT";
}

/**
 * Run all owner safety gates for a recommendation promotion using the resolved
 * mode. OPTED_OUT skips; STRICT/DEFAULT_ON enforce (DEFAULT_ON uses the softer
 * missing-input-quality default so only material recs are blocked on absent data).
 *
 * Each underlying gate is fail-closed and throws its own typed *GateError on block.
 */
export async function enforceOwnerGatesForPromotion(
  recommendationId: string,
  workspaceId: string,
  injected?: PolicyDeps
): Promise<void> {
  const mode = await resolveOwnerGateMode(workspaceId, injected);
  if (mode === "OPTED_OUT") return;

  const missingInputQualityDefault = mode === "STRICT" ? "critical_missing" : "data_limited";

  // Order mirrors the prior recommendation.ts promotion order. Any block throws a
  // typed *GateError; we record an auditable block event (Slice 1) then rethrow so
  // the caller's behavior is unchanged.
  try {
    await enforceBusinessImpactForPromotion(recommendationId, workspaceId);
    await enforceInputQualityForPromotion(recommendationId, workspaceId, undefined, missingInputQualityDefault);
    await enforceConfidenceForPromotion(recommendationId, workspaceId);
    await enforceCashSafetyForPromotion(recommendationId, workspaceId);
    // Slice 2: block pricing/discount recs when current gross margin is below floor.
    await enforceMarginSafetyForPromotion(recommendationId, workspaceId);
    // Slice 7: block growth recs when equipment capacity is saturated/down/overdue.
    await enforceCapacitySafetyForPromotion(recommendationId, workspaceId);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "GATE_BLOCKED";
    const message = err instanceof Error ? err.message : String(err);
    await emitAuditEvent({
      workspaceId,
      eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED,
      actorType: "system",
      entityType: "recommendation",
      entityId: recommendationId,
      payload: { code, message, mode },
    });
    throw err;
  }
}

/** Thrown when a non-owner attempts to record a gate opt-out. */
export class GateOptOutUnauthorizedError extends Error {
  readonly code = "GATE_OPT_OUT_UNAUTHORIZED";
  constructor() {
    super("Only an owner may opt a workspace out of safety-gate enforcement.");
    this.name = "GateOptOutUnauthorizedError";
  }
}

/** Thrown when a gate opt-out is attempted without a reason / valid risk class. */
export class GateOptOutInvalidError extends Error {
  readonly code = "GATE_OPT_OUT_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "GateOptOutInvalidError";
  }
}

export interface RecordGateOptOutInput {
  workspaceId: string;
  actorId: string;
  /** Must be true — resolved from the route's owner capability check. */
  actorIsOwner: boolean;
  reason: string;
  riskClass: GateOptOutRiskClass;
  /** Optional expiry; opt-out auto-reverts to enforcement after this time. */
  expiresAt?: Date;
}

/**
 * Record an explicit, audited owner opt-out from safety-gate enforcement.
 * Server-side authority + reason are mandatory; emits an audit event.
 */
export async function recordGateOptOut(input: RecordGateOptOutInput, injected?: PolicyDeps): Promise<void> {
  if (!input.actorIsOwner) throw new GateOptOutUnauthorizedError();
  const reason = (input.reason ?? "").trim();
  if (reason.length === 0) throw new GateOptOutInvalidError("A non-empty reason is required to opt out of safety gates.");
  if (!GATE_OPT_OUT_RISK_CLASSES.includes(input.riskClass)) {
    throw new GateOptOutInvalidError(`Invalid risk class '${input.riskClass}'.`);
  }
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();

  await deps.db.clientAccount.update({
    where: { id: input.workspaceId },
    data: {
      ownerGateOptOutAt: now,
      ownerGateOptOutReason: reason,
      ownerGateOptOutBy: input.actorId,
      ownerGateOptOutRisk: input.riskClass,
      ownerGateOptOutExpiresAt: input.expiresAt ?? null,
    },
  });

  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_GATE_OPT_OUT_RECORDED,
    actorId: input.actorId,
    actorType: "user",
    entityType: "workspace",
    entityId: input.workspaceId,
    payload: {
      reason,
      riskClass: input.riskClass,
      expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
    },
  });
}

/** Clear an active opt-out (re-enable enforcement). Owner-only; audited. */
export async function clearGateOptOut(
  input: { workspaceId: string; actorId: string; actorIsOwner: boolean },
  injected?: PolicyDeps
): Promise<void> {
  if (!input.actorIsOwner) throw new GateOptOutUnauthorizedError();
  const deps = injected ?? (await resolveDefaultDeps());
  await deps.db.clientAccount.update({
    where: { id: input.workspaceId },
    data: {
      ownerGateOptOutAt: null,
      ownerGateOptOutReason: null,
      ownerGateOptOutBy: null,
      ownerGateOptOutRisk: null,
      ownerGateOptOutExpiresAt: null,
    },
  });
  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_GATE_OPT_OUT_CLEARED,
    actorId: input.actorId,
    actorType: "user",
    entityType: "workspace",
    entityId: input.workspaceId,
  });
}
