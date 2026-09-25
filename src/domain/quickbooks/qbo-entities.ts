/**
 * QuickBooks Online — entity capability matrix.
 *
 * QBO entities do NOT behave identically, so every operation is looked up in
 * this matrix instead of being assumed:
 *
 *  - Name-list entities (Account, Customer, Vendor, Item, Class, Department,
 *    Term, PaymentMethod) cannot be deleted. They are soft-deleted by a sparse
 *    update setting Active=false ("inactivate").
 *  - Transaction entities are deleted with POST /<resource>?operation=delete
 *    and a body of { Id, SyncToken }.
 *  - Void differs by entity: Invoice uses ?operation=void; Payment,
 *    SalesReceipt and BillPayment use ?operation=update&include=void with a
 *    sparse { Id, SyncToken } body. Entities with no void support (e.g. Bill,
 *    Deposit, VendorCredit, JournalEntry) must be deleted or reversed instead.
 *  - Every update and delete requires the CURRENT SyncToken; a stale token is
 *    rejected by QBO with fault code 5010 (Stale Object Error).
 *  - CDC supports every synced entity below; it does NOT support TaxAgency,
 *    TaxCode, TaxRate, JournalCode or TimeActivity (not synced by OpsIQ).
 *
 * Exclusions (no current OpsIQ product use — documented, not silently missing):
 *  - TaxCode / TaxRate / TaxAgency: OpsIQ does not compute or file tax; tax on
 *    governed writes is left to QBO's automated sales tax / company defaults.
 *  - Budget: OpsIQ owns budgeting (BudgetPlanSnapshot); QBO budgets are not an input.
 *  - Employee / TimeActivity: payroll and time tracking are out of scope; OpsIQ
 *    models workload through its own human-execution records.
 *  - Attachable: OpsIQ evidence uploads are separate; no product flow attaches
 *    files to QBO transactions.
 *
 * Pure module — no DB, no network.
 */

export type QboEntityKind = "config" | "name-list" | "transaction";

export type QboVoidMode = "operation-void" | "update-include-void";

export interface QboEntitySpec {
  /** QBO entity name exactly as it appears in API payloads, e.g. "Invoice". */
  name: QboEntityName;
  /** Lower-case resource path segment, e.g. "invoice". */
  resource: string;
  kind: QboEntityKind;
  /** Pulled by initial sync via the query endpoint. */
  sync: boolean;
  /** Included in incremental CDC requests. */
  cdc: boolean;
  create: boolean;
  /** Supports sparse (partial) update. */
  sparseUpdate: boolean;
  /** POST ?operation=delete supported. */
  delete: boolean;
  /** How (and whether) the entity can be voided. */
  void: QboVoidMode | null;
  /** Soft-delete via Active=false (name-list entities only). */
  inactivate: boolean;
  /** Creating/changing this entity moves or commits money. */
  monetary: boolean;
  /**
   * High-risk accounting mutation: requires an explicit owner confirmation on
   * every governed write, is never executed autonomously.
   */
  highRisk: boolean;
}

export const QBO_ENTITY_NAMES = [
  "CompanyInfo",
  "Preferences",
  "Account",
  "Customer",
  "Vendor",
  "Item",
  "Class",
  "Department",
  "Term",
  "PaymentMethod",
  "Estimate",
  "Invoice",
  "Payment",
  "SalesReceipt",
  "CreditMemo",
  "RefundReceipt",
  "Bill",
  "BillPayment",
  "Purchase",
  "PurchaseOrder",
  "VendorCredit",
  "Deposit",
  "Transfer",
  "JournalEntry",
] as const;

export type QboEntityName = (typeof QBO_ENTITY_NAMES)[number];

type SpecInput = Omit<QboEntitySpec, "name" | "resource">;

