/**
 * Dedicated reused-hash / duplicate-proof precheck — PURE, deterministic domain rules.
 *
 * Answers: "Has this proof artifact (file hash) been reused in a way that should reduce credibility
 * or trigger anti-gaming review?" — from the real persisted `fileHash` + `taskId` + `submittedByUserId`
 * fields, workspace-scoped. It is conservative and evidence-only:
 *   - it never invents a duplicate (an exact hash match is required);
 *   - it never accuses fraud/theft (it produces a REVIEW signal, not a verdict);
 *   - it never exposes cross-workspace IDs (a match in another workspace is blocked/ignored, no leak);
 *   - a same-task reuse (e.g. a legitimate resubmission) is ALLOWED, not a false warning;
 *   - a missing hash is DATA_INSUFFICIENT, not a pass.
 *
 * This module owns the policy + the finding shape. The service supplies the workspace-scoped
 * candidate proofs; no IO here.
 */

export enum DuplicateProofStatus {
  PASS_NO_DUPLICATE = "PASS_NO_DUPLICATE",
  NEEDS_REVIEW_DUPLICATE = "NEEDS_REVIEW_DUPLICATE",
  ALLOWED_DUPLICATE = "ALLOWED_DUPLICATE",
  BLOCKED_CROSS_WORKSPACE = "BLOCKED_CROSS_WORKSPACE",
  DATA_INSUFFICIENT = "DATA_INSUFFICIENT",
}

export enum DuplicateSignalType {
  EXACT_REUSED_HASH = "EXACT_REUSED_HASH",
  REUSED_ARTIFACT_REFERENCE = "REUSED_ARTIFACT_REFERENCE",
  POSSIBLE_DUPLICATE_NEEDS_REVIEW = "POSSIBLE_DUPLICATE_NEEDS_REVIEW",
  SAME_TASK_ALLOWED_DUPLICATE = "SAME_TASK_ALLOWED_DUPLICATE",
  CROSS_WORKSPACE_REUSE_BLOCKED_OR_IGNORED = "CROSS_WORKSPACE_REUSE_BLOCKED_OR_IGNORED",
  DATA_INSUFFICIENT = "DATA_INSUFFICIENT",
}

export type DuplicateMatchType = "HASH" | "ARTIFACT_REFERENCE" | "SIGNATURE";
export type DuplicateSeverity = "HIGH" | "MEDIUM" | "LOW" | "NONE";
export type DuplicateConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";

/** The proof under check + a candidate proof to compare against. */
export interface ReusedHashProof {
  id: string;
  workspaceId: string;
  fileHash: string | null;
  taskId: string | null;
  submittedByUserId: string | null;
}

export interface ReusedHashFinding {
  workspaceId: string;
  proofId: string;
  actorId: string | null;
  signalType: DuplicateSignalType;
  status: DuplicateProofStatus;
  severity: DuplicateSeverity;
  confidence: DuplicateConfidence;
  /** Same-workspace matches only — a cross-workspace match is never exposed. */
  matchedProofIds: string[];
  matchedActionIds: string[];
  matchType: DuplicateMatchType;
  reasonCodes: string[];
  missingData: string[];
  ownerExplanation: string;
  recommendedResponse: string;
  evaluatedAt: string;
}

/** A well-formed cryptographic digest length (hex chars): sha1(40), sha256(64), sha512(128). */
const WELL_FORMED_HASH_HEX_LENGTHS: ReadonlySet<number> = new Set([40, 64, 128]);
const HEX_ONLY = /^[0-9a-f]+$/;

function normalizedHash(raw: string | null): string | null {
  if (typeof raw !== "string") return null;
  const h = raw.trim().toLowerCase();
  return h.length > 0 ? h : null;
}

/**
 * Evaluate the reused-hash status of ONE proof against candidate proofs. Pure and deterministic.
 * `candidates` should be every OTHER proof the service found sharing context; a candidate in a
 * different workspace is never exposed — it only produces a BLOCKED/IGNORED note.
 */
