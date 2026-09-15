"use client";

/**
 * /owner/compliance/[id] — Compliance item detail page.
 *
 * Shows full compliance details, linked tasks, and allows lifecycle transitions.
 * Workspace IDs and actor IDs are never supplied from the client.
 */

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the intentional pattern */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge, Button, Modal, Input, Select, Textarea, DetailPageSkeleton } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";

type ComplianceStatus = "active" | "evidence_pending" | "review_pending" | "compliant" | "breached" | "waived";

interface TaskLink {
  id: string;
  taskId: string;
  linkType: string;
  linkedBy: string;
  createdAt: string;
}

interface ComplianceDetail {
  id: string;
  workspaceId: string;
  kind: string;
  name: string;
  reference: string | null;
  expiresAt: string | null;
  status: ComplianceStatus;
  jurisdiction: string | null;
  legalBasis: string | null;
  obligationOwner: string | null;
  evidenceValidityDays: number | null;
  recurrenceMonths: number | null;
  penaltyDescription: string | null;
  provenanceSource: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  complianceNotes: string | null;
  temporalState: "upcoming" | "action_required" | "overdue" | null;
  taskLinks: TaskLink[];
  createdAt: string;
  updatedAt: string;
}

const VALID_TRANSITIONS: Record<ComplianceStatus, ComplianceStatus[]> = {
  active:           ["evidence_pending", "review_pending", "compliant", "breached", "waived"],
  evidence_pending: ["active", "review_pending", "breached", "waived"],
  review_pending:   ["active", "compliant", "breached", "waived"],
  compliant:        ["active", "review_pending", "waived"],
  breached:         ["active", "evidence_pending", "review_pending", "waived"],
  waived:           ["active", "breached"],
};

const STATUS_LABELS: Record<ComplianceStatus, string> = {
  active: "Active",
  evidence_pending: "Evidence pending",
  review_pending: "Review pending",
  compliant: "Compliant",
  breached: "Breached",
  waived: "Waived",
};

const STATUS_VARIANT: Record<ComplianceStatus, "default-accessible" | "warning-accessible" | "success-accessible" | "destructive-accessible"> = {
  active: "default-accessible",
  evidence_pending: "warning-accessible",
  review_pending: "warning-accessible",
  compliant: "success-accessible",
  breached: "destructive-accessible",
  waived: "default-accessible",
};

const TEMPORAL_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  action_required: "Action required",
  overdue: "Overdue",
};

const TEMPORAL_VARIANT: Record<string, "default-accessible" | "warning-accessible" | "success-accessible" | "destructive-accessible"> = {
  upcoming: "default-accessible",
  action_required: "warning-accessible",
  overdue: "destructive-accessible",
};

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

