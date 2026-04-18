"use client";

import { useState } from "react";
import { Button, Input, Textarea, Select } from "@/ui/primitives";

interface ManualEvidenceFormProps {
  engagementId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ManualEvidenceForm({
  engagementId,
  onSuccess,
  onCancel,
}: ManualEvidenceFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    const body = {
      engagementId,
      category: formData.get("category"),
      evidenceType: "FREE_TEXT",
      sourceType: formData.get("sourceType"),
      sourceLabel: formData.get("sourceLabel"),
      captureMethod: formData.get("captureMethod"),
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      content: formData.get("content"),
      traceabilityStatus: formData.get("traceabilityStatus"),
      visibility: formData.get("visibility"),
    };

    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to create evidence");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-muted/20 p-6">
      <h2 className="text-lg font-semibold text-foreground">Add Manual Evidence</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Record evidence as structured data.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input
          name="title"
          label="Title"
          required
          placeholder="Evidence title"
        />

        <Textarea
          name="description"
          label="Description"
          rows={2}
          placeholder="Optional description of this evidence"
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            name="category"
            label="Category"
            required
            placeholder="Select category..."
            options={[
              { value: "FINANCIAL", label: "Financial" },
              { value: "OPERATIONAL", label: "Operational" },
              { value: "HUMAN", label: "Human Factors" },
              { value: "RESILIENCE", label: "Resilience" },
              { value: "CLIENT", label: "Client" },
              { value: "COMMERCIAL", label: "Commercial" },
              { value: "LEADERSHIP", label: "Leadership" },
              { value: "EXECUTION", label: "Execution" },
            ]}
          />

          <Select
            name="sourceType"
            label="Source Type"
            required
            placeholder="Select source type..."
            options={[
              { value: "PERSON", label: "Person" },
              { value: "DOCUMENT", label: "Document" },
              { value: "SYSTEM", label: "System" },
              { value: "REPORT", label: "Report" },
            ]}
          />
        </div>

        <Input
          name="sourceLabel"
          label="Source Label"
          required
          placeholder="e.g., John Doe, Financial Report Q4"
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            name="captureMethod"
            label="Capture Method"
            required
            placeholder="Select method..."
            options={[
              { value: "MANUAL", label: "Manual Entry" },
              { value: "INTEGRATION", label: "Integration" },
              { value: "EXTERNAL", label: "External Source" },
            ]}
          />

          <Select
            name="traceabilityStatus"
            label="Traceability"
            required
            placeholder="Select status..."
            options={[
              { value: "COMPLETE", label: "Complete" },
              { value: "PARTIAL", label: "Partial" },
              { value: "MISSING", label: "Missing" },
            ]}
          />
        </div>

        <Textarea
          name="content"
          label="Content"
          required
          rows={4}
          placeholder="Enter the evidence content..."
        />

        <Select
          name="visibility"
          label="Visibility"
          required
          placeholder="Select visibility..."
          options={[
            { value: "INTERNAL", label: "Internal Only" },
            { value: "CLIENT_VISIBLE", label: "Client Visible" },
            { value: "RESTRICTED", label: "Restricted" },
          ]}
        />

        <div className="flex gap-3 pt-4">
          <Button type="submit" isLoading={isSubmitting}>
            Create Evidence
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
