"use client";

/**
 * /owner/integrations — "Integrations": lets the owner connect, sync, or disconnect QuickBooks
 * Online. This page owns fetching the DTO and calling the server routes; all rendering decisions
 * live in the presentational `QuickBooksConnectionCard`. No business logic, permission logic or
 * state-transition logic lives here — this page renders exactly what
 * `GET /api/owner/integrations/quickbooks` returns and calls
 * `POST /api/owner/integrations/quickbooks` for every mutation; the server decides what is and
 * isn't allowed.
 */
/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount and preselect-from-loaded-DTO
   are the established owner-page pattern (see /owner/data, /owner/finance's `api()`/`load()`) */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CardDashboardSkeleton, ErrorState, PageContainer, PageHeader } from "@/ui/primitives";
import { QuickBooksConnectionCard } from "@/ui/owner/integrations/quickbooks-connection-card";
import type { QuickBooksStatusDTO } from "@/domain/quickbooks/qbo-contracts";
import { QBO_CONNECT_ERROR_CODES, type QboConnectErrorCode } from "@/domain/quickbooks/qbo-connect-outcome";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { httpResponseErrorFromBody } from "@/lib/operator-safe-errors";

const FETCH_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_MS = 120_000;
/** Guards against a stuck "Connecting…"/"Reconnecting…" button when the browser never actually
 *  navigates away after `window.location.assign` (e.g. a popup blocker, or the callback URL
 *  failing to load) — see F8. */
const CONNECT_NAVIGATE_TIMEOUT_MS = 15_000;

interface BusinessLite {
  id: string;
  name: string;
}

const QUICKBOOKS_ERROR_MESSAGE: Record<QboConnectErrorCode, string> = {
  access_denied: "You cancelled the connection at QuickBooks, so nothing changed.",
  invalid_state: "That QuickBooks connection request expired or was already used. Try connecting again.",
  exchange_failed: "QuickBooks couldn't finish setting up the connection. Try connecting again.",
  company_mismatch: "That QuickBooks company doesn't match this connection. Try connecting again and pick the right company.",
  not_configured: "QuickBooks isn't set up for this deployment yet.",
  unknown: "Something went wrong connecting to QuickBooks. Try again.",
};

/** True only for one of the frozen, non-sensitive outcome codes the server can send back
 *  (`QBO_CONNECT_ERROR_CODES`). Anything else (garbage, or an attempted script/HTML payload in
 *  the query string) falls through to the generic "unknown" message below — the raw value is
 *  never reflected into the page. */
function isKnownQuickBooksErrorCode(v: string): v is QboConnectErrorCode {
  return (QBO_CONNECT_ERROR_CODES as readonly string[]).includes(v);
}

class CancelledRequestError extends Error {
  constructor() {
    super("Request superseded by a newer one");
    this.name = "CancelledRequestError";
  }
}

async function api(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const externalSignal = init?.signal ?? null;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort);
  }
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw httpResponseErrorFromBody(res.status, data);
    }
    return data;
  } catch (e) {
    // Cancelled by a newer request superseding this one (see loadStatus) or by unmount — this is
    // deliberate, not a failure, so callers must be able to tell it apart from a real timeout.
    if (externalSignal?.aborted) throw new CancelledRequestError();
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("That took too long. Check your connection and try again.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  }
}

export default function OwnerIntegrationsPage() {
  return (
    <Suspense fallback={<PageContainer><CardDashboardSkeleton sections={1} label="Loading integrations" /></PageContainer>}>
      <OwnerIntegrationsView />
    </Suspense>
  );
}

function OwnerIntegrationsView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [businesses, setBusinesses] = useState<BusinessLite[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [dto, setDto] = useState<QuickBooksStatusDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [connecting, setConnecting] = useState(false);
  const [syncRequestInFlight, setSyncRequestInFlight] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Set only by a background poll refresh that failed — the page keeps showing the last good
   *  DTO underneath rather than replacing it with an error screen (F6). */
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const connectInFlightRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const disconnectInFlightRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollElapsedRef = useRef(0);
  /** Aborts the in-flight status fetch before a newer one starts, and on stop/unmount (F5). */
  const statusAbortRef = useRef<AbortController | null>(null);
  /** Monotonic sequence guard: a response is applied only if no newer request has since started,
   *  so an older, slower response can never overwrite state a newer one already set (F5). */
  const statusSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const connectNavigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callbackNotice = useMemo<{ tone: "success" | "error"; message: string } | null>(() => {
    const connected = searchParams.get("quickbooks");
    const errorCode = searchParams.get("quickbooks_error");
    if (connected === "connected") {
      return { tone: "success", message: "QuickBooks is connected. OpsIQ will start reading your accounting data shortly." };
    }
    if (errorCode) {
      const known = isKnownQuickBooksErrorCode(errorCode) ? errorCode : "unknown";
      const banner: { tone: "success" | "error"; message: string } = { tone: "error", message: QUICKBOOKS_ERROR_MESSAGE[known] };
      return banner;
    }
    return null;
    // Intentionally read once from the callback URL's own query params on mount — a later
    // router.replace() (below) that clears those params must not erase the notice it's meant to
    // reveal, which re-including `searchParams` here would do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // F5: cancel whatever status fetch is still in flight (the previous poll tick, or the initial
  // load) before starting a new one, and only ever apply the response from the MOST RECENTLY
  // STARTED request — an older request that happens to resolve after a newer one (the 5s poll
  // interval is shorter than the 10s fetch timeout, so overlap is expected) is dropped rather
  // than overwriting fresher state.
  const loadStatus = useCallback(async () => {
    statusAbortRef.current?.abort();
    const controller = new AbortController();
    statusAbortRef.current = controller;
    const seq = ++statusSeqRef.current;
    try {
      const data = await api("/api/owner/integrations/quickbooks", { signal: controller.signal });
      if (!mountedRef.current || seq !== statusSeqRef.current) return;
      setDto((data?.quickbooks as QuickBooksStatusDTO) ?? null);
    } catch (e) {
      if (e instanceof CancelledRequestError) return;
      if (!mountedRef.current || seq !== statusSeqRef.current) return;
      throw e;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      statusAbortRef.current?.abort();
      if (connectNavigateTimerRef.current) clearTimeout(connectNavigateTimerRef.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const businessData = await api("/api/owner/businesses");
      const list: BusinessLite[] = (businessData?.businesses ?? []).map((b: { id: string; name: string }) => ({
        id: b.id,
        name: b.name,
      }));
      if (!mountedRef.current) return;
      setBusinesses(list);
      await loadStatus();
    } catch (e) {
      if (e instanceof CancelledRequestError) return;
      if (mountedRef.current) setLoadError(classifyOperatorError(e, { context: "load" }).operatorMessage);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [loadStatus]);

  useEffect(() => {
    void load();
    return () => stopPolling();
    // One-time load on mount, matching the established owner-page fetch-on-mount pattern
    // (see /owner/data, /owner/finance) — `load`/`stopPolling` are stable useCallbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preselect the business the connector is already using (or already connecting), and
  // otherwise default the picker to the owner's only business when there's exactly one.
  useEffect(() => {
    if (!dto) return;
    if (dto.connector?.businessId) {
      setSelectedBusinessId((prev) => prev ?? dto.connector!.businessId);
      return;
    }
    if (businesses.length === 1) {
      setSelectedBusinessId((prev) => prev ?? businesses[0].id);
    }
  }, [dto, businesses]);

  // Poll while a sync is running, at most ~2 minutes, per the server contract. F6: a background
  // tick that fails is caught here and surfaced as a subtle, non-blocking note — it never
  // replaces the last good DTO already on screen, and never becomes an unhandled rejection.
  useEffect(() => {
    const running = dto?.connector?.sync.running ?? false;
    if (!running) {
      stopPolling();
      return;
    }
    if (pollTimerRef.current) return;
    pollElapsedRef.current = 0;
    pollTimerRef.current = setInterval(() => {
      pollElapsedRef.current += POLL_INTERVAL_MS;
      if (pollElapsedRef.current > POLL_MAX_MS) {
        stopPolling();
        return;
      }
      loadStatus()
        .then(() => {
          if (mountedRef.current) setRefreshError(null);
        })
        .catch((e) => {
          if (mountedRef.current) setRefreshError(classifyOperatorError(e, { context: "load" }).operatorMessage);
        });
    }, POLL_INTERVAL_MS);
    return () => stopPolling();
  }, [dto?.connector?.sync.running, loadStatus, stopPolling]);

  const releaseConnecting = useCallback(() => {
    connectInFlightRef.current = false;
    if (connectNavigateTimerRef.current) {
      clearTimeout(connectNavigateTimerRef.current);
      connectNavigateTimerRef.current = null;
    }
    if (mountedRef.current) setConnecting(false);
  }, []);

  const handleConnect = useCallback(async (businessId: string) => {
    if (connectInFlightRef.current) return;
    connectInFlightRef.current = true;
    setConnecting(true);
    setActionError(null);
    try {
      const data = await api("/api/owner/integrations/quickbooks", {
        method: "POST",
        body: JSON.stringify({ action: "connect", businessId }),
      });
      if (data?.authorizeUrl) {
        window.location.assign(data.authorizeUrl as string);
        // F8: if the browser never actually navigates away (popup blocked, assign() failing
        // silently, or the callback URL not loading), don't leave the button stuck forever.
        connectNavigateTimerRef.current = setTimeout(releaseConnecting, CONNECT_NAVIGATE_TIMEOUT_MS);
      } else {
        throw new Error("QuickBooks didn't return a place to continue. Try again.");
      }
    } catch (e) {
      if (mountedRef.current) setActionError(classifyOperatorError(e, { context: "action" }).operatorMessage);
      releaseConnecting();
    }
  }, [releaseConnecting]);

  // F8: the browser can restore this page from the back/forward cache after the owner backs out
  // of the QuickBooks consent screen (or it never loaded) — release a stuck "Connecting…" then.
  useEffect(() => {
    function onPageShow() {
      if (connectInFlightRef.current) releaseConnecting();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [releaseConnecting]);

  const handleSync = useCallback(async () => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setSyncRequestInFlight(true);
    setActionError(null);
    try {
      await api("/api/owner/integrations/quickbooks", {
        method: "POST",
        body: JSON.stringify({ action: "sync" }),
      });
      await loadStatus();
    } catch (e) {
      if (mountedRef.current) setActionError(classifyOperatorError(e, { context: "action" }).operatorMessage);
    } finally {
      syncInFlightRef.current = false;
      if (mountedRef.current) setSyncRequestInFlight(false);
    }
  }, [loadStatus]);

  const handleDisconnect = useCallback(async () => {
    if (disconnectInFlightRef.current) return;
    disconnectInFlightRef.current = true;
    setDisconnecting(true);
    setActionError(null);
    try {
      const data = await api("/api/owner/integrations/quickbooks", {
        method: "POST",
        body: JSON.stringify({ action: "disconnect", confirm: true }),
      });
      if (mountedRef.current) setDto((data?.quickbooks as QuickBooksStatusDTO) ?? null);
    } catch (e) {
      if (mountedRef.current) setActionError(classifyOperatorError(e, { context: "action" }).operatorMessage);
    } finally {
      disconnectInFlightRef.current = false;
      if (mountedRef.current) setDisconnecting(false);
    }
  }, []);

  // Once shown, clear the one-shot OAuth-callback query params from the URL so a page refresh
  // doesn't keep re-announcing the same notice.
  useEffect(() => {
    if (!callbackNotice) return;
    if (searchParams.get("quickbooks") || searchParams.get("quickbooks_error")) {
      router.replace("/owner/integrations");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the notice first appears
  }, []);

  return (
    <PageContainer>
      <header>
        <PageHeader
          title="Integrations"
          description="Connect the accounting, banking or point-of-sale systems you already use so OpsIQ can read your real numbers."
        />
      </header>

      {callbackNotice && (
        <p
          role={callbackNotice.tone === "error" ? "alert" : "status"}
          className={`mt-6 rounded-md border p-3 text-sm ${
            callbackNotice.tone === "error"
              ? "border-destructive/20 bg-destructive/5 text-destructive"
              : "border-[var(--success-text)]/20 bg-success/5 text-[var(--success-text)]"
          }`}
        >
          {callbackNotice.message}
        </p>
      )}

      <div className="mt-6">
        {loading && <CardDashboardSkeleton sections={1} label="Loading integrations" />}

        {!loading && loadError && (
          <ErrorState title="Couldn't load integrations" message={loadError} onRetry={() => void load()} />
        )}

        {!loading && !loadError && dto && (
          <>
            {refreshError && (
              <p role="status" aria-live="polite" className="mb-3 text-sm text-muted-foreground" data-testid="quickbooks-refresh-note">
                Couldn&apos;t refresh status ({refreshError}). Showing the last known state.
              </p>
            )}
            <QuickBooksConnectionCard
              dto={dto}
              businesses={businesses}
              selectedBusinessId={selectedBusinessId}
              onSelectBusiness={setSelectedBusinessId}
              onConnect={handleConnect}
              onSync={handleSync}
              onDisconnect={handleDisconnect}
              connecting={connecting}
              syncing={syncRequestInFlight}
              disconnecting={disconnecting}
              actionError={actionError}
            />
          </>
        )}
      </div>
    </PageContainer>
  );
}
