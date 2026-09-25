"use client";

/**
 * /owner/goals — business goals.
 *
 * A goal belongs to one business (the shared business selector sets which). A goal set before goals
 * were business-scoped is shown as a "Workspace goal" and can be assigned to a business by the
 * owner (the server revises it and creates the business goal — it never guesses the business).
 * Portfolio/group financial goals are not offered: OpsIQ has no consolidated reporting or currency
 * conversion. No workspace or actor IDs are supplied from the client; the business id is explicit.
 */

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the intentional pattern */

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Modal, Input, Select, DetailPageSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { httpResponseErrorFromBody, fieldErrorMap } from "@/lib/operator-safe-errors";
import { useActiveBusiness } from "@/context/active-business-context";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";

type TargetType = "PROFIT" | "REVENUE" | "NET_WORTH" | "MULTIPLE";
type NewTargetType = "REVENUE" | "PROFIT";
type GoalStatus = "ACTIVE" | "ACHIEVED" | "REVISED";

/** Mirrors GoalSummary in src/services/owner-strategy/goal.service.ts (JSON-serialised). */
interface GoalSummary {
  id: string;
  businessId: string | null;
  scope: "business" | "workspace";
  businessName: string | null;
  businessActive: boolean | null;
  targetType: TargetType;
  targetAmount: number;
  targetCurrency: string;
  targetDate: string;
  baselineAmount: number | null;
  status: GoalStatus;
  isOverdue: boolean;
  createdAt: string;
}

/** Mirrors GoalTrajectoryView in src/services/owner-strategy/goal.service.ts (JSON-serialised). */
interface GoalTrajectoryView {
  goal: GoalSummary;
  metricBasis: "revenue" | "net_profit" | "not_measured";
  unavailableReason: string | null;
  dataWindow: { from: string; to: string; periods: number } | null;
  excludedSnapshotCount: number;
  excludedReason: string | null;
  trajectory: {
    projectedMonthsToGoal: number | null;
    currentTrajectoryDate: string | null;
    confidence: string;
    confidenceRationale: string;
    gapToClose: number | null;
    currentValue: number | null;
    percentComplete: number | null;
    onTrack: boolean | null;
  };
}

interface GoalsOverview {
  business: { id: string; name: string; currency: string; isActive: boolean } | null;
  goal: GoalTrajectoryView | null;
  legacyGoal: GoalTrajectoryView | null;
  legacyAttributable: boolean;
  history: GoalSummary[];
}

const TARGET_LABELS: Record<TargetType, string> = {
  PROFIT: "Net profit",
  REVENUE: "Revenue",
  NET_WORTH: "Net worth",
  MULTIPLE: "Business multiple",
};
const NEW_TARGET_TYPES: NewTargetType[] = ["REVENUE", "PROFIT"];
const METRIC_BASIS_LABEL: Record<GoalTrajectoryView["metricBasis"], string> = {
  revenue: "Measured on recorded revenue",
  net_profit: "Measured on recorded net profit",
  not_measured: "Not measured by OpsIQ",
};
const STATUS_VARIANT: Record<GoalStatus, "default-accessible" | "success-accessible" | "warning-accessible"> = {
  ACTIVE: "default-accessible",
  ACHIEVED: "success-accessible",
  REVISED: "warning-accessible",
};
const STATUS_LABEL: Record<GoalStatus, string> = { ACTIVE: "Active", ACHIEVED: "Achieved", REVISED: "Replaced" };
// Verified against TrajectoryConfidence in src/services/owner-strategy/goal-trajectory.service.ts.
const CONFIDENCE_LABEL: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const NOT_AVAILABLE = "Not enough data";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpResponseErrorFromBody(res.status, data);
  return data;
}