const cfg = (): SpecInput => ({
  kind: "config", sync: false, cdc: false, create: false, sparseUpdate: false,
  delete: false, void: null, inactivate: false, monetary: false, highRisk: false,
});
const nameList = (over: Partial<SpecInput> = {}): SpecInput => ({
  kind: "name-list", sync: true, cdc: true, create: true, sparseUpdate: true,
  delete: false, void: null, inactivate: true, monetary: false, highRisk: false, ...over,
});
const txn = (over: Partial<SpecInput> = {}): SpecInput => ({
  kind: "transaction", sync: true, cdc: true, create: true, sparseUpdate: true,
  delete: true, void: null, inactivate: false, monetary: true, highRisk: false, ...over,
});

const SPECS: Record<QboEntityName, SpecInput> = {
  CompanyInfo: cfg(),
  Preferences: cfg(),
  // Account changes alter the chart of accounts every posting depends on.
  Account: nameList({ highRisk: true }),
  Customer: nameList(),
  Vendor: nameList(),
  Item: nameList(),
  Class: nameList(),
  Department: nameList(),
  Term: nameList(),
  PaymentMethod: nameList(),
  // Estimates are non-posting.
  Estimate: txn({ monetary: false }),
  Invoice: txn({ void: "operation-void" }),
  Payment: txn({ void: "update-include-void", highRisk: true }),
  SalesReceipt: txn({ void: "update-include-void" }),
  CreditMemo: txn(),
  RefundReceipt: txn({ highRisk: true }),
  Bill: txn(),
  BillPayment: txn({ void: "update-include-void", highRisk: true }),
  Purchase: txn({ highRisk: true }),
  // Purchase orders are non-posting commitments.
  PurchaseOrder: txn({ monetary: false }),
  VendorCredit: txn(),
  Deposit: txn({ highRisk: true }),
  Transfer: txn({ highRisk: true }),
  JournalEntry: txn({ highRisk: true }),
};

export const QBO_ENTITIES: Readonly<Record<QboEntityName, QboEntitySpec>> = Object.freeze(
  Object.fromEntries(
    QBO_ENTITY_NAMES.map((name) => [name, Object.freeze({ name, resource: name.toLowerCase(), ...SPECS[name] })]),
  ) as Record<QboEntityName, QboEntitySpec>,
);

/**
 * Initial-sync order: reference/master data first so transactional rows can be
 * resolved against already-mirrored references.
 */
export const QBO_SYNC_ENTITY_ORDER: readonly QboEntityName[] = QBO_ENTITY_NAMES.filter((n) => QBO_ENTITIES[n].sync);

export const QBO_CDC_ENTITIES: readonly QboEntityName[] = QBO_ENTITY_NAMES.filter((n) => QBO_ENTITIES[n].cdc);

export type QboEntityOperation = "create" | "update" | "delete" | "void" | "inactivate";

export function isQboOperationSupported(name: QboEntityName, op: QboEntityOperation): boolean {
  const s = QBO_ENTITIES[name];
  switch (op) {
    case "create":
      return s.create;
    case "update":
      return s.sparseUpdate;
    case "delete":
      return s.delete;
    case "void":
      return s.void !== null;
    case "inactivate":
      return s.inactivate;
  }
}

/** Every delete, void and inactivate is treated as high risk, as is any write to a highRisk entity. */
export function isHighRiskOperation(name: QboEntityName, op: QboEntityOperation): boolean {
  if (op === "delete" || op === "void" || op === "inactivate") return true;
  return QBO_ENTITIES[name].highRisk;
}

// ─── Reports ────────────────────────────────────────────────────────────────

export const QBO_REPORT_NAMES = [
  "ProfitAndLoss",
  "BalanceSheet",
  "CashFlow",
  "TrialBalance",
  "AgedReceivables",
  "AgedPayables",
] as const;

export type QboReportName = (typeof QBO_REPORT_NAMES)[number];

/** Mirror entityType for a stored report, e.g. "Report:ProfitAndLoss". */
export function reportRecordEntityType(name: QboReportName): string {
  return `Report:${name}`;
}
