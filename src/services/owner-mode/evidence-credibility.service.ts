/**
 * Evidence Credibility Graph service (owner-callable, DB-backed).
 *
 * Loads the workspace's proof events, aggregates them into per-entity credibility stats, and
 * runs the pure graph builder. Workspace-scoped; fabricates nothing (empty history →
 * DATA_INSUFFICIENT). The Owner Now View consumes the top concern; this is the owner-callable
 * entry point.
 */

import {
  aggregateCredibility,
  buildEvidenceCredibility,
  type CredibilityGraphAnalysis,
  type CredibilityProofRow,
} from "@/domain/owner-mode/evidence-credibility-graph";
import type { ConstraintType } from "@/domain/owner-mode/constraint-engine";
import type { ProfitLeakType } from "@/domain/owner-mode/profit-leak-radar";
import type { GamingSignalType } from "@/domain/owner-mode/anti-gaming-analytics";

interface CredibilityDb {
  proof: {
    findMany(args: { where: Record<string, unknown>; select: Record<string, boolean> }): Promise<CredibilityProofRow[]>;
  };
}

export interface CredibilityDeps {
  db: CredibilityDb;
  now: () => number;
}

async function resolveDefaultDeps(): Promise<CredibilityDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as CredibilityDb, now: () => Date.now() };
}

export interface CredibilityOptions {
  currentConstraint?: ConstraintType | null;
  topProfitLeakType?: ProfitLeakType | null;
  topGamingSignalType?: GamingSignalType | null;
  missingSources?: string[];
}

/** Compute the workspace's evidence credibility graph from live proof events. */
export async function getCredibilityGraph(
  workspaceId: string,
  opts: CredibilityOptions = {},
  injected?: CredibilityDeps
): Promise<CredibilityGraphAnalysis> {
  const deps = injected ?? (await resolveDefaultDeps());
  const rows = await deps.db.proof.findMany({
    where: { workspaceId },
    select: { submittedByUserId: true, reviewedByUserId: true, proofType: true, status: true, duplicateFlagged: true, createdAt: true, reviewedAt: true },
  });
  const nowMs = deps.now();
  const aggregates = aggregateCredibility(rows, nowMs);
  return buildEvidenceCredibility({
    workspaceId,
    ...aggregates,
    currentConstraint: opts.currentConstraint ?? null,
    topProfitLeakType: opts.topProfitLeakType ?? null,
    topGamingSignalType: opts.topGamingSignalType ?? null,
    missingSources: opts.missingSources ?? ["complaint/rework/outcome ↔ proof linkage not persisted"],
    evaluatedAt: new Date(nowMs).toISOString(),
  });
}
