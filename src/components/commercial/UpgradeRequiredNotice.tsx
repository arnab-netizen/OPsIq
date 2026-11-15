import Link from "next/link";
import { PUBLIC_GRACE_DAYS_COPY, PUBLIC_PLAN_NAME, PUBLIC_PRICE_DISPLAY } from "@/domain/billing/public-pricing";

interface UpgradeRequiredNoticeProps {
  onDismiss?: () => void;
}

/**
 * Shown only after the server refused a continuation step with HTTP 402, so it is dormant whenever
 * BILLING_PAYWALL_ENFORCEMENT is off. Plain, dismissible, no countdown or urgency. The price comes from
 * the single canonical source (public-pricing); nothing is invented while it is unset. The first
 * diagnosis stays reachable and cancellation is one click away in the same notice.
 */
export function UpgradeRequiredNotice({ onDismiss }: UpgradeRequiredNoticeProps) {
  return (
    <section role="alert" aria-label="Subscription needed to continue" className="mb-4 rounded border border-border bg-muted p-4 text-sm">
      <p className="font-semibold text-foreground">Your free first diagnosis is yours to keep. Continuing the OpsIQ loop needs a subscription.</p>
      <p className="mt-1 text-muted-foreground">
        {PUBLIC_PLAN_NAME}: {PUBLIC_PRICE_DISPLAY ?? "the exact price is shown in checkout before you pay"}. It renews monthly and you can cancel any time from Billing; access continues to the end of the paid
        period. If a renewal payment fails, access continues for {PUBLIC_GRACE_DAYS_COPY} days while you fix it.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/owner/billing" className="font-medium text-[var(--primary-text)] hover:underline">
          Subscribe or manage billing
        </Link>
        <Link href="/owner/home" className="text-[var(--primary-text)] hover:underline">
          Back to my diagnosis
        </Link>
        <Link href="/refund-policy" className="text-[var(--primary-text)] hover:underline">
          Refund and cancellation policy
        </Link>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="text-muted-foreground hover:underline">
            Dismiss
          </button>
        )}
      </div>
    </section>
  );
}
