"use client";

import { useState } from "react";
import { Badge, Button } from "@/ui/primitives";
import {
  classifyOperatorError,
  type ErrorGovernanceContext,
} from "@/lib/operator-error-governance";
import { GovernedEmptyState } from "@/components/ui/GovernedEmptyState";

interface Finding {
  id: string;
  title: string;
  summary?: string;
  severity: string;
  status?: string;
  version: number;
  engagementId: string;
}

interface FindingsManagerProps {
  findings: Finding[];
  engagementId: string;
  onFindingUpdated?: () => void;
}

const SEVERITY_OPTIONS = ["critical", "high", "medium", "low"];
const STATUS_OPTIONS = ["identified", "validated", "prioritized", "resolved", "dismissed"];

const SEVERITY_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  critical: "destructive",
  high: "warning",
  medium: "default",
  low: "muted",
};

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  identified: "muted",
  validated: "warning",
  prioritized: "warning",
  resolved: "success",
  dismissed: "muted",
};

export function FindingsManager({
  findings,
  engagementId,
  onFindingUpdated,
}: FindingsManagerProps) {
  const [localFindings, setLocalFindings] = useState(findings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state for create/edit
  const [formData, setFormData] = useState({
    title: "",
    summary: "",
    severity: "high",
  });

  const handleCreateFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = "Title is required";
    }
    if (!formData.summary.trim()) {
      newErrors.summary = "Summary is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setUpdating("new");
    setErrors({});

    try {
      const res = await fetch("/api/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engagementId,
          title: formData.title,
          summary: formData.summary,
          severity: formData.severity,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const error = new Error(errorData?.error?.message || "Failed to create finding");
        const context: ErrorGovernanceContext = {
          context: "form",
        };
        const governed = classifyOperatorError(error, context);
        setErrors({ form: governed.operatorMessage });
        return;
      }

      const newFinding = await res.json();
      setLocalFindings([...localFindings, newFinding]);
      setFormData({ title: "", summary: "", severity: "high" });
      setCreateMode(false);
      onFindingUpdated?.();
    } catch (err) {
      const context: ErrorGovernanceContext = {
        context: "form",
      };
      const governed = classifyOperatorError(err, context);
      setErrors({ form: governed.operatorMessage });
    } finally {
      setUpdating(null);
    }
  };

  const handleUpdateFinding = async (
    findingId: string,
    updates: { severity?: string; status?: string }
  ) => {
    const finding = localFindings.find((f) => f.id === findingId);
    if (!finding) return;

    setUpdating(findingId);
    setErrors({});

    try {
      const res = await fetch(`/api/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...updates,
          version: finding.version,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const error = new Error(errorData?.error?.message || "Failed to update finding");
        const context: ErrorGovernanceContext = {
          context: "action",
          resourceId: findingId,
        };
        const governed = classifyOperatorError(error, context);
        setErrors({ [findingId]: governed.operatorMessage });
        return;
      }

      const updated = await res.json();
      setLocalFindings(
        localFindings.map((f) =>
          f.id === findingId
            ? {
                ...f,
                severity: updated.severity || f.severity,
                status: updated.status || f.status,
                version: (updated.version || finding.version) + 1,
              }
            : f
        )
      );

      onFindingUpdated?.();
    } catch (err) {
      const context: ErrorGovernanceContext = {
        context: "action",
        resourceId: findingId,
      };
      const governed = classifyOperatorError(err, context);
      setErrors({ [findingId]: governed.operatorMessage });
    } finally {
      setUpdating(null);
    }
  };

  const criticalFindings = localFindings.filter((f) => f.severity === "critical");
  const highFindings = localFindings.filter((f) => f.severity === "high");
  const otherFindings = localFindings.filter((f) => f.severity === "medium" || f.severity === "low");

  return (
    <div className="space-y-4">
      {/* Create Form */}
      {createMode && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <h4 className="font-medium">Create Finding</h4>
          {errors.form && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
              {errors.form}
            </div>
          )}
          <form onSubmit={handleCreateFinding} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Finding title"
                className="w-full rounded border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.title && (
                <p className="mt-1 text-xs text-destructive">{errors.title}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Summary</label>
              <textarea
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                placeholder="Detailed description"
                rows={3}
                className="w-full rounded border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.summary && (
                <p className="mt-1 text-xs text-destructive">{errors.summary}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Severity</label>
              <select
                value={formData.severity}
                onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                className="w-full rounded border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                type="submit"
                disabled={updating !== null}
              >
                Create Finding
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCreateMode(false);
                  setFormData({ title: "", summary: "", severity: "high" });
                  setErrors({});
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Create Button */}
      {!createMode && (
        <Button size="sm" onClick={() => setCreateMode(true)}>
          Add Finding
        </Button>
      )}

      {/* Critical Findings */}
      {criticalFindings.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <h4 className="font-semibold text-destructive">
            Critical ({criticalFindings.length})
          </h4>
          <div className="mt-3 space-y-2">
            {criticalFindings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-md border border-destructive/30 bg-background p-3 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h5 className="font-medium">{finding.title}</h5>
                    {finding.summary && (
                      <p className="mt-1 text-sm text-muted-foreground">{finding.summary}</p>
                    )}
                  </div>
                  <Badge variant={SEVERITY_VARIANTS[finding.severity]}>
                    {finding.severity}
                  </Badge>
                </div>

                {errors[finding.id] && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
                    {errors[finding.id]}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={finding.status || "identified"}
                    onChange={(e) => handleUpdateFinding(finding.id, { status: e.target.value })}
                    disabled={updating === finding.id}
                    className="rounded border border-border bg-background p-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                  {SEVERITY_OPTIONS.map((severity) => (
                    <Button
                      key={severity}
                      size="sm"
                      variant={finding.severity === severity ? "primary" : "outline"}
                      disabled={updating === finding.id}
                      onClick={() => handleUpdateFinding(finding.id, { severity })}
                    >
                      {severity}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* High Findings */}
      {highFindings.length > 0 && (
        <div className="rounded-lg border border-warning/50 bg-warning/5 p-4">
          <h4 className="font-semibold text-warning">High ({highFindings.length})</h4>
          <div className="mt-3 space-y-2">
            {highFindings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-md border border-warning/30 bg-background p-3 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h5 className="font-medium">{finding.title}</h5>
                    {finding.summary && (
                      <p className="mt-1 text-sm text-muted-foreground">{finding.summary}</p>
                    )}
                  </div>
                  <Badge variant={SEVERITY_VARIANTS[finding.severity]}>
                    {finding.severity}
                  </Badge>
                </div>

                {errors[finding.id] && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
                    {errors[finding.id]}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={finding.status || "identified"}
                    onChange={(e) => handleUpdateFinding(finding.id, { status: e.target.value })}
                    disabled={updating === finding.id}
                    className="rounded border border-border bg-background p-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                  {SEVERITY_OPTIONS.map((severity) => (
                    <Button
                      key={severity}
                      size="sm"
                      variant={finding.severity === severity ? "primary" : "outline"}
                      disabled={updating === finding.id}
                      onClick={() => handleUpdateFinding(finding.id, { severity })}
                    >
                      {severity}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other Findings */}
      {otherFindings.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h4 className="font-semibold">Other ({otherFindings.length})</h4>
          <div className="mt-3 space-y-2">
            {otherFindings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-md border border-border bg-background p-3 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h5 className="font-medium">{finding.title}</h5>
                    {finding.summary && (
                      <p className="mt-1 text-sm text-muted-foreground">{finding.summary}</p>
                    )}
                  </div>
                  <Badge variant={SEVERITY_VARIANTS[finding.severity]}>
                    {finding.severity}
                  </Badge>
                </div>

                {errors[finding.id] && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
                    {errors[finding.id]}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={finding.status || "identified"}
                    onChange={(e) => handleUpdateFinding(finding.id, { status: e.target.value })}
                    disabled={updating === finding.id}
                    className="rounded border border-border bg-background p-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                  {SEVERITY_OPTIONS.map((severity) => (
                    <Button
                      key={severity}
                      size="sm"
                      variant={finding.severity === severity ? "primary" : "outline"}
                      disabled={updating === finding.id}
                      onClick={() => handleUpdateFinding(finding.id, { severity })}
                    >
                      {severity}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {localFindings.length === 0 && !createMode && (
        <GovernedEmptyState
          reason="no_findings"
          primaryAction={{
            label: "Create Finding",
            onClick: () => setCreateMode(true),
          }}
          helpText="Findings are created manually or generated from diagnostic analysis."
        />
      )}
    </div>
  );
}
