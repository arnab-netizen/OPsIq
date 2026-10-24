"use client";

/**
 * /owner/priorities — "What needs my attention?"
 *
 * Renders the ONE canonical owner decision (owner-home service → Spine arbiter,
 * src/domain/owner-spine/owner-decision.ts) exactly as the server resolved it: the main target
 * first, then every other open item in the server's canonical order. This page does NOT rank:
 * the same decision object is what Home (Cockpit) and the Command Center render, so
 * "Priorities #1 == Home primary" holds by construction, not by coincidence.
 *
 * Two further, clearly separated and UNRANKED sections keep nothing hidden:
 *   - Governed work — the process-execution bridge's current governed route (Now View execution
 *     context), with its real status, worked on Home;
 *   - Also on your radar — open risks and unread notifications, grouped by source in each source's
 *     own order. They inform; they never outrank the main target. Anything already in the canonical
 *     order (a critical risk attributable to this business, or a notification about a risk/compliance
 *     breach that is a candidate) is not repeated here.
 *
 * Consulting decisions requiring attention — ONLY for a user with engagement/consulting access
 * (ENGAGEMENT_VIEW, canViewConsultingDecisions): the consultant Decision Inbox's blocked decisions
 * (/api/decisions/list), in their own separately labelled, unnumbered section after the canonical
 * decision, linking to the Decision Inbox. They are never merged into the canonical order. A self-serve
 * owner does not hold that capability, so for them this page never requests them.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { Badge, CardDashboardSkeleton, EmptyState, ErrorState, PageHeader, PageContainer } from "@/ui/primitives";
import { useActiveBusiness } from "@/context/active-business-context";
import { useCapabilities } from "@/context/capabilities-context";
import { canViewConsultingDecisions } from "@/policies/presentation-visibility";
import { OwnerDecisionCard } from "@/components/owner/OwnerDecisionCard";
import { ownerDecisionCandidateIdForEntity, ownerTargetHref, type CurrentOwnerDecision } from "@/domain/owner-spine/owner-decision";

const FETCH_TIMEOUT_MS = 10_000;

async function api(path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type PriorityTier = "critical" | "attention" | "normal";

interface PriorityItem {
  /** Governed-work badge variant: derived from the SAME server status/canStart as its action text,
   *  so the badge and the action text can never contradict each other. */
  statusVariant?: "destructive-accessible" | "warning-accessible" | "muted-accessible" | "default-accessible" | "success-accessible";
}

const TIER_VARIANT: Record<PriorityTier, "destructive-accessible" | "warning-accessible" | "muted-accessible"> = {
  critical: "destructive-accessible",
  attention: "warning-accessible",
  normal: "muted-accessible",
};

const TIER_LABEL: Record<PriorityTier, string> = {
  critical: "Critical",
  attention: "Needs attention",
  normal: "Worth knowing",
};

const TIER_RULE_COLOR: Record<PriorityTier, string> = {
  critical: "var(--destructive)",
  attention: "var(--warning-text)",
  normal: "var(--border)",
};

/** Open, unresolved risk statuses only — a risk already RESOLVED/CLOSED/ACCEPTED isn't a priority. */
const OPEN_RISK_STATUSES = new Set(["IDENTIFIED", "ASSESSED", "MITIGATING"]);

function riskTier(severity: number): PriorityTier {
  if (severity >= 75) return "critical";
  if (severity >= 40) return "attention";
  return "normal";
}

const ALERT_TIER: Record<string, PriorityTier> = {
  critical: "critical",
  high: "critical",
  medium: "attention",
  low: "normal",
};

/** Terminal statuses a completed/rejected bridged task can carry — never a priority once resolved. */
const BRIDGE_TERMINAL_STATUSES = new Set(["COMPLETED", "REJECTED", "OUTCOME_RECORDED", "OUTCOME_DISPUTED", "OUTCOME_VERIFIED"]);