export function evaluateReusedHash(
  proof: ReusedHashProof,
  candidates: ReusedHashProof[],
  evaluatedAt: string
): ReusedHashFinding {
  const base = {
    workspaceId: proof.workspaceId, proofId: proof.id, actorId: proof.submittedByUserId,
    matchType: "HASH" as DuplicateMatchType, evaluatedAt,
  };
  const hash = normalizedHash(proof.fileHash);
  if (!hash || !(HEX_ONLY.test(hash) && WELL_FORMED_HASH_HEX_LENGTHS.has(hash.length))) {
    return {
      ...base, signalType: DuplicateSignalType.DATA_INSUFFICIENT, status: DuplicateProofStatus.DATA_INSUFFICIENT,
      severity: "NONE", confidence: "NEEDS_DATA", matchedProofIds: [], matchedActionIds: [],
      reasonCodes: ["NO_WELL_FORMED_FILE_HASH"],
      missingData: ["a well-formed proof file hash (content-addressed artifact reference)"],
      ownerExplanation: "This proof has no usable file hash, so OpsIQ cannot check it for reuse.",
      recommendedResponse: "Require a proof artifact with a real content hash before relying on reuse detection.",
    };
  }

  // Exclude self; keep only exact same-hash candidates.
  const sameHash = candidates.filter((c) => c.id !== proof.id && normalizedHash(c.fileHash) === hash);
  const crossWorkspace = sameHash.filter((c) => c.workspaceId !== proof.workspaceId);
  const sameWorkspace = sameHash.filter((c) => c.workspaceId === proof.workspaceId);
  const sameTask = sameWorkspace.filter((c) => c.taskId != null && c.taskId === proof.taskId);
  const crossTask = sameWorkspace.filter((c) => c.taskId == null || c.taskId !== proof.taskId);

  // Cross-task reuse in the same workspace → NEEDS_REVIEW (the strongest signal).
  if (crossTask.length > 0) {
    const matchedProofIds = crossTask.map((c) => c.id);
    const matchedActionIds = [...new Set(crossTask.map((c) => c.taskId).filter((t): t is string => !!t))];
    const sameOperator = crossTask.every((c) => c.submittedByUserId != null && c.submittedByUserId === proof.submittedByUserId);
    const differentOperator = crossTask.some((c) => c.submittedByUserId != null && c.submittedByUserId !== proof.submittedByUserId);
    const reasonCodes = ["EXACT_REUSED_HASH", "REUSED_ACROSS_DIFFERENT_TASKS"];
    if (sameOperator) reasonCodes.push("SAME_OPERATOR_CROSS_TASK_REUSE");
    if (differentOperator) reasonCodes.push("DIFFERENT_OPERATOR_LOWER_ATTRIBUTION");
    if (crossWorkspace.length > 0) reasonCodes.push("CROSS_WORKSPACE_MATCH_IGNORED");
    return {
      ...base, signalType: DuplicateSignalType.EXACT_REUSED_HASH, status: DuplicateProofStatus.NEEDS_REVIEW_DUPLICATE,
      // Same operator reusing one artifact across different jobs is the stronger credibility signal.
      severity: sameOperator ? "HIGH" : "MEDIUM",
      // The hash match is exact (HIGH); actor attribution drops to MEDIUM when a different operator is involved.
      confidence: differentOperator ? "MEDIUM" : "HIGH",
      matchedProofIds, matchedActionIds,
      reasonCodes,
      missingData: [],
      ownerExplanation: sameOperator
        ? "The same proof artifact was reused by this operator across different jobs — the work may not have actually happened each time. This needs review, not an accusation."
        : "The same proof artifact appears on different jobs — a reused artifact that needs review. Attribution is lower because more than one operator is involved.",
      recommendedResponse: "Require a fresh, job-specific proof for the affected jobs and review the reuse before relying on those completions.",
    };
  }

  // Only same-task reuse (e.g. a resubmission for the same job) → ALLOWED, no false warning.
  if (sameTask.length > 0) {
    return {
      ...base, signalType: DuplicateSignalType.SAME_TASK_ALLOWED_DUPLICATE, status: DuplicateProofStatus.ALLOWED_DUPLICATE,
      severity: "NONE", confidence: "HIGH",
      matchedProofIds: sameTask.map((c) => c.id),
      matchedActionIds: proof.taskId ? [proof.taskId] : [],
      reasonCodes: ["SAME_TASK_REUSE_ALLOWED"],
      missingData: [],
      ownerExplanation: "The same artifact is reused within the same job (e.g. a resubmission) — this is allowed and not a duplicate concern.",
      recommendedResponse: "No action — same-job reuse is expected.",
    };
  }

  // Only a cross-workspace match → blocked/ignored, no IDs exposed (no cross-tenant leak).
  if (crossWorkspace.length > 0) {
    return {
      ...base, signalType: DuplicateSignalType.CROSS_WORKSPACE_REUSE_BLOCKED_OR_IGNORED, status: DuplicateProofStatus.BLOCKED_CROSS_WORKSPACE,
      severity: "NONE", confidence: "MEDIUM",
      matchedProofIds: [], matchedActionIds: [],
      reasonCodes: ["CROSS_WORKSPACE_MATCH_IGNORED"],
      missingData: [],
      ownerExplanation: "A matching artifact exists in another workspace; OpsIQ ignores it and never exposes another workspace's data.",
      recommendedResponse: "No action within this workspace — cross-workspace matches are not used.",
    };
  }

  return {
    ...base, signalType: DuplicateSignalType.EXACT_REUSED_HASH, status: DuplicateProofStatus.PASS_NO_DUPLICATE,
    severity: "NONE", confidence: "HIGH",
    matchedProofIds: [], matchedActionIds: [],
    reasonCodes: ["NO_DUPLICATE_FOUND"],
    missingData: [],
    ownerExplanation: "This proof's artifact is unique in the workspace — no reuse detected.",
    recommendedResponse: "No action.",
  };
}

