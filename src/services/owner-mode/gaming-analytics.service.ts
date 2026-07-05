/**
 * Cross-Event Anti-Gaming Analytics service (owner-callable, DB-backed).
 *
 * Loads the workspace's proof events, aggregates them per actor/reviewer, and runs the pure
 * detector. Workspace-scoped; fabricates nothing (empty history → DATA_INSUFFICIENT). The
 * Owner Now View consumes the top signal; this service is the owner-callable entry point.
 */

import {
  aggregateProofEvents,
  identifyGamingSignals,
  type AntiGamingAnalysis,
  type ProofEventRow,
} from "@/domain/owner-mode/anti-gaming-analytics";
import type { ConstraintType } from "@/domain/owner-mode/constraint-engine";
import type { ProfitLeakType } from "@/domain/owner-mode/profit-leak-radar";

interface GamingDb {
  proof: {
    findMany(args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }): Promise<ProofEventRow[]>;
  };
}

export interface GamingAnalyticsDeps {
  db: GamingDb;
  now: () => number;
}

async function resolveDefaultDeps(): Promise<GamingAnalyticsDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as GamingDb, now: () => Date.now() };
}

export interface GamingAnalyticsOptions {
  currentConstraint?: ConstraintType | null;
  topProfitLeakType?: ProfitLeakType | null;
  /** Sources not yet persisted (complaint↔proof linkage etc.). */
  missingSources?: string[];
}

/** Compute the workspace's anti-gaming analysis from live proof events. */
export async function getGamingAnalysis(
  workspaceId: string,
  opts: GamingAnalyticsOptions = {},
  injected?: GamingAnalyticsDeps
): Promise<AntiGamingAnalysis> {
  const deps = injected ?? (await resolveDefaultDeps());
  const rows = await deps.db.proof.findMany({
    where: { workspaceId },
    select: { submittedByUserId: true, reviewedByUserId: true, status: true, duplicateFlagged: true, createdAt: true },
  });
  const nowMs = deps.now();
  const { actors, reviewers } = aggregateProofEvents(rows, nowMs);
  return identifyGamingSignals({
    workspaceId,
    actors,
    reviewers,
    currentConstraint: opts.currentConstraint ?? null,
    topProfitLeakType: opts.topProfitLeakType ?? null,
    missingSources: opts.missingSources,
    evaluatedAt: new Date(nowMs).toISOString(),
  });
}