/** "Completed" matches the same status the owner sees for this exact ProcessExecutionTask on
 *  Actions (owner/tasks/page.tsx's OWNER_WORK_STATUS_LABELS) — one governed status, one label,
 *  wherever it's shown. Terminal statuses never actually reach this function today (the item is
 *  filtered out of the merged list above before a badge is ever rendered for it), but the mapping
 *  is complete rather than assuming that filter can never change. */
function bridgeStatusLabel(status: string, canStart: boolean): string {
  if (status === "OUTCOME_DISPUTED") return "Outcome disputed";
  if (BRIDGE_TERMINAL_STATUSES.has(status)) return "Completed";
  // Mirrors the action-text branch above exactly (canStart ? "start this" : "continue"): canStart
  // false on a non-terminal item means IN_PROGRESS (or another in-flight, non-startable status).
  if (!canStart) return "In progress";
  return "Needs attention";
}

function bridgeStatusVariant(status: string, canStart: boolean): PriorityItem["statusVariant"] {
  if (status === "OUTCOME_DISPUTED") return "default-accessible";
  if (BRIDGE_TERMINAL_STATUSES.has(status)) return "success-accessible";
  if (!canStart) return "default-accessible";
  return undefined; // fall through to the normal severity-tier variant
}

interface RadarItem {
  id: string;
  source: "risk" | "alert";
  title: string;
  why: string | null;
  tier: PriorityTier;
  actionLabel: string;
  actionHref: string;
}

interface GovernedWork {
  id: string;
  title: string;
  why: string | null;
  statusLabel: string;
  statusVariant: NonNullable<PriorityItem["statusVariant"]>;
  actionLabel: string;
}

interface ConsultingDecision {
  id: string;
  title: string;
  blockReason: string | null;
}

const RADAR_SOURCE_LABEL: Record<RadarItem["source"], string> = {
  risk: "Open risks",
  alert: "Unread notifications",
};

