"use client";

import { VerificationEvidenceText } from "@/components/owner/VerificationEvidenceText";
import { canRecordOutcome } from "@/domain/founder-recovery/verification-evidence";
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
import { httpResponseErrorFromBody } from "@/lib/operator-safe-errors";
import { presentDomainError } from "@/lib/owner-domain-error-presentation";

import { humanizeMetricKey, humanizeEvidenceLine } from "@/lib/metric-label";
import { getVerificationDirection } from "@/domain/owner-mode/verification-direction";
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
// UX-04B: "cancelled" was missing from this map (present in Money's/Operations' equivalent maps)
// -- a cancelled action would otherwise fall through to the raw status literal. See UX-04A
// Section M / Section Q item 3.
const ACTION_STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

const STATE_VARIANT: Record<string, "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  STRONG: "success-accessible",
  STEADY: "default-accessible",
  SOFT: "warning-accessible",
  WEAK: "destructive-accessible",
  CRITICAL: "destructive-accessible",
};
const STATE_LABEL: Record<string, string> = {
  STRONG: "Strong",
  STEADY: "Steady",
  SOFT: "Soft",
  WEAK: "Weak",
  CRITICAL: "Critical",
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

// Field names match salesSnapshotCreateSchema (Slice 5). `hint` is added only where the field
// name alone is genuinely ambiguous and metrics.ts/types.ts supports a specific clarification --
// see sales-snapshot-form-hints.test.tsx for the source each hint is checked against. Hints are
// deliberately narrow: each states only what a formula, fallback, or type comment in
// domain/owner-sales/{types,metrics}.ts actually establishes (a computed relationship between two
// fields), never a business-process claim (what counts as a "qualified" lead, whether a customer
// is new "for the first time ever", whether a pipeline deal is "closed") that the schema doesn't
// enforce and no source comment states. Where the only available clarification would require
// inventing such a claim, the field is left without a hint. Fields with no listed ambiguity
// (orders, revenue, b2b/b2c revenue split, complaints, discounts, refunds, staff count) are left
// without a hint rather than restating the label.
const SALES_FIELDS: Array<{ name: string; label: string; hint?: string }> = [
  { name: "leads", label: "Leads" },
  { name: "qualifiedLeads", label: "Qualified leads", hint: "Tracked as its own number, not calculated from Leads above -- used for a separate conversion-rate measurement." },
  { name: "orders", label: "Orders" },
  { name: "revenue", label: "Revenue" },
  { name: "averageOrderValue", label: "Average order value", hint: "Leave blank to calculate this automatically from revenue and orders. Enter a value only if you track it separately." },
  { name: "newCustomers", label: "New customers", hint: "New customers plus repeat customers below should add up to your active customers this period." },
  { name: "repeatCustomers", label: "Repeat customers", hint: "Added with new customers above to total your active customers this period." },
  { name: "lostCustomers", label: "Lost customers", hint: "Added with active customers above when calculating this period's customer-loss rate." },
  { name: "b2bProspects", label: "B2B prospects" },
  // b2bPipelineValue: b2bPipelineCoveragePct (metrics.ts) divides this by the general `revenue`
  // field above (not b2bRevenue, which renders directly below it in this group) -- a hint saying
  // "compared against your revenue below" would point at the wrong field. Left unresolved rather
  // than invent a corrected phrasing; no hint.
  { name: "b2bPipelineValue", label: "B2B pipeline value" },
  { name: "b2bRevenue", label: "B2B revenue" },
  { name: "b2cRevenue", label: "B2C revenue" },
  { name: "complaints", label: "Complaints" },
  { name: "discountAmount", label: "Discount amount" },
  { name: "refundAmount", label: "Refund amount" },
  { name: "staffCount", label: "Sales staff count" },
];

function salesField(name: string) {
  const f = SALES_FIELDS.find((x) => x.name === name);
  if (!f) throw new Error(`Unknown sales field: ${name}`);
  return f;
}

// Presentation-only grouping for the snapshot form below -- each group is a contiguous run of
// SALES_FIELDS in its existing order, so field order (and therefore tab order) is unchanged from
// the previous flat layout. Every SALES_FIELDS name appears in exactly one group, and addSnapshot()
// still reads the payload from SALES_FIELDS directly, so the save payload is unaffected.
const SALES_FIELD_GROUPS: Array<{ title: string; fieldNames: string[] }> = [
  { title: "Leads, orders & revenue", fieldNames: ["leads", "qualifiedLeads", "orders", "revenue", "averageOrderValue"] },
  { title: "Customers", fieldNames: ["newCustomers", "repeatCustomers", "lostCustomers"] },
  { title: "B2B & B2C revenue", fieldNames: ["b2bProspects", "b2bPipelineValue", "b2bRevenue", "b2cRevenue"] },
  { title: "Complaints, discounts & team", fieldNames: ["complaints", "discountAmount", "refundAmount", "staffCount"] },
];

export default function OwnerSalesPage() {
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
      const data = await api(`/api/owner/sales/dashboard${qs}`);
      // A newer load() has since started -- this response is stale and must never commit.
      if (loadGenerationRef.current !== generation) return;
      setDashboard(data);
      setSelected(data.selectedBusinessId);
      // Keep the shared active-business context in sync — see finance/page.tsx and
      // operations/page.tsx for the root cause this closes (each owner page independently
      // defaulting to a different business, e.g. the first row returned by the server, instead
      // of the business selected elsewhere in the app).
      if (data.selectedBusinessId) setActiveBusinessId(data.selectedBusinessId);
    } catch (e) {
      // A stale failure must never clobber an already-successful, current render with an error.
      if (loadGenerationRef.current !== generation) return;
      // UX-04B: governed classification, never the raw fetch/exception text -- mirrors Money's
      // already-shipped pattern (see UX-04A Section Q item 4).
      setError(presentDomainError(e instanceof Error ? e : new Error("Failed to load"), "load"));
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
      // Sales reuses OwnerBusiness; create via the shared recovery businesses route.
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
      setError(presentDomainError(e instanceof Error ? e : new Error("Failed to create business"), "save"));
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
    for (const f of SALES_FIELDS) {
      const v = fd.get(f.name);
      if (v && typeof v === "string" && v.trim()) body[f.name] = parseFloat(v);
    }
    try {
      await api(`/api/owner/sales/businesses/${targetBusinessId}/snapshots`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      // Stale-mutation-intent guard: only close the form / reload if the owner is still looking
      // at the business this save was for.
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setShowSnapshotForm(false);
      await load(targetBusinessId);
    } catch (e) {
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      setError(presentDomainError(e instanceof Error ? e : new Error("Failed to save snapshot"), "save"));
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
      await api(`/api/owner/sales/businesses/${targetBusinessId}/diagnoses`, {
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
    const targetBusinessId = selected;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/sales/actions/${action.id}`, {
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
      await api(`/api/owner/sales/actions/${action.id}`, {
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
      await api(`/api/owner/sales/actions/${action.id}/verify`, {
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

  if (loading) return <CardDashboardSkeleton label="Loading your sales information" />;

  const businesses: any[] = dashboard?.businesses ?? [];
  const currentBusiness = businesses.find((b) => b.id === selected) || null;
  const cycle = dashboard?.latestCycle ?? null;
  const score = dashboard?.domainScore ?? null;
  const missing: string[] = dashboard?.missingCriticalData ?? [];

  return (
    <PageContainer>
      <div className="mb-6">
        <PageHeader
          title="Sales"
          description="Where sales leak, who is churning, what to push next — with the single highest-impact sales move and verification."
          actions={<Button onClick={() => setShowBusinessForm((s) => !s)}>+ New business</Button>}
        />
      </div>

      {error && (
        <div
          role="alert"
          data-testid="sales-page-error"
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
          No businesses yet. Create your first business to begin a sales diagnosis.
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
              + Add sales snapshot
            </Button>
            <Button onClick={runDiagnosis} disabled={!selected || !dashboard?.latestSnapshot || busy}>
              Run sales diagnosis
            </Button>
          </div>

          {showSnapshotForm && (
            <form onSubmit={addSnapshot} className="mb-6 border rounded-lg p-4 bg-card space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                Sales snapshot {currentBusiness ? `(${currentBusiness.currency})` : ""}
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
                {SALES_FIELD_GROUPS.map((group) => (
                  <div key={group.title}>
                    <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
                    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {group.fieldNames.map((name) => {
                        const f = salesField(name);
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

          {!dashboard?.hasData ? (
            <DiagnosisEmptyState
              domainLabel="sales"
              hasSnapshot={Boolean(dashboard?.latestSnapshot)}
              snapshotLabel="sales snapshot"
              diagnosisLabel="Run sales diagnosis"
            />
          ) : (
            <SalesCycleView
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

function SalesCycleView({
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
  const state = score?.salesState ?? cycle.salesState;
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
          <div className="text-xs uppercase text-muted-foreground">Recommended next sales action</div>
          <div className="font-semibold">{recommended.title}</div>
          <p className="text-xs text-muted-foreground">{recommended.description}</p>
          <p className="text-xs text-muted-foreground">
            priority {Math.round(recommended.priorityScore)} · impact {Math.round(recommended.expectedImpactScore)} · effort {Math.round(recommended.effortScore)} · verify via {humanizeMetricKey(recommended.verificationMetric)}
          </p>
        </div>
      )}

      {/* Findings — the shared FindingCard component (src/components/owner/FindingCard.tsx),
          the exact same card Money and Operations render: OwnerSalesFinding has the identical
          shape to OwnerFinanceFinding/OwnerOperationsFinding, so this is the same real
          component, not a look-alike copy (UX-06 Section S). */}
      <section className="border rounded-lg p-4 bg-card">
        <h2 className="font-bold mb-3">Findings ({cycle.findings.length})</h2>
        {cycle.findings.length === 0 && <p className="text-sm text-muted-foreground">No sales issues detected.</p>}
        <div className="flex flex-col gap-6">
          {cycle.findings.map((f: any) => (
            <FindingCard key={f.id} finding={f} />
          ))}
        </div>
      </section>

      <section className="border rounded-lg p-4 bg-card">
        <h2 className="font-bold mb-3">Sales actions ({cycle.actions.length})</h2>
        <div className="space-y-3">
          {cycle.actions.map((a: any) => {
            const latestVerification = a.verifications?.[0];
            const isCompleteOpen = Boolean(editingAction && editingAction.actionId === a.id && editingAction.mode === "complete");
            const isVerifyOpen = Boolean(editingAction && editingAction.actionId === a.id && editingAction.mode === "verify");
            const completeFormId = `sales-complete-form-${a.id}`;
            const verifyFormId = `sales-verify-form-${a.id}`;
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
                {STATE_LABEL[c.salesState] ?? c.salesState} · {c.findingCount} findings · {c.actionCount} actions
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
