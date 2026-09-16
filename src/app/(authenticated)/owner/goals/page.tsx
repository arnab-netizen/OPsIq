"use client";

/**
 * /owner/goals — Financial Goal Tracker.
 *
 * Shows the active financial goal with trajectory and milestone tracking.
 * Owners can declare a new goal which archives the previous active goal.
 * No workspace or actor IDs are supplied from the client.
 */

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the intentional pattern */

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Modal, Input, Select, DetailPageSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";

type TargetType = "PROFIT" | "REVENUE" | "NET_WORTH" | "MULTIPLE";
type GoalStatus = "ACTIVE" | "ACHIEVED" | "REVISED";

interface GoalSummary {
  id: string;
  targetType: TargetType;
  targetAmount: number;
  targetCurrency: string;
  targetDate: string;
  baselineAmount: number | null;
  status: GoalStatus;
  createdAt: string;
}

interface TrajectoryPoint {
  period: string;
  actual: number | null;
  projected: number | null;
}

interface GoalTrajectoryResult {
  goal: GoalSummary;
  trajectory: {
    projectedAchievementDate: string | null;
    onTrack: boolean;
    confidence: string;
    points: TrajectoryPoint[];
    gapToTarget: number;
    percentComplete: number;
  };
}

const TARGET_LABELS: Record<TargetType, string> = {
  PROFIT: "Net Profit",
  REVENUE: "Revenue",
  NET_WORTH: "Net Worth",
  MULTIPLE: "Business Multiple",
};

const STATUS_VARIANT: Record<GoalStatus, "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible"> = {
  ACTIVE: "default-accessible",
  ACHIEVED: "success-accessible",
  REVISED: "warning-accessible",
};

const TARGET_TYPES: TargetType[] = ["PROFIT", "REVENUE", "NET_WORTH", "MULTIPLE"];

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

interface CreateForm {
  targetType: TargetType | "";
  targetAmount: string;
  targetCurrency: string;
  targetDate: string;
  baselineAmount: string;
}

const EMPTY_FORM: CreateForm = {
  targetType: "",
  targetAmount: "",
  targetCurrency: "USD",
  targetDate: "",
  baselineAmount: "",
};

