/**
 * QuickBooks Online — product-level governed writes (LAYER 3 triggers).
 *
 * Each action starts from an EXISTING governed OpsIQ record and an explicit
 * owner action; the QuickBooks body is built here, server-side, from that
 * record — never from browser-supplied QBO JSON. Every write then goes through
 * executeGovernedQboWrite (validation, confirmation, idempotency, SyncToken,
 * audit, provenance).
 *
 * Supported product flows (derived from real OpsIQ workflows):
 *  - Vendor push:   an APPROVED VendorRecord → QBO Vendor (create, or sparse
 *                   name update when already linked). An existing, unlinked QBO
 *                   vendor with exactly the same DisplayName is LINKED instead of
 *                   creating a duplicate.
 *  - Customer push: a CustomerRecord → QBO Customer (same create/update/link rules).
 *  - Purchase order push: an APPROVED / ISSUED / DELIVERED PurchaseOrder → QBO
 *                   PurchaseOrder, coded to an owner-chosen expense account.
 *  - Bill for a delivered PO: a DELIVERED PurchaseOrder → QBO Bill (A/P), linked
 *                   to the QBO PurchaseOrder when it was pushed. One bill per PO.
 *  - Inactivate a linked vendor / customer in QBO (material; confirmation).
 *
 * Idempotency keys are derived from the business intent (e.g. one Bill per PO,
 * ever), so a double click, a retry or two browser tabs can never create a
 * second QuickBooks record — independent of any client-supplied key.
 *
 * Accounting facts OpsIQ does not hold are never invented: a PO line without a
 * unit price, a currency that differs from the QBO home currency, a total that
 * does not equal its lines, or an unlinked vendor rejects the write.
 */
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, PolicyViolationError, ValidationError } from "@/infra/errors";
import { QBO_PROVIDER, isValidQboEntityId } from "@/domain/quickbooks/qbo-config";
import type { QboEntityBody } from "@/domain/quickbooks/qbo-contracts";
import { round2 } from "@/domain/quickbooks/qbo-accounting-validation";
import { executeGovernedQboWrite, type GovernedQboWriteInput, type GovernedQboWriteResult } from "./qbo-write.service";
import { ingestIntegrationEvent } from "@/services/integration-fabric/integration-event.service";
import { randomUUID } from "crypto";
import { logger } from "@/infra/logger";

type Deps = GovernedQboWriteInput["deps"];

export interface QboActionResult extends GovernedQboWriteResult {
  action: "CREATED" | "UPDATED" | "LINKED" | "UNCHANGED" | "INACTIVATED";
}

/** Account types an owner may code purchases / bills to. */
export const QBO_EXPENSE_ACCOUNT_TYPES = ["Expense", "Cost of Goods Sold", "Other Expense"] as const;

/** QBO DocNumber maximum length. */
const QBO_DOC_NUMBER_MAX = 21;
/** QBO DisplayName maximum length. */
const QBO_DISPLAY_NAME_MAX = 500;

// ─── Shared lookups ─────────────────────────────────────────────────────────

async function activeConnector(workspaceId: string) {
  const c = await db.ownerConnector.findFirst({
    where: { workspaceId, provider: QBO_PROVIDER },
    select: { id: true, status: true, businessId: true, externalAccountId: true },
  });
  if (!c || c.status !== "ACTIVE" || !c.externalAccountId) {
    throw new ConflictError("QuickBooks is not connected for this workspace. Connect or reconnect QuickBooks first.");
  }
  return c;
}

function assertSameBusiness(connectorBusinessId: string | null, recordBusinessId: string) {
  if (!connectorBusinessId || connectorBusinessId !== recordBusinessId) {
    throw new ConflictError("This record belongs to a different business than the one connected to QuickBooks.");
  }
}

async function findLink(connectorId: string, entityType: string, opsiqEntityType: string, opsiqEntityId: string) {
  return db.ownerConnectorRecord.findFirst({
    where: { connectorId, entityType, opsiqEntityType, opsiqEntityId, remoteStatus: { not: "DELETED" } },
    select: { id: true, remoteId: true, remoteSyncToken: true, remoteStatus: true, data: true },
  });
}

