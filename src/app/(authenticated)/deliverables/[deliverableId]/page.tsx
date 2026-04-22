import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/ui/primitives";

const STATUS_BADGE_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  draft: "muted",
  under_review: "warning",
  approved: "success",
  delivered: "success",
};

async function fetchDeliverable(deliverableId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/deliverables/${deliverableId}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return res.json();
}

export default async function DeliverableDetailPage({
  params,
}: {
  params: Promise<{ deliverableId: string }>;
}) {
  const { deliverableId } = await params;
  const deliverable = await fetchDeliverable(deliverableId);

  if (!deliverable) notFound();

  const findings = deliverable.findings
    ? JSON.parse(deliverable.findings)
    : [];
  const recommendations = deliverable.recommendations
    ? JSON.parse(deliverable.recommendations)
    : [];
  const actions = deliverable.actions
    ? JSON.parse(deliverable.actions)
    : [];
  const kpis = deliverable.kpis
    ? JSON.parse(deliverable.kpis)
    : [];

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/engagements/${deliverable.engagement.id}`} className="hover:text-foreground">
          {deliverable.engagement.code}
        </Link>
        <span>/</span>
        <span className="text-foreground">Deliverables</span>
        <span>/</span>
        <span className="text-foreground">{deliverable.title}</span>
      </div>

      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="mt-4 rounded-lg border border-border bg-muted/10 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{deliverable.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <Link href={`/clients/${deliverable.engagement.client.id}`} className="text-primary hover:underline">
                {deliverable.engagement.client.name}
              </Link>
              {" "} — {deliverable.engagement.title}
            </p>
          </div>
          <div>
            <Badge variant={STATUS_BADGE_VARIANTS[deliverable.reviewStatus] ?? "muted"}>
              {deliverable.reviewStatus.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Type</p>
            <p className="mt-1 text-sm font-medium text-foreground capitalize">
              {deliverable.type.replace(/_/g, " ")}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Created</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {new Date(deliverable.createdAt).toLocaleDateString()}
            </p>
          </div>
          {deliverable.reviewedAt && (
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Reviewed</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {new Date(deliverable.reviewedAt).toLocaleDateString()}
              </p>
            </div>
          )}
          {deliverable.deliveredDate && (
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Delivered</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {new Date(deliverable.deliveredDate).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Summary ────────────────────────────────────────────────── */}
      {deliverable.summary && (
        <div className="mt-8 rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">Summary</h2>
          <p className="mt-4 text-sm text-foreground whitespace-pre-wrap">
            {deliverable.summary}
          </p>
        </div>
      )}

      {/* ─── Findings ───────────────────────────────────────────────── */}
      <div className="mt-8 rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Findings ({typeof findings === "object" ? Object.keys(findings).length : 0})
        </h2>
        {findings && typeof findings === "object" && Object.keys(findings).length > 0 ? (
          <div className="mt-4 space-y-3">
            {Object.entries(findings).map(([key, value]: [string, any]) => (
              <div key={key} className="rounded-md border border-border p-3">
                <h3 className="text-sm font-medium text-foreground">{value.title || value}</h3>
                {value.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{value.description}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No findings included in this deliverable.</p>
        )}
      </div>

      {/* ─── Recommendations ────────────────────────────────────────── */}
      <div className="mt-8 rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Recommendations ({typeof recommendations === "object" ? Object.keys(recommendations).length : 0})
        </h2>
        {recommendations && typeof recommendations === "object" && Object.keys(recommendations).length > 0 ? (
          <div className="mt-4 space-y-3">
            {Object.entries(recommendations).map(([key, value]: [string, any]) => (
              <div key={key} className="rounded-md border border-border p-3">
                <h3 className="text-sm font-medium text-foreground">{value.title || value}</h3>
                {value.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{value.description}</p>
                )}
                {value.expectedImpact && (
                  <p className="mt-2 text-xs text-foreground">
                    <span className="text-muted-foreground">Impact: </span>{value.expectedImpact}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No recommendations included in this deliverable.</p>
        )}
      </div>

      {/* ─── Actions ────────────────────────────────────────────────── */}
      <div className="mt-8 rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Actions ({typeof actions === "object" ? Object.keys(actions).length : 0})
        </h2>
        {actions && typeof actions === "object" && Object.keys(actions).length > 0 ? (
          <div className="mt-4 space-y-3">
            {Object.entries(actions).map(([key, value]: [string, any]) => (
              <div key={key} className="rounded-md border border-border p-3">
                <h3 className="text-sm font-medium text-foreground">{value.title || value}</h3>
                {value.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{value.description}</p>
                )}
                {value.dueDate && (
                  <p className="mt-2 text-xs text-foreground">
                    <span className="text-muted-foreground">Due: </span>
                    {new Date(value.dueDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No actions included in this deliverable.</p>
        )}
      </div>

      {/* ─── KPIs ──────────────────────────────────────────────────── */}
      <div className="mt-8 rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Key Performance Indicators ({typeof kpis === "object" ? Object.keys(kpis).length : 0})
        </h2>
        {kpis && typeof kpis === "object" && Object.keys(kpis).length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {Object.entries(kpis).map(([key, value]: [string, any]) => (
              <div key={key} className="rounded-md border border-border p-3">
                <h3 className="text-sm font-medium text-foreground">{value.name || value}</h3>
                {value.currentValue && (
                  <p className="mt-1 text-xs">
                    <span className="text-muted-foreground">Current: </span>
                    <span className="font-medium text-foreground">{value.currentValue}</span>
                  </p>
                )}
                {value.targetValue && (
                  <p className="mt-1 text-xs">
                    <span className="text-muted-foreground">Target: </span>
                    <span className="font-medium text-foreground">{value.targetValue}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No KPIs included in this deliverable.</p>
        )}
      </div>

      {/* ─── Review Info ────────────────────────────────────────────── */}
      {deliverable.reviewedAt && (
        <div className="mt-8 rounded-lg border border-border bg-muted/10 p-6">
          <h2 className="text-lg font-semibold text-foreground">Review Information</h2>
          <dl className="mt-4 space-y-2">
            <div className="flex justify-between">
              <dt className="text-sm text-muted-foreground">Review Status</dt>
              <dd>
                <Badge variant={STATUS_BADGE_VARIANTS[deliverable.reviewStatus] ?? "muted"}>
                  {deliverable.reviewStatus.replace(/_/g, " ")}
                </Badge>
              </dd>
            </div>
            {deliverable.reviewedAt && (
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Reviewed At</dt>
                <dd className="text-sm font-medium text-foreground">
                  {new Date(deliverable.reviewedAt).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
