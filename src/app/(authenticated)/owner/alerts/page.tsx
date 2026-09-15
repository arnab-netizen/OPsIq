"use client";

/**
 * /owner/alerts — owner alert inbox with full lifecycle management.
 *
 * Workspace-scoped. All mutations go through server-authoritative routes;
 * no workspace IDs or actor IDs are supplied from the client.
 *
 * Supports: list, unreadOnly filter, severity filter, acknowledge (mark as read),
 * resolve, and pagination via the limit param.
 */

/* eslint-disable react-hooks/set-state-in-effect -- load() on mount is the intentional fetch-on-mount pattern */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, TableListSkeleton } from "@/ui/primitives";

type AlertSeverity = "low" | "medium" | "high" | "critical";
type AlertType = "blocked" | "threshold_breach" | "execution_failure";

interface Alert {
  id: string;
  type: AlertType;
  message: string;
  severity: AlertSeverity;
  isRead: boolean;
  readAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  entityType: string | null;
  entityId: string | null;
}

const SEVERITY_VARIANT: Record<AlertSeverity, "success" | "default" | "warning" | "destructive"> = {
  critical: "destructive",
  high: "destructive",
  medium: "warning",
  low: "default",
};

const TYPE_LABEL: Record<AlertType, string> = {
  blocked: "Blocked",
  threshold_breach: "Threshold breach",
  execution_failure: "Execution failure",
};

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

async function apiFetch(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

async function apiPatch(path: string) {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function AlertCard({
  alert,
  onRead,
  onResolve,
  busy,
}: {
  alert: Alert;
  onRead: (id: string) => void;
  onResolve: (id: string) => void;
  busy: boolean;
}) {
  const isResolved = !!alert.resolvedAt;
  const isRead = alert.isRead;

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        isResolved
          ? "border-border bg-muted/30 opacity-70"
          : !isRead
          ? "border-foreground/20 bg-card shadow-sm"
          : "border-border bg-card"
      }`}
      data-testid="alert-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge variant={SEVERITY_VARIANT[alert.severity]}>{SEVERITY_LABEL[alert.severity]}</Badge>
            <span className="text-xs text-muted-foreground">{TYPE_LABEL[alert.type] ?? alert.type}</span>
            {!isRead && !isResolved && (
              <Badge variant="default" className="text-xs">unread</Badge>
            )}
            {isResolved && <Badge variant="muted" className="text-xs">resolved</Badge>}
          </div>
          <p className="text-sm font-medium break-words">{alert.message}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(alert.createdAt).toLocaleString()}
            {alert.readAt && ` · read ${new Date(alert.readAt).toLocaleString()}`}
            {alert.resolvedAt && ` · resolved ${new Date(alert.resolvedAt).toLocaleString()}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {!isRead && !isResolved && (
            <Button
              className="min-h-[44px] text-xs px-3 py-1"
              disabled={busy}
              onClick={() => onRead(alert.id)}
            >
              Acknowledge
            </Button>
          )}
          {!isResolved && (
            <Button
              className="min-h-[44px] text-xs px-3 py-1"
              disabled={busy}
              onClick={() => onResolve(alert.id)}
            >
              Resolve
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OwnerAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Filters
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [severity, setSeverity] = useState<"" | AlertSeverity>("");
  const [limit] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (unreadOnly) params.set("unreadOnly", "true");
      if (severity) params.set("severity", severity);
      params.set("limit", String(limit));
      const data = await apiFetch(`/api/owner/alerts?${params.toString()}`);
      setAlerts(Array.isArray(data.alerts) ? (data.alerts as Alert[]) : []);
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [unreadOnly, severity, limit]);

  useEffect(() => { void load(); }, [load]);

  const handleRead = useCallback(async (alertId: string) => {
    setBusy(true);
    setMessage(null);
    const { ok, data } = await apiPatch(`/api/owner/alerts/${alertId}/read`);
    setBusy(false);
    if (!ok) {
      setMessage(data?.error?.message || data?.error || "Failed to acknowledge alert");
    } else {
      setMessage("Alert acknowledged.");
      await load();
    }
  }, [load]);

  const handleResolve = useCallback(async (alertId: string) => {
    setBusy(true);
    setMessage(null);
    const { ok, data } = await apiPatch(`/api/owner/alerts/${alertId}/resolve`);
    setBusy(false);
    if (!ok) {
      setMessage(data?.error?.message || data?.error || "Failed to resolve alert");
    } else {
      setMessage("Alert resolved.");
      await load();
    }
  }, [load]);

  return (
    <div className="mx-auto max-w-2xl py-6 px-4">
      <div className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h1 className="text-2xl font-bold">Alerts</h1>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-destructive text-white text-xs font-bold px-2 py-0.5 min-w-[22px]">
                {unreadCount}
              </span>
            )}
            <Button onClick={() => void load()} disabled={loading || busy} className="min-h-[44px] text-xs px-3">
              Refresh
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Workspace-scoped. Acknowledge to log that you saw it; resolve to close it out.
        </p>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="h-4 w-4"
            />
            Unread only
          </label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as "" | AlertSeverity)}
            className="border rounded px-2 py-2 text-sm min-h-[44px] bg-card"
            aria-label="Filter by severity"
          >
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      <nav className="flex gap-2 mb-4" aria-label="Breadcrumb">
        <Link href="/owner/home" className="text-xs text-muted-foreground underline">Home</Link>
        <span className="text-xs text-muted-foreground">/</span>
        <span className="text-xs text-foreground">Alerts</span>
      </nav>

      {message && (
        <p className="text-sm text-foreground mb-3" role="status">{message}</p>
      )}

      {loading ? (
        <TableListSkeleton label="Loading alerts" />
      ) : error ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive mb-4">
          {error}
          <Button onClick={() => void load()} className="ml-3 min-h-[44px] text-xs px-3">Retry</Button>
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground text-sm">
          {unreadOnly ? "No unread alerts." : "No alerts yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onRead={handleRead}
              onResolve={handleResolve}
              busy={busy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
