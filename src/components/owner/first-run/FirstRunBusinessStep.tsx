"use client";

/**
 * Step A — the business profile. The business name was typed once at signup and is shown here, not asked
 * again; only the type and currency are genuinely new. Submission goes to the canonical, idempotent
 * first-run business route. Presentation only.
 */
import { useRef, useState } from "react";
import { Button, Input, Select } from "@/ui/primitives";
import { BUSINESS_TYPE_OPTIONS } from "@/domain/owner-mode/owner-data-hub";
import { firstRunApi } from "@/lib/owner-first-run-client";
import { classifyOperatorError } from "@/lib/operator-error-governance";

const CURRENCIES = ["GBP", "USD", "EUR", "INR"] as const;

export function FirstRunBusinessStep({
  suggestedName,
  onCreated,
}: {
  suggestedName: string | null;
  onCreated: (business: { id: string; name: string }) => void;
}) {
  const [businessType, setBusinessType] = useState("");
  const [currency, setCurrency] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(suggestedName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const ready = businessType !== "" && currency !== "" && (!renaming || name.trim().length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current || !ready) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const { business } = await firstRunApi.createBusiness({
        businessType,
        currency,
        ...(renaming && name.trim() ? { name: name.trim() } : {}),
      });
      onCreated(business);
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "save" });
      setError(`We couldn't set up your business yet. Nothing was lost. ${governed.recovery}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate data-testid="first-run-business-step" className="rounded-lg border border-border bg-background p-4">
      <h2 className="text-lg font-semibold text-foreground">Two quick questions about {suggestedName ? <span data-testid="first-run-business-name">{renaming ? name || "your business" : suggestedName}</span> : "your business"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">This lets OpsIQ ask for the right things first.</p>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <Select
          label="What kind of business is it?"
          required
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          placeholder="Choose one"
          options={BUSINESS_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <Select
          label="Which currency do you work in?"
          required
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          placeholder="Choose one"
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
      </div>

      {suggestedName && !renaming && (
        <p className="mt-3 text-sm text-muted-foreground">
          Not the right name?{" "}
          <button type="button" className="min-h-11 underline" onClick={() => setRenaming(true)} data-testid="first-run-rename">
            Change it
          </button>
        </p>
      )}
      {(renaming || !suggestedName) && (
        <div className="mt-3">
          <Input label="Business name" name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" data-testid="first-run-business-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!ready || busy} className="mt-4 w-full sm:w-auto" data-testid="first-run-business-submit">
        {busy ? "Setting up…" : "Continue"}
      </Button>
    </form>
  );
}
