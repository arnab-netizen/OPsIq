"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Button, CardDashboardSkeleton } from "@/ui/primitives";
import { CanonicalCockpitLink } from "@/components/owner/CanonicalCockpitLink";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";

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

const STATUS_VARIANT = (s: string): "success-accessible" | "default-accessible" | "warning-accessible" | "destructive-accessible" =>
  s === "CRITICAL" ? "destructive-accessible" : s === "DANGER" ? "warning-accessible" : s === "WATCH" ? "default-accessible" : "success-accessible";

/**
 * Owner Now View — the Real-Time 360° guided decision surface (Module 41).
 *
 * Business context: GET /api/owner/now-view accepts an optional `?businessId=` that scopes the
 * finance/cashflow/quality/retention/growth signals (owner-now-view.service.ts `scope = businessId
 * ? { workspaceId, businessId } : { workspaceId }`). Previously this page never sent one, so with 2+
 * businesses the service silently fell back to the single MOST-RECENT row per domain across the
 * whole workspace — cash could reflect one business while quality reflected another, with no owner
 * visibility into which. Fetching the business list here (same pattern as onboarding/data/approvals)
 * and passing an explicit businessId makes that selection visible and owner-controlled, and routes
 * those signals through the safer per-business `scope`.
 *
 * NOT business-scoped by this businessId (workspace-wide regardless of selection, confirmed by
 * reading owner-now-view.service.ts): staff/owner workload, supplier/capacity signals, process
 * intelligence + corrections + SOP/training, the proof-risk gaming/credibility/adjudication queue,
 * and the process-execution task bridge — all derived from workspaceId-only queries. Switching
 * business here does not change those; this is a known, documented limitation of this endpoint's
 * shape, not something a page-level selector can fix without a service-level change.
 */
export default function OwnerNowViewPage() {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Request-sequence guard: this page did not previously support switching business (no selector
  // existed), so adding one newly makes rapid A→B switching reachable. A stale in-flight response
  // for a business the owner has since switched away from must not overwrite the newer selection.
  const requestSeq = useRef(0);

  const load = useCallback(async (bizId?: string | null) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const qs = bizId ? `?businessId=${encodeURIComponent(bizId)}` : "";
      const result = await api(`/api/owner/now-view${qs}`);
      if (requestSeq.current !== seq) return; // a newer request has since started — discard this stale response
      setData(result);
    } catch (e) {
      if (requestSeq.current !== seq) return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, []);

  const loadBusinesses = useCallback(async () => {
    try {
      const res = await api("/api/owner/businesses");
      const list: any[] = Array.isArray(res?.businesses) ? res.businesses : [];
      setBusinesses(list);
      const active = list.find((b) => b.isActive) ?? list[0] ?? null;
      const id = active?.id ?? null;
      setBusinessId(id);
      await load(id);
    } catch {
      // Business list is a progressive enhancement for the selector only — if it fails, still
      // load the workspace-default now-view so the page remains usable.
      await load(null);
    }
  }, [load]);

  useEffect(() => {
    void loadBusinesses();
  }, [loadBusinesses]);

  const onSwitchBusiness = useCallback((id: string) => {
    setBusinessId(id);
    void load(id);
  }, [load]);

  if (loading) return <CardDashboardSkeleton sections={4} label="Loading your Owner Now View" />;
  if (error) return (
    <main style={{ padding: 24 }}>
      <p style={{ color: "#b91c1c" }}>{error}</p>
      <Button onClick={() => void load(businessId)}>Retry</Button>
    </main>
  );
  if (!data) return null;

  const view = data.view ?? {};
  const steps: any[] = data.stepByStep ?? [];
  const beginner = data.beginnerExplanation ?? {};

  return (
    <main style={{ padding: 24, maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <CanonicalCockpitLink from="Now View" />
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Owner Now View</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/owner/process-intelligence" data-testid="process-intelligence-link">Where the process is breaking</Link>
          <Link href="/owner/adjudication" data-testid="proof-risk-queue-link">Proof-risk review queue</Link>
          <Button onClick={() => void load(businessId)}>Refresh</Button>
        </div>
      </header>

      <BusinessContextSelector businesses={businesses} selectedId={businessId} onChange={onSwitchBusiness} />
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
        Business selection scopes cash, finance, quality and retention signals below. Staff workload,
        supply/capacity, process-breakdown, and proof-risk signals are workspace-wide and do not change
        with this selection — see{" "}
        <Link href="/owner/process-intelligence">Where the process is breaking</Link> and{" "}
        <Link href="/owner/adjudication">the proof-risk queue</Link> for those.
      </p>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge variant={STATUS_VARIANT(view.businessHealth)}>Health: {view.businessHealth}</Badge>
        <Badge variant={STATUS_VARIANT(view.cashDangerStatus)}>Cash: {view.cashDangerStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.staffOverloadStatus)}>Staff load: {view.staffOverloadStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.ownerOverloadStatus)}>Owner load: {view.ownerOverloadStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.qualityFailureStatus)}>Quality: {view.qualityFailureStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.customerRetentionStatus)}>Retention: {view.customerRetentionStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.supplierInventoryStatus)}>Supply: {view.supplierInventoryStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.growthReadinessStatus)}>Growth: {view.growthReadinessStatus}</Badge>
        <Badge variant="default-accessible">{view.classification}</Badge>
        {view.confidenceCapped && <Badge variant="warning-accessible">Low confidence ({view.confidence})</Badge>}
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
