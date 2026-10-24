"use client";

/**
 * QuickBooks connection card — rendered inside the existing "My Business" integrations area (/owner/data).
 *
 * This component holds NO business rules. Everything it shows or offers comes from the server's bounded status document
 * (GET /api/owner/integrations/quickbooks/status): the state, the freshness, the failure sentence and which actions are
 * allowed. Connect/Reconnect POST to the governed connect route and follow the Intuit URL it returns; Disconnect and Refresh
 * call their governed routes. Outcomes of the OAuth round-trip arrive as ONE closed token in `?quickbooks=` and are worded by
 * the domain (qboOutcomeMessage), never by provider text.
 */
/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the established owner-page pattern */
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { qboOutcomeMessage, QBO_OUTCOME_QUERY_KEY } from "@/domain/quickbooks/qbo-connect-outcomes";

interface Period {
  periodStart: string;
  finance: "QUICKBOOKS" | "MANUAL" | null;
  cashflow: "QUICKBOOKS" | "MANUAL" | null;
}

export interface QboStatusView {
  available: boolean;
  environment: "sandbox" | "production" | null;
  state: "NOT_CONNECTED" | "CONNECTING" | "IMPORTING" | "CONNECTED" | "STALE" | "SYNC_ERROR" | "REAUTH_REQUIRED" | "DISCONNECTED";
  freshness: "FRESH" | "STALE" | "NEVER";
  companyName: string | null;
  lastSuccessAt: string | null;
  accountingBasis: string;
  monthsRemaining: number | null;
  failure: string | null;
  staleNotice: string | null;
  actions: { connect: boolean; reconnect: boolean; disconnect: boolean; refresh: boolean };
  periods: Period[];
  ownerControlledMonths: number;
  notices: string[];
}

const STATE_LABEL: Record<QboStatusView["state"], { text: string; variant: "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible" }> = {
  NOT_CONNECTED: { text: "Not connected", variant: "muted-accessible" },
  CONNECTING: { text: "Connecting", variant: "muted-accessible" },
  IMPORTING: { text: "Importing", variant: "muted-accessible" },
  CONNECTED: { text: "Connected", variant: "success-accessible" },
  STALE: { text: "Out of date", variant: "warning-accessible" },
  SYNC_ERROR: { text: "Needs attention", variant: "warning-accessible" },
  REAUTH_REQUIRED: { text: "Reconnect needed", variant: "destructive-accessible" },
  DISCONNECTED: { text: "Disconnected", variant: "muted-accessible" },
};

