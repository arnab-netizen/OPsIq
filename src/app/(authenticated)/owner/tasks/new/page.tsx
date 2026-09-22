"use client";

/**
 * /owner/tasks/new — create a delegated task (OWNER_MANAGE).
 *
 * ROOT CAUSE this closes: the Tasks list page's "+ New Task" CTA has always linked to
 * /owner/tasks/new, but no page existed at that route — Next.js's own dynamic sibling,
 * /owner/tasks/[taskId], matched "new" as a taskId instead and called GET
 * /api/owner/tasks/new, which crashed with a raw Prisma "invalid input syntax for type uuid"
 * error (that route now validates the id and fails closed — see [taskId]/route.ts). The
 * backend has always fully supported manual task creation via POST /api/owner/tasks
 * (assignDelegatedTask); only this page was missing. This reuses that existing endpoint
 * exactly — no second task-creation API.
 *
 * All mutations go through the server-authoritative POST /api/owner/tasks route; no
 * workspace/actor IDs are supplied from the client.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea, Select, PageHeader, PageContainer } from "@/ui/primitives";
import { ProofType } from "@/domain/execution/proof";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { PROOF_TYPE_LABEL } from "@/lib/owner-proof-type-labels";

const ROLE_OPTIONS = [
  { value: "", label: "No specific role" },
  { value: "MANAGER", label: "Manager" },
  { value: "STAFF", label: "Staff" },
];

const PROOF_TYPE_OPTIONS = Object.values(ProofType).map((v) => ({
  value: v,
  label: PROOF_TYPE_LABEL[v] ?? v,
}));

export default function NewOwnerTaskPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedRole, setAssignedRole] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [requireProof, setRequireProof] = useState(false);
  const [proofType, setProofType] = useState<string>(ProofType.SHORT_NOTE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !title.trim()) return; // double-submit protection + required-field guard
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { title: title.trim() };
      if (description.trim()) body.description = description.trim();
      if (assignedRole) body.assignedRole = assignedRole;
      if (dueAt) body.dueAt = new Date(dueAt).toISOString();
      if (requireProof) body.requireProof = { proofType };

      const res = await fetch("/api/owner/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(classifyOperatorError(new Error(String(data?.error ?? "Couldn't create this task.")), { context: "action" }).operatorMessage);
        setSubmitting(false);
        return;
      }
      router.push(`/owner/tasks/${data.taskId}`);
    } catch (e) {
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Couldn't create this task."), { context: "action" }).operatorMessage);
      setSubmitting(false);
    }
  };

  return (
    <PageContainer narrow className="flex flex-col gap-6">
      <PageHeader title="New task" description="Create and assign a task for your team." />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-md border border-border bg-card p-5" noValidate>
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={400}
          disabled={submitting}
          autoFocus
        />
        <Textarea
          label="Description"
          hint="Optional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          disabled={submitting}
        />
        <Select
          label="Assign to"
          hint="Optional — leave unassigned to route it yourself later"
          value={assignedRole}
          onChange={(e) => setAssignedRole(e.target.value)}
          options={ROLE_OPTIONS}
          disabled={submitting}
        />
        <Input
          label="Due date"
          hint="Optional"
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          disabled={submitting}
        />
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={requireProof}
              onChange={(e) => setRequireProof(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 rounded border-border"
            />
            Require proof of completion
          </label>
          {requireProof && (
            <Select
              label="Proof type"
              value={proofType}
              onChange={(e) => setProofType(e.target.value)}
              options={PROOF_TYPE_OPTIONS}
              disabled={submitting}
            />
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="submit" disabled={submitting || !title.trim()}>
            {submitting ? "Creating…" : "Create task"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/owner/tasks")} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
