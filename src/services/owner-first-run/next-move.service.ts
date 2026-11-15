/**
 * Returning-owner value: the action the owner accepted, from the canonical decision chains. Read-only; reuses
 * listOwnerOutcomeChains (workspace + business scoped) and the owner's own recorded commitment.
 */
import { cycleRaisedFinding, cycleSnapshotSuperseded, firstRunEvidence } from "@/services/owner-first-run/first-run-evidence.reader";
import { listOwnerOutcomeChains } from "@/services/owner-outcome/owner-outcome-chain.service";
import { deriveNextMove, deriveNextMoveValidity, type NextMoveView } from "@/domain/owner-first-run/next-move";

export async function getAcceptedNextMove(workspaceId: string, businessId: string, now: Date = new Date()): Promise<NextMoveView | null> {
  const { chains } = await listOwnerOutcomeChains(workspaceId, businessId);
  // Most recently decided chain whose CURRENT decision is an acceptance (a later reject/defer supersedes it).
  const accepted = chains.filter((c) => c.currentDecision && (c.currentDecision.decisionState === "ACCEPTED" || c.currentDecision.decisionState === "MODIFIED"));
  // An accepted action still awaiting its check leads; once every accepted action has been assessed, the latest one is shown as done.
  const open = accepted.find((c) => !c.currentAssessment) ?? accepted[0];
  const decision = open?.currentDecision;
  if (!open || !decision) return null;

  const cycleAtDecision = (decision.recommendationSnapshot as { cycleId?: string | null } | null)?.cycleId ?? null;
  // The numbers changed since the decision exactly when the diagnosis it was based on ran on a snapshot that was amended.
  const evidenceChangedSince = cycleAtDecision ? await cycleSnapshotSuperseded(workspaceId, businessId, cycleAtDecision) : false;

  // Is the evidence this decision rests on still standing? The figures were amended, or the cash position the read used
  // changed since it. If so, was the new figures' read run, and does it still raise the finding the owner accepted?
  const evidence = await firstRunEvidence(workspaceId, businessId, now, undefined, { cashStaleness: true });
  // Finance evidence only: a decision in another domain does not rest on the Finance read.
  const isFinance = decision.domain === "finance";
  const evidenceChanged = isFinance && (evidenceChangedSince || evidence.staleReason === "CASH_POSITION_CHANGED");
  const currentReadExists = evidence.runOnHead !== null && evidence.staleReason === null;
  const findingCode = (decision.recommendationSnapshot as { findingCode?: string | null } | null)?.findingCode ?? decision.findingCode ?? null;
  const findingStillRaised =
    evidenceChanged && currentReadExists && evidence.runOnHead && findingCode
      ? await cycleRaisedFinding(workspaceId, businessId, evidence.runOnHead.id, findingCode)
      : false;
  const validity = deriveNextMoveValidity({ evidenceChanged, currentReadExists, findingStillRaised });

  const snap = decision.recommendationSnapshot as { title?: string | null } | null;
  return deriveNextMove({
    commitment: decision.commitmentDescription ?? snap?.title ?? "Your accepted action",
    decidedAt: decision.decidedAt,
    intendedCompletionAt: decision.intendedCompletionAt ?? null,
    observationWindowDays: decision.observationWindowDays ?? null,
    assessed: Boolean(open.currentAssessment),
    evidenceChangedSince,
    validity,
    now,
  });
}
