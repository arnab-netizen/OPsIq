import Link from "next/link";
import { PublicLink } from "@/components/navigation/PublicLink";
import { PUBLIC_GRACE_DAYS_COPY, PUBLIC_PLAN_NAME, PUBLIC_PRICE_DISPLAY } from "@/domain/billing/public-pricing";

export const metadata = {
  title: "Pricing | OpsIQ",
  description: "OpsIQ pricing: one plan, free first diagnosis, monthly subscription billed by Paddle.",
};

const LINK = "text-[var(--primary-text)] hover:underline";

export default function PricingPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-12 text-foreground">
      <PublicLink href="/" className="text-sm text-[var(--primary-text)] hover:underline">
        &larr; Back to OpsIQ
      </PublicLink>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Pricing</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        OpsIQ is a governed business decision-support service for owner-run businesses. There is one plan.
      </p>

      <div className="mt-8 space-y-5 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-semibold text-foreground">Free: your first diagnosis</h2>
          <p className="mt-1">
            Sign up, set up your business, and receive your first diagnosis and first recommended move
            without paying and without entering a payment method.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">{PUBLIC_PLAN_NAME}: continue with governed execution</h2>
          <p className="mt-1">
            {PUBLIC_PLAN_NAME} keeps the work going after your first diagnosis: resolving approvals and
            continuing governed execution of the recommended actions for your business.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Price:</strong>{" "}
            {PUBLIC_PRICE_DISPLAY ?? "to be announced. Paid plans have not opened yet, and the exact price is shown here and in checkout before you pay."}
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground">How billing works</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>The subscription is monthly and renews automatically until you cancel.</li>
            <li>
              Payment is handled by Paddle, our reseller and Merchant of Record. Paddle charges you, collects
              applicable sales tax or VAT at checkout, and issues your receipt. OpsIQ never sees your card details.
            </li>
            <li>
              You can cancel any time from your billing page. Access continues until the end of the period you
              have paid for.
            </li>
            <li>
              If a renewal payment fails, Paddle retries it. Your access continues for up to {PUBLIC_GRACE_DAYS_COPY} days after the missed
              renewal date while you update your payment method from the billing page.
            </li>
          </ul>
        </section>

        <p>
          See the{" "}
          <Link href="/refund-policy" className={LINK}>Refund and cancellation policy</Link>,{" "}
          <Link href="/terms" className={LINK}>Terms</Link>, and{" "}
          <Link href="/privacy" className={LINK}>Privacy</Link>. Questions:{" "}
          <a href="mailto:support@opsiq.solutions" className={LINK}>support@opsiq.solutions</a>.
        </p>
      </div>
    </main>
  );
}
