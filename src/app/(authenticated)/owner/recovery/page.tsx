"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Input, Select, CardDashboardSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
import { BUSINESS_TYPE_OPTIONS } from "@/domain/owner-mode/owner-data-hub";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { useActiveBusiness } from "@/context/active-business-context";

import { humanizeMetricKey } from "@/lib/metric-label";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic dashboard payloads are untyped; load() fetch-on-mount is intentional */

const SEVERITY_VARIANT: Record<string, "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  low: "muted-accessible",
  medium: "default-accessible",
  high: "warning-accessible",
  critical: "destructive-accessible",
};
const SEVERITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const VERIFY_VARIANT: Record<string, "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  unverified: "muted-accessible",
  verified_improved: "success-accessible",
  verified_not_improved: "destructive-accessible",
  inconclusive: "warning-accessible",
  disputed: "warning-accessible",
};
const VERIFY_LABEL: Record<string, string> = {
  unverified: "Not yet verified",
  verified_improved: "Verified — improved",
  verified_not_improved: "Verified — no improvement",
  inconclusive: "Inconclusive",
  disputed: "Disputed",
};
const ACTION_STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
};
// healthFromFindings (src/services/founder-recovery/cycle.service.ts) computes exactly these
// three lowercase snake_case values -- never rendered through a plain-language map before.
const HEALTH_STATUS_LABEL: Record<string, string> = {
  critical: "Critical",
  at_risk: "At risk",
  healthy: "Healthy",
};
// Verified against ActionPriority in src/domain/founder-recovery/types.ts
// (produced by priorityFor() in recovery-actions.ts).
const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

const METRIC_FIELDS: Array<{ name: string; label: string }> = [
  { name: "revenue", label: "Revenue" },
  { name: "totalCosts", label: "Total costs" },
  { name: "netProfit", label: "Net profit" },
  { name: "grossProfit", label: "Gross profit" },
  { name: "orderCount", label: "Order count" },
  { name: "b2cRevenue", label: "B2C revenue" },
  { name: "b2bRevenue", label: "B2B revenue" },
  { name: "newCustomers", label: "New customers" },
  { name: "repeatCustomers", label: "Repeat customers" },
  { name: "averageOrderValue", label: "Avg order value" },
  { name: "discountAmount", label: "Discount amount" },
  { name: "refundAmount", label: "Refund amount" },
  { name: "rewashCount", label: "Rewash count" },
  { name: "complaintCount", label: "Complaint count" },
  { name: "receivables", label: "Receivables" },
  { name: "deliveryCost", label: "Delivery cost" },
  { name: "marketingSpend", label: "Marketing spend" },
  { name: "campaignConversions", label: "Campaign conversions" },
  { name: "averageTurnaroundHours", label: "Turnaround (hours)" },
  { name: "staffCost", label: "Staff cost" },
];

