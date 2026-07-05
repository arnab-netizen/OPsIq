/**
 * Reused-hash / duplicate-proof precheck service (owner-callable, DB-backed).
 *
 * Deterministic, workspace-scoped, read-only: it queries the workspace's proofs that carry a file
 * hash and runs the pure reused-hash policy to produce structured duplicate findings + per-submitter
 * cross-task reuse counts. It is derived (no mutation, no new audit) — `duplicateFlagged` is already
 * persisted at intake; this surfaces the explainable, policy-aware evidence for the owner and the
 * credibility/anti-gaming pipeline. It never reads or exposes another workspace's proofs.
 */

import {
  buildReusedHashAnalysis,
  evaluateReusedHash,
  type ReusedHashAnalysis,
  type ReusedHashFinding,
  type ReusedHashProof,
} from "@/domain/execution/reused-hash-precheck";

export const REUSED_HASH_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

interface ProofRow { id: string; workspaceId: string; fileHash: string | null; taskId: string | null; submittedByUserId: string | null }
interface FindManyArgs { where: Record<string, unknown>; select?: Record<string, boolean>; take?: number }

export interface ReusedHashDb {
  proof: { findMany(a: FindManyArgs): Promise<ProofRow[]> };
}
export interface ReusedHashDeps {
  db: ReusedHashDb;
  now: () => number;
}

async function resolveDefaultDeps(): Promise<ReusedHashDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as ReusedHashDb, now: () => Date.now() };
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2021") return fallback;
    throw e;
  }
}

/** Fetch the workspace's hashed proofs (workspace-scoped — never another tenant's rows). */
async function fetchWorkspaceProofs(workspaceId: string, deps: ReusedHashDeps): Promise<ReusedHashProof[]> {
  const since = new Date(deps.now() - REUSED_HASH_WINDOW_MS);
  const rows = await safe(deps.db.proof.findMany({
    where: { workspaceId, fileHash: { not: null }, createdAt: { gte: since } },
    select: { id: true, workspaceId: true, fileHash: true, taskId: true, submittedByUserId: true },
    take: 5000,
  }), [] as ProofRow[]);
  return rows.map((r) => ({ id: r.id, workspaceId: r.workspaceId, fileHash: r.fileHash, taskId: r.taskId, submittedByUserId: r.submittedByUserId }));
}

/** Build the deterministic reused-hash analysis for a workspace (90-day window). */
export async function getReusedHashFindings(workspaceId: string, injected?: ReusedHashDeps): Promise<ReusedHashAnalysis> {
  const deps = injected ?? (await resolveDefaultDeps());
  const proofs = await fetchWorkspaceProofs(workspaceId, deps);
  return buildReusedHashAnalysis(workspaceId, proofs, new Date(deps.now()).toISOString());
}

/** Evaluate one proof's reused-hash status against its workspace (for a dispute or an owner drill-down). */
export async function getReusedHashFindingForProof(workspaceId: string, proofId: string, injected?: ReusedHashDeps): Promise<ReusedHashFinding | null> {
  const deps = injected ?? (await resolveDefaultDeps());
  const proofs = await fetchWorkspaceProofs(workspaceId, deps);
  const target = proofs.find((p) => p.id === proofId);
  if (!target) return null;
  return evaluateReusedHash(target, proofs, new Date(deps.now()).toISOString());
}
