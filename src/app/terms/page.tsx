import Link from "next/link";
import { PublicBetaText, PublicBetaSwitch } from "@/components/landing/PublicBetaCta";

export const metadata = {
  title: "Terms | OpsIQ",
  description: "Beta terms for using OpsIQ.",
};

const POLICY_VERSION = "2026-09-17";

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-12 text-foreground">
      <Link href="/" className="text-sm text-[var(--primary-text)] hover:underline">
        &larr; Back to OpsIQ
      </Link>
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
            OpsIQ is a free <PublicBetaSwitch open="beta" invite="invite-only beta" />. There is no charge to use it during beta, no payment method
            is required to sign up, and no automatic paid entitlement is granted. If OpsIQ ever
            introduces paid plans, that will be a separate, clearly communicated decision — beta
            access does not roll into a paid subscription automatically.
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