export default function OwnerRecoveryPage() {
  const { businesses, activeBusinessId, needsBusinessRecovery, setActiveBusinessId, refreshBusinesses, loading: contextLoading } = useActiveBusiness();
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBusinessForm, setShowBusinessForm] = useState(false);
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);
  const requestSeq = useRef(0);

  const load = useCallback(async (businessId: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api(`/api/owner/recovery/dashboard?businessId=${businessId}`);
      if (requestSeq.current !== seq) return;
      setDashboard(data);
    } catch (e) {
      if (requestSeq.current !== seq) return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contextLoading) return;
    if (needsBusinessRecovery) return;
    if (!activeBusinessId) { setDashboard(null); setLoading(false); return; }
    void load(activeBusinessId);
  }, [contextLoading, activeBusinessId, needsBusinessRecovery, load]);

  const onSwitchBusiness = useCallback((id: string) => {
    setLoading(true);
    setActiveBusinessId(id);
  }, [setActiveBusinessId]);

  async function createBusiness(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const created = await api("/api/owner/recovery/businesses", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          businessType: fd.get("businessType"),
          location: fd.get("location") || undefined,
          currency: fd.get("currency"),
          b2cSupported: fd.get("b2cSupported") === "yes",
          b2bSupported: fd.get("b2bSupported") === "yes",
        }),
      });
      setShowBusinessForm(false);
      setActiveBusinessId(created.id);
      await refreshBusinesses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create business");
    } finally {
      setBusy(false);
    }
  }

  async function addSnapshot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeBusinessId) return;
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      periodStart: fd.get("periodStart"),
      periodEnd: fd.get("periodEnd"),
      currency: currentBusiness?.currency || fd.get("currency") || "INR",
    };
    for (const f of METRIC_FIELDS) {
      const v = fd.get(f.name);
      if (v && typeof v === "string" && v.trim()) body[f.name] = parseFloat(v);
    }
    try {
      await api(`/api/owner/recovery/businesses/${activeBusinessId}/snapshots`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setShowSnapshotForm(false);
      await load(activeBusinessId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save snapshot");
    } finally {
      setBusy(false);
    }
  }

  async function runCycle() {
    if (!activeBusinessId || !dashboard?.latestSnapshot) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/recovery/businesses/${activeBusinessId}/cycles`, {
        method: "POST",
        body: JSON.stringify({ snapshotId: dashboard.latestSnapshot.id }),
      });
      await load(activeBusinessId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run cycle");
    } finally {
      setBusy(false);
    }
  }

  async function updateAction(action: any, status: string) {
    if (!activeBusinessId) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { status, version: action.version };
      if (status === "completed") {
        body.completionNotes = window.prompt("Completion notes:") || "";
        body.actualOutcome = window.prompt("Actual outcome:") || "";
      }
      await api(`/api/owner/recovery/actions/${action.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await load(activeBusinessId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update action");
    } finally {
      setBusy(false);
    }
  }

  async function verifyAction(action: any) {
    if (!activeBusinessId) return;
    setBusy(true);
    setError(null);
    try {
      const raw = window.prompt(`Enter the AFTER value for ${humanizeMetricKey(action.metricToMove)} (baseline ${action.baselineValue}):`);
      if (raw === null) {
        setBusy(false);
        return;
      }
      const afterValue = raw.trim() === "" ? null : parseFloat(raw);
      await api(`/api/owner/recovery/actions/${action.id}/verify`, {
        method: "POST",
        body: JSON.stringify({ afterValue }),
      });
      await load(activeBusinessId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to verify");
    } finally {
      setBusy(false);
    }
  }

  if (contextLoading || loading) return <CardDashboardSkeleton label="Loading recovery information" />;
  if (needsBusinessRecovery) return (
    <PageContainer>
      <p>Your previously selected business is no longer available. Choose a business to continue.</p>
      <BusinessContextSelector businesses={businesses} selectedId={null} onChange={onSwitchBusiness} />
    </PageContainer>
  );

  const currentBusiness = businesses.find((b) => b.id === activeBusinessId) || null;
  const cycle = dashboard?.latestCycle ?? null;

  return (
    <PageContainer>
      <div className="mb-6">
        <PageHeader
          title="Owner Recovery"
          description="Diagnose, plan, assign, and verify real-business recovery — one cycle at a time."
          actions={<Button onClick={() => setShowBusinessForm((s) => !s)}>+ New business</Button>}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showBusinessForm && (
        <form onSubmit={createBusiness} className="mb-6 border rounded-lg p-4 bg-card space-y-3">
          <h2 className="font-semibold">Create a business</h2>
          <div className="grid grid-cols-2 gap-3">
            <Input name="name" label="Business name" required />
            <Select
              name="businessType"
              label="Business type"
              required
              options={[...BUSINESS_TYPE_OPTIONS]}
            />
            <Input name="location" label="Location" />
            <Input name="currency" label="Currency" defaultValue="INR" required />
            <Select name="b2cSupported" label="B2C supported" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
            <Select name="b2bSupported" label="B2B supported" options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} />
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create business"}</Button>
        </form>
      )}

      {businesses.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No businesses yet. Create your first business to begin a recovery cycle.
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-3">
            <BusinessContextSelector
              businesses={businesses}
              selectedId={activeBusinessId}
              onChange={onSwitchBusiness}
            />
            <Button onClick={() => setShowSnapshotForm((s) => !s)} disabled={!activeBusinessId}>
              + Add metric snapshot
            </Button>
            <Button onClick={runCycle} disabled={!activeBusinessId || !dashboard?.latestSnapshot || busy}>
              Run diagnosis cycle
            </Button>
          </div>

          {showSnapshotForm && (
            <form onSubmit={addSnapshot} className="mb-6 border rounded-lg p-4 bg-card space-y-3">
              <h2 className="font-semibold">
                Metric snapshot {currentBusiness ? `(${currentBusiness.currency})` : ""}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <Input name="periodStart" label="Period start" type="date" required />
                <Input name="periodEnd" label="Period end" type="date" required />
              </div>
              <div className="grid grid-cols-4 gap-3">
                {METRIC_FIELDS.map((f) => (
                  <Input key={f.name} name={f.name} label={f.label} type="number" placeholder="—" />
                ))}
              </div>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save snapshot"}</Button>
            </form>
          )}

          {/* dashboard is set only on a successful load() and is never reset to null on failure
              (see load()'s catch block above), so `dashboard === null` here means only "no
              successful response yet" -- distinct from a successful response confirming no
              snapshot data. Unlike Group A (Finance/Operations/Sales), `businesses` above comes
              from the independently loaded ActiveBusinessContext, not from `dashboard` -- the
              outer `businesses.length === 0` branch is unaffected by this gate. A failed initial
              load must never render "No metric snapshot yet." next to the error banner above:
              that would present unverified emptiness as a fact. A failure AFTER a prior success
              leaves dashboard (and this whole section) exactly as it was -- unaffected. */}
          {dashboard === null ? null : !dashboard.hasData ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              {dashboard.latestSnapshot
                ? "Snapshot recorded. Click “Run diagnosis cycle” to generate findings and a recovery plan."
                : "No metric snapshot yet. Add a snapshot, then run a diagnosis cycle."}
            </div>
          ) : (
            <RecoveryCycleView
              cycle={cycle}
              overdue={dashboard.overdueActions}
              history={dashboard.cycleHistory}
              busy={busy}
              onUpdateAction={updateAction}
              onVerifyAction={verifyAction}
            />
          )}
        </>
      )}
    </PageContainer>
  );
}

