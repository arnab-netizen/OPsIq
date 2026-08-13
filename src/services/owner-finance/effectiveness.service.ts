/**
 * Owner Finance (Module 2) — action effectiveness query service.
 *
 * Reads persisted OwnerFinanceOutcomeSignals for a workspace and builds a
 * FinanceEffectivenessMap that the diagnosis service uses to adjust confidence
 * scores before ranking. DB-backed; workspace-isolated.
 */
import { db } from "@/lib/db";
import {
  buildEffectivenessMap,
  type FinanceEffectivenessMap,
  type FinanceEffectivenessSignal,
} from "@/domain/owner-finance/outcome-signals";

/**
 * Query all persisted outcome signals for the given finding codes within the
 * workspace and return the effectiveness map (Bayesian-shrunk modifier per code).
 * Returns an empty map when no signals exist — never throws.
 */
export async function getFinanceEffectivenessMap(
  workspaceId: string,
  findingCodes: string[]
): Promise<FinanceEffectivenessMap> {
  if (findingCodes.length === 0) return new Map();

  const rows = await db.ownerFinanceOutcomeSignal.findMany({
    where: { workspaceId, findingCode: { in: findingCodes } },
    select: { findingCode: true, recommendationCode: true, reachedTarget: true },
  });

  const signals: FinanceEffectivenessSignal[] = rows.map((r: { findingCode: string; recommendationCode: string; reachedTarget: boolean }) => ({
    findingCode: r.findingCode,
    recommendationCode: r.recommendationCode,
    reachedTarget: r.reachedTarget,
  }));

  return buildEffectivenessMap(signals);
}
