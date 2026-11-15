"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Button, CardDashboardSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
import { CanonicalCockpitLink } from "@/components/owner/CanonicalCockpitLink";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { useActiveBusiness } from "@/context/active-business-context";
import { OwnerDecisionCard } from "@/components/owner/OwnerDecisionCard";
import type { CurrentOwnerDecision } from "@/domain/owner-spine/owner-decision";

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

// Verified against AreaStatus (src/domain/owner-guidance/guidance-orchestrator.ts) -- covers all
// eight area-status badges on this page (businessHealth, cashDangerStatus, ...).
const STATUS_LABEL: Record<string, string> = {
  OK: "OK",
  WATCH: "Watch",
  DANGER: "Danger",
  CRITICAL: "Critical",
};
// Verified against GuidanceClassification (src/domain/owner-guidance/guidance-classification.ts). These describe THIS PAGE'S
// guidance workflow (readiness to review), never the owner's permission to commit money, capacity or a plan: that comes only
// from the canonical advice policy beside the main-target card. Wording is scoped to "guidance" so it cannot read as approval.
const CLASSIFICATION_LABEL: Record<string, string> = {
  GUIDANCE_READY: "Guidance ready to review",
  GUIDANCE_READY_WITH_LOW_CONFIDENCE: "Guidance ready to review — limited evidence",
  GUIDANCE_BLOCKED_MISSING_DATA: "Guidance needs more information",
  GUIDANCE_BLOCKED_UNSAFE: "Guidance held by a safety check",
  GUIDANCE_REQUIRES_OWNER_DECISION: "Requires owner decision",
  GUIDANCE_REQUIRES_PROFESSIONAL_REVIEW: "Requires professional review",
  GUIDANCE_REQUIRES_OUTCOME_CHECK: "Requires outcome check",
  GUIDANCE_REQUIRES_ROLLBACK: "Requires rollback",
  GUIDANCE_REQUIRES_REDESIGN: "Requires redesign",
};
// Verified against EvidenceConfidenceLevel (src/domain/business-impact/recommendation-business-impact.ts).
const CONFIDENCE_LEVEL_LABEL: Record<string, string> = {
  VERIFIED: "Verified",
  STRONG: "Strong",
  MODERATE: "Moderate",
  WEAK: "Weak",
  INSUFFICIENT: "Insufficient",
};
// Verified against ChangeCategory (src/domain/owner-guidance/change-detection.ts) -- a 15-value
// enum with no existing owner-facing label anywhere; a generic SCREAMING_SNAKE_CASE -> sentence
// case converter (rather than 15 hand-written entries) since the raw names are already plain
// English words joined by underscores, not abbreviations needing a real gloss.
function humanizeChangeCategory(value: string): string {
  const words = value.toLowerCase().split("_");
  if (words.length === 0) return value;
  const rest = words.slice(1).join(" ");
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + (rest ? " " + rest : "");
}
// step.proofType (owner-now-view.service.ts) is a free-text `string`, not a closed enum, but its
// real values are all lowercase snake_case tokens ("checklist_completion", "before_after_image")
// -- same underscore-join shape as ChangeCategory, just lowercase already.
function humanizeProofType(value: string): string {
  return value.split("_").join(" ");
}

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
  const { businesses, activeBusinessId, needsBusinessRecovery, setActiveBusinessId, loading: contextLoading } = useActiveBusiness();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Request-sequence guard: a stale in-flight response for a business the owner has since
  // switched away from must not overwrite the newer selection.
  const requestSeq = useRef(0);

  const load = useCallback(async (bizId: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api(`/api/owner/now-view?businessId=${encodeURIComponent(bizId)}`);
      if (requestSeq.current !== seq) return; // a newer request has since started — discard this stale response
      setData(result);
    } catch (e) {
      if (requestSeq.current !== seq) return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contextLoading) return;
    if (needsBusinessRecovery) return;
    if (!activeBusinessId) { setLoading(false); return; }
    void load(activeBusinessId);
  }, [contextLoading, activeBusinessId, needsBusinessRecovery, load]);

  const onSwitchBusiness = useCallback((id: string) => {
    setLoading(true);
    setActiveBusinessId(id);
  }, [setActiveBusinessId]);

  if (contextLoading) return <CardDashboardSkeleton sections={4} label="Loading your Owner Now View" />;
  if (needsBusinessRecovery) return (
    <PageContainer>
      <p>Your previously selected business is no longer available. Choose a business to continue.</p>
      <BusinessContextSelector businesses={businesses} selectedId={null} onChange={onSwitchBusiness} />
    </PageContainer>
  );
  if (!activeBusinessId) return (
    <PageContainer>
      <CanonicalCockpitLink from="Now View" />
      <p>No businesses yet. Create one to see your Owner Now View.</p>
    </PageContainer>
  );
  if (loading) return <CardDashboardSkeleton sections={4} label="Loading your Owner Now View" />;
  if (error) return (
    <PageContainer>
      <p style={{ color: "#b91c1c" }}>{error}</p>
      <Button onClick={() => void load(activeBusinessId)}>Retry</Button>
    </PageContainer>
  );
  if (!data) return null;

  const view = data.view ?? {};
  const steps: any[] = data.stepByStep ?? [];
  const beginner = data.beginnerExplanation ?? {};

  return (
    <PageContainer style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <CanonicalCockpitLink from="Now View" />
      <PageHeader
        title="Owner Now View"
        actions={
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link href="/owner/process-intelligence" data-testid="process-intelligence-link">Where the process is breaking</Link>
            <Link href="/owner/adjudication" data-testid="proof-risk-queue-link">Proof-risk review queue</Link>
            <Button onClick={() => void load(activeBusinessId)}>Refresh</Button>
          </div>
        }
      />

      <BusinessContextSelector businesses={businesses} selectedId={activeBusinessId} onChange={onSwitchBusiness} />

      {/* The ONE canonical owner decision (same object Home/Cockpit/Priorities render). The operating
          signals below are Now View's context around it — they never name a different main target. */}
      {data.ownerDecision && <OwnerDecisionCard decision={data.ownerDecision as CurrentOwnerDecision} detail="compact" />}
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
        Business selection scopes cash, finance, quality and retention signals below. Staff workload,
        supply/capacity, process-breakdown, and proof-risk signals are workspace-wide and do not change
        with this selection — see{" "}
        <Link href="/owner/process-intelligence">Where the process is breaking</Link> and{" "}
        <Link href="/owner/adjudication">the proof-risk queue</Link> for those.
      </p>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge variant={STATUS_VARIANT(view.businessHealth)}>Health: {STATUS_LABEL[view.businessHealth] ?? view.businessHealth}</Badge>
        <Badge variant={STATUS_VARIANT(view.cashDangerStatus)}>Cash: {STATUS_LABEL[view.cashDangerStatus] ?? view.cashDangerStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.staffOverloadStatus)}>Staff load: {STATUS_LABEL[view.staffOverloadStatus] ?? view.staffOverloadStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.ownerOverloadStatus)}>Owner load: {STATUS_LABEL[view.ownerOverloadStatus] ?? view.ownerOverloadStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.qualityFailureStatus)}>Quality: {STATUS_LABEL[view.qualityFailureStatus] ?? view.qualityFailureStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.customerRetentionStatus)}>Retention: {STATUS_LABEL[view.customerRetentionStatus] ?? view.customerRetentionStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.supplierInventoryStatus)}>Supply: {STATUS_LABEL[view.supplierInventoryStatus] ?? view.supplierInventoryStatus}</Badge>
        <Badge variant={STATUS_VARIANT(view.growthReadinessStatus)}>Growth: {STATUS_LABEL[view.growthReadinessStatus] ?? view.growthReadinessStatus}</Badge>
        <Badge variant="default-accessible">{CLASSIFICATION_LABEL[view.classification] ?? view.classification}</Badge>
        {view.confidenceCapped && <Badge variant="warning-accessible">Limited evidence ({CONFIDENCE_LEVEL_LABEL[view.confidence] ?? view.confidence})</Badge>}
      </section>
      <p data-testid="now-guidance-scope" style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
        The guidance label above describes this page&apos;s guidance only. Whether OpsIQ supports committing money, capacity or a plan is
        decided by your main target&apos;s advice status{data.ownerDecision?.advicePolicy && !data.ownerDecision.advicePolicy.canMakeMaterialCommitment ? " — which does not support a commitment on the current evidence" : ""}.
      </p>

      {Array.isArray(view.missingDataRequests) && view.missingDataRequests.length > 0 && (
        <section style={{ background: "#fffbeb", padding: 16, borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>Data OpsIQ still needs</h2>
          <ul>{view.missingDataRequests.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>
        </section>
      )}

      <section>
        <h2>Operating signals to act on</h2>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280" }}>Day-to-day signals from your operating data. Your main target is shown above; these support it and never replace it.</p>
        {steps.length === 0 && <p>No urgent operating signals right now.</p>}
        {steps.map((s, i) => (
          <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <p style={{ margin: "0 0 6px", fontWeight: 600 }}>{s.exactStep}</p>
            <p style={{ margin: "0 0 4px", color: "#6b7280" }}>Why now: {s.reasonNow}</p>
            <p style={{ margin: "0 0 4px" }}>Who: {s.assignedRole} · Deadline: {s.deadline}</p>
            <p style={{ margin: "0 0 4px" }}>Proof: {s.proofRequired ? humanizeProofType(s.proofType) : "not required"}</p>
            <p style={{ margin: "0 0 4px" }}>Expected: {s.expectedOutcome}</p>
            <p style={{ margin: 0, color: "#b45309" }}>Rollback if: {s.rollbackTrigger}</p>
          </div>
        ))}
      </section>

      {Array.isArray(view.actionsToAvoid) && view.actionsToAvoid.some((a: any) => a.conditionOn) && (
        <section style={{ padding: 16, borderRadius: 8, border: "1px solid var(--border)" }} data-testid="now-step-conditions">
          <h2 style={{ marginTop: 0 }}>How to carry out your next steps</h2>
          <ul>{view.actionsToAvoid.filter((a: any) => a.conditionOn).map((a: any, i: number) => <li key={i}>{a.avoid} — <em>{a.reason}</em></li>)}</ul>
        </section>
      )}

      {Array.isArray(view.actionsToAvoid) && view.actionsToAvoid.some((a: any) => !a.conditionOn) && (
        <section style={{ background: "#fef2f2", padding: 16, borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>Do NOT do now</h2>
          <ul>{view.actionsToAvoid.filter((a: any) => !a.conditionOn).map((a: any, i: number) => <li key={i}>{a.avoid} — <em>{a.reason}</em></li>)}</ul>
        </section>
      )}

      {Array.isArray(data.whatChanged) && data.whatChanged.length > 0 && (
        <section>
          <h2>What changed since last check</h2>
          <ul>{data.whatChanged.map((c: any, i: number) => <li key={i}>{humanizeChangeCategory(c.category)}: {c.reason}</li>)}</ul>
        </section>
      )}

      {beginner.plainReason && (
        <section style={{ background: "#f0f9ff", padding: 16, borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>In plain language</h2>
          <p><strong>{beginner.plainReason}</strong></p>
          <p>{beginner.whyItMatters}</p>
          <p>If ignored: {beginner.whatHappensIfIgnored}</p>
          {Array.isArray(beginner.whatToDoFirst) && (
            <><p style={{ marginBottom: 4, fontWeight: 600 }}>{data.ownerDecision ? "Do first:" : "Operating signals to act on:"}</p>
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
    </PageContainer>
  );
}
