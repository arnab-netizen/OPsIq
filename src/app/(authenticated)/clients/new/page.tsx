"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea, Select } from "@/ui/primitives";

export default function NewClientPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      name: formData.get("name"),
    };

    const optional = ["legalName", "industry", "website", "address", "notes"];
    for (const key of optional) {
      const val = formData.get(key);
      if (val && typeof val === "string" && val.trim()) {
        body[key] = val.trim();
      }
    }

    const size = formData.get("size");
    if (size && typeof size === "string" && size.trim()) {
      body.size = size.trim();
    }

    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to create client");
      }

      const { id } = await res.json();
      router.push(`/clients/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">New Client</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Add a new client account.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input name="name" label="Company Name" required placeholder="Acme Corp" />
        <Input name="legalName" label="Legal Name" placeholder="Acme Corporation Ltd." />

        <div className="grid grid-cols-2 gap-4">
          <Input name="industry" label="Industry" placeholder="Technology" />
          <Select
            name="size"
            label="Company Size"
            placeholder="Select size..."
            options={[
              { value: "1-10", label: "1-10 employees" },
              { value: "11-50", label: "11-50 employees" },
              { value: "51-200", label: "51-200 employees" },
              { value: "201-500", label: "201-500 employees" },
              { value: "500+", label: "500+ employees" },
            ]}
          />
        </div>

        <Input name="website" label="Website" type="url" placeholder="https://acme.com" />
        <Input name="address" label="Address" placeholder="123 Business Ave, Suite 100" />
        <Textarea name="notes" label="Notes" rows={3} placeholder="Notes about this client..." />

        <div className="flex gap-3 pt-4">
          <Button type="submit" isLoading={isSubmitting}>
            Create Client
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/clients")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