export default function OwnerPrioritiesPage() {
  const { activeBusinessId, needsBusinessRecovery, businesses } = useActiveBusiness();
  const showConsultingDecisions = canViewConsultingDecisions(useCapabilities());
  const [consultingDecisions, setConsultingDecisions] = useState<ConsultingDecision[]>([]);
  const [decision, setDecision] = useState<CurrentOwnerDecision | null>(null);
  const [governed, setGoverned] = useState<GovernedWork | null>(null);
  const [radar, setRadar] = useState<RadarItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nowViewFailed, setNowViewFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      // Governed work shown beside the canonical decision must belong to the SAME business
      // (the same opt-in business-scoping the Cockpit uses).
      const nowViewQs = activeBusinessId ? `?businessId=${encodeURIComponent(activeBusinessId)}&restrictExecutionToBusiness=true` : "";
      const [risksRes, alertsRes, nowViewRes, decisionsRes] = await Promise.all([
        api("/api/owner/risks"),
        api("/api/owner/alerts?unreadOnly=true&limit=20"),
        api(`/api/owner/now-view${nowViewQs}`),
        // Consulting access only — never requested for a self-serve owner.
        showConsultingDecisions ? api("/api/decisions/list?status=blocked&limit=20") : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (risksRes === null && alertsRes === null && nowViewRes === null) {
        setError("Couldn't load your priorities. Please try again.");
        setLoading(false);
        return;
      }

      setNowViewFailed(nowViewRes === null);
      // The canonical decision — rendered, never re-ranked.
      const decisionRes = (nowViewRes?.ownerDecision as CurrentOwnerDecision | null | undefined) ?? null;
      setDecision(decisionRes);
      const inCanonicalOrder = new Set((decisionRes?.attention ?? []).map((t) => t.candidateId));

      // Governed execution work (Now View context): shown with its real status, never ranked.
      const topRoute = nowViewRes?.processExecution?.topRoute as
        | { taskKey: string; ownerVisibleSummary?: string | null; riskIfIgnored?: string | null; executionRoute: string; status: string; canStart: boolean }
        | null
        | undefined;
      if (topRoute && topRoute.executionRoute !== "MONITOR_ONLY" && !BRIDGE_TERMINAL_STATUSES.has(topRoute.status)) {
        setGoverned({
          id: `priority-${topRoute.taskKey}`,
          title: topRoute.ownerVisibleSummary ?? "Governed work is ready on Home",
          why: topRoute.riskIfIgnored ?? null,
          statusLabel: bridgeStatusLabel(topRoute.status, topRoute.canStart),
          statusVariant: bridgeStatusVariant(topRoute.status, topRoute.canStart) ?? "warning-accessible",
          actionLabel: topRoute.canStart ? "Go to Home to start this" : "In progress — continue on Home",
        });
      } else {
        setGoverned(null);
      }

      // Radar: each source in its own order; sources are never merged into one ranking.
      const items: RadarItem[] = [];
      for (const r of (risksRes?.risks ?? []) as Array<{ id: string; title: string; description?: string | null; severity: number; status: string }>) {
        if (!OPEN_RISK_STATUSES.has(r.status)) continue;
        if (inCanonicalOrder.has(`business_risk:${r.id}`)) continue; // already ranked above
        items.push({ id: `risk-${r.id}`, source: "risk", title: r.title, why: r.description ?? null, tier: riskTier(r.severity), actionLabel: "Review this risk", actionHref: `/owner/risks/${r.id}` });
      }
      for (const a of (alertsRes?.alerts ?? []) as Array<{ id: string; message: string; severity: string; entityType?: string | null; entityId?: string | null }>) {
        const linked = ownerDecisionCandidateIdForEntity(a.entityType, a.entityId);
        if (linked && inCanonicalOrder.has(linked)) continue; // a notification about an item already ranked above
        items.push({ id: `alert-${a.id}`, source: "alert", title: a.message, why: null, tier: ALERT_TIER[a.severity] ?? "attention", actionLabel: "See alert", actionHref: "/owner/alerts" });
      }
      setRadar(items);
      setConsultingDecisions(
        ((decisionsRes?.decisions ?? []) as Array<{ id: string; title: string; blockReason: string | null }>).map((d) => ({
          id: d.id,
          title: d.title,
          blockReason: d.blockReason ?? null,
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBusinessId, showConsultingDecisions]);

  if (loading) return <PageContainer narrow><CardDashboardSkeleton label="Loading your priorities" sections={2} /></PageContainer>;
  if (error) return <PageContainer narrow><ErrorState message={classifyOperatorError(new Error(error), { context: "load" }).operatorMessage} onRetry={() => window.location.reload()} /></PageContainer>;

  const attention = decision?.attention ?? [];
  const radarGroups = (["risk", "alert"] as const)
    .map((source) => ({ source, items: radar.filter((r) => r.source === source) }))
    .filter((g) => g.items.length > 0);

  return (
    <PageContainer narrow className="flex flex-col gap-6" data-testid="owner-priorities">
      <PageHeader title="Priorities" description="Your main target first, then everything else in order." />

      {decision ? (
        <OwnerDecisionCard decision={decision} detail="compact" />
      ) : nowViewFailed ? (
        <EmptyState
          title="Couldn't load your main target"
          description="The rest of this page may still be useful. Refresh to try again."
        />
      ) : needsBusinessRecovery ? (
        // The selected business is unavailable (archived, removed, or never chosen among several): that is
        // not "no main target" — the owner must choose the business first.
        <div data-testid="priorities-business-recovery">
          <EmptyState
            title="Choose which business to look at"
            description="The business selected before is no longer available. Pick a business from the business selector, and its main target will show here."
          />
        </div>
      ) : (businesses ?? []).length === 0 ? (
        <EmptyState
          title="Add your business first"
          description="OpsIQ picks one main target per business. Add your business and its numbers to get one."
        />
      ) : (
        <EmptyState
          title="Couldn't match your main target to this business"
          description="Refresh the page; if this keeps happening, re-select your business from the business selector."
        />
      )}

      {attention.length > 0 && (
        <section data-testid="priorities-attention">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Everything open, in the order to handle it</h2>
          <ol className="flex flex-col gap-5">
            {attention.map((t, i) => (
              <li key={t.candidateId} className="border-l-2 pl-5 py-0.5" style={{ borderColor: i === 0 ? "var(--accent-ink)" : "var(--border)" }} data-testid="priority-item" data-candidate-id={t.candidateId}>
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <span className="font-display text-base font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                  {i === 0 ? <Badge variant="default-accessible">Main target</Badge> : <Badge variant="muted-accessible">{t.domainLabel}</Badge>}
                </div>
                <strong className="mt-1 block font-display text-[1.1rem] font-semibold leading-snug tracking-tight text-foreground">{t.title}</strong>
                <Link href={i === 0 ? ownerTargetHref(t) : t.targetRoute} className="mt-2 inline-block text-sm font-medium text-[var(--primary-text)] underline hover:no-underline">
                  Open {t.domainLabel} →
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {governed && (
        <section data-testid="priorities-governed-work" className="border-t border-border pt-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Governed work</h2>
          <div className="border-l-2 pl-5 py-0.5" style={{ borderColor: "var(--border)" }} data-testid="priority-governed-item">
            <Badge variant={governed.statusVariant}>{governed.statusLabel}</Badge>
            <strong className="mt-1 block text-base font-semibold leading-snug text-foreground">{governed.title}</strong>
            {governed.why && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{governed.why}</p>}
            <Link href="/owner/cockpit" className="mt-2 inline-block text-sm font-medium text-[var(--primary-text)] underline hover:no-underline">
              {governed.actionLabel} →
            </Link>
          </div>
        </section>
      )}

      {radarGroups.length > 0 && (
        <section data-testid="priorities-radar" className="border-t border-border pt-4">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Also on your radar</h2>
          <p className="mb-3 text-xs text-muted-foreground">Listed by source, not ranked above your main target.</p>
          {radarGroups.map((g) => (
            <div key={g.source} className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{RADAR_SOURCE_LABEL[g.source]}</h3>
              <ul className="flex flex-col gap-3">
                {g.items.map((item) => (
                  <li key={item.id} className="border-l-2 pl-4" style={{ borderColor: TIER_RULE_COLOR[item.tier] }} data-testid="priority-radar-item">
                    <Badge variant={TIER_VARIANT[item.tier]}>{TIER_LABEL[item.tier]}</Badge>
                    <span className="mt-1 block text-sm font-medium text-foreground">{item.title}</span>
                    {item.why && <span className="mt-0.5 block text-xs text-muted-foreground">{item.why}</span>}
                    <Link href={item.actionHref} className="mt-1 inline-block text-xs font-medium text-[var(--primary-text)] underline hover:no-underline">
                      {item.actionLabel} →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {showConsultingDecisions && consultingDecisions.length > 0 && (
        <section data-testid="priorities-consulting-decisions" className="border-t border-border pt-4">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Consulting decisions requiring attention</h2>
          <p className="mb-3 text-xs text-muted-foreground">Blocked decisions from your consulting work. They are handled in the Decision Inbox and are not part of the order above.</p>
          <ul className="flex flex-col gap-3">
            {consultingDecisions.map((d) => (
              <li key={d.id} className="border-l-2 pl-4" style={{ borderColor: "var(--border)" }} data-testid="priority-consulting-decision">
                <span className="block text-sm font-medium text-foreground">{d.title}</span>
                {d.blockReason && <span className="mt-0.5 block text-xs text-muted-foreground">{d.blockReason}</span>}
                <Link href="/dashboard/inbox" className="mt-1 inline-block text-xs font-medium text-[var(--primary-text)] underline hover:no-underline">
                  Open the Decision Inbox →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {attention.length === 0 && !governed && radarGroups.length === 0 && consultingDecisions.length === 0 && decision && decision.state !== "TARGET" && (
        <p className="border-t border-border pt-4 text-sm text-muted-foreground">
          Nothing else needs your attention right now. OpsIQ re-checks as your data and work change.
        </p>
      )}
    </PageContainer>
  );
}
