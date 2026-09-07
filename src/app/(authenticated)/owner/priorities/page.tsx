"use client";

/**
 * /owner/priorities — "What needs my attention?"
 *
 * A lay owner should not have to understand that risks, alerts, and the decision inbox are three
 * separate internal systems (src/services/owner-mode/business-risk.service.ts,
 * src/services/alerts/alert-service.ts, and the OperatorItem table read directly by
 * /api/decisions/list) to find out what needs their attention today. This page reads all three
 * existing, already-governed GET endpoints and merges them into one plain-language list — no new
 * business logic, no new severity computation: every severity/status shown here is the same value
 * the owner would see on /owner/risks, /owner/alerts, or /dashboard/inbox, just translated to
 * plain language and ranked together instead of split across three unrelated pages.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, CardDashboardSkeleton, EmptyState, ErrorState } from "@/ui/primitives";

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
  id: string;
  source: "risk" | "alert" | "decision";
  title: string;
  why: string | null;
  tier: PriorityTier;
  actionLabel: string;
  actionHref: string;
  detailHref: string;
}

const TIER_VARIANT: Record<PriorityTier, "destructive" | "warning" | "muted"> = {
  critical: "destructive",
  attention: "warning",
  normal: "muted",
};

const TIER_LABEL: Record<PriorityTier, string> = {
  critical: "Critical",
  attention: "Needs attention",
  normal: "Worth knowing",
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

function decisionTier(status: string): PriorityTier {
  return status === "blocked" ? "critical" : "attention";
}

export default function OwnerPrioritiesPage() {
  const [items, setItems] = useState<PriorityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const [risksRes, alertsRes, decisionsRes] = await Promise.all([
        api("/api/owner/risks"),
        api("/api/owner/alerts?unreadOnly=true&limit=20"),
        api("/api/decisions/list?status=blocked&limit=20"),
      ]);
      if (cancelled) return;
      if (risksRes === null && alertsRes === null && decisionsRes === null) {
        setError("Couldn't load your priorities. Please try again.");
        setLoading(false);
        return;
      }

      const merged: PriorityItem[] = [];

      for (const r of (risksRes?.risks ?? []) as Array<{ id: string; title: string; description: string | null; severity: number; status: string }>) {
        if (!OPEN_RISK_STATUSES.has(r.status)) continue;
        merged.push({
          id: `risk-${r.id}`,
          source: "risk",
          title: r.title,
          why: r.description,
          tier: riskTier(r.severity),
          actionLabel: "Review this risk",
          actionHref: "/owner/risks",
          detailHref: "/owner/risks",
        });
      }

      for (const a of (alertsRes?.alerts ?? alertsRes ?? []) as Array<{ id: string; message: string; severity: string }>) {
        merged.push({
          id: `alert-${a.id}`,
          source: "alert",
          title: a.message,
          why: null,
          tier: ALERT_TIER[a.severity] ?? "attention",
          actionLabel: "Open alert",
          actionHref: "/owner/alerts",
          detailHref: "/owner/alerts",
        });
      }

      for (const d of (decisionsRes?.decisions ?? decisionsRes ?? []) as Array<{ id: string; title: string; blockReason: string | null; status: string }>) {
        merged.push({
          id: `decision-${d.id}`,
          source: "decision",
          title: d.title,
          why: d.blockReason,
          tier: decisionTier(d.status),
          actionLabel: "Check this decision",
          actionHref: "/dashboard/inbox",
          detailHref: "/dashboard/inbox",
        });
      }

      const rank: Record<PriorityTier, number> = { critical: 0, attention: 1, normal: 2 };
      merged.sort((a, b) => rank[a.tier] - rank[b.tier]);

      setItems(merged);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <main className="p-6"><CardDashboardSkeleton label="Loading your priorities" sections={2} /></main>;
  if (error) return <main className="p-6"><ErrorState message={error} onRetry={() => window.location.reload()} /></main>;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6" data-testid="owner-priorities">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Priorities</h1>
        <p className="mt-1 text-sm text-muted-foreground">What needs your attention, in one place.</p>
      </div>

      {items && items.length === 0 ? (
        <EmptyState
          title="Nothing needs your attention right now"
          description="OpsIQ checks your risks, alerts, and blocked decisions continuously. This stays empty until something real needs you."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items?.map((item) => (
            <li key={item.id} className="rounded-md border border-border bg-card p-4" data-testid="priority-item">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <strong className="text-sm font-semibold text-foreground">{item.title}</strong>
                <Badge variant={TIER_VARIANT[item.tier]}>{TIER_LABEL[item.tier]}</Badge>
              </div>
              {item.why && <p className="mt-1 text-sm text-muted-foreground">{item.why}</p>}
              <Link
                href={item.actionHref}
                className="mt-2 inline-block text-sm font-medium text-[var(--primary-text)] underline hover:no-underline"
              >
                {item.actionLabel} →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
