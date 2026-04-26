import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/ui/primitives";
import { InterventionStateDisplay } from "@/ui/intervention-state-display";
import { EngagementWorkspace } from "@/ui/engagement-workspace";

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

async function fetchEvidence(engagementId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/evidence?engagementId=${engagementId}&limit=100`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
}

export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;
  const [engagement, findings, recommendations, actions, kpis, evidence] = await Promise.all([
    fetchEngagement(engagementId),
    fetchFindings(engagementId),
    fetchRecommendations(engagementId),
    fetchActions(engagementId),
    fetchKPIs(engagementId),
    fetchEvidence(engagementId),
  ]);

  if (!engagement) notFound();

  const currentCondition = engagement.conditionProfiles?.[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/engagements" className="hover:text-foreground">
          Engagements
        </Link>
        <span>/</span>
        <span className="text-foreground">{engagement.code}</span>
      </div>

      {/* Header */}
      <div className="rounded-lg border border-border bg-muted/10 p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{engagement.code}</span>
              <Badge variant={STATUS_VARIANTS[engagement.status] ?? "muted"}>
                {engagement.status}
              </Badge>
            </div>
            <h1 className="mt-2 text-3xl font-bold text-foreground">{engagement.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              <Link href={`/clients/${engagement.client.id}`} className="text-primary hover:underline">
                {engagement.client.name}
              </Link>
              {engagement.client.industry && ` — ${engagement.client.industry}`}
            </p>
          </div>
        </div>

        {/* Key Indicators */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Health</p>
            <div className="mt-2">
              <Badge variant={HEALTH_VARIANTS[engagement.healthStatus] ?? "muted"}>
                {engagement.healthStatus.replace("_", " ")}
              </Badge>
            </div>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <InterventionStateDisplay
              mode={engagement.interventionMode}
              phase={engagement.interventionPhase}
            />
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Business Condition</p>
            <div className="mt-2">
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
            <p className="mt-2 text-sm font-medium text-foreground capitalize">{engagement.serviceTier}</p>
          </div>
        </div>
      </div>

      {/* Workspace */}
      <EngagementWorkspace
        engagement={engagement}
        initialFindings={findings}
        initialRecommendations={recommendations}
        initialActions={actions}
        initialKPIs={kpis}
        initialEvidence={evidence}
      />
    </div>
  );
}