export default function ComplianceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const itemId = params.id;

  const [item, setItem] = useState<ComplianceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review modal
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<ComplianceStatus | "">("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Link task modal
  const [linkTaskOpen, setLinkTaskOpen] = useState(false);
  const [linkTaskId, setLinkTaskId] = useState("");
  const [linkType, setLinkType] = useState<"REMEDIATION" | "EVIDENCE">("REMEDIATION");
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/owner/compliance/${itemId}`);
      setItem(data.item ?? null);
    } catch (err) {
      setError(classifyOperatorError(err, { context: "load" }).operatorMessage);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReview() {
    if (!reviewStatus) { setReviewError("Select a new status."); return; }
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const payload: Record<string, unknown> = { newStatus: reviewStatus };
      if (reviewNotes.trim()) payload.complianceNotes = reviewNotes.trim();
      await apiFetch(`/api/owner/compliance/${itemId}/review`, {
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
      await apiFetch(`/api/owner/compliance/${itemId}/tasks`, {
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

  if (loading) return <DetailPageSkeleton label="Loading" />;
  if (error) return <div className="max-w-4xl mx-auto px-4 py-8"><p className="text-destructive text-sm">{error}</p></div>;
  if (!item) return null;

  const nextStatuses = VALID_TRANSITIONS[item.status] ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:underline mb-2 block">← Compliance Calendar</button>
          <h1 className="text-2xl font-semibold">{item.name}</h1>
          <p className="text-xs text-muted-foreground mt-1 capitalize">{item.kind}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
          {nextStatuses.length > 0 && (
            <Button size="sm" onClick={() => { setReviewStatus(""); setReviewNotes(""); setReviewError(null); setReviewOpen(true); }}>
              Update status
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => { setLinkTaskId(""); setLinkType("REMEDIATION"); setLinkError(null); setLinkTaskOpen(true); }}>
            Link task
          </Button>
        </div>
      </div>

      {/* Status row */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABELS[item.status]}</Badge>
        {item.temporalState && (
          <Badge variant={TEMPORAL_VARIANT[item.temporalState]}>{TEMPORAL_LABELS[item.temporalState]}</Badge>
        )}
      </div>

      {/* Details */}
      <div className="rounded-lg border border-border p-5 mb-6 space-y-4">
        {item.reference && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Reference</p>
            <p className="text-sm font-mono">{item.reference}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {item.expiresAt && <Stat label="Expires" value={new Date(item.expiresAt).toLocaleDateString()} />}
          {item.jurisdiction && <Stat label="Jurisdiction" value={item.jurisdiction} />}
          {item.obligationOwner && <Stat label="Obligation owner" value={item.obligationOwner} />}
          {item.evidenceValidityDays != null && <Stat label="Evidence validity" value={`${item.evidenceValidityDays} days`} />}
          {item.recurrenceMonths != null && <Stat label="Recurrence" value={`${item.recurrenceMonths} months`} />}
          {item.provenanceSource && <Stat label="Provenance" value={item.provenanceSource.replace(/_/g, " ")} />}
        </div>
        {item.legalBasis && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Legal basis</p>
            <p className="text-sm">{item.legalBasis}</p>
          </div>
        )}
        {item.penaltyDescription && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Penalty</p>
            <p className="text-sm">{item.penaltyDescription}</p>
          </div>
        )}
        {item.complianceNotes && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Compliance notes</p>
            <p className="text-sm">{item.complianceNotes}</p>
          </div>
        )}
        {item.reviewedAt && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Last reviewed</p>
            <p className="text-sm">{new Date(item.reviewedAt).toLocaleString()}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Created" value={new Date(item.createdAt).toLocaleDateString()} />
          <Stat label="Updated" value={new Date(item.updatedAt).toLocaleDateString()} />
        </div>
      </div>

      {/* Linked tasks */}
      <h2 className="text-lg font-semibold mb-3">Linked tasks</h2>
      {item.taskLinks.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-6">No tasks linked to this compliance item.</p>
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
              {item.taskLinks.map((tl) => (
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
        title="Update compliance status"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setReviewOpen(false)} disabled={reviewSubmitting}>Cancel</Button>
            <Button size="sm" onClick={handleReview} disabled={reviewSubmitting}>{reviewSubmitting ? "Saving…" : "Save"}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {reviewError && <p className="text-destructive text-sm">{reviewError}</p>}
          <div>
            <label className="block text-sm font-medium mb-1">New status <span className="text-destructive">*</span></label>
            <Select
              value={reviewStatus}
              onChange={(e) => setReviewStatus(e.target.value as ComplianceStatus)}
              options={nextStatuses.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
              placeholder="Select new status"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Compliance notes</label>
            <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={3} placeholder="Notes for this review" />
          </div>
        </div>
      </Modal>

      {/* Link task modal */}
      <Modal
        isOpen={linkTaskOpen}
        onClose={() => setLinkTaskOpen(false)}
        title="Link task to compliance item"
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
              onChange={(e) => setLinkType(e.target.value as "REMEDIATION" | "EVIDENCE")}
              options={[
                { value: "REMEDIATION", label: "Remediation" },
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
