"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Select, CardDashboardSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
import { sourceQualityTier, type IntakeSource } from "@/domain/owner-intake/types";
import { fieldSpecForDomain } from "@/domain/owner-intake/field-specs";
import { INPUT_CATALOG, type OwnerInputCategory } from "@/domain/owner-mode/input-catalog";
import { humanizeMetricKey, humanizeSnakeCase } from "@/lib/metric-label";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { useActiveBusiness } from "@/context/active-business-context";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic dashboard payloads are untyped; load() fetch-on-mount is intentional */

const VALIDATION_VARIANT: Record<string, "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  valid: "success-accessible",
  partial: "warning-accessible",
  invalid: "destructive-accessible",
};
const VALIDATION_LABEL: Record<string, string> = {
  valid: "Valid",
  partial: "Partial",
  invalid: "Invalid",
};

const TARGET_DOMAINS = ["finance", "sales", "operations", "sop", "marketing"];
const SOURCES = [
  // Label corrected to match the actual mechanism: there is no file upload anywhere on this
  // page, only a pasted-CSV-text textarea. The stored value ("csv_upload") is preserved
  // unchanged -- it is persisted on existing intake records and read by intake history/audit
  // consumers -- only its human-facing label changed.
  { value: "csv_upload", label: "Pasted CSV" },
  { value: "manual_form", label: "Manual form" },
  { value: "google_sheets", label: "Google Sheets export" },
  { value: "email_import", label: "Email import" },
  { value: "accounting_export", label: "Accounting export" },
  { value: "pos_order_upload", label: "POS / order upload" },
  { value: "bank_statement", label: "Bank statement" },
  { value: "lead_import", label: "Lead import" },
];
// Verified against the domain nav array in owner/page.tsx (same domain keys, same labels).
const DOMAIN_LABEL: Record<string, string> = {
  finance: "Finance",
  sales: "Sales",
  operations: "Operations",
  sop: "Execution",
  marketing: "Marketing",
};
const SOURCE_LABEL: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.value, s.label]));
// Intake history mixes two write paths: CSV uploads (owner-intake/intake.service.ts), whose
// targetDomain is always one of the 5 keys in DOMAIN_LABEL above, and manual-entry submissions
// (owner-manual-entry.service.ts), which persist the raw OwnerInputCategory (e.g. "cash_debt",
// "equipment_logs") as targetDomain -- a different, 20-value taxonomy from the same
// domain/owner-mode/input-catalog.ts source of truth used by onboarding/data-hub/readiness-score.
// DOMAIN_LABEL doesn't cover those, so they rendered raw. INPUT_CATALOG is a total map over every
// real OwnerInputCategory value; humanizeSnakeCase is the safety-net fallback for any future
// targetDomain value from neither taxonomy, so nothing ever renders blank or raw.
function intakeDomainLabel(value: string): string {
  if (DOMAIN_LABEL[value]) return DOMAIN_LABEL[value];
  const catalogEntry = INPUT_CATALOG[value as OwnerInputCategory];
  if (catalogEntry) return catalogEntry.label;
  return humanizeSnakeCase(value);
}
// Verified against IntakeNormalizationStatus / engine.ts's two possible values.
const NORMALIZATION_LABEL: Record<string, string> = {
  normalized: "Normalized",
  not_normalized: "Not normalized",
};

