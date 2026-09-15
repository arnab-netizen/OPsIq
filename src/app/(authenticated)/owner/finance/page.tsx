"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Input, Select, CardDashboardSkeleton } from "@/ui/primitives";
import { BUSINESS_TYPE_OPTIONS } from "@/domain/owner-mode/owner-data-hub";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { FindingCard } from "@/components/owner/FindingCard";
import { DiagnosisEmptyState } from "@/components/owner/DiagnosisEmptyState";
import { useActiveBusiness } from "@/context/active-business-context";
import { humanizeMetricKey, humanizeEvidenceLine } from "@/lib/metric-label";
import { formatHumanDate } from "@/lib/format-human-date";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { Disclosure } from "@/ui/primitives";

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

const SURVIVAL_VARIANT: Record<string, "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  SAFE: "success-accessible",
  WATCH: "default-accessible",
  AT_RISK: "warning-accessible",
  CRITICAL: "destructive-accessible",
  INSOLVENT_RISK: "destructive-accessible",
};

// The survival-state badge previously rendered the raw enum token verbatim (e.g. "AT_RISK",
// "INSOLVENT_RISK" with the underscore intact) -- every other owner-facing survival-state badge
// in the app (MinimumOwnerCockpit's SURVIVAL_LABEL) already goes through a plain-language map;
// this page just never had one.
const SURVIVAL_LABEL: Record<string, string> = {
  SAFE: "Safe",
  WATCH: "Watch",
  AT_RISK: "At risk",
  CRITICAL: "Critical",
  INSOLVENT_RISK: "Insolvency risk",
};

// Same raw-token leak as SURVIVAL_LABEL above, on the finance action status badge
// ("in_progress" rendered with its underscore intact).
const ACTION_STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
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

// Field names match financialSnapshotCreateSchema (Slice 6). `hint` is the plain-language
// explanation shown under each field (accounting term + short meaning + example, or what to
// enter if it doesn't apply) — a real usability test found the flat, unexplained ~27-field form
// unusable for an owner without an accounting background. Grouping these into progressive tiers
// (below) changes ONLY what's visible/expanded by default; every field name here still maps
// 1:1 to addSnapshot()'s FormData read, so the save payload is byte-for-byte unchanged.
const FINANCE_FIELDS: Array<{ name: string; label: string; hint: string }> = [
  { name: "revenue", label: "Revenue", hint: "Total sales in a typical month, before costs. Example: 15000." },
  { name: "b2cRevenue", label: "B2C revenue", hint: "Sales directly to individual customers, if you track it separately. Leave blank if you don't split this out." },
  { name: "b2bRevenue", label: "B2B revenue", hint: "Sales to other businesses, if you track it separately. Leave blank if you don't split this out." },
  { name: "costOfGoodsOrServices", label: "Cost of goods/services", hint: "What it directly cost you to make or deliver what you sold (materials, direct labor) — accountants call this COGS." },
  { name: "fixedCosts", label: "Fixed costs", hint: "Rent, wages, and other costs that stay the same whether sales go up or down. Example: 7000." },
  { name: "variableCosts", label: "Variable costs", hint: "Costs that rise and fall with how much you sell, like materials or delivery. Example: 3000." },
  { name: "rent", label: "Rent", hint: "Rent for your business space, if any. Leave blank if you don't rent a space." },
  { name: "salaryPayroll", label: "Salary / payroll", hint: "Wages and salaries paid to staff, not including money you took for yourself." },
  { name: "utilities", label: "Utilities", hint: "Electricity, water, internet, and similar recurring bills." },
  { name: "deliveryFulfilmentCost", label: "Delivery / fulfilment", hint: "Shipping, courier, or delivery costs. Leave blank if you don't deliver." },
  { name: "marketingSpend", label: "Marketing spend", hint: "Advertising and promotion spend. Leave blank if you didn't spend on this." },
  { name: "discountAmount", label: "Discount amount", hint: "Discounts you gave customers this period." },
  { name: "refundAmount", label: "Refund amount", hint: "Refunds you paid out this period." },
  { name: "reworkCost", label: "Rework cost", hint: "Cost of redoing work that didn't meet quality the first time. Leave blank if this doesn't apply." },
  { name: "complaintCost", label: "Complaint cost", hint: "Cost of resolving customer complaints beyond a refund (e.g. replacement, goodwill). Leave blank if none." },
  { name: "loanEmiDebtPayments", label: "Loan / EMI payments", hint: "Loan or EMI payments you made this period. Leave blank if you have no loans." },
  { name: "totalDebtOutstanding", label: "Total debt outstanding", hint: "The total amount you still owe across all loans right now." },
  { name: "cashOnHand", label: "Cash on hand", hint: "Cash and bank balance you could use today. Example: 20000." },
  { name: "receivables", label: "Receivables", hint: "Money customers owe you that isn't overdue yet — accountants call this accounts receivable." },
  { name: "receivablesOverdue", label: "Receivables overdue", hint: "Of the money customers owe you, how much is now overdue." },
  { name: "payables", label: "Payables", hint: "Money you owe suppliers that isn't overdue yet — accountants call this accounts payable." },
  { name: "payablesOverdue", label: "Payables overdue", hint: "Of the money you owe suppliers, how much is now overdue." },
  { name: "ownerWithdrawals", label: "Owner withdrawals", hint: "Money you personally took out of the business this period (not a salary)." },
  { name: "inventoryStockCashLock", label: "Inventory cash lock", hint: "Cash tied up in unsold stock right now. Leave blank if you don't hold stock." },
  { name: "orderCount", label: "Order count", hint: "Number of orders or jobs completed in this period." },
  { name: "customerCount", label: "Customer count", hint: "Number of different customers you served in this period." },
  { name: "repeatCustomerCount", label: "Repeat customers", hint: "Of those customers, how many had bought from you before." },
];

