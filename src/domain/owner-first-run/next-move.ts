/**
 * "Your next move" — what a returning owner sees about the action they accepted: what it is, when it is due,
 * whether the evidence changed since, and when it is time to check the result. Pure derivation from the
 * canonical decision record + outcome assessment; it decides nothing about priority and writes nothing.
 */

export type NextMoveStatus = "IN_PROGRESS" | "DUE_FOR_CHECK" | "ASSESSED";

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
  now: Date;
}

export interface NextMoveView {
  commitment: string;
  decidedAt: string;
  dueAt: string | null;
  daysUntilDue: number | null;
  status: NextMoveStatus;
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
  let prompt: string | null = null;
  if (status === "ASSESSED") prompt = "OpsIQ has checked how this went.";
  else if (status === "DUE_FOR_CHECK") prompt = "It's time to check how this went.";
  else if (daysUntilDue !== null) prompt = daysUntilDue <= 0 ? "Due today." : daysUntilDue === 1 ? "Due tomorrow." : `Due in ${daysUntilDue} days.`;
  return {
    commitment: f.commitment,
    decidedAt: f.decidedAt.toISOString(),
    dueAt: due ? due.toISOString() : null,
    daysUntilDue,
    status,
    evidenceChangedSince: f.evidenceChangedSince,
    prompt,
  };
}
