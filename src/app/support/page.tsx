import Link from "next/link";

export const metadata = {
  title: "Support | OpsIQ",
  description: "How to get help with OpsIQ, including QuickBooks connection help and privacy or deletion requests.",
};

const SUPPORT_EMAIL = "support@opsiq.solutions";
const LINK = "text-[var(--primary-text)] hover:underline";

export default function SupportPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-12 text-foreground">
      <h1 className="text-2xl font-semibold">Support</h1>
      <div className="mt-6 space-y-6 text-sm leading-6">
        <section>
          <h2 className="font-semibold text-foreground">Contact us</h2>
          <p className="mt-1">
            Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
              {SUPPORT_EMAIL}
            </a>
            . OpsIQ is built by a small team and support is handled by email. We do not publish a guaranteed response time.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">What support covers</h2>
          <p className="mt-1">
            Help signing in or using your OpsIQ workspace, questions about findings and recommendations, bug reports, beta feedback, and help connecting or disconnecting QuickBooks Online.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">QuickBooks Online connection help</h2>
          <p className="mt-1">
            QuickBooks is connected, refreshed, and disconnected from the Data page after you sign in. In this version OpsIQ only reads from QuickBooks. Disconnecting revokes OpsIQ access and deletes the stored tokens; figures already imported stay in your workspace, and the Privacy page explains how deletion requests work and their current limits. If something fails, email us with the name of your business and what you saw on screen. Do not send passwords or tokens. Details are in the{" "}
            <Link href="/privacy" className={LINK}>
              Privacy page
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">Access, correction, and deletion requests</h2>
          <p className="mt-1">
            To request a copy of your data, a correction, or deletion of your account and data (including imported QuickBooks data), email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
              {SUPPORT_EMAIL}
            </a>
            . These requests are fulfilled manually, not instantly. See the{" "}
            <Link href="/privacy" className={LINK}>
              Privacy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className={LINK}>
              Terms
            </Link>{" "}
            pages.
          </p>
        </section>
      </div>
    </main>
  );
}