function financeField(name: string) {
  const f = FINANCE_FIELDS.find((x) => x.name === name);
  if (!f) throw new Error(`Unknown finance field: ${name}`);
  return f;
}

// Progressive disclosure tiers — see the FINANCE_FIELDS comment above for why this never changes
// what gets submitted, only what's visible/expanded by default. Every FINANCE_FIELDS name appears
// in exactly one tier below.
const QUICK_FIELD_NAMES = ["revenue", "fixedCosts", "variableCosts", "cashOnHand"];

const IMPROVE_GROUPS: Array<{ title: string; fieldNames: string[] }> = [
  { title: "Sales detail", fieldNames: ["b2cRevenue", "b2bRevenue", "orderCount", "customerCount", "repeatCustomerCount"] },
  { title: "Regular costs", fieldNames: ["costOfGoodsOrServices", "rent", "salaryPayroll", "utilities", "deliveryFulfilmentCost", "marketingSpend"] },
  { title: "Customer money owed", fieldNames: ["receivables", "receivablesOverdue"] },
  { title: "Supplier money owed", fieldNames: ["payables", "payablesOverdue"] },
  { title: "Loans", fieldNames: ["loanEmiDebtPayments", "totalDebtOutstanding"] },
  { title: "Stock", fieldNames: ["inventoryStockCashLock"] },
  { title: "Discounts & refunds", fieldNames: ["discountAmount", "refundAmount"] },
];

const ADVANCED_FIELD_NAMES = ["reworkCost", "complaintCost", "ownerWithdrawals"];

// P0-D: minimal local draft persistence for the unfinished "Add financial snapshot" form, keyed
// per business so switching business never leaks one business's unsaved draft into another. Only
// the fields the mission scopes are persisted (no full 27-field form, no submitted/response data),
// storage is best-effort (private browsing / quota can throw), and a malformed stored value fails
// closed to "no draft" rather than crashing the page.
const DRAFT_FIELDS = ["periodStart", "periodEnd", "businessModel", "revenue", "fixedCosts", "variableCosts", "cashOnHand"] as const;
type DraftField = (typeof DRAFT_FIELDS)[number];
type FinanceDraft = Partial<Record<DraftField, string>>;

function financeDraftKey(businessId: string) {
  return `opsiq:finance-draft:${businessId}`;
}

function readFinanceDraft(businessId: string): FinanceDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(financeDraftKey(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const draft: FinanceDraft = {};
    for (const field of DRAFT_FIELDS) {
      const v = (parsed as Record<string, unknown>)[field];
      if (typeof v === "string") draft[field] = v;
    }
    return draft;
  } catch {
    return null;
  }
}

function writeFinanceDraft(businessId: string, draft: FinanceDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(financeDraftKey(businessId), JSON.stringify(draft));
  } catch {
    // best-effort only -- storage unavailable/full must never block the form
  }
}

function clearFinanceDraft(businessId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(financeDraftKey(businessId));
  } catch {
    // best-effort
  }
}

