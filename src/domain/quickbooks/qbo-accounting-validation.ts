/**
 * QuickBooks Online — accounting-correctness validation for governed writes.
 *
 * This module NEVER synthesizes missing accounting facts. When a payload
 * cannot be confirmed correct (a required ref is missing, an amount doesn't
 * reconcile, a referenced account/customer/vendor/item is missing or
 * inactive, a journal entry doesn't balance) it is rejected with explicit
 * issues. TxnTaxDetail, if present on a body, is passed through untouched —
 * OpsIQ does not compute or validate tax; QBO's automated sales tax / company
 * tax settings own that.
 *
 * Pure module: no DB, no network. `ctx.resolveRef` is caller-supplied and
 * synchronous by contract (see qbo-contracts usage in the calling service) —
 * callers pre-resolve refs from their own already-fetched/cached QBO mirror
 * before calling validateQboWrite.
 */

import { z } from "zod/v4";
import type { QboEntityName, QboEntityOperation } from "./qbo-entities";
import { isQboOperationSupported } from "./qbo-entities";

// ─── Context ────────────────────────────────────────────────────────────────

export interface QboResolvedRef {
  active: boolean;
  accountType?: string;
  accountSubType?: string;
}

export interface QboValidationContext {
  homeCurrency: string;
  multiCurrencyEnabled: boolean;
  /** Synchronous lookup against the caller's already-fetched QBO mirror; null when the ref does not exist. */
  resolveRef(entity: QboEntityName, id: string): QboResolvedRef | null;
}

export type QboWriteValidationResult = { ok: true } | { ok: false; issues: string[] };