function RecoveryCycleView({
  cycle,
  overdue,
  history,
  busy,
  onUpdateAction,
  onVerifyAction,
}: {
  cycle: any;
  overdue: any[];
  history: any[];
  busy: boolean;
  onUpdateAction: (a: any, s: string) => void;
  onVerifyAction: (a: any) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-4 bg-card flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Latest cycle #{cycle.cycleNumber}</div>
          <div className="text-lg font-semibold">{cycle.summary}</div>
        </div>
        <div className="text-right">
          <Badge variant={SEVERITY_VARIANT[cycle.healthStatus === "critical" ? "critical" : cycle.healthStatus === "at_risk" ? "high" : "low"]}>
            {HEALTH_STATUS_LABEL[cycle.healthStatus] ?? cycle.healthStatus} · {Math.round(cycle.healthScore)}/100
          </Badge>
          {overdue.length > 0 && (
            <div className="text-xs text-destructive mt-1">{overdue.length} overdue action(s)</div>
          )}
        </div>
      </div>

      <section className="border rounded-lg p-4 bg-card">
        <h2 className="font-bold mb-3">Findings ({cycle.findings.length})</h2>
        {cycle.findings.length === 0 && <p className="text-sm text-muted-foreground">No threshold breaches.</p>}
        <div className="space-y-3">
          {cycle.findings.map((f: any) => (
            <div key={f.id} className="border-l-4 pl-3 py-1" style={{ borderColor: "#f59e0b" }}>
              <div className="flex justify-between">
                <span className="font-semibold">{f.title}</span>
                <Badge variant={SEVERITY_VARIANT[f.severity]}>{SEVERITY_LABEL[f.severity] ?? f.severity}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Metric:</strong> {humanizeMetricKey(f.sourceMetric)} = {String(f.currentValue)} (threshold {String(f.threshold)})
              </p>
              <p className="text-xs text-muted-foreground"><strong>Evidence:</strong> {f.evidence}</p>
              <p className="text-xs text-muted-foreground"><strong>Why:</strong> {f.whyItMatters}</p>
              {f.impactEstimate != null && (
                <p className="text-xs text-muted-foreground">
                  <strong>Impact:</strong> {f.impactEstimate} {f.impactCurrency}
                </p>
              )}
              <p className="text-xs text-muted-foreground"><strong>Verify via:</strong> {humanizeMetricKey(f.verificationMetric)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded-lg p-4 bg-card">
        <h2 className="font-bold mb-3">Recovery actions ({cycle.actions.length})</h2>
        <div className="space-y-3">
          {cycle.actions.map((a: any) => {
            const latestVerification = a.verifications?.[0];
            return (
              <div key={a.id} className="border rounded p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold">{a.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.assignedToRole} · due {a.dueAt ? new Date(a.dueAt).toLocaleDateString() : "—"} · {PRIORITY_LABEL[a.priority] ?? a.priority}
                    </div>
                  </div>
                  <Badge variant="muted-accessible">{ACTION_STATUS_LABEL[a.status] ?? a.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Move <strong>{humanizeMetricKey(a.metricToMove)}</strong> {a.direction} — baseline {String(a.baselineValue)} → target {String(a.targetValue)} (within {a.verificationWindowDays}d)
                </p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {a.status === "proposed" && <Button onClick={() => onUpdateAction(a, "assigned")} disabled={busy}>Assign</Button>}
                  {a.status === "assigned" && <Button onClick={() => onUpdateAction(a, "in_progress")} disabled={busy}>Start</Button>}
                  {a.status === "in_progress" && <Button onClick={() => onUpdateAction(a, "completed")} disabled={busy}>Complete</Button>}
                  {a.status === "in_progress" && <Button onClick={() => onUpdateAction(a, "blocked")} disabled={busy}>Block</Button>}
                  <Button onClick={() => onVerifyAction(a)} disabled={busy}>Verify outcome</Button>
                </div>
                {latestVerification && (
                  <div className="mt-2 text-xs">
                    <Badge variant={VERIFY_VARIANT[latestVerification.status] || "muted-accessible"}>
                      {VERIFY_LABEL[latestVerification.status] ?? latestVerification.status}
                    </Badge>{" "}
                    <span className="text-muted-foreground">
                      after {String(latestVerification.afterValue)} · movement {String(latestVerification.actualMovement)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="border rounded-lg p-4 bg-card">
        <h2 className="font-bold mb-3">Cycle history</h2>
        <div className="space-y-1 text-sm">
          {history.map((c: any) => (
            <div key={c.id} className="flex justify-between border-b py-1">
              <span>Cycle #{c.cycleNumber} — {new Date(c.createdAt).toLocaleDateString()}</span>
              <span className="text-muted-foreground">
                {HEALTH_STATUS_LABEL[c.healthStatus] ?? c.healthStatus} · {c.findingCount} findings · {c.actionCount} actions
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
