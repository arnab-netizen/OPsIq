/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/ui/primitives/button";
import { EmptyState } from "@/ui/primitives/states";
import { Modal } from "@/ui/primitives/modal";
import { Input } from "@/ui/primitives/input";
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

// Pure fetch + normalize -- no state setters here, so it is safe to call from either an effect
// body or an event handler without the effect ever synchronously triggering a state update.
async function fetchInventoryData(businessId: string): Promise<{ items: any[]; suggestions: Record<string, any> }> {
  const data = await apiFetch(`/api/owner/inventory/stock-items?businessId=${businessId}`);
  const items: any[] = data.items ?? [];
  const suggestions: Record<string, any> = {};
  if (data.suggestions) {
    for (const s of data.suggestions) suggestions[s.id] = s;
  }
  return { items, suggestions };
}

const RISK_COLOR: Record<string, string> = {
  NONE: "bg-green-100 text-green-800",
  LOW: "bg-yellow-100 text-yellow-800",
  MEDIUM: "bg-orange-100 text-orange-800",
  HIGH: "bg-red-100 text-red-800",
  STOCKOUT: "bg-red-700 text-white",
};

export default function InventoryPage() {
  // The shared context is the single source of truth for the business list — see
  // customers/page.tsx for why a second, independently-fetched copy was removed (it raced the
  // context's own fetch on every mount).
  const { businesses, activeBusinessId, setActiveBusinessId, loading: contextLoading } = useActiveBusiness();
  const businessId = activeBusinessId;
  const [items, setItems] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Event-driven reload (post-save refresh) -- never called from an effect body, so it is safe to
  // set state directly once the fetch settles.
  const loadItems = useCallback(async (bid: string) => {
    try {
      const { items: list, suggestions: sugMap } = await fetchInventoryData(bid);
      setItems(list);
      setSuggestions(sugMap);
    } catch (e: any) {
      setError(classifyOperatorError(e, { context: "load" }).operatorMessage);
    }
  }, []);

  // Mount / business-switch fetch. Guarded by `cancelled` so a slow response for a business the
  // owner has since switched away from can never overwrite the newer business's state -- each
  // effect run's own closure is invalidated by the previous run's cleanup before the new run starts.
  useEffect(() => {
    if (contextLoading || !activeBusinessId) return;
    let cancelled = false;
    fetchInventoryData(activeBusinessId)
      .then(({ items: list, suggestions: sugMap }) => {
        if (cancelled) return;
        setItems(list);
        setSuggestions(sugMap);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(classifyOperatorError(e, { context: "load" }).operatorMessage);
      });
    return () => {
      cancelled = true;
    };
  }, [contextLoading, activeBusinessId]);

  const openCreate = () => {
    setForm({ sku: "", name: "", unit: "unit", currentQty: "0", reorderPoint: "0", safetyStock: "0", leadTimeDays: "0", dailyUsage: "0" });
    setShowCreate(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      currentQty: String(item.currentQty),
      reorderPoint: String(item.reorderPoint),
      safetyStock: String(item.safetyStock),
      leadTimeDays: String(item.leadTimeDays),
      dailyUsage: String(item.dailyUsage),
    });
  };

  const handleSave = async () => {
    if (!businessId) return;
    setSaving(true);
    try {
      const payload = {
        businessId,
        sku: form.sku,
        name: form.name,
        unit: form.unit || "unit",
        currentQty: parseFloat(form.currentQty) || 0,
        reorderPoint: parseFloat(form.reorderPoint) || 0,
        safetyStock: parseFloat(form.safetyStock) || 0,
        leadTimeDays: parseInt(form.leadTimeDays, 10) || 0,
        dailyUsage: parseFloat(form.dailyUsage) || 0,
      };
      if (editItem) {
        await apiFetch(`/api/owner/inventory/stock-items/${editItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setEditItem(null);
      } else {
        await apiFetch("/api/owner/inventory/stock-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setShowCreate(false);
      }
      loadItems(businessId);
    } catch (e: any) {
      setError(classifyOperatorError(e, { context: "save" }).operatorMessage);
    } finally {
      setSaving(false);
    }
  };

  const isModalOpen = showCreate || !!editItem;
  const modalTitle = editItem ? "Edit Stock Item" : "Add Stock Item";

  return (
    <div className="p-6" data-testid="inventory-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <div className="flex gap-3 items-center">
          <BusinessContextSelector
            businesses={businesses}
            selectedId={businessId}
            onChange={(id) => setActiveBusinessId(id)}
          />
          <Button onClick={openCreate}>+ Add Item</Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded text-sm">{error}</div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="No stock items yet"
          description="Add your first stock item to start tracking on-hand quantity and reorder points."
          primaryAction={{ label: "+ Add Item", onClick: openCreate }}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="inventory-table">
            <thead>
              <tr className="bg-muted text-muted-foreground">
                <th className="text-left px-4 py-2">SKU</th>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-right px-4 py-2">Current Qty</th>
                <th className="text-right px-4 py-2">Reorder Point</th>
                <th className="text-right px-4 py-2">Lead Time</th>
                <th className="text-left px-4 py-2">Risk</th>
                <th className="text-left px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => {
                const sug = suggestions[item.id];
                const risk = sug?.risk ?? "NONE";
                return (
                  <tr key={item.id} className="hover:bg-muted/50">
                    <td className="px-4 py-2 font-mono text-xs">{item.sku}</td>
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-4 py-2 text-right">{Number(item.currentQty).toFixed(2)} {item.unit}</td>
                    <td className="px-4 py-2 text-right">{Number(item.reorderPoint).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">{item.leadTimeDays}d</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${RISK_COLOR[risk] ?? ""}`}>
                        {risk}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <button
                        className="text-[var(--primary-text)] text-xs hover:underline"
                        onClick={() => openEdit(item)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => { setShowCreate(false); setEditItem(null); }} title={modalTitle}>
        <div className="space-y-3">
          <Input placeholder="SKU" value={form.sku ?? ""} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
          <Input placeholder="Name" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input placeholder="Unit (e.g. pcs)" value={form.unit ?? ""} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
          <Input type="number" placeholder="Current Qty" value={form.currentQty ?? ""} onChange={(e) => setForm((f) => ({ ...f, currentQty: e.target.value }))} />
          <Input type="number" placeholder="Reorder Point" value={form.reorderPoint ?? ""} onChange={(e) => setForm((f) => ({ ...f, reorderPoint: e.target.value }))} />
          <Input type="number" placeholder="Safety Stock" value={form.safetyStock ?? ""} onChange={(e) => setForm((f) => ({ ...f, safetyStock: e.target.value }))} />
          <Input type="number" placeholder="Lead Time (days)" value={form.leadTimeDays ?? ""} onChange={(e) => setForm((f) => ({ ...f, leadTimeDays: e.target.value }))} />
          <Input type="number" placeholder="Daily Usage" value={form.dailyUsage ?? ""} onChange={(e) => setForm((f) => ({ ...f, dailyUsage: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => { setShowCreate(false); setEditItem(null); }}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {editItem ? "Save changes" : "Add item"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
