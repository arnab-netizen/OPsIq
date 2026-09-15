"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Input, Select, CardDashboardSkeleton } from "@/ui/primitives";

/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic dashboard payloads are untyped */

// Candidates are never created from this page. SEC-005 requires four
// deterministic records (owner decision, action taken, elapsed outcome
// window, human approval) that only a real domain flow can supply --
// see src/services/owner-finance/learning-bridge.service.ts for the one
// existing producer. This page is oversight only: inspect, review,
// promote/reject, and (for already-promoted candidates) roll back.
const ELIGIBLE_FOR_PROMOTION = new Set([
  "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
  "LEARNING_ELIGIBLE_HUMAN_REVIEWED",
]);

const SOURCE_LABELS = [
  { value: "HUMAN_VERIFIED_CANDIDATE", label: "Human verified" },
  { value: "REAL_SOURCE_BACKED_CANDIDATE", label: "Real source backed" },
  { value: "SYNTHETIC_ONLY_CANDIDATE", label: "Synthetic only" },
];

const REVIEW_DECISIONS = [
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "DEFERRED", label: "Deferred" },
];

const ROLLBACK_CODES = [
  { value: "REGRESSION_DETECTED", label: "Regression detected" },
  { value: "HARM_DETECTED", label: "Harm detected" },
  { value: "MANUAL_OVERRIDE", label: "Manual override" },
  { value: "POLICY_VIOLATION", label: "Policy violation" },
];

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

