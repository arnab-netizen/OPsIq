import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge, Button } from "@/ui/primitives";
import { ReportClient } from "@/ui/report-client";

const SEVERITY_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  critical: "destructive",
  high: "warning",
  medium: "default",
  low: "muted",
};

const PRIORITY_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  critical: "destructive",
  high: "warning",
  medium: "default",
  low: "muted",
};

const TREND_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  improving: "success",
  stagnant: "default",
  worsening: "destructive",
};

interface Report {
  summary: {
    engagementId: string;
    engagementCode: string;
    engagementTitle: string;
    status: string;
    healthStatus: string;
    interventionMode: string;
    currentCondition?: {
      businessStatus: string;
      severityScore: number;
      assessedAt: string;
    };
  };
  findings: Array<{
    id: string;
    title: string;
    severity: string;
    category?: string;
  }>;
  recommendations: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
  }>;
  actions: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    dueDate?: string;
  }>;
  kpis: Array<{
    id: string;
    name: string;
    current?: number;
    target?: number;
    direction?: string;
  }>;
  reviewStatus: {
    trend: "improving" | "stagnant" | "worsening";
    reasoning: string;
    findingCount: number;
    criticalFindingCount: number;
    openActionCount: number;
    completedActionCount: number;
  };
  generatedAt: string;
}

async function fetchReport(engagementId: string): Promise<Report | null> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/engagements/${engagementId}/report`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return res.json();
}

async function fetchEngagement(engagementId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/engagements/${engagementId}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return res.json();
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;
  const [report, engagement] = await Promise.all([
    fetchReport(engagementId),
    fetchEngagement(engagementId),
  ]);

  if (!report || !engagement) notFound();

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/engagements" className="hover:text-foreground">
          Engagements
        </Link>
        <span>/</span>
        <Link href={`/engagements/${engagementId}`} className="hover:text-foreground">
          {engagement.code}
        </Link>
        <span>/</span>
        <span className="text-foreground">Report</span>
      </div>

      {/* Header */}
      <div className="rounded-lg border border-border bg-muted/10 p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">Engagement Report</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {report.summary.engagementCode} — {report.summary.engagementTitle}
            </p>
          </div>
          <ReportClient report={report} engagementId={engagementId} />
        </div>
      </div>

      {/* Report Content */}
      <div className="space-y-6">
        {/* Summary */}
        <section className="rounded-lg border border-border p-6">
          <h2 className="text-xl font-semibold">Summary</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <Badge variant={report.summary.status === "active" ? "success" : "default"}>
                  {report.summary.status}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Health</dt>
              <dd className="mt-1 capitalize">{report.summary.healthStatus}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Intervention Mode</dt>
              <dd className="mt-1 capitalize">{report.summary.interventionMode?.replace("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Generated</dt>
              <dd className="mt-1 text-sm">
                {new Date(report.generatedAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
          {report.summary.currentCondition && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="font-medium text-sm">Business Condition</h3>
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="capitalize">{report.summary.currentCondition.businessStatus}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Severity Score</dt>
                  <dd>{report.summary.currentCondition.severityScore}/10</dd>
                </div>
              </dl>
            </div>
          )}
        </section>

        {/* Review Status */}
        <section className="rounded-lg border border-border p-6">
          <h2 className="text-xl font-semibold">Review Status</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Trend</p>
                <Badge variant={TREND_VARIANTS[report.reviewStatus.trend] ?? "default"} className="mt-2">
                  {report.reviewStatus.trend}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Reasoning</p>
                <p className="mt-2 text-sm font-medium">{report.reviewStatus.reasoning}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Findings</p>
                <p className="mt-2 text-2xl font-bold">{report.reviewStatus.findingCount}</p>
                {report.reviewStatus.criticalFindingCount > 0 && (
                  <p className="mt-1 text-xs text-destructive">
                    {report.reviewStatus.criticalFindingCount} critical
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Actions</p>
                <p className="mt-2 text-2xl font-bold">{report.reviewStatus.openActionCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">open</p>
              </div>
            </div>
          </div>
        </section>

        {/* Findings */}
        <section className="rounded-lg border border-border p-6">
          <h2 className="text-xl font-semibold">Findings ({report.findings.length})</h2>
          {report.findings.length > 0 ? (
            <div className="mt-4 space-y-3">
              {report.findings.map((f) => (
                <div key={f.id} className="rounded-md border border-border/50 p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{f.title}</h3>
                      {f.category && (
                        <p className="mt-1 text-xs text-muted-foreground">{f.category}</p>
                      )}
                    </div>
                    <Badge variant={SEVERITY_VARIANTS[f.severity] ?? "muted"} className="ml-2">
                      {f.severity}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No findings recorded.</p>
          )}
        </section>

        {/* Recommendations */}
        <section className="rounded-lg border border-border p-6">
          <h2 className="text-xl font-semibold">Recommendations ({report.recommendations.length})</h2>
          {report.recommendations.length > 0 ? (
            <div className="mt-4 space-y-3">
              {report.recommendations.map((r) => (
                <div key={r.id} className="rounded-md border border-border/50 p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{r.title}</h3>
                      <div className="mt-2 flex gap-2">
                        <Badge variant={PRIORITY_VARIANTS[r.priority] ?? "muted"} className="text-xs">
                          {r.priority}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {r.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No recommendations generated.</p>
          )}
        </section>

        {/* Actions */}
        <section className="rounded-lg border border-border p-6">
          <h2 className="text-xl font-semibold">Actions ({report.actions.length})</h2>
          {report.actions.length > 0 ? (
            <div className="mt-4 space-y-3">
              {report.actions.map((a) => (
                <div key={a.id} className="rounded-md border border-border/50 p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{a.title}</h3>
                      <div className="mt-2 flex gap-2">
                        <Badge variant={PRIORITY_VARIANTS[a.priority] ?? "muted"} className="text-xs">
                          {a.priority}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {a.status}
                        </Badge>
                      </div>
                      {a.dueDate && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Due: {new Date(a.dueDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No actions defined.</p>
          )}
        </section>

        {/* KPIs */}
        {report.kpis.length > 0 && (
          <section className="rounded-lg border border-border p-6">
            <h2 className="text-xl font-semibold">KPIs ({report.kpis.length})</h2>
            <div className="mt-4 space-y-3">
              {report.kpis.map((k) => (
                <div key={k.id} className="rounded-md border border-border/50 p-3">
                  <h3 className="font-medium text-sm">{k.name}</h3>
                  <div className="mt-2 grid gap-2 text-sm">
                    {k.current !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Current</span>
                        <span className="font-medium">{k.current}</span>
                      </div>
                    )}
                    {k.target !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Target</span>
                        <span className="font-medium">{k.target}</span>
                      </div>
                    )}
                    {k.direction && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Direction</span>
                        <span className="font-medium capitalize">{k.direction}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Back Button */}
      <div className="flex items-center gap-2">
        <Link href={`/engagements/${engagementId}`}>
          <Button variant="outline">Back to Engagement</Button>
        </Link>
      </div>
    </div>
  );
}
