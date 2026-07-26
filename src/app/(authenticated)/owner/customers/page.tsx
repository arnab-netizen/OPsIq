"use client";

/**
 * /owner/customers — Customer Record Management.
 *
 * Lists workspace customer records with segment filter. Create and update
 * customer records inline. LTV and segment enable churn intelligence downstream.
 * No workspace or actor IDs are supplied from the client.
 */

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the intentional pattern */

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Modal, Input, Select, Textarea } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";

interface Business {
  id: string;
  name: string;
}

interface CustomerRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  segment: string | null;
  lastPurchaseDate: string | null;
  ltv: number | null;
  tags: string[];
  updatedAt: string;
}

const SEGMENTS = ["B2C", "B2B", "SME", "ENTERPRISE", "VIP", "AT_RISK", "CHURNED"];

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
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBizId, setSelectedBizId] = useState<string | null>(null);
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

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bizList: Business[] = await apiFetch("/api/owner/recovery/businesses");
      const list = Array.isArray(bizList) ? bizList : (bizList as { businesses?: Business[] }).businesses ?? [];
      setBusinesses(list);
      if (list.length > 0) {
        const bizId = list[0].id;
        setSelectedBizId(bizId);
        await loadCustomers(bizId);
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError(classifyOperatorError(err, { context: "load" }).operatorMessage);
      setLoading(false);
    }
  }, [loadCustomers]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  async function handleBizChange(bizId: string) {
    setSelectedBizId(bizId);
    await loadCustomers(bizId, segmentFilter || undefined);
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
        await apiFetch(`/api/owner/sales/customers/${editingCustomer.id}`, {
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8" data-testid="customers-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <Button size="sm" onClick={openCreate} disabled={!selectedBizId}>
          + New Customer
        </Button>
      </div>

      {businesses.length > 1 && (
        <div className="mb-4">
          <select
            value={selectedBizId ?? ""}
            onChange={(e) => handleBizChange(e.target.value)}
            className="rounded border border-border bg-background px-3 py-1.5 text-sm"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {!loading && businesses.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No business found. Create a business in the Finance section first.
        </p>
      )}

      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={segmentFilter}
          onChange={(e) => handleSegmentFilter(e.target.value)}
          className="rounded border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All segments</option>
          {SEGMENTS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!loading && !error && selectedBizId && visibleCustomers.length === 0 && (
        <p className="text-muted-foreground text-sm">No customers found.</p>
      )}

      {!loading && !error && visibleCustomers.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden overflow-x-auto" data-testid="customers-table">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
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
                      <Badge variant="default">{customer.segment}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {customer.ltv != null ? `$${Number(customer.ltv).toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {customer.lastPurchaseDate ? formatDate(customer.lastPurchaseDate) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openEdit(customer)}
                      className="text-primary hover:underline text-sm"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            <label className="block text-sm font-medium mb-1">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Customer or company name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="customer@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <Input
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="+1 555 000 0000"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Segment</label>
              <Select
                value={form.segment}
                onChange={(e) => setField("segment", e.target.value)}
                options={SEGMENTS.map((s) => ({ value: s, label: s }))}
                placeholder="Select segment"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Lifetime value ($)</label>
              <Input
                type="number"
                min={0}
                value={form.ltv}
                onChange={(e) => setField("ltv", e.target.value)}
                placeholder="e.g. 5000"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <Textarea
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
