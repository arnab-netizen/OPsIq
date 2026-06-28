/**
 * Jarvis 360 Slice 5 — SOP document lifecycle rules (pure).
 *
 * A first-class, versioned SOP/checklist distinct from the Module-7 SOP *diagnosis*
 * (which stays as the measurement layer). Encodes the lifecycle the audit found
 * missing: draft → approved → retired, reuse without re-approval while unchanged,
 * material-change → new draft version, and stale (past review date) detection.
 * Reuses the canonical content hash from approval-memory (no duplicate hashing).
 */

import { hashApprovalContent } from "@/domain/owner-mode/approval-memory";

export type SopStatus = "draft" | "approved" | "retired";

const VALID: Record<SopStatus, SopStatus[]> = {
  draft: ["approved", "retired"],
  approved: ["retired"],
  retired: [],
};

export interface SopTransitionDecision {
  allowed: boolean;
  reason: string;
}

export function planSopTransition(from: SopStatus, to: SopStatus): SopTransitionDecision {
  if (from === to) return { allowed: false, reason: `No-op SOP transition (${from}).` };
  if (!VALID[from].includes(to)) return { allowed: false, reason: `Invalid SOP transition ${from} → ${to}.` };
  return { allowed: true, reason: "ok" };
}

export interface SopDocRecord {
  status: SopStatus;
  version: number;
  reviewDate: Date | null;
  contentHash: string;
}

/** Content hash over the parts that make an SOP materially different. */
export function hashSopContent(input: {
  process: string;
  role?: string | null;
  steps: string[];
  proofRequirements: string[];
}): string {
  return hashApprovalContent({
    process: input.process,
    role: input.role ?? null,
    steps: input.steps,
    proofRequirements: input.proofRequirements,
  });
}

/** An approved, non-stale SOP may be reused for recurring work without re-approval. */
export function isSopReusable(doc: SopDocRecord | null, now: Date): boolean {
  if (!doc || doc.status !== "approved") return false;
  if (doc.reviewDate && doc.reviewDate.getTime() <= now.getTime()) return false; // stale → review
  return true;
}

/** An approved SOP past its review date is stale and must trigger owner review. */
export function isSopStale(doc: SopDocRecord | null, now: Date): boolean {
  return !!doc && doc.status === "approved" && !!doc.reviewDate && doc.reviewDate.getTime() <= now.getTime();
}

/** A material change is any change to the content hash (steps/role/process/proof). */
export function isMaterialSopChange(existingHash: string, newHash: string): boolean {
  return existingHash !== newHash;
}

export function nextSopVersion(currentVersion: number): number {
  return currentVersion + 1;
}
