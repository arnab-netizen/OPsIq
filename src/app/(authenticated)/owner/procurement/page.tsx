/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/ui/primitives/button";
import { Modal } from "@/ui/primitives/modal";
import { Input } from "@/ui/primitives/input";
import { classifyOperatorError } from "@/lib/operator-error-governance";

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Request failed");
  return data;
}

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
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const loadBusinesses = useCallback(async () => {
    try {
      const data = await apiFetch("/api/owner/recovery/businesses");
      const list = Array.isArray(data) ? data : data.businesses ?? [];
      setBusinesses(list);
      if (list.length > 0) setBusinessId(list[0].id);
    } catch (e: any) {
      setError(classifyOperatorError(e, { context: "load" }).operatorMessage);
    }
  }, []);

  const loadOrders = useCallback(async (bid: string) => {
    try {
      const data = await apiFetch(`/api/owner/procurement/purchase-orders?businessId=${bid}`);
      setOrders(data.orders ?? []);
    } catch (e: any) {
      setError(classifyOperatorError(e, { context: "load" }).operatorMessage);
    }
  }, []);

  useEffect(() => { loadBusinesses(); }, [loadBusinesses]);
  useEffect(() => { if (businessId) loadOrders(businessId); }, [businessId, loadOrders]);

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
    <div className="p-6" data-testid="procurement-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Purchase Orders</h1>
        <div className="flex gap-3 items-center">
          {businesses.length > 1 && (
            <select
              className="border rounded px-3 py-1 text-sm"
              value={businessId ?? ""}
              onChange={(e) => setBusinessId(e.target.value)}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <Button onClick={openCreate}>+ New PO</Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded text-sm">{error}</div>
      )}

      {orders.length === 0 ? (
        <p className="text-muted-foreground text-sm">No purchase orders found.</p>
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
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {order.totalAmount != null ? `${order.currency} ${Number(order.totalAmount).toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-2 flex gap-2">
                      {nextStatus && (
                        <button
                          className="text-primary text-xs hover:underline"
                          onClick={() => handleTransition(order.id, nextStatus)}
                        >
                          Mark {nextStatus}
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
          <Input placeholder="PO Number (e.g. PO-2026-001)" value={form.poNumber ?? ""} onChange={(e) => setForm((f) => ({ ...f, poNumber: e.target.value }))} />
          <Input placeholder="Vendor Name (optional)" value={form.vendorName ?? ""} onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))} />
          <Input placeholder="Item description" value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <Input type="number" placeholder="Quantity" value={form.qty ?? ""} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} />
          <Input type="number" placeholder="Unit price (optional)" value={form.unitPrice ?? ""} onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))} />
          <Input placeholder="Notes (optional)" value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving}>Create PO</Button>
        </div>
      </Modal>
    </div>
  );
}
