"use client";

/**
 * /admin/beta-programme — admission mode + capacity control, bootstrap
 * state, and the beta-request table with Invite/Revoke/Re-invite/Reject/
 * Re-open actions. Reuses the existing /admin/beta-requests list API and
 * adds the new lifecycle actions + the governed settings/bootstrap surface.
 *
 * All server-side validation, capability checks, and rate limits are
 * enforced by the underlying API routes — this page adds no authorization
 * of its own.
 */

import { useEffect, useState } from "react";
import { Badge, Button, LoadingState, Table, Input, Select } from "@/ui/primitives";
import { GovernedEmptyState } from "@/components/ui/GovernedEmptyState";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { createClientIdempotencyKey } from "@/lib/client-idempotency";

interface BetaRequestRow {
  id: string;
  email: string;
  firstName: string | null;
  status: string;
  utmSource: string | null;
  utmCampaign: string | null;
  invitedAt: string | null;
  invitedBy: string | null;
  createdAt: string;
}

interface Settings {
  admissionMode: string;
  capacityLimit: number;
  source: "database" | "legacy";
}

interface BootstrapPreview {
  admissionMode: string;
  capacityLimit: number;
  alreadyInitialized: boolean;
  qaContaminationDetected: boolean;
}

interface OverviewCapacity {
  admitted: number;
  verified: number;
  pending: number;
  limit: number;
  admissionMode: string;
}

const ADMISSION_MODES = ["CLOSED", "WAITLIST", "INVITE_ONLY", "OPEN_BETA"];

async function jsonOrThrow(res: Response, fallback: string) {
  if (!res.ok) {
    if (res.status === 403) {
      const err = new Error("Forbidden") as Error & { httpStatus?: number };
      err.httpStatus = 403;
      throw err;
    }
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? fallback);
  }
  return res.json();
}

interface LoadSetters {
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setForbidden: (v: boolean) => void;
  setRows: (v: BetaRequestRow[]) => void;
  setListFailed: (v: boolean) => void;
  setSettings: (v: Settings) => void;
  setCapacityInput: (v: string) => void;
  setModeInput: (v: string) => void;
  setBootstrapPreview: (v: BootstrapPreview) => void;
}

/** Shared by the initial load (inside useEffect), the "Try again" retry button, and post-bootstrap reload. */
async function loadBetaProgramme(setters: LoadSetters): Promise<void> {
  setters.setLoading(true);
  setters.setError(null);
  setters.setForbidden(false);
  try {
    // The admission controls are the critical part of this page (they are how signups are stopped from a phone), so
    // they load independently of the request list: a failing or slow list must never hide the mode control.
    const [settingsRes, bootstrapRes, listResult] = await Promise.all([
      fetch("/api/admin/platform-settings"),
      fetch("/api/admin/platform-settings/bootstrap"),
      fetch("/api/admin/beta-requests")
        .then((r) => jsonOrThrow(r, "Failed to load beta requests"))
        .then((v) => ({ ok: true as const, v }), () => ({ ok: false as const })),
    ]);
    const settingsData: Settings = await jsonOrThrow(settingsRes, "Failed to load settings");
    const bootstrapData: BootstrapPreview = await jsonOrThrow(bootstrapRes, "Failed to load bootstrap preview");
    setters.setRows(listResult.ok ? (listResult.v.betaRequests as BetaRequestRow[]) : []);
    setters.setListFailed(!listResult.ok);
    setters.setSettings(settingsData);
    setters.setCapacityInput(String(settingsData.capacityLimit));
    setters.setModeInput(settingsData.admissionMode);
    setters.setBootstrapPreview(bootstrapData);
    setters.setLoading(false);
  } catch (e) {
    const tagged = e as Error & { httpStatus?: number };
    if (tagged.httpStatus === 403) {
      setters.setForbidden(true);
      setters.setLoading(false);
      return;
    }
    const governed = classifyOperatorError(e instanceof Error ? e : new Error(String(e)), { context: "load" });
    setters.setError(governed.operatorMessage);
    setters.setLoading(false);
  }
}

