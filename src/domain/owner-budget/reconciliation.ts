/**
 * Bank/Payment Reconciliation evaluator (Section 21). Pure, deterministic.
 *
 * A spend with a receipt is NOT automatically verified. This evaluator advances a
 * spend through reconciliation states and distinguishes entered vs verified vs
 * disputed vs mismatched actuals, so budget math can treat unreconciled spend with
 * lower confidence and surface a reconciliation exception.
 */

export type ReconciliationStatus =
  | "ENTERED" | "PROOF_UPLOADED" | "INVOICE_MATCHED" | "PAYMENT_MATCHED"
  | "RECONCILED" | "DISPUTED" | "MISMATCH";

export interface ReconciliationInput {
  proofUploaded?: boolean;
  invoiceMatched?: boolean;
  paymentMatched?: boolean;
  bankMatched?: boolean;
  duplicateHash?: boolean;
  contradicted?: boolean;
}

export interface ReconciliationResult {
  status: ReconciliationStatus;
  /** True only when fully reconciled (proof + invoice + payment + bank). */
  verified: boolean;
  /** True for MISMATCH/DISPUTED — must not be counted as verified actuals. */
  mismatch: boolean;
  reason: string;
}

export function evaluateReconciliation(i: ReconciliationInput): ReconciliationResult {
  if (i.duplicateHash) {
    return { status: "MISMATCH", verified: false, mismatch: true, reason: "Duplicate invoice hash — requires review." };
  }
  if (i.contradicted) {
    return { status: "DISPUTED", verified: false, mismatch: true, reason: "Spend contradicted by evidence — disputed." };
  }
  if (i.proofUploaded && i.invoiceMatched && i.paymentMatched && i.bankMatched) {
    return { status: "RECONCILED", verified: true, mismatch: false, reason: "Proof + invoice + payment + bank all matched." };
  }
  if (i.paymentMatched) {
    return { status: "PAYMENT_MATCHED", verified: false, mismatch: false, reason: "Payment matched; bank reconciliation pending." };
  }
  if (i.invoiceMatched) {
    return { status: "INVOICE_MATCHED", verified: false, mismatch: false, reason: "Invoice matched; payment match pending." };
  }
  if (i.proofUploaded) {
    return { status: "PROOF_UPLOADED", verified: false, mismatch: false, reason: "Proof uploaded; not yet matched (a receipt alone is not verification)." };
  }
  return { status: "ENTERED", verified: false, mismatch: false, reason: "Entered only; unverified." };
}

/** Map a reconciliation status to the SpendEntry lifecycle state. */
export function reconciliationToSpendState(status: ReconciliationStatus): string {
  switch (status) {
    case "RECONCILED": return "reconciled";
    case "PAYMENT_MATCHED": return "payment_matched";
    case "INVOICE_MATCHED": return "proof_matched";
    case "PROOF_UPLOADED": return "proof_uploaded";
    case "DISPUTED": return "disputed";
    case "MISMATCH": return "disputed";
    default: return "committed";
  }
}
