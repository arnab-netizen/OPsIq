"use client";

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount / on-business-change is the established owner-page pattern (see OwnerActivationPanel) */

/**
 * /owner/outcomes — "Results": the historical follow-through layer over the existing outcome persistence.
 *
 * Reads (a) the ONE canonical owner decision (the same payload Priorities renders — never re-ranked here) to list which
 * open recommendations can start an outcome trail, and (b) the business's persisted decision/outcome chains. It
 * creates no decision or outcome engine: writes go to the existing decision / outcome-contract / outcome-chain routes.
 * Zero tracked outcomes is a normal state and is shown as exactly that — nothing is simulated.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Badge, CardDashboardSkeleton, Disclosure, EmptyState, ErrorState, PageContainer, PageHeader } from "@/ui/primitives";
import { useActiveBusiness } from "@/context/active-business-context";
import { useCapabilities } from "@/context/capabilities-context";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import type { CurrentOwnerDecision, OwnerDecisionTarget } from "@/domain/owner-spine/owner-decision";
import { OUTCOME_TRACKING_UNAVAILABLE_COPY, candidateTrackability, type OwnerOutcomeChainDto } from "@/domain/owner-spine/owner-outcome-presentation";
import { OutcomeCommitmentForm } from "./OutcomeCommitmentForm";
import { OutcomeTimeline } from "./OutcomeTimeline";
import { fetchOutcomeChains } from "./outcome-api";

const FETCH_TIMEOUT_MS = 10_000;

/** The canonical owner decision, exactly as the server resolved it (same endpoint and payload Priorities uses). */
async function fetchCanonicalDecision(businessId: string, signal: AbortSignal): Promise<CurrentOwnerDecision | null> {
  const res = await fetch(`/api/owner/now-view?businessId=${encodeURIComponent(businessId)}`, { headers: { "Content-Type": "application/json" }, signal });
  if (!res.ok) throw new Error(`canonical decision unavailable (${res.status})`);
  const body = (await res.json()) as { ownerDecision?: CurrentOwnerDecision | null };
  return body.ownerDecision ?? null;
}

function TrackableTarget({ target, businessId, canManage, onRecorded }: { target: OwnerDecisionTarget; businessId: string; canManage: boolean; onRecorded: () => void | Promise<void> }) {
  const uid = useId();
  return (
    <li data-testid="outcome-trackable-target" data-candidate-id={target.candidateId} className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <span className="text-sm font-medium text-foreground">{target.title}</span>
      <span className="text-xs text-muted-foreground">{target.domainLabel}</span>
      {canManage ? (
        <Disclosure summary="Decide and track the result">
          <OutcomeCommitmentForm idPrefix={uid} businessId={businessId} candidateId={target.candidateId} mode={{ kind: "decide" }} onRecorded={onRecorded} />
        </Disclosure>
      ) : (
        <span className="text-sm text-muted-foreground">You can view this, but recording a decision needs permission to manage your business.</span>
      )}
    </li>
  );
}