// The candidate-preview table (below) renders the confirmed/normalized records' own column
// names as headers, and the error list renders each error's raw `field`. Both are the intake
// engine's internal field names (e.g. "cashOnHand", "periodStart") -- prefer the target domain's
// own canonical IntakeFieldSpec.label where one is authored, otherwise fall back to the generic
// camelCase humanizer so no raw internal identifier ever reaches the owner.
function fieldLabel(domain: string, key: string): string {
  const spec = fieldSpecForDomain(domain)?.find((f) => f.name === key);
  if (spec?.label) return spec.label;
  const words = humanizeMetricKey(key);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

export default function OwnerIntakePage() {
  const router = useRouter();
  const { businesses, activeBusinessId, needsBusinessRecovery, setActiveBusinessId, loading: contextLoading } = useActiveBusiness();
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const requestSeq = useRef(0);

  const load = useCallback(async (businessId: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api(`/api/owner/intake/dashboard?businessId=${businessId}`);
      if (requestSeq.current !== seq) return;
      setDashboard(data);
    } catch (e) {
      if (requestSeq.current !== seq) return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contextLoading) return;
    if (needsBusinessRecovery) return;
    if (!activeBusinessId) { setDashboard(null); setLoading(false); return; }
    void load(activeBusinessId);
  }, [contextLoading, activeBusinessId, needsBusinessRecovery, load]);

  const onSwitchBusiness = useCallback((id: string) => {
    setLoading(true);
    setPreview(null);
    setActiveBusinessId(id);
  }, [setActiveBusinessId]);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeBusinessId) return;
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const intake = await api(`/api/owner/intake/businesses/${activeBusinessId}/uploads`, {
        method: "POST",
        body: JSON.stringify({
          source: fd.get("source"),
          targetDomain: fd.get("targetDomain"),
          csvText: fd.get("csvText"),
          notes: fd.get("notes") || undefined,
        }),
      });
      setPreview(intake);
      setShowUpload(false);
      await load(activeBusinessId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(intakeId: string) {
    if (!activeBusinessId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/intake/uploads/${intakeId}/confirm`, { method: "POST" });
      setPreview(null);
      await load(activeBusinessId);
      setConfirmed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to confirm");
    } finally {
      setBusy(false);
    }
  }

  if (contextLoading || loading) return <CardDashboardSkeleton label="Loading data intake" />;
  if (needsBusinessRecovery) return (
    <PageContainer>
      <p>Your previously selected business is no longer available. Choose a business to continue.</p>
      <BusinessContextSelector businesses={businesses} selectedId={null} onChange={onSwitchBusiness} />
    </PageContainer>
  );

  const intakes: any[] = dashboard?.intakes ?? [];

  return (
    <PageContainer>
      <div className="mb-6">
        <PageHeader
          title="Add business data"
          description="Already have your numbers in a spreadsheet? Paste them here. We check every row, show any problems, and nothing is added to your analysis until you confirm it. You do not need this to get your first read — start with your basic numbers on the Money page."
          actions={
            <Button
              onClick={() => setShowUpload((s) => !s)}
              disabled={businesses.length === 0}
              aria-describedby={businesses.length === 0 ? "upload-blocked-reason" : undefined}
            >
              + Paste spreadsheet data
            </Button>
          }
        />
      </div>

      {businesses.length === 0 && (
        <div
          id="upload-blocked-reason"
          data-testid="intake-upload-blocked"
          className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-medium">You need a business profile before you can add data.</p>
          <p className="mt-1">
            Data you add here is stored against a business, so OpsIQ needs to know which business
            the rows belong to. Adding one takes about a minute.
          </p>
          <Link
            href="/owner/data"
            data-testid="intake-upload-blocked-cta"
            className="mt-2 inline-block font-medium underline hover:no-underline"
          >
            Add your business profile →
          </Link>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {dashboard?.priorityGuidance && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <strong>Priority:</strong> {dashboard.priorityGuidance}
        </div>
      )}

      {confirmed && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800 flex flex-wrap items-center justify-between gap-2">
          <span>Data confirmed. OpsIQ is now ready to analyze your business.</span>
          <button
            onClick={() => router.push("/owner")}
            className="ml-4 font-medium underline hover:no-underline whitespace-nowrap"
          >
            Go to Command Center →
          </button>
        </div>
      )}

      {businesses.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <p>No business profile yet, so there is nowhere to put the data you add.</p>
          <Link href="/owner/data" className="mt-2 inline-block font-medium text-[var(--primary-text)] underline hover:no-underline">
            Add your business profile →
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <BusinessContextSelector
              businesses={businesses}
              selectedId={activeBusinessId}
              onChange={onSwitchBusiness}
            />
          </div>

          {showUpload && (
            <form onSubmit={upload} className="mb-6 border rounded-lg p-4 bg-card space-y-3">
              <h2 className="font-semibold">Paste spreadsheet data</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select name="targetDomain" label="What kind of data is this?" required options={TARGET_DOMAINS.map((d) => ({ value: d, label: DOMAIN_LABEL[d] ?? d }))} />
                <Select name="source" label="Where did this data come from?" required options={SOURCES} />
              </div>
              <label htmlFor="intake-csv-text" className="block text-sm font-medium">CSV content (first row = headers)</label>
              <textarea
                id="intake-csv-text"
                name="csvText"
                required
                rows={6}
                className="w-full rounded-md border p-3 font-mono text-base sm:p-2 sm:text-xs"
                placeholder={"periodStart,periodEnd,currency,revenue,fixedCosts\n2026-05-01,2026-05-31,INR,100000,40000"}
              />
              <Input name="notes" label="Notes (optional)" />
              <p className="text-xs text-muted-foreground">
                Columns are matched to the domain&apos;s fields by name. Missing/invalid values are reported, never invented.
              </p>
              <Button type="submit" disabled={busy}>{busy ? "Validating…" : "Check and review"}</Button>
            </form>
          )}

          {preview && <IntakeCandidate intake={preview} busy={busy} onConfirm={confirm} />}

          <section className="border rounded-lg p-4 bg-card">
            <h2 className="font-bold mb-3">Previously added data ({intakes.length})</h2>
            {intakes.length === 0 && <p className="text-sm text-muted-foreground">No data added yet.</p>}
            <div className="space-y-2">
              {intakes.map((it: any) => (
                <div key={it.id} className="flex flex-wrap justify-between items-center gap-2 border-b py-2 text-sm">
                  <div>
                    <span className="font-medium">{intakeDomainLabel(it.targetDomain)}</span>{" "}
                    <span className="text-muted-foreground">· {SOURCE_LABEL[it.source] ?? it.source} · {it.rowCount} row(s) · {new Date(it.createdAt).toLocaleDateString()}</span>
                    {it.source && <Badge variant="muted-accessible" className="ml-2">{sourceQualityTier(it.source as IntakeSource)}</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={VALIDATION_VARIANT[it.validationStatus] || "muted-accessible"}>{VALIDATION_LABEL[it.validationStatus] ?? it.validationStatus}</Badge>
                    {it.ownerConfirmed ? (
                      <Badge variant="success-accessible">Confirmed</Badge>
                    ) : it.validationStatus !== "invalid" ? (
                      <Button onClick={() => confirm(it.id)} disabled={busy}>Confirm</Button>
                    ) : (
                      <Badge variant="muted-accessible">unconfirmable</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </PageContainer>
  );
}

function IntakeCandidate({ intake, busy, onConfirm }: { intake: any; busy: boolean; onConfirm: (id: string) => void }) {
  const errors: any[] = intake.errorReport ?? [];
  const records: any[] = intake.records ?? [];
  return (
    <section className="border-2 border-foreground/10 rounded-lg p-4 bg-card mb-6 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase text-muted-foreground">Review before adding</div>
        <Badge variant={VALIDATION_VARIANT[intake.validationStatus] || "muted-accessible"}>{VALIDATION_LABEL[intake.validationStatus] ?? intake.validationStatus}</Badge>
      </div>
      <div className="text-sm text-muted-foreground flex flex-wrap gap-2 items-center">
        <span>{DOMAIN_LABEL[intake.targetDomain] ?? intake.targetDomain} · {SOURCE_LABEL[intake.source] ?? intake.source} · {intake.rowCount} row(s) · checked: {NORMALIZATION_LABEL[intake.normalizationStatus] ?? intake.normalizationStatus}</span>
        {intake.source && (
          <Badge variant="muted-accessible">Evidence quality: {sourceQualityTier(intake.source as IntakeSource)}</Badge>
        )}
      </div>
      {Array.isArray(intake.unmappedColumns) && intake.unmappedColumns.length > 0 && (
        <p className="text-xs text-muted-foreground">Unmapped columns (ignored): {intake.unmappedColumns.join(", ")}</p>
      )}

      {errors.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs">
          <strong>{errors.length} issue(s):</strong>
          <ul className="list-disc ml-4 mt-1">
            {errors.slice(0, 12).map((e: any, i: number) => (
              <li key={i}>row {e.row} · {fieldLabel(intake.targetDomain, e.field)}: {e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {records.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                {Object.keys(records[0]).map((k) => <th key={k} className="py-1 pr-3">{fieldLabel(intake.targetDomain, k)}</th>)}
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 5).map((rec: any, i: number) => (
                <tr key={i} className="border-b">
                  {Object.keys(records[0]).map((k) => <td key={k} className="py-1 pr-3">{rec[k] === null ? "—" : String(rec[k])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2 items-center">
        {intake.validationStatus !== "invalid" ? (
          <Button onClick={() => onConfirm(intake.id)} disabled={busy}>Confirm this intake</Button>
        ) : (
          <span className="text-xs text-destructive">Fix the source data and paste it in again — an invalid intake cannot be confirmed.</span>
        )}
      </div>
    </section>
  );
}
