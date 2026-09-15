/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/ui/primitives/button";
import { EmptyState, LoadingState } from "@/ui/primitives/states";
import { Modal } from "@/ui/primitives/modal";
import { Input } from "@/ui/primitives/input";
import { PageHeader } from "@/ui/primitives/page-header";
import { PageContainer } from "@/ui/primitives/page-container";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { useActiveBusiness } from "@/context/active-business-context";

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Request failed");
  return data;
}

// Presentation-only sentence-case mapping. The underlying stored/submitted
// status is always the raw enum below — this only changes what text is
// shown to the owner, never what is saved, compared, or transitioned.
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  REVIEWED: "Reviewed",
  APPROVED: "Approved",
  ISSUED: "Issued",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  REVIEWED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  ISSUED: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-green-700 text-white",
  CANCELLED: "bg-red-100 text-red-700",
};

const NEXT_STATUS: Record<string, string> = {
  DRAFT: "REVIEWED",
  REVIEWED: "APPROVED",
  APPROVED: "ISSUED",
  ISSUED: "DELIVERED",
};

export default function ProcurementPage() {
  // The shared context is the single source of truth for the business list — see
  // customers/page.tsx for why a second, independently-fetched copy was removed (it raced the
  // context's own fetch on every mount).
  const { businesses, activeBusinessId, setActiveBusinessId, loading: contextLoading } = useActiveBusiness();
  const businessId = activeBusinessId;
  const [orders, setOrders] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Presentation-only: prevents rendering EmptyState before this business's
  // orders have actually finished loading (see G8 in the 14 Sep 2026 audit —
  // this route previously showed a false "No purchase orders yet" flash
  // while data was still in flight).
  const [ordersLoading, setOrdersLoading] = useState(true);
  const loading = contextLoading || ordersLoading;

  const loadOrders = useCallback(async (bid: string) => {
    try {
      const data = await apiFetch(`/api/owner/procurement/purchase-orders?businessId=${bid}`);
      setOrders(data.orders ?? []);
    } catch (e: any) {
      setError(classifyOperatorError(e, { context: "load" }).operatorMessage);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contextLoading) return;
    if (!activeBusinessId) {
      // No business selected once the context has resolved — nothing else will
      // clear ordersLoading, so settle it here rather than showing a permanent spinner.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- presentation-only loading-flag settle, not a data fetch.
      setOrdersLoading(false);
      return;
    }
    void loadOrders(activeBusinessId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only on context resolution/switch, not on every loadOrders identity change
  }, [contextLoading, activeBusinessId]);

  const openCreate = () => {
    setForm({ poNumber: "", vendorName: "", description: "", qty: "1", unitPrice: "", notes: "" });
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!businessId) return;
    setSaving(true);
    try {
      const payload = {
        businessId,
        poNumber: form.poNumber,
        vendorName: form.vendorName || null,
        lineItems: [{
          description: form.description,
          qty: parseFloat(form.qty) || 1,
          unitPrice: form.unitPrice ? parseFloat(form.unitPrice) : undefined,
        }],
        notes: form.notes || null,
      };
      await apiFetch("/api/owner/procurement/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setShowCreate(false);
      loadOrders(businessId);
    } catch (e: any) {
      setError(classifyOperatorError(e, { context: "save" }).operatorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleTransition = async (poId: string, toStatus: string) => {
    if (!businessId) return;
    try {
      await apiFetch(`/api/owner/procurement/purchase-orders/${poId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus }),
      });
      loadOrders(businessId);
    } catch (e: any) {
      setError(classifyOperatorError(e, { context: "action" }).operatorMessage);
    }
  };

  const handleCancel = async (poId: string) => {
    if (!businessId) return;
    try {
      await apiFetch(`/api/owner/procurement/purchase-orders/${poId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus: "CANCELLED" }),
      });
      loadOrders(businessId);
    } catch (e: any) {
      setError(classifyOperatorError(e, { context: "action" }).operatorMessage);
    }
  };

  return (
    <PageContainer data-testid="procurement-page">
      <div className="mb-6">
        <PageHeader
          title="Purchase Orders"
          actions={
            <>
              <BusinessContextSelector
                businesses={businesses}
                selectedId={businessId}
                onChange={(id) => setActiveBusinessId(id)}
              />
              <Button onClick={openCreate}>+ New PO</Button>
            </>
          }
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded text-sm">{error}</div>
      )}

      {loading ? (
        <LoadingState message="Loading purchase orders…" />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No purchase orders yet"
          description="Create your first purchase order to start tracking spend and delivery against a vendor."
          primaryAction={{ label: "+ New PO", onClick: openCreate }}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="procurement-table">
            <thead>
              <tr className="bg-muted text-muted-foreground">
                <th className="text-left px-4 py-2">PO Number</th>
                <th className="text-left px-4 py-2">Vendor</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Total</th>
                <th className="text-left px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((order) => {
                const nextStatus = NEXT_STATUS[order.status];
                return (
                  <tr key={order.id} className="hover:bg-muted/50">
                    <td className="px-4 py-2 font-mono text-xs">{order.poNumber}</td>
                    <td className="px-4 py-2">{order.vendorName ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[order.status] ?? ""}`}>
                        {STATUS_LABEL[order.status] ?? order.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {order.totalAmount != null ? `${order.currency} ${Number(order.totalAmount).toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-2 flex gap-2">
                      {nextStatus && (
                        <button
                          className="text-[var(--primary-text)] text-xs hover:underline"
                          onClick={() => handleTransition(order.id, nextStatus)}
                        >
                          Mark {STATUS_LABEL[nextStatus] ?? nextStatus}
                        </button>
                      )}
                      {!["DELIVERED", "CANCELLED"].includes(order.status) && (
                        <button
                          className="text-destructive text-xs hover:underline"
                          onClick={() => handleCancel(order.id)}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Purchase Order">
        <div className="space-y-3">
          <Input
            label="PO number"
            hint="e.g. PO-2026-001"
            value={form.poNumber ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, poNumber: e.target.value }))}
          />
          <Input
            label="Vendor name"
            hint="Optional"
            value={form.vendorName ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
          />
          <Input
            label="Item description"
            value={form.description ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Input
            type="number"
            label="Quantity"
            value={form.qty ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
          />
          <Input
            type="number"
            label="Unit price"
            hint="Optional"
            value={form.unitPrice ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
          />
          <Input
            label="Notes"
            hint="Optional"
            value={form.notes ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving}>Create PO</Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
