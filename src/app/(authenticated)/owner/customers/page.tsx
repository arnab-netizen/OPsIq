"use client";

/**
 * /owner/customers — Customer Record Management.
 *
 * Lists workspace customer records with segment filter. Create and update
 * customer records inline. LTV and segment enable churn intelligence downstream.
 * No workspace or actor IDs are supplied from the client.
 */

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the intentional pattern */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, EmptyState, Modal, Input, Select, Textarea, TableListSkeleton } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { useActiveBusiness } from "@/context/active-business-context";

interface CustomerRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  segment: string | null;
  lastPurchaseDate: string | null;
  ltv: number | null;
  tags: string[];
  notes?: string | null;
  updatedAt: string;
}

const SEGMENTS = ["B2C", "B2B", "SME", "ENTERPRISE", "VIP", "AT_RISK", "CHURNED"];

// Segment previously rendered as the raw enum token (e.g. "AT_RISK" with the underscore
// intact) inside a generic Badge variant="default" -- same class of leak fixed elsewhere in the
// app (Money's SURVIVAL_LABEL, Operations' STATE_LABEL): a plain-language label plus a variant
// that actually signals what the segment means, instead of every segment looking identical.
const SEGMENT_LABEL: Record<string, string> = {
  B2C: "Individual (B2C)",
  B2B: "Business (B2B)",
  SME: "Small/medium business",
  ENTERPRISE: "Enterprise",
  VIP: "VIP",
  AT_RISK: "At risk",
  CHURNED: "Churned",
};
const SEGMENT_VARIANT: Record<string, "default-accessible" | "success-accessible" | "warning-accessible" | "muted-accessible"> = {
  B2C: "default-accessible",
  B2B: "default-accessible",
  SME: "default-accessible",
  ENTERPRISE: "default-accessible",
  VIP: "success-accessible",
  AT_RISK: "warning-accessible",
  CHURNED: "muted-accessible",
};

const INACTIVE_AFTER_DAYS = 60;

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function formatCurrency(amount: number, currency?: string): string {
  return `${currency ? currency + " " : ""}${Math.round(Number(amount)).toLocaleString()}`;
}

/**
 * The Customer Business Review — the real structural redesign this page needed, replacing a bare
 * record table with a plain-language read of what the customer data actually shows. Every
 * section below is computed from real CustomerRecord fields (ltv, lastPurchaseDate, tags, notes)
 * and only renders when there is real evidence for it; nothing here is invented. CUSTOMER
 * PROFITABILITY from the mandated section list is never rendered: CustomerRecord has no
 * per-customer cost/margin field, so there is no legitimate data to show it with.
 */
