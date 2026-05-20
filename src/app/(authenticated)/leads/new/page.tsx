"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea, Select } from "@/ui/primitives";
import { toOperatorSafeError } from "@/lib/operator-safe-errors";

export default function NewLeadPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      companyName: formData.get("companyName"),
    };

    const optional = ["contactName", "contactEmail", "contactPhone", "source", "notes"];
    for (const key of optional) {
      const val = formData.get(key);
      if (val && typeof val === "string" && val.trim()) {
        body[key] = val.trim();
      }
    }

    const estimatedValue = formData.get("estimatedValue");
    if (estimatedValue && typeof estimatedValue === "string" && estimatedValue.trim()) {
      body.estimatedValue = parseFloat(estimatedValue);
    }

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to create lead");
      }

      const { id } = await res.json();
      router.push(`/leads/${id}`);
    } catch (err) {
      setError(toOperatorSafeError(err, "load").error);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">New Lead</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Add a new business lead to the pipeline.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input name="companyName" label="Company Name" required placeholder="Acme Corp" />

        <div className="grid grid-cols-2 gap-4">
          <Input name="contactName" label="Contact Name" placeholder="Jane Smith" />
          <Input name="contactEmail" label="Contact Email" type="email" placeholder="jane@acme.com" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input name="contactPhone" label="Contact Phone" placeholder="+1 555-0100" />
          <Select
            name="source"
            label="Source"
            placeholder="Select source..."
            options={[
              { value: "referral", label: "Referral" },
              { value: "website", label: "Website" },
              { value: "cold_outreach", label: "Cold Outreach" },
              { value: "conference", label: "Conference" },
              { value: "partner", label: "Partner" },
              { value: "other", label: "Other" },
            ]}
          />
        </div>

        <Input
          name="estimatedValue"
          label="Estimated Value ($)"
          type="number"
          min="0"
          step="0.01"
          placeholder="50000"
        />

        <Textarea name="notes" label="Notes" rows={3} placeholder="Initial notes about this lead..." />

        <div className="flex gap-3 pt-4">
          <Button type="submit" isLoading={isSubmitting}>
            Create Lead
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/leads")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
