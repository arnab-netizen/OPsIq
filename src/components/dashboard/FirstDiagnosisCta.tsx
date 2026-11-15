import Link from "next/link";

/**
 * Empty-state call-to-action shown on the dashboard when a workspace has no
 * engagements yet. Presentational/navigation only — no data fetching, no
 * business logic. Points new users at their first diagnosis (the core flow).
 *
 * F2: `POST /api/diagnosis` requires `CAPABILITIES.ENGAGEMENT_CREATE`, which is an
 * `INTERNAL_ONLY_CAPABILITIES` entry the self-serve-owner capability narrowing always strips (see
 * `policies/capability-check.ts`) — that route is the consultant/admin "diagnose a new engagement"
 * flow, not something a self-serve owner ever holds the capability to call, so linking every visitor
 * there unconditionally 403s for owners. Which target is correct is a permission decision, so it is
 * resolved server-side (via the centralized `isSelfServeOwnerContext` policy check) by the caller and
 * passed in here as a plain href — this component stays presentation-only, exactly as before.
 */
export default function FirstDiagnosisCta({ href = "/diagnosis" }: { href?: string }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-6">
      <h3 className="text-base font-semibold text-foreground">Run your first diagnosis</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter what you know. OpsIQ names the main problem the facts support, says how sure it is,
        and gives one thing to do first — or says plainly what it still needs before it can tell.
      </p>
      <Link
        href={href}
        className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        Run your first diagnosis
      </Link>
    </div>
  );
}
