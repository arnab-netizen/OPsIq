/**
 * /diagnosis — consultant quick-intake diagnosis.
 *
 * Server-side gate: the form is rendered only when resolveDiagnosisAccess() — the same capability
 * and plan checks the POST /api/diagnosis path enforces — allows it, so page visibility and API
 * permission always agree. Everyone else gets a truthful explanation instead of a form that would
 * fail on submit: a self-serve owner is pointed to their Owner diagnosis; a workspace whose plan
 * lacks engagements is told so; any other role is told the tool needs consultant access.
 */
import Link from "next/link";
import { resolveDiagnosisAccess } from "@/services/diagnosis-access";
import DiagnosisClient from "@/components/diagnosis/DiagnosisClient";

export const dynamic = "force-dynamic";

export default async function DiagnosisPage() {
  const { state: access, canAddClients } = await resolveDiagnosisAccess();
  if (access === "allowed") return <DiagnosisClient canAddClients={canAddClients} />;

  return (
    <div className="mx-auto max-w-2xl py-8" data-testid="diagnosis-access-denied" data-access={access}>
      <h1 className="text-3xl font-bold text-foreground mb-2">Quick diagnosis</h1>
      {access === "owner" ? (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="font-medium">This is a consultant tool and isn&apos;t part of your Owner account.</p>
          <p className="text-sm text-muted-foreground">
            Your business is diagnosed from your own figures in the Owner area — start with Finance, or see everything
            that needs attention on Home.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/owner/finance" className="font-medium underline hover:no-underline">
              Diagnose my finances →
            </Link>
            <Link href="/owner/home" className="font-medium underline hover:no-underline">
              Go to Home →
            </Link>
          </div>
        </div>
      ) : access === "unavailable" ? (
        <div className="rounded-lg border bg-card p-4" role="alert">
          <p className="font-medium">Couldn&apos;t check your access right now.</p>
          <p className="text-sm text-muted-foreground mt-1">Reload the page to try again.</p>
        </div>
      ) : access === "not_in_plan" ? (
        <div className="rounded-lg border bg-card p-4">
          <p className="font-medium">Quick diagnosis isn&apos;t included in this workspace&apos;s plan.</p>
          <p className="text-sm text-muted-foreground mt-1">
            It creates a consulting engagement, and the current plan doesn&apos;t include engagements. Contact your
            workspace admin to change the plan.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-4">
          <p className="font-medium">You don&apos;t have access to the quick diagnosis tool.</p>
          <p className="text-sm text-muted-foreground mt-1">
            It creates a consulting engagement, which needs consultant access. Contact your workspace admin if you need it.
          </p>
        </div>
      )}
    </div>
  );
}
