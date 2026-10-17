"use client";

/**
 * Public, checkout-only surface behind Paddle's Default Payment Link. Renders no OpsIQ customer or
 * business data. Paddle.js opens the checkout for the `_ptxn` transaction the server created.
 * Payment events shown here are display-only: access changes only when OpsIQ receives the verified
 * Paddle webhook, never from anything this page reports.
 */

import { useEffect, useState } from "react";
import {
  initializePaddleOnce,
  isValidTransactionParam,
  loadPaddleJs,
  type PaddleEventData,
  type PayConfig,
} from "@/lib/billing/paddle-js";

type View = "loading" | "open" | "completed" | "closed" | "error" | "no-transaction" | "unconfigured";

const COPY: Record<View, string> = {
  loading: "Opening secure checkout…",
  open: "Complete your payment in the secure checkout window.",
  completed: "Payment received. We are confirming it with our payment provider — your subscription appears in OpsIQ billing within a minute.",
  closed: "Checkout closed. Nothing was charged unless you completed payment. You can return to OpsIQ billing to try again.",
  error: "We could not load the secure checkout. Please go back to OpsIQ billing and try again.",
  "no-transaction": "This page opens a checkout started from your OpsIQ billing page. Please start from there.",
  unconfigured: "Payments are not available right now.",
};

export function PayCheckout({ config }: { config: PayConfig }) {
  const [view, setView] = useState<View>(() => (config.state === "ready" ? "loading" : "unconfigured"));

  useEffect(() => {
    if (config.state !== "ready") return;
    const txn = new URLSearchParams(window.location.search).get("_ptxn");
    if (!isValidTransactionParam(txn)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading window.location is only possible after mount
      setView("no-transaction");
      return;
    }
    let cancelled = false;
    loadPaddleJs()
      .then((paddle) => {
        const onEvent = (event: PaddleEventData) => {
          if (cancelled) return;
          if (event.name === "checkout.loaded") setView("open");
          else if (event.name === "checkout.completed") setView("completed");
          else if (event.name === "checkout.closed") setView((v) => (v === "completed" ? v : "closed"));
          else if (event.name === "checkout.error" || event.name === "checkout.failed") setView("error");
        };
        initializePaddleOnce(paddle, config, onEvent);
      })
      .catch(() => {
        if (!cancelled) setView("error");
      });
    return () => {
      cancelled = true;
    };
  }, [config]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12 text-center text-foreground">
      <h1 className="text-xl font-semibold">OpsIQ secure checkout</h1>
      <p role="status" className="mt-4 text-sm text-muted-foreground">
        {COPY[view]}
      </p>
      {view !== "loading" && view !== "open" && (
        <a href="/owner/billing" className="mt-6 text-sm text-[var(--primary-text)] hover:underline">
          Back to OpsIQ billing
        </a>
      )}
    </main>
  );
}