export default function AdminBetaProgrammePage() {
  const [rows, setRows] = useState<BetaRequestRow[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [bootstrapPreview, setBootstrapPreview] = useState<BootstrapPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [capacityInput, setCapacityInput] = useState("");
  const [modeInput, setModeInput] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [bootstrapAcknowledge, setBootstrapAcknowledge] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [capacity, setCapacity] = useState<OverviewCapacity | null | "unavailable">(null);

  // The "where are we right now" panel loads on its own: it must never delay or hide the stop-signups control.
  const refreshCapacity = () => {
    fetch("/api/admin/overview")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("overview"))))
      .then((v) => setCapacity(v.capacity as OverviewCapacity))
      .catch(() => setCapacity("unavailable"));
  };

  useEffect(() => {
    refreshCapacity();
    void loadBetaProgramme({
      setLoading,
      setError,
      setForbidden,
      setRows,
      setListFailed,
      setSettings,
      setCapacityInput,
      setModeInput,
      setBootstrapPreview,
    });
    // Runs once on mount only — setState identities are stable across
    // renders, so this intentionally has no other dependencies.
  }, []);

  const handleAction = async (id: string, action: "invite" | "revoke" | "reject" | "reopen") => {
    setBusyId(id);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const idempotencyKey = createClientIdempotencyKey(`beta-${action}-${id}`);
      const res = await fetch(`/api/admin/beta-requests/${id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      });
      const result = await jsonOrThrow(res, `Failed to ${action} this request`);
      setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, status: result.status, invitedAt: result.invitedAt ?? r.invitedAt } : r)) ?? null);
    } catch (e) {
      const governed = classifyOperatorError(e instanceof Error ? e : new Error(String(e)), { context: "action" });
      setRowErrors((prev) => ({ ...prev, [id]: governed.operatorMessage }));
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Sends ONLY what the operator changed. A page left open for hours must not overwrite a newer capacity or mode with
   * stale form values, and "Stop new signups now" sends the mode alone.
   */
  const saveSettings = async (patch: { admissionMode?: string; capacityLimit?: number }) => {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const idempotencyKey = createClientIdempotencyKey("platform-settings-update");
      const res = await fetch("/api/admin/platform-settings", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify(patch),
      });
      const result: Settings = await jsonOrThrow(res, "Failed to update settings");
      setSettings(result);
      refreshCapacity();
      setModeInput(result.admissionMode);
      setCapacityInput(String(result.capacityLimit));
    } catch (e) {
      const governed = classifyOperatorError(e instanceof Error ? e : new Error(String(e)), { context: "action" });
      setSettingsError(governed.operatorMessage);
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSaveSettings = () => {
    const patch: { admissionMode?: string; capacityLimit?: number } = {};
    if (settings && modeInput !== settings.admissionMode) patch.admissionMode = modeInput;
    if (settings && Number(capacityInput) !== settings.capacityLimit) patch.capacityLimit = Number(capacityInput);
    if (Object.keys(patch).length === 0) return Promise.resolve();
    return saveSettings(patch);
  };

  const handleStopSignups = () => saveSettings({ admissionMode: "CLOSED" });

  const handleBootstrap = async () => {
    setBootstrapping(true);
    setSettingsError(null);
    try {
      const idempotencyKey = createClientIdempotencyKey("platform-settings-bootstrap");
      const res = await fetch("/api/admin/platform-settings/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ confirm: true, acknowledgeQaContamination: bootstrapAcknowledge }),
      });
      await jsonOrThrow(res, "Failed to initialize platform settings");
      await loadBetaProgramme({
        setLoading,
        setError,
        setForbidden,
        setRows,
        setListFailed,
        setSettings,
        setCapacityInput,
        setModeInput,
        setBootstrapPreview,
      });
    } catch (e) {
      const governed = classifyOperatorError(e instanceof Error ? e : new Error(String(e)), { context: "action" });
      setSettingsError(governed.operatorMessage);
    } finally {
      setBootstrapping(false);
    }
  };

  const sourceOf = (row: BetaRequestRow) => [row.utmSource, row.utmCampaign].filter(Boolean).join(" / ") || "—";
  const statusBadge = (row: BetaRequestRow) => (
    <Badge variant={row.status === "INVITED" ? "success" : row.status === "REJECTED" || row.status === "REVOKED" ? "destructive" : "outline"}>
      {row.status}
    </Badge>
  );
  const rowActions = (row: BetaRequestRow, stacked: boolean) => (
    <div className="flex flex-col items-stretch gap-1 sm:items-start">
      <div className={stacked ? "flex flex-col gap-2" : "flex gap-2"}>
        {row.status === "REQUESTED" && (
          <>
            <Button size="sm" variant="secondary" className={stacked ? "w-full" : ""} disabled={busyId === row.id} isLoading={busyId === row.id} onClick={() => void handleAction(row.id, "invite")}>
              Invite
            </Button>
            <Button size="sm" variant="outline" className={stacked ? "w-full" : ""} disabled={busyId === row.id} onClick={() => void handleAction(row.id, "reject")}>
              Reject
            </Button>
          </>
        )}
        {row.status === "INVITED" && (
          <>
            <Button size="sm" variant="outline" className={stacked ? "w-full" : ""} disabled={busyId === row.id} onClick={() => void handleAction(row.id, "revoke")}>
              Revoke
            </Button>
            <Button size="sm" variant="secondary" className={stacked ? "w-full" : ""} disabled={busyId === row.id} onClick={() => void handleAction(row.id, "invite")}>
              Re-invite
            </Button>
          </>
        )}
        {row.status === "REVOKED" && (
          <Button size="sm" variant="secondary" className={stacked ? "w-full" : ""} disabled={busyId === row.id} onClick={() => void handleAction(row.id, "invite")}>
            Re-invite
          </Button>
        )}
        {row.status === "REJECTED" && (
          <Button size="sm" variant="secondary" className={stacked ? "w-full" : ""} disabled={busyId === row.id} onClick={() => void handleAction(row.id, "reopen")}>
            Re-open &amp; invite
          </Button>
        )}
      </div>
      {rowErrors[row.id] && <p className="text-xs text-destructive">{rowErrors[row.id]}</p>}
    </div>
  );

  if (loading) return <LoadingState message="Loading beta programme..." />;
  if (forbidden) return <GovernedEmptyState reason="permission_denied" />;
  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() =>
              void loadBetaProgramme({
                setLoading,
                setError,
                setForbidden,
                setRows,
                setListFailed,
                setSettings,
                setCapacityInput,
                setModeInput,
                setBootstrapPreview,
              })
            }
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold">Beta programme</h1>
        <p className="text-gray-600">Admission mode, capacity, and access requests.</p>
      </div>

      <section className="space-y-2 rounded-lg border border-border bg-background p-4" data-testid="beta-state-panel" aria-live="polite">
        <h2 className="text-lg font-semibold">Right now</h2>
        <p className="text-base" data-testid="beta-state-mode">
          Signups:{" "}
          <strong data-testid="beta-state-mode-value">
            {settings?.admissionMode === "OPEN_BETA"
              ? "OPEN to anyone"
              : settings?.admissionMode === "INVITE_ONLY"
                ? "Invite only"
                : settings?.admissionMode === "WAITLIST"
                  ? "Waitlist only"
                  : settings?.admissionMode === "CLOSED"
                    ? "CLOSED"
                    : "unknown"}
          </strong>
        </p>
        {capacity === "unavailable" && <p className="text-sm text-gray-700">Capacity numbers couldn&rsquo;t load. The controls below still work.</p>}
        {capacity && capacity !== "unavailable" && (
          <p className="text-base" data-testid="beta-state-capacity">
            Places used: <strong>{capacity.admitted} of {capacity.limit}</strong>{" "}
            <span className="text-sm text-gray-700">({capacity.verified} verified, {capacity.pending} waiting to verify; a waiting place lapses after 24 hours)</span>
          </p>
        )}
        {!capacity && <p className="text-sm text-gray-700">Loading capacity…</p>}
      </section>

      <section className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4" data-testid="stop-signups-panel">
        <h2 className="text-lg font-semibold">Stop new signups</h2>
        <p className="text-sm text-gray-700">
          Closes registration immediately for new people. Accounts that already exist keep working. You can reopen it below.
        </p>
        <Button
          className="min-h-11 w-full sm:w-auto"
          onClick={() => void handleStopSignups()}
          isLoading={settingsSaving}
          disabled={settingsSaving || settings?.admissionMode === "CLOSED" || !bootstrapPreview?.alreadyInitialized}
          data-testid="stop-signups-button"
        >
          {settings?.admissionMode === "CLOSED" ? "Signups are closed" : "Stop new signups now"}
        </Button>
        {!bootstrapPreview?.alreadyInitialized && (
          <p className="text-xs text-gray-700">Initialize platform settings first (further down this page) — until then this control cannot be saved.</p>
        )}
        {settingsError && <p className="text-sm text-destructive">{settingsError}</p>}
      </section>

      {bootstrapPreview && !bootstrapPreview.alreadyInitialized && (
        <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-lg font-semibold">Initialize platform settings</h2>
          <p className="text-sm text-gray-700">
            Currently running on legacy environment defaults. Initializing captures the exact live values below into a
            governed, dynamically-editable setting — no Vercel redeploy needed for future changes.
          </p>
          <div className="rounded border bg-white p-3 text-sm">
            <p>
              <strong>Admission:</strong> {bootstrapPreview.admissionMode}
            </p>
            <p>
              <strong>Capacity:</strong> {bootstrapPreview.capacityLimit}
            </p>
          </div>
          {bootstrapPreview.qaContaminationDetected && (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">Potential non-customer beta-tagged workspace detected.</p>
              <p className="mt-1">
                A known non-customer workspace appears to be tagged with a real beta signup source and would count
                toward capacity. Resolve this separately, or explicitly acknowledge to proceed anyway.
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={bootstrapAcknowledge}
                  onChange={(e) => setBootstrapAcknowledge(e.target.checked)}
                />
                I acknowledge this and want to proceed
              </label>
            </div>
          )}
          {settingsError && <p className="text-sm text-destructive">{settingsError}</p>}
          <Button
            onClick={() => void handleBootstrap()}
            isLoading={bootstrapping}
            disabled={bootstrapping || (bootstrapPreview.qaContaminationDetected && !bootstrapAcknowledge)}
          >
            Confirm initialization
          </Button>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Admission mode &amp; capacity</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div>
            <Select
              label="Admission mode"
              value={modeInput}
              onChange={(e) => setModeInput(e.target.value)}
              options={ADMISSION_MODES.map((m) => ({ value: m, label: m }))}
            />
          </div>
          <div>
            <Input label="Capacity limit" type="number" inputMode="numeric" min={1} value={capacityInput} onChange={(e) => setCapacityInput(e.target.value)} className="w-full sm:w-32" />
          </div>
          <Button className="min-h-11 w-full sm:w-auto" onClick={() => void handleSaveSettings()} isLoading={settingsSaving} disabled={settingsSaving}>
            Save
          </Button>
        </div>
        {settingsError && !bootstrapPreview?.qaContaminationDetected && <p className="text-sm text-destructive">{settingsError}</p>}
        {settings?.source === "legacy" && (
          <p className="text-xs text-muted-foreground">
            Reading from legacy environment defaults — initialize above to make this editable without a redeploy.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Requests</h2>
        {listFailed && (
          <p role="alert" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-gray-800">
            The request list couldn&rsquo;t load. The admission controls above still work.
          </p>
        )}
        {/* Phones: one card per request (nothing scrolls sideways and every action is a full-width 44px target). */}
        <ul className="space-y-3 sm:hidden" data-testid="beta-requests-cards">
          {(rows ?? []).length === 0 && <li><GovernedEmptyState reason="no_data" helpText="No beta requests have been received yet." /></li>}
          {(rows ?? []).map((row) => (
            <li key={row.id} className="space-y-2 rounded-lg border border-border p-3" data-testid="beta-request-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{row.firstName ?? "—"}</p>
                  <p className="break-all text-sm text-gray-700">{row.email}</p>
                </div>
                {statusBadge(row)}
              </div>
              <p className="text-xs text-gray-700">Requested {new Date(row.createdAt).toLocaleString()}</p>
              {sourceOf(row) !== "—" && <p className="text-xs text-gray-700">Source: {sourceOf(row)}</p>}
              {rowActions(row, true)}
            </li>
          ))}
        </ul>
        <div className="hidden sm:block">
        <Table
          columns={[
            { key: "name", header: "Name", render: (row: BetaRequestRow) => row.firstName ?? "—" },
            { key: "email", header: "Email", render: (row: BetaRequestRow) => row.email },
            { key: "requested", header: "Requested", render: (row: BetaRequestRow) => new Date(row.createdAt).toLocaleString() },
            { key: "source", header: "Source / campaign", render: (row: BetaRequestRow) => sourceOf(row) },
            { key: "status", header: "Status", render: (row: BetaRequestRow) => statusBadge(row) },
            { key: "action", header: "", render: (row: BetaRequestRow) => rowActions(row, false) },
          ]}
          data={rows ?? []}
          keyExtractor={(row) => row.id}
          emptyState={<GovernedEmptyState reason="no_data" helpText="No beta requests have been received yet." />}
        />
        </div>
      </section>
    </div>
  );
}
