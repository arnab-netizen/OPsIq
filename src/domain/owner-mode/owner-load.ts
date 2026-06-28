/**
 * Jarvis 360 Slice 4 — owner load-reduction rules (pure).
 *
 * Three primitives that reduce repeated owner work WITHOUT autonomy:
 *  - standing instructions (auto-allow / forbid a class of actions in a scope),
 *  - attention disposition (classify an event so routine items don't reach the owner),
 *  - batch disposition (partition a set of pending items into auto vs owner-needed).
 * No DB/I-O here; services persist and audit.
 */

export type StandingInstructionOutcome = "auto_allow" | "forbidden" | "needs_approval";

export interface StandingInstructionRecord {
  scope: string;
  allowedActionTypes: string[];
  forbiddenActionTypes: string[];
  maxAmount: number | null;
  status: string;
  validUntil: Date | null;
}

export interface StandingInstructionRequest {
  scope: string;
  actionType: string;
  amount?: number | null;
  now: Date;
}

/**
 * Decide how a request is handled by a standing instruction. Fail-closed: a scope/
 * status/expiry mismatch, an over-ceiling amount, or no allow match → needs_approval.
 * Forbidden always wins.
 */
export function evaluateStandingInstruction(
  instr: StandingInstructionRecord | null,
  req: StandingInstructionRequest
): StandingInstructionOutcome {
  if (!instr) return "needs_approval";
  if (instr.status !== "active") return "needs_approval";
  if (instr.scope !== req.scope) return "needs_approval";
  if (instr.validUntil && instr.validUntil.getTime() <= req.now.getTime()) return "needs_approval";
  if (instr.forbiddenActionTypes.includes(req.actionType)) return "forbidden";
  if (!instr.allowedActionTypes.includes(req.actionType)) return "needs_approval";
  if (instr.maxAmount != null && (req.amount ?? 0) > instr.maxAmount) return "needs_approval";
  return "auto_allow";
}

// --- Attention disposition ---------------------------------------------------

export type AttentionDisposition =
  | "ignore"
  | "monitor"
  | "auto_handle"
  | "batch"
  | "owner_decision"
  | "critical";

export type AttentionSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface AttentionEventInput {
  severity: AttentionSeverity;
  /** Does resolving this require an owner-only decision? */
  ownerDecisionRequired: boolean;
  /** Can OpsIQ (or a delegate) handle this without the owner? */
  autoHandleable: boolean;
}

/** Classify a single event into a disposition that protects owner attention. */
export function classifyAttention(e: AttentionEventInput): AttentionDisposition {
  if (e.severity === "critical") return "critical";
  if (e.ownerDecisionRequired) return e.severity === "high" ? "owner_decision" : "batch";
  if (e.autoHandleable) return "auto_handle";
  if (e.severity === "info") return "ignore";
  if (e.severity === "low") return "monitor";
  return "batch";
}

export interface AttentionEventRecord {
  disposition: AttentionDisposition;
  ownerDecisionRequired: boolean;
  handledByOpsIQ: boolean;
}

export interface AttentionSummary {
  total: number;
  ownerDecisionsRequired: number;
  criticalUnresolved: number;
  handledByOpsIQ: number;
  batched: number;
  silenced: number; // ignore + monitor
  /** Heuristic: many owner-facing items in one window → fatigue risk. */
  fatigueRisk: boolean;
}

const OWNER_FACING: ReadonlySet<AttentionDisposition> = new Set(["owner_decision", "critical"]);

/** Summarize a window of events into an owner attention budget. Pure. */
export function summarizeOwnerAttention(events: AttentionEventRecord[], fatigueThreshold = 7): AttentionSummary {
  const ownerFacing = events.filter((e) => OWNER_FACING.has(e.disposition)).length;
  return {
    total: events.length,
    ownerDecisionsRequired: events.filter((e) => e.ownerDecisionRequired).length,
    criticalUnresolved: events.filter((e) => e.disposition === "critical").length,
    handledByOpsIQ: events.filter((e) => e.handledByOpsIQ).length,
    batched: events.filter((e) => e.disposition === "batch").length,
    silenced: events.filter((e) => e.disposition === "ignore" || e.disposition === "monitor").length,
    fatigueRisk: ownerFacing > fatigueThreshold,
  };
}

// --- Batch disposition -------------------------------------------------------

export interface BatchItem<T> {
  item: T;
  request: StandingInstructionRequest;
}

export interface BatchDisposition<T> {
  autoAllowed: T[];
  forbidden: T[];
  needsApproval: T[];
}

/**
 * Partition pending items by their standing-instruction outcome, so the owner only
 * sees the ones that truly need a decision. `lookup` returns the instruction for a scope.
 */
export function batchByStandingInstructions<T>(
  items: BatchItem<T>[],
  lookup: (scope: string) => StandingInstructionRecord | null
): BatchDisposition<T> {
  const out: BatchDisposition<T> = { autoAllowed: [], forbidden: [], needsApproval: [] };
  for (const { item, request } of items) {
    const outcome = evaluateStandingInstruction(lookup(request.scope), request);
    if (outcome === "auto_allow") out.autoAllowed.push(item);
    else if (outcome === "forbidden") out.forbidden.push(item);
    else out.needsApproval.push(item);
  }
  return out;
}
