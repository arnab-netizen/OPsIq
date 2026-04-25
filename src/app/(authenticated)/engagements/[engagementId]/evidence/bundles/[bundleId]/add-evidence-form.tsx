"use client";

import { useState, useEffect } from "react";
import { Button, Select, LoadingState, ErrorState } from "@/ui/primitives";

interface EvidenceOption {
  id: string;
  title: string;
}

interface AddEvidenceToBundleFormProps {
  bundleId: string;
  engagementId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function AddEvidenceToBundleForm({
  bundleId,
  engagementId,
  onSuccess,
  onCancel,
}: AddEvidenceToBundleFormProps) {
  const [evidence, setEvidence] = useState<EvidenceOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEvidence() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/evidence?engagementId=${engagementId}&limit=100`
        );
        if (!res.ok) {
          throw new Error("Failed to load evidence");
        }
        const data = await res.json();
        setEvidence(data.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    fetchEvidence();
  }, [engagementId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const evidenceItemId = formData.get("evidenceItemId");

    if (!evidenceItemId) {
      setError("Please select evidence");
      setIsSubmitting(false);
      return;
    }

    const body = {
      bundleId,
      evidenceItemId,
    };

    try {
      const res = await fetch(`/api/evidence-bundles/${bundleId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to add evidence");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-muted/20 p-6">
      <h2 className="text-lg font-semibold text-foreground">Add Evidence</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Select evidence to add to this bundle.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading && <LoadingState message="Loading evidence..." />}

      {!isLoading && error && (
        <ErrorState
          title="Failed to load evidence"
          message={error}
        />
      )}

      {!isLoading && !error && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Select
            name="evidenceItemId"
            label="Evidence"
            required
            placeholder="Select evidence..."
            options={evidence.map((item) => ({
              value: item.id,
              label: item.title,
            }))}
          />

          <div className="flex gap-3 pt-4">
            <Button type="submit" isLoading={isSubmitting}>
              Add to Bundle
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
