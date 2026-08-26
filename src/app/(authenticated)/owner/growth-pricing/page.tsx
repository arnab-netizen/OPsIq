"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Input } from "@/ui/primitives";

/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic dashboard payloads are untyped */

const APPROVAL_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  draft: "muted",
  pending_approval: "warning",
  approved: "success",
  archived: "muted",
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

function fmtMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export default function OwnerGrowthPricingPage() {
  const [tiers, setTiers] = useState<any[]>([]);
  const [gapAnalysis, setGapAnalysis] = useState<{ gaps: any[]; overlaps: any[] } | null>(null);
  const [marginSummary, setMarginSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [supersedeFormFor, setSupersedeFormFor] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const data = await api("/api/growth/pricing-tiers/analysis");
    setTiers(data.tiers ?? []);
    setGapAnalysis(data.gapAnalysis ?? null);
    setMarginSummary(data.marginSummary ?? null);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadAll();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAll]);

  function tierInputFromForm(fd: FormData): Record<string, unknown> {
    const body: Record<string, unknown> = {
      name: fd.get("name"),
      entryPrice: Number(fd.get("entryPrice")),
      maxPrice: Number(fd.get("maxPrice")),
    };
    const currency = fd.get("currency");
    if (currency && typeof currency === "string" && currency.trim()) body.currency = currency.trim().toUpperCase();
    const unitOfMeasure = fd.get("unitOfMeasure");
    if (unitOfMeasure && typeof unitOfMeasure === "string" && unitOfMeasure.trim()) body.unitOfMeasure = unitOfMeasure.trim();
    const customerSegment = fd.get("customerSegment");
    if (customerSegment && typeof customerSegment === "string" && customerSegment.trim()) body.customerSegment = customerSegment.trim();
    const channel = fd.get("channel");
    if (channel && typeof channel === "string" && channel.trim()) body.channel = channel.trim();
    const variableCost = fd.get("variableCost");
    if (variableCost && typeof variableCost === "string" && variableCost.trim()) body.variableCost = Number(variableCost);
    const allocatedCost = fd.get("allocatedCost");
    if (allocatedCost && typeof allocatedCost === "string" && allocatedCost.trim()) body.allocatedCost = Number(allocatedCost);
    return body;
  }

  async function createTier(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/growth/pricing-tiers", {
        method: "POST",
        body: JSON.stringify(tierInputFromForm(fd)),
      });
      setShowCreateForm(false);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create price tier");
    } finally {
      setBusy(false);
    }
  }

  async function approve(tierId: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/growth/pricing-tiers/${tierId}/approve`, { method: "PATCH" });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve price tier");
    } finally {
      setBusy(false);
    }
  }

  async function supersede(e: React.FormEvent<HTMLFormElement>, tierId: string) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api(`/api/growth/pricing-tiers/${tierId}/supersede`, {
        method: "POST",
        body: JSON.stringify(tierInputFromForm(fd)),
      });
      setSupersedeFormFor(null);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to supersede price tier");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-8">Loading growth pricing workspace…</div>;

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Growth Pricing</h1>
          <p className="text-muted-foreground text-sm">
            Review price tiers, approve them for operational use, and create new versions.
            Every tier requires explicit approval here before it is used operationally.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm((s) => !s)} disabled={busy}>
          {showCreateForm ? "Cancel" : "+ New price tier"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {marginSummary && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border rounded-lg p-3">
            <div className="text-xs uppercase text-muted-foreground">Tiers</div>
            <div className="text-lg font-semibold">{marginSummary.tierCount}</div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs uppercase text-muted-foreground">Active</div>
            <div className="text-lg font-semibold">{marginSummary.activeTierCount}</div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs uppercase text-muted-foreground">Avg active margin</div>
            <div className="text-lg font-semibold">
              {marginSummary.avgActiveMargin !== null
                ? `${(marginSummary.avgActiveMargin * 100).toFixed(1)}%`
                : "—"}
            </div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs uppercase text-muted-foreground">Gaps / overlaps</div>
            <div className="text-lg font-semibold">
              {(gapAnalysis?.gaps.length ?? 0)} / {(gapAnalysis?.overlaps.length ?? 0)}
            </div>
          </div>
        </div>
      )}

      {gapAnalysis && (gapAnalysis.gaps.length > 0 || gapAnalysis.overlaps.length > 0) && (
        <div className="mb-6 border rounded-lg p-4 bg-white space-y-2">
          <h2 className="text-sm font-semibold">Pricing gap &amp; overlap analysis (active tiers)</h2>
          {gapAnalysis.gaps.map((g: any, i: number) => (
            <div key={`gap-${i}`} className="text-xs text-muted-foreground">
              Gap: {g.name} ({fmtMoney(g.minPrice, "USD")}–{fmtMoney(g.maxPrice, "USD")})
            </div>
          ))}
          {gapAnalysis.overlaps.map((o: any, i: number) => (
            <div key={`overlap-${i}`} className="text-xs text-destructive">
              Overlap: {o.tier1} &amp; {o.tier2}
            </div>
          ))}
        </div>
      )}

      {showCreateForm && (
        <form onSubmit={createTier} className="mb-6 border rounded-lg p-4 bg-white space-y-3">
          <h2 className="font-semibold">New price tier</h2>
          <div className="grid grid-cols-2 gap-3">
            <Input name="name" label="Tier name" required />
            <Input name="currency" label="Currency (optional, ISO-3)" placeholder="USD" />
            <Input name="entryPrice" label="Entry price" type="number" step="0.01" min="0" required />
            <Input name="maxPrice" label="Max price" type="number" step="0.01" min="0" required />
            <Input name="variableCost" label="Variable cost (optional)" type="number" step="0.01" min="0" />
            <Input name="allocatedCost" label="Allocated cost (optional)" type="number" step="0.01" min="0" />
            <Input name="customerSegment" label="Customer segment (optional)" />
            <Input name="channel" label="Channel (optional)" />
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create price tier (draft)"}</Button>
        </form>
      )}

      {tiers.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No price tiers yet. Create one above to begin governed pricing management.
        </div>
      ) : (
        <section className="space-y-4">
          {tiers.map((t) => {
            const canApprove = t.approvalStatus !== "approved" && t.status !== "ARCHIVED";
            const canSupersede = !t.supersededById && t.status !== "ARCHIVED";
            return (
              <div key={t.id} className="border rounded-lg p-4 bg-white" data-testid={`price-tier-${t.id}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-semibold">{t.name} <span className="text-muted-foreground font-normal">v{t.version}</span></div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {fmtMoney(t.entryPrice, t.currency)} – {fmtMoney(t.maxPrice, t.currency)} / {t.unitOfMeasure}
                      {t.customerSegment ? ` · ${t.customerSegment}` : ""}
                      {t.channel ? ` · ${t.channel}` : ""}
                    </div>
                    {t.computedMargin !== null && (
                      <div className="text-xs text-muted-foreground">Margin: {(t.computedMargin * 100).toFixed(1)}%</div>
                    )}
                    {t.supersededById && (
                      <div className="text-xs text-muted-foreground">Superseded by a newer version</div>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    <Badge variant={APPROVAL_VARIANT[t.approvalStatus] || "muted"}>{t.approvalStatus}</Badge>
                    <div className="text-xs text-muted-foreground">{t.status}</div>
                  </div>
                </div>

                <div className="flex gap-2 mt-3 flex-wrap">
                  {canApprove && (
                    <Button onClick={() => approve(t.id)} disabled={busy}>Approve</Button>
                  )}
                  {canSupersede && (
                    <Button onClick={() => setSupersedeFormFor((id) => (id === t.id ? null : t.id))} disabled={busy}>
                      {supersedeFormFor === t.id ? "Cancel supersede" : "Supersede (new version)"}
                    </Button>
                  )}
                </div>

                {supersedeFormFor === t.id && (
                  <form onSubmit={(e) => supersede(e, t.id)} className="mt-3 border rounded-lg p-3 bg-background space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Input name="name" label="New tier name" defaultValue={t.name} required />
                      <Input name="currency" label="Currency" defaultValue={t.currency} />
                      <Input name="entryPrice" label="Entry price" type="number" step="0.01" min="0" defaultValue={t.entryPrice} required />
                      <Input name="maxPrice" label="Max price" type="number" step="0.01" min="0" defaultValue={t.maxPrice} required />
                      <Input name="variableCost" label="Variable cost (optional)" type="number" step="0.01" min="0" defaultValue={t.variableCost ?? undefined} />
                      <Input name="allocatedCost" label="Allocated cost (optional)" type="number" step="0.01" min="0" defaultValue={t.allocatedCost ?? undefined} />
                    </div>
                    <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create new version"}</Button>
                  </form>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
