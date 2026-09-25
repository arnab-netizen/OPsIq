/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- fetch-on-mount / fetch-on-business-switch is the intentional owner-page pattern */
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/ui/primitives/button";
import { EmptyState, LoadingState } from "@/ui/primitives/states";
import { Modal } from "@/ui/primitives/modal";
import { Input } from "@/ui/primitives/input";
import { Select } from "@/ui/primitives/select";
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

const CHANNELS = ["Email", "Social", "Search", "Display", "Referral", "Event", "Direct", "Other"];
const STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;
// Presentation-only sentence-case mapping. The underlying stored/submitted
// value is always the raw enum in STATUSES — this only changes what text is
// shown to the owner, never what is saved or compared.
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  ACTIVE: "bg-green-100 text-green-700",
  PAUSED: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  CANCELLED: "bg-red-100 text-red-700",
};

/** Campaign money in the active business's currency (campaigns carry no currency of their own). */
function formatCampaignMoney(amount: number, currency: string | undefined): string {
  return `${currency ? currency + " " : ""}${amount.toLocaleString()}`;
}

export default function CampaignsPage() {
  const { businesses, activeBusinessId, needsBusinessRecovery, setActiveBusinessId, loading: contextLoading } = useActiveBusiness();
  const campaignCurrency = businesses.find((b) => b.id === activeBusinessId)?.currency;
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Presentation-only: prevents rendering EmptyState before the business
  // list and its campaigns have actually finished loading (see G8 in the
  // 14 Sep 2026 audit — this route previously showed a false "No campaigns
  // yet" flash while data was still in flight).
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editCampaign, setEditCampaign] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Guards against two ordering bugs when the owner switches business via
  // BusinessContextSelector — (a) the previous business's rows staying on
  // screen while the new business's request is in flight, and (b) an
  // in-flight request for a business the owner has since switched away from
  // resolving late and clobbering the newer selection's rows. requestSeq
  // makes each loadCampaigns call ignore any response that isn't for the
  // most recently started request.
  const requestSeq = useRef(0);
  const loadCampaigns = useCallback(async (bid: string) => {
    const seq = ++requestSeq.current;
    setCampaigns([]);
    setLoading(true);
    try {
      const data = await apiFetch(`/api/owner/marketing/campaigns?businessId=${bid}`);
      if (requestSeq.current !== seq) return;
      setCampaigns(data.campaigns ?? []);
    } catch (e: any) {
      if (requestSeq.current !== seq) return;
      setError(classifyOperatorError(e, { context: "load" }).operatorMessage);
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contextLoading) return;
    if (needsBusinessRecovery) return;
    if (!activeBusinessId) { setLoading(false); return; }
    void loadCampaigns(activeBusinessId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the shared context resolves or the owner explicitly switches business
  }, [contextLoading, activeBusinessId, needsBusinessRecovery]);

  const onSwitchBusiness = useCallback((id: string) => {
    setLoading(true);
    setActiveBusinessId(id);
  }, [setActiveBusinessId]);

  const openCreate = () => {
    setForm({ name: "", channel: CHANNELS[0], status: "DRAFT", budget: "", spend: "0", leads: "0", conversions: "0", revenue: "0" });
    setShowCreate(true);
  };

  const openEdit = (c: any) => {
    setEditCampaign(c);
    setForm({
      name: c.name,
      channel: c.channel,
      status: c.status,
      budget: c.budget != null ? String(c.budget) : "",
      spend: String(c.spend ?? 0),
      leads: String(c.leads ?? 0),
      conversions: String(c.conversions ?? 0),
      revenue: String(c.revenue ?? 0),
    });
  };

  const handleSave = async () => {
    if (!activeBusinessId) return;
    setSaving(true);
    try {
      const payload = {
        businessId: activeBusinessId,
        name: form.name,
        channel: form.channel,
        status: form.status || "DRAFT",
        budget: form.budget ? parseFloat(form.budget) : null,
        spend: parseFloat(form.spend) || 0,
        leads: parseInt(form.leads, 10) || 0,
        conversions: parseInt(form.conversions, 10) || 0,
        revenue: parseFloat(form.revenue) || 0,
      };
      if (editCampaign) {
        await apiFetch(`/api/owner/marketing/campaigns/${editCampaign.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setEditCampaign(null);
      } else {
        await apiFetch("/api/owner/marketing/campaigns", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setShowCreate(false);
      }
      loadCampaigns(activeBusinessId);
    } catch (e: any) {
      setError(classifyOperatorError(e, { context: "save" }).operatorMessage);
    } finally {
      setSaving(false);
    }
  };

  const isModalOpen = showCreate || !!editCampaign;
  const modalTitle = editCampaign ? "Edit Campaign" : "New Campaign";

  const roi = (c: any) => {
    const spend = Number(c.spend ?? 0);
    const revenue = Number(c.revenue ?? 0);
    if (spend === 0) return "—";
    return `${(((revenue - spend) / spend) * 100).toFixed(0)}%`;
  };

  return (
    <PageContainer data-testid="campaigns-page">
      <div className="mb-6">
        <PageHeader
          title="Marketing Campaigns"
          actions={
            <>
              <BusinessContextSelector
                businesses={businesses}
                selectedId={activeBusinessId}
                onChange={onSwitchBusiness}
              />
              <Button onClick={openCreate}>+ New Campaign</Button>
            </>
          }
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded text-sm">{error}</div>
      )}

      {needsBusinessRecovery ? (
        <p>Your previously selected business is no longer available. Choose a business to continue.</p>
      ) : contextLoading || loading ? (
        <LoadingState message="Loading campaigns…" />
      ) : campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create your first marketing campaign to start tracking spend and results."
          primaryAction={{ label: "+ New Campaign", onClick: openCreate }}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="campaigns-table">
            <thead>
              <tr className="bg-muted text-muted-foreground">
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Channel</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Spend</th>
                <th className="text-right px-4 py-2">Leads</th>
                <th className="text-right px-4 py-2">Revenue</th>
                <th className="text-right px-4 py-2">ROI</th>
                <th className="text-left px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-muted/50">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2">{c.channel}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[c.status] ?? ""}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{c.spend != null ? formatCampaignMoney(Number(c.spend), campaignCurrency) : "—"}</td>
                  <td className="px-4 py-2 text-right">{c.leads ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{c.revenue != null ? formatCampaignMoney(Number(c.revenue), campaignCurrency) : "—"}</td>
                  <td className="px-4 py-2 text-right">{roi(c)}</td>
                  <td className="px-4 py-2">
                    <button
                      className="text-[var(--primary-text)] text-xs hover:underline"
                      onClick={() => openEdit(c)}
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

      <Modal isOpen={isModalOpen} onClose={() => { setShowCreate(false); setEditCampaign(null); }} title={modalTitle}>
        <div className="space-y-3">
          <Input
            label="Campaign name"
            value={form.name ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Select
            label="Channel"
            options={CHANNELS.map((ch) => ({ value: ch, label: ch }))}
            value={form.channel ?? CHANNELS[0]}
            onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
          />
          <Select
            label="Status"
            options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s]! }))}
            value={form.status ?? "DRAFT"}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          />
          <Input
            type="number"
            label="Budget"
            hint="Optional"
            value={form.budget ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
          />
          <Input
            type="number"
            label="Spend"
            value={form.spend ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, spend: e.target.value }))}
          />
          <Input
            type="number"
            label="Leads"
            value={form.leads ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, leads: e.target.value }))}
          />
          <Input
            type="number"
            label="Conversions"
            value={form.conversions ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, conversions: e.target.value }))}
          />
          <Input
            type="number"
            label="Revenue"
            value={form.revenue ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, revenue: e.target.value }))}
          />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => { setShowCreate(false); setEditCampaign(null); }}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {editCampaign ? "Save changes" : "Create campaign"}
          </Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
