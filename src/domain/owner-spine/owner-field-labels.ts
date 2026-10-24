/**
 * Owner Intelligence Spine — the ONE mapping from internal field identifiers to plain owner words (pure).
 *
 * Domain rules, persisted findings and gate payloads name evidence by its canonical field (`bankBalance`, `cashOnHand`,
 * `refundReworkCost`, ...). Those identifiers are implementation detail: an owner must never read a camelCase key, a snake_case
 * key or the words "null" / "undefined" in ordinary UI. Every surface that prints a missing-information item or a free-text
 * evidence line routes it through this module instead of carrying its own replacement table.
 *
 * Presentation only: it never decides what is missing, only how a missing item is worded. Unknown keys fall back to a generic
 * camelCase / snake_case → words conversion, so a field added later still reads as words.
 */
import { humanizeMetricKey, humanizeSnakeCase } from "@/lib/metric-label";

/**
 * Owner wording for canonical internal fields. Lower case, so it composes inside a sentence ("add your bank balance").
 * `cashOnHand` (Finance) and `cashInHand` (Cash flow) are the same physical thing — cash held outside the bank.
 */
export const OWNER_FIELD_LABEL: Readonly<Record<string, string>> = Object.freeze({
  bankBalance: "bank balance",
  cashOnHand: "cash in hand",
  cashInHand: "cash in hand",
  totalLiquidFunds: "cash in hand and bank balance",
  refundReworkCost: "refunds, redone work and complaint costs",
  refundAmount: "refunds",
  reworkCost: "redone work",
  complaintCost: "complaint costs",
  discountAmount: "discounts",
  costOfGoodsOrServices: "cost of goods or services",
  fixedCosts: "fixed costs",
  variableCosts: "variable costs",
  salaryPayroll: "salaries and wages",
  deliveryFulfilmentCost: "delivery costs",
  loanEmiDebtPayments: "loan payments",
  totalDebtOutstanding: "total debt",
  receivablesOverdue: "overdue customer payments",
  payablesOverdue: "overdue supplier payments",
  ownerWithdrawals: "money you took out",
  inventoryStockCashLock: "cash tied up in stock",
  repeatCustomerCount: "repeat customers",
  customerCount: "customers",
  orderCount: "orders",
  b2cRevenue: "sales to individual customers",
  b2bRevenue: "sales to other businesses",
});

/** Owner words for one internal field identifier (`bankBalance` → "bank balance"). */
export function ownerFieldLabel(key: string): string {
  if (!key) return key;
  const own = Object.prototype.hasOwnProperty.call(OWNER_FIELD_LABEL, key) ? OWNER_FIELD_LABEL[key] : undefined;
  if (own) return own;
  return key.includes("_") ? humanizeSnakeCase(key).toLowerCase() : humanizeMetricKey(key);
}

// A camelCase identifier (lowercase start, an internal capital): `bankBalance`, `refundReworkCost`, `dataConfidenceScore`.
const CAMEL_TOKEN = /\b([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)\b/g;
// The bare words an implementation prints for a missing value.
const NULLISH_WORD = /\b(null|undefined|NaN)\b/g;

/**
 * Free text with every internal identifier replaced by owner words. Text with no identifier is returned unchanged.
 * Quoted prose that deliberately uses the words "null" or "undefined" is not expected in owner copy; a missing value is
 * "not entered".
 */
export function ownerSafeText(text: string): string {
  if (!text) return text;
  return text.replace(CAMEL_TOKEN, (token) => ownerFieldLabel(token)).replace(NULLISH_WORD, "not entered");
}

/**
 * One "what is still missing" item in owner words. A bare field key becomes its label; a sentence has any embedded
 * identifier replaced. A key that stands alone is capitalised only when the caller asks (`capitalise`) — most lists join
 * the items into a sentence.
 */
export function ownerMissingItemText(item: string, opts: { capitalise?: boolean } = {}): string {
  const text = Object.prototype.hasOwnProperty.call(OWNER_FIELD_LABEL, item) ? OWNER_FIELD_LABEL[item] : ownerSafeText(item);
  return opts.capitalise && text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** A list of missing items in owner words, de-duplicated after rewording (`cashOnHand` and `cashInHand` read the same). */
export function ownerMissingItems(items: readonly string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    const text = ownerMissingItemText(item);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}