/** Escape-free exact DisplayName match over the mirror (no QBO query string is built from user text). */
async function findUnlinkedByDisplayName(connectorId: string, entityType: "Vendor" | "Customer", displayName: string) {
  const rows = await db.ownerConnectorRecord.findMany({
    where: {
      connectorId,
      entityType,
      remoteStatus: "ACTIVE",
      opsiqEntityId: null,
      data: { path: ["DisplayName"], equals: displayName },
    },
    select: { id: true, remoteId: true, remoteSyncToken: true },
    take: 2,
  });
  return rows;
}

function shortHash(v: unknown): string {
  return createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
}

function displayNameFrom(name: string): string {
  const n = name.trim();
  if (!n) throw new ValidationError("A name is required to create the QuickBooks record.");
  if (n.length > QBO_DISPLAY_NAME_MAX) throw new ValidationError(`QuickBooks names are limited to ${QBO_DISPLAY_NAME_MAX} characters.`);
  if (n.includes(":")) throw new ValidationError("QuickBooks names cannot contain ':'. Rename the record in OpsIQ first.");
  return n;
}

async function linkExisting(recordId: string, opsiqEntityType: string, opsiqEntityId: string) {
  // Conditional link: only if still unlinked (concurrent pushes cannot both claim it).
  const res = await db.ownerConnectorRecord.updateMany({
    where: { id: recordId, opsiqEntityId: null },
    data: { opsiqEntityType, opsiqEntityId },
  });
  return res.count === 1;
}

// ─── Vendor / Customer push ─────────────────────────────────────────────────

interface PartyInput {
  workspaceId: string;
  actorId: string;
  deps?: Deps;
}

async function pushParty(args: {
  workspaceId: string;
  actorId: string;
  entity: "Vendor" | "Customer";
  opsiqEntityType: "VendorRecord" | "CustomerRecord";
  opsiqEntityId: string;
  businessId: string;
  fields: QboEntityBody & { DisplayName: string };
  deps?: Deps;
}): Promise<QboActionResult> {
  const { workspaceId, actorId, entity, opsiqEntityType, opsiqEntityId, fields, deps } = args;
  const connector = await activeConnector(workspaceId);
  assertSameBusiness(connector.businessId, args.businessId);

  const link = await findLink(connector.id, entity, opsiqEntityType, opsiqEntityId);
  if (link) {
    if (link.remoteStatus !== "ACTIVE") {
      throw new ConflictError(`The linked QuickBooks ${entity.toLowerCase()} is inactive. Reactivate it in QuickBooks first.`);
    }
    const current = link.data as Record<string, unknown>;
    const changes = Object.fromEntries(
      Object.entries(fields).filter(([k, v]) => JSON.stringify(current[k]) !== JSON.stringify(v)),
    );
    if (Object.keys(changes).length === 0) {
      return { writeId: "", remoteId: link.remoteId, remoteSyncToken: link.remoteSyncToken, replayed: false, action: "UNCHANGED" };
    }
    const r = await executeGovernedQboWrite({
      workspaceId,
      actorId,
      idempotencyKey: `${entity.toLowerCase()}-update:${opsiqEntityId}:${link.remoteSyncToken ?? "0"}:${shortHash(changes)}`,
      entity,
      operation: "update",
      remoteId: link.remoteId,
      body: changes,
      opsiqLink: { entityType: opsiqEntityType, entityId: opsiqEntityId },
      deps,
    });
    return { ...r, action: "UPDATED" };
  }

  const sameName = await findUnlinkedByDisplayName(connector.id, entity, fields.DisplayName);
  if (sameName.length === 1) {
    if (await linkExisting(sameName[0].id, opsiqEntityType, opsiqEntityId)) {
      return { writeId: "", remoteId: sameName[0].remoteId, remoteSyncToken: sameName[0].remoteSyncToken, replayed: false, action: "LINKED" };
    }
  }

  const r = await executeGovernedQboWrite({
    workspaceId,
    actorId,
    idempotencyKey: `${entity.toLowerCase()}-create:${opsiqEntityId}`,
    entity,
    operation: "create",
    body: fields,
    opsiqLink: { entityType: opsiqEntityType, entityId: opsiqEntityId },
    deps,
  });
  return { ...r, action: "CREATED" };
}

