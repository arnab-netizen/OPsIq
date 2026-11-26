/**
 * Paddle webhook → local subscription state (the ONLY writer of Paddle-derived entitlement).
 *
 * Input is an already signature-verified, Zod-validated envelope (see the route). Guarantees:
 *  - Tenant scoped: workspace is resolved from persisted provider ids, or — for the very first
 *    event — from the server-set custom_data.workspaceId that must match a BillingAccount row our
 *    authenticated checkout created. A conflicting binding is REJECTED (never re-bound).
 *  - Order-agnostic: every subscription.* event is a full snapshot; an event older than the stored
 *    lastEventTimestamp is ignored (and audited), applied with a guarded updateMany so concurrent
 *    deliveries cannot move state backwards.
 *  - Unknown price id → rejected (fail closed). Transaction events are audited only.
 *  - Mutation + audit are atomic (one $transaction).
 * Duplicate delivery / retry state machine lives in the route via webhook.service helpers.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { PaddleApiError, cancelSubscriptionImmediately } from "@/services/billing/paddle-client";
import {
  PADDLE_PROVIDER,
  isPaddleSubscriptionEvent,
  isPaddleTransactionEvent,
  mapPaddleStatus,
  paddleSubscriptionDataSchema,
  paddleTransactionDataSchema,
  readWorkspaceIdFromCustomData,
  type PaddleEnvelope,
} from "@/domain/billing/paddle";

export type PaddleProcessOutcome = "applied" | "stale_ignored" | "audited" | "ignored";

export class PaddleEventRejectedError extends Error {
  constructor(
    public readonly reason: string,
    public readonly workspaceId?: string,
    /** Provider subscription that must be cancelled because it is an unwanted duplicate (second_live_subscription). */
    public readonly orphanSubscriptionId?: string,
  ) {
    super(`paddle event rejected: ${reason}`);
    this.name = "PaddleEventRejectedError";
  }
}

type Tx = Prisma.TransactionClient;

interface ResolveInput {
  paddleSubscriptionId?: string | null;
  customerId?: string | null;
  customData?: Record<string, unknown> | null;
}

/**
 * Paddle's client-side token is public, so anyone can open a checkout with arbitrary customData.
 * custom_data.workspaceId alone is therefore NOT proof of tenancy. The first binding of a provider
 * identity to a BillingAccount additionally requires custom_data.billingAccountId — an unguessable
 * UUID that only our authenticated, server-side checkout ever sends — to equal the account's id.
 */
function readBillingAccountId(customData: Record<string, unknown> | null | undefined): string | null {
  const raw = customData?.billingAccountId;
  return typeof raw === "string" ? raw.toLowerCase() : null;
}

async function resolveBillingAccount(tx: Tx, input: ResolveInput) {
  const claimedWorkspaceId = readWorkspaceIdFromCustomData(input.customData);
  let account = null as Awaited<ReturnType<Tx["billingAccount"]["findUnique"]>>;

  if (input.paddleSubscriptionId) {
    const sub = await tx.subscription.findUnique({
      where: { paddleSubscriptionId: input.paddleSubscriptionId },
      select: { billingAccountId: true },
    });
    if (sub) account = await tx.billingAccount.findUnique({ where: { id: sub.billingAccountId } });
  }
  if (!account && input.customerId) {
    account = await tx.billingAccount.findUnique({ where: { paddleCustomerId: input.customerId } });
  }
  if (!account && claimedWorkspaceId) {
    const candidate = await tx.billingAccount.findUnique({ where: { workspaceId: claimedWorkspaceId } });
    if (candidate && readBillingAccountId(input.customData) !== candidate.id.toLowerCase()) {
      // Workspace claim without the server-issued account id: forged/client-supplied binding.
      throw new PaddleEventRejectedError("unverified_binding", candidate.workspaceId);
    }
    account = candidate;
  }
  if (!account) return null;

  // Cross-tenant guards: provider-supplied claims must agree with the persisted binding.
  if (claimedWorkspaceId && claimedWorkspaceId !== account.workspaceId.toLowerCase()) {
    throw new PaddleEventRejectedError("tenant_mismatch", account.workspaceId);
  }
  if (input.customerId && account.paddleCustomerId && account.paddleCustomerId !== input.customerId) {
    throw new PaddleEventRejectedError("customer_mismatch", account.workspaceId);
  }
  return account;
}

