/**
 * Authenticated checkout creation and cancellation for the single sellable plan.
 * Provider state is never mutated locally here — the verified webhook is the only authority.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { ValidationError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { isEntitledStatus, PADDLE_PROVIDER } from "@/domain/billing/paddle";
import {
  PaddleNotConfiguredError,
  cancelSubscriptionAtPeriodEnd,
  createCheckoutTransaction,
  resolvePaddlePriceId,
} from "@/services/billing/paddle-client";

export async function createCheckout(input: { workspaceId: string; actorId: string }): Promise<{ checkoutUrl: string }> {
  const priceId = resolvePaddlePriceId();
  if (!priceId || !process.env.PADDLE_API_KEY) throw new PaddleNotConfiguredError();

  const plan = await db.plan.findUnique({ where: { paddlePriceId: priceId }, select: { id: true, active: true } });
  if (!plan || !plan.active) throw new PaddleNotConfiguredError(); // plan row not seeded: fail closed

  const existing = await db.subscription.findFirst({
    where: { billingAccount: { workspaceId: input.workspaceId } },
    select: { status: true },
  });
  if (isEntitledStatus(existing?.status)) {
    throw new ValidationError("Workspace already has an active subscription");
  }

  const account = await db.billingAccount.upsert({
    where: { workspaceId: input.workspaceId },
    update: {},
    create: { id: randomUUID(), workspaceId: input.workspaceId, provider: PADDLE_PROVIDER, providerCustomerId: "" },
    select: { id: true, paddleCustomerId: true },
  });

  const txn = await createCheckoutTransaction({
    priceId,
    workspaceId: input.workspaceId,
    billingAccountId: account.id,
    customerId: account.paddleCustomerId,
  });
  const checkoutUrl = txn.checkout?.url;
  if (!checkoutUrl) throw new PaddleNotConfiguredError(); // provider has no default payment link configured

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.BILLING_CHECKOUT_CREATED,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    actorType: "user",
    entityType: "BillingAccount",
    entityId: account.id,
    payload: { transactionId: txn.id },
    visibility: "internal",
  });
  return { checkoutUrl };
}

export async function requestCancellation(input: { workspaceId: string; actorId: string }): Promise<{ requested: true }> {
  const sub = await db.subscription.findFirst({
    where: { billingAccount: { workspaceId: input.workspaceId } },
    select: { id: true, status: true, paddleSubscriptionId: true },
  });
  if (!sub?.paddleSubscriptionId || !isEntitledStatus(sub.status)) {
    throw new ValidationError("No active subscription to cancel");
  }
  await cancelSubscriptionAtPeriodEnd(sub.paddleSubscriptionId);
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.BILLING_CANCELLATION_REQUESTED,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    actorType: "user",
    entityType: "Subscription",
    entityId: sub.id,
    payload: { effective: "next_billing_period" },
    visibility: "internal",
  });
  return { requested: true };
}
