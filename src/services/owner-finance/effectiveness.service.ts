/**
 * Owner Finance (Module 2) — action effectiveness query service.
 *
 * Reads persisted OwnerFinanceOutcomeSignals for a workspace and builds a
 * FinanceEffectivenessMap that the diagnosis service uses to adjust confidence
 * scores before ranking.
 *
 * GOVERNANCE GATE (owner decision 2026-08-14):
 *   A verified outcome signal MAY be persisted immediately for audit, evidence,
 *   measurement, and human review. It MUST NOT influence recommendation ranking,
 *   diagnosis confidence, or any other adaptive output until its corresponding
 *   ControlledLearningCandidate has been human-approved through the canonical
 *   promotion path (promotionLocked = true).
 *
 *   Signals with no CLC (learningCandidateId = null) or with a CLC whose
 *   promotionLocked = false are excluded from the effectiveness sample.
 *   MIN_SAMPLE is calculated from governance-eligible approved outcomes only.
 *
 * DB-backed; workspace-isolated.
 */
import { db } from "@/lib/db";
import {
  buildEffectivenessMap,
  type FinanceEffectivenessMap,
  type FinanceEffectivenessSignal,
} from "@/domain/owner-finance/outcome-signals";

/**
 * Query persisted outcome signals for the given finding codes within the
 * workspace and return the effectiveness map (Bayesian-shrunk modifier per code).
 *
 * Only signals whose ControlledLearningCandidate has been human-approved
 * (promotionLocked = true) contribute to the sample. Signals with no CLC or
 * a not-yet-approved CLC are excluded — they cannot influence rankings until
 * a human reviewer promotes them through the canonical governance path.
 *
 * Returns an empty map (zero modifiers) when no eligible signals exist.
 * Never throws — a query failure falls back to empty map.
 */
export async function getFinanceEffectivenessMap(
  workspaceId: string,
  findingCodes: string[]
): Promise<FinanceEffectivenessMap> {
  if (findingCodes.length === 0) return new Map();

  try {
    // Step 1: Get signals for this workspace that have a linked CLC.
    // Signals with learningCandidateId = null have no CLC and can never be
    // approved, so they are excluded unconditionally.
    const rows = await db.ownerFinanceOutcomeSignal.findMany({
      where: {
        workspaceId,
        findingCode: { in: findingCodes },
        learningCandidateId: { not: null },
      },
      select: {
        findingCode: true,
        recommendationCode: true,
        reachedTarget: true,
        learningCandidateId: true,
      },
    });

    if (rows.length === 0) return new Map();

    // Step 2: Filter to signals whose CLC is human-approved.
    // promotionLocked = true is the canonical promotion state set by
    // promoteLearningCandidate() — it is never reverted after promotion.
    // Explicit type annotation required: controlledLearningCandidate returns any in
    // the generated Prisma proxy (all CLC services use this same cast pattern).
    const candidateIds: string[] = rows
      .map((r: { learningCandidateId: string | null }) => r.learningCandidateId)
      .filter((id: string | null): id is string => id !== null);

    const promotedCandidates = await (db as any).controlledLearningCandidate.findMany({
      where: {
        id: { in: candidateIds },
        promotionLocked: true,
      },
      select: { id: true },
    }) as Array<{ id: string }>;

    const promotedSet = new Set(promotedCandidates.map((c: { id: string }) => c.id));

    // Only signals whose CLC is promoted contribute to the Bayesian sample.
    const eligibleSignals: FinanceEffectivenessSignal[] = rows
      .filter(
        (r: { learningCandidateId: string | null }): r is typeof r & { learningCandidateId: string } =>
          r.learningCandidateId !== null && promotedSet.has(r.learningCandidateId)
      )
      .map((r: { findingCode: string; recommendationCode: string; reachedTarget: boolean; learningCandidateId: string }) => ({
        findingCode: r.findingCode,
        recommendationCode: r.recommendationCode,
        reachedTarget: r.reachedTarget,
      }));

    return buildEffectivenessMap(eligibleSignals);
  } catch {
    return new Map();
  }
}