export interface ReusedHashAnalysis {
  workspaceId: string;
  findings: ReusedHashFinding[];
  /** The single highest-severity NEEDS_REVIEW finding (or null). */
  topFinding: ReusedHashFinding | null;
  /** Per-submitter count of that submitter's proofs flagged NEEDS_REVIEW (cross-task exact reuse). */
  submitterReuse: Array<{ actorId: string; count: number; proofIds: string[] }>;
  needsReviewCount: number;
  evaluatedAt: string;
}

const SEV_RANK: Record<DuplicateSeverity, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };

/**
 * Build the workspace reused-hash analysis: evaluate every proof against all workspace proofs and
 * surface the NEEDS_REVIEW findings + per-submitter cross-task reuse counts (deterministic feed for
 * the credibility graph + anti-gaming analytics). Pure — the caller supplies workspace-scoped proofs.
 */
export function buildReusedHashAnalysis(
  workspaceId: string,
  proofs: ReusedHashProof[],
  evaluatedAt: string
): ReusedHashAnalysis {
  const findings: ReusedHashFinding[] = [];
  for (const p of proofs) {
    const f = evaluateReusedHash(p, proofs, evaluatedAt);
    if (f.status === DuplicateProofStatus.NEEDS_REVIEW_DUPLICATE) findings.push(f);
  }
  const submitter = new Map<string, { count: number; proofIds: string[] }>();
  for (const f of findings) {
    if (!f.actorId) continue;
    const s = submitter.get(f.actorId) ?? { count: 0, proofIds: [] };
    s.count++; s.proofIds.push(f.proofId);
    submitter.set(f.actorId, s);
  }
  const ranked = [...findings].sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.matchedProofIds.length - a.matchedProofIds.length);
  return {
    workspaceId, findings, topFinding: ranked[0] ?? null,
    submitterReuse: [...submitter.entries()].map(([actorId, v]) => ({ actorId, count: v.count, proofIds: v.proofIds })),
    needsReviewCount: findings.length, evaluatedAt,
  };
}
