"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Input, Select } from "@/ui/primitives";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic dashboard payloads are untyped; load() fetch-on-mount is intentional */

const SEVERITY_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  low: "muted",
  medium: "default",
  high: "warning",
  critical: "destructive",
};

const VERIFY_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  unverified: "muted",
  verified_improved: "success",
  verified_not_improved: "destructive",
  inconclusive: "warning",
  disputed: "warning",
};

const STATE_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  SMOOTH: "success",
  STEADY: "default",
  STRAINED: "warning",
  BOTTLENECKED: "destructive",
  OVERLOADED: "destructive",
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

// Field names match operationsSnapshotCreateSchema (Slice 5).
const OPERATIONS_FIELDS: Array<{ name: string; label: string }> = [
  { name: "ordersReceived", label: "Orders received" },
  { name: "ordersCompleted", label: "Orders completed" },
  { name: "ordersDelayed", label: "Orders delayed" },
  { name: "reworkCount", label: "Rework count" },
  { name: "complaints", label: "Complaints" },
  { name: "staffHours", label: "Staff hours" },
  { name: "machineCapacityUnits", label: "Machine capacity (units)" },
  { name: "idleHours", label: "Idle hours" },
  { name: "deliveryAttempts", label: "Delivery attempts" },
  { name: "deliveryFailures", label: "Delivery failures" },
  { name: "inventoryShortages", label: "Inventory shortages" },
  { name: "sopChecks", label: "SOP checks expected" },
  { name: "sopMisses", label: "SOP misses" },
];

