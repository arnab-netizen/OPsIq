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
import { humanizeMetricKey, humanizeEvidenceLine } from "@/lib/metric-label";
import { getVerificationDirection } from "@/domain/owner-mode/verification-direction";
import { formatHumanDate } from "@/lib/format-human-date";
import { httpResponseErrorFromBody } from "@/lib/operator-safe-errors";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { presentDomainError } from "@/lib/owner-domain-error-presentation";
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
// UX-04B hostile-audit correction: this map omitted "cancelled", one of the six literals in the
// shared RECOVERY_ACTION_STATUSES source of truth (src/domain/founder-recovery/action-status.ts)
// -- a cancelled action would otherwise fall through to the raw status literal, the exact leak
// class this map exists to close. The original UX-04A/UX-04B claim that Money already had
// complete coverage was incorrect; corrected here alongside Operations (Sales already had it).
const ACTION_STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
  cancelled: "Cancelled",
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
  // UX-06 Wave B1: at most one action-editing inline form open at a time on this page (Section
  // Z/AA's frozen state shape). Page-local -- no global store, no context.
  const [editingAction, setEditingAction] = useState<{ actionId: string; mode: "complete" | "verify" } | null>(null);
  const draftDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // UX-06 Wave B1: React state alone does not synchronously protect two rapid Save clicks within
  // the same tick (mirrors approveInFlightRef from UX-06A2) -- local to the completion/verification
  // mutation only, not a general concurrency framework.
  const actionMutationInFlightRef = useRef(false);
  // UX-04B: stale business-switch response guard, mirroring the loadGenerationRef pattern already
  // shipped for Home (owner/cockpit/page.tsx, UX-03). Without this, a slow response for a
  // previously-active business arriving after a switch could silently overwrite the newer
  // business's state and re-anchor the shared activeBusinessId back to the stale one -- see
  // UX-04A Section J item 1.
  const loadGenerationRef = useRef(0);
  // UX-04B hostile-audit correction: the generation guard above closes the STALE-RESPONSE race
  // (an old load() resolving late), but a SECOND, distinct race survived it -- a business-scoped
  // MUTATION (addSnapshot/runDiagnosis/updateAction/verifyAction) started for business A can
  // still be in flight when the owner switches to B; if A's mutation succeeds afterward, its own
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
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setError(null);
    try {
      const qs = businessId ? `?businessId=${businessId}` : "";
      const data = await api(`/api/owner/finance/dashboard${qs}`);
      // A newer load() has since started (the active business changed again while this request
      // was in flight) -- this response is stale and must never commit. See the loadGenerationRef
      // declaration above.
      if (loadGenerationRef.current !== generation) return;
      setDashboard(data);
      setSelected(data.selectedBusinessId);
      // Keep the shared active-business context in sync with whichever business this page
      // actually resolved to (e.g. the server's own first-run default), so the OTHER owner
      // pages the human tester found diverging (Customers, Operations, ...) land on the same
      // business rather than each independently re-deriving their own default.
      if (data.selectedBusinessId) setActiveBusinessId(data.selectedBusinessId);
    } catch (e) {
      // A stale failure (e.g. a slow request for a business the owner already switched away
      // from) must never clobber an already-successful, current render with an error screen.
      if (loadGenerationRef.current !== generation) return;
      // Governed classification, never the raw fetch/exception text -- see the P0-E pattern
      // already used by addSnapshot() below and by the cockpit page's load handler. A thrown
      // Error here can carry a server-side NotFoundError's raw `"<EntityType> not found: <uuid>"`
      // message (see infra/errors.ts), which must never reach the owner verbatim.
      setError(presentDomainError(e instanceof Error ? e : new Error("Failed to load"), "load"));
    } finally {
      // A stale request's completion must never toggle the loading flag for a request that's no
      // longer current -- it could otherwise dismiss the skeleton for a newer request still in
      // flight.
      if (loadGenerationRef.current === generation) setLoading(false);
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
      // Governed classification -- see load()'s comment above.
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
      // failed save leaves the draft (and the on-screen values) intact for retry. This cleanup is
      // specific to targetBusinessId and reflects a confirmed successful server save for THAT
      // business -- safe to do even if the owner has since switched away (see UX-04A/UX-04B: a
      // confirmed-successful save's own draft-clear is not cross-business contamination).
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
      clearFinanceDraft(targetBusinessId);
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
    // See addSnapshot's comment on why the target business is captured before the await.
    const targetBusinessId = selected;
    const snapshotId = dashboard.latestSnapshot.id;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/finance/businesses/${selected}/diagnoses`, {
        method: "POST",
        body: JSON.stringify({ snapshotId }),
      });
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      await load(targetBusinessId);
    } catch (e) {
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      // Governed classification -- see load()'s comment above.
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
      await api(`/api/owner/finance/actions/${action.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      await load(targetBusinessId);
    } catch (e) {
      if (activeBusinessIdRef.current !== targetBusinessId) return;
      // Governed classification -- see load()'s comment above.
      setError(presentDomainError(e instanceof Error ? e : new Error("Failed to update action"), "action"));
    } finally {
      setBusy(false);
    }
  }

  // UX-06 Wave B1 (Section X.2, K): replaces the two native-dialog calls previously inlined in
  // updateAction()'s "completed" branch. Same PATCH endpoint, method, and body shape -- only the
  // completionNotes/completionEvidence source changed from a native dialog to the inline form.
  async function completeAction(action: any, values: CompletionValues) {
    if (actionMutationInFlightRef.current) return;
    actionMutationInFlightRef.current = true;
    const targetBusinessId = selected;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/finance/actions/${action.id}`, {
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
      // Governed classification -- see load()'s comment above. Failure must never clear the open
      // inline form (Section Z's frozen contract), so editingAction is left untouched here.
      setError(presentDomainError(e instanceof Error ? e : new Error("Failed to update action"), "action"));
    } finally {
      setBusy(false);
      actionMutationInFlightRef.current = false;
    }
  }

  // UX-06 Wave B1: replaces the three native-dialog calls previously inlined in verifyAction().
  // Same POST endpoint and body shape -- the inline form has already validated/typed the values
  // before this is called (Section K's frozen semantics: blank -> null, never 0/NaN/"").
  async function verifyActionSubmit(action: any, values: VerificationValues): Promise<string | null> {
    if (actionMutationInFlightRef.current) return null;
    actionMutationInFlightRef.current = true;
    const targetBusinessId = selected;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/finance/actions/${action.id}/verify`, {
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
      // Governed classification -- see load()'s comment above. Failure must never clear the open
      // inline form.
      const message = presentDomainError(e instanceof Error ? e : new Error("Failed to verify"), "action");
      setError(message);
      // Also returned so the open inline form shows it next to the fields.
      return message;
    } finally {
      setBusy(false);
      actionMutationInFlightRef.current = false;
    }
  }

  if (loading) return <CardDashboardSkeleton label="Loading your money information" />;

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
    <PageContainer>
      <div className="mb-6">
        <PageHeader
          title="Money"
          description="Diagnose money, find leaks, and act on the single highest-impact financial move — with verification."
          actions={<Button onClick={() => setShowBusinessForm((s) => !s)}>+ New business</Button>}
        />
      </div>

      {error && (
        <div
          role="alert"
          data-testid="finance-page-error"
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
          No businesses yet. Create your first business to begin a finance diagnosis.
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

function FinanceCycleView({
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
          ⚠ Data confidence is critically low ({Math.round(score?.dataConfidenceScore ?? cycle.dataConfidenceScore)}/100). These results may be unreliable and should not be acted on until the missing critical information below is provided.
        </div>
      )}

      {missing.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <strong>Missing critical data:</strong> {missing.map(humanizeMetricKey).join(", ")} — provide these to raise confidence.
        </div>
      )}

      {recommended && (
        <div className="border-t border-border pt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Next step within Finance (local to this area — your overall main target is on Home)</div>
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
            const isCompleteOpen = Boolean(editingAction && editingAction.actionId === a.id && editingAction.mode === "complete");
            const isVerifyOpen = Boolean(editingAction && editingAction.actionId === a.id && editingAction.mode === "verify");
            const completeFormId = `finance-complete-form-${a.id}`;
            const verifyFormId = `finance-verify-form-${a.id}`;
            return (
              <div key={a.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
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
                      // Return focus to the exact button that opened this row's form -- a no-op
                      // if it no longer exists (e.g. the row itself is gone after a reload).
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
