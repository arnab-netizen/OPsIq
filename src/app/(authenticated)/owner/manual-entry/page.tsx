"use client";

/**
 * Owner Manual Entry (PASS 45) — the dedicated, low-load owner-facing form for logging business operating
 * facts. It maps the friendly owner sections (owner-manual-entry-form) to the proven governed backend
 * (POST /api/owner/manual-entry → submitManualEntry → OwnerDataIntake), one record per save. No business
 * logic here: the server validates, scopes, classifies, gates, and audits. The page blocks PII client-side
 * (the API blocks it again server-side) and never collects personal identities.
 */
import { useState } from "react";
import { Button, FormSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { useActiveBusiness } from "@/context/active-business-context";
import {
  MANUAL_ENTRY_SECTIONS, MANUAL_ENTRY_WARNING, MANUAL_ENTRY_SAFE_COPY,
  validateManualEntry, buildManualEntryFields, type ManualEntrySection, type ManualFieldValue,
} from "@/domain/owner-mode/owner-manual-entry-form";

async function apiPost(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function SectionForm({ section, businessId }: { section: ManualEntrySection; businessId: string }) {
  const [values, setValues] = useState<Record<string, ManualFieldValue>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const setField = (key: string, v: ManualFieldValue) => { setValues((p) => ({ ...p, [key]: v })); setSaved(false); };

  const save = async () => {
    setErrors([]);
    const check = validateManualEntry(section, values);
    if (!check.ok) { setErrors(check.errors); return; }
    setBusy(true);
    try {
      const fields = buildManualEntryFields(values);
      const { ok, data } = await apiPost("/api/owner/manual-entry", { businessId, category: section.category, fields, confirm: true });
      if (!ok || data?.ok === false) {
        setErrors(Array.isArray(data?.errors) && data.errors.length ? data.errors : [data?.error?.message || "That could not be saved. Please check and try again."]);
      } else {
        setSaved(true); setValues({});
      }
    } catch {
      setErrors(["Something went wrong saving that. Please try again."]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid={`manual-entry-section-${section.id}`} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{section.helper}</p>
      {section.fields.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-sm text-foreground">
          <span>{f.label}{f.required ? " *" : ""}</span>
          {f.kind === "text" ? (
            <textarea data-testid={`manual-entry-${f.key}-${section.id}`} rows={3} placeholder={f.placeholder}
              className="w-full rounded-md border border-border p-2 text-sm" value={typeof values[f.key] === "string" ? (values[f.key] as string) : ""}
              onChange={(e) => setField(f.key, e.target.value)} />
          ) : f.kind === "amount" ? (
            <input type="number" min={0} data-testid={`manual-entry-${f.key}-${section.id}`} placeholder={f.placeholder}
              className="w-full rounded-md border border-border p-2 text-sm sm:w-60"
              value={typeof values[f.key] === "number" ? String(values[f.key]) : ""}
              onChange={(e) => setField(f.key, e.target.value === "" ? null : Number(e.target.value))} />
          ) : (
            <input type="text" data-testid={`manual-entry-${f.key}-${section.id}`} placeholder={f.placeholder}
              className="w-full rounded-md border border-border p-2 text-sm"
              value={typeof values[f.key] === "string" ? (values[f.key] as string) : ""}
              onChange={(e) => setField(f.key, e.target.value)} />
          )}
        </label>
      ))}
      {errors.length > 0 && (
        <ul data-testid={`manual-entry-error-${section.id}`} className="rounded-md bg-destructive/10 p-2 text-sm text-[var(--destructive-text)]">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      {saved && (
        <p data-testid={`manual-entry-saved-${section.id}`} className="rounded-md bg-success/10 p-2 text-sm text-[var(--success-text)]">
          Saved. OpsIQ will route this through your governed cockpit — material actions still need your approval and evidence.
        </p>
      )}
      <div>
        <Button data-testid={`manual-entry-save-${section.id}`} onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save this"}
        </Button>
      </div>
    </div>
  );
}

export default function OwnerManualEntryPage() {
  const { businesses, activeBusinessId, needsBusinessRecovery, setActiveBusinessId, loading: contextLoading } = useActiveBusiness();

  if (contextLoading) return <PageContainer narrow><FormSkeleton label="Loading" fields={5} /></PageContainer>;
  if (needsBusinessRecovery) return (
    <PageContainer narrow>
      <p>Your previously selected business is no longer available. Choose a business to continue.</p>
      <BusinessContextSelector businesses={businesses} selectedId={null} onChange={(id) => setActiveBusinessId(id)} />
    </PageContainer>
  );

  const essential = MANUAL_ENTRY_SECTIONS.filter((s) => s.essential);
  const optional = MANUAL_ENTRY_SECTIONS.filter((s) => !s.essential);

  return (
    <PageContainer narrow data-testid="manual-entry-page" className="flex flex-col gap-6">
      <PageHeader
        title="Log business data"
        description="Enter the operating facts OpsIQ needs. One thing at a time is fine."
      />

      {/* Mandatory privacy warning + safe copy — always visible before submission. */}
      <section data-testid="manual-entry-warning" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>{MANUAL_ENTRY_WARNING}</strong>
        <ul data-testid="manual-entry-safecopy" className="mt-2 list-disc pl-5">
          {MANUAL_ENTRY_SAFE_COPY.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </section>

      {businesses.length === 0 ? (
        <p data-testid="manual-entry-no-business" className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          Create a business first (use “+ New business” on an owner page), then come back to log data.
        </p>
      ) : (
        <>
          <BusinessContextSelector
            businesses={businesses}
            selectedId={activeBusinessId}
            onChange={(id) => setActiveBusinessId(id)}
          />

          {activeBusinessId && (
            <>
              {essential.map((s) => (
                <section key={s.id} className="rounded-lg border border-border p-4">
                  <h2 className="mb-2 text-lg font-medium">{s.title}</h2>
                  <SectionForm section={s} businessId={activeBusinessId} />
                </section>
              ))}

              {/* Optional sections collapsed by default (progressive disclosure). */}
              {optional.map((s) => (
                <details key={s.id} data-testid={`manual-entry-optional-${s.id}`} className="rounded-lg border border-border p-4">
                  <summary className="cursor-pointer text-lg font-medium">{s.title}</summary>
                  <div className="mt-3">
                    <SectionForm section={s} businessId={activeBusinessId} />
                  </div>
                </details>
              ))}
            </>
          )}

          <div data-testid="manual-entry-success" className="rounded-md bg-muted p-3 text-sm text-foreground">
            When you’re done, review your next step on Home.{" "}
            <a data-testid="manual-entry-cockpit-link" href="/owner/cockpit" className="font-medium underline">Go to Home</a>.
            OpsIQ won’t contact anyone or take any external action.
          </div>
        </>
      )}
    </PageContainer>
  );
}
