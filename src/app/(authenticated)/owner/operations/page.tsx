"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Input, Select, CardDashboardSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
import { BUSINESS_TYPE_OPTIONS } from "@/domain/owner-mode/owner-data-hub";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { FindingCard } from "@/components/owner/FindingCard";
import { DiagnosisEmptyState } from "@/components/owner/DiagnosisEmptyState";
import {
  CompletionActionForm,
  VerificationActionForm,
  type CompletionValues,
  type VerificationValues,
} from "@/components/owner/DomainActionInlineForms";
import { useActiveBusiness } from "@/context/active-business-context";
import { classifyOperatorError } from "@/lib/operator-error-governance";

import { humanizeMetricKey, humanizeEvidenceLine } from "@/lib/metric-label";
import { formatHumanDate } from "@/lib/format-human-date";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic dashboard payloads are untyped; load() fetch-on-mount is intentional */

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

// UX-04B hostile-audit correction: this map omitted "cancelled", one of the six literals in the
// shared RECOVERY_ACTION_STATUSES source of truth (src/domain/founder-recovery/action-status.ts)
// -- a cancelled action would otherwise fall through to the raw status literal. The original
// UX-04A/UX-04B claim that Operations already had complete coverage was incorrect; corrected here
// alongside Money (Sales already had it).
const ACTION_STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

const STATE_VARIANT: Record<string, "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  SMOOTH: "success-accessible",
  STEADY: "default-accessible",
  STRAINED: "warning-accessible",
  BOTTLENECKED: "destructive-accessible",
  OVERLOADED: "destructive-accessible",
};
// operationsState previously rendered as the raw enum token (e.g. "BOTTLENECKED") in both the
// position badge and the diagnosis-history rows -- same class of leak Money's SURVIVAL_LABEL
// exists to close, just never applied here.
const STATE_LABEL: Record<string, string> = {
  SMOOTH: "Running smoothly",
  STEADY: "Steady",
  STRAINED: "Strained",
  BOTTLENECKED: "Bottlenecked",
  OVERLOADED: "Overloaded",
};

