/**
 * "Your next move" — what a returning owner sees about the action they accepted: what it is, when it is due,
 * whether the evidence changed since, and when it is time to check the result. Pure derivation from the
 * canonical decision record + outcome assessment; it decides nothing about priority and writes nothing.
 */

export type NextMoveStatus = "IN_PROGRESS" | "DUE_FOR_CHECK" | "ASSESSED";

/**
 * Whether the evidence an accepted action rests on still stands. Only CURRENT may be presented as the owner's
 * next move; the others are history with a reason.
 *   CURRENT             the figures the decision was based on have not changed.
 *   NEEDS_REASSESSMENT  the figures changed and OpsIQ has not re-read the new ones yet (or the cash position changed
 *                       after the read), so nothing can be said about the action yet.
 *   SUPERSEDED          the figures changed, were re-read, and the finding behind the action is no longer raised
 *                       (the conclusion was withdrawn). The action is no longer supported.
 *   STALE               the figures changed and the finding is still raised on the new figures, but the owner decided
 *                       on the old ones: the decision must be re-confirmed, not carried forward as is.
 */
export type NextMoveValidity = "CURRENT" | "STALE" | "SUPERSEDED" | "NEEDS_REASSESSMENT";

export interface NextMoveValidityFacts {
  /** The financial evidence behind the decision was amended, or the cash position it depends on changed. */
  evidenceChanged: boolean;
  /** A read has been run on the CURRENT figures (and is itself current). */
  currentReadExists: boolean;
  /** That read still raises the finding the accepted action was for. Ignored unless a current read exists. */
  findingStillRaised: boolean;
}

export function deriveNextMoveValidity(f: NextMoveValidityFacts): NextMoveValidity {
  if (!f.evidenceChanged) return "CURRENT";
  if (!f.currentReadExists) return "NEEDS_REASSESSMENT";
  return f.findingStillRaised ? "STALE" : "SUPERSEDED";
}

export const NEXT_MOVE_VALIDITY_NOTE: Record<Exclude<NextMoveValidity, "CURRENT">, { heading: string; note: string }> = {
  NEEDS_REASSESSMENT: {
    heading: "Earlier action — needs a fresh look",
    note: "Your numbers changed after you accepted this, and OpsIQ has not re-read them yet. It is not your next move until it has.",
  },
  SUPERSEDED: {
    heading: "Earlier action — no longer supported",
    note: "Your numbers changed after you accepted this, and OpsIQ's updated read no longer points to it. It is kept in your history, not as your next move.",
  },
  STALE: {
    heading: "Earlier action — decided on older numbers",
    note: "You accepted this on your earlier numbers. The updated read still raises it, but please review it again before treating it as your next move.",
  },
};

export interface NextMoveFacts {
  commitment: string;
  decidedAt: Date;
  /** The commitment's own completion date when the owner set one. */
  intendedCompletionAt: Date | null;
  /** The observation window the contract carries (the action's own timeframe). */
  observationWindowDays: number | null;
  /** An outcome assessment exists for the chain. */
  assessed: boolean;
  /** The financial evidence was amended after this decision was made. */
  evidenceChangedSince: boolean;
  /** Whether the evidence the decision rests on still stands (defaults to CURRENT when not supplied). */
  validity?: NextMoveValidity;
  now: Date;
}

export interface NextMoveView {
  commitment: string;
  decidedAt: string;
  dueAt: string | null;
  daysUntilDue: number | null;
  status: NextMoveStatus;
  /** Only CURRENT is presented as "your next move"; any other value is history with a reason. */
  validity: NextMoveValidity;
  /** Heading and reason for a non-CURRENT action, else null. */
  validityHeading: string | null;
  validityNote: string | null;
  evidenceChangedSince: boolean;
  /** One plain sentence about timing/verification, or null. */
  prompt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function deriveNextMove(f: NextMoveFacts): NextMoveView {
  const due =
    f.intendedCompletionAt ??
    (f.observationWindowDays && f.observationWindowDays > 0 ? new Date(f.decidedAt.getTime() + f.observationWindowDays * DAY_MS) : null);
  const daysUntilDue = due ? Math.ceil((due.getTime() - f.now.getTime()) / DAY_MS) : null;
  const status: NextMoveStatus = f.assessed ? "ASSESSED" : due && f.now.getTime() >= due.getTime() ? "DUE_FOR_CHECK" : "IN_PROGRESS";
  const validity = f.validity ?? "CURRENT";
  let prompt: string | null = null;
  if (validity !== "CURRENT") prompt = null; // timing prompts ("Due in 3 days") are meaningless for an action that is not current
  else if (status === "ASSESSED") prompt = "OpsIQ has checked how this went.";
  else if (status === "DUE_FOR_CHECK") prompt = "It's time to check how this went.";
  else if (daysUntilDue !== null) prompt = daysUntilDue <= 0 ? "Due today." : daysUntilDue === 1 ? "Due tomorrow." : `Due in ${daysUntilDue} days.`;
  return {
    commitment: f.commitment,
    decidedAt: f.decidedAt.toISOString(),
    dueAt: due ? due.toISOString() : null,
    daysUntilDue,
    status,
    validity,
    validityHeading: validity === "CURRENT" ? null : NEXT_MOVE_VALIDITY_NOTE[validity].heading,
    validityNote: validity === "CURRENT" ? null : NEXT_MOVE_VALIDITY_NOTE[validity].note,
    evidenceChangedSince: f.evidenceChangedSince,
    prompt,
  };
}