export async function pushVendorToQuickBooks(input: PartyInput & { vendorId: string }): Promise<QboActionResult> {
  const vendor = await db.vendorRecord.findFirst({
    where: { id: input.vendorId, workspaceId: input.workspaceId },
    select: { id: true, businessId: true, name: true, approvalStatus: true },
  });
  if (!vendor) throw new NotFoundError("VendorRecord", input.vendorId);
  if (vendor.approvalStatus !== "APPROVED") {
    throw new PolicyViolationError("QUICKBOOKS_WRITE_GOVERNANCE", "Only approved vendors can be sent to QuickBooks.");
  }
  return pushParty({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    entity: "Vendor",
    opsiqEntityType: "VendorRecord",
    opsiqEntityId: vendor.id,
    businessId: vendor.businessId,
    fields: { DisplayName: displayNameFrom(vendor.name) },
    deps: input.deps,
  });
}

export async function pushCustomerToQuickBooks(input: PartyInput & { customerId: string }): Promise<QboActionResult> {
  const customer = await db.customerRecord.findFirst({
    where: { id: input.customerId, workspaceId: input.workspaceId },
    select: { id: true, businessId: true, name: true, email: true, phone: true },
  });
  if (!customer) throw new NotFoundError("CustomerRecord", input.customerId);
  const fields: QboEntityBody & { DisplayName: string } = { DisplayName: displayNameFrom(customer.name) };
  if (customer.email) fields.PrimaryEmailAddr = { Address: customer.email };
  if (customer.phone) fields.PrimaryPhone = { FreeFormNumber: customer.phone };
  return pushParty({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    entity: "Customer",
    opsiqEntityType: "CustomerRecord",
    opsiqEntityId: customer.id,
    businessId: customer.businessId,
    fields,
    deps: input.deps,
  });
}

export async function inactivatePartyInQuickBooks(
  input: PartyInput & { kind: "vendor" | "customer"; recordId: string; confirm: boolean },
): Promise<QboActionResult> {
  const entity = input.kind === "vendor" ? "Vendor" : "Customer";
  const opsiqEntityType = input.kind === "vendor" ? "VendorRecord" : "CustomerRecord";
  const record =
    input.kind === "vendor"
      ? await db.vendorRecord.findFirst({ where: { id: input.recordId, workspaceId: input.workspaceId }, select: { id: true, businessId: true } })
      : await db.customerRecord.findFirst({ where: { id: input.recordId, workspaceId: input.workspaceId }, select: { id: true, businessId: true } });
  if (!record) throw new NotFoundError(opsiqEntityType, input.recordId);
  const connector = await activeConnector(input.workspaceId);
  assertSameBusiness(connector.businessId, record.businessId);
  const link = await findLink(connector.id, entity, opsiqEntityType, record.id);
  if (!link) throw new ConflictError(`This ${input.kind} is not linked to a QuickBooks ${input.kind}.`);
  if (link.remoteStatus === "INACTIVE") {
    return { writeId: "", remoteId: link.remoteId, remoteSyncToken: link.remoteSyncToken, replayed: false, action: "UNCHANGED" };
  }
  const r = await executeGovernedQboWrite({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    idempotencyKey: `${input.kind}-inactivate:${record.id}:${link.remoteSyncToken ?? "0"}`,
    entity,
    operation: "inactivate",
    remoteId: link.remoteId,
    confirm: input.confirm,
    opsiqLink: { entityType: opsiqEntityType, entityId: record.id },
    deps: input.deps,
  });
  return { ...r, action: "INACTIVATED" };
}

// ─── Purchase order / Bill ──────────────────────────────────────────────────

interface PoLine {
  description: string;
  qty: number;
  unitPrice?: number;
}

/** Build expense lines from a governed PO. Rejects anything that is not an exact, priced line. */
export function buildExpenseLinesFromPurchaseOrder(
  po: { lineItems: unknown; totalAmount: number | null },
  expenseAccountId: string,
): { lines: QboEntityBody[]; total: number } {
  const raw = Array.isArray(po.lineItems) ? (po.lineItems as PoLine[]) : [];
  if (raw.length === 0) throw new ValidationError("The purchase order has no line items.");
  const issues: string[] = [];
  const lines = raw.map((l, i) => {
    if (typeof l?.qty !== "number" || !(l.qty > 0)) issues.push(`line ${i + 1}: quantity must be greater than zero`);
    if (typeof l?.unitPrice !== "number" || !(l.unitPrice >= 0)) issues.push(`line ${i + 1}: unit price is required`);
    const amount = round2((l?.qty ?? 0) * (l?.unitPrice ?? 0));
    return {
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: amount,
      Description: String(l?.description ?? "").slice(0, 4000),
      AccountBasedExpenseLineDetail: { AccountRef: { value: expenseAccountId } },
    } as QboEntityBody;
  });
  if (issues.length > 0) throw new ValidationError(`The purchase order cannot be recorded in QuickBooks: ${issues.join("; ")}`);
  const total = round2(lines.reduce((s, l) => s + (l.Amount as number), 0));
  if (!(total > 0)) throw new ValidationError("The purchase order total must be greater than zero.");
  if (po.totalAmount !== null && Math.round(po.totalAmount * 100) !== Math.round(total * 100)) {
    throw new ValidationError(
      `The purchase order total (${po.totalAmount.toFixed(2)}) does not equal the sum of its lines (${total.toFixed(2)}). Correct the purchase order first.`,
    );
  }
  return { lines, total };
}