export default function OwnerLearningGovernancePage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reviewsByCandidate, setReviewsByCandidate] = useState<Record<string, any[]>>({});
  const [rollbacksByCandidate, setRollbacksByCandidate] = useState<Record<string, any[]>>({});
  const [promoteFormFor, setPromoteFormFor] = useState<string | null>(null);
  const [reviewFormFor, setReviewFormFor] = useState<string | null>(null);
  const [rollbackFormFor, setRollbackFormFor] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    const data = await api("/api/owner/learning-candidates");
    setCandidates(data);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadCandidates();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadCandidates]);

  async function toggleExpand(candidateId: string) {
    if (expanded === candidateId) {
      setExpanded(null);
      return;
    }
    setExpanded(candidateId);
    setBusy(true);
    setError(null);
    try {
      const [reviews, rollbacks] = await Promise.all([
        api(`/api/owner/learning-reviews?candidateId=${candidateId}`),
        api(`/api/owner/learning-rollback-events?candidateId=${candidateId}`),
      ]);
      setReviewsByCandidate((m) => ({ ...m, [candidateId]: reviews }));
      setRollbacksByCandidate((m) => ({ ...m, [candidateId]: rollbacks }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load candidate detail");
    } finally {
      setBusy(false);
    }
  }

  async function promote(e: React.FormEvent<HTMLFormElement>, candidateId: string) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api(`/api/owner/learning-candidates/${candidateId}/promote`, {
        method: "POST",
        body: JSON.stringify({ approvedAt: new Date().toISOString(), sourceLabel: fd.get("sourceLabel") }),
      });
      setPromoteFormFor(null);
      await loadCandidates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to promote candidate");
    } finally {
      setBusy(false);
    }
  }

  async function reject(candidateId: string) {
    setBusy(true);
    setError(null);
    try {
      const reason = window.prompt("Rejection reason:");
      if (!reason) {
        setBusy(false);
        return;
      }
      await api(`/api/owner/learning-candidates/${candidateId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      await loadCandidates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reject candidate");
    } finally {
      setBusy(false);
    }
  }

  async function submitReview(e: React.FormEvent<HTMLFormElement>, candidateId: string) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/owner/learning-reviews", {
        method: "POST",
        body: JSON.stringify({
          candidateId,
          reviewerId: fd.get("reviewerId"),
          decision: fd.get("decision"),
          reviewNotes: fd.get("reviewNotes") || "",
          reviewedAt: new Date().toISOString(),
        }),
      });
      setReviewFormFor(null);
      const reviews = await api(`/api/owner/learning-reviews?candidateId=${candidateId}`);
      setReviewsByCandidate((m) => ({ ...m, [candidateId]: reviews }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit review");
    } finally {
      setBusy(false);
    }
  }

  async function submitRollback(e: React.FormEvent<HTMLFormElement>, candidateId: string) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/owner/learning-rollback-events", {
        method: "POST",
        body: JSON.stringify({
          candidateId,
          rolledBackBy: fd.get("rolledBackBy"),
          rolledBackAt: new Date().toISOString(),
          rollbackReason: fd.get("rollbackReason"),
          rollbackCode: fd.get("rollbackCode"),
        }),
      });
      setRollbackFormFor(null);
      const rollbacks = await api(`/api/owner/learning-rollback-events?candidateId=${candidateId}`);
      setRollbacksByCandidate((m) => ({ ...m, [candidateId]: rollbacks }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record rollback");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <CardDashboardSkeleton label="Loading learning governance workspace" />;

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Learning Governance</h1>
        <p className="text-muted-foreground text-sm">
          Review evidence, promote or reject controlled learning candidates, and roll back a
          promoted learning if it turns out harmful. Candidates are produced by real domain
          verification flows (e.g. Finance&rsquo;s closed loop) -- this page never creates one.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {candidates.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No learning candidates yet. Candidates appear here once a domain records a verified
          outcome (e.g. Finance&rsquo;s action-verification loop).
        </div>
      ) : (
        <section className="space-y-4">
          {candidates.map((c) => {
            const canPromote = ELIGIBLE_FOR_PROMOTION.has(c.eligibilityStatus) && !c.promotionLocked;
            const canReject = !c.promotionLocked;
            const isExpanded = expanded === c.id;
            return (
              <div key={c.id} className="border rounded-lg p-4 bg-card">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">
                      Business {c.businessId}
                    </div>
                    <div className="text-sm mt-1">{c.evidenceSummary}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Source: {c.evidenceSourceType}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={c.promotionLocked ? "success-accessible" : canPromote ? "default-accessible" : "muted-accessible"}>
                      {c.eligibilityStatus}
                    </Badge>
                    {c.promotionLocked && (
                      <div className="text-xs text-muted-foreground mt-1">Promoted (locked)</div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mt-3 flex-wrap">
                  <Button onClick={() => toggleExpand(c.id)} disabled={busy}>
                    {isExpanded ? "Hide detail" : "Reviews & rollback history"}
                  </Button>
                  {canPromote && (
                    <Button onClick={() => setPromoteFormFor((id) => (id === c.id ? null : c.id))} disabled={busy}>
                      {promoteFormFor === c.id ? "Cancel promote" : "Promote"}
                    </Button>
                  )}
                  {canReject && (
                    <Button onClick={() => reject(c.id)} disabled={busy}>Reject</Button>
                  )}
                  <Button onClick={() => setReviewFormFor((id) => (id === c.id ? null : c.id))} disabled={busy}>
                    {reviewFormFor === c.id ? "Cancel review" : "Add review"}
                  </Button>
                  {c.promotionLocked && (
                    <Button onClick={() => setRollbackFormFor((id) => (id === c.id ? null : c.id))} disabled={busy}>
                      {rollbackFormFor === c.id ? "Cancel rollback" : "Record rollback"}
                    </Button>
                  )}
                </div>

                {promoteFormFor === c.id && (
                  <form onSubmit={(e) => promote(e, c.id)} className="mt-3 border rounded-lg p-3 bg-background space-y-3">
                    <Select name="sourceLabel" label="Source label" required options={SOURCE_LABELS} />
                    <Button type="submit" disabled={busy}>{busy ? "Promoting…" : "Confirm promotion"}</Button>
                  </form>
                )}

                {reviewFormFor === c.id && (
                  <form onSubmit={(e) => submitReview(e, c.id)} className="mt-3 border rounded-lg p-3 bg-background space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Input name="reviewerId" label="Reviewer" required />
                      <Select name="decision" label="Decision" required options={REVIEW_DECISIONS} />
                    </div>
                    <Input name="reviewNotes" label="Review notes" />
                    <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Save review"}</Button>
                  </form>
                )}

                {rollbackFormFor === c.id && (
                  <form onSubmit={(e) => submitRollback(e, c.id)} className="mt-3 border rounded-lg p-3 bg-background space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Input name="rolledBackBy" label="Rolled back by" required />
                      <Select name="rollbackCode" label="Rollback code" required options={ROLLBACK_CODES} />
                    </div>
                    <Input name="rollbackReason" label="Rollback reason" required />
                    <Button type="submit" disabled={busy}>{busy ? "Recording…" : "Confirm rollback"}</Button>
                  </form>
                )}

                {isExpanded && (
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-semibold mb-2">
                        Reviews ({(reviewsByCandidate[c.id] ?? []).length})
                      </h3>
                      <div className="space-y-2">
                        {(reviewsByCandidate[c.id] ?? []).map((r: any) => (
                          <div key={r.id} className="border-l-4 pl-3 py-1" style={{ borderColor: "#94a3b8" }}>
                            <div className="text-xs font-medium">{r.reviewerId} &middot; {r.decision}</div>
                            {r.reviewNotes && <div className="text-xs text-muted-foreground">{r.reviewNotes}</div>}
                          </div>
                        ))}
                        {(reviewsByCandidate[c.id] ?? []).length === 0 && (
                          <p className="text-xs text-muted-foreground">No reviews yet.</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-2">
                        Rollback history ({(rollbacksByCandidate[c.id] ?? []).length})
                      </h3>
                      <div className="space-y-2">
                        {(rollbacksByCandidate[c.id] ?? []).map((rb: any) => (
                          <div key={rb.id} className="border-l-4 pl-3 py-1" style={{ borderColor: "#f59e0b" }}>
                            <div className="text-xs font-medium">{rb.rollbackCode} &middot; by {rb.rolledBackBy}</div>
                            <div className="text-xs text-muted-foreground">{rb.rollbackReason}</div>
                          </div>
                        ))}
                        {(rollbacksByCandidate[c.id] ?? []).length === 0 && (
                          <p className="text-xs text-muted-foreground">Never rolled back.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
