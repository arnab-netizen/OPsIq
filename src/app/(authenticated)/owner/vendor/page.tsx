"use client";

/**
 * /owner/vendor — Vendor Management.
 *
 * Lists workspace vendors with approval status, bank verification, and
 * risk classification. Approve, suspend, and assess vendors inline.
 * No workspace or actor IDs are supplied from the client.
 */

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the intentional pattern */

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Modal, Input, Select, Textarea } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";

type ApprovalStatus = "PENDING_REVIEW" | "APPROVED" | "SUSPENDED";

interface Business {
  id: string;
  name: string;
}

interface VendorRecord {
  id: string;
  name: string;
  approvalStatus: ApprovalStatus;
  bankAccountRef: string | null;
  bankVerified: boolean;
  relatedParty: boolean | null;
  paymentTermsDays: number | null;
  switchingCostEstimate: number | null;
  replacementLeadTimeDays: number | null;
  createdAt: string;
}

const APPROVAL_VARIANT: Record<ApprovalStatus, "default" | "success" | "warning" | "destructive"> = {
  PENDING_REVIEW: "warning",
  APPROVED: "success",
  SUSPENDED: "destructive",
};

const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  PENDING_REVIEW: "Pending Review",
  APPROVED: "Approved",
  SUSPENDED: "Suspended",
};

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

interface CreateForm {
  name: string;
  bankAccountRef: string;
  relatedParty: string;
  paymentTermsDays: string;
  switchingCostEstimate: string;
  replacementLeadTimeDays: string;
}

const EMPTY_FORM: CreateForm = {
  name: "",
  bankAccountRef: "",
  relatedParty: "",
  paymentTermsDays: "",
  switchingCostEstimate: "",
  replacementLeadTimeDays: "",
};

interface SuspendForm {
  reason: string;
}

