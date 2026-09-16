"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, CardDashboardSkeleton } from "@/ui/primitives";

interface SchedulerStatus {
  workspaceId: string;
  pending: number;
  running: number;
  deadLetter: number;
  partialFailure: number;
  lastSuccess: { taskName: string; completedAt: string } | null;
  recentDeadLetters: Array<{
    id: string;
    taskName: string;
    lastError: string | null;
    attempts: number;
    maxAttempts: number;
    updatedAt: string;
  }>;
  recentPartialFailures: Array<{
    id: string;
    taskName: string;
    lastError: string | null;
    updatedAt: string;
  }>;
  nextScheduled: { taskName: string; scheduledFor: string } | null;
  cronCadence: string;
}

async function api(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

// Pure fetch -- no state setters, so it is safe to call from either an effect body or an event
// handler without the effect ever synchronously triggering a state update.
async function fetchSchedulerStatus(): Promise<SchedulerStatus> {
  return api("/api/owner/scheduler-status");
}

function toLoadErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Failed to load automation status";
}

export default function OwnerAutomationPage() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Event-driven reload (Refresh button) -- never called from an effect body, so it is safe to set
  // state synchronously before the fetch settles.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchSchedulerStatus());
    } catch (e) {
      setError(toLoadErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Mount-only fetch. `loading`/`error` already start at their post-mount-fetch-started values
  // (true / null, see useState above), so this effect never sets state synchronously -- it only
  // applies the async result once settled, and only if it is still the current (non-stale) fetch.
  useEffect(() => {
    let cancelled = false;
    fetchSchedulerStatus()
      .then((data) => {
        if (cancelled) return;
        setStatus(data);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(toLoadErrorMessage(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <CardDashboardSkeleton label="Loading automation status" />;

  return (
    <div className="mx-auto max-w-3xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Automation Health</h1>
          <p className="text-muted-foreground text-sm">
            Background task status (email retries, finance-learning reconciliation, and any
            other scheduled work) — so a stalled automation is visible here, not only in logs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => load()}>Refresh</Button>
          <Link href="/owner"><Button>Command Center</Button></Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {status && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{status.pending}</div>
              <div className="text-xs uppercase text-muted-foreground">Pending</div>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{status.running}</div>
              <div className="text-xs uppercase text-muted-foreground">Running</div>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{status.partialFailure}</div>
              <div className="text-xs uppercase text-muted-foreground">Partial failure</div>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{status.deadLetter}</div>
              <div className="text-xs uppercase text-muted-foreground">Dead-letter</div>
            </div>
          </div>

          <div className="border rounded-lg p-4 mb-4 text-sm space-y-1">
            <div>
              <strong>Last successful task:</strong>{" "}
              {status.lastSuccess
                ? `${status.lastSuccess.taskName} — ${new Date(status.lastSuccess.completedAt).toLocaleString()}`
                : "None recorded yet"}
            </div>
            <div>
              <strong>Next scheduled:</strong>{" "}
              {status.nextScheduled
                ? `${status.nextScheduled.taskName} — ${new Date(status.nextScheduled.scheduledFor).toLocaleString()}`
                : "Nothing pending"}
            </div>
            <div className="text-xs text-muted-foreground">{status.cronCadence}</div>
          </div>

          <div className="border rounded-lg p-4 bg-card mb-4">
            <h2 className="font-bold mb-3">Recent partial failures</h2>
            <p className="text-xs text-muted-foreground mb-2">
              These tasks ran and completed, but the work they did reported that
              some of it did not succeed — a completed task here is not the same
              as everything inside it having succeeded.
            </p>
            {status.recentPartialFailures.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No partial failures — every completed task&apos;s own work fully succeeded.
              </p>
            ) : (
              <div className="space-y-2">
                {status.recentPartialFailures.map((t) => (
                  <div key={t.id} className="border-b pb-2 text-sm">
                    <div className="flex items-center justify-between">
                      <strong>{t.taskName}</strong>
                      <Badge variant="warning">partial failure</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.updatedAt).toLocaleString()}
                    </div>
                    {t.lastError && <p className="text-xs mt-1">{t.lastError}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border rounded-lg p-4 bg-card">
            <h2 className="font-bold mb-3">Recent dead-letters</h2>
            {status.recentDeadLetters.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No dead-lettered tasks — automation is keeping up.
              </p>
            ) : (
              <div className="space-y-2">
                {status.recentDeadLetters.map((t) => (
                  <div key={t.id} className="border-b pb-2 text-sm">
                    <div className="flex items-center justify-between">
                      <strong>{t.taskName}</strong>
                      <Badge variant="destructive">
                        {t.attempts}/{t.maxAttempts} attempts
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.updatedAt).toLocaleString()}
                    </div>
                    {t.lastError && <p className="text-xs mt-1">{t.lastError}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
