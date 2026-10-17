/**
 * Owner Finance — the snapshot form's fields, defined ONCE (pure). The "add a period" form and the "update a period" form
 * render the same fields, in the same tiers, with the same plain-language labels and hints, so a figure is never described
 * two ways. Names match `financialSnapshotCreateSchema` / `financialSnapshotAmendSchema` 1:1.
 */
import { CASH_IN_HAND_COPY } from "./quick-entry";

export interface FinanceFieldDef { name: string; label: string; hint: string }

// Field names match financialSnapshotCreateSchema (Slice 6). `hint` is the plain-language
// explanation shown under each field (accounting term + short meaning + example, or what to
// enter if it doesn't apply) — a real usability test found the flat, unexplained ~27-field form
// unusable for an owner without an accounting background. Grouping these into progressive tiers
// (below) changes ONLY what's visible/expanded by default; every field name here still maps
// 1:1 to addSnapshot()'s FormData read, so the save payload is byte-for-byte unchanged.
export const FINANCE_FIELDS: ReadonlyArray<FinanceFieldDef> = [
  { name: "revenue", label: "Revenue", hint: "Total sales in a typical month, before costs. Example: 15000." },
  { name: "b2cRevenue", label: "B2C revenue", hint: "Sales directly to individual customers, if you track it separately. Leave blank if you don't split this out." },
  { name: "b2bRevenue", label: "B2B revenue", hint: "Sales to other businesses, if you track it separately. Leave blank if you don't split this out." },
  { name: "costOfGoodsOrServices", label: "Cost of goods/services", hint: "What it directly cost you to make or deliver what you sold (materials, direct labor) — accountants call this COGS." },
  { name: "fixedCosts", label: "Fixed costs", hint: "Rent, wages, and other costs that stay the same whether sales go up or down. Example: 7000." },
  { name: "variableCosts", label: "Variable costs", hint: "Costs that rise and fall with how much you sell, like materials or delivery. Example: 3000." },
  { name: "rent", label: "Rent", hint: "Rent for your business space, if any. Leave blank if you don't rent a space." },
  { name: "salaryPayroll", label: "Salary / payroll", hint: "Wages and salaries paid to staff, not including money you took for yourself." },
  { name: "utilities", label: "Utilities", hint: "Electricity, water, internet, and similar recurring bills." },
  { name: "deliveryFulfilmentCost", label: "Delivery / fulfilment", hint: "Shipping, courier, or delivery costs. Leave blank if you don't deliver." },
  { name: "marketingSpend", label: "Marketing spend", hint: "Advertising and promotion spend. Leave blank if you didn't spend on this." },
  { name: "discountAmount", label: "Discount amount", hint: "Discounts you gave customers this period." },
  { name: "refundAmount", label: "Refund amount", hint: "Refunds you paid out this period." },
  { name: "reworkCost", label: "Rework cost", hint: "Cost of redoing work that didn't meet quality the first time. Leave blank if this doesn't apply." },
  { name: "complaintCost", label: "Complaint cost", hint: "Cost of resolving customer complaints beyond a refund (e.g. replacement, goodwill). Leave blank if none." },
  { name: "loanEmiDebtPayments", label: "Loan / EMI payments", hint: "Loan or EMI payments you made this period. Leave blank if you have no loans." },
  { name: "totalDebtOutstanding", label: "Total debt outstanding", hint: "The total amount you still owe across all loans right now." },
  { name: "cashOnHand", label: CASH_IN_HAND_COPY.label, hint: CASH_IN_HAND_COPY.hint },
  { name: "receivables", label: "Receivables", hint: "Money customers owe you that isn't overdue yet — accountants call this accounts receivable." },
  { name: "receivablesOverdue", label: "Receivables overdue", hint: "Of the money customers owe you, how much is now overdue." },
  { name: "payables", label: "Payables", hint: "Money you owe suppliers that isn't overdue yet — accountants call this accounts payable." },
  { name: "payablesOverdue", label: "Payables overdue", hint: "Of the money you owe suppliers, how much is now overdue." },
  { name: "ownerWithdrawals", label: "Owner withdrawals", hint: "Money you personally took out of the business this period (not a salary)." },
  { name: "inventoryStockCashLock", label: "Inventory cash lock", hint: "Cash tied up in unsold stock right now. Leave blank if you don't hold stock." },
  { name: "orderCount", label: "Order count", hint: "Number of orders or jobs completed in this period." },
  { name: "customerCount", label: "Customer count", hint: "Number of different customers you served in this period." },
  { name: "repeatCustomerCount", label: "Repeat customers", hint: "Of those customers, how many had bought from you before." },
];

export function financeField(name: string) {
  const f = FINANCE_FIELDS.find((x) => x.name === name);
  if (!f) throw new Error(`Unknown finance field: ${name}`);
  return f;
}

// Progressive disclosure tiers — see the FINANCE_FIELDS comment above for why this never changes
// what gets submitted, only what's visible/expanded by default. Every FINANCE_FIELDS name appears
// in exactly one tier below.
export const QUICK_FIELD_NAMES = ["revenue", "fixedCosts", "variableCosts", "cashOnHand"];

export const IMPROVE_GROUPS: ReadonlyArray<{ title: string; fieldNames: string[] }> = [
  { title: "Sales detail", fieldNames: ["b2cRevenue", "b2bRevenue", "orderCount", "customerCount", "repeatCustomerCount"] },
  { title: "Regular costs", fieldNames: ["costOfGoodsOrServices", "rent", "salaryPayroll", "utilities", "deliveryFulfilmentCost", "marketingSpend"] },
  { title: "Customer money owed", fieldNames: ["receivables", "receivablesOverdue"] },
  { title: "Supplier money owed", fieldNames: ["payables", "payablesOverdue"] },
  { title: "Loans", fieldNames: ["loanEmiDebtPayments", "totalDebtOutstanding"] },
  { title: "Stock", fieldNames: ["inventoryStockCashLock"] },
  { title: "Discounts & refunds", fieldNames: ["discountAmount", "refundAmount"] },
];

export const ADVANCED_FIELD_NAMES = ["reworkCost", "complaintCost", "ownerWithdrawals"];

