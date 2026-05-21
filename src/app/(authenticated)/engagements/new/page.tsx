"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Textarea, Select } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export default function NewEngagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetClientId = searchParams.get("clientId") ?? "";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/clients?limit=100")
      .then((r) => (r.ok ? r.json() : { clients: [] }))
      .then((data) => setClients(data.clients ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      title: formData.get("title"),
      clientId: formData.get("clientId"),
      serviceTier: formData.get("serviceTier"),
      engagementMode: formData.get("engagementMode"),
      interventionMode: formData.get("interventionMode"),
    };

    const optional = ["description", "startDate", "targetEndDate"];
    for (const key of optional) {
      const val = formData.get(key);
      if (val && typeof val === "string" && val.trim()) {
        body[key] = val.trim();
      }
    }

    try {
      const res = await fetch("/api/engagements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to create engagement");
      }

      const { id } = await res.json();
      router.push(`/engagements/${id}`);
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: 'action' });
      setError(governed.operatorMessage);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">New Engagement</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a new consulting engagement.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input name="title" label="Engagement Title" required placeholder="Q2 Operational Review" />

        <Select
          name="clientId"
          label="Client"
          required
          defaultValue={presetClientId}
          placeholder="Select client..."
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            name="serviceTier"
            label="Service Tier"
            required
            defaultValue="standard"
            options={[
              { value: "standard", label: "Standard" },
              { value: "premium", label: "Premium" },
              { value: "enterprise", label: "Enterprise" },
            ]}
          />
          <Select
            name="engagementMode"
            label="Engagement Mode"
            required
            defaultValue="expert"
            options={[
              { value: "beginner", label: "Beginner" },
              { value: "expert", label: "Expert" },
            ]}
          />
        </div>

        <Select
          name="interventionMode"
          label="Intervention Mode"
          required
          defaultValue="recovery"
          options={[
            { value: "recovery", label: "Recovery" },
            { value: "stabilization", label: "Stabilization" },
            { value: "growth", label: "Growth" },
            { value: "shock_response", label: "Shock Response" },
            { value: "mixed", label: "Mixed" },
          ]}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input name="startDate" label="Start Date" type="date" />
          <Input name="targetEndDate" label="Target End Date" type="date" />
        </div>

        <Textarea name="description" label="Description" rows={3} placeholder="Engagement scope and objectives..." />

        <div className="flex gap-3 pt-4">
          <Button type="submit" isLoading={isSubmitting}>
            Create Engagement
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/engagements")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