async function loadPoForQuickBooks(workspaceId: string, purchaseOrderId: string, allowed: readonly string[]) {
  const po = await db.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, workspaceId },
    select: {
      id: true, businessId: true, poNumber: true, vendorId: true, status: true, lineItems: true,
      totalAmount: true, currency: true, approvedAt: true, issuedAt: true, deliveredAt: true, createdAt: true,
    },
  });
  if (!po) throw new NotFoundError("PurchaseOrder", purchaseOrderId);
  if (!allowed.includes(po.status)) {
    throw new PolicyViolationError("QUICKBOOKS_WRITE_GOVERNANCE", `A purchase order in status ${po.status} cannot be sent to QuickBooks for this action.`);
  }
  return { ...po, totalAmount: po.totalAmount === null ? null : Number(po.totalAmount) };
}

async function assertCurrencyMatches(connectorId: string, currency: string) {
  const prefs = await db.ownerConnectorRecord.findFirst({
    where: { connectorId, entityType: "Preferences" },
    select: { data: true },
  });
  const home = (prefs?.data as { CurrencyPrefs?: { HomeCurrency?: { value?: string } } } | undefined)?.CurrencyPrefs?.HomeCurrency?.value;
  if (!home) throw new ConflictError("QuickBooks home currency is unknown. Run a QuickBooks sync first.");
  if (home.toUpperCase() !== currency.toUpperCase()) {
    throw new ValidationError(
      `The purchase order is in ${currency} but the QuickBooks company's home currency is ${home}. OpsIQ does not convert currencies; record it in QuickBooks directly.`,
    );
  }
}

async function assertExpenseAccount(connectorId: string, expenseAccountId: string) {
  if (!isValidQboEntityId(expenseAccountId)) throw new ValidationError("Choose a valid QuickBooks expense account.");
  const acct = await db.ownerConnectorRecord.findUnique({
    where: { connectorId_entityType_remoteId: { connectorId, entityType: "Account", remoteId: expenseAccountId } },
    select: { remoteStatus: true, data: true },
  });
  const type = (acct?.data as { AccountType?: string } | undefined)?.AccountType;
  if (!acct || acct.remoteStatus !== "ACTIVE" || !type || !(QBO_EXPENSE_ACCOUNT_TYPES as readonly string[]).includes(type)) {
    throw new ValidationError("Choose an active QuickBooks expense or cost-of-goods account.");
  }
}

async function linkedVendorRemoteId(connectorId: string, vendorId: string | null): Promise<string> {
  if (!vendorId) throw new ValidationError("The purchase order has no OpsIQ vendor. Assign an approved vendor first.");
  const link = await findLink(connectorId, "Vendor", "VendorRecord", vendorId);
  if (!link || link.remoteStatus !== "ACTIVE") {
    throw new ConflictError("The purchase order's vendor is not linked to an active QuickBooks vendor. Send the vendor to QuickBooks first.");
  }
  return link.remoteId;
}

function isoDate(d: Date | null): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