function CustomerBusinessReview({ customers, currency }: { customers: CustomerRecord[]; currency?: string }) {
  const stats = useMemo(() => {
    const n = customers.length;
    // ltv arrives from the API as a serialized Prisma Decimal (a numeric string, not a JS
    // number), even though the CustomerRecord interface types it as `number` for callers that
    // just pass it through to Number()/toLocaleString() -- summing it directly here without
    // coercion would silently string-concatenate every value instead of adding them.
    const withLtv = customers.filter((c) => c.ltv != null && Number(c.ltv) > 0);
    const totalLtv = withLtv.reduce((sum, c) => sum + Number(c.ltv ?? 0), 0);
    const topByLtv = [...withLtv].sort((a, b) => Number(b.ltv ?? 0) - Number(a.ltv ?? 0))[0] ?? null;
    const topSharePct = topByLtv && totalLtv > 0 ? Math.round((Number(topByLtv.ltv ?? 0) / totalLtv) * 100) : null;

    const withDate = customers.filter((c) => c.lastPurchaseDate);
    const inactive = withDate.filter((c) => daysSince(c.lastPurchaseDate!) > INACTIVE_AFTER_DAYS);

    const withPaymentNote = customers.filter((c) => c.notes && /overdue|unpaid|owe[ds]?\b|outstanding/i.test(c.notes));

    const repeatTagged = customers.filter((c) => c.tags?.some((t) => /repeat/i.test(t)));

    return { n, withLtv, totalLtv, topByLtv, topSharePct, withDate, inactive, withPaymentNote, repeatTagged };
  }, [customers]);

  if (stats.n === 0) {
    return (
      <div className="border-l-2 pl-5 py-1" style={{ borderColor: "var(--accent-ink)" }}>
        <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--accent-ink)" }}>
          Customer position
        </span>
        <p className="mt-1 font-display text-[1.1rem] font-semibold text-foreground">Not enough customer information yet</p>
        <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
          <p><span className="font-medium text-foreground">What OpsIQ can assess now:</span> nothing yet — no customer records have been added for this business.</p>
          <p><span className="font-medium text-foreground">What is missing:</span> at least a few customer records with a name, and ideally a segment, lifetime value, and last purchase date.</p>
          <p><span className="font-medium text-foreground">Why it matters:</span> without customer records, OpsIQ cannot tell you which customers matter most, who has gone quiet, or where payment is at risk.</p>
          <p><span className="font-medium text-foreground">One obvious next step:</span> add your most important customers first — the ones who account for the most revenue or the most frequent orders.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="border-l-2 pl-5 py-1" style={{ borderColor: "var(--accent-ink)" }}>
        <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--accent-ink)" }}>
          Customer position
        </span>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-foreground">
          {stats.n} tracked customer{stats.n === 1 ? "" : "s"}
          {stats.totalLtv > 0 && <> worth {formatCurrency(stats.totalLtv, currency)} in combined lifetime value</>}.
          {stats.topByLtv && stats.topSharePct != null && stats.withLtv.length >= 2 && (
            <> {stats.topByLtv.name} alone accounts for {stats.topSharePct}% of that.</>
          )}
          {stats.inactive.length > 0 && (
            <> {stats.inactive.length} customer{stats.inactive.length === 1 ? " hasn't" : "s haven't"} been seen in over {INACTIVE_AFTER_DAYS} days.</>
          )}
        </p>
      </div>

      {stats.withLtv.length >= 2 && stats.topByLtv && stats.topSharePct != null && (
        <div className="border-t border-border pt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Customer concentration</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Of {formatCurrency(stats.totalLtv, currency)} in tracked lifetime value across {stats.withLtv.length} customers with a recorded value,{" "}
            <span className="font-medium text-foreground">{stats.topByLtv.name}</span> accounts for {stats.topSharePct}%.
            {stats.topSharePct >= 40 && " Losing this customer would be a significant, concentrated hit."}
          </p>
        </div>
      )}

      {stats.withDate.length > 0 && (
        <div className="border-t border-border pt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Customer activity</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.withDate.length} of {stats.n} customers have a recorded last-purchase date.{" "}
            {stats.inactive.length > 0
              ? <>{stats.inactive.length} {stats.inactive.length === 1 ? "hasn't" : "haven't"} ordered in over {INACTIVE_AFTER_DAYS} days: {stats.inactive.map((c) => c.name).join(", ")}.</>
              : "None have gone quiet for more than " + INACTIVE_AFTER_DAYS + " days."}
          </p>
        </div>
      )}

      {stats.withPaymentNote.length > 0 && (
        <div className="border-t border-border pt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Payment behaviour</div>
          <div className="mt-1 flex flex-col gap-1.5 text-sm text-muted-foreground">
            {stats.withPaymentNote.map((c) => (
              <p key={c.id}><span className="font-medium text-foreground">{c.name}:</span> &ldquo;{c.notes}&rdquo;</p>
            ))}
          </div>
        </div>
      )}

      {stats.repeatTagged.length > 0 && (
        <div className="border-t border-border pt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Repeat business</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.repeatTagged.length} of {stats.n} customers carry a tag marking them as a repeat customer: {stats.repeatTagged.map((c) => c.name).join(", ")}.
          </p>
        </div>
      )}
    </div>
  );
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

interface CustomerForm {
  name: string;
  email: string;
  phone: string;
  segment: string;
  ltv: string;
  notes: string;
}

const EMPTY_FORM: CustomerForm = {
  name: "",
  email: "",
  phone: "",
  segment: "",
  ltv: "",
  notes: "",
};

