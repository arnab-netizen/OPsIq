"use client";

/**
 * /owner/billing — owner-visible billing status, upgrade and cancel.
 *
 * Presentation only: all state, entitlement and authorization decisions are made server-side
 * (/api/billing/*). Returning from checkout never grants access by itself — the page just
 * re-reads the server-side status, which changes only after Paddle's verified webhook lands.
 */

import { useEffect, useState } from "react";
import { PageHeader, PageContainer } from "@/ui/primitives";
import { createClientIdempotencyKey } from "@/lib/client-idempotency";
import { useOperatorMutation } from "@/hooks/useOperatorMutation";
import { classifyOperatorError, type GovernedErrorResponse } from "@/lib/operator-error-governance";

interface BillingStatus {
  providerEnvironment: "sandbox" | "production";
  checkoutAvailable: boolean;
  state: "none" | "active" | "past_due" | "paused" | "canceled" | "other";
  entitled: boolean;
  access: "paid" | "grace" | "denied";
  paymentProblem: boolean;
  graceEndsAt: string | null;
  canUpdatePaymentMethod: boolean;
  planName: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const STATE_COPY: Record<BillingStatus["state"], string> = {
  none: "No subscription yet. You can keep using the free first-diagnosis experience.",
  active: "Your subscription is active.",
  past_due: "Your last payment did not go through.",
  paused: "Your subscription is paused.",
  canceled: "Your subscription has ended.",
  other: "Your subscription status could not be determined.",
};

function unwrap<T>(body: unknown): T {
  const b = body as { data?: T } | T;
  return ((b as { data?: T })?.data ?? b) as T;
}

export default function OwnerBillingPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // A fresh idempotency key per attempt: a double click replays one request, a later retry is new.
  const [checkoutKey, setCheckoutKey] = useState(() => createClientIdempotencyKey("billing-checkout"));
  const [cancelKey, setCancelKey] = useState(() => createClientIdempotencyKey("billing-cancel"));
  const [recoverKey, setRecoverKey] = useState(() => createClientIdempotencyKey("billing-payment-method"));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/status")
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load billing status.");
        const body = await res.json();
        if (!cancelled) {
          setStatus(unwrap<BillingStatus>(body));
          setNotice(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setNotice(classifyOperatorError(e, { context: "load" }).operatorMessage);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const onFail = (governed: GovernedErrorResponse) => setNotice(governed.operatorMessage);

  const checkout = useOperatorMutation<unknown, Record<string, never>>({
    url: "/api/billing/checkout",
    method: "POST",
    headers: { "idempotency-key": checkoutKey },
    maxRetries: 0,
    operationName: "billing-checkout",
    onSuccess: (body) => {
      const url = unwrap<{ checkoutUrl?: string }>(body)?.checkoutUrl;
      if (url) window.location.assign(url);
    },
    onError: onFail,
    onSettled: () => setCheckoutKey(createClientIdempotencyKey("billing-checkout")),
  });

  const cancel = useOperatorMutation<unknown, Record<string, never>>({
    url: "/api/billing/cancel",
    method: "POST",
    headers: { "idempotency-key": cancelKey },
    maxRetries: 0,
    operationName: "billing-cancel",
    onSuccess: () => setReloadKey((k) => k + 1),
    onError: onFail,
    onSettled: () => setCancelKey(createClientIdempotencyKey("billing-cancel")),
  });

  // Sends the owner to Paddle's own payment-method update checkout. Returning does not restore
  // access by itself: the page re-reads server state, which changes only after the verified webhook.
  const recover = useOperatorMutation<unknown, Record<string, never>>({
    url: "/api/billing/payment-method",
    method: "POST",
    headers: { "idempotency-key": recoverKey },
    maxRetries: 0,
    operationName: "billing-payment-method",
    onSuccess: (body) => {
      const url = unwrap<{ checkoutUrl?: string }>(body)?.checkoutUrl;
      if (url) window.location.assign(url);
    },
    onError: onFail,
    onSettled: () => setRecoverKey(createClientIdempotencyKey("billing-payment-method")),
  });

  const busy = checkout.isLoading || cancel.isLoading || recover.isLoading;

  return (
    <PageContainer>
      <PageHeader title="Billing" description="Your OpsIQ subscription." />
      {notice && <p role="alert">{notice}</p>}
      {!status && !notice && <p>Loading…</p>}
      {status && (
        <section aria-label="Subscription status">
          {status.providerEnvironment === "sandbox" && <p>Test mode: no real charges are made.</p>}
          <p>{STATE_COPY[status.state]}</p>
          {status.paymentProblem && (
            <div role="alert">
              <p>
                <strong>Payment problem.</strong>{" "}
                {status.access === "grace" && status.graceEndsAt
                  ? `Your access continues while our payment provider retries, until ${new Date(status.graceEndsAt).toLocaleDateString()}. Update your payment method to avoid losing access.`
                  : "Your access is paused until the payment is fixed. Update your payment method to restore it."}
              </p>
              {status.canUpdatePaymentMethod && (
                <button type="button" disabled={busy} onClick={() => void recover.mutate({})}>
                  Update payment method
                </button>
              )}
            </div>
          )}
          {status.planName && <p>Plan: {status.planName}</p>}
          {status.access === "paid" && status.currentPeriodEnd && (
            <p>
              {status.cancelAtPeriodEnd ? "Access ends on " : "Renews on "}
              {new Date(status.currentPeriodEnd).toLocaleDateString()}
            </p>
          )}
          {(status.state === "none" || status.state === "canceled") && status.checkoutAvailable && (
            <button type="button" disabled={busy} onClick={() => void checkout.mutate({})}>
              Upgrade
            </button>
          )}
          {(status.state === "none" || status.state === "canceled") && !status.checkoutAvailable && <p>Upgrades are not open yet.</p>}
          {status.access === "paid" && !status.cancelAtPeriodEnd && (
            <button type="button" disabled={busy} onClick={() => void cancel.mutate({})}>
              Cancel at end of period
            </button>
          )}
        </section>
      )}
    </PageContainer>
  );
}
