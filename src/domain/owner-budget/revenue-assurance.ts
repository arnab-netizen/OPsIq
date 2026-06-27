/**
 * Revenue Assurance signals (Section 22). Pure, deterministic.
 *
 * Detects missing revenue and revenue leakage before any cost-cut or growth-spend
 * recommendation. Compares order/invoice/cash/deposit counts and discount/refund
 * ratios where the data exists; never accuses — flags "requires review".
 */

export type ExceptionSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface RevenueAssuranceInput {
  revenue?: number | null;
  cashCollected?: number | null;
  bankDeposits?: number | null;
  ordersCompleted?: number | null;
  ordersPaid?: number | null;
  invoicesIssued?: number | null;
  discountAmount?: number | null;
  refundAmount?: number | null;
}

export interface RevenueAssuranceException {
  type:
    | "completed_orders_without_payment"
    | "cash_not_deposited"
    | "excessive_discount"
    | "refund_spike"
    | "order_invoice_mismatch";
  severity: ExceptionSeverity;
  message: string;
}

export interface RevenueAssuranceResult {
  exceptions: RevenueAssuranceException[];
  leakagePct: number | null;
  hasLeakage: boolean;
}

const DISCOUNT_THRESHOLD = 0.15;
const REFUND_THRESHOLD = 0.1;

export function detectRevenueLeakage(i: RevenueAssuranceInput): RevenueAssuranceResult {
  const exceptions: RevenueAssuranceException[] = [];

  if (typeof i.ordersCompleted === "number" && typeof i.ordersPaid === "number" && i.ordersCompleted > i.ordersPaid) {
    exceptions.push({
      type: "completed_orders_without_payment",
      severity: i.ordersCompleted - i.ordersPaid > i.ordersCompleted * 0.1 ? "HIGH" : "MEDIUM",
      message: `${i.ordersCompleted - i.ordersPaid} completed order(s) without a matching payment — requires review.`,
    });
  }

  if (typeof i.cashCollected === "number" && typeof i.bankDeposits === "number" && i.cashCollected > i.bankDeposits) {
    exceptions.push({
      type: "cash_not_deposited",
      severity: "HIGH",
      message: `Cash collected (${i.cashCollected}) exceeds bank deposits (${i.bankDeposits}) — possible undeposited cash, requires review.`,
    });
  }

  if (typeof i.invoicesIssued === "number" && typeof i.ordersCompleted === "number" && i.invoicesIssued < i.ordersCompleted) {
    exceptions.push({
      type: "order_invoice_mismatch",
      severity: "MEDIUM",
      message: `Fewer invoices (${i.invoicesIssued}) than completed orders (${i.ordersCompleted}) — possible un-billed revenue.`,
    });
  }

  let discountRatio: number | null = null;
  if (typeof i.discountAmount === "number" && typeof i.revenue === "number" && i.revenue > 0) {
    discountRatio = i.discountAmount / i.revenue;
    if (discountRatio >= DISCOUNT_THRESHOLD) {
      exceptions.push({
        type: "excessive_discount",
        severity: discountRatio >= DISCOUNT_THRESHOLD * 2 ? "HIGH" : "MEDIUM",
        message: `Discounts are ${(discountRatio * 100).toFixed(1)}% of revenue — margin leakage, review pricing/discount policy.`,
      });
    }
  }

  let refundRatio: number | null = null;
  if (typeof i.refundAmount === "number" && typeof i.revenue === "number" && i.revenue > 0) {
    refundRatio = i.refundAmount / i.revenue;
    if (refundRatio >= REFUND_THRESHOLD) {
      exceptions.push({
        type: "refund_spike",
        severity: "MEDIUM",
        message: `Refunds are ${(refundRatio * 100).toFixed(1)}% of revenue — quality/dispute leakage, requires review.`,
      });
    }
  }

  const leakagePct =
    discountRatio === null && refundRatio === null ? null : (discountRatio ?? 0) * 100 + (refundRatio ?? 0) * 100;

  return { exceptions, leakagePct, hasLeakage: exceptions.length > 0 };
}
