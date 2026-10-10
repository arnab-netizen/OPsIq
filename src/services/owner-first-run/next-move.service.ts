/**
 * Returning-owner value: the action the owner accepted, from the canonical decision chains. Read-only; reuses
 * listOwnerOutcomeChains (workspace + business scoped) and the owner's own recorded commitment.
 */
import { db } from "@/lib/db";
import { listOwnerOutcomeChains } from "@/services/owner-outcome/owner-outcome-chain.service";
import { deriveNextMove, type NextMoveView } from "@/domain/owner-first-run/next-move";

export async function getAcceptedNextMove(workspaceId: string, businessId: string, now: Date = new Date()): Promise<NextMoveView | null> {
  const { chains } = await listOwnerOutcomeChains(workspaceId, businessId);
  // Most recently decided chain whose CURRENT decision is an acceptance (a later reject/defer supersedes it).
  const accepted = chains.filter((c) => c.currentDecision && (c.currentDecision.decisionState === "ACCEPTED" || c.currentDecision.decisionState === "MODIFIED"));
  // An accepted action still awaiting its check leads; once every accepted action has been assessed, the latest one is shown as done.
  const open = accepted.find((c) => !c.currentAssessment) ?? accepted[0];
  const decision = open?.currentDecision;
  if (!open || !decision) return null;

  const snapshotAtDecision = (decision.recommendationSnapshot as { cycleId?: string | null } | null)?.cycleId ?? null;
  let evidenceChangedSince = false;
  if (snapshotAtDecision) {
    const [cycle, current] = await Promise.all([
      db.ownerFinanceCycle.findFirst({ where: { id: snapshotAtDecision, workspaceId, businessId }, select: { snapshotId: true } }),
      db.ownerFinancialSnapshot.findFirst({
        where: { workspaceId, businessId, supersededById: null },
        orderBy: [{ periodEnd: "desc" }, { version: "desc" }],
        select: { id: true },
      }),
    ]);
    evidenceChangedSince = Boolean(cycle && current && cycle.snapshotId !== current.id);
  }

  const snap = decision.recommendationSnapshot as { title?: string | null } | null;
  return deriveNextMove({
    commitment: decision.commitmentDescription ?? snap?.title ?? "Your accepted action",
    decidedAt: decision.decidedAt,
    intendedCompletionAt: decision.intendedCompletionAt ?? null,
    observationWindowDays: decision.observationWindowDays ?? null,
    assessed: Boolean(open.currentAssessment),
    evidenceChangedSince,
    now,
  });
}
