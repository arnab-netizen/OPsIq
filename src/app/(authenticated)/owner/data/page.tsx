"use client";

/**
 * /owner/data — "Add & Connect Data": the single visible owner surface for getting real business
 * information into OpsIQ.
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
import { Badge, Button, Select } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import {
  buildOwnerDataHubView,
  inputTargetForCategory,
  BUSINESS_TYPE_OPTIONS,
  type OwnerDataGroupView,
} from "@/domain/owner-mode/owner-data-hub";
import type { OwnerInputCategory } from "@/domain/owner-mode/input-catalog";

const FETCH_TIMEOUT_MS = 10_000;

interface BusinessLite {
  id: string;
  name: string;
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

const CONFIDENCE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  high: "success",
  medium: "warning",
  low: "destructive",
  none: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  supplied: "Added",
  missing_required: "Needed",
  missing_recommended: "Recommended",
  optional: "Optional",
};

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "muted"> = {
  supplied: "success",
  missing_required: "destructive",
  missing_recommended: "warning",
  optional: "muted",
};

/** Blocking first step: without a business record nothing else on this page can accept data. */
function CreateBusinessPanel({ onCreated }: { onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/owner/recovery/businesses", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          businessType: fd.get("businessType"),
          currency: fd.get("currency"),
          b2cSupported: true,
          b2bSupported: false,
        }),
      });
      onCreated();
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
    <div className="rounded-lg border border-border bg-muted/30 p-6" data-testid="data-hub-create-business">
      <h2 className="text-lg font-semibold text-foreground">Start with your business profile</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        OpsIQ keeps your records against a business. Until you add one, there is nowhere to put your
        revenue, costs or uploads — so this is the first step.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3" aria-label="Create your business profile">
        <label className="flex flex-col gap-1 text-sm text-foreground">
          <span>Business name *</span>
          <input
            name="name"
            required
            data-testid="data-hub-business-name"
            className="w-full rounded-md border border-border p-2 text-sm sm:w-96"
            placeholder="e.g. Harbour Street Bakery"
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select
            name="businessType"
            label="What kind of business is it?"
            required
            options={[...BUSINESS_TYPE_OPTIONS]}
          />
          <Select
            name="currency"
            label="Currency"
            required
            options={[
              { value: "GBP", label: "GBP" },
              { value: "USD", label: "USD" },
              { value: "EUR", label: "EUR" },
              { value: "INR", label: "INR" },
            ]}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save business profile"}
        </Button>
      </form>
    </div>
  );
}

function ReadinessBand({ state }: { state: OnboardingView }) {
  const pct =
    state.minimumRequiredCount > 0
      ? Math.round((state.minimumSuppliedCount / state.minimumRequiredCount) * 100)
      : 0;

  return (
    <div className="rounded-lg border border-border p-5" data-testid="data-hub-readiness">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Your data readiness</h2>
        <Badge variant={CONFIDENCE_VARIANT[state.confidenceBeforeDiagnosis] ?? "muted"}>
          Confidence: {String(state.confidenceBeforeDiagnosis).toUpperCase()}
        </Badge>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {state.minimumSuppliedCount} of {state.minimumRequiredCount} essential items added
        {state.minimumRequiredCount > 0 ? ` (${pct}%)` : ""}.
      </p>

      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Essential data added"
      >
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      {state.canRunFirstDiagnosis ? (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          <p className="font-medium">OpsIQ has enough to run a first assessment.</p>
          <p className="mt-1">
            It will be limited to what you have supplied so far, and it will say so.
          </p>
          <Link href="/diagnosis" className="mt-2 inline-block font-medium underline hover:no-underline">
            Run my first assessment →
          </Link>
        </div>
      ) : (
        <div
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          data-testid="data-hub-insufficient"
        >
          <p className="font-medium">
            OpsIQ does not yet have enough reliable business information to generate a trustworthy
            diagnosis.
          </p>
          <p className="mt-1">Add the items marked “Needed” below and this will unlock.</p>
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
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5" data-testid="data-hub-missing">
      <h2 className="text-lg font-semibold text-foreground">What is missing right now</h2>
      <ul className="mt-3 space-y-4">
        {items.map((item) => {
          const target = inputTargetForCategory(item.category);
          return (
            <li key={item.category} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{item.label}</span>
                <Badge variant={item.severity === "critical" ? "destructive" : "warning"}>
                  {item.severity}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{item.why}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Affects: </span>
                {item.decisionAffected}
              </p>
              <Link
                href={target.href}
                className="mt-2 inline-block text-sm font-medium text-primary underline hover:no-underline"
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
      {groups.map((group) => (
        <section key={group.id} data-testid={`data-hub-group-${group.id}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground">{group.label}</h3>
            <span className="text-sm text-muted-foreground">
              {group.suppliedCount} of {group.totalCount} added
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{group.purpose}</p>
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
                    Effort: {cat.ownerEffort} · Confidence gain: {cat.expectedConfidenceGain}
                  </p>
                </div>
                <Link
                  href={cat.target.href}
                  className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-muted"
                >
                  {cat.status === "supplied" ? "Update" : cat.target.actionLabel}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function OwnerDataHubPage() {
  const [businesses, setBusinesses] = useState<BusinessLite[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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
    setLoading(true);
    setError(null);
    try {
      const res = await api("/api/owner/businesses");
      const list: BusinessLite[] = res.businesses ?? [];
      setBusinesses(list);
      if (list.length > 0) {
        setSelected(list[0].id);
        await loadState(list[0].id);
      }
    } catch (e) {
      const governed = classifyOperatorError(e instanceof Error ? e : new Error(String(e)), {
        context: "load",
      });
      setError(governed.operatorMessage);
      setBusinesses([]);
    } finally {
      setLoading(false);
    }
  }, [loadState]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    if (!state) return [];
    return buildOwnerDataHubView({
      suppliedCategories: state.suppliedCategories ?? [],
      minimumRequired: state.requirements?.minimumRequired ?? [],
      recommended: state.requirements?.recommended ?? [],
    });
  }, [state]);

  const hasBusiness = (businesses?.length ?? 0) > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold text-foreground">Add &amp; Connect Data</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Everything OpsIQ knows about your business starts here. The more real information you add,
          the more specific its findings become — and it will always tell you what is still missing.
        </p>
      </header>

      {loading && <p className="mt-8 text-sm text-muted-foreground">Loading your setup…</p>}

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
          {businesses && businesses.length > 1 && (
            <div className="w-72">
              <Select
                name="businessSelector"
                label="Business"
                value={selected ?? undefined}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  setSelected(e.target.value);
                  void loadState(e.target.value);
                }}
                options={businesses.map((b) => ({ value: b.id, label: b.name }))}
              />
            </div>
          )}

          {state && <ReadinessBand state={state} />}
          <WaysToAdd />
          {state && <MissingCritical items={state.missingMinimum ?? []} />}
          {groups.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-foreground">Everything OpsIQ can use</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                You do not need all of it. Items marked “Needed” are the ones holding back your first
                assessment.
              </p>
              <CategoryGroups groups={groups} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
