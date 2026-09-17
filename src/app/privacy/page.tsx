import Link from "next/link";

export const metadata = {
  title: "Privacy | OpsIQ",
  description: "How OpsIQ handles your information during beta.",
};

const POLICY_VERSION = "2026-09-17";

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-12 text-foreground">
      <Link href="/" className="text-sm text-[var(--primary-text)] hover:underline">
        &larr; Back to OpsIQ
      </Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        OpsIQ is currently in a controlled, invite-only beta. Version {POLICY_VERSION}.
      </p>
      <p className="mt-2 rounded bg-muted p-3 text-xs text-muted-foreground">
        This page is written in plain language by the OpsIQ team. It has{" "}
        <strong>not been reviewed by a lawyer</strong>.
      </p>

      <div className="mt-8 space-y-5 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-semibold text-foreground">Do not enter sensitive data</h2>
          <p className="mt-1">
            OpsIQ is for business operations, business metrics, and financial/business performance
            data. Please <strong>do not upload passwords, API keys or credentials, payment-card
            data, government IDs, health data, sensitive employee or customer personal data, or
            other regulated secrets</strong>.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">What we collect</h2>
          <p className="mt-1">
            Your account email and password (stored as a one-way hash, never in plain text); the
            workspace name and business information you enter; the diagnosis, findings,
            recommendations, and actions OpsIQ generates from that information; basic technical
            data needed to operate the service (IP address for rate-limiting and abuse
            prevention, session cookies, and error/crash reports); and, if you submit one, the
            content of any support or beta-feedback request you send us.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Why we collect it</h2>
          <p className="mt-1">
            To create and secure your account (including verifying your email address before
            granting access), to generate your business diagnosis and recommendations and show
            them back to you in your workspace, to protect the service against abuse (rate
            limiting, fraud, and security monitoring), and to fix bugs and improve the product.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Third-party infrastructure and providers</h2>
          <p className="mt-1">
            OpsIQ runs on third-party infrastructure to operate: Vercel (application hosting),
            Neon (Postgres database hosting), Resend (transactional email, e.g. verification and
            password-reset emails), and Sentry (error monitoring — configured to scrub cookies,
            authorization headers, request bodies, and never to include your email or IP address
            in error reports). These providers process data only as needed to provide their
            respective service to OpsIQ.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Retention</h2>
          <p className="mt-1">
            We retain your account and business data for as long as your account is active. If you
            request deletion (see below), we retain a minimal audit record of the request itself
            for accountability, and otherwise fulfill the deletion per our runbook.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Security limitations</h2>
          <p className="mt-1">
            We take reasonable precautions (password hashing, encrypted connections, workspace
            isolation, audit logging), but OpsIQ is a beta product built by a small team. No
            system is perfectly secure, and beta software carries more risk than a mature,
            audited product. Do not store anything in OpsIQ you would be seriously harmed by
            losing or exposing.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Your access, correction, and deletion rights</h2>
          <p className="mt-1">
            You can request a copy of your data, a correction, or deletion of your account and
            data at any time by emailing{" "}
            <a href="mailto:support@opsiq.solutions" className="text-[var(--primary-text)] hover:underline">
              support@opsiq.solutions
            </a>
            . These requests are currently fulfilled manually by our team, not instantly or
            automatically — we aim to acknowledge every request promptly and will tell you when
            it has been completed.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Privacy contact</h2>
          <p className="mt-1">
            Questions about this notice, or any privacy request:{" "}
            <a href="mailto:support@opsiq.solutions" className="text-[var(--primary-text)] hover:underline">
              support@opsiq.solutions
            </a>
            .
          </p>
        </section>

        <p>
          Because OpsIQ is in beta, this notice and the service may change. We&rsquo;ll keep this
          page updated as the product matures. See also{" "}
          <Link href="/beta" className="text-[var(--primary-text)] hover:underline">the Beta notice</Link>{" "}
          and <Link href="/terms" className="text-[var(--primary-text)] hover:underline">Terms</Link>.
        </p>
      </div>
    </main>
  );
}
