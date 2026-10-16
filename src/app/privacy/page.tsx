import { PublicLink } from "@/components/navigation/PublicLink";
import Link from "next/link";
import { PublicBetaText } from "@/components/landing/PublicBetaCta";
import { AnalyticsPreferencesButton } from "@/components/analytics/AnalyticsPreferencesButton";
import { resolveClarityProjectId } from "@/lib/analytics/clarity-policy";

export const metadata = {
  title: "Privacy | OpsIQ",
  description: "How OpsIQ handles your information during beta.",
};

const POLICY_VERSION = "2026-10-16";

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-12 text-foreground">
      <PublicLink href="/" className="text-sm text-[var(--primary-text)] hover:underline">
        &larr; Back to OpsIQ
      </PublicLink>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        OpsIQ is currently in <PublicBetaText field="betaPhrase" />. Version {POLICY_VERSION}.
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
            content of any support or beta-feedback request you send us. If you request beta
            access, we record the email and optional first name you enter plus how you found
            OpsIQ: the campaign tags in the link you followed (utm_ parameters), the first OpsIQ
            page you opened in that browser tab and the page you requested access from (page
            paths only), and the domain of the external website that referred you (never its full
            address). Until you submit, these details stay in your browser tab&rsquo;s session
            storage; they set no cookies and are not used for advertising. On our public pages
            only (the homepage, About, Beta notice, Privacy, Terms, and Resources pages), we also
            count page visits with Vercel Web Analytics: the page address (with any campaign tags,
            but no other link parameters), the referring website, and general browser, device,
            and country information. OpsIQ sets no cookies for this, sends it no name, email, or
            account information, and does not record visits to signed-in pages.
          </p>
        </section>

        <section id="analytics">
          <h2 className="font-semibold text-foreground">Optional analytics on our public pages (Microsoft Clarity)</h2>
          <p className="mt-1">
            On our public pages only (the homepage, About, Beta notice, Privacy, Terms, Resources
            and the free tools), and <strong>only if you choose &ldquo;Allow analytics&rdquo;</strong>,
            we use Microsoft Clarity, a behavioral analytics service run by Microsoft. If you allow
            it, Clarity records how you use the page, such as clicks, taps, scrolling, mouse
            movement, and the public pages you move between, so we can see where our website is
            confusing. We have set Clarity to its Strict masking mode, which masks text and form
            input in its recordings. If you allow analytics, Clarity and Microsoft may set cookies
            or similar identifiers in your browser (for example <code>_clck</code> and{" "}
            <code>_clsk</code>); Microsoft processes this data as a third-party analytics provider
            for us, under its own privacy statement. We tell Clarity that advertising storage is
            denied, and we do not use this data for advertising.
          </p>
          <p className="mt-2">
            Nothing is sent to Clarity until you choose &ldquo;Allow analytics&rdquo;. Declining, or
            not choosing, does not prevent you from using OpsIQ. Clarity does <strong>not</strong>{" "}
            run on the signed-in OpsIQ product, the sign-in and sign-up pages, or any account,
            admin, or dashboard page; links from our public pages to those pages open a fresh page
            so that nothing carries over. We store only your choice (&ldquo;allowed&rdquo; or
            &ldquo;declined&rdquo;) in your browser; it contains no name, email, or business
            information. You can change your choice at any time
            {resolveClarityProjectId() ? (
              <>
                {" "}
                with <AnalyticsPreferencesButton className="font-medium text-[var(--primary-text)] underline" />
              </>
            ) : null}
            . Withdrawing stops new recording and reloads the page. To ask about recordings
            already collected, email{" "}
            <a href="mailto:support@opsiq.solutions" className="text-[var(--primary-text)] hover:underline">
              support@opsiq.solutions
            </a>
            . This is separate from the Vercel Web Analytics described above, which does not use
            cookies and does not depend on this choice.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Why we collect it</h2>
          <p className="mt-1">
            To create and secure your account (including verifying your email address before
            granting access), to generate your business diagnosis and recommendations and show
            them back to you in your workspace, to protect the service against abuse (rate
            limiting, fraud, and security monitoring), to understand which of our pages and
            channels lead people to request beta access, to understand, only if you allow it, how
            visitors use our public pages, and to fix bugs and improve the product.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Third-party infrastructure and providers</h2>
          <p className="mt-1">
            OpsIQ runs on third-party infrastructure to operate: Vercel (application hosting, and
            page-visit analytics for our public pages), Microsoft (Clarity behavioral analytics on
            our public pages, only if you allow it),
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
