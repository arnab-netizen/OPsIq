import Link from "next/link";
import { cookies } from "next/headers";
import { Badge } from "@/ui/primitives";
import FirstDiagnosisCta from "@/components/dashboard/FirstDiagnosisCta";
import OwnerActivationPanel from "@/components/dashboard/OwnerActivationPanel";
import { getPolicyContext } from "@/services/auth";
import { isSelfServeOwnerContext } from "@/policies/capability-check";

/**
 * F2: resolve the correct "Run your first diagnosis" target server-side, from the SAME centralized
 * policy check every other owner-gate in this app uses (no permission logic duplicated in this page
 * or in FirstDiagnosisCta). A self-serve owner never holds ENGAGEMENT_CREATE, so /diagnosis always
 * 403s for them — /owner/finance is their real, working first-diagnosis flow. Any other actor
 * (consultant/admin) keeps the existing /diagnosis target unchanged.
 */
async function firstDiagnosisHref(): Promise<string> {
  try {
    const policy = await getPolicyContext();
    if (policy && isSelfServeOwnerContext(policy)) return "/owner/finance";
  } catch {
    // Fail closed to the existing (consultant/admin) behavior — never break the dashboard over this.
  }
  return "/diagnosis";
}

// UI-01: this server component fetches its own protected API, which authenticates from
// the session cookie. A server-side fetch does NOT inherit the incoming request cookies,
// so without this the API returned 401 and every list rendered empty (a false-empty
// dashboard). Forward the caller's cookies on every self-fetch.
async function authFetchInit(): Promise<RequestInit> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return { cache: "no-store", headers: { cookie: cookieHeader } };
}

const HEALTH_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  healthy: "success",
  at_risk: "warning",
  critical: "destructive",
  unknown: "muted",
};

const SEVERITY_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  low: "muted",
  medium: "warning",
  high: "warning",
  critical: "destructive",
};