const POLL_MS = 6_000;
const MAX_POLLS = 40;

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, signal: controller.signal });
    const data: unknown = await res.json().catch(() => ({}));
    // The owner-facing wording comes from classifyOperatorError at the call sites, never from a server response body.
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("That took too long. Check your connection and try again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return "not yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "not yet";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function QuickBooksConnectionCard({ businessId }: { businessId: string }) {
  const [status, setStatus] = useState<QboStatusView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "connect" | "disconnect" | "refresh">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "info" | "error"; text: string } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const inFlight = useRef(false); // synchronous duplicate-click guard
  const polls = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = (await call(`/api/owner/integrations/quickbooks/status?businessId=${encodeURIComponent(businessId)}`)) as QboStatusView;
      if (!r || typeof r !== "object" || !(r.state in STATE_LABEL) || !r.actions) throw new Error("Unexpected response");
      setStatus(r);
      setLoadError(null);
    } catch (e) {
      setLoadError(classifyOperatorError(e instanceof Error ? e : new Error(String(e)), { context: "load" }).operatorMessage);
    }
  }, [businessId]);

  useEffect(() => {
    polls.current = 0;
    void load();
  }, [load]);

  // Outcome of the Intuit round-trip: one closed token in the query string, worded by the domain, then removed from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get(QBO_OUTCOME_QUERY_KEY);
    if (!token) return;
    setNotice(qboOutcomeMessage(token));
    params.delete(QBO_OUTCOME_QUERY_KEY);
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, []);

  // While the first import is running, the card refreshes itself (bounded) so the owner sees real progress, not a spinner.
  const state = status?.state;
  useEffect(() => {
    if (state !== "CONNECTING" && state !== "IMPORTING") return;
    const id = setInterval(() => {
      if (++polls.current > MAX_POLLS) return clearInterval(id);
      void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [state, load]);

  async function run(kind: "connect" | "disconnect" | "refresh", fn: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(classifyOperatorError(e instanceof Error ? e : new Error(String(e)), { context: "action" }).operatorMessage);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const connect = () =>
    run("connect", async () => {
      if (!status?.environment) throw new Error("QuickBooks is not available.");
      const r = (await call("/api/owner/integrations/quickbooks/connect", {
        method: "POST",
        body: JSON.stringify({ businessId, environment: status.environment }),
      })) as { authorizationUrl?: string };
      if (!r.authorizationUrl) throw new Error("QuickBooks could not be started.");
      window.location.assign(r.authorizationUrl); // the page unloads; the busy flag is intentionally left set until it does
    });

  const disconnect = () =>
    run("disconnect", async () => {
      const r = (await call("/api/owner/integrations/quickbooks/disconnect", { method: "POST", body: JSON.stringify({ businessId }) })) as { revocation?: string };
      setConfirmDisconnect(false);
      setNotice({
        tone: r.revocation === "FAILED" ? "info" : "success",
        text:
          r.revocation === "FAILED"
            ? "QuickBooks is disconnected from OpsIQ. We could not tell QuickBooks to revoke access, so you may also remove OpsIQ under My Apps in QuickBooks."
            : "QuickBooks is disconnected. Your earlier figures stay on record.",
      });
      await load();
    });

  const refresh = () =>
    run("refresh", async () => {
      const r = (await call("/api/owner/integrations/quickbooks/sync", { method: "POST", body: JSON.stringify({ businessId }) })) as { alreadyRequested?: boolean };
      setNotice({
        tone: "info",
        text: r.alreadyRequested
          ? "A refresh was requested a moment ago, so no second one was started. New figures will appear here; your last analysis is not changed until you run it again."
          : "Refreshing from QuickBooks. New figures will appear here; your last analysis is not changed until you run it again.",
      });
      polls.current = 0;
      window.setTimeout(() => void load(), 4_000);
    });

  if (loadError && !status) {
    return (
      <div data-testid="qbo-card" className="py-3">
        <p className="font-medium text-foreground">QuickBooks</p>
        <p role="alert" className="mt-1 text-sm text-destructive">{loadError}</p>
        <Button variant="outline" size="sm" className="mt-2 w-full sm:w-auto" onClick={() => void load()}>Try again</Button>
      </div>
    );
  }
  if (!status) {
    return (
      <div data-testid="qbo-card" className="py-3" aria-busy="true">
        <p className="font-medium text-foreground">QuickBooks</p>
        <p className="mt-1 text-sm text-muted-foreground">Checking connection…</p>
      </div>
    );
  }

  const label = STATE_LABEL[status.state];
  const fromQbo = status.periods.filter((p) => p.finance === "QUICKBOOKS").length;
  const fromOwner = status.periods.filter((p) => p.finance === "MANUAL").length;

  return (
    <div data-testid="qbo-card" data-qbo-state={status.state} className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-foreground">QuickBooks Online</p>
        <span data-testid="qbo-state"><Badge variant={label.variant}>{label.text}</Badge></span>
        {status.environment === "sandbox" && <Badge variant="muted-accessible">Sandbox test data</Badge>}
      </div>

      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          data-testid="qbo-notice"
          className={`mt-2 rounded-md border p-2 text-sm ${notice.tone === "error" ? "border-destructive/20 bg-destructive/5 text-destructive" : "border-border bg-muted/40 text-foreground"}`}
        >
          {notice.text}{" "}
          <button type="button" className="underline" onClick={() => setNotice(null)}>Dismiss</button>
        </p>
      )}

      {status.state === "NOT_CONNECTED" && (
        <p className="mt-1 text-sm text-muted-foreground" data-testid="qbo-explainer">
          {status.available
            ? "Read-only. OpsIQ reads your profit and loss, balance sheet, receivables and payables for closed months. It never changes anything in QuickBooks."
            : "QuickBooks is not set up on this OpsIQ installation yet."}
        </p>
      )}
      {status.state === "CONNECTING" && (
        <p className="mt-1 text-sm text-muted-foreground" role="status">Connected. Waiting for the first import to start…</p>
      )}
      {status.state === "IMPORTING" && (
        <p className="mt-1 text-sm text-muted-foreground" role="status" data-testid="qbo-importing">
          Importing your recent months{status.companyName ? ` from ${status.companyName}` : ""}
          {status.monthsRemaining !== null ? ` — ${status.monthsRemaining} month${status.monthsRemaining === 1 ? "" : "s"} to go` : ""}.
        </p>
      )}
      {(status.state === "CONNECTED" || status.state === "STALE" || status.state === "SYNC_ERROR") && (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm" data-testid="qbo-facts">
          {status.companyName && (<><dt className="text-muted-foreground">Company</dt><dd className="text-foreground">{status.companyName}</dd></>)}
          <dt className="text-muted-foreground">Last updated</dt>
          <dd className="text-foreground" data-testid="qbo-last-updated">{formatWhen(status.lastSuccessAt)}</dd>
          <dt className="text-muted-foreground">Basis</dt>
          <dd className="text-foreground">{status.accountingBasis === "ACCRUAL" ? "Accrual accounting" : "Cash accounting"}</dd>
        </dl>
      )}
      {status.staleNotice && <p className="mt-2 text-sm text-foreground" data-testid="qbo-stale">{status.staleNotice}</p>}
      {status.notices.map((n) => (
        <p key={n} className="mt-2 text-sm text-foreground" data-testid="qbo-refusal">{n}</p>
      ))}
      {status.failure && <p role="alert" className="mt-2 text-sm text-foreground" data-testid="qbo-failure">{status.failure}</p>}
      {status.state === "DISCONNECTED" && (
        <p className="mt-1 text-sm text-muted-foreground">QuickBooks is disconnected. Figures already imported stay on record; connect again to refresh them.</p>
      )}

      {(fromQbo > 0 || fromOwner > 0) && status.state !== "NOT_CONNECTED" && (
        <details className="mt-2" data-testid="qbo-sources">
          <summary className="cursor-pointer text-sm text-muted-foreground">Where your recent figures come from</summary>
          <p className="mt-1 text-sm text-muted-foreground">
            {fromQbo} recent month{fromQbo === 1 ? "" : "s"} from QuickBooks{fromOwner > 0 ? `, ${fromOwner} entered or changed by you (QuickBooks will not overwrite those)` : ""}.
            After new figures arrive, run your analysis again to include them.
          </p>
        </details>
      )}

      {actionError && <p role="alert" className="mt-2 text-sm text-destructive">{actionError}</p>}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {status.actions.connect && (
          <Button size="sm" onClick={() => void connect()} isLoading={busy === "connect"} disabled={busy !== null} className="w-full sm:w-auto" data-testid="qbo-connect">
            {status.state === "DISCONNECTED" ? "Reconnect QuickBooks" : "Connect QuickBooks"}
          </Button>
        )}
        {status.actions.reconnect && (
          <Button size="sm" onClick={() => void connect()} isLoading={busy === "connect"} disabled={busy !== null} className="w-full sm:w-auto" data-testid="qbo-reconnect">
            Reconnect QuickBooks
          </Button>
        )}
        {status.actions.refresh && (
          <Button size="sm" variant="outline" onClick={() => void refresh()} isLoading={busy === "refresh"} disabled={busy !== null} className="w-full sm:w-auto" data-testid="qbo-refresh">
            Refresh now
          </Button>
        )}
        {status.actions.disconnect && !confirmDisconnect && (
          <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(true)} disabled={busy !== null} className="w-full sm:w-auto" data-testid="qbo-disconnect">
            Disconnect
          </Button>
        )}
        {status.actions.disconnect && confirmDisconnect && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center" role="group" aria-label="Confirm disconnect" data-testid="qbo-disconnect-confirm">
            <span className="text-sm text-foreground">Disconnect QuickBooks? Imported figures stay on record.</span>
            <Button size="sm" variant="destructive" onClick={() => void disconnect()} isLoading={busy === "disconnect"} disabled={busy !== null} className="w-full sm:w-auto">Yes, disconnect</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(false)} disabled={busy !== null} className="w-full sm:w-auto">Cancel</Button>
          </div>
        )}
      </div>
    </div>
  );
}
