/**
 * Finance list vs Results (live QA 2026-11-24): the Finance recommendation list shows the ACTION's own execution status
 * ("Proposed") while Results shows the owner's DECISION ("Accepted"). They are two different facts about one
 * recommendation (same candidate id `domain_action:finance:<actionId>`), not one inconsistent lifecycle. This pure presenter
 * states both, without inventing progress: an accepted decision never implies the work was started or finished.
 */
export type FinanceActionStatus = "proposed" | "assigned" | "in_progress" | "blocked" | "completed" | "cancelled" | string;

const DECISION_LABEL: Readonly<Record<string, string>> = {
  ACCEPTED: "You accepted this",
  MODIFIED: "You accepted this with changes",
  REJECTED: "You decided not to do this",
  DEFERRED: "You decided to revisit this later",
};

/** Null when the owner has recorded no decision (nothing to add). */
export function financeActionDecisionNote(decisionState: string | null | undefined, actionStatus: FinanceActionStatus): string | null {
  if (!decisionState) return null;
  const label = DECISION_LABEL[decisionState];
  if (!label) return null;
  if (decisionState === "ACCEPTED" || decisionState === "MODIFIED") {
    if (actionStatus === "proposed" || actionStatus === "assigned") return `${label} · the work has not been started yet. Start it below, and mark it done with what you did, so the result can be checked.`;
    if (actionStatus === "in_progress") return `${label} · work in progress.`;
    if (actionStatus === "blocked") return `${label} · blocked.`;
    if (actionStatus === "completed") return `${label} · marked done.`;
    if (actionStatus === "cancelled") return `${label} · the action was cancelled.`;
  }
  return `${label}.`;
}
