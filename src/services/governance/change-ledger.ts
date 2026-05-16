import { ChangeEvent } from "../../domain/governance/governance-contracts";
import crypto from "crypto";

/**
 * Append-only change ledger for recommendation evolution history.
 * Immutable, replayable, audit-safe.
 */

export interface LedgerReconstruction {
  current_state: Record<string, any>;
  change_count: number;
  earliest_change: Date | null;
  latest_change: Date | null;
}

/**
 * Create append-only change event
 */
export function createChangeEvent(
  recommendation_id: string,
  event_type: ChangeEvent["event_type"],
  actor: string,
  details: Record<string, any>
): ChangeEvent {
  return {
    event_id: `event-${crypto.randomBytes(16).toString("hex")}`,
    recommendation_id,
    event_type,
    timestamp: new Date(),
    actor,
    details,
    immutable: true,
  };
}

/**
 * Append event to ledger (always succeeds for new events)
 */
export function appendEvent(ledger: ChangeEvent[], event: ChangeEvent): ChangeEvent[] {
  // Verify immutability: cannot modify existing events
  if (!event.immutable) {
    throw new Error("Only immutable events can be appended");
  }

  return [...ledger, event];
}

/**
 * Prevent mutation of historical events (fail-closed)
 */
export function preventMutation(ledger: ChangeEvent[], event_id: string): boolean {
  // Check if event exists in ledger
  const exists = ledger.some((e) => e.event_id === event_id);
  if (exists) {
    // Cannot modify historical events
    return false;
  }
  return true;
}

/**
 * Replay ledger to reconstruct current state
 */
export function replayLedger(ledger: ChangeEvent[]): LedgerReconstruction {
  const state: Record<string, any> = {};

  for (const event of ledger) {
    switch (event.event_type) {
      case "STATE_TRANSITION":
        state.current_state = event.details.to_state;
        break;
      case "CONFIDENCE_CHANGE":
        state.confidence = event.details.new_value;
        break;
      case "PRIORITY_CHANGE":
        state.priority = event.details.new_value;
        break;
      case "EVIDENCE_CHANGE":
        state.evidence_updated = event.timestamp;
        break;
      case "ASSUMPTION_INVALIDATION":
        state.assumptions_invalidated = (state.assumptions_invalidated || []).concat(
          event.details.invalidated_assumption
        );
        break;
      case "SCOPE_CHANGE":
        state.scope = event.details.new_scope;
        break;
      case "OPERATOR_OVERRIDE":
        state.last_override = event.timestamp;
        state.override_actor = event.actor;
        break;
      case "RECOMMENDATION_WITHDRAWAL":
        state.withdrawn = true;
        state.withdrawal_timestamp = event.timestamp;
        break;
    }
  }

  return {
    current_state: state,
    change_count: ledger.length,
    earliest_change: ledger.length > 0 ? ledger[0].timestamp : null,
    latest_change: ledger.length > 0 ? ledger[ledger.length - 1].timestamp : null,
  };
}

/**
 * Generate explainability timeline
 */
export function generateExplainabilityTimeline(ledger: ChangeEvent[]): string[] {
  return ledger.map(
    (event) =>
      `${event.timestamp.toISOString()} - ${event.event_type} by ${event.actor}: ${JSON.stringify(event.details)}`
  );
}
