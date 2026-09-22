import { ProofType } from "@/domain/execution/proof";

/**
 * Hand-curated owner-facing labels for ProofType (UX-06 Wave A1, Section G9). Shared
 * so /owner/tasks/new and /owner/tasks/[taskId] never drift apart the way generic
 * enum-humanization did (e.g. "Csv Upload" instead of "CSV upload").
 */
export const PROOF_TYPE_LABEL: Record<string, string> = {
  [ProofType.PHOTO]: "Photo",
  [ProofType.SCREENSHOT]: "Screenshot",
  [ProofType.BEFORE_AFTER_IMAGE]: "Before/after image",
  [ProofType.CALL_LOG]: "Call log",
  [ProofType.MESSAGE_SCREENSHOT]: "Message screenshot",
  [ProofType.CUSTOMER_RESPONSE_TAG]: "Customer response tag",
  [ProofType.CSV_UPLOAD]: "CSV upload",
  [ProofType.INVOICE]: "Invoice",
  [ProofType.PAYMENT_CONFIRMATION]: "Payment confirmation",
  [ProofType.DELIVERY_PROOF]: "Delivery proof",
  [ProofType.PICKUP_PROOF]: "Pickup proof",
  [ProofType.MANAGER_CONFIRMATION]: "Manager confirmation",
  [ProofType.CUSTOMER_CONFIRMATION]: "Customer confirmation",
  [ProofType.SHORT_NOTE]: "Short note",
  [ProofType.CHECKLIST_COMPLETION]: "Checklist completion",
  [ProofType.DOCUMENT]: "Document",
};
