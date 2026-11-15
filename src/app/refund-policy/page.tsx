import Link from "next/link";
import { PublicLink } from "@/components/navigation/PublicLink";

export const metadata = {
  title: "Refund and cancellation policy | OpsIQ",
  description: "How to cancel an OpsIQ subscription and how refunds work.",
};

const POLICY_VERSION = "2026-10-17";
const LINK = "text-[var(--primary-text)] hover:underline";

export default function RefundPolicyPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-12 text-foreground">
      <PublicLink href="/" className="text-sm text-[var(--primary-text)] hover:underline">
        &larr; Back to OpsIQ
      </PublicLink>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Refund and cancellation policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Version {POLICY_VERSION}. Applies to the OpsIQ paid subscription.</p>
      <p className="mt-2 rounded bg-muted p-3 text-xs text-muted-foreground">
        This page is written in plain language by the OpsIQ team. It has <strong>not been reviewed by a lawyer</strong>.
      </p>

      <div className="mt-8 space-y-5 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-semibold text-foreground">Who sells and charges</h2>
          <p className="mt-1">
            Paddle is the Merchant of Record for OpsIQ subscriptions. Paddle takes your payment, handles tax,
            issues receipts, and processes refunds. Paddle&rsquo;s{" "}
            <a href="https://www.paddle.com/legal/checkout-buyer-terms" className={LINK}>checkout buyer terms</a>{" "}
            apply to the purchase.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Cancelling</h2>
          <p className="mt-1">
            Cancel any time from the Billing page inside OpsIQ. Cancellation takes effect at the end of the
            billing period you have already paid for: you keep access until then, and you will not be charged
            again. After that, your account returns to the free experience (the first diagnosis).
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Refunds</h2>
          <p className="mt-1">
            If you were charged and want a refund, email{" "}
            <a href="mailto:support@opsiq.solutions" className={LINK}>support@opsiq.solutions</a> from the account
            email, or contact Paddle through the link in your receipt. Requests made within 14 days of your most
            recent charge are handled under Paddle&rsquo;s standard refund terms. We do not offer pro-rata refunds
            for unused time in a period after that, except where the law requires it.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Failed payments</h2>
          <p className="mt-1">
            If a renewal fails, Paddle retries the payment. Your access continues for up to 7 days after the
            missed renewal date while you update your payment method from the Billing page. If the payment is not
            recovered, paid access ends; the subscription is cancelled if Paddle ultimately cannot collect.
          </p>
        </section>

        <p>
          See also <Link href="/pricing" className={LINK}>Pricing</Link>, <Link href="/terms" className={LINK}>Terms</Link>, and{" "}
          <Link href="/privacy" className={LINK}>Privacy</Link>.
        </p>
      </div>
    </main>
  );
}
