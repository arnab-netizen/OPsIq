import { PublicBetaCta } from "@/components/landing/PublicBetaCta";
import { PRIMARY_CTA_CLASS } from "@/components/landing/cta-styles";

/**
 * Optional invitation shown only under a completed diagnostic result. Presentational only:
 * - using the diagnostic never requires it, and nothing is submitted unless the visitor clicks the shared beta CTA;
 * - the CTA is the existing PublicBetaCta (same admission-mode handling and the same beta-request flow), not a second lead form;
 * - nothing the visitor typed or the result derived from it is read, passed, stored or sent from here.
 */
export function AgencyResultInvitation() {
  return (
    <div data-agency-cta="result" className="mt-6 border-t border-border pt-5">
      <p className="text-sm font-semibold">Optional: want this read from your real numbers over time?</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        You do not need an account to use this tool, and nothing you entered here leaves your browser. If you would like OpsIQ to
        keep an eye on your business numbers, you can ask for beta access below. That is a separate request that starts only if you
        choose it.
      </p>
      <div className="mt-3">
        <PublicBetaCta triggerClassName={`${PRIMARY_CTA_CLASS} w-full sm:w-auto`} />
      </div>
    </div>
  );
}
