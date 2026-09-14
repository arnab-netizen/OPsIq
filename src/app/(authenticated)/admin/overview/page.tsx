"use client";

/**
 * /admin/overview — concise operator overview: beta cohort usage, request
 * pipeline, customer counts, and system readiness. Reuses only existing,
 * reliable data (GET /api/admin/overview). No fake observability, no
 * secrets/infra credentials.
 */

import { useEffect, useState } from "react";
import { Badge, LoadingState, Button } from "@/ui/primitives";
import { GovernedEmptyState } from "@/components/ui/GovernedEmptyState";
import { classifyOperatorError } from "@/lib/operator-error-governance";

interface OverviewData {
  capacity: { admitted: number; limit: number; admissionMode: string; source: string };
  requests: { requested: number; invited: number; revoked: number; rejected: number };
  customers: { registered: number; awaitingVerification: number; active: number };
  readiness: { status: string; checks: Record<string, boolean> };
}

interface PageState {
  data: OverviewData | null;
  loading: boolean;
  error: string | null;
  forbidden: boolean;
}

async function fetchOverview(): Promise<OverviewData> {
  const res = await fetch("/api/admin/overview");
  if (!res.ok) {
    if (res.status === 403) {
      const err = new Error("Forbidden") as Error & { httpStatus?: number };
      err.httpStatus = 403;
      throw err;
    }
    throw new Error("Failed to load overview");
  }
  return res.json();
}

async function loadAndApply(setState: (updater: PageState | ((prev: PageState) => PageState)) => void): Promise<void> {
  setState((s) => ({ ...s, loading: true, error: null, forbidden: false }));
  try {
    const data = await fetchOverview();
    setState({ data, loading: false, error: null, forbidden: false });
  } catch (error) {
    const tagged = error as Error & { httpStatus?: number };
    if (tagged.httpStatus === 403) {
      setState({ data: null, loading: false, error: null, forbidden: true });
      return;
    }
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    setState({ data: null, loading: false, error: governed.operatorMessage, forbidden: false });
  }
}

function StatTile({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>}
    </div>
  );
}

export default function AdminOverviewPage() {
  const [state, setState] = useState<PageState>({ data: null, loading: true, error: null, forbidden: false });

  useEffect(() => {
    void loadAndApply(setState);
  }, []);

  if (state.loading) return <LoadingState message="Loading overview..." />;
  if (state.forbidden) return <GovernedEmptyState reason="permission_denied" />;
  if (state.error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">{state.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadAndApply(setState)}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (!state.data) return <GovernedEmptyState reason="no_data" />;

  const { capacity, requests, customers, readiness } = state.data;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Administration overview</h1>
        <p className="text-gray-600">Beta cohort usage, request pipeline, and system readiness.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Beta cohort usage</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile
            label="Beta cohort usage"
            value={`${capacity.admitted} / ${capacity.limit}`}
            sublabel={`Admission mode: ${capacity.admissionMode}${capacity.source === "legacy" ? " (legacy env — not yet initialized)" : ""}`}
          />
          <StatTile label="Requested" value={requests.requested} />
          <StatTile label="Invited" value={requests.invited} />
          <StatTile label="Revoked / Rejected" value={`${requests.revoked} / ${requests.rejected}`} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Customers</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatTile label="Registered" value={customers.registered} />
          <StatTile label="Awaiting verification" value={customers.awaitingVerification} />
          <StatTile label="Active" value={customers.active} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">System readiness</h2>
        <div className="flex items-center gap-2">
          <Badge variant={readiness.status === "READY" ? "success" : readiness.status === "DEGRADED_NON_BLOCKING" ? "outline" : "destructive"}>
            {readiness.status}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {Object.entries(readiness.checks)
              .map(([k, v]) => `${k}: ${v ? "ok" : "fail"}`)
              .join(", ")}
          </span>
        </div>
      </section>
    </div>
  );
}