// UX-04B: OwnerLoadBand (src/domain/execution/owner-workload.ts) previously rendered verbatim in
// the workload-save toast (e.g. "BOTTLENECK_RISK") -- same leak class STATE_LABEL above exists to
// close for operationsState, just never applied to this toast. See UX-04A Section M / Section Q
// item 2. No raw-token fallback: an unmapped future value renders the calm word "unknown" instead
// of leaking an internal literal.
const LOAD_BAND_LABEL: Record<string, string> = {
  UNDERUSED: "Underused",
  SUSTAINABLE: "Sustainable",
  HIGH: "High",
  BOTTLENECK_RISK: "Bottleneck risk",
  UNSUSTAINABLE: "Unsustainable",
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

// Field names match operationsSnapshotCreateSchema (Slice 5). `hint` is added only where the
// field name alone is genuinely ambiguous and metrics.ts/types.ts supports a specific
// clarification -- see operations-snapshot-form-hints.test.tsx for the source each hint is
// checked against. Hints are deliberately narrow: each states only what a formula, fallback, or
// type comment in domain/owner-operations/{types,metrics}.ts actually establishes (a computed
// relationship between two fields), never an invented process claim the schema doesn't enforce.
// Fields with no listed ambiguity (orders received/completed/delayed, rework, complaints,
// delivery failures) are left without a hint rather than restating the label.
const OPERATIONS_FIELDS: Array<{ name: string; label: string; hint?: string }> = [
  { name: "ordersReceived", label: "Orders received" },
  { name: "ordersCompleted", label: "Orders completed" },
  { name: "ordersDelayed", label: "Orders delayed" },
  { name: "reworkCount", label: "Rework count" },
  { name: "complaints", label: "Complaints" },
  { name: "staffHours", label: "Staff hours", hint: "Total hours worked by all staff combined this period." },
  { name: "machineCapacityUnits", label: "Machine capacity (units)", hint: "Maximum units your equipment could process this period." },
  { name: "idleHours", label: "Idle hours", hint: "Hours from the staff hours above where there was no work to do." },
  { name: "deliveryAttempts", label: "Delivery attempts", hint: "Leave blank to measure delivery success against completed orders instead." },
  { name: "deliveryFailures", label: "Delivery failures" },
  { name: "inventoryShortages", label: "Inventory shortages", hint: "Number of stockout events (times you ran out of stock) this period." },
  { name: "sopChecks", label: "SOP checks expected", hint: "Total number of SOP (Standard Operating Procedure) checks expected this period." },
  { name: "sopMisses", label: "SOP misses", hint: "How many of the expected checks above were missed or not completed." },
];

function operationsField(name: string) {
  const f = OPERATIONS_FIELDS.find((x) => x.name === name);
  if (!f) throw new Error(`Unknown operations field: ${name}`);
  return f;
}

// Presentation-only grouping for the snapshot form below -- each group is a contiguous run of
// OPERATIONS_FIELDS in its existing order, so field order (and therefore tab order) is unchanged
// from the previous flat layout. Every OPERATIONS_FIELDS name appears in exactly one group, and
// addSnapshot() still reads the payload from OPERATIONS_FIELDS directly, so the save payload is
// unaffected.
const OPERATIONS_FIELD_GROUPS: Array<{ title: string; fieldNames: string[] }> = [
  { title: "Orders & quality", fieldNames: ["ordersReceived", "ordersCompleted", "ordersDelayed", "reworkCount", "complaints"] },
  { title: "Capacity & staffing", fieldNames: ["staffHours", "machineCapacityUnits", "idleHours"] },
  { title: "Delivery", fieldNames: ["deliveryAttempts", "deliveryFailures", "inventoryShortages"] },
  { title: "SOP compliance", fieldNames: ["sopChecks", "sopMisses"] },
];

export default function OwnerOperationsPage() {
  const { activeBusinessId, needsBusinessRecovery, setActiveBusinessId, refreshBusinesses, loading: contextLoading } = useActiveBusiness();
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
  // UX-06 Wave B1: at most one action-editing inline form open at a time on this page.
  // Page-local -- no global store, no context.
  const [editingAction, setEditingAction] = useState<{ actionId: string; mode: "complete" | "verify" } | null>(null);
  // UX-06 Wave B1: synchronous duplicate-submit guard, local to the completion/verification
  // mutation only (mirrors owner/finance/page.tsx and UX-06A2's approveInFlightRef).
  const actionMutationInFlightRef = useRef(false);
  // UX-04B: stale business-switch response guard, mirroring the loadGenerationRef pattern already
  // shipped for Home (owner/cockpit/page.tsx, UX-03) and Money (owner/finance/page.tsx). Without
  // this, a slow response for a previously-active business arriving after a switch could silently
  // overwrite the newer business's state and re-anchor the shared activeBusinessId back to the
  // stale one -- see UX-04A Section J item 1.
  const loadGenerationRef = useRef(0);
  // UX-04B hostile-audit correction: the generation guard above closes the STALE-RESPONSE race
  // (an old load() resolving late), but a SECOND, distinct race survived it -- a business-scoped
  // mutation started for business A can still be in flight when the owner switches to B; if A's
  // mutation succeeds afterward, its own `await load(selected)` call starts AFTER B's load() and
  // therefore receives a NEWER generation, so the generation guard alone would incorrectly let
  // A's post-mutation reload win and re-anchor the shared business back to A. See
  // owner/finance/page.tsx's identical activeBusinessIdRef for the full doc comment.
  const activeBusinessIdRef = useRef<string | null>(activeBusinessId);

  useEffect(() => {
    activeBusinessIdRef.current = activeBusinessId;
  }, [activeBusinessId]);

  const handleBusinessSelect = useCallback((businessId: string) => {
    activeBusinessIdRef.current = businessId;
    setActiveBusinessId(businessId);
  }, [setActiveBusinessId]);

  const load = useCallback(async (businessId?: string | null) => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setError(null);
    try {
      const qs = businessId ? `?businessId=${businessId}` : "";
      const data = await api(`/api/owner/operations/dashboard${qs}`);
      // A newer load() has since started -- this response is stale and must never commit.
      if (loadGenerationRef.current !== generation) return;
      setDashboard(data);
      setSelected(data.selectedBusinessId);
      // Keep the shared active-business context in sync — see finance/page.tsx for the root
      // cause this closes (each owner page independently defaulting to a different business).
      if (data.selectedBusinessId) setActiveBusinessId(data.selectedBusinessId);
    } catch (e) {
      // A stale failure must never clobber an already-successful, current render with an error.
      if (loadGenerationRef.current !== generation) return;
      // UX-04B: governed classification, never the raw fetch/exception text -- mirrors Money's
      // already-shipped pattern (see UX-04A Section Q item 4).
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to load"), { context: "load" }).operatorMessage);
    } finally {
      // A stale request's completion must never toggle the loading flag for a request that's no
      // longer current.
      if (loadGenerationRef.current === generation) setLoading(false);
    }
  }, [setActiveBusinessId]);

  useEffect(() => {
    if (contextLoading) return;
    // A pending business-recovery choice must never be silently resolved by letting the server
    // pick its own default businessId — see ActiveBusinessContext.needsBusinessRecovery.
    if (needsBusinessRecovery) return;
    void load(activeBusinessId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the shared context resolves or the owner explicitly switches business
  }, [contextLoading, activeBusinessId, needsBusinessRecovery]);

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
      // Mark the newly created business as the intended active business synchronously -- a
      // successful creation intentionally switches to it. See activeBusinessIdRef's comment.
      activeBusinessIdRef.current = created.id;
      setActiveBusinessId(created.id);
      await refreshBusinesses();
      // If the owner switched to a different business while refreshBusinesses() was still
      // pending, the newly-created business is no longer the intended one -- do not force it
      // back into view.
      if (activeBusinessIdRef.current !== created.id) return;
      await load(created.id);
    } catch (e) {
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to create business"), { context: "save" }).operatorMessage);
    } finally {
      setBusy(false);
    }
  }

  async function addSnapshot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    // Capture which business this save is FOR before the await -- the owner may switch business
    // while this request is in flight. See activeBusinessIdRef's comment.
    const targetBusinessId = selected;
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
      await api(`/api/owner/operations/businesses/${targetBusinessId}/snapshots`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setShowSnapshotForm(false);
      await load(targetBusinessId);
    } catch (e) {
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to save snapshot"), { context: "save" }).operatorMessage);
    } finally {
      setBusy(false);
    }
  }

  // Critical-domain ingestion (equipment_capacity): feeds the whole-business plan's scaling gate.
  async function addCapacity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const targetBusinessId = selected;
    setBusy(true);
    setError(null);
    setCapacityResult(null);
    const fd = new FormData(e.currentTarget);
    try {
      const snap = await api(`/api/owner/operations/businesses/${targetBusinessId}/capacity-snapshots`, {
        method: "POST",
        body: JSON.stringify({
          currentRevenue: parseFloat(String(fd.get("currentRevenue"))),
          resources: [{ type: "primary", utilization: parseFloat(String(fd.get("utilization"))) }],
        }),
      });
      // Stale-mutation-intent guard: a capacity result banner and a form-close are specific to
      // whichever business the owner is CURRENTLY viewing -- if they've switched away, showing
      // this business's result on the new business (or reloading the old one) would be exactly
      // the cross-business contamination this guard exists to prevent.
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setShowCapacityForm(false);
      setCapacityResult(
        `Capacity saved — bottleneck utilization ${Math.round((snap.bottleneckUtilization ?? 0) * 100)}%; ` +
          `${snap.growthSafe ? "growth headroom available" : "at/over safe capacity"}.`
      );
      await load(targetBusinessId);
    } catch (e) {
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to save capacity"), { context: "save" }).operatorMessage);
    } finally {
      setBusy(false);
    }
  }

  // Critical-domain ingestion (owner_workload_memory): the mandated human-execution-reality dimension.
  async function addWorkload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const targetBusinessId = selected;
    setBusy(true);
    setError(null);
    setWorkloadResult(null);
    const fd = new FormData(e.currentTarget);
    try {
      const snap = await api(`/api/owner/operations/businesses/${targetBusinessId}/workload-snapshots`, {
        method: "POST",
        body: JSON.stringify({
          ownerMinutesPerDay: parseFloat(String(fd.get("ownerMinutesPerDay"))),
          sustainableMinutesPerDay: parseFloat(String(fd.get("sustainableMinutesPerDay"))),
        }),
      });
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setShowWorkloadForm(false);
      // UX-04B: LOAD_BAND_LABEL translates the raw OwnerLoadBand enum instead of rendering it
      // verbatim (e.g. "BOTTLENECK_RISK") -- see UX-04A Section M / Section Q item 2.
      setWorkloadResult(`Owner workload saved — daily load ${Math.round(snap.dailyLoadPct ?? 0)}% (band ${LOAD_BAND_LABEL[snap.band] ?? "unknown"}).`);
      await load(targetBusinessId);
    } catch (e) {
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to save workload"), { context: "save" }).operatorMessage);
    } finally {
      setBusy(false);
    }
  }

  async function runDiagnosis() {
    if (!selected || !dashboard?.latestSnapshot) return;
    const targetBusinessId = selected;
    const snapshotId = dashboard.latestSnapshot.id;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/operations/businesses/${targetBusinessId}/diagnoses`, {
        method: "POST",
        body: JSON.stringify({ snapshotId }),
      });
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      await load(targetBusinessId);
    } catch (e) {
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to run diagnosis"), { context: "action" }).operatorMessage);
    } finally {
      setBusy(false);
    }
  }

  async function updateAction(action: any, status: string) {
    const targetBusinessId = selected;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/operations/actions/${action.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      await load(targetBusinessId);
    } catch (e) {
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to update action"), { context: "action" }).operatorMessage);
    } finally {
      setBusy(false);
    }
  }

  // UX-06 Wave B1: replaces the two native-dialog calls previously inlined in updateAction()'s
  // "completed" branch. Same PATCH endpoint/method/body shape.
  async function completeAction(action: any, values: CompletionValues) {
    if (actionMutationInFlightRef.current) return;
    actionMutationInFlightRef.current = true;
    const targetBusinessId = selected;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/operations/actions/${action.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "completed",
          completionNotes: values.completionNotes,
          completionEvidence: values.completionEvidence,
        }),
      });
      if (activeBusinessIdRef.current !== targetBusinessId) { setEditingAction(null); return; }
      setEditingAction(null);
      await load(targetBusinessId);
    } catch (e) {
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      // Failure must never clear the open inline form.
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to update action"), { context: "action" }).operatorMessage);
    } finally {
      setBusy(false);
      actionMutationInFlightRef.current = false;
    }
  }

  // UX-06 Wave B1: replaces the three native-dialog calls previously inlined in verifyAction().
  // Same POST endpoint/body shape -- the inline form already validated/typed the values.
  async function verifyActionSubmit(action: any, values: VerificationValues) {
    if (actionMutationInFlightRef.current) return;
    actionMutationInFlightRef.current = true;
    const targetBusinessId = selected;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/operations/actions/${action.id}/verify`, {
        method: "POST",
        body: JSON.stringify({
          beforeValue: values.beforeValue,
          afterValue: values.afterValue,
          targetDirection: values.targetDirection,
        }),
      });
      if (activeBusinessIdRef.current !== targetBusinessId) { setEditingAction(null); return; }
      setEditingAction(null);
      await load(targetBusinessId);
    } catch (e) {
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      // Failure must never clear the open inline form.
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to verify"), { context: "action" }).operatorMessage);
    } finally {
      setBusy(false);
      actionMutationInFlightRef.current = false;
    }
  }

  if (loading) return <CardDashboardSkeleton label="Loading your operations information" />;

  const businesses: any[] = dashboard?.businesses ?? [];
  const currentBusiness = businesses.find((b) => b.id === selected) || null;
  const cycle = dashboard?.latestCycle ?? null;
  const score = dashboard?.domainScore ?? null;
  const missing: string[] = dashboard?.missingCriticalData ?? [];

  return (
    <PageContainer>
      <div className="mb-6">
        <PageHeader
          title="Operations"
          description="Where throughput stalls, where the bottleneck is, and what to fix next — with the single highest-impact execution move and verification."
          actions={<Button onClick={() => setShowBusinessForm((s) => !s)}>+ New business</Button>}
        />
      </div>

      {error && (
        <div
          role="alert"
          data-testid="operations-page-error"
          className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
        >
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

      {/* dashboard is set only on a successful load() and is never reset to null on failure (see
          load()'s catch block above), so `dashboard === null` here means only "no successful
          response yet" -- distinct from a successful response confirming zero businesses. A
          failed initial load must never render "No businesses yet" next to the error banner
          above: that would present unverified emptiness as a fact. A failure AFTER a prior
          success leaves dashboard (and this whole section) exactly as it was -- unaffected. */}
      {dashboard === null ? null : businesses.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No businesses yet. Create your first business to begin an operations diagnosis.
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-3">
            <BusinessContextSelector
              businesses={businesses}
              selectedId={selected}
              onChange={handleBusinessSelect}
            />
            <Button onClick={() => setShowSnapshotForm((s) => !s)} disabled={!selected}>
              + Add operations snapshot
            </Button>
            <Button onClick={runDiagnosis} disabled={!selected || !dashboard?.latestSnapshot || busy}>
              Run operations diagnosis
            </Button>
          </div>

          {showSnapshotForm && (
            <form onSubmit={addSnapshot} className="mb-6 border rounded-lg p-4 bg-card space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                Operations snapshot {currentBusiness ? `(${currentBusiness.currency})` : ""}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <div className="flex flex-col gap-4">
                {OPERATIONS_FIELD_GROUPS.map((group) => (
                  <div key={group.title}>
                    <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
                    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {group.fieldNames.map((name) => {
                        const f = operationsField(name);
                        return <Input key={f.name} name={f.name} label={f.label} type="number" placeholder="—" hint={f.hint} />;
                      })}
                    </div>
                  </div>
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
            <form data-testid="capacity-form" onSubmit={addCapacity} className="mb-4 border rounded-lg p-4 bg-card space-y-3">
              <h2 className="font-semibold">Capacity snapshot {currentBusiness ? `(${currentBusiness.currency})` : ""}</h2>
              <div className="grid grid-cols-2 gap-3">
                <Input name="currentRevenue" label="Current revenue at this capacity" type="number" required data-testid="capacity-currentRevenue" />
                <Input name="utilization" label="Bottleneck utilization (0–1)" type="number" step="0.01" required data-testid="capacity-utilization" />
              </div>
              <p className="text-xs text-muted-foreground">This helps OpsIQ judge whether the business has enough capacity to grow safely. Leave blank if unknown — missing data is reported, never invented.</p>
              <Button type="submit" disabled={busy} data-testid="capacity-submit">{busy ? "Saving…" : "Save capacity"}</Button>
            </form>
          )}
          {capacityResult && <div className="mb-4 text-sm text-[var(--success-text)]" data-testid="capacity-result">{capacityResult}</div>}

          {showWorkloadForm && (
            <form data-testid="workload-form" onSubmit={addWorkload} className="mb-4 border rounded-lg p-4 bg-card space-y-3">
              <h2 className="font-semibold">Owner workload snapshot</h2>
              <div className="grid grid-cols-2 gap-3">
                <Input name="ownerMinutesPerDay" label="Owner minutes/day on ops" type="number" required data-testid="workload-ownerMinutes" />
                <Input name="sustainableMinutesPerDay" label="Sustainable minutes/day" type="number" required data-testid="workload-sustainableMinutes" />
              </div>
              <p className="text-xs text-muted-foreground">This helps OpsIQ understand how much of the day-to-day work depends on you. Leave blank if unknown — missing data is reported, never invented.</p>
              <Button type="submit" disabled={busy} data-testid="workload-submit">{busy ? "Saving…" : "Save workload"}</Button>
            </form>
          )}
          {workloadResult && <div className="mb-4 text-sm text-[var(--success-text)]" data-testid="workload-result">{workloadResult}</div>}

          {!dashboard?.hasData ? (
            <DiagnosisEmptyState
              domainLabel="operations"
              hasSnapshot={Boolean(dashboard?.latestSnapshot)}
              snapshotLabel="operations snapshot"
              diagnosisLabel="Run operations diagnosis"
            />
          ) : (
            <OperationsCycleView
              cycle={cycle}
              score={score}
              missing={missing}
              recommended={dashboard.recommendedNextAction}
              history={dashboard.cycleHistory}
              busy={busy}
              editingAction={editingAction}
              onEditingActionChange={setEditingAction}
              onUpdateAction={updateAction}
              onCompleteAction={completeAction}
              onVerifyAction={verifyActionSubmit}
            />
          )}
        </>
      )}
    </PageContainer>
  );
}

function OperationsCycleView({
  cycle,
  score,
  missing,
  recommended,
  history,
  busy,
  editingAction,
  onEditingActionChange,
  onUpdateAction,
  onCompleteAction,
  onVerifyAction,
}: {
  cycle: any;
  score: any;
  missing: string[];
  recommended: any;
  history: any[];
  busy: boolean;
  editingAction: { actionId: string; mode: "complete" | "verify" } | null;
  onEditingActionChange: (v: { actionId: string; mode: "complete" | "verify" } | null) => void;
  onUpdateAction: (a: any, s: string) => void;
  onCompleteAction: (a: any, values: CompletionValues) => void;
  onVerifyAction: (a: any, values: VerificationValues) => void;
}) {
  const state = score?.operationsState ?? cycle.operationsState;
  const dataConfidence = Math.round(score?.dataConfidenceScore ?? cycle.dataConfidenceScore);
  // Keyed by action id, one entry per row, so Cancel can return focus to the exact trigger that
  // opened its form (confirmed production accessibility finding) -- never a different row's
  // trigger, even with multiple actions open/closed in sequence.
  const completeTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const verifyTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  return (
    <div className="flex flex-col gap-5">
      <div className="border-l-2 pl-5 py-1" style={{ borderColor: "var(--accent-ink)" }}>
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--accent-ink)" }}>
            Operations position · cycle #{cycle.sequenceNumber}
          </span>
          <Badge variant={STATE_VARIANT[state] || "muted-accessible"}>{STATE_LABEL[state] ?? state}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
          {[
            ["Health", score?.healthScore ?? cycle.healthScore],
            ["Risk", score?.riskScore ?? cycle.riskScore],
            ["Opportunity", score?.opportunityScore ?? cycle.opportunityScore],
          ].map(([label, value]) => (
            <div key={label as string}>
              <div className="font-display text-[2rem] font-semibold leading-none tabular-nums tracking-tight text-foreground">
                {Math.round(value as number)}<span className="text-base font-normal text-muted-foreground">/100</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Data confidence {dataConfidence}/100 — how much of this reading rests on real, supplied numbers.
        </p>
      </div>

      {dataConfidence < 30 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive font-medium">
          ⚠ Data confidence is critically low ({dataConfidence}/100). Diagnosis results are unreliable and should not be acted upon without providing the missing critical inputs below.
        </div>
      )}

      {missing.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <strong>Missing critical data:</strong> {missing.map(humanizeMetricKey).join(", ")} — provide these to raise confidence.
        </div>
      )}

      {recommended && (
        <div className="border-t border-border pt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Recommended next operations action</div>
          <div className="mt-1 font-display text-[1.1rem] font-semibold text-foreground">{recommended.title}</div>
          <p className="text-xs text-muted-foreground">{recommended.description}</p>
          <p className="text-xs text-muted-foreground">
            priority {Math.round(recommended.priorityScore)} · impact {Math.round(recommended.expectedImpactScore)} · effort {Math.round(recommended.effortScore)} · verify via {humanizeMetricKey(recommended.verificationMetric)}
          </p>
        </div>
      )}

      {/* Findings — the shared FindingCard component (src/components/owner/FindingCard.tsx),
          the exact same card Money renders: OwnerOperationsFinding has the identical shape to
          OwnerFinanceFinding, so this is the same real component, not a look-alike copy. */}
      <section className="border-t border-border pt-4">
        <h2 className="font-display text-[1.1rem] font-semibold text-foreground mb-4">Findings ({cycle.findings.length})</h2>
        {cycle.findings.length === 0 && <p className="text-sm text-muted-foreground">No operations issues detected — this may indicate missing input data rather than smooth operations. Check data confidence above.</p>}
        <div className="flex flex-col gap-6">
          {cycle.findings.map((f: any) => (
            <FindingCard key={f.id} finding={f} />
          ))}
        </div>
      </section>

      <section className="border-t border-border pt-4">
        <h2 className="font-display text-[1.1rem] font-semibold text-foreground mb-3">Operations actions ({cycle.actions.length})</h2>
        <div className="space-y-3">
          {cycle.actions.map((a: any) => {
            const latestVerification = a.verifications?.[0];
            const isCompleteOpen = Boolean(editingAction && editingAction.actionId === a.id && editingAction.mode === "complete");
            const isVerifyOpen = Boolean(editingAction && editingAction.actionId === a.id && editingAction.mode === "verify");
            const completeFormId = `operations-complete-form-${a.id}`;
            const verifyFormId = `operations-verify-form-${a.id}`;
            return (
              <div key={a.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div>
                    <div className="font-semibold">{a.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.ownerRole} · priority {Math.round(a.priorityScore)} · ~{a.expectedTimeframeDays}d
                    </div>
                  </div>
                  <Badge variant="muted-accessible">{ACTION_STATUS_LABEL[a.status] ?? a.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                <p className="text-xs text-muted-foreground">
                  Verify <strong>{humanizeMetricKey(a.verificationMetric)}</strong> — {humanizeEvidenceLine(a.verificationMethod ?? "")}
                </p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {a.status === "proposed" && <Button onClick={() => onUpdateAction(a, "assigned")} disabled={busy}>Assign</Button>}
                  {a.status === "assigned" && <Button onClick={() => onUpdateAction(a, "in_progress")} disabled={busy}>Start</Button>}
                  {a.status === "in_progress" && (
                    <Button
                      ref={(el) => { completeTriggerRefs.current[a.id] = el; }}
                      aria-expanded={isCompleteOpen}
                      aria-controls={isCompleteOpen ? completeFormId : undefined}
                      onClick={() => onEditingActionChange({ actionId: a.id, mode: "complete" })}
                      disabled={busy}
                    >
                      Complete
                    </Button>
                  )}
                  {a.status === "in_progress" && <Button onClick={() => onUpdateAction(a, "blocked")} disabled={busy}>Block</Button>}
                  <Button
                    ref={(el) => { verifyTriggerRefs.current[a.id] = el; }}
                    aria-expanded={isVerifyOpen}
                    aria-controls={isVerifyOpen ? verifyFormId : undefined}
                    onClick={() => onEditingActionChange({ actionId: a.id, mode: "verify" })}
                    disabled={busy}
                  >
                    Verify outcome
                  </Button>
                </div>
                {latestVerification && (
                  <div className="mt-2 text-xs">
                    <Badge variant={VERIFY_VARIANT[latestVerification.status] || "muted-accessible"}>
                      {VERIFY_LABEL[latestVerification.status] ?? latestVerification.status}
                    </Badge>{" "}
                    <span className="text-muted-foreground">
                      before {String(latestVerification.beforeValue)} → after {String(latestVerification.afterValue)} ({latestVerification.targetDirection})
                    </span>
                  </div>
                )}
                {isCompleteOpen && (
                  <CompletionActionForm
                    formId={completeFormId}
                    busy={busy}
                    onCancel={() => {
                      onEditingActionChange(null);
                      completeTriggerRefs.current[a.id]?.focus();
                    }}
                    onSave={(values) => onCompleteAction(a, values)}
                  />
                )}
                {isVerifyOpen && (
                  <VerificationActionForm
                    formId={verifyFormId}
                    busy={busy}
                    defaultDirection="up"
                    metricLabel={humanizeMetricKey(a.verificationMetric)}
                    onCancel={() => {
                      onEditingActionChange(null);
                      verifyTriggerRefs.current[a.id]?.focus();
                    }}
                    onSave={(values) => onVerifyAction(a, values)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border pt-4">
        <h2 className="font-display text-[1.1rem] font-semibold text-foreground mb-3">Diagnosis history</h2>
        <div className="space-y-1 text-sm">
          {history.map((c: any) => (
            <div key={c.id} className="flex justify-between border-b border-border py-1.5 last:border-0">
              <span>Cycle #{c.sequenceNumber} — {formatHumanDate(c.createdAt)}</span>
              <span className="text-muted-foreground">
                {STATE_LABEL[c.operationsState] ?? c.operationsState} · {c.findingCount} findings · {c.actionCount} actions
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