export default function VendorPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBizId, setSelectedBizId] = useState<string | null>(null);
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendVendorId, setSuspendVendorId] = useState<string | null>(null);
  const [suspendForm, setSuspendForm] = useState<SuspendForm>({ reason: "" });

  const loadVendors = useCallback(async (bizId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/owner/vendor?businessId=${encodeURIComponent(bizId)}`);
      setVendors(Array.isArray(data) ? data : []);
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
        await loadVendors(bizId);
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError(classifyOperatorError(err, { context: "load" }).operatorMessage);
      setLoading(false);
    }
  }, [loadVendors]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  async function handleBizChange(bizId: string) {
    setSelectedBizId(bizId);
    await loadVendors(bizId);
  }

  const visibleVendors = vendors.filter((v) => {
    if (statusFilter && v.approvalStatus !== statusFilter) return false;
    return true;
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setCreateOpen(true);
  }

  function setField<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    setFormError(null);
    if (!form.name.trim()) { setFormError("Vendor name is required."); return; }
    if (!selectedBizId) { setFormError("No business selected."); return; }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        businessId: selectedBizId,
        name: form.name.trim(),
      };
      if (form.bankAccountRef.trim()) payload.bankAccountRef = form.bankAccountRef.trim();
      if (form.relatedParty) payload.relatedParty = form.relatedParty === "yes";
      if (form.paymentTermsDays) payload.paymentTermsDays = Number(form.paymentTermsDays);
      if (form.switchingCostEstimate) payload.switchingCostEstimate = Number(form.switchingCostEstimate);
      if (form.replacementLeadTimeDays) payload.replacementLeadTimeDays = Number(form.replacementLeadTimeDays);

      await apiFetch("/api/owner/vendor", { method: "POST", body: JSON.stringify(payload) });
      setCreateOpen(false);
      if (selectedBizId) await loadVendors(selectedBizId);
    } catch (err) {
      setFormError(classifyOperatorError(err, { context: "save" }).operatorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(vendorId: string) {
    try {
      await apiFetch(`/api/owner/vendor/${vendorId}/approve`, { method: "POST" });
      if (selectedBizId) await loadVendors(selectedBizId);
    } catch (err) {
      setError(classifyOperatorError(err, { context: "action" }).operatorMessage);
    }
  }

  function openSuspend(vendorId: string) {
    setSuspendVendorId(vendorId);
    setSuspendForm({ reason: "" });
    setSuspendOpen(true);
  }

  async function handleSuspend() {
    if (!suspendVendorId) return;
    if (!suspendForm.reason.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/owner/vendor/${suspendVendorId}/suspend`, {
        method: "POST",
        body: JSON.stringify({ reason: suspendForm.reason.trim() }),
      });
      setSuspendOpen(false);
      if (selectedBizId) await loadVendors(selectedBizId);
    } catch (err) {
      setError(classifyOperatorError(err, { context: "mutation" }).operatorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8" data-testid="vendor-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Vendors</h1>
        <Button size="sm" onClick={openCreate} disabled={!selectedBizId}>
          + New Vendor
        </Button>
      </div>

      <div className="mb-4">
        <BusinessContextSelector
          businesses={businesses}
          selectedId={selectedBizId}
          onChange={(businessId) => void handleBizChange(businessId)}
        />
      </div>

      {!loading && businesses.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No business found. Create a business in the Finance section first.
        </p>
      )}

      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="APPROVED">Approved</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!loading && !error && selectedBizId && visibleVendors.length === 0 && (
        <p className="text-muted-foreground text-sm">No vendors found.</p>
      )}

      {!loading && !error && visibleVendors.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden overflow-x-auto" data-testid="vendor-table">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Bank</th>
                <th className="px-4 py-2 text-left font-medium">Payment Terms</th>
                <th className="px-4 py-2 text-left font-medium">Related Party</th>
                <th className="px-4 py-2 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleVendors.map((vendor) => (
                <tr key={vendor.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{vendor.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant={APPROVAL_VARIANT[vendor.approvalStatus]}>
                      {APPROVAL_LABELS[vendor.approvalStatus]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {vendor.bankAccountRef ? (
                      <Badge variant={vendor.bankVerified ? "success" : "warning"}>
                        {vendor.bankVerified ? "Verified" : "Unverified"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {vendor.paymentTermsDays != null ? `Net ${vendor.paymentTermsDays}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {vendor.relatedParty ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {vendor.approvalStatus === "PENDING_REVIEW" && (
                        <button
                          onClick={() => handleApprove(vendor.id)}
                          className="text-primary hover:underline text-sm"
                        >
                          Approve
                        </button>
                      )}
                      {vendor.approvalStatus !== "SUSPENDED" && (
                        <button
                          onClick={() => openSuspend(vendor.id)}
                          className="text-destructive hover:underline text-sm"
                        >
                          Suspend
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Vendor Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Vendor"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={submitting}>
              {submitting ? "Saving…" : "Add vendor"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && <p className="text-destructive text-sm">{formError}</p>}
          <div>
            <label className="block text-sm font-medium mb-1">
              Vendor name <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Acme Supplies Pty Ltd"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Bank account reference</label>
            <Input
              value={form.bankAccountRef}
              onChange={(e) => setField("bankAccountRef", e.target.value)}
              placeholder="BSB/Account or IBAN (optional)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Related party?</label>
            <Select
              value={form.relatedParty}
              onChange={(e) => setField("relatedParty", e.target.value)}
              options={[
                { value: "no", label: "No" },
                { value: "yes", label: "Yes (related party)" },
              ]}
              placeholder="Select…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Payment terms (days)</label>
              <Input
                type="number"
                min={0}
                max={365}
                value={form.paymentTermsDays}
                onChange={(e) => setField("paymentTermsDays", e.target.value)}
                placeholder="e.g. 30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Lead time to replace (days)</label>
              <Input
                type="number"
                min={0}
                value={form.replacementLeadTimeDays}
                onChange={(e) => setField("replacementLeadTimeDays", e.target.value)}
                placeholder="e.g. 60"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Suspend Modal */}
      <Modal
        isOpen={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        title="Suspend Vendor"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setSuspendOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleSuspend} disabled={submitting || !suspendForm.reason.trim()}>
              {submitting ? "Suspending…" : "Suspend vendor"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Suspended vendors are blocked from new orders. State the reason for this record.
          </p>
          <div>
            <label className="block text-sm font-medium mb-1">
              Reason <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={suspendForm.reason}
              onChange={(e) => setSuspendForm({ reason: e.target.value })}
              placeholder="Reason for suspension"
              rows={3}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
