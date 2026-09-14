"use client";

/**
 * /admin/audit — operator-readable Administration audit log. Reuses the
 * existing hash-chained AuditEvent infrastructure (see
 * administration-audit.service.ts); never implies cryptographic
 * verification for the unchained pre-workspace platform events.
 */

import { useEffect, useState } from "react";
import { Badge, LoadingState, Button } from "@/ui/primitives";
import { GovernedEmptyState } from "@/components/ui/GovernedEmptyState";
import { classifyOperatorError } from "@/lib/operator-error-governance";

interface AuditEntry {
  id: string;
  eventName: string;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  workspaceId: string | null;
  occurredAt: string;
  payload: Record<string, unknown> | null;
  chainVerified: false;
}

interface PageState {
  events: AuditEntry[] | null;
  loading: boolean;
  error: string | null;
  forbidden: boolean;
}

async function load(setState: (updater: PageState | ((prev: PageState) => PageState)) => void) {
  setState((s) => ({ ...s, loading: true, error: null, forbidden: false }));
  try {
    const res = await fetch("/api/admin/administration-audit?limit=100");
    if (!res.ok) {
      if (res.status === 403) {
        setState({ events: null, loading: false, error: null, forbidden: true });
        return;
      }
      throw new Error("Failed to load audit log");
    }
    const data = await res.json();
    setState({ events: data.events, loading: false, error: null, forbidden: false });
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    setState({ events: null, loading: false, error: governed.operatorMessage, forbidden: false });
  }
}

function payloadSummary(entry: AuditEntry): string {
  if (!entry.payload) return "";
  const p = entry.payload;
  if ("oldValue" in p || "newValue" in p) return `${String(p.oldValue ?? "—")} → ${String(p.newValue ?? "—")}`;
  if ("reason" in p && p.reason) return `Reason: ${String(p.reason)}`;
  return "";
}

export default function AdminAuditPage() {
  const [state, setState] = useState<PageState>({ events: null, loading: true, error: null, forbidden: false });

  useEffect(() => {
    void load(setState);
  }, []);

  if (state.loading) return <LoadingState message="Loading audit log..." />;
  if (state.forbidden) return <GovernedEmptyState reason="permission_denied" />;
  if (state.error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">{state.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load(setState)}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const events = state.events ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Audit log</h1>
        <p className="text-gray-600">
          Administration operator events. Platform-level events (capacity, admission mode, invites) are durable but
          not individually hash-chain-verified — see each entry.
        </p>
      </div>

      {events.length === 0 ? (
        <GovernedEmptyState reason="no_data" helpText="No Administration events recorded yet." />
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} className="rounded border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{e.eventName}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(e.occurredAt).toLocaleString()}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {e.workspaceId ? "workspace-scoped, chain-verified" : "platform-level, unchained"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Actor: {e.actorId ?? "—"} · Target: {e.entityType ?? "—"} {e.entityId ?? ""}
              </p>
              {payloadSummary(e) && <p className="mt-1 text-xs">{payloadSummary(e)}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