// ─── Primitive helpers ──────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Money must be finite and carry at most 2 decimal places (float-safe: compares cents, not raw division). */
export function isValidMoney(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toCents(n: number): number {
  return Math.round(n * 100);
}

function refId(v: unknown): string | null {
  const rec = asRecord(v);
  const value = rec?.value;
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ─── Common cross-cutting checks (currency, refs) ──────────────────────────

function checkCurrency(body: Record<string, unknown>, ctx: QboValidationContext, issues: string[]): void {
  const currencyRef = asRecord(body.CurrencyRef);
  const code = currencyRef ? refId(currencyRef) : null;

  if (!ctx.multiCurrencyEnabled) {
    if (code && code !== ctx.homeCurrency) {
      issues.push(`CurrencyRef '${code}' does not match home currency '${ctx.homeCurrency}' and multicurrency is disabled`);
    }
    return;
  }

  if (code && code !== ctx.homeCurrency) {
    const rate = body.ExchangeRate;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      issues.push("ExchangeRate is required and must be > 0 when CurrencyRef differs from home currency");
    }
  }
}

/** Resolves and checks one ref field (e.g. CustomerRef) is present, resolvable, and active. Returns the resolved ref or null. */
function requireActiveRef(
  body: Record<string, unknown>,
  field: string,
  entity: QboEntityName,
  ctx: QboValidationContext,
  issues: string[],
  opts: { required: boolean } = { required: true },
): QboResolvedRef | null {
  const ref = asRecord(body[field]);
  const id = ref ? refId(ref) : null;
  if (!id) {
    if (opts.required) issues.push(`${field} is required`);
    return null;
  }
  const resolved = ctx.resolveRef(entity, id);
  if (!resolved) {
    issues.push(`${field} references a ${entity} (${id}) that does not exist`);
    return null;
  }
  if (!resolved.active) {
    issues.push(`${field} references an inactive ${entity} (${id})`);
    return null;
  }
  return resolved;
}

function sumLineAmounts(lines: unknown[]): number {
  let cents = 0;
  for (const raw of lines) {
    const line = asRecord(raw);
    const amt = line?.Amount;
    if (typeof amt === "number" && Number.isFinite(amt)) cents += toCents(amt);
  }
  return cents / 100;
}

/**
 * TotalAmt is QBO-COMPUTED for line-item transactions (Invoice, SalesReceipt,
 * CreditMemo, RefundReceipt, Estimate, Bill, PurchaseOrder, VendorCredit,
 * Purchase, Deposit) — QBO derives it as the sum of the transaction's lines
 * and rejects a mismatched value itself. So it is OPTIONAL here: omitting it
 * is correct (let QBO compute it). When the caller supplies it anyway, it
 * must be a valid non-negative amount and must equal the sum of Line[].Amount
 * in integer cents (float-safe) — a caller-supplied TotalAmt that silently
 * disagreed with its own lines would be exactly the kind of unverifiable
 * accounting fact OpsIQ must reject rather than guess about.
 *
 * This is intentionally NOT used for Payment/BillPayment: those allow a
 * partial allocation where TotalAmt legitimately exceeds the sum of the
 * lines being applied (unapplied amount / credit) — see validatePaymentLines
 * — and TotalAmt is REQUIRED there since QBO does not compute it from lines.
 */
function validateComputedTotalAmt(body: Record<string, unknown>, issues: string[]): void {
  if (body.TotalAmt === undefined) return;

  if (!isValidMoney(body.TotalAmt) || (body.TotalAmt as number) < 0) {
    issues.push("TotalAmt, if supplied, must be a non-negative amount with at most 2 decimal places");
    return;
  }

  const lines = asArray(body.Line);
  if (lines.length === 0) return; // nothing to reconcile TotalAmt against

  const sum = sumLineAmounts(lines);
  if (toCents(sum) !== toCents(body.TotalAmt as number)) {
    issues.push(`TotalAmt (${body.TotalAmt}) does not equal the sum of line Amounts (${sum})`);
  }
}

// ─── Entity-specific validators ────────────────────────────────────────────

const displayNameSchema = z
  .string()
  .min(1, "DisplayName is required")
  .max(500, "DisplayName must be at most 500 characters")
  .refine((s) => !s.includes(":"), { message: "DisplayName cannot contain ':'" });

const emailSchema = z.string().email("Invalid email address");

function validateNameListParty(body: Record<string, unknown>, issues: string[]): void {
  if (typeof body.DisplayName !== "string") {
    issues.push("DisplayName is required");
  } else {
    const nameResult = displayNameSchema.safeParse(body.DisplayName);
    if (!nameResult.success) {
      for (const issue of nameResult.error.issues) issues.push(issue.message);
    }
  }
  const emailNode = asRecord(body.PrimaryEmailAddr);
  if (emailNode && typeof emailNode.Address === "string" && emailNode.Address.length > 0) {
    const emailResult = emailSchema.safeParse(emailNode.Address);
    if (!emailResult.success) issues.push("PrimaryEmailAddr.Address is not a valid email address");
  }
}

function lineItemRef(line: Record<string, unknown>): { qty: number | null; unitPrice: number | null; amount: number | null } {
  const detail = asRecord(line.SalesItemLineDetail);
  const qty = typeof detail?.Qty === "number" ? detail.Qty : null;
  const unitPrice = typeof detail?.UnitPrice === "number" ? detail.UnitPrice : null;
  const amount = typeof line.Amount === "number" ? line.Amount : null;
  return { qty, unitPrice, amount };
}

function validateSalesLines(lines: unknown[], entity: QboEntityName, ctx: QboValidationContext, issues: string[], detailKey: "SalesItemLineDetail"): void {
  const itemLines = lines.filter((raw) => {
    const l = asRecord(raw);
    return l ? l[detailKey] !== undefined : false;
  });
  if (itemLines.length === 0) {
    issues.push(`At least one line with ${detailKey} is required`);
    return;
  }
  itemLines.forEach((raw, idx) => {
    const line = asRecord(raw)!;
    const detail = asRecord(line[detailKey]);
    const itemRef = detail ? asRecord(detail.ItemRef) : null;
    const itemId = itemRef ? refId(itemRef) : null;
    if (!itemId) {
      issues.push(`Line[${idx}].${detailKey}.ItemRef is required`);
    } else {
      const resolved = ctx.resolveRef("Item", itemId);
      if (!resolved) issues.push(`Line[${idx}].${detailKey}.ItemRef references an Item (${itemId}) that does not exist`);
      else if (!resolved.active) issues.push(`Line[${idx}].${detailKey}.ItemRef references an inactive Item (${itemId})`);
    }
    if (typeof line.Amount !== "number") {
      issues.push(`Line[${idx}].Amount is required`);
    } else if (!isValidMoney(line.Amount) || line.Amount < 0) {
      issues.push(`Line[${idx}].Amount must be a non-negative amount with at most 2 decimal places`);
    } else {
      const { qty, unitPrice } = lineItemRef(line);
      if (qty !== null && unitPrice !== null) {
        const expected = round2(qty * unitPrice);
        if (Math.abs(expected - line.Amount) > 0.005) {
          issues.push(`Line[${idx}].Amount (${line.Amount}) does not equal Qty * UnitPrice (${expected})`);
        }
      }
    }
  });
}

function validateExpenseLines(lines: unknown[], ctx: QboValidationContext, issues: string[]): void {
  const usable = lines.filter((raw) => {
    const l = asRecord(raw);
    return l ? l.AccountBasedExpenseLineDetail !== undefined || l.ItemBasedExpenseLineDetail !== undefined : false;
  });
  if (usable.length === 0) {
    issues.push("At least one line with AccountBasedExpenseLineDetail or ItemBasedExpenseLineDetail is required");
    return;
  }
  usable.forEach((raw, idx) => {
    const line = asRecord(raw)!;
    const accDetail = asRecord(line.AccountBasedExpenseLineDetail);
    const itemDetail = asRecord(line.ItemBasedExpenseLineDetail);

    if (accDetail) {
      const accountId = refId(accDetail.AccountRef);
      if (!accountId) issues.push(`Line[${idx}].AccountBasedExpenseLineDetail.AccountRef is required`);
      else {
        const resolved = ctx.resolveRef("Account", accountId);
        if (!resolved) issues.push(`Line[${idx}].AccountRef references an Account (${accountId}) that does not exist`);
        else if (!resolved.active) issues.push(`Line[${idx}].AccountRef references an inactive Account (${accountId})`);
      }
    } else if (itemDetail) {
      const itemId = refId(itemDetail.ItemRef);
      if (!itemId) issues.push(`Line[${idx}].ItemBasedExpenseLineDetail.ItemRef is required`);
      else {
        const resolved = ctx.resolveRef("Item", itemId);
        if (!resolved) issues.push(`Line[${idx}].ItemRef references an Item (${itemId}) that does not exist`);
        else if (!resolved.active) issues.push(`Line[${idx}].ItemRef references an inactive Item (${itemId})`);
      }
    }

    if (typeof line.Amount !== "number" || !isValidMoney(line.Amount)) {
      issues.push(`Line[${idx}].Amount must be a valid amount with at most 2 decimal places`);
    }
  });
}

const LINKED_TXN_TYPES = new Set(["Invoice", "CreditMemo", "JournalEntry"]);
const BILL_PAYMENT_LINKED_TXN_TYPES = new Set(["Bill", "VendorCredit", "JournalEntry"]);

function validatePaymentLines(lines: unknown[], allowedTxnTypes: Set<string>, totalAmt: number, issues: string[]): void {
  const sum = sumLineAmounts(lines);
  if (toCents(sum) > toCents(totalAmt)) {
    issues.push(`Sum of Line[].Amount (${sum}) exceeds TotalAmt (${totalAmt})`);
  }
  lines.forEach((raw, idx) => {
    const line = asRecord(raw);
    const linkedTxns = asArray(line?.LinkedTxn);
    for (const rawTxn of linkedTxns) {
      const txn = asRecord(rawTxn);
      const txnType = typeof txn?.TxnType === "string" ? txn.TxnType : null;
      if (!txnType || !allowedTxnTypes.has(txnType)) {
        issues.push(`Line[${idx}].LinkedTxn.TxnType '${txnType ?? "?"}' is not a supported linked transaction type`);
      }
    }
  });
}

const AR_ACCOUNT_TYPE = "Accounts Receivable";
const AP_ACCOUNT_TYPE = "Accounts Payable";

function validateJournalEntryLines(lines: unknown[], ctx: QboValidationContext, issues: string[]): void {
  if (lines.length < 2) {
    issues.push("JournalEntry requires at least 2 lines");
    return;
  }

  let debitCents = 0;
  let creditCents = 0;

  lines.forEach((raw, idx) => {
    const line = asRecord(raw);
    const detail = asRecord(line?.JournalEntryLineDetail);
    const postingType = detail ? detail.PostingType : null;
    const accountId = detail ? refId(detail.AccountRef) : null;
    const amount = line?.Amount;

    if (postingType !== "Debit" && postingType !== "Credit") {
      issues.push(`Line[${idx}].JournalEntryLineDetail.PostingType must be 'Debit' or 'Credit'`);
    }
    if (!accountId) {
      issues.push(`Line[${idx}].JournalEntryLineDetail.AccountRef is required`);
    }
    if (typeof amount !== "number" || !isValidMoney(amount) || amount < 0) {
      issues.push(`Line[${idx}].Amount must be a non-negative amount with at most 2 decimal places`);
    }

    let resolved: QboResolvedRef | null = null;
    if (accountId) {
      resolved = ctx.resolveRef("Account", accountId);
      if (!resolved) issues.push(`Line[${idx}].AccountRef references an Account (${accountId}) that does not exist`);
      else if (!resolved.active) issues.push(`Line[${idx}].AccountRef references an inactive Account (${accountId})`);
    }

    if (resolved && (resolved.accountType === AR_ACCOUNT_TYPE || resolved.accountType === AP_ACCOUNT_TYPE)) {
      const entityDetail = detail ? asRecord(detail.Entity) : null;
      const entityType = entityDetail ? entityDetail.Type : null;
      const entityRef = entityDetail ? asRecord(entityDetail.EntityRef) : null;
      const expectedType = resolved.accountType === AR_ACCOUNT_TYPE ? "Customer" : "Vendor";
      if (entityType !== expectedType || !entityRef || !refId(entityRef)) {
        issues.push(
          `Line[${idx}] posts to ${resolved.accountType} but is missing JournalEntryLineDetail.Entity.Type='${expectedType}' with a resolved EntityRef`,
        );
      }
    }

    if (typeof amount === "number" && isValidMoney(amount)) {
      if (postingType === "Debit") debitCents += toCents(amount);
      else if (postingType === "Credit") creditCents += toCents(amount);
    }
  });

  if (debitCents !== creditCents) {
    issues.push(`JournalEntry does not balance: debits ${debitCents / 100} !== credits ${creditCents / 100}`);
  }
}

// ─── Entity dispatch ────────────────────────────────────────────────────────

function validateCreateOrUpdate(entity: QboEntityName, body: Record<string, unknown>, ctx: QboValidationContext, issues: string[]): void {
  checkCurrency(body, ctx, issues);

  switch (entity) {
    case "Customer":
    case "Vendor": {
      validateNameListParty(body, issues);
      break;
    }

    case "Invoice": {
      requireActiveRef(body, "CustomerRef", "Customer", ctx, issues);
      const lines = asArray(body.Line);
      validateSalesLines(lines, entity, ctx, issues, "SalesItemLineDetail");
      validateComputedTotalAmt(body, issues);
      break;
    }

    case "SalesReceipt": {
      requireActiveRef(body, "CustomerRef", "Customer", ctx, issues, { required: false });
      validateSalesLines(asArray(body.Line), entity, ctx, issues, "SalesItemLineDetail");
      validateComputedTotalAmt(body, issues);
      break;
    }

    case "CreditMemo": {
      requireActiveRef(body, "CustomerRef", "Customer", ctx, issues);
      validateSalesLines(asArray(body.Line), entity, ctx, issues, "SalesItemLineDetail");
      validateComputedTotalAmt(body, issues);
      break;
    }

    case "RefundReceipt": {
      requireActiveRef(body, "CustomerRef", "Customer", ctx, issues);
      validateSalesLines(asArray(body.Line), entity, ctx, issues, "SalesItemLineDetail");
      validateComputedTotalAmt(body, issues);
      const depositTo = asRecord(body.DepositToAccountRef);
      const depositId = depositTo ? refId(depositTo) : null;
      if (!depositId) {
        issues.push("DepositToAccountRef is required for a refund");
      } else {
        const resolved = ctx.resolveRef("Account", depositId);
        if (!resolved) issues.push(`DepositToAccountRef references an Account (${depositId}) that does not exist`);
        else if (!resolved.active) issues.push(`DepositToAccountRef references an inactive Account (${depositId})`);
      }
      break;
    }

    case "Bill": {
      requireActiveRef(body, "VendorRef", "Vendor", ctx, issues);
      validateExpenseLines(asArray(body.Line), ctx, issues);
      validateComputedTotalAmt(body, issues);
      break;
    }

    case "PurchaseOrder": {
      requireActiveRef(body, "VendorRef", "Vendor", ctx, issues);
      validateExpenseLines(asArray(body.Line), ctx, issues);
      validateComputedTotalAmt(body, issues);
      const apRef = body.APAccountRef;
      if (apRef !== undefined) {
        const apId = refId(apRef);
        if (!apId) issues.push("APAccountRef, if provided, must resolve to an Account");
        else {
          const resolved = ctx.resolveRef("Account", apId);
          if (!resolved) issues.push(`APAccountRef references an Account (${apId}) that does not exist`);
          else if (!resolved.active) issues.push(`APAccountRef references an inactive Account (${apId})`);
        }
      }
      break;
    }

    case "VendorCredit": {
      requireActiveRef(body, "VendorRef", "Vendor", ctx, issues);
      validateExpenseLines(asArray(body.Line), ctx, issues);
      validateComputedTotalAmt(body, issues);
      break;
    }

    case "Purchase": {
      const accountId = refId(body.AccountRef);
      if (!accountId) issues.push("AccountRef is required");
      else {
        const resolved = ctx.resolveRef("Account", accountId);
        if (!resolved) issues.push(`AccountRef references an Account (${accountId}) that does not exist`);
        else if (!resolved.active) issues.push(`AccountRef references an inactive Account (${accountId})`);
      }
      if (typeof body.PaymentType !== "string" || body.PaymentType.length === 0) {
        issues.push("PaymentType is required");
      }
      validateComputedTotalAmt(body, issues);
      break;
    }

    case "Deposit": {
      const depositTo = refId(body.DepositToAccountRef);
      if (!depositTo) issues.push("DepositToAccountRef is required");
      else {
        const resolved = ctx.resolveRef("Account", depositTo);
        if (!resolved) issues.push(`DepositToAccountRef references an Account (${depositTo}) that does not exist`);
        else if (!resolved.active) issues.push(`DepositToAccountRef references an inactive Account (${depositTo})`);
      }
      const lines = asArray(body.Line);
      if (lines.length === 0) issues.push("Deposit requires at least one line");
      lines.forEach((raw, idx) => {
        const line = asRecord(raw);
        if (!line || typeof line.Amount !== "number" || !isValidMoney(line.Amount)) {
          issues.push(`Line[${idx}].Amount must be a valid amount with at most 2 decimal places`);
        }
      });
      validateComputedTotalAmt(body, issues);
      break;
    }

    case "Transfer": {
      const fromId = refId(body.FromAccountRef);
      const toId = refId(body.ToAccountRef);
      if (!fromId) issues.push("FromAccountRef is required");
      if (!toId) issues.push("ToAccountRef is required");
      if (fromId && toId && fromId === toId) issues.push("FromAccountRef and ToAccountRef must be distinct accounts");
      for (const [field, id] of [
        ["FromAccountRef", fromId],
        ["ToAccountRef", toId],
      ] as const) {
        if (!id) continue;
        const resolved = ctx.resolveRef("Account", id);
        if (!resolved) issues.push(`${field} references an Account (${id}) that does not exist`);
        else if (!resolved.active) issues.push(`${field} references an inactive Account (${id})`);
      }
      if (typeof body.Amount !== "number" || !isValidMoney(body.Amount) || body.Amount <= 0) {
        issues.push("Amount must be a positive amount with at most 2 decimal places");
      }
      break;
    }

    case "Payment": {
      requireActiveRef(body, "CustomerRef", "Customer", ctx, issues);
      const totalAmt = body.TotalAmt;
      if (typeof totalAmt !== "number" || !isValidMoney(totalAmt) || totalAmt <= 0) {
        issues.push("TotalAmt must be a positive amount with at most 2 decimal places");
      } else {
        validatePaymentLines(asArray(body.Line), LINKED_TXN_TYPES, totalAmt, issues);
      }
      break;
    }

    case "BillPayment": {
      requireActiveRef(body, "VendorRef", "Vendor", ctx, issues);
      const payType = body.PayType;
      if (payType === "Check") {
        const check = asRecord(body.CheckPayment);
        const bankId = check ? refId(check.BankAccountRef) : null;
        if (!bankId) issues.push("CheckPayment.BankAccountRef is required when PayType is 'Check'");
        else {
          const resolved = ctx.resolveRef("Account", bankId);
          if (!resolved) issues.push(`CheckPayment.BankAccountRef references an Account (${bankId}) that does not exist`);
          else if (!resolved.active) issues.push(`CheckPayment.BankAccountRef references an inactive Account (${bankId})`);
        }
      } else if (payType === "CreditCard") {
        const cc = asRecord(body.CreditCardPayment);
        const ccId = cc ? refId(cc.CCAccountRef) : null;
        if (!ccId) issues.push("CreditCardPayment.CCAccountRef is required when PayType is 'CreditCard'");
        else {
          const resolved = ctx.resolveRef("Account", ccId);
          if (!resolved) issues.push(`CreditCardPayment.CCAccountRef references an Account (${ccId}) that does not exist`);
          else if (!resolved.active) issues.push(`CreditCardPayment.CCAccountRef references an inactive Account (${ccId})`);
        }
      } else {
        issues.push("PayType must be 'Check' or 'CreditCard'");
      }

      const totalAmt = body.TotalAmt;
      if (typeof totalAmt !== "number" || !isValidMoney(totalAmt) || totalAmt <= 0) {
        issues.push("TotalAmt must be a positive amount with at most 2 decimal places");
      } else {
        validatePaymentLines(asArray(body.Line), BILL_PAYMENT_LINKED_TXN_TYPES, totalAmt, issues);
      }
      break;
    }

    case "JournalEntry": {
      validateJournalEntryLines(asArray(body.Line), ctx, issues);
      break;
    }

    case "Account":
    case "Item":
    case "Class":
    case "Department":
    case "Term":
    case "PaymentMethod": {
      const name = body.Name;
      if (typeof name !== "string" || name.trim().length === 0) issues.push("Name is required");
      else if (name.length > 100) issues.push("Name must be at most 100 characters");
      else if (name.includes(":")) issues.push("Name cannot contain ':'");
      break;
    }

    case "Estimate": {
      requireActiveRef(body, "CustomerRef", "Customer", ctx, issues);
      validateSalesLines(asArray(body.Line), entity, ctx, issues, "SalesItemLineDetail");
      validateComputedTotalAmt(body, issues);
      break;
    }

    case "CompanyInfo":
    case "Preferences": {
      // Read-only reference data — not written by OpsIQ.
      issues.push(`${entity} is not a writable entity`);
      break;
    }
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Validates a QBO write payload for accounting correctness before it is ever
 * sent to the API. Structural checks (money precision, required refs) plus
 * cross-field/context checks (ref existence + active state, currency,
 * balance) via `ctx`.
 *
 * TxnTaxDetail is intentionally NOT validated or mutated here — it passes
 * through untouched to QBO, which owns tax computation.
 */
export function validateQboWrite(
  entity: QboEntityName,
  op: QboEntityOperation,
  body: unknown,
  ctx: QboValidationContext,
): QboWriteValidationResult {
  const issues: string[] = [];

  if (!isQboOperationSupported(entity, op)) {
    return { ok: false, issues: [`${entity} does not support the '${op}' operation`] };
  }

  const record = asRecord(body);
  if (!record) {
    return { ok: false, issues: ["Request body must be a JSON object"] };
  }

  if (op === "delete" || op === "void" || op === "inactivate") {
    if (typeof record.Id !== "string" || record.Id.length === 0) issues.push("Id is required");
    if (typeof record.SyncToken !== "string" || record.SyncToken.length === 0) issues.push("SyncToken is required");
    return issues.length === 0 ? { ok: true } : { ok: false, issues };
  }

  if (op === "update") {
    if (typeof record.Id !== "string" || record.Id.length === 0) issues.push("Id is required for an update");
    if (typeof record.SyncToken !== "string" || record.SyncToken.length === 0) issues.push("SyncToken is required for an update");
  }

  validateCreateOrUpdate(entity, record, ctx, issues);

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
