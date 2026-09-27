"use client";

import { DomainMainTargetContext } from "@/components/owner/DomainMainTargetContext";
import { VerificationEvidenceText } from "@/components/owner/VerificationEvidenceText";
import { canRecordOutcome } from "@/domain/founder-recovery/verification-evidence";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Input, Select, CardDashboardSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
import { BUSINESS_TYPE_OPTIONS } from "@/domain/owner-mode/owner-data-hub";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import {
  CompletionActionForm,
  VerificationActionForm,
  type CompletionValues,
  type VerificationValues,
} from "@/components/owner/DomainActionInlineForms";
import { useActiveBusiness } from "@/context/active-business-context";

import { humanizeMetricKey, humanizeEvidenceLine } from "@/lib/metric-label";
import { httpResponseErrorFromBody } from "@/lib/operator-safe-errors";
import { presentDomainError } from "@/lib/owner-domain-error-presentation";
import { getVerificationDirection } from "@/domain/owner-mode/verification-direction";
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
const FINDING_TYPE_LABEL: Record<string, string> = {
  opportunity: "Opportunity",
  risk: "Risk",
};

/**
 * Own-property-only lookup for a plain object literal used as a label/variant table. A bare
 * `map[key]` lookup is unsafe when `key` comes from server-controlled data: every plain JS
 * object inherits `Object.prototype` members (`constructor`, `toString`, `hasOwnProperty`,
 * `valueOf`, and, via the `__proto__` accessor, the prototype object itself), so a
 * findingType/severity value equal to one of those names can resolve to that inherited
 * function/object instead of `undefined` -- producing a value React cannot render, instead of
 * falling through to the existing raw-value fallback like any other unrecognized string. Same
 * pattern as src/components/owner/FindingCard.tsx's own `ownLookup` (PR #525) -- duplicated
 * locally here since this page defines its own local label maps rather than importing them.
 */
function ownLookup<T>(map: Record<string, T>, key: string | undefined): T | undefined {
  return key !== undefined && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

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
  // UX-05B Candidate 3: RECOVERY_ACTION_STATUSES (src/domain/founder-recovery/action-status.ts),
  // reused by sopActionUpdateSchema, includes "cancelled" -- this map was missing it.
  cancelled: "Cancelled",
};

const STATE_VARIANT: Record<string, "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  DISCIPLINED: "success-accessible",
  ON_TRACK: "default-accessible",
  SLIPPING: "warning-accessible",
  UNRELIABLE: "destructive-accessible",
  BREAKDOWN: "destructive-accessible",
};
const STATE_LABEL: Record<string, string> = {
  DISCIPLINED: "Disciplined",
  ON_TRACK: "On track",
  SLIPPING: "Slipping",
  UNRELIABLE: "Unreliable",
  BREAKDOWN: "Breakdown",
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  // Keep the HTTP status + server message + field errors (a plain Error loses them).
  if (!res.ok) throw httpResponseErrorFromBody(res.status, data);
  return data;
}

// Field names match sopSnapshotCreateSchema (Slice 5).
const SOP_FIELDS: Array<{ name: string; label: string }> = [
  { name: "actionsAssigned", label: "Actions assigned" },
  { name: "actionsCompleted", label: "Actions completed" },
  { name: "actionsVerified", label: "Actions verified" },
  { name: "actionsOverdue", label: "Actions overdue" },
  { name: "actionsDisputed", label: "Actions disputed" },
  { name: "actionsReassigned", label: "Actions reassigned" },
  { name: "repeatedFailures", label: "Repeated failures" },
  { name: "proofRequired", label: "Proof required" },
  { name: "proofProvided", label: "Proof provided" },
  { name: "recurringProcesses", label: "Recurring processes" },
  { name: "documentedSops", label: "Documented SOPs" },
];

