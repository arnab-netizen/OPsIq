"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@/ui/primitives";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- guidance payload is the service contract (untyped here); load() on mount is intentional */

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

const STATUS_VARIANT = (s: string): "success" | "default" | "warning" | "destructive" =>
  s === "CRITICAL" ? "destructive" : s === "DANGER" ? "warning" : s === "WATCH" ? "default" : "success";

/** Owner Now View — the Real-Time 360° guided decision surface (Module 41). */
export default function OwnerNowViewPage() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api("/api/owner/now-view"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <main style={{ padding: 24 }}>Loading your Owner Now View…</main>;
  if (error) return (
    <main style={{ padding: 24 }}>
      <p style={{ color: "#b91c1c" }}>{error}</p>
      <Button onClick={() => void load()}>Retry</Button>
    </main>
  );
  if (!data) return null;

  const view = data.view ?? {};
  const steps: any[] = data.stepByStep ?? [];
  const beginner = data.beginnerExplanation ?? {};

  return (
    <main style={{ padding: 24, maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Owner Now View</h1>
        <Button onClick={() => void load()}>Refresh</Button>
      </header>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge variant={STATUS_VARIANT(view.businessHealth)}>Health: {view.businessHealth}</Badge>
        <Badge variant={STATUS_VARIANT(view.cashDangerStatus)}>Cash: {view.cashDangerStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.staffOverloadStatus)}>Staff load: {view.staffOverloadStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.ownerOverloadStatus)}>Owner load: {view.ownerOverloadStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.qualityFailureStatus)}>Quality: {view.qualityFailureStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.customerRetentionStatus)}>Retention: {view.customerRetentionStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.supplierInventoryStatus)}>Supply: {view.supplierInventoryStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.growthReadinessStatus)}>Growth: {view.growthReadinessStatus}</Badge>
        <Badge variant="default">{view.classification}</Badge>
        {view.confidenceCapped && <Badge variant="warning">Low confidence ({view.confidence})</Badge>}
      </section>

      {Array.isArray(view.missingDataRequests) && view.missingDataRequests.length > 0 && (
        <section style={{ background: "#fffbeb", padding: 16, borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>Data needed first</h2>
          <ul>{view.missingDataRequests.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>
        </section>
      )}

      <section>
        <h2>Top {Math.min(steps.length, 3) || ""} actions now</h2>
        {steps.length === 0 && <p>No urgent owner actions right now.</p>}
        {steps.map((s, i) => (
          <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <p style={{ margin: "0 0 6px", fontWeight: 600 }}>{s.exactStep}</p>
            <p style={{ margin: "0 0 4px", color: "#6b7280" }}>Why now: {s.reasonNow}</p>
            <p style={{ margin: "0 0 4px" }}>Who: {s.assignedRole} · Deadline: {s.deadline}</p>
            <p style={{ margin: "0 0 4px" }}>Proof: {s.proofRequired ? s.proofType : "not required"}</p>
            <p style={{ margin: "0 0 4px" }}>Expected: {s.expectedOutcome}</p>
            <p style={{ margin: 0, color: "#b45309" }}>Rollback if: {s.rollbackTrigger}</p>
          </div>
        ))}
      </section>

      {Array.isArray(view.actionsToAvoid) && view.actionsToAvoid.length > 0 && (
        <section style={{ background: "#fef2f2", padding: 16, borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>Do NOT do now</h2>
          <ul>{view.actionsToAvoid.map((a: any, i: number) => <li key={i}>{a.avoid} — <em>{a.reason}</em></li>)}</ul>
        </section>
      )}

      {Array.isArray(data.whatChanged) && data.whatChanged.length > 0 && (
        <section>
          <h2>What changed since last check</h2>
          <ul>{data.whatChanged.map((c: any, i: number) => <li key={i}>{c.category}: {c.reason}</li>)}</ul>
        </section>
      )}

      {beginner.plainReason && (
        <section style={{ background: "#f0f9ff", padding: 16, borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>In plain language</h2>
          <p><strong>{beginner.plainReason}</strong></p>
          <p>{beginner.whyItMatters}</p>
          <p>If ignored: {beginner.whatHappensIfIgnored}</p>
          {Array.isArray(beginner.whatToDoFirst) && (
            <><p style={{ marginBottom: 4, fontWeight: 600 }}>Do first:</p>
            <ul>{beginner.whatToDoFirst.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>
          )}
          {Array.isArray(beginner.whatNotToDo) && (
            <><p style={{ marginBottom: 4, fontWeight: 600 }}>Do not:</p>
            <ul>{beginner.whatNotToDo.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>
          )}
          {beginner.professionalReviewWarning && <p style={{ color: "#b45309" }}>{beginner.professionalReviewWarning}</p>}
          {beginner.confidenceNote && <p style={{ color: "#6b7280" }}>{beginner.confidenceNote}</p>}
        </section>
      )}
    </main>
  );
}
