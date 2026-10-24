/**
 * Central commercial policy: the single place that answers "may this workspace do X right now?".
 *
 * Callers ask for a CAPABILITY (see domain/commercial); nothing here knows about Paddle checkout
 * mechanics beyond reading the persisted subscription through the existing resolveAccess policy.
 *
 * Kill switch: BILLING_PAYWALL_ENFORCEMENT (exactly "on" = enforced). OFF = every call allows and
 * performs NO database work, so behaviour with the switch off is identical to before this module.
 * ON = fail closed: unverifiable entitlement denies.
 *
 * Denials are PlanLimitError (HTTP 402, code PLAN_LIMIT_EXCEEDED, details.capability) so every
 * surface receives the same controlled commercial response, never a raw 500.
 *
 * First-diagnosis invariant (no schema change): the workspace has used its free diagnosis iff at
 * least one diagnosis cycle row exists, in ANY of the eight per-domain cycle tables, for ANY of its
 * businesses, or a Startup Mode analysis row exists (one allowance shared by every mode). Inside the diagnosis writers the check runs in the same transaction as the cycle insert
 * and under a workspace-scoped advisory lock, so two concurrent first diagnoses (even in different
 * domains or businesses) serialize and exactly one is free.
 */
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { PlanLimitError } from "@/infra/errors";
import { resolveAccess } from "@/domain/billing/paddle";
import {
  COMMERCIAL_CAPABILITIES,
  COMMERCIAL_DENIAL_MESSAGES,
  decideCommercialCapability,
  diagnosisCapabilityFor,
  type CommercialCapability,
  type CommercialDecision,
} from "@/domain/commercial/commercial-capability";

export function isPaywallEnforced(): boolean {
  return process.env.BILLING_PAYWALL_ENFORCEMENT === "on";
}

type Reader = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw" | "subscription">;

async function readEntitlement(reader: Reader, workspaceId: string): Promise<boolean | null> {
  try {
    const sub = await reader.subscription.findFirst({
      where: { billingAccount: { workspaceId } },
      select: { status: true, currentPeriodEnd: true },
    });
    return resolveAccess(sub).entitled;
  } catch {
    return null;
  }
}

/**
 * True iff the workspace already consumed its one free diagnosis: at least one persisted diagnosis cycle in any of the
 * eight owner domains, or at least one persisted Startup Mode analysis (screening, hypotheses, economic model,
 * readiness assessment, system recommendation). Workspace-scoped and shared across all modes.
 */
export async function workspaceHasDiagnosis(reader: Pick<Prisma.TransactionClient, "$queryRaw">, workspaceId: string): Promise<boolean> {
  const rows = await reader.$queryRaw<Array<{ used: boolean }>>`
    SELECT (
      EXISTS (SELECT 1 FROM recovery_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_finance_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_cashflow_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_sales_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_operations_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_sop_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_marketing_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_strategy_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM startup_idea_record r WHERE r.workspace_id = ${workspaceId}::uuid AND r.screening_data IS NOT NULL)
      OR EXISTS (SELECT 1 FROM startup_hypothesis r WHERE r.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM startup_economic_model r WHERE r.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM startup_readiness_assessment r WHERE r.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM startup_system_recommendation r WHERE r.workspace_id = ${workspaceId}::uuid)
    ) AS used`;
  return rows[0]?.used === true;
}

function deny(decision: Extract<CommercialDecision, { allowed: false }>, capability: CommercialCapability): never {
  throw new PlanLimitError(capability, COMMERCIAL_DENIAL_MESSAGES[decision.reason]);
}

/**
 * Non-throwing form: may this workspace perform this capability now? Uses the workspace's persisted
 * diagnosis state for FIRST_DIAGNOSIS. Prefer assertCommercialCapability at enforcement points.
 */
export async function canPerformCommercialCapability(
  workspaceId: string,
  capability: CommercialCapability,
): Promise<CommercialDecision> {
  if (!isPaywallEnforced()) return { allowed: true, reason: "not_enforced" };
  const entitled = await readEntitlement(db, workspaceId);
  if (entitled === null) return { allowed: false, reason: "entitlement_unverifiable" };
  let priorDiagnosisCount = 0;
  if (!entitled && capability === COMMERCIAL_CAPABILITIES.FIRST_DIAGNOSIS) {
    try {
      priorDiagnosisCount = (await workspaceHasDiagnosis(db, workspaceId)) ? 1 : 0;
    } catch {
      return { allowed: false, reason: "entitlement_unverifiable" };
    }
  }
  return decideCommercialCapability({ capability, enforced: true, entitled, priorDiagnosisCount });
}

/** Throws PlanLimitError (402) when the capability is not permitted. No-op when the switch is OFF. */
export async function assertCommercialCapability(workspaceId: string, capability: CommercialCapability): Promise<void> {
  const decision = await canPerformCommercialCapability(workspaceId, capability);
  if (!decision.allowed) deny(decision, capability);
}

/**
 * Race-safe diagnosis gate. Call INSIDE the transaction that inserts the cycle, before the insert.
 * Takes a workspace-scoped advisory lock so concurrent first diagnoses serialize; the second one sees
 * the first one's committed row and is treated as a subsequent (paid) diagnosis.
 * OFF = returns immediately without any query.
 */