export default function OwnerOperationsPage() {
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showBusinessForm, setShowBusinessForm] = useState(false);
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);
  const [showCapacityForm, setShowCapacityForm] = useState(false);
  const [showWorkloadForm, setShowWorkloadForm] = useState(false);
  const [capacityResult, setCapacityResult] = useState<string | null>(null);
  const [workloadResult, setWorkloadResult] = useState<string | null>(null);

  const load = useCallback(async (businessId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = businessId ? `?businessId=${businessId}` : "";
      const data = await api(`/api/owner/operations/dashboard${qs}`);
      setDashboard(data);
      setSelected(data.selectedBusinessId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createBusiness(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      // Operations reuses OwnerBusiness; create via the shared recovery businesses route.
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
      await load(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create business");
    } finally {
      setBusy(false);
    }
  }

  async function addSnapshot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      periodStart: fd.get("periodStart"),
      periodEnd: fd.get("periodEnd"),
      currency: currentBusiness?.currency || fd.get("currency") || "INR",
    };
    const model = fd.get("businessModel");
    if (model && typeof model === "string" && model.trim()) body.businessModel = model;
    for (const f of OPERATIONS_FIELDS) {
      const v = fd.get(f.name);
      if (v && typeof v === "string" && v.trim()) body[f.name] = parseFloat(v);
    }
    try {
      await api(`/api/owner/operations/businesses/${selected}/snapshots`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setShowSnapshotForm(false);
      await load(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save snapshot");
    } finally {
      setBusy(false);
    }
  }

  // Critical-domain ingestion (equipment_capacity): feeds the whole-business plan's scaling gate.
  async function addCapacity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    setCapacityResult(null);
    const fd = new FormData(e.currentTarget);
    try {
      const snap = await api(`/api/owner/operations/businesses/${selected}/capacity-snapshots`, {
        method: "POST",
        body: JSON.stringify({
          currentRevenue: parseFloat(String(fd.get("currentRevenue"))),
          resources: [{ type: "primary", utilization: parseFloat(String(fd.get("utilization"))) }],
        }),
      });
      setShowCapacityForm(false);
      setCapacityResult(
        `Capacity saved — bottleneck utilization ${Math.round((snap.bottleneckUtilization ?? 0) * 100)}%; ` +
          `${snap.growthSafe ? "growth headroom available" : "at/over safe capacity"}.`
      );
      await load(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save capacity");
    } finally {
      setBusy(false);
    }
  }

  // Critical-domain ingestion (owner_workload_memory): the mandated human-execution-reality dimension.
  async function addWorkload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    setWorkloadResult(null);
    const fd = new FormData(e.currentTarget);
    try {
      const snap = await api(`/api/owner/operations/businesses/${selected}/workload-snapshots`, {
        method: "POST",
        body: JSON.stringify({
          ownerMinutesPerDay: parseFloat(String(fd.get("ownerMinutesPerDay"))),
          sustainableMinutesPerDay: parseFloat(String(fd.get("sustainableMinutesPerDay"))),
        }),
      });
      setShowWorkloadForm(false);
      setWorkloadResult(`Owner workload saved — daily load ${Math.round(snap.dailyLoadPct ?? 0)}% (band ${snap.band ?? "?"}).`);
      await load(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save workload");
    } finally {
      setBusy(false);
    }
  }

  async function runDiagnosis() {
    if (!selected || !dashboard?.latestSnapshot) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/operations/businesses/${selected}/diagnoses`, {
        method: "POST",
        body: JSON.stringify({ snapshotId: dashboard.latestSnapshot.id }),
      });
      await load(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run diagnosis");
    } finally {
      setBusy(false);
    }
  }

  async function updateAction(action: any, status: string) {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { status };
      if (status === "completed") {
        body.completionNotes = window.prompt("Completion notes:") || "";
        const ev = window.prompt("Completion evidence:") || "";
        body.completionEvidence = ev ? [ev] : [];
      }
      await api(`/api/owner/operations/actions/${action.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await load(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update action");
    } finally {
      setBusy(false);
    }
  }

  async function verifyAction(action: any) {
    setBusy(true);
    setError(null);
    try {
      const beforeRaw = window.prompt(`BEFORE value for ${action.verificationMetric}:`);
      if (beforeRaw === null) { setBusy(false); return; }
      const afterRaw = window.prompt(`AFTER value for ${action.verificationMetric}:`);
      if (afterRaw === null) { setBusy(false); return; }
      const dir = window.prompt("Target direction (up / down):", "up");
      if (dir === null) { setBusy(false); return; }
      await api(`/api/owner/operations/actions/${action.id}/verify`, {
        method: "POST",
        body: JSON.stringify({
          beforeValue: beforeRaw.trim() === "" ? null : parseFloat(beforeRaw),
          afterValue: afterRaw.trim() === "" ? null : parseFloat(afterRaw),
          targetDirection: dir === "down" ? "down" : "up",
        }),
      });
      await load(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to verify");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-8">Loading operations workspace…</div>;

  const businesses: any[] = dashboard?.businesses ?? [];
  const currentBusiness = businesses.find((b) => b.id === selected) || null;
  const cycle = dashboard?.latestCycle ?? null;
  const score = dashboard?.domainScore ?? null;
  const missing: string[] = dashboard?.missingCriticalData ?? [];

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Owner Operations</h1>
          <p className="text-muted-foreground text-sm">
            Where throughput stalls, where the bottleneck is, and what to fix next — with the single highest-impact execution move and verification.
          </p>
        </div>
        <Button onClick={() => setShowBusinessForm((s) => !s)}>+ New business</Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showBusinessForm && (
        <form onSubmit={createBusiness} className="mb-6 border rounded-lg p-4 bg-white space-y-3">
          <h2 className="font-semibold">Create a business</h2>
          <div className="grid grid-cols-2 gap-3">
            <Input name="name" label="Business name" required />
            <Select
              name="businessType"
              label="Business type"
              required
              options={[
                { value: "laundry_local_service", label: "Laundry / local service" },
                { value: "generic_local_service", label: "Generic local service" },
                { value: "retail_service_hybrid", label: "Retail / service hybrid" },
              ]}
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
          No businesses yet. Create your first business to begin an operations diagnosis.
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-end gap-3">
            <div className="w-72">
              <Select
                name="businessSelector"
                label="Business"
                value={selected ?? undefined}
                onChange={(e: any) => load(e.target.value)}
                options={businesses.map((b) => ({ value: b.id, label: `${b.name} (${b.currency})` }))}
              />
            </div>
            <Button onClick={() => setShowSnapshotForm((s) => !s)} disabled={!selected}>
              + Add operations snapshot
            </Button>
            <Button onClick={runDiagnosis} disabled={!selected || !dashboard?.latestSnapshot || busy}>
              Run operations diagnosis
            </Button>
          </div>

          {showSnapshotForm && (
            <form onSubmit={addSnapshot} className="mb-6 border rounded-lg p-4 bg-white space-y-3">
              <h2 className="font-semibold">
                Operations snapshot {currentBusiness ? `(${currentBusiness.currency})` : ""}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <Input name="periodStart" label="Period start" type="date" required />
                <Input name="periodEnd" label="Period end" type="date" required />
                <Select
                  name="businessModel"
                  label="Business model"
                  options={[
                    { value: "", label: "—" },
                    { value: "service", label: "Service" },
                    { value: "inventory", label: "Inventory / retail" },
                    { value: "hybrid", label: "Hybrid" },
                  ]}
                />
              </div>
              <div className="grid grid-cols-4 gap-3">
                {OPERATIONS_FIELDS.map((f) => (
                  <Input key={f.name} name={f.name} label={f.label} type="number" placeholder="—" />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave fields blank if unknown — missing data is reported, never invented.
              </p>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save snapshot"}</Button>
            </form>
          )}

          {/* Critical-domain ingestion — equipment_capacity + owner_workload_memory (P0 runtime-readiness).
              These two domains previously had no owner write path, so every real business was stuck at
              need_more_data. Owner can now enter them here; missing data is reported, never invented. */}
          <div className="mb-4 flex flex-wrap items-end gap-3" data-testid="critical-intake-section">
            <span className="text-sm font-medium">Critical operations data:</span>
            <Button data-testid="capacity-form-toggle" onClick={() => setShowCapacityForm((s) => !s)} disabled={!selected}>
              + Capacity snapshot
            </Button>
            <Button data-testid="workload-form-toggle" onClick={() => setShowWorkloadForm((s) => !s)} disabled={!selected}>
              + Owner workload snapshot
            </Button>
          </div>

          {showCapacityForm && (
            <form data-testid="capacity-form" onSubmit={addCapacity} className="mb-4 border rounded-lg p-4 bg-white space-y-3">
              <h2 className="font-semibold">Capacity snapshot {currentBusiness ? `(${currentBusiness.currency})` : ""}</h2>
              <div className="grid grid-cols-2 gap-3">
                <Input name="currentRevenue" label="Current revenue at this capacity" type="number" required data-testid="capacity-currentRevenue" />
                <Input name="utilization" label="Bottleneck utilization (0–1)" type="number" step="0.01" required data-testid="capacity-utilization" />
              </div>
              <p className="text-xs text-muted-foreground">Equipment/capacity feeds the scaling gate. Leave blank if unknown — missing data is reported, never invented.</p>
              <Button type="submit" disabled={busy} data-testid="capacity-submit">{busy ? "Saving…" : "Save capacity"}</Button>
            </form>
          )}
          {capacityResult && <div className="mb-4 text-sm text-success" data-testid="capacity-result">{capacityResult}</div>}

          {showWorkloadForm && (
            <form data-testid="workload-form" onSubmit={addWorkload} className="mb-4 border rounded-lg p-4 bg-white space-y-3">
              <h2 className="font-semibold">Owner workload snapshot</h2>
              <div className="grid grid-cols-2 gap-3">
                <Input name="ownerMinutesPerDay" label="Owner minutes/day on ops" type="number" required data-testid="workload-ownerMinutes" />
                <Input name="sustainableMinutesPerDay" label="Sustainable minutes/day" type="number" required data-testid="workload-sustainableMinutes" />
              </div>
              <p className="text-xs text-muted-foreground">Owner workload is the human-execution-reality dimension. Leave blank if unknown — missing data is reported, never invented.</p>
              <Button type="submit" disabled={busy} data-testid="workload-submit">{busy ? "Saving…" : "Save workload"}</Button>
            </form>
          )}
          {workloadResult && <div className="mb-4 text-sm text-success" data-testid="workload-result">{workloadResult}</div>}

          {!dashboard?.hasData ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              {dashboard?.latestSnapshot
                ? "Snapshot recorded. Click “Run operations diagnosis” to generate findings and an action plan."
                : "No operations snapshot yet. Add a snapshot, then run an operations diagnosis."}
            </div>
          ) : (
            <OperationsCycleView
              cycle={cycle}
              score={score}
              missing={missing}
              recommended={dashboard.recommendedNextAction}
              history={dashboard.cycleHistory}
              busy={busy}
              onUpdateAction={updateAction}
              onVerifyAction={verifyAction}
            />
          )}
        </>
      )}
    </div>
  );
}

function OperationsCycleView({
  cycle,
  score,
  missing,
  recommended,
  history,
  busy,
  onUpdateAction,
  onVerifyAction,
}: {
  cycle: any;
  score: any;
  missing: string[];
  recommended: any;
  history: any[];
  busy: boolean;
  onUpdateAction: (a: any, s: string) => void;
  onVerifyAction: (a: any) => void;
}) {
  const state = score?.operationsState ?? cycle.operationsState;
  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-4 bg-white flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Latest diagnosis · cycle #{cycle.sequenceNumber}</div>
          <div className="text-lg font-semibold">
            Health {Math.round(score?.healthScore ?? cycle.healthScore)}/100 · Risk {Math.round(score?.riskScore ?? cycle.riskScore)}/100 · Opportunity {Math.round(score?.opportunityScore ?? cycle.opportunityScore)}/100
          </div>
        </div>
        <div className="text-right">
          <Badge variant={STATE_VARIANT[state] || "muted"}>{state}</Badge>
          <div className="text-xs text-muted-foreground mt-1">
            data confidence {Math.round(score?.dataConfidenceScore ?? cycle.dataConfidenceScore)}/100
          </div>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <strong>Missing critical data:</strong> {missing.join(", ")} — provide these to raise confidence.
        </div>
      )}

      {recommended && (
        <div className="border rounded-lg p-4 bg-white">
          <div className="text-xs uppercase text-muted-foreground">Recommended next operations action</div>
          <div className="font-semibold">{recommended.title}</div>
          <p className="text-xs text-muted-foreground">{recommended.description}</p>
          <p className="text-xs text-muted-foreground">
            priority {Math.round(recommended.priorityScore)} · impact {Math.round(recommended.expectedImpactScore)} · effort {Math.round(recommended.effortScore)} · verify via {recommended.verificationMetric}
          </p>
        </div>
      )}

      <section className="border rounded-lg p-4 bg-white">
        <h2 className="font-bold mb-3">Findings ({cycle.findings.length})</h2>
        {cycle.findings.length === 0 && <p className="text-sm text-muted-foreground">No operations issues detected.</p>}
        <div className="space-y-3">
          {cycle.findings.map((f: any) => (
            <div key={f.id} className="border-l-4 pl-3 py-1" style={{ borderColor: f.findingType === "opportunity" ? "#16a34a" : "#f59e0b" }}>
              <div className="flex justify-between">
                <span className="font-semibold">{f.title}</span>
                <span className="flex gap-1">
                  <Badge variant="muted">{f.findingType}</Badge>
                  <Badge variant={SEVERITY_VARIANT[f.severity]}>{f.severity}</Badge>
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{f.summary}</p>
              <p className="text-xs text-muted-foreground">
                <strong>Metric:</strong> {f.sourceMetric} = {String(f.sourceValue)} (threshold {String(f.threshold)}) · confidence {Math.round((f.confidence ?? 0) * 100)}%
              </p>
              {Array.isArray(f.evidence) && f.evidence.length > 0 && (
                <p className="text-xs text-muted-foreground"><strong>Evidence:</strong> {f.evidence.join("; ")}</p>
              )}
              {f.verificationMetric && (
                <p className="text-xs text-muted-foreground"><strong>Verify via:</strong> {f.verificationMetric}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded-lg p-4 bg-white">
        <h2 className="font-bold mb-3">Operations actions ({cycle.actions.length})</h2>
        <div className="space-y-3">
          {cycle.actions.map((a: any) => {
            const latestVerification = a.verifications?.[0];
            return (
              <div key={a.id} className="border rounded p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold">{a.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.ownerRole} · priority {Math.round(a.priorityScore)} · ~{a.expectedTimeframeDays}d
                    </div>
                  </div>
                  <Badge variant="muted">{a.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                <p className="text-xs text-muted-foreground">
                  Verify <strong>{a.verificationMetric}</strong> — {a.verificationMethod}
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
                    <Badge variant={VERIFY_VARIANT[latestVerification.status] || "muted"}>
                      {latestVerification.status}
                    </Badge>{" "}
                    <span className="text-muted-foreground">
                      before {String(latestVerification.beforeValue)} → after {String(latestVerification.afterValue)} ({latestVerification.targetDirection})
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="border rounded-lg p-4 bg-white">
        <h2 className="font-bold mb-3">Diagnosis history</h2>
        <div className="space-y-1 text-sm">
          {history.map((c: any) => (
            <div key={c.id} className="flex justify-between border-b py-1">
              <span>Cycle #{c.sequenceNumber} — {new Date(c.createdAt).toLocaleDateString()}</span>
              <span className="text-muted-foreground">
                {c.operationsState} · {c.findingCount} findings · {c.actionCount} actions
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
