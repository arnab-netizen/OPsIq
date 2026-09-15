"use client";

/**
 * /owner/compliance — Compliance calendar.
 *
 * Lists all compliance items with status filters and temporal state badges.
 * Warning banners for overdue / action_required items. Create new items via Modal.
 * No workspace IDs or actor IDs are supplied from the client.
 */

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the intentional pattern */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Modal, Input, Select, Textarea, TableListSkeleton } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";

type ComplianceKind = "licence" | "permit" | "insurance" | "tax" | "document";
type ComplianceStatus = "active" | "evidence_pending" | "review_pending" | "compliant" | "breached" | "waived";
type ProvenanceSource = "owner_input" | "professional_input" | "authoritative_document";
type TemporalState = "upcoming" | "action_required" | "overdue" | null;

interface ComplianceItem {
  id: string;
  kind: ComplianceKind;
  name: string;
  reference: string | null;
  expiresAt: string | null;
  status: ComplianceStatus;
  jurisdiction: string | null;
  obligationOwner: string | null;
  penaltyDescription: string | null;
  temporalState: TemporalState;
  createdAt: string;
  updatedAt: string;
}

const KIND_LABELS: Record<ComplianceKind, string> = {
  licence: "Licence",
  permit: "Permit",
  insurance: "Insurance",
  tax: "Tax",
  document: "Document",
};

const KINDS: ComplianceKind[] = ["licence", "permit", "insurance", "tax", "document"];

const STATUS_LABELS: Record<ComplianceStatus, string> = {
  active: "Active",
  evidence_pending: "Evidence pending",
  review_pending: "Review pending",
  compliant: "Compliant",
  breached: "Breached",
  waived: "Waived",
};

const STATUS_VARIANT: Record<ComplianceStatus, "default" | "warning" | "success" | "destructive"> = {
  active: "default",
  evidence_pending: "warning",
  review_pending: "warning",
  compliant: "success",
  breached: "destructive",
  waived: "default",
};

const TEMPORAL_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  action_required: "Action required",
  overdue: "Overdue",
};

const TEMPORAL_VARIANT: Record<string, "default" | "warning" | "success" | "destructive"> = {
  upcoming: "default",
  action_required: "warning",
  overdue: "destructive",
};

const PROVENANCE_LABELS: Record<ProvenanceSource, string> = {
  owner_input: "Owner input",
  professional_input: "Professional input",
  authoritative_document: "Authoritative document",
};

const PROVENANCES: ProvenanceSource[] = ["owner_input", "professional_input", "authoritative_document"];

const ALL_STATUSES: ComplianceStatus[] = ["active", "evidence_pending", "review_pending", "compliant", "breached", "waived"];

interface FormState {
  kind: ComplianceKind | "";
  name: string;
  reference: string;
  expiresAt: string;
  jurisdiction: string;
  legalBasis: string;
  obligationOwner: string;
  evidenceValidityDays: string;
  recurrenceMonths: string;
  penaltyDescription: string;
  provenanceSource: ProvenanceSource | "";
}

