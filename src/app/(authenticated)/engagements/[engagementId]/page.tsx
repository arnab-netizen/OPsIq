import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/ui/primitives";
import { InterventionStateDisplay } from "@/ui/intervention-state-display";

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  draft: "muted",
  active: "success",
  paused: "warning",
  completed: "default",
  cancelled: "destructive",
  archived: "muted",
};

const HEALTH_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  healthy: "success",
  at_risk: "warning",
  critical: "destructive",
  unknown: "muted",
};

const CONDITION_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  critical: "destructive",
  distressed: "destructive",
  challenged: "warning",
  stable: "default",
  improving: "success",
  strong: "success",
};

const PHASE_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  assessment: "default",
  planning: "default",
  execution: "success",
  review: "warning",
  handover: "warning",
  closed: "muted",
};

async function fetchEngagement(engagementId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/engagements/${engagementId}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return res.json();
}

async function fetchFindings(engagementId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/engagements/${engagementId}/findings`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  return res.json();
}

async function fetchRecommendations(engagementId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/engagements/${engagementId}/recommendations`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  return res.json();
}

async function fetchActions(engagementId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/engagements/${engagementId}/actions`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  return res.json();
}

async function fetchKPIs(engagementId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/engagements/${engagementId}/kpis`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  return res.json();
}

