"use client";

/**
 * Per-row "QuickBooks" product triggers for a governed OpsIQ record (a Vendor, a Customer, or a
 * Purchase Order): send it to QuickBooks, record a bill against it, or remove it there.
 *
 * `QuickBooksRecordActionsProvider` wraps a whole table/list once and issues exactly ONE batched
 * `GET .../actions?view=record-actions` for every row's id (never one fetch per row). Each row
 * then mounts `<QuickBooksRecordActionCell recordId={...} />`, which reads its own entry from
 * that batch out of context.
 *
 * Pure UI: every control's visibility comes directly from the server-computed
 * `QboRecordActionsDTO.actions` flags (never from the OpsIQ record's own status — the server
 * already re-checked that). When QuickBooks is not connected for this workspace the batched
 * fetch returns `records: []` and every cell renders nothing, per the server contract. All
 * mutations go through the server's `POST .../actions`, which builds the actual QuickBooks body
 * from the governed record — this component only names an action and, for the two actions that
 * need one, an owner-chosen expense account / due date.
 */
/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount/fetch-on-id-set-change is the
   established owner-page pattern (see the QuickBooks connection card, /owner/data, /owner/finance) */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge, Button, Input, Modal, Select } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { httpResponseErrorFromBody } from "@/lib/operator-safe-errors";

export type QboRecordType = "VendorRecord" | "CustomerRecord" | "PurchaseOrder";

interface QboLink {
  entityType: string;
  remoteId: string;
  remoteStatus: string;
}

interface QboRecordActionsDTO {
  id: string;
  links: QboLink[];
  actions: {
    pushVendor?: boolean;
    pushCustomer?: boolean;
    pushPurchaseOrder?: boolean;
    recordBill?: boolean;
    inactivate?: boolean;
  };
  blockedReason: string | null;
}

interface ExpenseAccount {
  id: string;
  name: string;
  accountType: string;
}

interface QboActionResult {
  action: "CREATED" | "UPDATED" | "LINKED" | "UNCHANGED" | "INACTIVATED";
  remoteId: string;
  replayed: boolean;
}

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
    if (!res.ok) {
      throw httpResponseErrorFromBody(res.status, data);
    }
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

interface QuickBooksRecordActionsContextValue {
  type: QboRecordType;
  /** False whenever QuickBooks is not connected for this workspace — every cell renders nothing. */
  connected: boolean;
  recordsById: Map<string, QboRecordActionsDTO>;
  expenseAccounts: ExpenseAccount[];
  performAction: (body: Record<string, unknown>) => Promise<QboActionResult>;
}

const QuickBooksRecordActionsContext = createContext<QuickBooksRecordActionsContextValue | null>(null);

export interface QuickBooksRecordActionsProviderProps {
  type: QboRecordType;
  /** Every row's OpsIQ record id currently on screen (e.g. `orders.map(o => o.id)`). */
  ids: string[];
  children: ReactNode;
}

/**
 * Mount ONCE around a whole table/list. Fetches record-actions for the current id set in one
 * batched request (re-fetched only when the id set's contents actually change, or after a
 * mutation), and — for PurchaseOrder rows only, since it's the only type whose actions need one
 * — the workspace's QuickBooks expense accounts, also once.
 */
export function QuickBooksRecordActionsProvider({ type, ids, children }: QuickBooksRecordActionsProviderProps) {
  const [recordsById, setRecordsById] = useState<Map<string, QboRecordActionsDTO>>(new Map());
  const [connected, setConnected] = useState(false);
  const [expenseAccounts, setExpenseAccounts] = useState<ExpenseAccount[]>([]);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Stable across renders unless the SET of ids actually changes — the caller's `ids` array is
  // typically a fresh `.map()` result every render, and re-fetching on identity alone would defeat
  // the "one batched fetch" contract.
  const idsKey = useMemo(() => Array.from(new Set(ids)).sort().join(","), [ids]);

  const refetch = useCallback(async () => {
    if (!idsKey) {
      if (mountedRef.current) {
        setRecordsById(new Map());
        setConnected(false);
      }
      return;
    }
    try {
      const data = await api(
        `/api/owner/integrations/quickbooks/actions?view=record-actions&type=${encodeURIComponent(type)}&ids=${encodeURIComponent(idsKey)}`,
      );
      if (!mountedRef.current) return;
      const records: QboRecordActionsDTO[] = Array.isArray(data?.records) ? data.records : [];
      setRecordsById(new Map(records.map((r) => [r.id, r])));
      // The server returns [] exactly when QuickBooks isn't connected for this workspace (see
      // getQuickBooksRecordActions) — the id set here is never actually empty (guarded above), so
      // an empty result unambiguously means "not connected," never "none of these happened to match."
      setConnected(records.length > 0);
    } catch {
      // Fail closed: an unknown connection state renders no controls at all, the same as "not
      // connected" — never a guess at eligibility the server hasn't confirmed.
      if (mountedRef.current) {
        setRecordsById(new Map());
        setConnected(false);
      }
    }
  }, [idsKey, type]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (type !== "PurchaseOrder") return;
    let cancelled = false;
    api("/api/owner/integrations/quickbooks/actions?view=expense-accounts")
      .then((data) => {
        if (!cancelled && mountedRef.current) setExpenseAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setExpenseAccounts([]);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetched once connection state flips true — expense accounts only exist to choose from
    // once there is a live QuickBooks connection to fetch them from.
  }, [type, connected]);

  const performAction = useCallback(
    async (body: Record<string, unknown>) => {
      const data = await api("/api/owner/integrations/quickbooks/actions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await refetch();
      return data.result as QboActionResult;
    },
    [refetch],
  );

  const value = useMemo<QuickBooksRecordActionsContextValue>(
    () => ({ type, connected, recordsById, expenseAccounts, performAction }),
    [type, connected, recordsById, expenseAccounts, performAction],
  );

  return <QuickBooksRecordActionsContext.Provider value={value}>{children}</QuickBooksRecordActionsContext.Provider>;
}

type DialogKind = "push-po" | "record-bill" | "inactivate" | null;

function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 w-full text-xs text-destructive">
      {message}
    </p>
  );
}

