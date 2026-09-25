"use client";

/**
 * QuickBooksConnectionCard — presentational card for the "Integrations" page.
 *
 * Pure UI: it renders exactly the server DTO (`QuickBooksStatusDTO`, imported as a TYPE only —
 * no domain logic from `@/domain/quickbooks` is used here) and calls the callback props the page
 * wires to the server routes. It holds no permission logic, no state-transition logic, and no
 * business rules of its own — every control's visibility comes directly from
 * `connector.allowedActions` (server-computed), never from `connector.status`. `status` is
 * rendered only as a display label/badge; it must never gate which buttons appear. The only
 * local state here is ordinary UI state: which confirmation dialog is open, which business is
 * selected in a dropdown before Connect/Reconnect is pressed.
 */
import { useId, useState } from "react";
import { Badge, Button, Modal, Select } from "@/ui/primitives";
import type { QuickBooksStatusDTO } from "@/domain/quickbooks/qbo-contracts";

export interface QuickBooksBusinessOption {
  id: string;
  name: string;
}

export interface QuickBooksConnectionCardProps {
  dto: QuickBooksStatusDTO;
  businesses: QuickBooksBusinessOption[];
  selectedBusinessId: string | null;
  onSelectBusiness: (businessId: string) => void;
  onConnect: (businessId: string) => void;
  onSync: () => void;
  onDisconnect: () => void;
  /** True while a connect request (including a reconnect) is in flight. */
  connecting: boolean;
  /** True while a sync request is in flight OR the server reports a sync currently running. */
  syncing: boolean;
  /** True while a disconnect request is in flight. */
  disconnecting: boolean;
  /** Owner-safe message from the last failed action, if any. */
  actionError: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Connected",
  REFRESH_FAILED: "Needs attention",
  DISCONNECTED: "Disconnected",
  PENDING_AUTH: "Connecting…",
  EXPIRED: "Connection expired",
};

const STATUS_VARIANT: Record<string, "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  ACTIVE: "success-accessible",
  REFRESH_FAILED: "destructive-accessible",
  DISCONNECTED: "muted-accessible",
  PENDING_AUTH: "warning-accessible",
  EXPIRED: "destructive-accessible",
};

const FRESHNESS_LABEL: Record<string, string> = {
  FRESH: "Up to date",
  STALE: "May be out of date",
  NEVER_SYNCED: "Not synced yet",
};

const FRESHNESS_VARIANT: Record<string, "success-accessible" | "warning-accessible" | "muted-accessible"> = {
  FRESH: "success-accessible",
  STALE: "warning-accessible",
  NEVER_SYNCED: "muted-accessible",
};

const RUN_STATUS_LABEL: Record<string, string> = {
  SUCCESS: "Completed",
  PARTIAL: "Completed with some issues",
  FAILED: "Failed",
};

const RUN_STATUS_VARIANT: Record<string, "success-accessible" | "warning-accessible" | "destructive-accessible"> = {
  SUCCESS: "success-accessible",
  PARTIAL: "warning-accessible",
  FAILED: "destructive-accessible",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const diffMs = Date.now() - d.getTime();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (abs < minute) return "Just now";
  if (abs < hour) {
    const m = Math.round(abs / minute);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (abs < day) {
    const h = Math.round(abs / hour);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d2 = Math.round(abs / day);
  return `${d2} day${d2 === 1 ? "" : "s"} ago`;
}

function absoluteTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="quickbooks-card-heading"
      className="rounded-lg border border-border bg-background p-5 sm:p-6"
      data-testid="quickbooks-card"
    >
      <h2 id="quickbooks-card-heading" className="text-lg font-semibold text-foreground">
        QuickBooks Online
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
      {message}
    </p>
  );
}

/** Business picker used both before an initial Connect and before a Reconnect with no
 *  business already on record. Purely presentational — selection state lives in the page. */
function BusinessPicker({
  id,
  businesses,
  selectedBusinessId,
  onSelectBusiness,
  disabled,
}: {
  id: string;
  businesses: QuickBooksBusinessOption[];
  selectedBusinessId: string | null;
  onSelectBusiness: (businessId: string) => void;
  disabled: boolean;
}) {
  if (businesses.length === 0) {
    return <p className="text-sm text-muted-foreground">Add a business first, then come back here.</p>;
  }
  return (
    <div className="max-w-xs">
      <Select
        id={id}
        name="quickbooksBusiness"
        label="Business"
        value={selectedBusinessId ?? ""}
        onChange={(e) => onSelectBusiness(e.target.value)}
        disabled={disabled}
        options={businesses.map((b) => ({ value: b.id, label: b.name }))}
      />
    </div>
  );
}

