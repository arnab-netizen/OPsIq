"use client";

/**
 * /owner/risks — Business Risk Register.
 *
 * Lists workspace risks with category/status filters. Create and update
 * risks via Modal form. Severity is color-coded from the server-computed value.
 * No workspace IDs or actor IDs are supplied from the client.
 */

/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the intentional pattern */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, EmptyState, Modal, Input, Select, Textarea, TableListSkeleton } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";

type RiskCategory = "OPERATIONAL" | "FINANCIAL" | "MARKET" | "COMPLIANCE" | "EXECUTION" | "STRATEGIC";
type RiskStatus = "IDENTIFIED" | "ASSESSED" | "MITIGATING" | "ACCEPTED" | "RESOLVED" | "CLOSED";

interface RiskItem {
  id: string;
  riskCode: string;
  title: string;
  description: string | null;
  category: RiskCategory;
  likelihood: number;
  impact: number;
  severity: number;
  status: RiskStatus;
  mitigationAction: string | null;
  residualRisk: number | null;
  linkedObjectiveId: string | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES: RiskCategory[] = ["OPERATIONAL", "FINANCIAL", "MARKET", "COMPLIANCE", "EXECUTION", "STRATEGIC"];
const STATUSES: RiskStatus[] = ["IDENTIFIED", "ASSESSED", "MITIGATING", "ACCEPTED", "RESOLVED", "CLOSED"];

const CATEGORY_LABELS: Record<RiskCategory, string> = {
  OPERATIONAL: "Operational",
  FINANCIAL: "Financial",
  MARKET: "Market",
  COMPLIANCE: "Compliance",
  EXECUTION: "Execution",
  STRATEGIC: "Strategic",
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

function severityVariant(severity: number): "success" | "warning" | "destructive" | "default" {
  if (severity >= 75) return "destructive";
  if (severity >= 50) return "destructive";
  if (severity >= 25) return "warning";
  return "success";
}

function severityLabel(severity: number): string {
  if (severity >= 75) return `Critical (${severity})`;
  if (severity >= 50) return `High (${severity})`;
  if (severity >= 25) return `Medium (${severity})`;
  return `Low (${severity})`;
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

interface FormState {
  riskCode: string;
  title: string;
  description: string;
  category: RiskCategory | "";
  likelihood: string;
  impact: string;
  mitigationAction: string;
  status: RiskStatus | "";
  residualRisk: string;
}

const EMPTY_FORM: FormState = {
  riskCode: "",
  title: "",
  description: "",
  category: "",
  likelihood: "",
  impact: "",
  mitigationAction: "",
  status: "",
  residualRisk: "",
};

function formFromRisk(risk: RiskItem): FormState {
  return {
    riskCode: risk.riskCode,
    title: risk.title,
    description: risk.description ?? "",
    category: risk.category,
    likelihood: String(risk.likelihood),
    impact: String(risk.impact),
    mitigationAction: risk.mitigationAction ?? "",
    status: risk.status,
    residualRisk: risk.residualRisk != null ? String(risk.residualRisk) : "",
  };
}

export default function RisksPage() {
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<RiskItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/owner/risks");
      setRisks(data.risks ?? []);
    } catch (err) {
      setError(classifyOperatorError(err, { context: "load" }).operatorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleRisks = risks.filter((r) => {
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  function openCreate() {
    setEditingRisk(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(risk: RiskItem) {
    setEditingRisk(risk);
    setForm(formFromRisk(risk));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingRisk(null);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setFormError(null);
    if (!form.title.trim()) { setFormError("Title is required."); return; }
    if (!form.category) { setFormError("Category is required."); return; }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        action: editingRisk ? "UPDATE" : "CREATE",
        title: form.title.trim(),
        category: form.category,
        description: form.description.trim() || null,
        mitigationAction: form.mitigationAction.trim() || null,
      };

      if (form.likelihood !== "") payload.likelihood = Number(form.likelihood);
      if (form.impact !== "") payload.impact = Number(form.impact);

      if (editingRisk) {
        payload.riskId = editingRisk.id;
        if (form.status) payload.status = form.status;
        if (form.residualRisk !== "") payload.residualRisk = Number(form.residualRisk);
      } else {
        if (form.riskCode.trim()) payload.riskCode = form.riskCode.trim();
      }

      await apiFetch("/api/owner/risks", {
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Risk Register</h1>
        <Button size="sm" onClick={openCreate}>+ New Risk</Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {loading && <TableListSkeleton label="Loading" rows={4} />}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!loading && !error && visibleRisks.length === 0 && (
        categoryFilter || statusFilter ? (
          <EmptyState
            title="No risks match these filters"
            description="No registered risks fit the selected category and status."
            primaryAction={{
              label: "Clear filters",
              onClick: () => {
                setCategoryFilter("");
                setStatusFilter("");
              },
            }}
          />
        ) : (
          <EmptyState
            title="No risks logged yet"
            description="Log a risk to track its category, severity, and mitigation status in one register."
            primaryAction={{ label: "+ New Risk", onClick: openCreate }}
          />
        )
      )}

      {!loading && !error && visibleRisks.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Code</th>
                <th className="px-4 py-2 text-left font-medium">Title</th>
                <th className="px-4 py-2 text-left font-medium">Category</th>
                <th className="px-4 py-2 text-left font-medium">Severity</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRisks.map((risk) => (
                <tr key={risk.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{risk.riskCode}</td>
                  <td className="px-4 py-3 font-medium">{risk.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{CATEGORY_LABELS[risk.category]}</td>
                  <td className="px-4 py-3">
                    <Badge variant={severityVariant(risk.severity)}>
                      {severityLabel(risk.severity)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[risk.status]}>
                      {STATUS_LABELS[risk.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => openEdit(risk)}
                        className="text-primary hover:underline text-sm"
                      >
                        Edit
                      </button>
                      <Link href={`/owner/risks/${risk.id}`} className="text-primary hover:underline text-sm">
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Update Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingRisk ? "Update Risk" : "New Risk"}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving…" : editingRisk ? "Save changes" : "Create risk"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && <p className="text-destructive text-sm">{formError}</p>}

          <div>
            <label className="block text-sm font-medium mb-1">
              Title <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="Describe the risk"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Category <span className="text-destructive">*</span>
            </label>
            <Select
              value={form.category}
              onChange={(e) => setField("category", e.target.value as RiskCategory)}
              options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
              placeholder="Select category"
            />
          </div>

          {!editingRisk && (
            <div>
              <label className="block text-sm font-medium mb-1">Risk Code (optional)</label>
              <Input
                value={form.riskCode}
                onChange={(e) => setField("riskCode", e.target.value)}
                placeholder="e.g. RISK-001 (auto-generated if blank)"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Textarea
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Describe the risk in detail"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Likelihood (0–100)</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.likelihood}
                onChange={(e) => setField("likelihood", e.target.value)}
                placeholder="0–100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Impact (0–100)</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.impact}
                onChange={(e) => setField("impact", e.target.value)}
                placeholder="0–100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Mitigation action</label>
            <Textarea
              value={form.mitigationAction}
              onChange={(e) => setField("mitigationAction", e.target.value)}
              placeholder="Describe the mitigation plan"
              rows={2}
            />
          </div>

          {editingRisk && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <Select
                  value={form.status}
                  onChange={(e) => setField("status", e.target.value as RiskStatus)}
                  options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Residual risk (0–100)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.residualRisk}
                  onChange={(e) => setField("residualRisk", e.target.value)}
                  placeholder="0–100"
                />
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
