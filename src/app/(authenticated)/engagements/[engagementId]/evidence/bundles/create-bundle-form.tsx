"use client";

import { useState } from "react";
import { Button, Input, Textarea } from "@/ui/primitives";

interface CreateBundleFormProps {
  engagementId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function CreateBundleForm({
  engagementId,
  onSuccess,
  onCancel,
}: CreateBundleFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    const body = {
      engagementId,
      title: formData.get("title"),
      description: formData.get("description") || undefined,
    };

    try {
      const res = await fetch("/api/evidence-bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to create bundle");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-muted/20 p-6">
      <h2 className="text-lg font-semibold text-foreground">Create Bundle</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a new bundle to group evidence together.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input
          name="title"
          label="Bundle Title"
          required
          placeholder="e.g., Financial Review Q4, Risk Assessment"
        />

        <Textarea
          name="description"
          label="Description"
          rows={3}
          placeholder="Describe the purpose and contents of this bundle..."
        />

        <div className="flex gap-3 pt-4">
          <Button type="submit" isLoading={isSubmitting}>
            Create Bundle
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