export function QuickBooksConnectionCard({
  dto,
  businesses,
  selectedBusinessId,
  onSelectBusiness,
  onConnect,
  onSync,
  onDisconnect,
  connecting,
  syncing,
  disconnecting,
  actionError,
}: QuickBooksConnectionCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const selectId = useId();
  const reconnectSelectId = useId();

  if (!dto.available) {
    return (
      <CardShell>
        <p className="text-sm text-muted-foreground" data-testid="quickbooks-unavailable">
          QuickBooks isn&apos;t set up for this deployment yet.
          {dto.unavailableReason ? ` ${dto.unavailableReason}` : ""}
        </p>
      </CardShell>
    );
  }

  if (!dto.connector) {
    const canConnect = businesses.length > 0 && !!selectedBusinessId;
    return (
      <CardShell>
        <div data-testid="quickbooks-not-connected">
          <p className="text-sm text-muted-foreground">
            OpsIQ reads your accounting data to analyse cash, margin and receivables. QuickBooks
            stays your system of record — OpsIQ never changes anything there.
          </p>

          <div className="mt-4">
            <BusinessPicker
              id={selectId}
              businesses={businesses}
              selectedBusinessId={selectedBusinessId}
              onSelectBusiness={onSelectBusiness}
              disabled={connecting}
            />
          </div>

          <div className="mt-4">
            <Button
              onClick={() => selectedBusinessId && onConnect(selectedBusinessId)}
              disabled={!canConnect || connecting}
              isLoading={connecting}
            >
              {connecting ? "Connecting…" : "Connect QuickBooks"}
            </Button>
          </div>
        </div>
        <ActionError message={actionError} />
      </CardShell>
    );
  }

  const c = dto.connector;
  const business = businesses.find((b) => b.id === c.businessId) ?? null;
  const { sync: canSync, disconnect: canDisconnect, reconnect: canReconnect } = c.allowedActions;
  const statusLabel = STATUS_LABEL[c.status] ?? c.status;
  const statusVariant = STATUS_VARIANT[c.status] ?? "muted-accessible";
  const freshnessLabel = FRESHNESS_LABEL[c.sync.freshness] ?? c.sync.freshness;
  const freshnessVariant = FRESHNESS_VARIANT[c.sync.freshness] ?? "muted-accessible";
  const running = c.sync.running || syncing;

  return (
    <CardShell>
      <div data-testid="quickbooks-connected" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-medium text-foreground">{c.companyName ?? "QuickBooks company"}</span>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          {dto.environment === "sandbox" && <Badge variant="muted-accessible">Sandbox</Badge>}
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Business</dt>
            <dd className="text-foreground">{business?.name ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Data freshness</dt>
            <dd>
              <Badge variant={freshnessVariant}>{freshnessLabel}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last synced</dt>
            <dd className="text-foreground" title={absoluteTime(c.lastSyncAt)}>
              {relativeTime(c.lastSyncAt)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Records synced</dt>
            <dd className="text-foreground">{c.lastSyncRecords ?? "None yet"}</dd>
          </div>
        </dl>

        {c.sync.phase === "INITIAL" && c.sync.initialProgress && (
          <p className="mt-3 text-sm text-muted-foreground" data-testid="quickbooks-initial-progress">
            First-time import in progress: {c.sync.initialProgress.completedEntities} of{" "}
            {c.sync.initialProgress.totalEntities} data sets done.
          </p>
        )}

        {c.sync.lastRunStatus && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Last sync:</span>
            <Badge variant={RUN_STATUS_VARIANT[c.sync.lastRunStatus] ?? "muted-accessible"}>
              {RUN_STATUS_LABEL[c.sync.lastRunStatus] ?? c.sync.lastRunStatus}
            </Badge>
            {c.sync.lastRunSummary && <span>{c.sync.lastRunSummary}</span>}
          </p>
        )}

        {c.syncFailureMessage && (
          <p role="alert" className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {c.syncFailureMessage}
          </p>
        )}

        {running && (
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            Syncing with QuickBooks…
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-2">
          {canReconnect && (
            c.businessId ? (
              <Button onClick={() => onConnect(c.businessId!)} disabled={connecting} isLoading={connecting}>
                {connecting ? "Reconnecting…" : "Reconnect QuickBooks"}
              </Button>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <BusinessPicker
                  id={reconnectSelectId}
                  businesses={businesses}
                  selectedBusinessId={selectedBusinessId}
                  onSelectBusiness={onSelectBusiness}
                  disabled={connecting}
                />
                <Button
                  onClick={() => selectedBusinessId && onConnect(selectedBusinessId)}
                  disabled={connecting || !selectedBusinessId}
                  isLoading={connecting}
                >
                  {connecting ? "Reconnecting…" : "Reconnect QuickBooks"}
                </Button>
              </div>
            )
          )}
          {canSync && (
            <Button onClick={onSync} disabled={running} isLoading={running}>
              {running ? "Syncing…" : "Sync now"}
            </Button>
          )}
          {canDisconnect && (
            <Button variant="outline" onClick={() => setConfirmOpen(true)} disabled={disconnecting}>
              Disconnect
            </Button>
          )}
        </div>
      </div>

      <ActionError message={actionError} />

      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Disconnect QuickBooks?"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={disconnecting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirmOpen(false);
                onDisconnect();
              }}
              disabled={disconnecting}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>This stops OpsIQ from syncing with QuickBooks.</p>
          <p>OpsIQ&apos;s access to your QuickBooks company will be revoked at Intuit.</p>
          <p>Data OpsIQ has already imported stays in OpsIQ — nothing is deleted.</p>
        </div>
      </Modal>
    </CardShell>
  );
}
