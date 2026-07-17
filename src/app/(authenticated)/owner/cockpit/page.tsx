"use client";

/**
 * Owner Cockpit (PASS 36) — the canonical minimum owner-visible surface for the proven governed execution
 * loop. It reads GET /api/owner/now-view (the server-computed payload) and drives owner actions through
 * POST /api/owner/process-execution (applyProcessExecutionAction). No business logic, no duplicate backend:
 * the server re-derives + re-checks every action. Presentation + safety layout live in MinimumOwnerCockpit.
 */

/* eslint-disable react-hooks/set-state-in-effect -- load() on mount is the intentional fetch-on-mount pattern used across the owner pages */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/ui/primitives";
import { MinimumOwnerCockpit, type CockpitActionInput } from "@/components/owner/MinimumOwnerCockpit";
import type { ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";
import type { OwnerRecoveryStatusResponse } from "@/domain/owner-mode/owner-recovery-status";
import type { OwnerPublicSignalsResponse } from "@/domain/owner-mode/owner-public-signals";
import type { DerivedBusinessConditionSignals } from "@/services/business-condition/business-condition-profile.service";

const FETCH_TIMEOUT_MS = 10_000;

async function apiGet(path: string) {
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

async function apiPost(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

interface AvoidItem { avoid?: string }

export default function OwnerCockpitPage() {
  const [bridge, setBridge] = useState<ProcessExecutionBridgeView | null>(null);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [recovery, setRecovery] = useState<OwnerRecoveryStatusResponse | null>(null);
  const [publicSignals, setPublicSignals] = useState<OwnerPublicSignalsResponse | null>(null);
  const [businessCondition, setBusinessCondition] = useState<DerivedBusinessConditionSignals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet("/api/owner/now-view");
      setBridge((data.processExecution as ProcessExecutionBridgeView) ?? null);
      const avoidList = (data?.view?.actionsToAvoid as AvoidItem[] | undefined) ?? [];
      setAvoid(avoidList.map((a) => a.avoid ?? "").filter(Boolean));
      setBusinessCondition((data.derivedBusinessCondition as DerivedBusinessConditionSignals) ?? null);
      // Read-only recovery status (best-effort; a failure here must not break the cockpit).
      const rec = await apiGet("/api/owner/recovery-status").catch(() => null);
      setRecovery(rec && typeof rec === "object" && "recoveryStatus" in rec ? (rec as OwnerRecoveryStatusResponse) : null);
      // Read-only outside signals (best-effort; a failure here must not break the cockpit).
      const sig = await apiGet("/api/owner/public-signals").catch(() => null);
      setPublicSignals(sig && typeof sig === "object" && "publicSignalStatus" in sig ? (sig as OwnerPublicSignalsResponse) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onAction = useCallback(async (taskKey: string, action: string, input: CockpitActionInput) => {
    setBusy(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = { taskKey, action };
      if (input.evidenceRefs?.length) body.evidenceRefs = input.evidenceRefs;
      if (input.reason) body.reason = input.reason;
      if (input.delegateToRole) body.delegateToRole = input.delegateToRole;
      const { ok, data } = await apiPost("/api/owner/process-execution", body);
      if (!ok) {
        setMessage(data?.error?.message || data?.error?.code || data?.error || "Action was not allowed.");
      } else {
        setMessage(`Action applied — task is now ${String(data.status ?? "updated").toLowerCase()}.`);
        await load();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }, [load]);

  if (loading) return <main style={{ padding: 24 }}>Loading your cockpit…</main>;
  if (error) return (
    <main style={{ padding: 24 }}>
      <p style={{ color: "#b91c1c" }}>{error}</p>
      <Button onClick={() => void load()}>Retry</Button>
    </main>
  );

  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Your cockpit</h1>
        <span style={{ fontSize: 13, color: "#6b7280" }}>One clear next step, with the proof and the safety limits.</span>
        <Button onClick={() => void load()} disabled={busy}>Refresh</Button>
      </header>
      {message && <p data-testid="cockpit-message" style={{ margin: 0, fontSize: 13, color: "#374151" }}>{message}</p>}
      <MinimumOwnerCockpit bridge={bridge} actionsToAvoid={avoid} recovery={recovery} publicSignals={publicSignals} businessCondition={businessCondition} onAction={onAction} busy={busy} />
    </main>
  );
}
