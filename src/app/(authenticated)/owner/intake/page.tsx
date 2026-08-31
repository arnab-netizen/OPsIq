"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Select, CardDashboardSkeleton } from "@/ui/primitives";
import { sourceQualityTier, type IntakeSource } from "@/domain/owner-intake/types";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic dashboard payloads are untyped; load() fetch-on-mount is intentional */

const VALIDATION_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  valid: "success",
  partial: "warning",
  invalid: "destructive",
};

const TARGET_DOMAINS = ["finance", "sales", "operations", "sop", "marketing"];
const SOURCES = [
  { value: "csv_upload", label: "CSV upload" },
  { value: "manual_form", label: "Manual form" },
  { value: "google_sheets", label: "Google Sheets export" },
  { value: "email_import", label: "Email import" },
  { value: "accounting_export", label: "Accounting export" },
  { value: "pos_order_upload", label: "POS / order upload" },
  { value: "bank_statement", label: "Bank statement" },
  { value: "lead_import", label: "Lead import" },
];

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
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const load = useCallback(async (businessId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = businessId ? `?businessId=${businessId}` : "";
      const data = await api(`/api/owner/intake/dashboard${qs}`);
      setDashboard(data);
      setSelected(data.selectedBusinessId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const intake = await api(`/api/owner/intake/businesses/${selected}/uploads`, {
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
      await load(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(intakeId: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/intake/uploads/${intakeId}/confirm`, { method: "POST" });
      setPreview(null);
      await load(selected);
      setConfirmed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to confirm");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <CardDashboardSkeleton label="Loading data intake" />;

  const businesses: any[] = dashboard?.businesses ?? [];
  const intakes: any[] = dashboard?.intakes ?? [];

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Data Intake & Connectors</h1>
          <p className="text-muted-foreground text-sm">
            Upload a CSV (or paste rows) for a domain. We validate and normalize it, show every error, and nothing feeds a diagnosis until you confirm it.
          </p>
        </div>
        <Button
          onClick={() => setShowUpload((s) => !s)}
          disabled={businesses.length === 0}
          aria-describedby={businesses.length === 0 ? "upload-blocked-reason" : undefined}
        >
          + Upload data
        </Button>
      </div>

      {businesses.length === 0 && (
        <div
          id="upload-blocked-reason"
          data-testid="intake-upload-blocked"
          className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-medium">You need a business profile before you can upload.</p>
          <p className="mt-1">
            Uploads are stored against a business, so OpsIQ needs to know which business the rows
            belong to. Adding one takes about a minute.
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
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800 flex items-center justify-between">
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
          <p>No business profile yet, so there is nowhere to put uploaded data.</p>
          <Link href="/owner/data" className="mt-2 inline-block font-medium text-[var(--primary-text)] underline hover:no-underline">
            Add your business profile →
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <BusinessContextSelector
              businesses={businesses}
              selectedId={selected}
              onChange={(businessId) => { setPreview(null); load(businessId); }}
            />
          </div>

          {showUpload && (
            <form onSubmit={upload} className="mb-6 border rounded-lg p-4 bg-card space-y-3">
              <h2 className="font-semibold">Upload data</h2>
              <div className="grid grid-cols-2 gap-3">
                <Select name="targetDomain" label="Target domain" required options={TARGET_DOMAINS.map((d) => ({ value: d, label: d }))} />
                <Select name="source" label="Source" required options={SOURCES} />
              </div>
              <label className="block text-sm font-medium">CSV content (first row = headers)</label>
              <textarea
                name="csvText"
                required
                rows={6}
                className="w-full border rounded-md p-2 font-mono text-xs"
                placeholder={"periodStart,periodEnd,currency,revenue,fixedCosts\n2026-05-01,2026-05-31,INR,100000,40000"}
              />
              <Input name="notes" label="Notes (optional)" />
              <p className="text-xs text-muted-foreground">
                Columns are matched to the domain&apos;s fields by name. Missing/invalid values are reported, never invented.
              </p>
              <Button type="submit" disabled={busy}>{busy ? "Validating…" : "Validate + normalize"}</Button>
            </form>
          )}

          {preview && <IntakeCandidate intake={preview} busy={busy} onConfirm={confirm} />}

          <section className="border rounded-lg p-4 bg-card">
            <h2 className="font-bold mb-3">Intake history ({intakes.length})</h2>
            {intakes.length === 0 && <p className="text-sm text-muted-foreground">No uploads yet.</p>}
            <div className="space-y-2">
              {intakes.map((it: any) => (
                <div key={it.id} className="flex justify-between items-center border-b py-2 text-sm">
                  <div>
                    <span className="font-medium">{it.targetDomain}</span>{" "}
                    <span className="text-muted-foreground">· {it.source} · {it.rowCount} row(s) · {new Date(it.createdAt).toLocaleDateString()}</span>
                    {it.source && <Badge variant="muted" className="ml-2">{sourceQualityTier(it.source as IntakeSource)}</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={VALIDATION_VARIANT[it.validationStatus] || "muted"}>{it.validationStatus}</Badge>
                    {it.ownerConfirmed ? (
                      <Badge variant="success">confirmed</Badge>
                    ) : it.validationStatus !== "invalid" ? (
                      <Button onClick={() => confirm(it.id)} disabled={busy}>Confirm</Button>
                    ) : (
                      <Badge variant="muted">unconfirmable</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function IntakeCandidate({ intake, busy, onConfirm }: { intake: any; busy: boolean; onConfirm: (id: string) => void }) {
  const errors: any[] = intake.errorReport ?? [];
  const records: any[] = intake.records ?? [];
  return (
    <section className="border-2 border-foreground/10 rounded-lg p-4 bg-card mb-6 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase text-muted-foreground">Candidate — review before confirming</div>
        <Badge variant={VALIDATION_VARIANT[intake.validationStatus] || "muted"}>{intake.validationStatus}</Badge>
      </div>
      <div className="text-sm text-muted-foreground flex flex-wrap gap-2 items-center">
        <span>{intake.targetDomain} · {intake.source} · {intake.rowCount} row(s) · normalization {intake.normalizationStatus}</span>
        {intake.source && (
          <Badge variant="muted">Evidence quality: {sourceQualityTier(intake.source as IntakeSource)}</Badge>
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
              <li key={i}>row {e.row} · {e.field}: {e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {records.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                {Object.keys(records[0]).map((k) => <th key={k} className="py-1 pr-3">{k}</th>)}
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
          <span className="text-xs text-destructive">Fix the source data and re-upload — an invalid intake cannot be confirmed.</span>
        )}
      </div>
    </section>
  );
}