const DRAFT_DEBOUNCE_MS = 400;

export default function OwnerFinancePage() {
  const { activeBusinessId, needsBusinessRecovery, setActiveBusinessId, refreshBusinesses, loading: contextLoading } = useActiveBusiness();
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showBusinessForm, setShowBusinessForm] = useState(false);
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);
  // P0-E: the snapshot form's save error is scoped separately from the shared page-level `error`
  // above (used by the other four mutations on this page) so it can render next to the Save
  // button instead of at the top of the page, far from where the owner is looking.
  const [snapshotError, setSnapshotError] = useState<{ message: string; retryable: boolean } | null>(null);
  const draftDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    };
  }, []);

  function handleSnapshotFormChange(e: React.FormEvent<HTMLFormElement>) {
    if (!selected) return;
    const form = e.currentTarget;
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(() => {
      const fd = new FormData(form);
      const draft: FinanceDraft = {};
      for (const field of DRAFT_FIELDS) {
        const v = fd.get(field);
        if (typeof v === "string" && v !== "") draft[field] = v;
      }
      writeFinanceDraft(selected, draft);
    }, DRAFT_DEBOUNCE_MS);
  }

  const load = useCallback(async (businessId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = businessId ? `?businessId=${businessId}` : "";
      const data = await api(`/api/owner/finance/dashboard${qs}`);
      setDashboard(data);
      setSelected(data.selectedBusinessId);
      // Keep the shared active-business context in sync with whichever business this page
      // actually resolved to (e.g. the server's own first-run default), so the OTHER owner
      // pages the human tester found diverging (Customers, Operations, ...) land on the same
      // business rather than each independently re-deriving their own default.
      if (data.selectedBusinessId) setActiveBusinessId(data.selectedBusinessId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [setActiveBusinessId]);

  // Wait for the shared context to resolve first so this page's initial fetch already carries
  // the owner's actual active business instead of fetching once with no businessId (letting the
  // server pick businesses[0]) and then re-fetching a moment later.
  useEffect(() => {
    if (contextLoading) return;
    // A pending business-recovery choice (see ActiveBusinessContext) must never be silently
    // resolved by letting the server pick its own default businessId — that would repeat the
    // exact bug this context exists to prevent. Wait for the owner to explicitly choose.
    if (needsBusinessRecovery) return;
    void load(activeBusinessId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the shared context resolves or the owner explicitly switches business, not on every `load` identity change
  }, [contextLoading, activeBusinessId, needsBusinessRecovery]);

  async function createBusiness(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      // Finance reuses OwnerBusiness; create via the shared recovery businesses route.
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
    setSnapshotError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      periodStart: fd.get("periodStart"),
      periodEnd: fd.get("periodEnd"),
      currency: currentBusiness?.currency || fd.get("currency") || "INR",
    };
    const model = fd.get("businessModel");
    if (model && typeof model === "string" && model.trim()) body.businessModel = model;
    for (const f of FINANCE_FIELDS) {
      const v = fd.get(f.name);
      if (v && typeof v === "string" && v.trim()) body[f.name] = parseFloat(v);
    }
    try {
      await api(`/api/owner/finance/businesses/${selected}/snapshots`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      // Draft is cleared only now, on confirmed success -- never at submission start, so a
      // failed save leaves the draft (and the on-screen values) intact for retry.
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
      clearFinanceDraft(selected);
      setShowSnapshotForm(false);
      await load(selected);
    } catch (e) {
      // Governed classification, never the raw fetch/exception text -- see P0-E.
      const governed = classifyOperatorError(e, { context: "save" });
      setSnapshotError({
        message: `We couldn't save this snapshot. Your entries are still here. ${governed.recovery}`,
        retryable: governed.isRetryable,
      });
    } finally {
      setBusy(false);
    }
  }

  async function runDiagnosis() {
    if (!selected || !dashboard?.latestSnapshot) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/finance/businesses/${selected}/diagnoses`, {
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
      await api(`/api/owner/finance/actions/${action.id}`, {
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
      const dir = window.prompt("Target direction (up / down):", "down");
      if (dir === null) { setBusy(false); return; }
      await api(`/api/owner/finance/actions/${action.id}/verify`, {
        method: "POST",
        body: JSON.stringify({
          beforeValue: beforeRaw.trim() === "" ? null : parseFloat(beforeRaw),
          afterValue: afterRaw.trim() === "" ? null : parseFloat(afterRaw),
          targetDirection: dir === "up" ? "up" : "down",
        }),
      });
      await load(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to verify");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <CardDashboardSkeleton label="Loading finance workspace" />;

  const businesses: any[] = dashboard?.businesses ?? [];
  const currentBusiness = businesses.find((b) => b.id === selected) || null;
  const cycle = dashboard?.latestCycle ?? null;
  const score = dashboard?.domainScore ?? null;
  const missing: string[] = dashboard?.missingCriticalData ?? [];
  // Read once per render for the currently-open form's initial mount -- see the `key={selected}`
  // on the snapshot <form> below, which remounts (and so re-reads this) whenever business
  // switches, so an in-progress draft never leaks across businesses.
  const snapshotDraft: FinanceDraft | null = selected && showSnapshotForm ? readFinanceDraft(selected) : null;

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold tracking-tight text-foreground">Money</h1>
          <p className="text-muted-foreground text-sm">
            Diagnose money, find leaks, and act on the single highest-impact financial move — with verification.
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
          No businesses yet. Create your first business to begin a finance diagnosis.
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-3">
            <BusinessContextSelector
              businesses={businesses}
              selectedId={selected}
              onChange={(businessId) => setActiveBusinessId(businessId)}
            />
            <Button onClick={() => setShowSnapshotForm((s) => !s)} disabled={!selected}>
              + Add financial snapshot
            </Button>
            <Button onClick={runDiagnosis} disabled={!selected || !dashboard?.latestSnapshot || busy}>
              Run finance diagnosis
            </Button>
          </div>

          {showSnapshotForm && (
            <form
              key={selected}
              onSubmit={addSnapshot}
              onChange={handleSnapshotFormChange}
              className="mb-6 border rounded-lg p-4 bg-card space-y-3"
            >
              <h2 className="font-semibold">
                Financial snapshot {currentBusiness ? `(${currentBusiness.currency})` : ""}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input name="periodStart" label="Period start" type="date" required defaultValue={snapshotDraft?.periodStart ?? ""} />
                <Input name="periodEnd" label="Period end" type="date" required defaultValue={snapshotDraft?.periodEnd ?? ""} />
                <Select
                  name="businessModel"
                  label="Business model"
                  defaultValue={snapshotDraft?.businessModel ?? ""}
                  options={[
                    { value: "", label: "—" },
                    { value: "service", label: "Service" },
                    { value: "inventory", label: "Inventory / retail" },
                    { value: "hybrid", label: "Hybrid" },
                  ]}
                />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Quick financial picture</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  These four numbers are enough for a first read. Estimates are fine — you can
                  refine them later.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {QUICK_FIELD_NAMES.map((name) => {
                    const f = financeField(name);
                    return (
                      <Input
                        key={f.name}
                        name={f.name}
                        label={f.label}
                        type="number"
                        placeholder="—"
                        hint={f.hint}
                        defaultValue={snapshotDraft?.[f.name as DraftField] ?? ""}
                      />
                    );
                  })}
                </div>
              </div>

              <Disclosure summary="Improve the analysis (optional)">
                <p className="mb-3">
                  Adding these makes OpsIQ&rsquo;s read of your business more accurate. Leave
                  anything blank that doesn&rsquo;t apply — missing data is reported, never
                  invented.
                </p>
                <div className="flex flex-col gap-4">
                  {IMPROVE_GROUPS.map((group) => (
                    <div key={group.title}>
                      <p className="text-sm font-medium text-foreground">{group.title}</p>
                      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {group.fieldNames.map((name) => {
                          const f = financeField(name);
                          return <Input key={f.name} name={f.name} label={f.label} type="number" placeholder="—" hint={f.hint} />;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Disclosure>

              <Disclosure summary="Advanced detail (optional)">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {ADVANCED_FIELD_NAMES.map((name) => {
                    const f = financeField(name);
                    return <Input key={f.name} name={f.name} label={f.label} type="number" placeholder="—" hint={f.hint} />;
                  })}
                </div>
              </Disclosure>

              {snapshotError && (
                <div
                  role="alert"
                  data-testid="snapshot-save-error"
                  className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  {snapshotError.message}
                </div>
              )}
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save snapshot"}</Button>
            </form>
          )}

          {!dashboard?.hasData ? (
            <DiagnosisEmptyState
              domainLabel="financial"
              hasSnapshot={Boolean(dashboard?.latestSnapshot)}
              snapshotLabel="financial snapshot"
              diagnosisLabel="Run finance diagnosis"
            />
          ) : (
            <FinanceCycleView
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

function FinanceCycleView({
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
  return (
    <div className="flex flex-col gap-5">
      <div className="border-l-2 pl-5 py-1" style={{ borderColor: "var(--accent-ink)" }}>
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--accent-ink)" }}>
            Financial position · cycle #{cycle.sequenceNumber}
          </span>
          <Badge variant={SURVIVAL_VARIANT[score?.survivalState ?? cycle.survivalState] || "muted-accessible"}>
            {SURVIVAL_LABEL[score?.survivalState ?? cycle.survivalState] ?? (score?.survivalState ?? cycle.survivalState)}
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
          {[
            ["Health", score?.healthScore ?? cycle.overallHealthScore],
            ["Risk", score?.riskScore ?? cycle.survivalRiskScore],
            ["Opportunity", score?.opportunityScore ?? cycle.growthOpportunityScore],
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
          Data confidence {Math.round(score?.dataConfidenceScore ?? cycle.dataConfidenceScore)}/100 — how much of this reading rests on real, supplied numbers.
        </p>
      </div>

      {(score?.dataConfidenceScore ?? cycle.dataConfidenceScore) < 30 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive font-medium">
          ⚠ Data confidence is critically low ({Math.round(score?.dataConfidenceScore ?? cycle.dataConfidenceScore)}/100 — BLOCKED tier). Diagnosis results are unreliable and should not be acted upon without providing the missing critical inputs below.
        </div>
      )}

      {missing.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <strong>Missing critical data:</strong> {missing.join(", ")} — provide these to raise confidence.
        </div>
      )}

      {recommended && (
        <div className="border-t border-border pt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Recommended next financial action</div>
          <div className="mt-1 font-display text-[1.1rem] font-semibold text-foreground">{recommended.title}</div>
          <p className="text-xs text-muted-foreground">{recommended.description}</p>
          {recommended.evidenceRationale && (
            <p className="text-xs text-muted-foreground italic">Why: {recommended.evidenceRationale}</p>
          )}
          {Array.isArray(recommended.evidence) && recommended.evidence.length > 0 && (
            <p className="text-xs text-muted-foreground">Based on: {recommended.evidence.join(" · ")}</p>
          )}
          <p className="text-xs text-muted-foreground">
            priority {Math.round(recommended.priorityScore)} · impact {Math.round(recommended.expectedImpactScore)} · effort {Math.round(recommended.effortScore)} · verify via {humanizeMetricKey(recommended.verificationMetric)}
          </p>
        </div>
      )}

      {/*
        Findings — the signature "what OpsIQ found" experience, now the shared FindingCard
        component (src/components/owner/FindingCard.tsx) instead of one-off JSX -- Operations
        renders the exact same card for its own findings, since OwnerOperationsFinding has the
        identical shape. "What changed" / "why this action" / "other options" from the full
        8-section spec are not shown per finding: this cycle-level view has no per-finding
        change-history or alternative-action data to draw on honestly (cycle #1 has no prior cycle
        to diff against here, and actions aren't linked back to the finding that raised them) --
        real limitations, not a design choice, so nothing is invented to fill those sections.
      */}
      <section className="border-t border-border pt-4">
        <h2 className="font-display text-[1.1rem] font-semibold text-foreground mb-4">Findings ({cycle.findings.length})</h2>
        {cycle.findings.length === 0 && <p className="text-sm text-muted-foreground">No findings generated — this may indicate missing input data rather than a healthy business. Check data confidence above.</p>}
        <div className="flex flex-col gap-6">
          {cycle.findings.map((f: any) => (
            <FindingCard key={f.id} finding={f} />
          ))}
        </div>
      </section>

      <section className="border-t border-border pt-4">
        <h2 className="font-display text-[1.1rem] font-semibold text-foreground mb-3">Finance actions ({cycle.actions.length})</h2>
        <div className="space-y-3">
          {cycle.actions.map((a: any) => {
            const latestVerification = a.verifications?.[0];
            return (
              <div key={a.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex justify-between items-start">
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
                      before {String(latestVerification.beforeValue)} → after {String(latestVerification.afterValue)} ({latestVerification.targetDirection})
                    </span>
                  </div>
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
                {SURVIVAL_LABEL[c.survivalState] ?? c.survivalState} · {c.findingCount} findings · {c.actionCount} actions
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
