"use client";

import { useState, useRef, useEffect } from "react";
import { Button, Input, Textarea, Select, LoadingState } from "@/ui/primitives";

interface FileUploadFormProps {
  engagementId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface ClientContact {
  id: string;
  name: string;
  role: string | null;
}

export function FileUploadForm({
  engagementId,
  onSuccess,
  onCancel,
}: FileUploadFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState<string>("");
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    if (!selectedFile) {
      setError("Please select a file");
      setIsSubmitting(false);
      return;
    }

    const sourceTypeValue = (e.currentTarget.elements.namedItem("sourceType") as HTMLSelectElement).value;
    const sourceContactIdValue = (e.currentTarget.elements.namedItem("sourceContactId") as HTMLSelectElement)?.value;

    // Validate: PERSON requires sourceContactId
    if (sourceTypeValue === "PERSON" && !sourceContactIdValue) {
      setError("Please select a contact when source type is Person");
      setIsSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("engagementId", engagementId);
    formData.append("category", (e.currentTarget.elements.namedItem("category") as HTMLSelectElement).value);
    formData.append("sourceType", sourceTypeValue);
    formData.append("sourceLabel", (e.currentTarget.elements.namedItem("sourceLabel") as HTMLInputElement).value);
    formData.append("captureMethod", "UPLOAD");
    formData.append("title", (e.currentTarget.elements.namedItem("title") as HTMLInputElement).value);
    formData.append("description", (e.currentTarget.elements.namedItem("description") as HTMLTextAreaElement).value || "");
    formData.append("traceabilityStatus", (e.currentTarget.elements.namedItem("traceabilityStatus") as HTMLSelectElement).value);
    formData.append("visibility", (e.currentTarget.elements.namedItem("visibility") as HTMLSelectElement).value);
    formData.append("mimeType", selectedFile.type);
    formData.append("sizeBytes", selectedFile.size.toString());

    // Only include sourceContactId if PERSON
    if (sourceTypeValue === "PERSON" && sourceContactIdValue) {
      formData.append("sourceContactId", sourceContactIdValue);
    }

    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to upload evidence");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-muted/20 p-6">
      <h2 className="text-lg font-semibold text-foreground">Upload File Evidence</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload documents, screenshots, reports, or other files as evidence.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground">File</label>
          <div className="mt-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-6 text-center">
            {selectedFile ? (
              <div>
                <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="mt-3 rounded-md bg-muted px-3 py-1 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <svg
                  className="mx-auto h-8 w-8 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0013.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12a3 3 0 110-6H8.25"
                  />
                </svg>
                <p className="mt-2 text-sm text-muted-foreground">
                  Drag and drop a file, or{" "}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-primary hover:underline"
                  >
                    click to browse
                  </button>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setSelectedFile(file);
                  }}
                  className="hidden"
                />
              </div>
            )}
          </div>
        </div>

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
                No contacts available for this engagement. You can still upload evidence, but must contact your system administrator to link a source contact later.
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
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={!selectedFile}
          >
            Upload Evidence
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