export async function assertDiagnosisAllowance(tx: Prisma.TransactionClient, workspaceId: string): Promise<void> {
  if (!isPaywallEnforced()) return;
  const entitled = await readEntitlement(tx, workspaceId);
  if (entitled === null) deny({ allowed: false, reason: "entitlement_unverifiable" }, COMMERCIAL_CAPABILITIES.SUBSEQUENT_DIAGNOSIS);
  if (entitled) return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"commercial_first_diagnosis:" + workspaceId}))`;
  const used = await workspaceHasDiagnosis(tx, workspaceId);
  const capability = diagnosisCapabilityFor(used ? 1 : 0);
  const decision = decideCommercialCapability({ capability, enforced: true, entitled: false, priorDiagnosisCount: used ? 1 : 0 });
  if (!decision.allowed) deny(decision, capability);
}

/**
 * Persisted state of the workspace's Startup free-journey question, derived only from rows (no flags, no counters):
 *  - ownerDiagnosisExists: an owner-domain diagnosis cycle already consumed the workspace's one free diagnosis;
 *  - otherSessionHasAnalysis: a DIFFERENT Startup session already holds qualifying analysis (it is the free journey);
 *  - sessionDeliveredRecommendation: THIS session already produced its first system recommendation (free value delivered).
 */
export interface StartupJourneyState {
  ownerDiagnosisExists: boolean;
  otherSessionHasAnalysis: boolean;
  sessionDeliveredRecommendation: boolean;
}

export async function readStartupJourneyState(
  reader: Pick<Prisma.TransactionClient, "$queryRaw">,
  workspaceId: string,
  sessionId: string,
): Promise<StartupJourneyState> {
  const rows = await reader.$queryRaw<Array<{ owner_cycle: boolean; other_session: boolean; delivered: boolean }>>`
    SELECT (
      EXISTS (SELECT 1 FROM recovery_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_finance_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_cashflow_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_sales_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_operations_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_sop_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_marketing_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
      OR EXISTS (SELECT 1 FROM owner_strategy_cycles c JOIN owner_businesses b ON b.id = c.business_id WHERE b.workspace_id = ${workspaceId}::uuid)
    ) AS owner_cycle,
    (
      EXISTS (SELECT 1 FROM startup_idea_record r WHERE r.workspace_id = ${workspaceId}::uuid AND r.session_id <> ${sessionId}::uuid AND r.screening_data IS NOT NULL)
      OR EXISTS (SELECT 1 FROM startup_hypothesis r WHERE r.workspace_id = ${workspaceId}::uuid AND r.session_id <> ${sessionId}::uuid)
      OR EXISTS (SELECT 1 FROM startup_economic_model r WHERE r.workspace_id = ${workspaceId}::uuid AND r.session_id <> ${sessionId}::uuid)
      OR EXISTS (SELECT 1 FROM startup_readiness_assessment r WHERE r.workspace_id = ${workspaceId}::uuid AND r.session_id <> ${sessionId}::uuid)
      OR EXISTS (SELECT 1 FROM startup_system_recommendation r WHERE r.workspace_id = ${workspaceId}::uuid AND r.session_id <> ${sessionId}::uuid)
    ) AS other_session,
    EXISTS (SELECT 1 FROM startup_system_recommendation r WHERE r.workspace_id = ${workspaceId}::uuid AND r.session_id = ${sessionId}::uuid) AS delivered`;
  const row = rows[0];
  return { ownerDiagnosisExists: row?.owner_cycle === true, otherSessionHasAnalysis: row?.other_session === true, sessionDeliveredRecommendation: row?.delivered === true };
}

/** Pure rule: may this Startup session's analysis step run free? Otherwise it is paid continuation. */
export function startupSessionIsFreeJourney(state: StartupJourneyState): boolean {
  return !state.ownerDiagnosisExists && !state.otherSessionHasAnalysis && !state.sessionDeliveredRecommendation;
}

/**
 * Startup Mode gate. The workspace's single free diagnosis may be ONE whole Startup diagnostic session, from its
 * first analysis step through its first system recommendation; it is never "one request" and never a second
 * allowance. Server-authoritative from persisted rows, serialized with the owner diagnosis writers by the same
 * workspace advisory lock, so concurrent sessions (or a Startup session racing an owner diagnosis) cannot both
 * become free. The first session to persist analysis is the designated free session; abandoning it does not mint
 * another (a different session is then paid continuation). Call INSIDE the persisting transaction, before the
 * write. OFF = returns immediately with no query.
 */
export async function assertStartupAnalysisAllowance(tx: Prisma.TransactionClient, workspaceId: string, sessionId: string): Promise<void> {
  if (!isPaywallEnforced()) return;
  const entitled = await readEntitlement(tx, workspaceId);
  if (entitled === null) deny({ allowed: false, reason: "entitlement_unverifiable" }, COMMERCIAL_CAPABILITIES.SUBSEQUENT_DIAGNOSIS);
  if (entitled) return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"commercial_first_diagnosis:" + workspaceId}))`;
  const state = await readStartupJourneyState(tx, workspaceId, sessionId);
  if (startupSessionIsFreeJourney(state)) return;
  deny({ allowed: false, reason: "first_diagnosis_used" }, COMMERCIAL_CAPABILITIES.SUBSEQUENT_DIAGNOSIS);
}

