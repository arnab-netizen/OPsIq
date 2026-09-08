"use client";

import { useState } from "react";
import { Button, Select } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { BUSINESS_TYPE_OPTIONS } from "@/domain/owner-mode/owner-data-hub";
import { useActiveBusiness } from "@/context/active-business-context";

const FETCH_TIMEOUT_MS = 10_000;

async function api(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("That took too long. Check your connection and try again.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Blocking first step of both /owner/data and /owner/onboarding: without a business record
 * nothing else on either page can accept data. Shared here (was previously duplicated as a local
 * component in owner/data/page.tsx) so both surfaces create a business the same way, through the
 * same governed POST /api/owner/recovery/businesses route.
 */
export function CreateBusinessPanel({ onCreated }: { onCreated: () => void }) {
  const { refreshBusinesses, setActiveBusinessId } = useActiveBusiness();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const created = await api("/api/owner/recovery/businesses", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          businessType: fd.get("businessType"),
          currency: fd.get("currency"),
          b2cSupported: true,
          b2bSupported: false,
        }),
      });
      // Root cause of "Save appears to do nothing": ActiveBusinessContext (the shared source every
      // owner page reads to decide which business is active — see active-business-context.tsx) is
      // fetched once when the app shell mounts and was never told a business had just been
      // created. The new business existed in the database (creation itself never failed in
      // testing) but stayed invisible everywhere except this page's own local reload, so a real
      // human retester who then went to Home saw no business at all. Refresh the shared context
      // and explicitly activate the new business so it is immediately visible on every page.
      await refreshBusinesses();
      if (created?.id) setActiveBusinessId(created.id as string);
      setJustCreated(true);
      onCreated();
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), {
        context: "save",
      });
      setError(governed.operatorMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-6" data-testid="data-hub-create-business">
      <h2 className="text-lg font-semibold text-foreground">Start with your business profile</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        OpsIQ keeps your records against a business. Until you add one, there is nowhere to put your
        revenue, costs or uploads — so this is the first step.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3" aria-label="Create your business profile">
        <label className="flex flex-col gap-1 text-sm text-foreground">
          <span>Business name *</span>
          <input
            name="name"
            required
            data-testid="data-hub-business-name"
            className="w-full rounded-md border border-border p-2 text-sm sm:w-96"
            placeholder="e.g. Harbour Street Bakery"
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select
            name="businessType"
            label="What kind of business is it?"
            required
            options={[...BUSINESS_TYPE_OPTIONS]}
          />
          <Select
            name="currency"
            label="Currency"
            required
            options={[
              { value: "GBP", label: "GBP" },
              { value: "USD", label: "USD" },
              { value: "EUR", label: "EUR" },
              { value: "INR", label: "INR" },
            ]}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {/* aria-live region: announces loading and success even though this panel is normally
            unmounted almost immediately after success (the parent page swaps it for the business
            hub once it sees a business) — a low-literacy owner using a screen reader, or on a slow
            connection where the swap lags, still gets an explicit status instead of silence. */}
        <p aria-live="polite" className="sr-only">
          {busy ? "Saving your business profile…" : justCreated ? "Business created." : ""}
        </p>
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save business profile"}
        </Button>
      </form>
    </div>
  );
}
