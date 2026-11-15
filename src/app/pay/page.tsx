import type { Metadata } from "next";
import { PayCheckout } from "@/components/billing/PayCheckout";
import { resolvePayConfig } from "@/lib/billing/paddle-js";

/**
 * Paddle Default Payment Link target. Public, checkout-only, never indexed. Reads only the
 * server-side environment contract (PADDLE_ENV, PADDLE_CLIENT_TOKEN) at request time — no session,
 * no tenant context, no business data. The client-side token is public by design; server API keys are
 * never read here.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout | OpsIQ",
  robots: { index: false, follow: false },
};

export default function PayPage() {
  return <PayCheckout config={resolvePayConfig(process.env)} />;
}
