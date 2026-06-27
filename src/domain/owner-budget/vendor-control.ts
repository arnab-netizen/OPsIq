/**
 * Vendor / Procurement controls (Section 20). Pure, deterministic.
 *
 * Flags procurement control risks: unverified vendor bank change, new vendor /
 * major purchase without quotes, price above benchmark, duplicate invoice,
 * related-party, equipment purchase without payback. No payment to a new/changed
 * vendor bank is treated as safe until independently verified. Flags use
 * "requires review" language — never accusations.
 */

export type VendorRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface VendorControlInput {
  isNewVendor?: boolean;
  vendorBankChanged?: boolean;
  vendorBankVerified?: boolean;
  /** Number of independent quotes obtained for the purchase. */
  quotesObtained?: number;
  /** True when the amount is over the major-purchase threshold (caller-decided). */
  majorPurchase?: boolean;
  /** Percent above benchmark price (positive = above). */
  priceVsBenchmarkPct?: number | null;
  duplicateInvoiceSuspected?: boolean;
  relatedParty?: boolean;
  isEquipmentPurchase?: boolean;
  paybackMonths?: number | null;
}

export interface VendorControlResult {
  riskLevel: VendorRiskLevel;
  flags: string[];
  requiredActions: string[];
  blockPayment: boolean;
}

const PRICE_CREEP_THRESHOLD = 15;

export function assessVendorControl(i: VendorControlInput): VendorControlResult {
  const flags: string[] = [];
  const requiredActions: string[] = [];
  const risks: VendorRiskLevel[] = ["LOW"];
  let blockPayment = false;
  const order: readonly VendorRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const escalate = (r: VendorRiskLevel) => risks.push(r);

  if (i.vendorBankChanged && !i.vendorBankVerified) {
    flags.push("VENDOR_BANK_CHANGE_UNVERIFIED: payment must be held until bank details are independently verified.");
    requiredActions.push("Independently verify new vendor bank details before any payment.");
    blockPayment = true;
    escalate("CRITICAL");
  }

  if (i.duplicateInvoiceSuspected) {
    flags.push("DUPLICATE_INVOICE_SUSPECTED: requires review before payment.");
    requiredActions.push("Match invoice against prior invoices/proof hashes.");
    blockPayment = true;
    escalate("CRITICAL");
  }

  if (i.relatedParty) {
    flags.push("RELATED_PARTY: possible conflict of interest — requires owner disclosure/review.");
    requiredActions.push("Record conflict-of-interest disclosure and obtain owner approval.");
    escalate("HIGH");
  }

  if (i.majorPurchase && (i.quotesObtained ?? 0) < 2) {
    flags.push("INSUFFICIENT_QUOTES: major purchase without 2–3 comparative quotes.");
    requiredActions.push("Obtain 2–3 quotes / price benchmark and a preferred-vendor reason.");
    escalate("HIGH");
  }

  if (i.isNewVendor && (i.quotesObtained ?? 0) < 1) {
    flags.push("NEW_VENDOR_NO_QUOTE: new vendor selected without a quote on file.");
    requiredActions.push("Capture vendor master record + at least one quote.");
    escalate("MEDIUM");
  }

  if (typeof i.priceVsBenchmarkPct === "number" && i.priceVsBenchmarkPct >= PRICE_CREEP_THRESHOLD) {
    flags.push(`PRICE_ABOVE_BENCHMARK: ${i.priceVsBenchmarkPct.toFixed(0)}% above benchmark — review for price creep.`);
    requiredActions.push("Renegotiate or re-benchmark vendor pricing.");
    escalate("HIGH");
  }

  if (i.isEquipmentPurchase && (i.paybackMonths == null)) {
    flags.push("EQUIPMENT_NO_PAYBACK: capex without a payback calculation or repair-vs-replace comparison.");
    requiredActions.push("Add payback months + repair-vs-replace comparison before approval.");
    escalate("HIGH");
  }

  const riskLevel = order[Math.max(...risks.map((r) => order.indexOf(r)))];
  return { riskLevel, flags, requiredActions, blockPayment };
}
