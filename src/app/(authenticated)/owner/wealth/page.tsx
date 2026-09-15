"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, CardDashboardSkeleton } from "@/ui/primitives";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- command-center payload is the service contract (typed server-side in WealthCommandCenter); rendered read-only here. load() on mount is intentional. */

const FETCH_TIMEOUT_MS = 10_000;

async function api(path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("Request timed out after 10 seconds.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const MOVE_VARIANT = (d: string): "success-accessible" | "default-accessible" | "warning-accessible" | "destructive-accessible" =>
  d === "BLOCKED" ? "destructive-accessible" : d === "VALIDATE_FIRST" ? "warning-accessible" : d === "CHOOSE_ALTERNATIVE" ? "default-accessible" : "success-accessible";

/**
 * Owner Wealth Command Center — the owner-facing surface for the wealth-loop
 * decision view (wealth path + business-model quality, risk-adjusted score,
 * next best move, Work Package, owner workload transfer, proof requirement).
 * Read-only: all logic and authorization live in /api/owner/wealth-command-center.
 */
export default function OwnerWealthPage() {
  const [data, setData] = useState<any | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (bizId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = bizId ? `?businessId=${encodeURIComponent(bizId)}` : "";
      const res = await api(`/api/owner/wealth-command-center${qs}`);
      setData(res);
      setBusinessId(res.selectedBusinessId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <CardDashboardSkeleton sections={4} label="Loading your Wealth Command Center" />;
  if (error)
    return (
      <main style={{ padding: 24 }}>
        <p style={{ color: "#b91c1c" }}>{error}</p>
        <Button onClick={() => void load(businessId)}>Retry</Button>
      </main>
    );
  if (!data) return null;

  const cc = data.commandCenter ?? {};
  const move = cc.nextBestMove ?? {};
  const wp = cc.workPackage ?? null;
  const transfer = cc.ownerWorkloadTransfer ?? null;
  const businesses: any[] = data.businesses ?? [];

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Wealth Command Center</h1>
        <Link href="/owner"><Button>Command Center</Button></Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <BusinessContextSelector
          businesses={businesses}
          selectedId={businessId}
          onChange={(id) => void load(id)}
        />
      </div>

      {cc.provisional && (
        <p style={{ color: "#b45309", fontSize: 13, marginBottom: 12 }}>
          Provisional: this view is based on limited data. Add more business inputs to sharpen it.
        </p>
      )}

      {/* Next Best Move — the headline decision */}
      <section style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>Next best move</span>
          <Badge variant={MOVE_VARIANT(move.decision ?? "")}>{move.decision ?? "—"}</Badge>
        </div>
        <p style={{ fontSize: 18, fontWeight: 600 }}>{move.actionLabel ?? "No action proposed"}</p>
        {move.reason && <p style={{ fontSize: 14, color: "#4b5563", marginTop: 4 }}>{move.reason}</p>}
      </section>

      {/* Scores */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Metric label="Wealth path" value={cc.wealthPath?.label ?? cc.wealthPath?.pathType ?? "—"} />
        <Metric label="Business model quality" value={cc.businessModelQuality ? `${cc.businessModelQuality.score} (${cc.businessModelQuality.tier})` : "—"} />
        <Metric label="Risk-adjusted score" value={cc.riskAdjustedScore != null ? String(cc.riskAdjustedScore) : "—"} />
        <Metric label="Outcome review" value={cc.outcomeReviewState ?? "—"} />
      </section>

      {/* Financial governor / cash safety */}
      {(cc.cashSafety || cc.financialGovernor) && (
        <section style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Financial safety</h2>
          {cc.cashSafety && (
            <p style={{ fontSize: 14 }}>
              Cash-safety gate: <strong>{cc.cashSafety.outcome ?? (cc.cashSafety.allowed ? "ALLOWED" : "BLOCKED")}</strong>
              {cc.cashSafety.reason && <span style={{ color: "#6b7280" }}> — {cc.cashSafety.reason}</span>}
            </p>
          )}
          {cc.financialGovernor && (
            <p style={{ fontSize: 14 }}>Spend governor: <strong>{cc.financialGovernor.decision ?? "—"}</strong></p>
          )}
        </section>
      )}

      {/* Work Package — the transferred work */}
      {wp && (
        <section style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Prepared Work Package</h2>
          <p style={{ fontSize: 14, fontWeight: 600 }}>{wp.title ?? wp.kind ?? "Work Package"}</p>
          {wp.assigneeRole && <p style={{ fontSize: 13, color: "#6b7280" }}>Assign to: {wp.assigneeRole}</p>}
          {Array.isArray(wp.steps) && wp.steps.length > 0 && (
            <ol style={{ fontSize: 13, marginTop: 8, paddingLeft: 18 }}>
              {wp.steps.slice(0, 8).map((s: any, i: number) => (
                <li key={i}>{typeof s === "string" ? s : s.label ?? s.description ?? JSON.stringify(s)}</li>
              ))}
            </ol>
          )}
          {cc.proofRequirement && (
            <p style={{ fontSize: 13, marginTop: 8, color: "#374151" }}>Proof required: {cc.proofRequirement}</p>
          )}
        </section>
      )}

      {/* Owner workload transfer */}
      {transfer && (
        <section style={{ fontSize: 13, color: "#374151" }}>
          Owner time: {transfer.minutesBefore}m → {transfer.minutesAfter}m
          {" "}(<strong>{transfer.minutesSaved}m saved, {transfer.pctReduced}% reduced</strong>)
        </section>
      )}

      {Array.isArray(cc.warnings) && cc.warnings.length > 0 && (
        <ul style={{ fontSize: 12, color: "#b45309", marginTop: 12 }}>
          {cc.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