/** Mount once per row: `<QuickBooksRecordActionCell recordId={order.id} />`. */
export function QuickBooksRecordActionCell({ recordId }: { recordId: string }) {
  const ctx = useContext(QuickBooksRecordActionsContext);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const inFlightRef = useRef(false);

  const closeDialog = useCallback(() => {
    setDialog(null);
    setExpenseAccountId("");
    setDueDate("");
  }, []);

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setBusy(true);
      setActionError(null);
      try {
        await ctx!.performAction(body);
        closeDialog();
      } catch (e) {
        setActionError(classifyOperatorError(e, { context: "action" }).operatorMessage);
      } finally {
        inFlightRef.current = false;
        setBusy(false);
      }
    },
    [ctx, closeDialog],
  );

  // Nothing is rendered at all when QuickBooks is not connected, or this particular row has no
  // entry in the batch (e.g. a row added to the page after the last fetch) — never a guess.
  if (!ctx || !ctx.connected) return null;
  const record = ctx.recordsById.get(recordId);
  if (!record) return null;

  const { links, actions, blockedReason } = record;
  const activeLink = (entityType: string) => links.some((l) => l.entityType === entityType && l.remoteStatus === "ACTIVE");
  const anyLink = (entityType: string) => links.some((l) => l.entityType === entityType && l.remoteStatus !== "DELETED");
  const hasBill = anyLink("Bill");
  const linkedBadge = hasBill
    ? "Bill recorded"
    : activeLink("Vendor") || activeLink("Customer") || anyLink("PurchaseOrder")
      ? "In QuickBooks"
      : null;

  const kind = ctx.type === "VendorRecord" ? "vendor" : "customer";

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`qbo-actions-${recordId}`}>
      {linkedBadge && <Badge variant="success-accessible">{linkedBadge}</Badge>}

      {actions.pushVendor && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ action: "push_vendor", vendorId: recordId })}>
          Send to QuickBooks
        </Button>
      )}
      {actions.pushCustomer && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ action: "push_customer", customerId: recordId })}>
          Send to QuickBooks
        </Button>
      )}
      {actions.pushPurchaseOrder && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog("push-po")}>
          Send to QuickBooks
        </Button>
      )}
      {actions.recordBill && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog("record-bill")}>
          Record bill
        </Button>
      )}
      {actions.inactivate && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog("inactivate")}>
          Remove from QuickBooks
        </Button>
      )}

      {blockedReason && <span className="text-xs text-muted-foreground">{blockedReason}</span>}
      <ActionError message={actionError} />

      <Modal
        isOpen={dialog === "push-po"}
        onClose={closeDialog}
        title="Send purchase order to QuickBooks"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || !expenseAccountId}
              onClick={() => run({ action: "push_purchase_order", purchaseOrderId: recordId, expenseAccountId, confirm: true })}
            >
              {busy ? "Sending…" : "Send to QuickBooks"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">This will create a purchase order in QuickBooks.</p>
          <Select
            label="Expense account"
            value={expenseAccountId}
            onChange={(e) => setExpenseAccountId(e.target.value)}
            options={ctx.expenseAccounts.map((a) => ({ value: a.id, label: a.name }))}
            placeholder="Choose an account"
          />
        </div>
      </Modal>

      <Modal
        isOpen={dialog === "record-bill"}
        onClose={closeDialog}
        title="Record a bill for this purchase order"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || !expenseAccountId}
              onClick={() =>
                run({
                  action: "record_bill",
                  purchaseOrderId: recordId,
                  expenseAccountId,
                  ...(dueDate ? { dueDate } : {}),
                  confirm: true,
                })
              }
            >
              {busy ? "Recording…" : "Record bill"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">This will create a bill (a payable) in QuickBooks.</p>
          <Select
            label="Expense account"
            value={expenseAccountId}
            onChange={(e) => setExpenseAccountId(e.target.value)}
            options={ctx.expenseAccounts.map((a) => ({ value: a.id, label: a.name }))}
            placeholder="Choose an account"
          />
          <Input type="date" label="Due date" hint="Optional" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </Modal>

      <Modal
        isOpen={dialog === "inactivate"}
        onClose={closeDialog}
        title="Remove from QuickBooks?"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => run({ action: "inactivate", kind, recordId, confirm: true })}
            >
              {busy ? "Removing…" : "Remove from QuickBooks"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          This marks the linked record inactive in QuickBooks. It stays in OpsIQ, and this does not
          delete anything in QuickBooks.
        </p>
      </Modal>
    </div>
  );
}