async function applySubscriptionEvent(tx: Tx, envelope: PaddleEnvelope): Promise<PaddleProcessOutcome> {
  const parsed = paddleSubscriptionDataSchema.safeParse(envelope.data);
  if (!parsed.success) throw new PaddleEventRejectedError("invalid_subscription_payload");
  const data = parsed.data;
  const occurredAt = new Date(envelope.occurred_at);

  const account = await resolveBillingAccount(tx, {
    paddleSubscriptionId: data.id,
    customerId: data.customer_id,
    customData: data.custom_data,
  });
  if (!account) throw new PaddleEventRejectedError("unknown_tenant");

  const priceId = data.items[0].price.id;
  const plan = await tx.plan.findUnique({ where: { paddlePriceId: priceId }, select: { id: true } });
  if (!plan) throw new PaddleEventRejectedError("unknown_price", account.workspaceId);

  const existing = await tx.subscription.findUnique({ where: { billingAccountId: account.id } });
  // Any other non-canceled row (including a legacy row with no Paddle id) occupies the single slot.
  if (existing && existing.paddleSubscriptionId !== data.id && existing.status !== "canceled") {
    // A late event of the duplicate's own cancellation is harmless; anything else means the owner
    // paid twice and the extra provider subscription must be cancelled (done by the route).
    if (data.status === "canceled") return "ignored";
    throw new PaddleEventRejectedError("second_live_subscription", account.workspaceId, data.id);
  }

  const status = mapPaddleStatus(data.status);
  const periodStart = data.current_billing_period ? new Date(data.current_billing_period.starts_at) : (existing?.currentPeriodStart ?? occurredAt);
  const periodEnd = data.current_billing_period ? new Date(data.current_billing_period.ends_at) : (existing?.currentPeriodEnd ?? occurredAt);
  const cancelAtPeriodEnd = data.scheduled_change?.action === "cancel";
  const canceledAt = data.canceled_at ? new Date(data.canceled_at) : null;

  const values = {
    planId: plan.id,
    status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    canceledAt,
    cancelReason: status === "canceled" ? "provider_canceled" : null,
    cancelAtPeriodEnd,
    paddleSubscriptionId: data.id,
    lastEventTimestamp: occurredAt,
  };

  let subscriptionId: string;
  let previousStatus: string | null = null;

  if (!existing) {
    const created = await tx.subscription.create({
      data: { id: crypto.randomUUID(), billingAccountId: account.id, ...values },
    });
    subscriptionId = created.id;
  } else {
    // Guarded write: only moves forward in provider time — for the same lineage AND for a
    // re-subscribe over a canceled row, so a delayed event of an older lineage can never resurrect
    // access. An equal timestamp is accepted only for a terminal "canceled" (cancel wins ties).
    const guard = {
      OR: [
        { lastEventTimestamp: null },
        { lastEventTimestamp: status === "canceled" ? { lte: occurredAt } : { lt: occurredAt } },
      ],
    };
    const result = await tx.subscription.updateMany({ where: { id: existing.id, ...guard }, data: values });
    if (result.count === 0) {
      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.BILLING_SUBSCRIPTION_STALE_EVENT_IGNORED,
          workspaceId: account.workspaceId,
          actorType: "system",
          entityType: "Subscription",
          entityId: existing.id,
          payload: { providerEventId: envelope.event_id, eventType: envelope.event_type, storedStatus: existing.status },
          visibility: "internal",
        },
        tx,
      );
      return "stale_ignored";
    }
    subscriptionId = existing.id;
    previousStatus = existing.status;
  }

  await tx.billingAccount.update({
    where: { id: account.id },
    data: { provider: PADDLE_PROVIDER, paddleCustomerId: data.customer_id, status: "active" },
  });

  await emitAuditEvent(
    {
      eventName: AUDIT_EVENTS.BILLING_SUBSCRIPTION_SYNCED,
      workspaceId: account.workspaceId,
      actorType: "system",
      entityType: "Subscription",
      entityId: subscriptionId,
      payload: {
        providerEventId: envelope.event_id,
        eventType: envelope.event_type,
        previousStatus,
        status,
        cancelAtPeriodEnd,
        paddleSubscriptionId: data.id,
      },
      visibility: "internal",
    },
    tx,
  );
  if (status === "active" && previousStatus !== "active") {
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.SUBSCRIPTION_ACTIVATED,
        workspaceId: account.workspaceId,
        actorType: "system",
        entityType: "Subscription",
        entityId: subscriptionId,
        payload: { planId: plan.id, paddleSubscriptionId: data.id },
        visibility: "internal",
      },
      tx,
    );
  }
  return "applied";
}