export async function pushPurchaseOrderToQuickBooks(input: {
  workspaceId: string;
  actorId: string;
  purchaseOrderId: string;
  expenseAccountId: string;
  confirm: boolean;
  deps?: Deps;
}): Promise<QboActionResult> {
  if (input.confirm !== true) throw new PolicyViolationError("QUICKBOOKS_WRITE_GOVERNANCE", "Confirm sending this purchase order to QuickBooks.");
  const po = await loadPoForQuickBooks(input.workspaceId, input.purchaseOrderId, ["APPROVED", "ISSUED", "DELIVERED"]);
  const connector = await activeConnector(input.workspaceId);
  assertSameBusiness(connector.businessId, po.businessId);

  const existing = await findLink(connector.id, "PurchaseOrder", "PurchaseOrder", po.id);
  if (existing) {
    return { writeId: "", remoteId: existing.remoteId, remoteSyncToken: existing.remoteSyncToken, replayed: true, action: "UNCHANGED" };
  }
  if (po.poNumber.length > QBO_DOC_NUMBER_MAX) {
    throw new ValidationError(`QuickBooks document numbers are limited to ${QBO_DOC_NUMBER_MAX} characters; this PO number is longer.`);
  }
  await assertCurrencyMatches(connector.id, po.currency);
  await assertExpenseAccount(connector.id, input.expenseAccountId);
  const vendorRemoteId = await linkedVendorRemoteId(connector.id, po.vendorId);
  const { lines } = buildExpenseLinesFromPurchaseOrder(po, input.expenseAccountId);

  const body: QboEntityBody = {
    VendorRef: { value: vendorRemoteId },
    DocNumber: po.poNumber,
    TxnDate: isoDate(po.approvedAt ?? po.createdAt),
    Line: lines,
  };
  const r = await executeGovernedQboWrite({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    idempotencyKey: `po-push:${po.id}`,
    entity: "PurchaseOrder",
    operation: "create",
    body,
    confirm: true,
    opsiqLink: { entityType: "PurchaseOrder", entityId: po.id },
    deps: input.deps,
  });
  return { ...r, action: "CREATED" };
}

export async function recordBillForPurchaseOrder(input: {
  workspaceId: string;
  actorId: string;
  purchaseOrderId: string;
  expenseAccountId: string;
  dueDate?: string;
  confirm: boolean;
  deps?: Deps;
}): Promise<QboActionResult> {
  if (input.confirm !== true) {
    throw new PolicyViolationError("QUICKBOOKS_WRITE_GOVERNANCE", "Recording a bill creates a payable in QuickBooks. Confirm to continue.");
  }
  if (input.dueDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    throw new ValidationError("Due date must be a calendar date (YYYY-MM-DD).");
  }
  const po = await loadPoForQuickBooks(input.workspaceId, input.purchaseOrderId, ["DELIVERED"]);
  const connector = await activeConnector(input.workspaceId);
  assertSameBusiness(connector.businessId, po.businessId);

  const existingBill = await findLink(connector.id, "Bill", "PurchaseOrder", po.id);
  if (existingBill) {
    return { writeId: "", remoteId: existingBill.remoteId, remoteSyncToken: existingBill.remoteSyncToken, replayed: true, action: "UNCHANGED" };
  }
  await assertCurrencyMatches(connector.id, po.currency);
  await assertExpenseAccount(connector.id, input.expenseAccountId);
  const vendorRemoteId = await linkedVendorRemoteId(connector.id, po.vendorId);
  const { lines } = buildExpenseLinesFromPurchaseOrder(po, input.expenseAccountId);

  const txnDate = isoDate(po.deliveredAt) ?? isoDate(new Date())!;
  if (input.dueDate && input.dueDate < txnDate) throw new ValidationError("The due date cannot be before the delivery date.");

  // Link the bill to the QBO purchase order when OpsIQ pushed it, so QBO closes the PO lines.
  const qboPo = await findLink(connector.id, "PurchaseOrder", "PurchaseOrder", po.id);
  const linkedLines = qboPo
    ? lines.map((l) => ({ ...l, LinkedTxn: [{ TxnId: qboPo.remoteId, TxnType: "PurchaseOrder" }] }))
    : lines;

  const body: QboEntityBody = {
    VendorRef: { value: vendorRemoteId },
    TxnDate: txnDate,
    ...(input.dueDate ? { DueDate: input.dueDate } : {}),
    PrivateNote: `OpsIQ purchase order ${po.poNumber}`.slice(0, 4000),
    Line: linkedLines,
  };
  const r = await executeGovernedQboWrite({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    idempotencyKey: `po-bill:${po.id}`,
    entity: "Bill",
    operation: "create",
    body,
    confirm: true,
    opsiqLink: { entityType: "PurchaseOrder", entityId: po.id },
    deps: input.deps,
  });

  // A new payable is a material cash/expense change → governed re-evaluation.
  try {
    await ingestIntegrationEvent(
      {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        connectorId: connector.id,
        provider: QBO_PROVIDER,
        kind: "ACCOUNTING_EXPENSE_UPDATED",
        businessId: po.businessId,
        payload: { source: "quickbooks_bill_from_purchase_order", purchaseOrderId: po.id },
        occurredAt: new Date().toISOString(),
      },
      input.actorId,
    );
  } catch (err) {
    // The bill is committed and audited; re-evaluation also runs on the next sync's materialization.
    logger.error("QuickBooks bill re-evaluation trigger failed", err, { purchaseOrderId: po.id });
  }
  return { ...r, action: "CREATED" };
}

