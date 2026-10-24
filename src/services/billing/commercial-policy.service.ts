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
 * businesses. Inside the diagnosis writers the check runs in the same transaction as the cycle insert
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

/** True iff the workspace already owns at least one persisted diagnosis cycle in any domain. */
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
