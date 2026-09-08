"use client";

/**
 * /owner/data — "My Business": the single visible owner surface for telling OpsIQ about your
 * business and keeping its information current. (Formerly labeled "Add & Connect Data" — renamed
 * so a fresh owner has exactly one "My Business" concept, not two.)
 *
 * This page adds NO backend capability. It composes existing, already-governed surfaces:
 *   - GET /api/owner/businesses            (business list)
 *   - GET /api/owner/onboarding            (real setup steps, missing minimums, honest confidence,
 *                                           and the first-diagnosis gate — all from persisted rows)
 *   - POST /api/owner/recovery/businesses  (existing governed business creation)
 *   - /owner/manual-entry and /owner/intake (existing governed intake surfaces)
 *
 * Presentation logic lives in the pure domain module `@/domain/owner-mode/owner-data-hub`. No
 * completeness value is invented here and no confidence is recomputed — both are read from the
 * onboarding contract.
 */
/* eslint-disable react-hooks/set-state-in-effect -- load() fetch-on-mount is the established owner-page pattern */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Select, CardDashboardSkeleton } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { CreateBusinessPanel } from "@/components/owner/CreateBusinessPanel";
import { PlanNewBusinessLink } from "@/components/owner/PlanNewBusinessLink";
import { useActiveBusiness } from "@/context/active-business-context";
import {
  buildOwnerDataHubView,
  inputTargetForCategory,
  BUSINESS_TYPE_OPTIONS,
  type OwnerDataGroupView,
} from "@/domain/owner-mode/owner-data-hub";
import type { OwnerInputCategory } from "@/domain/owner-mode/input-catalog";
import { confidenceDisplayPhrase } from "@/domain/owner-mode/owner-onboarding";

const FETCH_TIMEOUT_MS = 10_000;

interface BusinessLite {
  id: string;
  name: string;
  businessType?: string;
  currency?: string;
}

interface MissingMinimumView {
  category: OwnerInputCategory;
  label: string;
  severity: "critical" | "high" | "medium";
  why: string;
  decisionAffected: string;
}

interface OnboardingView {
  businessName: string;
  suppliedCategories: OwnerInputCategory[];
  requirements: {
    minimumRequired: OwnerInputCategory[];
    recommended: OwnerInputCategory[];
    optional: OwnerInputCategory[];
  };
  missingMinimum: MissingMinimumView[];
  minimumSuppliedCount: number;
  minimumRequiredCount: number;
  minimumComplete: boolean;
  confidenceBeforeDiagnosis: string;
  canRunFirstDiagnosis: boolean;
  firstAction: string;
  whatNotToDo: string[];
  nextBestUpload: OwnerInputCategory | null;
  found: boolean;
}