// ─── Read helpers for the owner UI ──────────────────────────────────────────

export async function listQuickBooksExpenseAccounts(workspaceId: string) {
  const connector = await activeConnector(workspaceId);
  const rows = await db.ownerConnectorRecord.findMany({
    where: { workspaceId, connectorId: connector.id, entityType: "Account", remoteStatus: "ACTIVE" },
    select: { remoteId: true, data: true },
    take: 1000,
  });
  return (rows as Array<{ remoteId: string; data: unknown }>)
    .map((r) => {
      const d = r.data as { Name?: string; FullyQualifiedName?: string; AccountType?: string };
      return { id: r.remoteId, name: d.FullyQualifiedName ?? d.Name ?? r.remoteId, accountType: d.AccountType ?? "" };
    })
    .filter((a) => (QBO_EXPENSE_ACCOUNT_TYPES as readonly string[]).includes(a.accountType))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getQuickBooksLinks(input: {
  workspaceId: string;
  opsiqEntityType: "VendorRecord" | "CustomerRecord" | "PurchaseOrder";
  ids: string[];
}) {
  const connector = await db.ownerConnector.findFirst({
    where: { workspaceId: input.workspaceId, provider: QBO_PROVIDER },
    select: { id: true },
  });
  if (!connector || input.ids.length === 0) return [];
  const rows = await db.ownerConnectorRecord.findMany({
    where: {
      workspaceId: input.workspaceId,
      connectorId: connector.id,
      opsiqEntityType: input.opsiqEntityType,
      opsiqEntityId: { in: input.ids.slice(0, 200) },
      entityType: { in: ["Vendor", "Customer", "PurchaseOrder", "Bill"] },
    },
    select: { entityType: true, remoteId: true, remoteStatus: true, opsiqEntityId: true },
  });
  return (rows as Array<{ entityType: string; remoteId: string; remoteStatus: string; opsiqEntityId: string | null }>).map((r) => ({ opsiqEntityId: r.opsiqEntityId!, entityType: r.entityType, remoteId: r.remoteId, remoteStatus: r.remoteStatus }));
}

// ─── Per-record action eligibility (server-decided; the UI only renders it) ──

export type QboRecordType = "VendorRecord" | "CustomerRecord" | "PurchaseOrder";

export interface QboRecordActionsDTO {
  id: string;
  /** QuickBooks records linked to this OpsIQ record. */
  links: Array<{ entityType: string; remoteId: string; remoteStatus: string }>;
  actions: {
    pushVendor?: boolean;
    pushCustomer?: boolean;
    pushPurchaseOrder?: boolean;
    recordBill?: boolean;
    inactivate?: boolean;
  };
  /** Owner-safe reason when a primary action is unavailable. */
  blockedReason: string | null;
}

/**
 * For a page of OpsIQ records, return which governed QuickBooks actions the
 * owner may take on each. Mirrors (not replaces) the checks the write actions
 * enforce again server-side at execution time. Returns [] when QuickBooks is
 * not connected (no controls are rendered at all).
 */
export async function getQuickBooksRecordActions(input: {
  workspaceId: string;
  type: QboRecordType;
  ids: string[];
}): Promise<QboRecordActionsDTO[]> {
  const ids = Array.from(new Set(input.ids)).slice(0, 200);
  if (ids.length === 0) return [];
  const connector = await db.ownerConnector.findFirst({
    where: { workspaceId: input.workspaceId, provider: QBO_PROVIDER },
    select: { id: true, status: true, businessId: true, externalAccountId: true },
  });
  if (!connector || connector.status !== "ACTIVE" || !connector.externalAccountId) return [];

  const linkRows = (await db.ownerConnectorRecord.findMany({
    where: {
      workspaceId: input.workspaceId,
      connectorId: connector.id,
      opsiqEntityType: input.type,
      opsiqEntityId: { in: ids },
      entityType: { in: ["Vendor", "Customer", "PurchaseOrder", "Bill"] },
    },
    select: { entityType: true, remoteId: true, remoteStatus: true, opsiqEntityId: true },
  })) as Array<{ entityType: string; remoteId: string; remoteStatus: string; opsiqEntityId: string }>;
  const linksFor = (id: string) =>
    linkRows.filter((l) => l.opsiqEntityId === id).map(({ entityType, remoteId, remoteStatus }) => ({ entityType, remoteId, remoteStatus }));
  const otherBusiness = "This record belongs to a different business than the one connected to QuickBooks.";

  if (input.type === "VendorRecord" || input.type === "CustomerRecord") {
    const rows = (input.type === "VendorRecord"
      ? await db.vendorRecord.findMany({ where: { workspaceId: input.workspaceId, id: { in: ids } }, select: { id: true, businessId: true, approvalStatus: true } })
      : await db.customerRecord.findMany({ where: { workspaceId: input.workspaceId, id: { in: ids } }, select: { id: true, businessId: true } })) as Array<{
      id: string;
      businessId: string;
      approvalStatus?: string;
    }>;
    const party = input.type === "VendorRecord" ? "Vendor" : "Customer";
    return rows.map((r) => {
      const links = linksFor(r.id);
      const link = links.find((l) => l.entityType === party && l.remoteStatus !== "DELETED");
      const sameBusiness = r.businessId === connector.businessId;
      const approved = input.type !== "VendorRecord" || r.approvalStatus === "APPROVED";
      const canPush = sameBusiness && approved && (!link || link.remoteStatus === "ACTIVE");
      return {
        id: r.id,
        links,
        actions: {
          ...(input.type === "VendorRecord" ? { pushVendor: canPush } : { pushCustomer: canPush }),
          inactivate: sameBusiness && !!link && link.remoteStatus === "ACTIVE",
        },
        blockedReason: !sameBusiness
          ? otherBusiness
          : !approved
            ? "Approve the vendor before sending it to QuickBooks."
            : link && link.remoteStatus !== "ACTIVE"
              ? `The linked QuickBooks ${party.toLowerCase()} is inactive.`
              : null,
      };
    });
  }

  const pos = (await db.purchaseOrder.findMany({
    where: { workspaceId: input.workspaceId, id: { in: ids } },
    select: { id: true, businessId: true, status: true, vendorId: true },
  })) as Array<{ id: string; businessId: string; status: string; vendorId: string | null }>;
  const vendorIds = pos.map((p) => p.vendorId).filter((v): v is string => !!v);
  const vendorLinks = (await db.ownerConnectorRecord.findMany({
    where: { connectorId: connector.id, entityType: "Vendor", opsiqEntityType: "VendorRecord", opsiqEntityId: { in: vendorIds }, remoteStatus: "ACTIVE" },
    select: { opsiqEntityId: true },
  })) as Array<{ opsiqEntityId: string }>;
  const linkedVendors = new Set(vendorLinks.map((v) => v.opsiqEntityId));
  return pos.map((po) => {
    const links = linksFor(po.id);
    const sameBusiness = po.businessId === connector.businessId;
    const vendorLinked = !!po.vendorId && linkedVendors.has(po.vendorId);
    const hasPo = links.some((l) => l.entityType === "PurchaseOrder");
    const hasBill = links.some((l) => l.entityType === "Bill");
    const pushable = ["APPROVED", "ISSUED", "DELIVERED"].includes(po.status);
    return {
      id: po.id,
      links,
      actions: {
        pushPurchaseOrder: sameBusiness && vendorLinked && pushable && !hasPo,
        recordBill: sameBusiness && vendorLinked && po.status === "DELIVERED" && !hasBill,
      },
      blockedReason: !sameBusiness
        ? otherBusiness
        : !po.vendorId
          ? "Assign an approved vendor to this purchase order first."
          : !vendorLinked
            ? "Send this purchase order's vendor to QuickBooks first."
            : !pushable
              ? "Only approved, issued or delivered purchase orders can be sent to QuickBooks."
              : null,
    };
  });
}
