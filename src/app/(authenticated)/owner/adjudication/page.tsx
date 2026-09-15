"use client";

/**
 * Owner Adjudication Queue page — the minimal owner surface for reviewing and deciding proof-risk
 * findings without raw API calls. It loads the server-built queue (`/api/owner/proof-risk/queue`) and
 * submits each governed decision through the canonical `POST /api/proof-risk/adjudicate` route. No
 * business logic lives here: the queue is built server-side and the outcome effects are enforced by
 * the backend service. Errors are shown safely; no raw internal error is exposed.
 *
 * Business-context decision (verified against owner-now-view.service.ts): NO selector, by design.
 * `/api/owner/proof-risk/queue` nominally accepts `?businessId=` and threads it into `getOwnerNowView`,
 * but every field `buildAdjudicationQueue` actually consumes (reusedProofFindings, topGamingSignal,
 * topCredibilityConcern, timingEvidence, proofRiskAdjudications) is derived from
 * `deps.db.proof.findMany({ where: { workspaceId } })` — workspace-wide, with no businessId filter
 * anywhere in that path. The businessId param is a no-op for this queue. This is also an active
 * decision/workflow surface (the owner is mid-review of specific findings); adjudication decisions are
 * submitted by `sourceRef`/`proofIds`, not businessId, so nothing about the workflow is business-scoped
 * to switch safely between. A business selector would imply switching businesses changes which findings
 * are queued, which it provably does not — it was deliberately not added.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, TableListSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
import { AdjudicationQueue, type QueueItemView, type OutcomeOption, type AdjudicationResult } from "@/components/owner/AdjudicationQueue";

const FETCH_TIMEOUT_MS = 10_000;

async function api(path: string, init?: RequestInit): Promise<{ res: Response; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, signal: controller.signal, ...init });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

function safeError(data: Record<string, unknown>, status: number): string {
  // Prefer the server's already-sanitized operator-safe message (string or { message }); never expose
  // a raw internal error. Falls back to a generic, status-appropriate line.
  const body = data.error as string | { message?: unknown } | undefined;
  const serverText =
    typeof body === "string"
      ? body
      : body && typeof body === "object" && typeof body.message === "string"
        ? body.message
        : "";
  if (serverText) return serverText;
  if (status === 401 || status === 403) return "You are not authorized to adjudicate in this workspace.";
  return `Could not complete the request (${status}).`;
}

export default function OwnerAdjudicationPage() {
  const [items, setItems] = useState<QueueItemView[]>([]);
  const [outcomeOptions, setOutcomeOptions] = useState<OutcomeOption[]>([]);
  const [summary, setSummary] = useState<{ totalItems: number; adjudicableItems: number; blockedByDataItems: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `silent` refreshes the data WITHOUT toggling the full-page loading state — used after a decision so
  // the queue (and the just-submitted result message) stays mounted instead of blanking to a spinner.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { res, data } = await api("/api/owner/proof-risk/queue");
      if (!res.ok) throw new Error(safeError(data, res.status));
      setItems((data.items as QueueItemView[]) ?? []);
      setOutcomeOptions((data.outcomeOptions as OutcomeOption[]) ?? []);
      setSummary((data.summary as { totalItems: number; adjudicableItems: number; blockedByDataItems: number }) ?? null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load the adjudication queue.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onAdjudicate = useCallback(
    async (item: QueueItemView, outcome: string, reason: string): Promise<AdjudicationResult> => {
      const { res, data } = await api("/api/proof-risk/adjudicate", {
        method: "POST",
        body: JSON.stringify({
          sourceType: item.sourceType,
          sourceRef: item.sourceRef,
          outcome,
          reason,
          proofIds: item.proofIds,
          actorIds: item.actorId ? [item.actorId] : undefined,
          idempotencyKey: `${item.sourceType}:${item.sourceRef}:${outcome}`,
        }),
      });
      if (!res.ok) return { ok: false, message: safeError(data, res.status) };
      const status = typeof data.status === "string" ? data.status : "recorded";
      // Silent refresh so a cleared finding drops out and a still-active one keeps showing — without
      // unmounting the queue (which would wipe the success message the component is about to display).
      await load(true);
      return { ok: true, message: `Decision recorded (${status}).` };
    },
    [load]
  );

  return (
    <PageContainer style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        title="Proof-risk review queue"
        description="Review flagged proofs and decide. Dismissing or accepting a finding reduces noise; confirming or requiring fresh proof keeps it active. New evidence can bring a cleared finding back. Every decision is audited."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/owner/now" data-testid="back-to-now">Owner Now View</Link>
            <Button onClick={() => void load()}>Refresh</Button>
          </div>
        }
      />

      {summary && (
        <p style={{ margin: 0, fontSize: 13, color: "#374151" }} data-testid="queue-summary">
          {summary.totalItems} finding(s) · {summary.adjudicableItems} ready to adjudicate ·
          {" "}{summary.blockedByDataItems} awaiting data
        </p>
      )}

      {loading && <TableListSkeleton label="Loading the review queue" />}
      {error && (
        <div>
          <p style={{ color: "#b91c1c" }} data-testid="queue-error">{error}</p>
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      )}
      {!loading && !error && (
        <AdjudicationQueue items={items} outcomeOptions={outcomeOptions} onAdjudicate={onAdjudicate} />
      )}
    </PageContainer>
  );
}
