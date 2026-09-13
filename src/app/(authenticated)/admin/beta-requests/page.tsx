"use client";

/**
 * /admin/beta-requests — minimal owner review surface for the controlled-beta
 * homepage capture (HOW_OWNER_REVIEWS_REQUESTS / HOW_OWNER_MARKS_INVITED, see
 * GET/POST /api/admin/beta-requests*). Reuses the existing, already-gated
 * APIs exactly as-is; this page adds no new authorization of its own — a
 * BETA_REQUEST_REVIEW/BETA_REQUEST_INVITE check server-side is what actually
 * protects these actions, not anything client-side here.
 *
 * Deliberately minimal: list + one Invite action. No search, filters, notes,
 * bulk actions, or analytics — see the controlled-beta owner workflow spec's
 * explicit non-goals for why.
 */

import { useEffect, useState } from "react";
import { Badge, Button, LoadingState, Table } from "@/ui/primitives";
import { GovernedEmptyState } from "@/components/ui/GovernedEmptyState";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { createClientIdempotencyKey } from "@/lib/client-idempotency";

interface BetaRequestRow {
  id: string;
  email: string;
  firstName: string | null;
  status: string;
  utmSource: string | null;
  utmCampaign: string | null;
  invitedAt: string | null;
  invitedBy: string | null;
  createdAt: string;
}

interface ListState {
  rows: BetaRequestRow[] | null;
  loading: boolean;
  error: string | null;
  forbidden: boolean;
}

async function fetchBetaRequests(): Promise<{ rows: BetaRequestRow[] }> {
  const res = await fetch("/api/admin/beta-requests");
  if (!res.ok) {
    if (res.status === 403) {
      const err = new Error("Forbidden") as Error & { httpStatus?: number };
      err.httpStatus = 403;
      throw err;
    }
    throw new Error("Failed to load beta requests");
  }
  const data = await res.json();
  return { rows: data.betaRequests as BetaRequestRow[] };
}

/** Shared by the initial load (inside useEffect) and the "Try again" retry button. */
async function loadAndApply(setState: (updater: ListState | ((prev: ListState) => ListState)) => void): Promise<void> {
  setState((s) => ({ ...s, loading: true, error: null, forbidden: false }));
  try {
    const { rows } = await fetchBetaRequests();
    setState({ rows, loading: false, error: null, forbidden: false });
  } catch (error) {
    const tagged = error as Error & { httpStatus?: number };
    if (tagged.httpStatus === 403) {
      setState({ rows: null, loading: false, error: null, forbidden: true });
      return;
    }
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), {
      context: "load",
    });
    setState({ rows: null, loading: false, error: governed.operatorMessage, forbidden: false });
  }
}

export default function AdminBetaRequestsPage() {
  const [state, setState] = useState<ListState>({ rows: null, loading: true, error: null, forbidden: false });
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadAndApply(setState);
    // Runs once on mount only — setState's identity is stable across renders,
    // so this intentionally has no other dependencies.
  }, []);

  const handleInvite = async (betaRequestId: string) => {
    setInvitingId(betaRequestId);
    setInviteErrors((prev) => {
      const next = { ...prev };
      delete next[betaRequestId];
      return next;
    });
    try {
      const idempotencyKey = createClientIdempotencyKey(`beta-invite-${betaRequestId}`);
      const res = await fetch(`/api/admin/beta-requests/${betaRequestId}/invite`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      });
      if (!res.ok) {
        throw new Error("Failed to invite this request");
      }
      const result = await res.json();
      setState((s) => ({
        ...s,
        rows:
          s.rows?.map((row) =>
            row.id === betaRequestId
              ? { ...row, status: result.status, invitedAt: result.invitedAt, invitedBy: result.invitedBy }
              : row
          ) ?? null,
      }));
    } catch (error) {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), {
        context: "action",
      });
      setInviteErrors((prev) => ({ ...prev, [betaRequestId]: governed.operatorMessage }));
    } finally {
      setInvitingId(null);
    }
  };

  if (state.loading) {
    return <LoadingState message="Loading beta requests..." />;
  }

  if (state.forbidden) {
    return <GovernedEmptyState reason="permission_denied" />;
  }

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

  const rows = state.rows ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Beta requests</h1>
        <p className="text-gray-600">Review controlled-beta access requests and invite applicants.</p>
      </div>

      <Table
        columns={[
          { key: "name", header: "Name", render: (row: BetaRequestRow) => row.firstName ?? "—" },
          { key: "email", header: "Email", render: (row: BetaRequestRow) => row.email },
          {
            key: "requested",
            header: "Requested",
            render: (row: BetaRequestRow) => new Date(row.createdAt).toLocaleString(),
          },
          {
            key: "source",
            header: "Source / campaign",
            render: (row: BetaRequestRow) => [row.utmSource, row.utmCampaign].filter(Boolean).join(" / ") || "—",
          },
          {
            key: "status",
            header: "Status",
            render: (row: BetaRequestRow) => (
              <Badge variant={row.status === "INVITED" ? "success" : "outline"}>{row.status}</Badge>
            ),
          },
          {
            key: "action",
            header: "",
            render: (row: BetaRequestRow) => (
              <div className="flex flex-col items-start gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={row.status === "INVITED" || invitingId === row.id}
                  isLoading={invitingId === row.id}
                  onClick={() => void handleInvite(row.id)}
                >
                  {row.status === "INVITED" ? "Invited" : "Invite"}
                </Button>
                {inviteErrors[row.id] && <p className="text-xs text-destructive">{inviteErrors[row.id]}</p>}
              </div>
            ),
          },
        ]}
        data={rows}
        keyExtractor={(row) => row.id}
        emptyState={
          <GovernedEmptyState
            reason="no_data"
            helpText="No beta requests have been received yet."
          />
        }
      />
    </div>
  );
}