async function auditTransactionEvent(tx: Tx, envelope: PaddleEnvelope): Promise<PaddleProcessOutcome> {
  const parsed = paddleTransactionDataSchema.safeParse(envelope.data);
  if (!parsed.success) throw new PaddleEventRejectedError("invalid_transaction_payload");
  const data = parsed.data;
  const account = await resolveBillingAccount(tx, {
    paddleSubscriptionId: data.subscription_id,
    customerId: data.customer_id,
    customData: data.custom_data,
  });
  if (!account) return "ignored"; // no tenant to attribute; never creates state
  await emitAuditEvent(
    {
      eventName:
        envelope.event_type === "transaction.completed"
          ? AUDIT_EVENTS.BILLING_PAYMENT_SUCCEEDED
          : AUDIT_EVENTS.BILLING_PAYMENT_FAILED,
      workspaceId: account.workspaceId,
      actorType: "system",
      entityType: "BillingAccount",
      entityId: account.id,
      payload: { providerEventId: envelope.event_id, transactionId: data.id, subscriptionId: data.subscription_id ?? null },
      visibility: "internal",
    },
    tx,
  );
  return "audited";
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

export async function processPaddleEvent(envelope: PaddleEnvelope): Promise<PaddleProcessOutcome> {
  if (isPaddleSubscriptionEvent(envelope.event_type)) {
    // Two first events (created + activated) can race to create the single subscription row; the
    // loser hits the unique index and simply re-runs as an update instead of burning a retry attempt.
    for (let attempt = 0; ; attempt++) {
      try {
        return await db.$transaction((tx: Prisma.TransactionClient) => applySubscriptionEvent(tx, envelope));
      } catch (error) {
        if (attempt >= 2 || !isUniqueViolation(error)) throw error;
      }
    }
  }
  if (isPaddleTransactionEvent(envelope.event_type)) {
    return db.$transaction((tx: Prisma.TransactionClient) => auditTransactionEvent(tx, envelope));
  }
  return "ignored";
}

/** Audit a rejected (signed but unacceptable) event outside the rolled-back transaction. */
export async function auditRejectedPaddleEvent(envelope: PaddleEnvelope, error: PaddleEventRejectedError): Promise<void> {
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.BILLING_EVENT_REJECTED,
    workspaceId: error.workspaceId,
    actorType: "system",
    entityType: "WebhookEvent",
    payload: { providerEventId: envelope.event_id, eventType: envelope.event_type, reason: error.reason },
    visibility: "internal",
  });
}

/**
 * The owner paid twice (two checkouts opened before the first webhook landed). The extra provider
 * subscription grants nothing locally, so cancel it at the provider to stop recurring charges; the
 * refund of the duplicate charge stays a manual Paddle-dashboard action (flagged in the audit).
 * A provider 4xx (already canceled / unknown) is final; a 5xx/network failure is rethrown so the
 * webhook is retried.
 */
export async function cancelDuplicateSubscription(envelope: PaddleEnvelope, error: PaddleEventRejectedError): Promise<void> {
  if (error.reason !== "second_live_subscription" || !error.orphanSubscriptionId) return;
  let outcome = "canceled";
  try {
    await cancelSubscriptionImmediately(error.orphanSubscriptionId);
  } catch (e) {
    if (e instanceof PaddleApiError && e.upstreamStatus >= 400 && e.upstreamStatus < 500) outcome = `provider_${e.upstreamStatus}`;
    else throw e;
  }
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.BILLING_DUPLICATE_SUBSCRIPTION_CANCELED,
    workspaceId: error.workspaceId,
    actorType: "system",
    entityType: "Subscription",
    payload: { providerEventId: envelope.event_id, duplicateSubscriptionId: error.orphanSubscriptionId, outcome, refundRequired: true },
    visibility: "internal",
  });
}
