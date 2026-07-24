"use client";

/**
 * /owner/risks/[id] — Risk detail page.
 *
 * Shows full risk details, linked tasks, and allows lifecycle transitions.
 * Workspace IDs and actor IDs are never supplied from the client.
 */

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the intentional pattern */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge, Button, Modal, Input, Select, Textarea } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";

type RiskStatus = "IDENTIFIED" | "ASSESSED" | "MITIGATING" | "ACCEPTED" | "RESOLVED" | "CLOSED";

interface TaskLink {
  id: string;
  taskId: string;
  linkType: string;
  createdAt: string;
}

interface RiskDetail {
  id: string;
  riskCode: string;
  title: string;
  description: string | null;
  category: string;
  likelihood: number;
  impact: number;
  severity: number;
  status: RiskStatus;
  mitigationAction: string | null;
  residualRisk: number | null;
  acceptanceRationale: string | null;
  reviewedAt: string | null;
  linkedObjectiveId: string | null;
  taskLinks: TaskLink[];
  createdAt: string;
  updatedAt: string;
}

const VALID_TRANSITIONS: Record<RiskStatus, RiskStatus[]> = {
  IDENTIFIED:  ["ASSESSED", "MITIGATING", "ACCEPTED", "CLOSED"],
  ASSESSED:    ["MITIGATING", "ACCEPTED", "CLOSED"],
  MITIGATING:  ["ASSESSED", "RESOLVED", "ACCEPTED", "CLOSED"],
  ACCEPTED:    ["MITIGATING", "RESOLVED", "CLOSED"],
  RESOLVED:    ["CLOSED"],
  CLOSED:      [],
};

