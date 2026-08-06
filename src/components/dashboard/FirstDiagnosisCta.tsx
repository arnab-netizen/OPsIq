import Link from "next/link";

/**
 * Empty-state call-to-action shown on the dashboard when a workspace has no
 * engagements yet. Presentational/navigation only — no data fetching, no
 * business logic. Points new users at their first diagnosis (the core flow).
 */
export default function FirstDiagnosisCta() {
  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-6">
      <h3 className="text-base font-semibold text-foreground">Run your first diagnosis</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Describe your business and OpsIQ will return risks, findings, and a prioritized action plan.
        This first pass uses only what you type here — add your real records in Add &amp; Connect Data
        to make it specific to your business.
      </p>
      <Link
        href="/diagnosis"
        className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        Run your first diagnosis
      </Link>
    </div>
  );
}
