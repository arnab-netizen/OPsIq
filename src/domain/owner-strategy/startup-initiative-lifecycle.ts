/**
 * StartupInitiative lifecycle guard — pure domain, no I/O.
 *
 * Mirrors the shape of startup-lifecycle.ts's session state machine, scoped to
 * the initiative's own `status` column (ACTIVE | PAUSED | COMPLETED | CANCELLED |
 * SUPERSEDED — see the StartupInitiative Prisma model comment). Only the
 * transition actually driven by a real writer today (ACTIVE -> COMPLETED /
 * CANCELLED, via closeStartupInitiative) is declared here. PAUSED/SUPERSEDED
 * have no writer anywhere in the codebase yet; declaring transitions for them
 * now would be speculative, so they are deliberately left out rather than
 * wired ahead of a real caller.
 */
import { InvalidStateTransitionError } from "@/infra/errors";

export type StartupInitiativeStatus =
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED"
  | "SUPERSEDED";

export type StartupInitiativeClosedStatus = "COMPLETED" | "CANCELLED";

/** Statuses from which an initiative may be closed (given an outcome recorded). */
const CLOSABLE_FROM: ReadonlySet<StartupInitiativeStatus> = new Set(["ACTIVE"]);

export const TERMINAL_INITIATIVE_STATUSES: ReadonlySet<StartupInitiativeStatus> = new Set([
  "COMPLETED",
  "CANCELLED",
  "SUPERSEDED",
]);

export function isTerminalInitiativeStatus(status: StartupInitiativeStatus): boolean {
  return TERMINAL_INITIATIVE_STATUSES.has(status);
}

/**
 * Assert that an initiative currently in `from` may be closed into `to`.
 * Throws InvalidStateTransitionError otherwise (already closed, paused, or
 * superseded initiatives cannot be silently re-closed).
 */
export function assertInitiativeClosable(
  from: StartupInitiativeStatus,
  to: StartupInitiativeClosedStatus
): void {
  if (!CLOSABLE_FROM.has(from)) {
    throw new InvalidStateTransitionError("StartupInitiative", from, to);
  }
}