const EMPTY_FORM: FormState = {
  kind: "",
  name: "",
  reference: "",
  expiresAt: "",
  jurisdiction: "",
  legalBasis: "",
  obligationOwner: "",
  evidenceValidityDays: "",
  recurrenceMonths: "",
  penaltyDescription: "",
  provenanceSource: "",
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

export default function CompliancePage() {
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = statusFilter ? `/api/owner/compliance?status=${encodeURIComponent(statusFilter)}` : "/api/owner/compliance";
      const data = await apiFetch(url);
      setItems(data.items ?? []);
    } catch (err) {
      setError(classifyOperatorError(err, { context: "load" }).operatorMessage);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const overdueItems = items.filter((i) => i.temporalState === "overdue");
  const actionRequiredItems = items.filter((i) => i.temporalState === "action_required");
  const breachedItems = items.filter((i) => i.status === "breached");

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setFormError(null);
    if (!form.kind) { setFormError("Kind is required."); return; }
    if (!form.name.trim()) { setFormError("Name is required."); return; }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        kind: form.kind,
        name: form.name.trim(),
      };

      if (form.reference.trim()) payload.reference = form.reference.trim();
      if (form.expiresAt) payload.expiresAt = new Date(form.expiresAt).toISOString();
      if (form.jurisdiction.trim()) payload.jurisdiction = form.jurisdiction.trim();
      if (form.legalBasis.trim()) payload.legalBasis = form.legalBasis.trim();
      if (form.obligationOwner.trim()) payload.obligationOwner = form.obligationOwner.trim();
      if (form.evidenceValidityDays !== "") payload.evidenceValidityDays = Number(form.evidenceValidityDays);
      if (form.recurrenceMonths !== "") payload.recurrenceMonths = Number(form.recurrenceMonths);
      if (form.penaltyDescription.trim()) payload.penaltyDescription = form.penaltyDescription.trim();
      if (form.provenanceSource) payload.provenanceSource = form.provenanceSource;

      await apiFetch("/api/owner/compliance", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      closeModal();
      await load();
    } catch (err) {
      setFormError(classifyOperatorError(err, { context: "save" }).operatorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <h1 className="text-2xl font-semibold">Compliance Calendar</h1>
        <Button size="sm" onClick={openCreate}>+ Add item</Button>
      </div>

      {/* Warning banners */}
      {breachedItems.length > 0 && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <strong>{breachedItems.length} compliance {breachedItems.length === 1 ? "item is" : "items are"} in breach</strong> — immediate action required.
        </div>
      )}
      {overdueItems.length > 0 && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <strong>{overdueItems.length} overdue</strong> compliance {overdueItems.length === 1 ? "item requires" : "items require"} immediate attention.
        </div>
      )}
      {actionRequiredItems.length > 0 && (
        <div className="mb-4 rounded-md border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          <strong>{actionRequiredItems.length}</strong> compliance {actionRequiredItems.length === 1 ? "item is" : "items are"} expiring within 30 days.
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {loading && <TableListSkeleton label="Loading compliance items" />}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!loading && !error && items.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {statusFilter ? `No compliance items with status "${STATUS_LABELS[statusFilter as ComplianceStatus] ?? statusFilter}".` : "No compliance items yet."}
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Kind</th>
                <th className="px-4 py-2 text-left font-medium">Expires</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">State</th>
                <th className="px-4 py-2 text-left font-medium">Jurisdiction</th>
                <th className="px-4 py-2 text-left font-medium">Owner</th>
                <th className="px-4 py-2 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {item.name}
                    {item.reference && (
                      <span className="ml-2 text-xs text-muted-foreground">({item.reference})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {KIND_LABELS[item.kind] ?? item.kind}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[item.status]}>
                      {STATUS_LABELS[item.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {item.temporalState ? (
                      <Badge variant={TEMPORAL_VARIANT[item.temporalState]}>
                        {TEMPORAL_LABELS[item.temporalState]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.jurisdiction ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.obligationOwner ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/owner/compliance/${item.id}`} className="text-[var(--primary-text)] hover:underline text-sm">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add compliance item modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title="Add Compliance Item"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving…" : "Add item"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && <p className="text-destructive text-sm">{formError}</p>}

          <div>
            <label className="block text-sm font-medium mb-1">
              Kind <span className="text-destructive">*</span>
            </label>
            <Select
              value={form.kind}
              onChange={(e) => setField("kind", e.target.value as ComplianceKind)}
              options={KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
              placeholder="Select kind"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Business operating licence"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Reference</label>
            <Input
              value={form.reference}
              onChange={(e) => setField("reference", e.target.value)}
              placeholder="Licence number, reference ID, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Expiry date</label>
            <Input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setField("expiresAt", e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Jurisdiction</label>
            <Input
              value={form.jurisdiction}
              onChange={(e) => setField("jurisdiction", e.target.value)}
              placeholder="e.g. NSW, AU"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Legal basis</label>
            <Input
              value={form.legalBasis}
              onChange={(e) => setField("legalBasis", e.target.value)}
              placeholder="Legislation or regulatory basis"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Obligation owner</label>
            <Input
              value={form.obligationOwner}
              onChange={(e) => setField("obligationOwner", e.target.value)}
              placeholder="Person or role responsible"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Evidence validity (days)</label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={form.evidenceValidityDays}
                onChange={(e) => setField("evidenceValidityDays", e.target.value)}
                placeholder="e.g. 365"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Recurrence (months)</label>
              <Input
                type="number"
                min={1}
                max={120}
                value={form.recurrenceMonths}
                onChange={(e) => setField("recurrenceMonths", e.target.value)}
                placeholder="e.g. 12"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Penalty description</label>
            <Textarea
              value={form.penaltyDescription}
              onChange={(e) => setField("penaltyDescription", e.target.value)}
              placeholder="Penalties for non-compliance"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Provenance source</label>
            <Select
              value={form.provenanceSource}
              onChange={(e) => setField("provenanceSource", e.target.value as ProvenanceSource)}
              options={PROVENANCES.map((p) => ({ value: p, label: PROVENANCE_LABELS[p] }))}
              placeholder="Select source"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
