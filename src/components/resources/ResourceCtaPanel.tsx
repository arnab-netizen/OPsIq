import type { ReactNode } from "react";
import { BetaAccessCta } from "@/components/landing/BetaAccessCta";
import { PRIMARY_CTA_CLASS } from "@/components/landing/cta-styles";

/**
 * Call-to-action panel for resource pages. Presentational only: the button is
 * the existing BetaAccessCta (same modal, same POST /api/beta-requests flow,
 * same validation and accessibility) — never a second lead form.
 */
export function ResourceCtaPanel({ heading, children }: { heading: ReactNode; children?: ReactNode }) {
  return (
    <section className="mt-10 rounded-xl border border-border bg-muted px-6 py-6 text-foreground">
      <p className="font-display text-xl font-bold tracking-tight">{heading}</p>
      {/* Full foreground on the tinted panel: muted-foreground on bg-muted is below AA 4.5:1. */}
      <div>{children}</div>
      <div className="mt-5">
        <BetaAccessCta triggerClassName={`${PRIMARY_CTA_CLASS} w-full sm:w-auto`} />
      </div>
    </section>
  );
}

/** The standard closing CTA shown on the resource index and at the end of every article. */
export function ResourceDefaultCta() {
  return (
    <ResourceCtaPanel heading="See what OpsIQ finds in your business.">
      <p className="mt-2 text-sm leading-relaxed">
        OpsIQ reads your business numbers, tells you what needs attention and why, and gives you an ordered plan for
        what to do next. Free during the invite-only beta, no credit card required.
      </p>
    </ResourceCtaPanel>
  );
}
