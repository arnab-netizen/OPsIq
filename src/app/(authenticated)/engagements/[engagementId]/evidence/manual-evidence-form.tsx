"use client";

import { useState, useEffect } from "react";
import { Button, Input, Textarea, Select, LoadingState } from "@/ui/primitives";

interface ManualEvidenceFormProps {
  engagementId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface ClientContact {
  id: string;
  name: string;
  role: string | null;
}

export function ManualEvidenceForm({
  engagementId,
  onSuccess,
  onCancel,
}: ManualEvidenceFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<string>("");
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);

  // Fetch client contacts when component mounts
  useEffect(() => {
    async function fetchContacts() {
      setIsLoadingContacts(true);
      try {
        const engRes = await fetch(
          `/api/engagements/${engagementId}`
        );
        if (!engRes.ok) return;
        const engagement = await engRes.json();

        const clientRes = await fetch(
          `/api/clients/${engagement.clientId}/contacts`
        );
        if (!clientRes.ok) return;
        const { contacts } = await clientRes.json();
        setContacts(contacts ?? []);
      } catch {
        // Silent fail - contacts are optional
      } finally {
        setIsLoadingContacts(false);
      }
    }

    fetchContacts();
  }, [engagementId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const selectedSourceType = formData.get("sourceType") as string;
    const sourceContactId = formData.get("sourceContactId") as string;

    // Validate: PERSON requires sourceContactId
    if (selectedSourceType === "PERSON" && !sourceContactId) {
      setError("Please select a contact when source type is Person");
      setIsSubmitting(false);
      return;
    }

    const body: Record<string, any> = {
      engagementId,
      category: formData.get("category"),
      evidenceType: "FREE_TEXT",
      sourceType: selectedSourceType,
      sourceLabel: formData.get("sourceLabel"),
      captureMethod: formData.get("captureMethod"),
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      content: formData.get("content"),
      traceabilityStatus: formData.get("traceabilityStatus"),
      visibility: formData.get("visibility"),
    };

    // Only include sourceContactId if PERSON
    if (selectedSourceType === "PERSON" && sourceContactId) {
      body.sourceContactId = sourceContactId;
    }

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
            onChange={(e) => setSourceType(e.currentTarget.value)}
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

        {sourceType === "PERSON" && (
          <div>
            {isLoadingContacts ? (
              <LoadingState message="Loading contacts..." />
            ) : contacts.length === 0 ? (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                No contacts available for this engagement. You can still create evidence, but must contact your system administrator to link a source contact later.
              </div>
            ) : (
              <Select
                name="sourceContactId"
                label="Source Contact"
                required
                placeholder="Select a contact..."
                options={contacts.map((contact) => ({
                  value: contact.id,
                  label: `${contact.name}${contact.role ? ` (${contact.role})` : ""}`,
                }))}
              />
            )}
          </div>
        )}

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
