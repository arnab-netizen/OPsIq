"use client";

/**
 * /owner/vendor — Vendor Management.
 *
 * Lists workspace vendors with approval status and bank verification.
 * Approve or suspend a vendor inline. No workspace or actor IDs are
 * supplied from the client.
 */

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the intentional pattern */

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, Modal, Input, Select, Textarea, TableListSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { useActiveBusiness } from "@/context/active-business-context";

type ApprovalStatus = "PENDING_REVIEW" | "APPROVED" | "SUSPENDED";

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

const APPROVAL_VARIANT: Record<ApprovalStatus, "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible"> = {
  PENDING_REVIEW: "warning-accessible",
  APPROVED: "success-accessible",
  SUSPENDED: "destructive-accessible",
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
  // The shared context is the single source of truth for the business list — see
  // customers/page.tsx for why a second, independently-fetched copy was removed (it raced the
  // context's own fetch on every mount).
  const { businesses, activeBusinessId, setActiveBusinessId, loading: contextLoading } = useActiveBusiness();
  const selectedBizId = activeBusinessId;
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

  useEffect(() => {
    if (contextLoading) return;
    if (!activeBusinessId) { setLoading(false); return; }
    void loadVendors(activeBusinessId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only on context resolution/switch, not on every loadVendors identity change
  }, [contextLoading, activeBusinessId]);

  async function handleBizChange(bizId: string) {
    setActiveBusinessId(bizId);
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
    <PageContainer data-testid="vendor-page">
      <div className="mb-6">
        <PageHeader
          title="Vendors"
          actions={
            <Button size="sm" onClick={openCreate} disabled={!selectedBizId}>
              + New Vendor
            </Button>
          }
        />
      </div>

      <div className="mb-4">
        <BusinessContextSelector
          businesses={businesses}
          selectedId={selectedBizId}
          onChange={(businessId) => void handleBizChange(businessId)}
        />
      </div>

      {!loading && businesses.length === 0 && (
        <EmptyState
          title="No business set up yet"
          description="Vendors are tracked per business. Set up your business in Finance first."
          primaryAction={{ label: "Go to Finance", href: "/owner/finance" }}
        />
      )}

      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          aria-label="Filter by status"
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

      {loading && <TableListSkeleton label="Loading" rows={4} />}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!loading && !error && selectedBizId && visibleVendors.length === 0 && (
        statusFilter ? (
          <EmptyState
            title="No vendors match this filter"
            description={`No vendors have status "${APPROVAL_LABELS[statusFilter as ApprovalStatus] ?? statusFilter}".`}
            primaryAction={{ label: "Clear filter", onClick: () => setStatusFilter("") }}
          />
        ) : (
          <EmptyState
            title="No vendors yet"
            description="Add your first vendor to start tracking approval status and spend."
            primaryAction={{ label: "+ New Vendor", onClick: openCreate }}
          />
        )
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
                      <Badge variant={vendor.bankVerified ? "success-accessible" : "warning-accessible"}>
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
                          className="text-[var(--primary-text)] hover:underline text-sm"
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
            <label htmlFor="vendor-name" className="block text-sm font-medium mb-1">
              Vendor name <span className="text-destructive">*</span>
            </label>
            <Input
              id="vendor-name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Acme Supplies Pty Ltd"
            />
          </div>
          <div>
            <label htmlFor="vendor-bank-account-ref" className="block text-sm font-medium mb-1">Bank account reference</label>
            <Input
              id="vendor-bank-account-ref"
              value={form.bankAccountRef}
              onChange={(e) => setField("bankAccountRef", e.target.value)}
              placeholder="BSB/Account or IBAN (optional)"
            />
          </div>
          <div>
            <label htmlFor="vendor-related-party" className="block text-sm font-medium mb-1">Related party?</label>
            <Select
              id="vendor-related-party"
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
              <label htmlFor="vendor-payment-terms-days" className="block text-sm font-medium mb-1">Payment terms (days)</label>
              <Input
                id="vendor-payment-terms-days"
                type="number"
                min={0}
                max={365}
                value={form.paymentTermsDays}
                onChange={(e) => setField("paymentTermsDays", e.target.value)}
                placeholder="e.g. 30"
              />
            </div>
            <div>
              <label htmlFor="vendor-replacement-lead-time-days" className="block text-sm font-medium mb-1">Lead time to replace (days)</label>
              <Input
                id="vendor-replacement-lead-time-days"
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
            <label htmlFor="vendor-suspend-reason" className="block text-sm font-medium mb-1">
              Reason <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="vendor-suspend-reason"
              value={suspendForm.reason}
              onChange={(e) => setSuspendForm({ reason: e.target.value })}
              placeholder="Reason for suspension"
              rows={3}
            />
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
