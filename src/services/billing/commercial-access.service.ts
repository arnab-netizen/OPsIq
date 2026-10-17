/**
 * Commercial access: owner-visible billing status + the single paywall decision.
 *
 * Paywall point (product-architecture choice): owners may sign up, onboard, and receive the first
 * diagnosis / first-value read-outs WITHOUT paying. Payment is required to continue GOVERNED
 * EXECUTION — resolving owner approvals — which is the step that turns diagnosis into ongoing
 * governed intervention. See docs/opsiq/commercial/COMMERCIAL_MINIMUM.md.
 *
 * Enforcement is controlled by BILLING_PAYWALL_ENFORCEMENT ("on" | anything else = off). It is OFF
 * by default so existing/invited owners (incl. the live CB1-001 trial) are never affected until a
 * separately authorized OPEN_BETA switch. When ON the decision is fail closed: no subscription,
 * a status outside the paid/grace policy (see resolveAccess), or a lookup error → not entitled.
 */
import { db } from "@/lib/db";
import { PlanLimitError } from "@/infra/errors";
import { commercialStateFromStatus, resolveAccess, type AccessLevel, type CommercialState } from "@/domain/billing/paddle";
import { isPaddleConfigured, resolvePaddleEnvironment } from "@/services/billing/paddle-client";

export function isPaywallEnforced(): boolean {
  return process.env.BILLING_PAYWALL_ENFORCEMENT === "on";
}

export interface BillingStatusDTO {
  provider: "paddle";
  providerEnvironment: "sandbox" | "production";
  checkoutAvailable: boolean;
  paywallEnforced: boolean;
  state: CommercialState;
  entitled: boolean;
  access: AccessLevel;
  paymentProblem: boolean;
  graceEndsAt: string | null;
  canUpdatePaymentMethod: boolean;
  planName: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export async function getBillingStatus(workspaceId: string): Promise<BillingStatusDTO> {
  const sub = await db.subscription.findFirst({
    where: { billingAccount: { workspaceId } },
    select: {
      status: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      plan: { select: { name: true } },
    },
  });
  const decision = resolveAccess(sub);
  return {
    provider: "paddle",
    providerEnvironment: resolvePaddleEnvironment(),
    checkoutAvailable: isPaddleConfigured(),
    paywallEnforced: isPaywallEnforced(),
    state: commercialStateFromStatus(sub?.status),
    entitled: decision.entitled,
    access: decision.access,
    paymentProblem: decision.paymentProblem,
    graceEndsAt: decision.graceEndsAt ? decision.graceEndsAt.toISOString() : null,
    canUpdatePaymentMethod: sub?.status === "past_due" || sub?.status === "active",
    planName: sub?.plan?.name ?? null,
    currentPeriodEnd: sub ? sub.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
  };
}

/** Throws PlanLimitError (HTTP 402) when the paywall is enforced and the workspace is not entitled. */
export async function assertCommercialAccess(workspaceId: string): Promise<void> {
  if (!isPaywallEnforced()) return;
  let entitled = false;
  try {
    const sub = await db.subscription.findFirst({
      where: { billingAccount: { workspaceId } },
      select: { status: true, currentPeriodEnd: true },
    });
    entitled = resolveAccess(sub).entitled;
  } catch {
    entitled = false; // fail closed on lookup failure
  }
  if (!entitled) {
    throw new PlanLimitError("governed_execution", "An active subscription is required to continue governed execution");
  }
}