function formatCurrency(amount: number | null, currency: string): string {
  if (amount === null || !Number.isFinite(amount)) return NOT_AVAILABLE;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    // A stored code Intl does not recognise must never crash the page.
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function scopeLabel(goal: GoalSummary): string {
  if (goal.scope === "workspace") return "Workspace goal";
  return `Business goal · ${goal.businessName ?? "Unknown business"}${goal.businessActive === false ? " (archived business)" : ""}`;
}

interface CreateForm {
  targetType: NewTargetType | "";
  targetAmount: string;
  targetDate: string;
  baselineAmount: string;
}
const EMPTY_FORM: CreateForm = { targetType: "", targetAmount: "", targetDate: "", baselineAmount: "" };

function GoalCard({ view, testId, children }: { view: GoalTrajectoryView; testId: string; children?: React.ReactNode }) {
  const { goal, trajectory: traj } = view;
  return (
    <div className="rounded-lg border border-border p-6" data-testid={testId}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <span data-testid="goal-scope">
            <Badge variant={goal.scope === "business" ? "default-accessible" : "warning-accessible"}>{scopeLabel(goal)}</Badge>
          </span>
          <p className="text-xs text-muted-foreground mt-3 mb-1">{TARGET_LABELS[goal.targetType]} target</p>
          <p className="text-3xl font-bold">{formatCurrency(goal.targetAmount, goal.targetCurrency)}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Currency: <span className="font-medium text-foreground">{goal.targetCurrency}</span>
            {" · "}Target date: <span className="font-medium text-foreground">{formatDate(goal.targetDate)}</span>
          </p>
          {goal.baselineAmount != null && (
            <p className="text-sm text-muted-foreground">Baseline: {formatCurrency(goal.baselineAmount, goal.targetCurrency)}</p>
          )}
        </div>
        {goal.isOverdue ? (
          <Badge variant="destructive-accessible">Overdue</Badge>
        ) : (
          <Badge variant={STATUS_VARIANT[goal.status]}>{STATUS_LABEL[goal.status]}</Badge>
        )}
      </div>

      <div data-testid="goal-trajectory">
        <h3 className="text-sm font-semibold mb-1">Trajectory</h3>
        <p className="text-xs text-muted-foreground mb-3">{METRIC_BASIS_LABEL[view.metricBasis]}</p>
        {view.unavailableReason ? (
          <p className="text-sm text-muted-foreground" data-testid="goal-unavailable">{view.unavailableReason}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Current value</p>
                <p className="text-lg font-semibold">{formatCurrency(traj.currentValue, goal.targetCurrency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Progress</p>
                <p className="text-lg font-semibold">
                  {traj.percentComplete === null ? NOT_AVAILABLE : `${Math.round(traj.percentComplete)}%`}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">On track</p>
                <p className="text-lg font-semibold">
                  {traj.onTrack === null ? (
                    <Badge variant="default-accessible">Unknown</Badge>
                  ) : (
                    <Badge variant={traj.onTrack ? "success-accessible" : "warning-accessible"}>{traj.onTrack ? "Yes" : "No"}</Badge>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Confidence</p>
                <p className="text-lg font-semibold">{CONFIDENCE_LABEL[traj.confidence] ?? traj.confidence}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Gap to target: {formatCurrency(traj.gapToClose, goal.targetCurrency)}</p>
            {traj.currentTrajectoryDate && (
              <p className="text-sm text-muted-foreground">
                Projected achievement: <span className="font-medium text-foreground">{formatDate(traj.currentTrajectoryDate)}</span>
              </p>
            )}
            {traj.confidence === "LOW" && traj.confidenceRationale && (
              <p className="text-sm text-muted-foreground">Why: {traj.confidenceRationale}</p>
            )}
            {traj.percentComplete !== null && (
              <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, traj.percentComplete))}%` }}
                />
              </div>
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground mt-3" data-testid="goal-data-window">
          {view.dataWindow
            ? `Based on ${view.dataWindow.periods} recorded period${view.dataWindow.periods === 1 ? "" : "s"}, ${formatDate(view.dataWindow.from)} – ${formatDate(view.dataWindow.to)}.`
            : "No recorded results in this goal's currency yet."}
        </p>
        {view.excludedReason && (
          <p className="text-xs text-muted-foreground mt-1" data-testid="goal-excluded">{view.excludedReason}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export default function GoalsPage() {
  const {
    businesses,
    activeBusinessId,
    activeBusiness,
    needsBusinessRecovery,
    setActiveBusinessId,
    loading: contextLoading,
  } = useActiveBusiness();
  const [overview, setOverview] = useState<GoalsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Out-of-order guard: after a quick business switch, a slower response for the previous business
  // must never overwrite the one for the business now selected.
  const requestSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const query = activeBusinessId ? `?businessId=${encodeURIComponent(activeBusinessId)}` : "";
      // The business goal's trajectory comes from the dedicated trajectory endpoint (same
      // service, same business scope); the overview supplies the legacy goal and history.
      const [data, traj] = await Promise.all([
        apiFetch(`/api/owner/goals${query}`) as Promise<GoalsOverview>,
        activeBusinessId
          ? (apiFetch(`/api/owner/goals/trajectory${query}`) as Promise<{ result: GoalTrajectoryView | null }>)
          : Promise.resolve({ result: null }),
      ]);
      if (requestSeq.current !== seq) return;
      setOverview({ ...data, goal: activeBusinessId ? (traj.result ?? data.goal) : data.goal });
    } catch (err) {
      if (requestSeq.current !== seq) return;
      setError(classifyOperatorError(err, { context: "load" }).operatorMessage);
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    if (contextLoading || needsBusinessRecovery) return;
    load();
  }, [load, contextLoading, needsBusinessRecovery]);

  function setField<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    if (!activeBusinessId) return;
    setFormError(null);
    setFieldErrors({});
    if (!form.targetType) { setFieldErrors({ targetType: "Choose Revenue or Net profit" }); setFormError("Goal type is required."); return; }
    if (!form.targetAmount || Number(form.targetAmount) <= 0) { setFieldErrors({ targetAmount: "Enter a positive amount" }); setFormError("Target amount must be positive."); return; }
    if (!form.targetDate) { setFieldErrors({ targetDate: "Target date is required" }); setFormError("Target date is required."); return; }
    if (new Date(form.targetDate).getTime() <= Date.now()) {
      setFieldErrors({ targetDate: "Target date must be in the future" });
      setFormError("Target date must be in the future.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        businessId: activeBusinessId,
        targetType: form.targetType,
        targetAmount: Number(form.targetAmount),
        targetDate: new Date(form.targetDate).toISOString(),
      };
      if (form.baselineAmount) payload.baselineAmount = Number(form.baselineAmount);
      await apiFetch("/api/owner/goals", { method: "POST", body: JSON.stringify(payload) });
      setModalOpen(false);
      await load();
    } catch (err) {
      setFieldErrors(fieldErrorMap(err));
      setFormError(classifyOperatorError(err, { context: "save" }).operatorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssign() {
    if (!activeBusinessId || !overview?.legacyGoal) return;
    setAssignError(null);
    setAssigning(true);
    try {
      await apiFetch("/api/owner/goals/assign", {
        method: "POST",
        body: JSON.stringify({ legacyGoalId: overview.legacyGoal.goal.id, businessId: activeBusinessId, confirm: true }),
      });
      setAssignOpen(false);
      await load();
    } catch (err) {
      setAssignError(classifyOperatorError(err, { context: "save" }).operatorMessage);
    } finally {
      setAssigning(false);
    }
  }

  function openForm() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setFieldErrors({});
    setModalOpen(true);
  }

  const businessName = activeBusiness?.name ?? overview?.business?.name ?? null;
  const businessCurrency = overview?.business?.currency ?? activeBusiness?.currency ?? "";
  const goalView = overview?.goal ?? null;
  const legacyView = overview?.legacyGoal ?? null;
  const replacesLegacy = !!legacyView && !!overview?.legacyAttributable;

  return (
    <PageContainer data-testid="goals-page">
      <div className="mb-4">
        <PageHeader
          title="Goals"
          description="A goal belongs to one business and is measured on that business's own results, in its own currency."
          actions={
            activeBusinessId && !needsBusinessRecovery ? (
              <Button size="sm" onClick={openForm}>
                {goalView ? "Replace goal" : "+ Set goal"}
              </Button>
            ) : undefined
          }
        />
      </div>

      <div className="mb-4 flex flex-col gap-2">
        <BusinessContextSelector businesses={businesses} selectedId={activeBusinessId} onChange={setActiveBusinessId} loading={contextLoading} />
        <p className="text-xs text-muted-foreground" data-testid="goals-consolidation-notice">
          Portfolio or group financial goals aren&apos;t supported yet: OpsIQ doesn&apos;t have consolidated reporting across
          businesses or currency conversion.
        </p>
      </div>

      {needsBusinessRecovery && (
        <p className="text-sm text-muted-foreground" data-testid="goals-choose-business">
          The business you were viewing is no longer available. Choose a business above to see its goal.
        </p>
      )}
      {!contextLoading && !needsBusinessRecovery && businesses.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="goals-no-business">
          Add a business first — goals belong to a business.
        </p>
      )}

      {(loading || contextLoading) && !needsBusinessRecovery && <DetailPageSkeleton label="Loading goals" />}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!loading && !contextLoading && !error && !needsBusinessRecovery && overview && (
        <div className="flex flex-col gap-6">
          {activeBusinessId && goalView && <GoalCard view={goalView} testId="goal-detail" />}
          {activeBusinessId && !goalView && (
            <div className="rounded-lg border border-border p-8 text-center" data-testid="goal-empty">
              <p className="text-muted-foreground text-sm mb-4">No goal set for {businessName ?? "this business"}.</p>
              <Button size="sm" onClick={openForm}>Set a goal for {businessName ?? "this business"}</Button>
            </div>
          )}

          {legacyView && (
            <GoalCard view={legacyView} testId="legacy-goal">
              <p className="text-sm text-muted-foreground mt-4" data-testid="legacy-goal-explainer">
                {overview.legacyAttributable
                  ? "Set before goals belonged to a business. Your workspace has one business, so Home shows this goal for it."
                  : "Set before goals belonged to a business. Your workspace has several businesses, so this goal isn't shown on any business's Home."}
              </p>
              {activeBusinessId && businessName && (
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={() => { setAssignError(null); setAssignOpen(true); }}>
                    Assign to {businessName}
                  </Button>
                </div>
              )}
            </GoalCard>
          )}

          {activeBusinessId && overview.history.length > 0 && (
            <div className="rounded-lg border border-border p-6" data-testid="goal-history">
              <h2 className="text-sm font-semibold mb-3">Earlier goals for {businessName}</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {overview.history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {TARGET_LABELS[h.targetType]} {formatCurrency(h.targetAmount, h.targetCurrency)} by {formatDate(h.targetDate)}
                    </span>
                    <Badge variant={STATUS_VARIANT[h.status]}>{STATUS_LABEL[h.status]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`${goalView ? "Replace" : "Set"} goal for ${businessName ?? "this business"}`}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={submitting}>
              {submitting ? "Saving…" : goalView ? "Replace goal" : "Create goal"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && <p className="text-destructive text-sm">{formError}</p>}
          <p className="text-sm text-muted-foreground" data-testid="goal-form-scope">
            Business: <span className="font-medium text-foreground">{businessName}</span> · Currency:{" "}
            <span className="font-medium text-foreground">{businessCurrency}</span> (the business&apos;s currency)
          </p>
          {(goalView || replacesLegacy) && (
            <p className="text-sm text-muted-foreground rounded bg-muted/50 p-3">
              {goalView ? "The current goal for this business will be kept in its history as Replaced." : ""}
              {replacesLegacy ? " The workspace goal will also be replaced, since this is your only business." : ""}
            </p>
          )}
          <Select
            id="goal-target-type"
            label="Goal type"
            required
            value={form.targetType}
            onChange={(e) => setField("targetType", e.target.value as NewTargetType)}
            options={NEW_TARGET_TYPES.map((t) => ({ value: t, label: TARGET_LABELS[t] }))}
            placeholder="Select goal type"
            error={fieldErrors.targetType}
          />
          <Input
            id="goal-target-amount"
            label={`Target amount (${businessCurrency})`}
            required
            type="number"
            min={0}
            error={fieldErrors.targetAmount}
            value={form.targetAmount}
            onChange={(e) => setField("targetAmount", e.target.value)}
            placeholder="e.g. 500000"
          />
          <Input
            id="goal-target-date"
            label="Target date"
            required
            type="date"
            error={fieldErrors.targetDate}
            value={form.targetDate}
            onChange={(e) => setField("targetDate", e.target.value)}
          />
          <Input
            id="goal-baseline-amount"
            label="Baseline amount (optional)"
            type="number"
            min={0}
            value={form.baselineAmount}
            onChange={(e) => setField("baselineAmount", e.target.value)}
            placeholder="Starting point for trajectory"
          />
        </div>
      </Modal>

      <Modal
        isOpen={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Assign workspace goal to ${businessName ?? "this business"}?`}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setAssignOpen(false)} disabled={assigning}>Cancel</Button>
            <Button size="sm" onClick={handleAssign} disabled={assigning}>{assigning ? "Assigning…" : "Assign goal"}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm" data-testid="assign-confirm">
          {assignError && <p className="text-destructive">{assignError}</p>}
          <p>
            The workspace goal becomes a goal for <span className="font-medium">{businessName}</span>, measured only on that
            business&apos;s results. The workspace goal is kept in history as Replaced.
          </p>
          <p className="text-muted-foreground">Only do this if the goal was meant for {businessName}. OpsIQ won&apos;t choose for you.</p>
        </div>
      </Modal>
    </PageContainer>
  );
}