export default function GoalsPage() {
  const [goal, setGoal] = useState<GoalSummary | null>(null);
  const [trajectoryResult, setTrajectoryResult] = useState<GoalTrajectoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [goalData, trajectoryData] = await Promise.all([
        apiFetch("/api/owner/goals"),
        apiFetch("/api/owner/goals/trajectory").catch(() => ({ result: null })),
      ]);
      setGoal(goalData.goal ?? null);
      setTrajectoryResult(trajectoryData.result ?? null);
    } catch (err) {
      setError(classifyOperatorError(err, { context: "load" }).operatorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function setField<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    setFormError(null);
    if (!form.targetType) { setFormError("Target type is required."); return; }
    if (!form.targetAmount || Number(form.targetAmount) <= 0) { setFormError("Target amount must be positive."); return; }
    if (!form.targetDate) { setFormError("Target date is required."); return; }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        targetType: form.targetType,
        targetAmount: Number(form.targetAmount),
        targetCurrency: form.targetCurrency || "USD",
        targetDate: new Date(form.targetDate).toISOString(),
      };
      if (form.baselineAmount) payload.baselineAmount = Number(form.baselineAmount);

      await apiFetch("/api/owner/goals", { method: "POST", body: JSON.stringify(payload) });
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(classifyOperatorError(err, { context: "save" }).operatorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  const traj = trajectoryResult?.trajectory;

  return (
    <PageContainer data-testid="goals-page">
      <div className="mb-6">
        <PageHeader
          title="Financial Goal"
          actions={
            <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setFormError(null); setModalOpen(true); }}>
              {goal ? "Update Goal" : "+ Set Goal"}
            </Button>
          }
        />
      </div>

      {loading && <DetailPageSkeleton label="Loading financial goal" />}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!loading && !error && !goal && (
        <div className="rounded-lg border border-border p-8 text-center">
          <p className="text-muted-foreground text-sm mb-4">No financial goal set yet.</p>
          <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setFormError(null); setModalOpen(true); }}>
            Set your first goal
          </Button>
        </div>
      )}

      {!loading && !error && goal && (
        <div className="flex flex-col gap-6" data-testid="goal-detail">
          {/* Goal summary card */}
          <div className="rounded-lg border border-border p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{TARGET_LABELS[goal.targetType]}</p>
                <p className="text-3xl font-bold">
                  {formatCurrency(goal.targetAmount, goal.targetCurrency)}
                </p>
                {goal.baselineAmount != null && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Baseline: {formatCurrency(goal.baselineAmount, goal.targetCurrency)}
                  </p>
                )}
              </div>
              <Badge variant={STATUS_VARIANT[goal.status]}>{goal.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Target date: <span className="font-medium text-foreground">{formatDate(goal.targetDate)}</span>
            </p>
          </div>

          {/* Trajectory card */}
          {traj && (
            <div className="rounded-lg border border-border p-6" data-testid="goal-trajectory">
              <h2 className="text-sm font-semibold mb-4">Trajectory</h2>
              <div className="grid grid-cols-2 gap-4 mb-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Progress</p>
                  <p className="text-lg font-semibold">{Math.round(traj.percentComplete)}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Gap to target</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(traj.gapToTarget, goal.targetCurrency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">On track</p>
                  <p className="text-lg font-semibold">
                    <Badge variant={traj.onTrack ? "success-accessible" : "warning-accessible"}>
                      {traj.onTrack ? "Yes" : "No"}
                    </Badge>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Confidence</p>
                  <p className="text-lg font-semibold capitalize">{traj.confidence}</p>
                </div>
              </div>
              {traj.projectedAchievementDate && (
                <p className="text-sm text-muted-foreground">
                  Projected achievement:{" "}
                  <span className="font-medium text-foreground">
                    {formatDate(traj.projectedAchievementDate)}
                  </span>
                </p>
              )}
              {/* Progress bar */}
              <div className="mt-4">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, traj.percentComplete))}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Update Goal Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={goal ? "Update Financial Goal" : "Set Financial Goal"}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={submitting}>
              {submitting ? "Saving…" : goal ? "Set new goal" : "Create goal"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && <p className="text-destructive text-sm">{formError}</p>}
          {goal && (
            <p className="text-sm text-muted-foreground rounded bg-muted/50 p-3">
              Setting a new goal will archive the current goal as Revised.
            </p>
          )}
          <div>
            <label htmlFor="goal-target-type" className="block text-sm font-medium mb-1">
              Goal type <span className="text-destructive">*</span>
            </label>
            <Select
              id="goal-target-type"
              value={form.targetType}
              onChange={(e) => setField("targetType", e.target.value as TargetType)}
              options={TARGET_TYPES.map((t) => ({ value: t, label: TARGET_LABELS[t] }))}
              placeholder="Select goal type"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="goal-target-amount" className="block text-sm font-medium mb-1">
                Target amount <span className="text-destructive">*</span>
              </label>
              <Input
                id="goal-target-amount"
                type="number"
                min={0}
                value={form.targetAmount}
                onChange={(e) => setField("targetAmount", e.target.value)}
                placeholder="e.g. 500000"
              />
            </div>
            <div>
              <label htmlFor="goal-target-currency" className="block text-sm font-medium mb-1">Currency</label>
              <Input
                id="goal-target-currency"
                value={form.targetCurrency}
                onChange={(e) => setField("targetCurrency", e.target.value.toUpperCase().slice(0, 3))}
                placeholder="USD"
                maxLength={3}
              />
            </div>
          </div>
          <div>
            <label htmlFor="goal-target-date" className="block text-sm font-medium mb-1">
              Target date <span className="text-destructive">*</span>
            </label>
            <Input
              id="goal-target-date"
              type="date"
              value={form.targetDate}
              onChange={(e) => setField("targetDate", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="goal-baseline-amount" className="block text-sm font-medium mb-1">Baseline amount (optional)</label>
            <Input
              id="goal-baseline-amount"
              type="number"
              min={0}
              value={form.baselineAmount}
              onChange={(e) => setField("baselineAmount", e.target.value)}
              placeholder="Starting point for trajectory"
            />
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
