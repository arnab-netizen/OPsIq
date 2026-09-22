"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { useActiveBusiness } from "@/context/active-business-context";
import { Badge, Button, Input, Select, CardDashboardSkeleton, PageHeader, PageContainer } from "@/ui/primitives";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic dashboard payloads are untyped; load() fetch-on-mount is intentional */

const STATUS_VARIANT: Record<string, "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  PENDING: "muted-accessible",
  APPROVED: "success-accessible",
  REJECTED: "destructive-accessible",
  DEFERRED: "warning-accessible",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  DEFERRED: "Deferred",
};

const EVIDENCE_TYPES = [
  { value: "document", label: "Document" },
  { value: "photo", label: "Photo" },
  { value: "data", label: "Data" },
  { value: "testimony", label: "Testimony" },
];
const EVIDENCE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  EVIDENCE_TYPES.map((t) => [t.value, t.label])
);

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function OwnerApprovalsPage() {
  const { businesses, activeBusinessId, needsBusinessRecovery, setActiveBusinessId, loading: contextLoading } = useActiveBusiness();
  const [approvals, setApprovals] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [evidenceFormFor, setEvidenceFormFor] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const loadApprovals = useCallback(async (businessId: string, status: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ businessId });
      if (status) qs.set("status", status);
      const data = await api(`/api/owner/approval?${qs.toString()}`);
      if (requestSeq.current !== seq) return;
      setApprovals(data.approvals ?? []);
    } catch (e) {
      if (requestSeq.current !== seq) return;
      setError(e instanceof Error ? e.message : "Failed to load approvals");
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contextLoading) return;
    if (needsBusinessRecovery) return;
    if (!activeBusinessId) { setApprovals([]); setLoading(false); return; }
    void loadApprovals(activeBusinessId, statusFilter);
  }, [contextLoading, activeBusinessId, needsBusinessRecovery, statusFilter, loadApprovals]);

  const onSwitchBusiness = useCallback((id: string) => {
    setLoading(true);
    setActiveBusinessId(id);
  }, [setActiveBusinessId]);

  async function createApprovalRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeBusinessId) return;
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      idempotencyKey: newIdempotencyKey(),
      businessId: activeBusinessId,
    };
    const actionId = fd.get("actionId");
    const actionDomain = fd.get("actionDomain");
    if (actionId && typeof actionId === "string" && actionId.trim()) body.actionId = actionId.trim();
    if (actionDomain && typeof actionDomain === "string" && actionDomain.trim()) body.actionDomain = actionDomain.trim();
    try {
      await api("/api/owner/approval", { method: "POST", body: JSON.stringify(body) });
      setShowCreateForm(false);
      await loadApprovals(activeBusinessId, statusFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create approval request");
    } finally {
      setBusy(false);
    }
  }

  async function decide(approval: any, decision: "APPROVED" | "REJECTED" | "DEFERRED") {
    if (!activeBusinessId) return;
    setBusy(true);
    setError(null);
    try {
      const rationale = window.prompt(`Rationale for ${STATUS_LABEL[decision] ?? decision} (optional):`) || undefined;
      await api("/api/owner/approval", {
        method: "PATCH",
        body: JSON.stringify({ action: "decide", approvalId: approval.id, decision, rationale }),
      });
      await loadApprovals(activeBusinessId, statusFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record decision");
    } finally {
      setBusy(false);
    }
  }

  async function submitEvidence(e: React.FormEvent<HTMLFormElement>, approvalId: string) {
    e.preventDefault();
    if (!activeBusinessId) return;
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      action: "submit_evidence",
      approvalId,
      evidenceType: fd.get("evidenceType"),
      description: fd.get("description"),
    };
    const sourceUrl = fd.get("sourceUrl");
    if (sourceUrl && typeof sourceUrl === "string" && sourceUrl.trim()) body.sourceUrl = sourceUrl.trim();
    try {
      await api("/api/owner/approval", { method: "PATCH", body: JSON.stringify(body) });
      setEvidenceFormFor(null);
      await loadApprovals(activeBusinessId, statusFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit evidence");
    } finally {
      setBusy(false);
    }
  }

  async function initiateAppeal(approval: any) {
    if (!activeBusinessId) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/owner/approval", {
        method: "PATCH",
        body: JSON.stringify({
          action: "initiate_appeal",
          idempotencyKey: newIdempotencyKey(),
          priorApprovalId: approval.id,
        }),
      });
      await loadApprovals(activeBusinessId, statusFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initiate appeal");
    } finally {
      setBusy(false);
    }
  }

  if (contextLoading || loading) return <CardDashboardSkeleton label="Loading approvals" />;
  if (needsBusinessRecovery) return (
    <PageContainer>
      <p>Your previously selected business is no longer available. Choose a business to continue.</p>
      <BusinessContextSelector businesses={businesses} selectedId={null} onChange={onSwitchBusiness} />
    </PageContainer>
  );

  return (
    <PageContainer>
      <div className="mb-6">
        <PageHeader
          title="Owner Approvals"
          description="Review evidence, decide, and track appeals for consulting approval requests -- one decision at a time."
          actions={<Button onClick={() => setShowCreateForm((s) => !s)} disabled={!activeBusinessId}>
          + New approval request
        </Button>}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {businesses.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No businesses yet. Create one from any domain page (e.g. Recovery) to begin tracking approvals.
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-end gap-3">
            <BusinessContextSelector
              businesses={businesses}
              selectedId={activeBusinessId}
              onChange={onSwitchBusiness}
            />
            <div className="w-48">
              <Select
                name="statusFilter"
                label="Status"
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                options={[
                  { value: "", label: "All statuses" },
                  { value: "PENDING", label: "Pending" },
                  { value: "APPROVED", label: "Approved" },
                  { value: "REJECTED", label: "Rejected" },
                  { value: "DEFERRED", label: "Deferred" },
                ]}
              />
            </div>
          </div>

          {showCreateForm && (
            <form onSubmit={createApprovalRequest} className="mb-6 border rounded-lg p-4 bg-card space-y-3">
              <h2 className="font-semibold">New approval request</h2>
              <div className="grid grid-cols-2 gap-3">
                <Input name="actionDomain" label="Related domain (optional)" placeholder="e.g. finance" />
                <Input name="actionId" label="Related action id (optional)" placeholder="—" />
              </div>
              <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create approval request"}</Button>
            </form>
          )}

          {approvals.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              No approval requests match this filter.
            </div>
          ) : (
            <section className="space-y-4">
              {approvals.map((a) => (
                <div key={a.id} className="border rounded-lg p-4 bg-card">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs uppercase text-muted-foreground">
                        {a.actionDomain ? `${a.actionDomain} · ` : ""}
                        {a.actionId ?? "no linked action"}
                      </div>
                      {a.appealOfId && (
                        <div className="text-xs text-muted-foreground">Appeal of approval {a.appealOfId}</div>
                      )}
                      {a.rationale && <div className="text-sm mt-1">{a.rationale}</div>}
                    </div>
                    <div className="text-right">
                      <Badge variant={STATUS_VARIANT[a.status] || "muted-accessible"}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
                      {a.rescopeTriggered && (
                        <div className="text-xs text-destructive mt-1">Rescope triggered</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">
                    <h3 className="text-sm font-semibold mb-2">Evidence ({a.evidences.length})</h3>
                    <div className="space-y-2">
                      {a.evidences.map((ev: any) => (
                        <div key={ev.id} className="border-l-4 pl-3 py-1" style={{ borderColor: "#94a3b8" }}>
                          <div className="text-xs font-medium">{EVIDENCE_TYPE_LABEL[ev.evidenceType] ?? ev.evidenceType}</div>
                          <div className="text-xs text-muted-foreground">{ev.description}</div>
                          {ev.sourceUrl && (
                            <a href={ev.sourceUrl} className="text-xs underline" target="_blank" rel="noreferrer">
                              {ev.sourceUrl}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {(a.status === "PENDING" || a.status === "DEFERRED") && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <Button onClick={() => setEvidenceFormFor((id) => (id === a.id ? null : a.id))} disabled={busy}>
                        {evidenceFormFor === a.id ? "Cancel evidence" : "Submit evidence"}
                      </Button>
                      <Button onClick={() => decide(a, "APPROVED")} disabled={busy}>Approve</Button>
                      <Button onClick={() => decide(a, "REJECTED")} disabled={busy}>Reject</Button>
                      <Button onClick={() => decide(a, "DEFERRED")} disabled={busy}>Defer</Button>
                    </div>
                  )}
                  {a.status === "REJECTED" && (
                    <div className="mt-3">
                      <Button onClick={() => initiateAppeal(a)} disabled={busy}>Initiate appeal</Button>
                    </div>
                  )}

                  {evidenceFormFor === a.id && (
                    <form
                      onSubmit={(e) => submitEvidence(e, a.id)}
                      className="mt-3 border rounded-lg p-3 bg-background space-y-3"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <Select name="evidenceType" label="Evidence type" required options={EVIDENCE_TYPES} />
                        <Input name="sourceUrl" label="Source URL (optional)" placeholder="https://…" />
                      </div>
                      <Input name="description" label="Description" required />
                      <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Save evidence"}</Button>
                    </form>
                  )}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}