export default function OwnerExecutionPage() {
  const { activeBusinessId, needsBusinessRecovery, setActiveBusinessId, refreshBusinesses, loading: contextLoading } = useActiveBusiness();
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showBusinessForm, setShowBusinessForm] = useState(false);
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);
  // UX-06 Wave B1: at most one action-editing inline form open at a time on this page.
  // Page-local -- no global store, no context.
  const [editingAction, setEditingAction] = useState<{ actionId: string; mode: "complete" | "verify" } | null>(null);
  // UX-06 Wave B1: synchronous duplicate-submit guard, local to the completion/verification
  // mutation only (mirrors owner/finance/page.tsx and UX-06A2's approveInFlightRef).
  const actionMutationInFlightRef = useRef(false);
  // UX-05C Candidate 1: stale business-switch response guard, mirroring the loadGenerationRef
  // pattern already shipped on Home/Money/Sales/Operations. Without this, a slow response for a
  // previously-active business arriving after a switch could silently overwrite the newer
  // business's state and re-anchor the shared activeBusinessId back to the stale one.
  const loadGenerationRef = useRef(0);
  // UX-05C Candidate 1: the generation guard above closes the STALE-RESPONSE race (an old load()
  // resolving late), but a SECOND, distinct race survives it -- a business-scoped MUTATION
  // (addSnapshot/runDiagnosis/updateAction/verifyAction) started for business A can still be in
  // flight when the owner switches to B; if A's mutation succeeds afterward, its own
  // `await load(selected)` call starts AFTER B's load() and therefore receives a NEWER
  // generation than B's own in-flight/just-finished load, so the generation guard alone would
  // incorrectly let A's post-mutation reload win and re-anchor the shared business back to A.
  // This ref tracks which business is CURRENTLY intended (kept in sync with the canonical
  // ActiveBusinessContext, and updated synchronously the instant this page's own selector or
  // create-business flow changes it) so every mutation handler can check, right after its await
  // resolves, "is the business I ran this for still the one the owner is looking at?" before
  // touching any page state. It never substitutes for ActiveBusinessContext -- it only stops an
  // already-obsolete async continuation from acting on stale intent.
  const activeBusinessIdRef = useRef<string | null>(activeBusinessId);

  useEffect(() => {
    activeBusinessIdRef.current = activeBusinessId;
  }, [activeBusinessId]);

  // Wraps the canonical setActiveBusinessId so the intent ref updates synchronously in the same
  // tick as the owner's click, rather than waiting for the context's own state update to flow
  // back down as a prop -- see activeBusinessIdRef's doc comment above.
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
      const data = await api(`/api/owner/sop/dashboard${qs}`);
      // A newer load() has since started (the active business changed again while this request
      // was in flight) -- this response is stale and must never commit. See the loadGenerationRef
      // declaration above.
      if (loadGenerationRef.current !== generation) return;
      setDashboard(data);
      setSelected(data.selectedBusinessId);
      // Keep the shared active-business context in sync — see finance/page.tsx and
      // operations/page.tsx for the root cause this closes (each owner page independently
      // defaulting to a different business, e.g. the first row returned by the server, instead
      // of the business selected elsewhere in the app).
      if (data.selectedBusinessId) setActiveBusinessId(data.selectedBusinessId);
    } catch (e) {
      // A stale failure (e.g. a slow request for a business the owner already switched away
      // from) must never clobber an already-successful, current render with an error screen.
      if (loadGenerationRef.current !== generation) return;
      // UX-05B Candidate 2 (display-text only -- see Finance/Sales/Operations for the same pattern).
      setError(presentDomainError(e instanceof Error ? e : new Error("Failed to load"), "load"));
    } finally {
      // A stale request's completion must never toggle the loading flag for a request that's no
      // longer current -- it could otherwise dismiss the skeleton for a newer request still in
      // flight.
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
      // Execution reuses OwnerBusiness; create via the shared recovery businesses route.
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
      // Mark the newly created business as the intended active business synchronously (see
      // activeBusinessIdRef's doc comment) -- a successful creation intentionally switches to it.
      activeBusinessIdRef.current = created.id;
      setActiveBusinessId(created.id);
      await refreshBusinesses();
      // If the owner switched to a different business while refreshBusinesses() was still
      // pending, the newly-created business is no longer the intended one -- do not force it
      // back into view.
      if (activeBusinessIdRef.current !== created.id) return;
      await load(created.id);
    } catch (e) {
      setError(presentDomainError(e instanceof Error ? e : new Error("Failed to create business"), "save"));
    } finally {
      setBusy(false);
    }
  }

  async function addSnapshot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    // Capture which business this save is FOR before the await -- the owner may switch business
    // while this request is in flight, and `selected` itself will have moved on by the time it
    // resolves. See activeBusinessIdRef's doc comment.
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
    for (const f of SOP_FIELDS) {
      const v = fd.get(f.name);
      if (v && typeof v === "string" && v.trim()) body[f.name] = parseFloat(v);
    }
    try {
      await api(`/api/owner/sop/businesses/${selected}/snapshots`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      // Stale-mutation-intent guard: only close the form / reload if the owner is still looking
      // at the business this save was for. If they've switched to a different business, closing
      // THEIR form or reloading THIS one would be exactly the cross-business contamination this
      // guard exists to prevent -- see activeBusinessIdRef's doc comment.
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setShowSnapshotForm(false);
      await load(targetBusinessId);
    } catch (e) {
      // A stale failure for a business the owner has since switched away from must never render
      // on the business they're now looking at.
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setError(presentDomainError(e instanceof Error ? e : new Error("Failed to save snapshot"), "save"));
    } finally {
      setBusy(false);
    }
  }

  async function runDiagnosis() {
    if (!selected || !dashboard?.latestSnapshot) return;
    // See addSnapshot's comment on why the target business is captured before the await.
    const targetBusinessId = selected;
    const snapshotId = dashboard.latestSnapshot.id;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/sop/businesses/${selected}/diagnoses`, {
        method: "POST",
        body: JSON.stringify({ snapshotId }),
      });
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      await load(targetBusinessId);
    } catch (e) {
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setError(presentDomainError(e instanceof Error ? e : new Error("Failed to run diagnosis"), "action"));
    } finally {
      setBusy(false);
    }
  }

  async function updateAction(action: any, status: string) {
    // See addSnapshot's comment on why the target business is captured before the await.
    const targetBusinessId = selected;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/sop/actions/${action.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      await load(targetBusinessId);
    } catch (e) {
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setError(presentDomainError(e instanceof Error ? e : new Error("Failed to update action"), "action"));
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
      await api(`/api/owner/sop/actions/${action.id}`, {
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
      setError(presentDomainError(e instanceof Error ? e : new Error("Failed to update action"), "action"));
    } finally {
      setBusy(false);
      actionMutationInFlightRef.current = false;
    }
  }

  // UX-06 Wave B1: replaces the three native-dialog calls previously inlined in verifyAction().
  // Same POST endpoint/body shape -- the inline form already validated/typed the values.
  async function verifyActionSubmit(action: any, values: VerificationValues): Promise<string | null> {
    if (actionMutationInFlightRef.current) return null;
    actionMutationInFlightRef.current = true;
    const targetBusinessId = selected;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/sop/actions/${action.id}/verify`, {
        method: "POST",
        body: JSON.stringify({
          beforeValue: values.beforeValue,
          afterValue: values.afterValue,
          targetDirection: values.targetDirection,
        }),
      });
      if (activeBusinessIdRef.current !== targetBusinessId) { setEditingAction(null); return null; }
      setEditingAction(null);
      await load(targetBusinessId);
      return null;
    } catch (e) {
      if (activeBusinessIdRef.current !== targetBusinessId) return null;
      // Failure must never clear the open inline form.
      const message = presentDomainError(e instanceof Error ? e : new Error("Failed to verify"), "action");
      setError(message);
      // Also returned so the open inline form shows it next to the fields.
      return message;
    } finally {
      setBusy(false);
      actionMutationInFlightRef.current = false;
    }
  }

  if (loading) return <CardDashboardSkeleton label="Loading your execution information" />;

  const businesses: any[] = dashboard?.businesses ?? [];
  const currentBusiness = businesses.find((b) => b.id === selected) || null;
  const cycle = dashboard?.latestCycle ?? null;
  const score = dashboard?.domainScore ?? null;
  const missing: string[] = dashboard?.missingCriticalData ?? [];

  return (
    <PageContainer>
      <div className="mb-6">
        <PageHeader
          title="Owner Execution & SOP"
          description="Who must do what, by when, and whether it was actually done and verified — with the single highest-impact accountability move. SOP means Standard Operating Procedure: a written, repeatable way of doing a task."
          actions={<Button onClick={() => setShowBusinessForm((s) => !s)}>+ New business</Button>}
        />
      </div>

      {error && (
        <div
          role="alert"
          data-testid="execution-page-error"
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
          No businesses yet. Create your first business to begin an execution diagnosis.
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
              + Add execution snapshot
            </Button>
            <Button onClick={runDiagnosis} disabled={!selected || !dashboard?.latestSnapshot || busy}>
              Run execution diagnosis
            </Button>
          </div>

          {showSnapshotForm && (
            <form onSubmit={addSnapshot} className="mb-6 border rounded-lg p-4 bg-card space-y-3">
              <h2 className="font-semibold">
                Execution snapshot {currentBusiness ? `(${currentBusiness.currency})` : ""}
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
                {SOP_FIELDS.map((f) => (
                  <Input key={f.name} name={f.name} label={f.label} type="number" placeholder="—" />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave fields blank if unknown — missing data is reported, never invented.
              </p>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save snapshot"}</Button>
            </form>
          )}

          <DomainMainTargetContext domain="sop" businessId={dashboard?.selectedBusinessId} />

          {!dashboard?.hasData ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              {dashboard?.latestSnapshot
                ? "Snapshot recorded. Click “Run execution diagnosis” to generate findings and an action plan."
                : "No execution snapshot yet. Add a snapshot, then run an execution diagnosis."}
            </div>
          ) : (
            <SopCycleView
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

function SopCycleView({
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
  onVerifyAction: (a: any, values: VerificationValues) => Promise<string | null>;
}) {
  const state = score?.executionState ?? cycle.executionState;
  // Keyed by action id, one entry per row, so Cancel can return focus to the exact trigger that
  // opened its form (confirmed production accessibility finding) -- never a different row's
  // trigger, even with multiple actions open/closed in sequence.
  const completeTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const verifyTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-4 bg-card flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Latest diagnosis · cycle #{cycle.sequenceNumber}</div>
          <div className="text-lg font-semibold tabular-nums">
            Health {Math.round(score?.healthScore ?? cycle.healthScore)}/100 · Risk {Math.round(score?.riskScore ?? cycle.riskScore)}/100 · Opportunity {Math.round(score?.opportunityScore ?? cycle.opportunityScore)}/100
          </div>
        </div>
        <div className="text-right">
          <Badge variant={STATE_VARIANT[state] || "muted-accessible"}>{STATE_LABEL[state] ?? state}</Badge>
          <div className="text-xs text-muted-foreground mt-1">
            data confidence {Math.round(score?.dataConfidenceScore ?? cycle.dataConfidenceScore)}/100
          </div>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <strong>Missing critical data:</strong> {missing.map(humanizeMetricKey).join(", ")} — provide these to raise confidence.
        </div>
      )}

      {recommended && (
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-xs uppercase text-muted-foreground">Next step within Execution (local to this area — your overall main target is on Home)</div>
          <div className="font-semibold">{recommended.title}</div>
          <p className="text-xs text-muted-foreground">{recommended.description}</p>
          {recommended.localStepSource === "domain_action" && (
            <p className="text-xs text-muted-foreground">
              priority {Math.round(recommended.priorityScore)} · impact {Math.round(recommended.expectedImpactScore)} · effort {Math.round(recommended.effortScore)}{recommended.verificationMetric ? ` · verify via ${humanizeMetricKey(recommended.verificationMetric)}` : ""}
            </p>
          )}
        </div>
      )}

      <section className="border rounded-lg p-4 bg-card">
        <h2 className="font-bold mb-3">Findings ({cycle.findings.length})</h2>
        {cycle.findings.length === 0 && <p className="text-sm text-muted-foreground">No execution issues detected.</p>}
        <div className="space-y-3">
          {cycle.findings.map((f: any) => (
            <div key={f.id} className="border-l-4 pl-3 py-1" style={{ borderColor: f.findingType === "opportunity" ? "#16a34a" : "#f59e0b" }}>
              <div className="flex justify-between">
                <span className="font-semibold">{f.title}</span>
                <span className="flex gap-1">
                  <Badge variant="muted-accessible">{ownLookup(FINDING_TYPE_LABEL, f.findingType) ?? f.findingType}</Badge>
                  <Badge variant={ownLookup(SEVERITY_VARIANT, f.severity)}>{ownLookup(SEVERITY_LABEL, f.severity) ?? f.severity}</Badge>
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{f.summary}</p>
              <p className="text-xs text-muted-foreground">
                <strong>Metric:</strong> {humanizeMetricKey(f.sourceMetric)} = {String(f.sourceValue)} (threshold {String(f.threshold)}) · confidence {Math.round((f.confidence ?? 0) * 100)}%
              </p>
              {Array.isArray(f.evidence) && f.evidence.length > 0 && (
                <p className="text-xs text-muted-foreground"><strong>Evidence:</strong> {f.evidence.map(humanizeEvidenceLine).join("; ")}</p>
              )}
              {f.verificationMetric && (
                <p className="text-xs text-muted-foreground"><strong>Verify via:</strong> {humanizeMetricKey(f.verificationMetric)}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded-lg p-4 bg-card">
        <h2 className="font-bold mb-3">Execution actions ({cycle.actions.length})</h2>
        <div className="space-y-3">
          {cycle.actions.map((a: any) => {
            const latestVerification = a.verifications?.[0];
            const isCompleteOpen = Boolean(editingAction && editingAction.actionId === a.id && editingAction.mode === "complete");
            const isVerifyOpen = Boolean(editingAction && editingAction.actionId === a.id && editingAction.mode === "verify");
            const completeFormId = `execution-complete-form-${a.id}`;
            const verifyFormId = `execution-verify-form-${a.id}`;
            return (
              <div key={a.id} className="border rounded p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold">{a.title}</div>
                    {a.carriedFromCycleSequence != null && (
                      <div className="text-xs text-muted-foreground">Still open from cycle #{a.carriedFromCycleSequence}
                        {a.stillFlaggedByLatestDiagnosis === false && " — the latest diagnosis no longer flags this; finish or cancel it"}
                      </div>
                    )}
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
                  {canRecordOutcome(a.status) && (
                  <Button
                    ref={(el) => { verifyTriggerRefs.current[a.id] = el; }}
                    aria-expanded={isVerifyOpen}
                    aria-controls={isVerifyOpen ? verifyFormId : undefined}
                    onClick={() => onEditingActionChange({ actionId: a.id, mode: "verify" })}
                    disabled={busy}
                  >
                    Verify outcome
                  </Button>
                  )}
                </div>
                {latestVerification && (
                  <div className="mt-2 text-xs">
                    <Badge variant={VERIFY_VARIANT[latestVerification.status] || "muted-accessible"}>
                      {VERIFY_LABEL[latestVerification.status] ?? latestVerification.status}
                    </Badge>{" "}
                    <VerificationEvidenceText verification={latestVerification} />
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
                    defaultDirection={getVerificationDirection(a.verificationMetric, a.findingCode)}
                    metricLabel={humanizeMetricKey(a.verificationMetric)}
                    measuredBaseline={a.measuredBaseline ?? null}
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

      <section className="border rounded-lg p-4 bg-card">
        <h2 className="font-bold mb-3">Diagnosis history</h2>
        <div className="space-y-1 text-sm">
          {history.map((c: any) => (
            <div key={c.id} className="flex justify-between border-b py-1">
              <span>Cycle #{c.sequenceNumber} — {new Date(c.createdAt).toLocaleDateString()}</span>
              <span className="text-muted-foreground">
                {STATE_LABEL[c.executionState] ?? c.executionState} · {c.findingCount} findings · {c.actionCount} actions
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
