"use client";

/**
 * Domain-page context for the ONE canonical owner decision. When the owner's overall main target lives
 * in this domain, the page shows it compactly ("Your overall main target") using the canonical
 * decision's own identity — this component never elects anything: it renders what /api/owner/home
 * resolved. The block carries the `main-target` anchor, so "Work on this in …" lands where the target
 * is visible.
 */
import { useEffect, useRef, useState } from "react";
import { decisionHasActionableStepIn, type CurrentOwnerDecision } from "@/domain/owner-spine/owner-decision";
import { domainDataGapNotice } from "@/domain/owner-spine/owner-imperatives";

/** The anchor every domain page's main-target block carries (see OwnerDecisionCard's go link). */
export const OWNER_MAIN_TARGET_ANCHOR = "main-target";

// Concurrent requests for the same business AND revision share one fetch (the context block and a
// data-gap notice on the same page read the same decision).
const inFlight = new Map<string, Promise<CurrentOwnerDecision | null>>();

function fetchCanonicalDecision(businessId: string, key: string): Promise<CurrentOwnerDecision | null> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const p = fetch(`/api/owner/home?businessId=${encodeURIComponent(businessId)}`)
    .then(async (res) => (res.ok ? (((await res.json()) as { currentOwnerDecision?: CurrentOwnerDecision | null }).currentOwnerDecision ?? null) : null))
    .catch(() => null)
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, p);
  return p;
}

// A page's data object (its dashboard) is its revision: every reload — after the owner changes an action or
// adds figures — is a new object, so the canonical decision is fetched again for the new business state.
const revisionIds = new WeakMap<object, number>();
let nextRevisionId = 0;
function revisionKey(revision: unknown): string {
  if (revision !== null && typeof revision === "object") {
    let id = revisionIds.get(revision);
    if (id === undefined) {
      id = ++nextRevisionId;
      revisionIds.set(revision, id);
    }
    return `r${id}`;
  }
  return String(revision ?? "");
}

/**
 * The canonical owner decision for a business: `undefined` while loading (or without a business), `null`
 * when it could not be loaded or there is none. `revision` is the page's current data (reloaded after each
 * mutation): a new revision refetches, and until it arrives nothing from the previous state is shown. A
 * response for another business or an older revision is discarded (switch-race protection).
 */
export function useCanonicalOwnerDecision(businessId: string | null | undefined, revision?: unknown): CurrentOwnerDecision | null | undefined {
  const [state, setState] = useState<{ key: string; decision: CurrentOwnerDecision | null } | null>(null);
  const key = businessId ? `${businessId}|${revisionKey(revision)}` : "";
  useEffect(() => {
    if (!businessId) return;
    let live = true;
    fetchCanonicalDecision(businessId, key).then((decision) => {
      if (live) setState({ key, decision });
    });
    return () => {
      live = false;
    };
  }, [businessId, key]);
  return businessId && state?.key === key ? state.decision : undefined;
}

export function DomainMainTargetContext({ domain, businessId, revision }: { domain: string; businessId: string | null | undefined; revision?: unknown }) {
  const decision = useCanonicalOwnerDecision(businessId, revision);
  const primary = decision?.primaryTarget ?? null;
  const shown = primary !== null && primary.domain === domain;
  const ref = useRef<HTMLDivElement | null>(null);
  // The block appears only after the page's data loads, i.e. after the browser has already tried to
  // scroll to the #main-target fragment — scroll to it once it exists.
  useEffect(() => {
    if (shown && typeof window !== "undefined" && window.location.hash === `#${OWNER_MAIN_TARGET_ANCHOR}`) {
      ref.current?.scrollIntoView?.({ block: "start" });
    }
  }, [shown]);
  if (!shown) return null;
  return (
    <div ref={ref} id={OWNER_MAIN_TARGET_ANCHOR} data-testid="domain-main-target" className="rounded-md border-2 border-foreground/10 bg-card p-3 text-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Your overall main target (the same one on Home)</div>
      <div className="mt-1 font-semibold text-foreground">{primary.title}</div>
      {primary.explanation && <p className="mt-0.5 text-xs text-muted-foreground">{primary.explanation}</p>}
    </div>
  );
}

/**
 * A domain's low-data notice, consistent with the canonical decision: when this domain owns the main
 * target or a supporting step, the issue needs attention now and only the numerical score is
 * provisional (domainDataGapNotice); otherwise the domain's own caution stands.
 */
export function DomainDataGapNotice({
  domain,
  domainLabel,
  businessId,
  missing,
  fallback,
  revision,
}: {
  domain: string;
  domainLabel: string;
  businessId: string | null | undefined;
  missing: readonly string[];
  fallback: string;
  /** The page's current data (see useCanonicalOwnerDecision). */
  revision?: unknown;
}) {
  const decision = useCanonicalOwnerDecision(businessId, revision);
  // Nothing is claimed until the canonical decision is known (no flash of "should not be acted on").
  if (decision === undefined) return null;
  const owns = decisionHasActionableStepIn(decision, domain);
  const text = decision === null
    // The decision could not be loaded: a neutral statement true either way.
    ? `Some ${domainLabel} figures are missing${missing.length > 0 ? ` (${missing.join(", ")})` : ""}, so the ${domainLabel} scores are provisional.`
    : domainDataGapNotice(domainLabel, missing, owns, fallback);
  return (
    <div data-testid="domain-data-gap-notice" className={owns ? "rounded-md border border-warning/40 bg-warning/5 p-3 text-sm font-medium" : "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive font-medium"}>
      {text}
    </div>
  );
}