const STATUS_LABELS: Record<RiskStatus, string> = {
  IDENTIFIED: "Identified",
  ASSESSED: "Assessed",
  MITIGATING: "Mitigating",
  ACCEPTED: "Accepted",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const STATUS_VARIANT: Record<RiskStatus, "default" | "warning" | "success" | "destructive"> = {
  IDENTIFIED: "default",
  ASSESSED: "warning",
  MITIGATING: "warning",
  ACCEPTED: "default",
  RESOLVED: "success",
  CLOSED: "default",
};

function severityVariant(s: number): "success" | "warning" | "destructive" | "default" {
  if (s >= 50) return "destructive";
  if (s >= 25) return "warning";
  return "success";
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

export default function RiskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const riskId = params.id;

  const [risk, setRisk] = useState<RiskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review modal
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<RiskStatus | "">("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [acceptanceRationale, setAcceptanceRationale] = useState("");
  const [residualRisk, setResidualRisk] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Link task modal
  const [linkTaskOpen, setLinkTaskOpen] = useState(false);
  const [linkTaskId, setLinkTaskId] = useState("");
  const [linkType, setLinkType] = useState<"MITIGATION" | "EVIDENCE">("MITIGATION");
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/owner/risks/${riskId}`);
      setRisk(data.risk ?? null);
    } catch (err) {
      setError(classifyOperatorError(err, { context: "load" }).operatorMessage);
    } finally {
      setLoading(false);
    }
  }, [riskId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReview() {
    if (!reviewStatus) { setReviewError("Select a new status."); return; }
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const payload: Record<string, unknown> = { newStatus: reviewStatus };
      if (reviewNotes.trim()) payload.reviewNotes = reviewNotes.trim();
      if (acceptanceRationale.trim()) payload.acceptanceRationale = acceptanceRationale.trim();
      if (residualRisk !== "") payload.residualRisk = Number(residualRisk);
      await apiFetch(`/api/owner/risks/${riskId}/review`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setReviewOpen(false);
      await load();
    } catch (err) {
      setReviewError(classifyOperatorError(err, { context: "save" }).operatorMessage);
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function handleLinkTask() {
    if (!linkTaskId.trim()) { setLinkError("Task ID is required."); return; }
    setLinkSubmitting(true);
    setLinkError(null);
    try {
      await apiFetch(`/api/owner/risks/${riskId}/tasks`, {
        method: "POST",
        body: JSON.stringify({ taskId: linkTaskId.trim(), linkType }),
      });
      setLinkTaskOpen(false);
      setLinkTaskId("");
      await load();
    } catch (err) {
      setLinkError(classifyOperatorError(err, { context: "mutation" }).operatorMessage);
    } finally {
      setLinkSubmitting(false);
    }
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8"><p className="text-muted-foreground text-sm">Loading…</p></div>;
  if (error) return <div className="max-w-4xl mx-auto px-4 py-8"><p className="text-destructive text-sm">{error}</p></div>;
  if (!risk) return null;

  const nextStatuses = VALID_TRANSITIONS[risk.status] ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:underline mb-2 block">← Risk Register</button>
          <h1 className="text-2xl font-semibold">{risk.title}</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">{risk.riskCode}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
          {nextStatuses.length > 0 && (
            <Button size="sm" onClick={() => { setReviewStatus(""); setReviewNotes(""); setAcceptanceRationale(""); setResidualRisk(""); setReviewError(null); setReviewOpen(true); }}>
              Review
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => { setLinkTaskId(""); setLinkType("MITIGATION"); setLinkError(null); setLinkTaskOpen(true); }}>
            Link task
          </Button>
        </div>
      </div>

      {/* Status row */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <Badge variant={STATUS_VARIANT[risk.status]}>{STATUS_LABELS[risk.status]}</Badge>
        <Badge variant={severityVariant(risk.severity)}>Severity {risk.severity}</Badge>
        <span className="text-sm text-muted-foreground">{risk.category}</span>
      </div>

      {/* Details */}
      <div className="rounded-lg border border-border p-5 mb-6 space-y-3">
        {risk.description && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
            <p className="text-sm">{risk.description}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Likelihood" value={`${risk.likelihood}%`} />
          <Stat label="Impact" value={`${risk.impact}%`} />
          {risk.residualRisk != null && <Stat label="Residual risk" value={`${risk.residualRisk}%`} />}
        </div>
        {risk.mitigationAction && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Mitigation action</p>
            <p className="text-sm">{risk.mitigationAction}</p>
          </div>
        )}
        {risk.acceptanceRationale && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Acceptance rationale</p>
            <p className="text-sm">{risk.acceptanceRationale}</p>
          </div>
        )}
        {risk.reviewedAt && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Last reviewed</p>
            <p className="text-sm">{new Date(risk.reviewedAt).toLocaleString()}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Created" value={new Date(risk.createdAt).toLocaleDateString()} />
          <Stat label="Updated" value={new Date(risk.updatedAt).toLocaleDateString()} />
        </div>
      </div>

      {/* Linked tasks */}
      <h2 className="text-lg font-semibold mb-3">Linked tasks</h2>
      {risk.taskLinks.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-6">No tasks linked to this risk.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Task ID</th>
                <th className="px-4 py-2 text-left font-medium">Link type</th>
                <th className="px-4 py-2 text-left font-medium">Linked at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {risk.taskLinks.map((tl) => (
                <tr key={tl.id}>
                  <td className="px-4 py-3 font-mono text-xs">{tl.taskId}</td>
                  <td className="px-4 py-3 text-muted-foreground">{tl.linkType}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(tl.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review modal */}
      <Modal
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Review risk"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setReviewOpen(false)} disabled={reviewSubmitting}>Cancel</Button>
            <Button size="sm" onClick={handleReview} disabled={reviewSubmitting}>{reviewSubmitting ? "Saving…" : "Save review"}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {reviewError && <p className="text-destructive text-sm">{reviewError}</p>}
          <div>
            <label className="block text-sm font-medium mb-1">New status <span className="text-destructive">*</span></label>
            <Select
              value={reviewStatus}
              onChange={(e) => setReviewStatus(e.target.value as RiskStatus)}
              options={nextStatuses.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
              placeholder="Select new status"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Residual risk (0–100)</label>
            <Input type="number" min={0} max={100} value={residualRisk} onChange={(e) => setResidualRisk(e.target.value)} placeholder="0–100" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Acceptance rationale</label>
            <Textarea value={acceptanceRationale} onChange={(e) => setAcceptanceRationale(e.target.value)} rows={2} placeholder="Required when accepting the risk" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Review notes</label>
            <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={2} placeholder="Notes for this review" />
          </div>
        </div>
      </Modal>

      {/* Link task modal */}
      <Modal
        isOpen={linkTaskOpen}
        onClose={() => setLinkTaskOpen(false)}
        title="Link task to risk"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setLinkTaskOpen(false)} disabled={linkSubmitting}>Cancel</Button>
            <Button size="sm" onClick={handleLinkTask} disabled={linkSubmitting}>{linkSubmitting ? "Linking…" : "Link task"}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {linkError && <p className="text-destructive text-sm">{linkError}</p>}
          <div>
            <label className="block text-sm font-medium mb-1">Task ID <span className="text-destructive">*</span></label>
            <Input value={linkTaskId} onChange={(e) => setLinkTaskId(e.target.value)} placeholder="UUID of the delegated task" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Link type</label>
            <Select
              value={linkType}
              onChange={(e) => setLinkType(e.target.value as "MITIGATION" | "EVIDENCE")}
              options={[
                { value: "MITIGATION", label: "Mitigation" },
                { value: "EVIDENCE", label: "Evidence" },
              ]}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
