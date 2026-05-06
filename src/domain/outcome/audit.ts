// ⚠️ CANONICAL IMPORT: All contracts are now in @/contracts
// This file re-exports for backward compatibility only.
// NEW CODE: import from @/contracts

import { MeasuredMetric } from "./impact";
export { OutcomeAuditInput, OutcomeAuditPacket } from "@/contracts";
export type { AuditQueryFilter } from "@/contracts";

// For types used internally (kept for minimal impact)
import type { OutcomeAuditInput, OutcomeAuditPacket } from "@/contracts";

export interface AuditQueryFilter {
  workspace_id?: string;
  action_id?: string;
  decision_id?: string;
  start_date?: string; // ISO
  end_date?: string; // ISO
}