async function api(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("That took too long. Check your connection and try again.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Data completeness is not a danger signal -- "destructive" red is reserved for the separate
// "What is missing right now" list. Never paint this badge red: an owner who is 80% of the way
// to their first assessment (canRunFirstDiagnosis) should not see an alarm-red badge fighting
// the green "ready" box right below it.
const CONFIDENCE_VARIANT: Record<string, "success-accessible" | "warning-accessible" | "destructive" | "muted-accessible"> = {
  high: "success-accessible",
  medium: "warning-accessible",
  low: "muted-accessible",
  none: "muted-accessible",
};

const STATUS_LABEL: Record<string, string> = {
  supplied: "Added",
  missing_required: "Needed",
  missing_recommended: "Recommended",
  optional: "Optional",
};

const STATUS_VARIANT: Record<string, "success-accessible" | "destructive-accessible" | "warning-accessible" | "muted-accessible"> = {
  supplied: "success-accessible",
  missing_required: "destructive-accessible",
  missing_recommended: "warning-accessible",
  optional: "muted-accessible",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Urgent",
  high: "Important",
  medium: "Worth doing",
};

const EFFORT_LABEL: Record<string, string> = {
  low: "Quick to add",
  medium: "Takes a few minutes",
  high: "Takes some time",
};

const CONFIDENCE_GAIN_LABEL: Record<string, string> = {
  high: "Makes a big difference",
  medium: "Helps a fair amount",
  low: "Helps a little",
};

/**
 * Lets the owner change an existing business's type through the existing governed PATCH endpoint
 * (`PATCH /api/owner/recovery/businesses/[businessId]`, `updateBusiness`). No second update path —
 * this only ever sends `{ businessType }`, the same shape the DB-backed archetype tests exercise.
 */
function BusinessTypeEditor({ business, onUpdated }: { business: BusinessLite; onUpdated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === business.businessType) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api(`/api/owner/recovery/businesses/${business.id}`, {
        method: "PATCH",
        body: JSON.stringify({ businessType: value }),
      });
      setSaved(true);
      onUpdated();
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), {
        context: "save",
      });
      setError(governed.operatorMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-72" data-testid="data-hub-business-type-editor">
      <Select
        name="businessType"
        label="Business type"
        value={business.businessType ?? ""}
        onChange={handleChange}
        disabled={busy}
        options={[...BUSINESS_TYPE_OPTIONS]}
      />
      {busy && <p className="mt-1 text-xs text-muted-foreground">Saving…</p>}
      {saved && !busy && !error && (
        <p className="mt-1 text-xs text-green-700" role="status">
          Saved.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** What OpsIQ knows so far: the confidence badge and essential-items progress. */
function ReadinessSummary({ state }: { state: OnboardingView }) {
  const pct =
    state.minimumRequiredCount > 0
      ? Math.round((state.minimumSuppliedCount / state.minimumRequiredCount) * 100)
      : 0;

  return (
    <div data-testid="data-hub-readiness">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">How well OpsIQ knows your business</h2>
        <Badge variant={CONFIDENCE_VARIANT[state.confidenceBeforeDiagnosis] ?? "muted-accessible"}>
          {confidenceDisplayPhrase(state.confidenceBeforeDiagnosis)}
        </Badge>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {state.minimumSuppliedCount} of {state.minimumRequiredCount} starter items added
        {state.minimumRequiredCount > 0 ? ` (${pct}% of the starter minimum)` : ""}.
      </p>

      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Starter items added"
      >
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      {pct >= 100 && (
        <p className="mt-2 text-sm text-muted-foreground">
          OpsIQ can give you a first read now. Add Money, Customers and Operations information to
          make the advice more reliable.
        </p>
      )}
    </div>
  );
}

/** The one thing to do next, given what OpsIQ knows and what is still missing. */
function NextAction({ state }: { state: OnboardingView }) {
  return (
    <div className="border-t border-border pt-5" data-testid="data-hub-next-action">
      <h2 className="text-lg font-semibold text-foreground">What to do next</h2>

      {state.canRunFirstDiagnosis ? (
        <div
          className="mt-3 border-l-2 pl-4 py-0.5 text-sm text-foreground"
          style={{ borderColor: "var(--success-text)" }}
        >
          <p className="font-medium">OpsIQ has enough to run a first assessment.</p>
          <p className="mt-1 text-muted-foreground">
            It will be limited to what you have supplied so far, and it will say so.
          </p>
          {/*
            F2: this page is owner-only (nav-gated, requiresOwner), and a self-serve owner never
            holds CAPABILITIES.ENGAGEMENT_CREATE (the consultant/admin-only capability
            `POST /api/diagnosis` requires — see policies/capability-check.ts's
            INTERNAL_ONLY_CAPABILITIES). Linking to /diagnosis here always 403s. /owner/finance's
            "+ Add financial snapshot" -> "Run finance diagnosis" is the real, working owner
            first-diagnosis flow.
          */}
          <Link href="/owner/finance" className="mt-2 inline-block font-medium underline hover:no-underline">
            Run my first assessment →
          </Link>
        </div>
      ) : (
        <div
          className="mt-3 border-l-2 pl-4 py-0.5 text-sm text-foreground"
          style={{ borderColor: "var(--warning-text)" }}
          data-testid="data-hub-insufficient"
        >
          <p className="font-medium">
            OpsIQ does not yet have enough reliable business information for a trustworthy first
            assessment.
          </p>
          <p className="mt-1 text-muted-foreground">Add the items marked “Needed” above and this will unlock.</p>
        </div>
      )}

      {state.firstAction && (
        <p className="mt-3 text-sm text-foreground">
          <span className="font-medium">Do this next: </span>
          {state.firstAction}
        </p>
      )}

      {state.whatNotToDo.length > 0 && (
        <div className="mt-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Hold off on this until the data is in:</p>
          <ul className="mt-1 list-disc pl-5">
            {state.whatNotToDo.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Only rendered once a business exists — every card here is always actionable. */
function WaysToAdd() {
  const cards = [
    {
      href: "/owner/manual-entry",
      title: "Enter data yourself",
      body: "Short forms for revenue, costs, staff and customers. Works on a phone.",
      available: true,
    },
    {
      href: "/owner/intake",
      title: "Upload a spreadsheet or CSV",
      body: "We validate every row and show the errors. Nothing counts until you confirm it.",
      available: true,
    },
    {
      href: "/owner/intake",
      title: "Upload documents",
      body: "Invoices, statements and supplier paperwork go through the same review and confirm step.",
      available: true,
    },
    {
      href: "/owner/onboarding",
      title: "Guided setup",
      body: "Step-by-step: what OpsIQ needs, in order, with your progress saved.",
      available: true,
    },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">Ways to add data</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="block rounded-lg border border-border p-4 transition-colors hover:border-primary hover:bg-muted/40"
          >
            <p className="font-medium text-foreground">{card.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{card.body}</p>
          </Link>
        ))}
        <div className="rounded-lg border border-dashed border-border p-4" data-testid="data-hub-integrations">
          <p className="font-medium text-muted-foreground">Connect accounting, banking or POS</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Not available yet. Use manual entry or upload for now — we will tell you here when
            connections are ready.
          </p>
        </div>
      </div>
    </div>
  );
}

function MissingCritical({ items }: { items: MissingMinimumView[] }) {
  if (items.length === 0) return null;
  return (
    <div
      className="border-l-2 pl-5 py-1"
      style={{ borderColor: "var(--destructive)" }}
      data-testid="data-hub-missing"
    >
      <h2 className="text-lg font-semibold text-foreground">What is missing right now</h2>
      <ul className="mt-3 space-y-4">
        {items.map((item) => {
          const target = inputTargetForCategory(item.category);
          return (
            <li key={item.category} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{item.label}</span>
                <Badge variant={item.severity === "critical" ? "destructive-accessible" : "warning-accessible"}>
                  {SEVERITY_LABEL[item.severity] ?? item.severity}
                </Badge>
              </div>
              {/* Kept on the accessible token even though this container no longer carries a
                  tinted background (was needed against the old bg-destructive/5 fill, axe-verified
                  below 4.5:1) -- it still passes comfortably on the plain background, and matching
                  the badge above keeps one severity color per item instead of two. */}
              <p className="mt-1 text-sm text-[var(--muted-foreground-accessible)]">{item.why}</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground-accessible)]">
                <span className="font-medium text-foreground">Affects: </span>
                {item.decisionAffected}
              </p>
              <Link
                href={target.href}
                className="mt-2 inline-block text-sm font-medium text-[var(--primary-text)] underline hover:no-underline"
              >
                {target.actionLabel} {item.label.toLowerCase()} →
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CategoryGroups({ groups }: { groups: OwnerDataGroupView[] }) {
  return (
    <div className="space-y-6">
      {groups.map((group) => {
        // Open by default only when this category still has a required item outstanding --
        // an owner who already finished a category (or never needed to look at it) shouldn't
        // have its full item-by-item breakdown competing for space by default. Progressive
        // disclosure per the redesign's target My Business hierarchy: identity, what's known,
        // what's missing, and next action stay up front; the full per-field breakdown behind
        // each category is the deepest, most-detail tier, one click away.
        const hasOutstanding = group.categories.some((c) => c.status === "missing_required");
        return (
        <details key={group.id} data-testid={`data-hub-group-${group.id}`} open={hasOutstanding} className="group">
          <summary className="flex flex-wrap cursor-pointer list-none items-baseline justify-between gap-2 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5 text-base font-semibold text-foreground">
              <span className="inline-block text-muted-foreground transition-transform group-open:rotate-90">&#9656;</span>
              {group.label}
            </span>
            <span className="text-sm text-muted-foreground">
              {group.suppliedCount} of {group.totalCount} added
            </span>
          </summary>
          <p className="ml-4 text-sm text-muted-foreground">{group.purpose}</p>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {group.categories.map((cat) => (
              <li key={cat.category} className="flex flex-wrap items-start justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{cat.label}</span>
                    <Badge variant={STATUS_VARIANT[cat.status]}>{STATUS_LABEL[cat.status]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{cat.why}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Affects: </span>
                    {cat.decisionAffected}
                  </p>
                  {cat.status !== "supplied" && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Without it: </span>
                      {cat.recommendationAtRiskIfMissing}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {EFFORT_LABEL[cat.ownerEffort] ?? cat.ownerEffort} ·{" "}
                    {CONFIDENCE_GAIN_LABEL[cat.expectedConfidenceGain] ?? cat.expectedConfidenceGain}
                  </p>
                </div>
                <Link
                  href={cat.target.href}
                  className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-sm font-medium text-[var(--primary-text)] hover:bg-muted"
                >
                  {cat.status === "supplied" ? "Update" : cat.target.actionLabel}
                </Link>
              </li>
            ))}
          </ul>
        </details>
        );
      })}
    </div>
  );
}

export default function OwnerDataHubPage() {
  // My Business is where the owner actually picks their active business — this used to keep
  // that choice only in a same-page ref (survived an in-page edit-triggered reload, but not
  // navigating to Money/Customers/Operations, which each independently re-derived their own
  // default). The shared context is now the single source of truth for both the business list
  // and which one is active, so a selection made here is what every other owner page sees too.
  const { businesses, activeBusinessId, setActiveBusinessId, refreshBusinesses, loading: businessesLoading } = useActiveBusiness();
  const selected = activeBusinessId;
  const [state, setState] = useState<OnboardingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async (businessId: string) => {
    try {
      setState((await api(`/api/owner/onboarding?businessId=${encodeURIComponent(businessId)}`)) as OnboardingView);
    } catch (e) {
      const governed = classifyOperatorError(e instanceof Error ? e : new Error(String(e)), {
        context: "load",
      });
      setError(governed.operatorMessage);
      setState(null);
    }
  }, []);

  const load = useCallback(async () => {
    await refreshBusinesses();
  }, [refreshBusinesses]);

  useEffect(() => {
    if (businessesLoading) return;
    setLoading(true);
    setError(null);
    if (!activeBusinessId) {
      setLoading(false);
      return;
    }
    void loadState(activeBusinessId).finally(() => setLoading(false));
  }, [businessesLoading, activeBusinessId, loadState]);

  const groups = useMemo(() => {
    if (!state) return [];
    return buildOwnerDataHubView({
      suppliedCategories: state.suppliedCategories ?? [],
      minimumRequired: state.requirements?.minimumRequired ?? [],
      recommended: state.requirements?.recommended ?? [],
    });
  }, [state]);

  const selectedBusiness = useMemo(
    () => businesses.find((b) => b.id === selected) ?? null,
    [businesses, selected],
  );

  const hasBusiness = businesses.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header>
        <h1 className="font-display text-[2rem] font-semibold tracking-tight text-foreground">My Business</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This is where you tell OpsIQ about your business and keep its information up to date.
          The more real information you add, the more specific its findings become — and it will
          always tell you what is still missing.
        </p>
      </header>

      {loading && <div className="mt-8"><CardDashboardSkeleton sections={4} label="Loading your setup" /></div>}

      {!loading && error && (
        <p role="alert" className="mt-6 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && !hasBusiness && (
        <div className="mt-6">
          <CreateBusinessPanel onCreated={load} />
        </div>
      )}

      {!loading && hasBusiness && (
        <div className="mt-6 space-y-8">
          <div className="flex flex-wrap gap-4">
            <BusinessContextSelector
              businesses={businesses}
              selectedId={selected}
              onChange={(businessId) => setActiveBusinessId(businessId)}
            />
            {selectedBusiness && (
              <BusinessTypeEditor
                business={selectedBusiness}
                onUpdated={() => {
                  void load();
                }}
              />
            )}
          </div>

          {state && <ReadinessSummary state={state} />}
          {state && <MissingCritical items={state.missingMinimum ?? []} />}
          {state && <NextAction state={state} />}
          <WaysToAdd />

          <div className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold text-foreground">Everything OpsIQ can use</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You do not need all of it. Items marked “Needed” are the ones holding back your first
              assessment.
            </p>
            {groups.length > 0 && (
              <div className="mt-4">
                <CategoryGroups groups={groups} />
              </div>
            )}
            <h3 className="mt-6 text-sm font-semibold text-foreground">Go further into one area</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Full pages for money, customers, operations and the rest of your business.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <Link href="/owner/finance" className="text-primary underline-offset-2 hover:underline">Money</Link>
              <Link href="/owner/customers" className="text-primary underline-offset-2 hover:underline">Customers</Link>
              <Link href="/owner/operations" className="text-primary underline-offset-2 hover:underline">Operations</Link>
              <Link href="/owner/inventory" className="text-primary underline-offset-2 hover:underline">Inventory</Link>
              <Link href="/owner/procurement" className="text-primary underline-offset-2 hover:underline">Procurement</Link>
              <Link href="/owner/vendor" className="text-primary underline-offset-2 hover:underline">Vendors</Link>
              <Link href="/owner/goals" className="text-primary underline-offset-2 hover:underline">Goals</Link>
              <Link href="/owner/risks" className="text-primary underline-offset-2 hover:underline">Risk</Link>
              <Link href="/owner/compliance" className="text-primary underline-offset-2 hover:underline">Compliance</Link>
            </div>
          </div>
        </div>
      )}
      <div className="mt-8 border-t border-border pt-4">
        <PlanNewBusinessLink />
      </div>
    </div>
  );
}
