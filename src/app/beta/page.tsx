import Link from "next/link";

export const metadata = {
  title: "Beta Notice | OpsIQ",
  description: "What to expect from the OpsIQ open beta.",
};

const POLICY_VERSION = "2026-09-05";

export default function BetaNoticePage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-12 text-foreground">
      <Link href="/" className="text-sm text-[var(--primary-text)] hover:underline">
        &larr; Back to OpsIQ
      </Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Beta Notice</h1>
      <p className="mt-2 text-sm text-muted-foreground">Version {POLICY_VERSION}.</p>
      <p className="mt-2 rounded bg-muted p-3 text-xs text-muted-foreground">
        This page is written in plain language by the OpsIQ team. It has{" "}
        <strong>not been reviewed by a lawyer</strong>.
      </p>

      <div className="mt-8 space-y-5 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-semibold text-foreground">OpsIQ is in open beta</h2>
          <p className="mt-1">
            Anyone can sign up during open beta — no invitation is required. The product is real
            and functional, but it is still early: features may change, bugs exist, and we are
            actively improving it based on what beta users tell us.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Free during beta, no billing</h2>
          <p className="mt-1">
            Beta access is completely free. Signing up never requires a payment method, and no
            paid entitlement is granted automatically. There are no external paying customers
            during this beta period.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">No guaranteed business outcomes</h2>
          <p className="mt-1">
            OpsIQ gives you a structured second opinion on your business — it does not guarantee
            any result, and you remain responsible for the decisions you make. See{" "}
            <Link href="/terms" className="text-[var(--primary-text)] hover:underline">Terms</Link>.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">What data belongs in OpsIQ</h2>
          <p className="mt-1">
            OpsIQ is for business operations, business metrics, and financial/business performance
            data. <strong>Do not upload</strong>: passwords, API keys or credentials, payment-card
            data, government IDs, health data, sensitive employee or customer personal data, or
            other regulated secrets. See{" "}
            <Link href="/privacy" className="text-[var(--primary-text)] hover:underline">Privacy</Link>{" "}
            for the full data policy.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Registration can be closed at any time</h2>
          <p className="mt-1">
            Open beta has an initial capacity limit, and registration can be closed at any time —
            for example, if capacity is reached, or if a security or tenant-isolation issue is
            found that needs to be fixed before more people sign up. If registration is closed,
            the signup page will say so.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Email verification is required</h2>
          <p className="mt-1">
            After you sign up, you&rsquo;ll receive a verification email. You must click the link
            in that email before you can sign in and use your account.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Feedback and support</h2>
          <p className="mt-1">
            Use the &ldquo;Send beta feedback / Report a problem&rdquo; link inside the product, or
            email{" "}
            <a href="mailto:support@opsiq.solutions" className="text-[var(--primary-text)] hover:underline">
              support@opsiq.solutions
            </a>
            . Beta feedback directly shapes what we build next.
          </p>
        </section>
      </div>
    </main>
  );
}
