import { PublicLink } from "@/components/navigation/PublicLink";
import Link from "next/link";
import { PublicBetaText, PublicBetaSwitch } from "@/components/landing/PublicBetaCta";

export const metadata = {
  title: "Terms | OpsIQ",
  description: "Beta terms for using OpsIQ.",
};

const POLICY_VERSION = "2026-10-17";

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-12 text-foreground">
      <PublicLink href="/" className="text-sm text-[var(--primary-text)] hover:underline">
        &larr; Back to OpsIQ
      </PublicLink>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Terms</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        OpsIQ is currently in <PublicBetaText field="betaPhrase" />. Version {POLICY_VERSION}.
      </p>
      <p className="mt-2 rounded bg-muted p-3 text-xs text-muted-foreground">
        This page is written in plain language by the OpsIQ team. It has{" "}
        <strong>not been reviewed by a lawyer</strong>. It describes how the beta actually works
        today, not a polished legal contract.
      </p>

      <div className="mt-8 space-y-5 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-semibold text-foreground">Beta, and free</h2>
          <p className="mt-1">
            OpsIQ is a free <PublicBetaSwitch open="beta" invite="invite-only beta" />. During beta there is no charge to
            sign up, no payment method is required to sign up, and no paid subscription is created automatically. Beta
            access never rolls into a paid subscription by itself: you only pay if you choose to subscribe.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Paid subscription (when offered)</h2>
          <p className="mt-1">
            When a paid plan is offered, it is a monthly subscription that renews automatically until you cancel. The
            current price is shown on the{" "}
            <PublicLink href="/pricing" className="text-[var(--primary-text)] hover:underline">Pricing</PublicLink> page and in
            checkout before you pay. Payment is processed by Paddle, which acts as the Merchant of Record: Paddle sells
            the subscription to you, charges you, collects applicable tax, and issues receipts, and Paddle&rsquo;s checkout
            buyer terms apply to the purchase. OpsIQ does not receive or store your card details.
          </p>
          <p className="mt-2">
            You can cancel any time from the Billing page; access continues until the end of the paid period. If a renewal
            payment fails, paid access continues for up to 7 days after the missed renewal date while Paddle retries and
            you update your payment method, and then ends if payment is not recovered. Refunds are described in the{" "}
            <PublicLink href="/refund-policy" className="text-[var(--primary-text)] hover:underline">Refund and cancellation policy</PublicLink>.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">No guaranteed business outcomes</h2>
          <p className="mt-1">
            OpsIQ provides <strong>operational decision-support</strong>. It is{" "}
            <strong>not financial, legal, accounting, or tax advice</strong>, and it does not
            guarantee any business result. Its output is a structured second opinion meant to
            inform &mdash; never replace &mdash; your own judgment.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">You remain responsible for your decisions</h2>
          <p className="mt-1">
            You remain fully responsible for the business decisions you make. Review OpsIQ&rsquo;s
            findings, recommendations, and actions against your own knowledge of your business
            before acting on them.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Age requirement</h2>
          <p className="mt-1">OpsIQ is for users who are 18 years of age or older.</p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Do not upload sensitive data</h2>
          <p className="mt-1">
            OpsIQ is for business operations, business metrics, and financial/business performance
            data. Do not upload passwords, API keys or credentials, payment-card data, government
            IDs, health data, sensitive employee or customer personal data, or other regulated
            secrets. See <Link href="/privacy" className="text-[var(--primary-text)] hover:underline">Privacy</Link> for detail.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Beta reality</h2>
          <p className="mt-1">
            OpsIQ is a beta service. It may change, may contain bugs, and may occasionally be
            unavailable, while we continue to improve it. Registration itself can be closed or
            reopened at any time.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Feedback, support, and questions</h2>
          <p className="mt-1">
            Use the &ldquo;Send beta feedback&rdquo; link inside the product, or email{" "}
            <a href="mailto:support@opsiq.solutions" className="text-[var(--primary-text)] hover:underline">
              support@opsiq.solutions
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