async function fetchEngagements() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/engagements`,
    await authFetchInit()
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data.engagements ?? []);
}

async function fetchAllActions() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/engagements`,
    await authFetchInit()
  );
  if (!res.ok) return [];
  const data = await res.json();
  const engagements: any[] = Array.isArray(data) ? data : (data.engagements ?? []);

  const allActions: any[] = [];
  for (const eng of engagements) {
    const actRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/engagements/${eng.id}/actions`,
      await authFetchInit()
    );
    if (actRes.ok) {
      const acts = await actRes.json();
      allActions.push(...acts.map((a: any) => ({ ...a, engagementId: eng.id, engagementCode: eng.code })));
    }
  }
  return allActions;
}

async function fetchAllFindings() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/engagements`,
    await authFetchInit()
  );
  if (!res.ok) return [];
  const data = await res.json();
  const engagements: any[] = Array.isArray(data) ? data : (data.engagements ?? []);

  const allFindings: any[] = [];
  for (const eng of engagements) {
    const findRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/engagements/${eng.id}/findings`,
      await authFetchInit()
    );
    if (findRes.ok) {
      const finds = await findRes.json();
      allFindings.push(...finds.map((f: any) => ({ ...f, engagementId: eng.id, engagementCode: eng.code })));
    }
  }
  return allFindings;
}

export default async function DashboardPage() {
  const [engagements, allActions, allFindings, diagnosisCtaHref] = await Promise.all([
    fetchEngagements(),
    fetchAllActions(),
    fetchAllFindings(),
    firstDiagnosisHref(),
  ]);

  const activeEngagements = engagements.filter((e: any) => e.status === "active");
  const criticalFindings = allFindings.filter((f: any) => f.severity === "critical");
  const blockedActions = allActions.filter((a: any) => a.status === "blocked");
  const openActions = allActions.filter((a: any) => a.status === "open" || a.status === "in_progress");
  const atRiskEngagements = activeEngagements.filter((e: any) => e.healthStatus === "critical" || e.healthStatus === "at_risk");

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Business intervention overview
      </p>

      {/* ─── Owner activation (self-hides once the minimum data set is complete) ─── */}
      <OwnerActivationPanel />

      {/* ─── KPIs Row ──────────────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <div className="rounded-lg border border-border p-6">
          <p className="text-xs font-medium uppercase text-muted-foreground">Active Engagements</p>
          <p className="mt-2 text-3xl font-bold text-foreground">{activeEngagements.length}</p>
        </div>
        <div className="rounded-lg border border-border p-6">
          <p className="text-xs font-medium uppercase text-muted-foreground">Critical Findings</p>
          <p className="mt-2 text-3xl font-bold text-destructive">{criticalFindings.length}</p>
        </div>
        <div className="rounded-lg border border-border p-6">
          <p className="text-xs font-medium uppercase text-muted-foreground">Open Actions</p>
          <p className="mt-2 text-3xl font-bold text-warning">{openActions.length}</p>
        </div>
        <div className="rounded-lg border border-border p-6">
          <p className="text-xs font-medium uppercase text-muted-foreground">Blocked Actions</p>
          <p className="mt-2 text-3xl font-bold text-destructive">{blockedActions.length}</p>
        </div>
      </div>

      {/* ─── Active Engagements ────────────────────────────────────────── */}
      <div className="mt-8 rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Active Engagements ({activeEngagements.length})
        </h2>
        {activeEngagements.length > 0 ? (
          <div className="mt-4 space-y-3">
            {activeEngagements.slice(0, 5).map((e: any) => (
              <Link
                key={e.id}
                href={`/engagements/${e.id}`}
                className="block rounded-md border border-border p-3 hover:bg-muted/50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">{e.title}</h3>
                    <p className="text-xs text-muted-foreground">{e.client.name}</p>
                  </div>
                  <Badge variant={HEALTH_VARIANTS[e.healthStatus] ?? "muted"}>
                    {e.healthStatus.replace("_", " ")}
                  </Badge>
                </div>
              </Link>
            ))}
            {activeEngagements.length > 5 && (
              <Link href="/engagements" className="text-xs text-[var(--primary-text)] hover:underline">
                View all {activeEngagements.length} engagements →
              </Link>
            )}
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              No active engagements. <Link href="/engagements/new" className="text-[var(--primary-text)] hover:underline">Create one</Link>
            </p>
            <FirstDiagnosisCta href={diagnosisCtaHref} />
          </>
        )}
      </div>

      {/* ─── At-Risk Engagements ───────────────────────────────────────── */}
      {atRiskEngagements.length > 0 && (
        <div className="mt-8 rounded-lg border border-destructive/50 bg-destructive/5 p-6">
          <h2 className="text-lg font-semibold text-destructive">
            ⚠️ At-Risk Engagements ({atRiskEngagements.length})
          </h2>
          <div className="mt-4 space-y-2">
            {atRiskEngagements.map((e: any) => (
              <Link
                key={e.id}
                href={`/engagements/${e.id}`}
                className="block rounded-md border border-destructive/50 bg-background p-2 hover:bg-muted/50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{e.title}</span>
                  <Badge variant="destructive">
                    {e.healthStatus.replace("_", " ")}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ─── Critical Findings ─────────────────────────────────────────── */}
      {criticalFindings.length > 0 && (
        <div className="mt-8 rounded-lg border border-destructive/50 bg-destructive/5 p-6">
          <h2 className="text-lg font-semibold text-destructive">
            🔴 Critical Findings ({criticalFindings.length})
          </h2>
          <div className="mt-4 space-y-2">
            {criticalFindings.slice(0, 5).map((f: any) => (
              <Link
                key={f.id}
                href={`/engagements/${f.engagementId}`}
                className="block rounded-md border border-destructive/50 bg-background p-2 hover:bg-muted/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-foreground">{f.title}</h3>
                    <p className="text-xs text-muted-foreground">{f.engagementCode}</p>
                  </div>
                  <Badge variant="destructive">{f.category}</Badge>
                </div>
              </Link>
            ))}
            {criticalFindings.length > 5 && (
              <p className="text-xs text-muted-foreground">
                ... and {criticalFindings.length - 5} more critical findings
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── Blocked Actions ───────────────────────────────────────────── */}
      {blockedActions.length > 0 && (
        <div className="mt-8 rounded-lg border border-warning/50 bg-warning/5 p-6">
          <h2 className="text-lg font-semibold text-[var(--warning-text)]">
            ⚡ Blocked Actions ({blockedActions.length})
          </h2>
          <div className="mt-4 space-y-2">
            {blockedActions.slice(0, 5).map((a: any) => (
              <Link
                key={a.id}
                href={`/engagements/${a.engagementId}`}
                className="block rounded-md border border-warning/50 bg-background p-2 hover:bg-muted/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-foreground">{a.title}</h3>
                    <p className="text-xs text-muted-foreground">{a.engagementCode}</p>
                    {a.blockageReason && (
                      <p className="mt-1 text-xs text-[var(--warning-text)]">{a.blockageReason}</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ─── Open Actions ──────────────────────────────────────────────── */}
      <div className="mt-8 rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Open Actions ({openActions.length})
        </h2>
        {openActions.length > 0 ? (
          <div className="mt-4 space-y-2">
            {openActions.slice(0, 8).map((a: any) => (
              <Link
                key={a.id}
                href={`/engagements/${a.engagementId}`}
                className="block rounded-md border border-border p-2 hover:bg-muted/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-foreground">{a.title}</h3>
                    <p className="text-xs text-muted-foreground">{a.engagementCode}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={SEVERITY_VARIANTS[a.priority] ?? "muted"}>
                      {a.priority}
                    </Badge>
                    {a.dueDate && (
                      <Badge variant="outline">
                        {new Date(a.dueDate).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                </div>
              </Link>
            ))}
            {openActions.length > 8 && (
              <p className="text-xs text-muted-foreground">
                ... and {openActions.length - 8} more open actions
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No open actions.</p>
        )}
      </div>
    </div>
  );
}

