/**
 * Module 33 — Owner Command Center (pure aggregation core).
 *
 * The command center is the single "what needs the owner's attention now" surface.
 * It does NOT compute domain verdicts itself — it AGGREGATES already-computed
 * signals from the governance modules (cash safety M4/M5, continuity M25, WIP
 * pressure M35, negative recommendations M34, growth/scale readiness M21/M22) into
 * a deterministic, priority-ordered list of CommandCenterSignals plus the top owner
 * attention items. No business logic is re-derived here and no UI/real-time layer
 * is built — this is the data contract + composition the command surface consumes.
 *
 * This file also defines the minimal forward contracts (`BusinessFunction`,
 * `CommandCenterSignal`) that the later Real-Time 360° Owner Guidance Layer
 * (Module 41) will reuse — added here because Module 33 needs them now. Module 41
 * itself is intentionally deferred (out of scope for this slice).
 *
 * Pure + deterministic: no Date.now(), no Math.random(), no input mutation.
 */

/** The business function a signal pertains to (forward contract for Module 41). */
export enum BusinessFunction {
  FINANCE = "FINANCE",
  CASHFLOW = "CASHFLOW",
  SALES = "SALES",
  MARKETING = "MARKETING",
  OPERATIONS = "OPERATIONS",
  PEOPLE = "PEOPLE",
  CONTINUITY = "CONTINUITY",
  GROWTH = "GROWTH",
  GOVERNANCE = "GOVERNANCE",
}

/** Severity of a command-center signal, in escalating order. */
export type SignalSeverity = "INFO" | "ADVISORY" | "WARNING" | "URGENT" | "CRITICAL";

/** A single attention signal surfaced to the owner (forward contract for Module 41). */
export interface CommandCenterSignal {
  /** Stable identifier for the signal source (e.g. "cash_safety", "continuity:key_person_loss"). */
  id: string;
  function: BusinessFunction;
  severity: SignalSeverity;
  /** Short owner-facing headline. */
  headline: string;
  /** Whether the owner must act (vs. informational). */
  requiresOwnerAction: boolean;
  /** Optional reference to the originating recommendation/action/threat. */
  sourceRef?: string;
}

const SEVERITY_RANK: Record<SignalSeverity, number> = {
  INFO: 0,
  ADVISORY: 1,
  WARNING: 2,
  URGENT: 3,
  CRITICAL: 4,
};

export type CommandCenterStatus = "STABLE" | "NEEDS_ATTENTION" | "ACTION_REQUIRED" | "CRISIS";

export interface CommandCenterSummary {
  status: CommandCenterStatus;
  /** All signals, priority-ordered (most severe first, then action-required, then id). */
  signals: CommandCenterSignal[];
  /** Headlines of the signals that require owner action, in priority order. */
  ownerAttentionItems: string[];
  /** Count of signals at URGENT or CRITICAL. */
  criticalCount: number;
  highestSeverity: SignalSeverity | null;
}

/** Deterministic priority comparison: severity desc, action-required first, then id asc. */
function compareSignals(a: CommandCenterSignal, b: CommandCenterSignal): number {
  const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sev !== 0) return sev;
  if (a.requiresOwnerAction !== b.requiresOwnerAction) {
    return a.requiresOwnerAction ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

function deriveStatus(highest: SignalSeverity | null, anyActionRequired: boolean): CommandCenterStatus {
  if (highest === "CRITICAL") return "CRISIS";
  if (highest === "URGENT") return "ACTION_REQUIRED";
  if (anyActionRequired || highest === "WARNING") return "NEEDS_ATTENTION";
  return "STABLE";
}

/**
 * Compose a prioritized command-center summary from pre-computed module signals.
 * Pure: returns a new sorted array; does not mutate the input.
 */
export function composeCommandCenter(signals: CommandCenterSignal[]): CommandCenterSummary {
  const ordered = [...signals].sort(compareSignals);
  const highestSeverity = ordered.length > 0 ? ordered[0].severity : null;
  const anyActionRequired = ordered.some((s) => s.requiresOwnerAction);
  const ownerAttentionItems = ordered
    .filter((s) => s.requiresOwnerAction)
    .map((s) => s.headline);
  const criticalCount = ordered.filter(
    (s) => s.severity === "URGENT" || s.severity === "CRITICAL"
  ).length;
  return {
    status: deriveStatus(highestSeverity, anyActionRequired),
    signals: ordered,
    ownerAttentionItems,
    criticalCount,
    highestSeverity,
  };
}

/** The single most urgent signal requiring owner action, or null when none. */
export function topPrioritySignal(summary: CommandCenterSummary): CommandCenterSignal | null {
  for (const s of summary.signals) {
    if (s.requiresOwnerAction) return s;
  }
  return summary.signals.length > 0 ? summary.signals[0] : null;
}

/** True when the command center is in a state the owner must act on. */
export function commandCenterRequiresOwnerAction(summary: CommandCenterSummary): boolean {
  return summary.status === "ACTION_REQUIRED" || summary.status === "CRISIS"
    || summary.ownerAttentionItems.length > 0;
}