export function OwnerOutcomesView() {
  const { activeBusinessId, needsBusinessRecovery, businesses, loading: businessLoading } = useActiveBusiness();
  const capabilities = useCapabilities();
  const canManage = capabilities.includes(CAPABILITIES.OWNER_MANAGE);

  const [chains, setChains] = useState<OwnerOutcomeChainDto[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [decision, setDecision] = useState<CurrentOwnerDecision | null>(null);
  const [decisionFailed, setDecisionFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (businessId: string | null) => {
    const mine = ++generation.current;
    if (!businessId) { setChains(null); setDecision(null); setLoading(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const [list, canonical] = await Promise.all([
        fetchOutcomeChains(businessId, controller.signal),
        fetchCanonicalDecision(businessId, controller.signal).then((d) => ({ d, ok: true }), () => ({ d: null, ok: false })),
      ]);
      // The active business changed while this was in flight: this response belongs to another business and must never commit.
      if (generation.current !== mine) return;
      setChains(list.businessId === businessId ? list.chains : []);
      setTruncated(list.truncated);
      setDecision(canonical.d);
      setDecisionFailed(!canonical.ok);
      setError(null);
    } catch {
      if (generation.current !== mine) return;
      setError("Couldn't load your results. Please try again.");
    } finally {
      clearTimeout(timer);
      if (generation.current === mine) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setChains(null);
    setDecision(null);
    // A pending business recovery means there is no trustworthy business to read yet: load nothing.
    // A later load() (business switch) supersedes this one through the generation stamp, so no cleanup is needed.
    void load(needsBusinessRecovery ? null : activeBusinessId);
  }, [activeBusinessId, needsBusinessRecovery, load]);

  const refresh = useCallback(async () => { await load(activeBusinessId); }, [activeBusinessId, load]);

  const tracked = new Set((chains ?? []).map((c) => c.chainKey));
  const attention = decision?.attention ?? [];
  const trackable = attention.filter((t) => candidateTrackability(t.candidateId).trackable && !tracked.has(t.candidateId));
  const untrackable = attention.filter((t) => !candidateTrackability(t.candidateId).trackable);

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <PageHeader title="Results" description="What you decided about OpsIQ's recommendations, what you committed to, and what actually happened afterwards." />

        {businessLoading || loading ? (
          <div role="status" aria-live="polite" aria-label="Loading your results"><CardDashboardSkeleton /></div>
        ) : needsBusinessRecovery ? (
          <EmptyState title="Choose which business to look at" description="The business selected before is no longer available. Pick a business from the business selector." />
        ) : (businesses ?? []).length === 0 || !activeBusinessId ? (
          <EmptyState title="No business yet" description="Add your business first. Results appear here once you decide on a recommendation." />
        ) : error ? (
          <ErrorState title="Couldn't load your results" message={error} onRetry={() => { setLoading(true); void load(activeBusinessId); }} />
        ) : (
          <>
            <section aria-labelledby="outcomes-tracked-heading" className="flex flex-col gap-3" data-testid="outcomes-tracked">
              <h2 id="outcomes-tracked-heading" className="m-0 text-base font-semibold text-foreground">Results you&apos;re tracking</h2>
              {(chains ?? []).length === 0 ? (
                <div data-testid="outcomes-zero-state" className="rounded-lg border border-border p-4">
                  <strong className="text-base font-semibold text-foreground">No tracked outcomes yet</strong>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    OpsIQ starts an outcome trail when you record a decision on a recommendation it can track. Nothing is shown here until that happens.
                  </p>
                </div>
              ) : (
                <>
                  {(chains ?? []).map((c) => <OutcomeTimeline key={c.chainKey} chain={c} canManage={canManage} onChanged={refresh} />)}
                  {truncated && <p role="status" className="m-0 text-sm text-muted-foreground">Showing your most recent results. Older ones are not shown here.</p>}
                </>
              )}
            </section>

            <section aria-labelledby="outcomes-open-heading" className="flex flex-col gap-3" data-testid="outcomes-open">
              <h2 id="outcomes-open-heading" className="m-0 text-base font-semibold text-foreground">Recommendations you can start tracking</h2>
              {decisionFailed ? (
                <p className="m-0 text-sm text-muted-foreground">Couldn&apos;t load your current recommendations. Your tracked results above are unaffected.</p>
              ) : attention.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">There are no open recommendations right now.</p>
              ) : (
                <>
                  {trackable.length === 0 && <p className="m-0 text-sm text-muted-foreground">None of your open recommendations can start a new outcome trail right now.</p>}
                  {trackable.length > 0 && (
                    <ul className="m-0 flex list-none flex-col gap-3 p-0">
                      {trackable.map((t) => <TrackableTarget key={t.candidateId} target={t} businessId={activeBusinessId} canManage={canManage} onRecorded={refresh} />)}
                    </ul>
                  )}
                  {untrackable.length > 0 && (
                    <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="outcomes-untrackable">
                      {untrackable.map((t) => (
                        <li key={t.candidateId} className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-3">
                          <span className="text-sm text-foreground">{t.title}</span>
                          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Badge variant="muted-accessible">Not tracked</Badge>{OUTCOME_TRACKING_UNAVAILABLE_COPY}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </PageContainer>
  );
}
