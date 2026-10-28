import Link from "next/link";
import { PublicLink } from "@/components/navigation/PublicLink";

const SUPPORT_EMAIL = "support@opsiq.solutions";

/**
 * Shared footer for logged-out public pages (homepage, resources). Carries the
 * site-wide crawlable link to /resources alongside the legal/support links.
 */
export function PublicSiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-6 py-8 text-center text-sm text-muted-foreground">
      <p>Free beta &mdash; no credit card required.</p>
      <nav aria-label="Resources, legal, and support" className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <Link href="/resources" className="text-[var(--primary-text)] hover:underline">
          Resources
        </Link>
        <PublicLink href="/pricing" className="text-[var(--primary-text)] hover:underline">
          Pricing
        </PublicLink>
        <PublicLink href="/refund-policy" className="text-[var(--primary-text)] hover:underline">
          Refunds
        </PublicLink>
        <Link href="/privacy" className="text-[var(--primary-text)] hover:underline">
          Privacy
        </Link>
        <Link href="/terms" className="text-[var(--primary-text)] hover:underline">
          Terms
        </Link>
        <PublicLink href="/support" className="text-[var(--primary-text)] hover:underline">
          Support
        </PublicLink>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--primary-text)] hover:underline">
          Contact
        </a>
      </nav>
    </footer>
  );
}
