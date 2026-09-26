/**
 * Owner Strategy — the current decision for a persisted cycle (read-side, no DB access).
 *
 * The decision is NOT persisted: it is derived from the cycle's evaluated snapshot by the pure
 * engine, so it is always the current model's answer for the latest evaluation. Earlier cycles
 * keep their stored legacy `strategyState` and are never re-labelled with a recomputed decision.
 * Every reader that shows "what to do next" for Strategy (Strategy page, Home, business
 * condition) filters actions through the same arbitration so they agree.
 */
import { deriveStrategyDecision, type StrategyDecision } from "@/domain/owner-strategy/decision";
import {
  coherentStrategyActionRows,
  withoutRetiredStrategyActions,
  type ArbitrableStrategyAction,
} from "@/domain/owner-strategy/action-arbitration";
import { rowToStrategyInput } from "./snapshot.service";

/** The current decision for a cycle row that includes its `snapshot`; null when it has none. */
export function currentStrategyDecision(
  cycle: { snapshot?: unknown } | null | undefined,
  now: Date = new Date()
): StrategyDecision | null {
  if (!cycle || !cycle.snapshot) return null;
  return deriveStrategyDecision(rowToStrategyInput(cycle.snapshot), { now });
}

/**
 * The cycle's actions that belong in a "what to do next" list under the current decision (the
 * primary step and allowed supporting steps). Without a decision, retired go-ahead commands
 * (Pursue / Size up) are still never surfaced.
 */
export function coherentStrategyActions<T extends ArbitrableStrategyAction>(
  cycle: { snapshot?: unknown } | null | undefined,
  rows: readonly T[],
  now: Date = new Date()
): T[] {
  const decision = currentStrategyDecision(cycle, now);
  return decision ? coherentStrategyActionRows(rows, decision) : withoutRetiredStrategyActions(rows);
}