function formFromCustomer(c: CustomerRecord): CustomerForm {
  return {
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    segment: c.segment ?? "",
    ltv: c.ltv != null ? String(c.ltv) : "",
    notes: "",
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function CustomersPage() {
  // The shared context is now the single source of truth for the business list too (not a
  // second, independently-fetched copy) — root cause of the human-tester-reported bug: this page
  // used to fetch its OWN business list and always default to businesses[0] regardless of what
  // the owner had just selected on My Business/Money. A second parallel fetch here previously
  // raced the context's own fetch on every mount, which was also a source of test flakiness.
  const { businesses, activeBusinessId, setActiveBusinessId, loading: contextLoading } = useActiveBusiness();
  const selectedBizId = activeBusinessId;
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [segmentFilter, setSegmentFilter] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadCustomers = useCallback(async (bizId: string, seg?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ businessId: bizId });
      if (seg) qs.set("segment", seg);
      const data = await apiFetch(`/api/owner/sales/customers?${qs.toString()}`);
      setCustomers(data.customers ?? []);
    } catch (err) {
      setError(classifyOperatorError(err, { context: "load" }).operatorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contextLoading) return;
    if (!activeBusinessId) { setLoading(false); return; }
    void loadCustomers(activeBusinessId, segmentFilter || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only on context resolution/switch, not on every segmentFilter/loadCustomers identity change
  }, [contextLoading, activeBusinessId]);

  async function handleBizChange(bizId: string) {
    setActiveBusinessId(bizId);
  }

  async function handleSegmentFilter(seg: string) {
    setSegmentFilter(seg);
    if (selectedBizId) await loadCustomers(selectedBizId, seg || undefined);
  }

  const visibleCustomers = customers;

  function openCreate() {
    setEditingCustomer(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(customer: CustomerRecord) {
    setEditingCustomer(customer);
    setForm(formFromCustomer(customer));
    setFormError(null);
    setModalOpen(true);
  }

  function setField<K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setFormError(null);
    if (!form.name.trim()) { setFormError("Customer name is required."); return; }
    if (!selectedBizId) { setFormError("No business selected."); return; }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
      };
      if (!editingCustomer) payload.businessId = selectedBizId;
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.segment) payload.segment = form.segment;
      if (form.ltv) payload.ltv = Number(form.ltv);
      if (form.notes.trim()) payload.notes = form.notes.trim();

      if (editingCustomer) {
        // businessId is the business the record was loaded under (selectedBizId, since
        // editingCustomer only ever comes from the currently-loaded customers list) -- required
        // by the route so updateCustomer can enforce its cross-business isolation guard.
        const qs = new URLSearchParams({ businessId: selectedBizId });
        await apiFetch(`/api/owner/sales/customers/${editingCustomer.id}?${qs.toString()}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/owner/sales/customers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      if (selectedBizId) await loadCustomers(selectedBizId, segmentFilter || undefined);
    } catch (err) {
      setFormError(classifyOperatorError(err, { context: "save" }).operatorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  const currentBusiness = businesses.find((b) => b.id === selectedBizId) || null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8" data-testid="customers-page">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold tracking-tight text-foreground">Customers</h1>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
            Who your customers are, which ones matter most, and where the relationship needs attention.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} disabled={!selectedBizId}>
          + New Customer
        </Button>
      </div>

      <div className="mb-6">
        <BusinessContextSelector
          businesses={businesses}
          selectedId={selectedBizId}
          onChange={handleBizChange}
        />
      </div>

      {!loading && businesses.length === 0 && (
        <EmptyState
          title="No business set up yet"
          description="Customers are tracked per business. Set up your business in Finance first."
          primaryAction={{ label: "Go to Finance", href: "/owner/finance" }}
        />
      )}

      {loading && <TableListSkeleton label="Loading" rows={4} />}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!loading && !error && selectedBizId && (
        <div className="mb-8">
          <CustomerBusinessReview customers={customers} currency={currentBusiness?.currency} />
        </div>
      )}

      {!loading && !error && selectedBizId && (
        <section className="border-t border-border pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-[1.1rem] font-semibold text-foreground">All customer records ({visibleCustomers.length})</h2>
            <select
              aria-label="Filter customers by segment"
              value={segmentFilter}
              onChange={(e) => handleSegmentFilter(e.target.value)}
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="">All segments</option>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>{SEGMENT_LABEL[s] ?? s}</option>
              ))}
            </select>
          </div>

          {visibleCustomers.length === 0 && (
            segmentFilter ? (
              <EmptyState
                title="No customers match this filter"
                description={`No customers are in the "${SEGMENT_LABEL[segmentFilter] ?? segmentFilter}" segment.`}
                primaryAction={{ label: "Clear filter", onClick: () => handleSegmentFilter("") }}
              />
            ) : (
              <EmptyState
                title="No customers yet"
                description="Add your first customer to start tracking segments, lifetime value, and purchase history."
                primaryAction={{ label: "+ New Customer", onClick: openCreate }}
              />
            )
          )}

      {visibleCustomers.length > 0 && (
        <>
        {/* Below sm: a stacked card per customer instead of a horizontally-scrolling table --
            a table's fixed columns force either truncation or sideways scrolling on a narrow
            screen, and every field here (segment, LTV, last purchase) is exactly what a mobile
            owner needs to see without scrolling. The table below remains the desktop view. */}
        <div className="flex flex-col gap-3 sm:hidden" data-testid="customers-mobile-list">
          {visibleCustomers.map((customer) => (
            <div key={customer.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-foreground">{customer.name}</span>
                <button onClick={() => openEdit(customer)} className="shrink-0 text-sm text-[var(--primary-text)] hover:underline">
                  Edit
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {customer.segment && (
                  <Badge variant={SEGMENT_VARIANT[customer.segment] ?? "default-accessible"}>{SEGMENT_LABEL[customer.segment] ?? customer.segment}</Badge>
                )}
                {customer.ltv != null && <span>{formatCurrency(customer.ltv, currentBusiness?.currency)}</span>}
                {customer.lastPurchaseDate && <span>Last purchase {formatDate(customer.lastPurchaseDate)}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="hidden rounded-lg border border-border overflow-hidden overflow-x-auto sm:block" data-testid="customers-table">
          <table className="w-full text-sm">
            {/* text-muted-foreground on bg-muted is the same ~4.34:1 combination badge.tsx
                documents as failing AA's 4.5:1 for normal text -- the accessible token fixes it
                the same way every other new call site in this app does. */}
            <thead className="bg-muted text-[var(--muted-foreground-accessible)]">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-left font-medium">Segment</th>
                <th className="px-4 py-2 text-left font-medium">LTV</th>
                <th className="px-4 py-2 text-left font-medium">Last Purchase</th>
                <th className="px-4 py-2 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{customer.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{customer.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    {customer.segment ? (
                      <Badge variant={SEGMENT_VARIANT[customer.segment] ?? "default-accessible"}>{SEGMENT_LABEL[customer.segment] ?? customer.segment}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {customer.ltv != null ? formatCurrency(customer.ltv, currentBusiness?.currency) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {customer.lastPurchaseDate ? formatDate(customer.lastPurchaseDate) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openEdit(customer)}
                      className="text-[var(--primary-text)] hover:underline text-sm"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
        </section>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCustomer ? "Edit Customer" : "New Customer"}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving…" : editingCustomer ? "Save changes" : "Add customer"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && <p className="text-destructive text-sm">{formError}</p>}
          <div>
            <label htmlFor="customer-name" className="block text-sm font-medium mb-1">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="customer-name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Customer or company name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="customer-email" className="block text-sm font-medium mb-1">Email</label>
              <Input
                id="customer-email"
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="customer@email.com"
              />
            </div>
            <div>
              <label htmlFor="customer-phone" className="block text-sm font-medium mb-1">Phone</label>
              <Input
                id="customer-phone"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="+1 555 000 0000"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="customer-segment" className="block text-sm font-medium mb-1">Segment</label>
              <Select
                id="customer-segment"
                value={form.segment}
                onChange={(e) => setField("segment", e.target.value)}
                options={SEGMENTS.map((s) => ({ value: s, label: SEGMENT_LABEL[s] ?? s }))}
                placeholder="Select segment"
              />
            </div>
            <div>
              <label htmlFor="customer-ltv" className="block text-sm font-medium mb-1">Lifetime value ($)</label>
              <Input
                id="customer-ltv"
                type="number"
                min={0}
                value={form.ltv}
                onChange={(e) => setField("ltv", e.target.value)}
                placeholder="e.g. 5000"
              />
            </div>
          </div>
          <div>
            <label htmlFor="customer-notes" className="block text-sm font-medium mb-1">Notes</label>
            <Textarea
              id="customer-notes"
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Internal notes about this customer"
              rows={2}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