async function fetchDeliverables(engagementId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/deliverables?engagementId=${engagementId}`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  return res.json();
}

export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;
  const [engagement, findings, recommendations, actions, kpis, deliverables] = await Promise.all([
    fetchEngagement(engagementId),
    fetchFindings(engagementId),
    fetchRecommendations(engagementId),
    fetchActions(engagementId),
    fetchKPIs(engagementId),
    fetchDeliverables(engagementId),
  ]);

  if (!engagement) notFound();

  const currentCondition = engagement.conditionProfiles?.[0] ?? null;
  const openActions = actions.filter((a: any) => a.status === "open" || a.status === "in_progress");
  const criticalFindings = findings.filter((f: any) => f.severity === "critical");
  const kpisWithMovement = kpis.filter((k: any) => k.currentValue !== null && k.baseline !== null);

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/engagements" className="hover:text-foreground">Engagements</Link>
        <span>/</span>
        <span className="text-foreground">{engagement.code}</span>
      </div>

      {/* ─── Engagement Summary Header ──────────────────────────────── */}
      <div className="mt-4 rounded-lg border border-border bg-muted/10 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{engagement.code}</span>
              <Badge variant={STATUS_VARIANTS[engagement.status] ?? "muted"}>
                {engagement.status}
              </Badge>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{engagement.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <Link href={`/clients/${engagement.client.id}`} className="text-primary hover:underline">
                {engagement.client.name}
              </Link>
              {engagement.client.industry && ` — ${engagement.client.industry}`}
            </p>
          </div>
        </div>

        {/* Key indicators row */}
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Health</p>
            <div className="mt-1">
              <Badge variant={HEALTH_VARIANTS[engagement.healthStatus] ?? "muted"}>
                {engagement.healthStatus.replace("_", " ")}
              </Badge>
            </div>
          </div>
          <InterventionStateDisplay
            mode={engagement.interventionMode}
            phase={engagement.interventionPhase}
          />
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Business Condition</p>
            <div className="mt-1">
              {currentCondition ? (
                <Badge variant={CONDITION_VARIANTS[currentCondition.businessStatus] ?? "muted"}>
                  {currentCondition.businessStatus} ({currentCondition.severityScore}/10)
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">Not assessed</span>
              )}
            </div>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Service Tier</p>
            <p className="mt-1 text-sm font-medium text-foreground capitalize">
              {engagement.serviceTier}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Detail Sections ────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">Details</h2>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-sm text-muted-foreground">Engagement Mode</dt>
              <dd className="text-sm font-medium text-foreground capitalize">{engagement.engagementMode}</dd>
            </div>
            {engagement.description && (
              <div>
                <dt className="text-sm text-muted-foreground">Description</dt>
                <dd className="text-sm text-foreground whitespace-pre-wrap">{engagement.description}</dd>
              </div>
            )}
            {engagement.startDate && (
              <div>
                <dt className="text-sm text-muted-foreground">Start Date</dt>
                <dd className="text-sm font-medium text-foreground">
                  {new Date(engagement.startDate).toLocaleDateString()}
                </dd>
              </div>
            )}
            {engagement.targetEndDate && (
              <div>
                <dt className="text-sm text-muted-foreground">Target End Date</dt>
                <dd className="text-sm font-medium text-foreground">
                  {new Date(engagement.targetEndDate).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Intervention State */}
        <div className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">Intervention State</h2>
          {engagement.interventionMode && engagement.interventionPhase ? (
            <dl className="mt-4 space-y-3">
              <div>
                <dt className="text-sm text-muted-foreground">Mode</dt>
                <dd className="mt-1">
                  <Badge variant="default">
                    {engagement.interventionMode.replace("_", " ")}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Phase</dt>
                <dd className="mt-1">
                  <Badge variant="default">
                    {engagement.interventionPhase.replace("_", " ")}
                  </Badge>
                </dd>
              </div>
              <div className="text-xs text-muted-foreground">
                <p>
                  Mode reflects the chosen intervention approach.
                  Phase indicates the current stage in the structured intervention process.
                </p>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Intervention state has not been set yet.
            </p>
          )}
        </div>

        {/* Business Condition Profile */}
        <div className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">Business Condition</h2>
          {currentCondition ? (
            <dl className="mt-4 space-y-2">
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={CONDITION_VARIANTS[currentCondition.businessStatus] ?? "muted"}>
                    {currentCondition.businessStatus}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Severity</dt>
                <dd className="text-sm font-medium text-foreground">{currentCondition.severityScore}/10</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Urgency</dt>
                <dd className="text-sm font-medium text-foreground capitalize">{currentCondition.urgencyLevel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Cash Pressure</dt>
                <dd className="text-sm font-medium text-foreground capitalize">{currentCondition.cashPressureLevel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Margin Pressure</dt>
                <dd className="text-sm font-medium text-foreground capitalize">{currentCondition.marginPressureLevel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Process Maturity</dt>
                <dd className="text-sm font-medium text-foreground capitalize">{currentCondition.processMaturityLevel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Resilience</dt>
                <dd className="text-sm font-medium text-foreground capitalize">{currentCondition.resilienceLevel}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No business condition assessment has been recorded yet.
            </p>
          )}
        </div>

        {/* Intervention Phase */}
        <div className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">Intervention Phase</h2>
          {engagement.interventionState ? (
            <dl className="mt-4 space-y-2">
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Current Phase</dt>
                <dd>
                  <Badge variant={PHASE_VARIANTS[engagement.interventionState.currentPhase] ?? "muted"}>
                    {engagement.interventionState.currentPhase.replace("_", " ")}
                  </Badge>
                </dd>
              </div>
              {engagement.interventionState.previousPhase && (
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Previous Phase</dt>
                  <dd className="text-sm text-muted-foreground">
                    {engagement.interventionState.previousPhase.replace("_", " ")}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Intervention phase not yet initialized.
            </p>
          )}
        </div>

        {/* Team Members */}
        <div className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">
            Team ({engagement.memberships?.length ?? 0})
          </h2>
          {engagement.memberships && engagement.memberships.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {engagement.memberships.map((m: {
                id: string;
                role: string;
                user: { id: string; name: string | null; email: string };
              }) => (
                <li key={m.id} className="flex items-center justify-between rounded-md border border-border p-2">
                  <span className="text-sm text-foreground">{m.user.name ?? m.user.email}</span>
                  <Badge variant="outline">{m.role.replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No team members assigned.</p>
          )}
        </div>

        {/* Lineage */}
        {(engagement.parent || (engagement.children && engagement.children.length > 0)) && (
          <div className="rounded-lg border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground">Engagement Lineage</h2>
            {engagement.parent && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Parent</p>
                <Link
                  href={`/engagements/${engagement.parent.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  {engagement.parent.code} — {engagement.parent.title}
                </Link>
              </div>
            )}
            {engagement.children && engagement.children.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Children</p>
                <ul className="mt-1 space-y-1">
                  {engagement.children.map((child: { id: string; code: string; title: string; status: string }) => (
                    <li key={child.id}>
                      <Link
                        href={`/engagements/${child.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {child.code} — {child.title}
                      </Link>
                      <Badge variant={STATUS_VARIANTS[child.status] ?? "muted"} className="ml-2">
                        {child.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Findings Section ──────────────────────────────────────────── */}
      <div className="mt-8 rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Findings ({findings.length})
        </h2>
        {findings.length > 0 ? (
          <div className="mt-4 space-y-3">
            {findings.slice(0, 5).map((f: any) => (
              <div key={f.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-foreground">{f.title}</h3>
                    {f.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <Badge variant={SEVERITY_VARIANTS[f.severity] ?? "muted"}>
                        {f.severity}
                      </Badge>
                      <Badge variant="outline">{f.category}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {findings.length > 5 && (
              <p className="text-xs text-muted-foreground">... and {findings.length - 5} more findings</p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No findings recorded.</p>
        )}
      </div>

      {/* ─── Recommendations Section ────────────────────────────────────── */}
      <div className="mt-8 rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Recommendations ({recommendations.length})
        </h2>
        {recommendations.length > 0 ? (
          <div className="mt-4 space-y-3">
            {recommendations.slice(0, 5).map((r: any) => (
              <div key={r.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-foreground">{r.title}</h3>
                    {r.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <Badge variant={SEVERITY_VARIANTS[r.priority] ?? "muted"}>
                        {r.priority}
                      </Badge>
                      <Badge variant={STATUS_BADGE_VARIANTS[r.status] ?? "muted"}>
                        {r.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {recommendations.length > 5 && (
              <p className="text-xs text-muted-foreground">... and {recommendations.length - 5} more recommendations</p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No recommendations yet.</p>
        )}
      </div>

      {/* ─── Actions Section ───────────────────────────────────────────── */}
      <div className="mt-8 rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Open Actions ({openActions.length})
        </h2>
        {openActions.length > 0 ? (
          <div className="mt-4 space-y-3">
            {openActions.slice(0, 5).map((a: any) => (
              <div key={a.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-foreground">{a.title}</h3>
                    {a.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <Badge variant={SEVERITY_VARIANTS[a.priority] ?? "muted"}>
                        {a.priority}
                      </Badge>
                      <Badge variant={STATUS_BADGE_VARIANTS[a.status] ?? "muted"}>
                        {a.status}
                      </Badge>
                      {a.dueDate && (
                        <Badge variant="outline">
                          Due: {new Date(a.dueDate).toLocaleDateString()}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {openActions.length > 5 && (
              <p className="text-xs text-muted-foreground">... and {openActions.length - 5} more open actions</p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No open actions.</p>
        )}
      </div>

      {/* ─── KPIs Section ──────────────────────────────────────────────── */}
      <div className="mt-8 rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Key Performance Indicators ({kpis.length})
        </h2>
        {kpis.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {kpis.slice(0, 4).map((k: any) => (
              <div key={k.id} className="rounded-md border border-border p-3">
                <h3 className="text-sm font-medium text-foreground">{k.name}</h3>
                <dl className="mt-2 space-y-1 text-xs">
                  {k.currentValue !== null && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Current:</dt>
                      <dd className="font-medium text-foreground">
                        {k.currentValue}{k.unit ? ` ${k.unit}` : ""}
                      </dd>
                    </div>
                  )}
                  {k.baseline !== null && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Baseline:</dt>
                      <dd className="font-medium text-foreground">
                        {k.baseline}{k.unit ? ` ${k.unit}` : ""}
                      </dd>
                    </div>
                  )}
                  {k.targetValue !== null && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Target:</dt>
                      <dd className="font-medium text-foreground">
                        {k.targetValue}{k.unit ? ` ${k.unit}` : ""}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No KPIs defined yet.</p>
        )}
      </div>

      {/* ─── Deliverables Section ──────────────────────────────────────── */}
      <div className="mt-8 rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Deliverables ({deliverables.length})
        </h2>
        {deliverables.length > 0 ? (
          <div className="mt-4 space-y-2">
            {deliverables.map((d: any) => (
              <Link
                key={d.id}
                href={`/deliverables/${d.id}`}
                className="block rounded-md border border-border p-3 hover:bg-muted/50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">{d.title}</h3>
                    <p className="text-xs text-muted-foreground capitalize">{d.type.replace(/_/g, " ")}</p>
                  </div>
                  <Badge variant={STATUS_BADGE_VARIANTS[d.reviewStatus] ?? "muted"}>
                    {d.reviewStatus.replace(/_/g, " ")}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No deliverables yet.</p>
        )}
      </div>
    </div>
  );
}
