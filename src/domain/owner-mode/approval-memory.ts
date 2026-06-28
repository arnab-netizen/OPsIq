/**
 * Jarvis 360 Slice 4 — owner approval-memory rules (pure).
 *
 * Audit finding: approvals were keyed only on (operatorItemId, approverUserId) — a
 * material change re-asked, and there was no reusable approved-rule memory. These
 * pure rules decide whether a previously-recorded owner approval may be reused for
 * a new request WITHOUT re-asking. Reuse requires: same workspace, same scope, same
 * content hash, status "approved", not expired, and the requested risk class is the
 * same or LOWER than what was approved (a higher-risk action can never reuse a
 * lower-risk approval). A different content hash = material change = no reuse.
 */

import { createHash } from "crypto";

export const APPROVAL_RISK_CLASSES = ["low", "medium", "high", "critical"] as const;
export type ApprovalRiskClass = (typeof APPROVAL_RISK_CLASSES)[number];

const RISK_RANK: Record<ApprovalRiskClass, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export interface ApprovalMemoryRecord {
  workspaceId: string;
  scope: string;
  contentHash: string;
  riskClass: string;
  approvalStatus: string;
  validUntil: Date | null;
}

export interface ApprovalReuseQuery {
  workspaceId: string;
  scope: string;
  contentHash: string;
  /** Risk of the NEW request; must be <= the approved risk to reuse. */
  riskClass: ApprovalRiskClass;
  now: Date;
}

/** Deterministic content hash for an approval subject (canonical JSON → sha256). */
export function hashApprovalContent(content: unknown): string {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * Decide whether a stored approval may be reused for the request. Pure; fail-closed
 * (any mismatch / expiry / higher requested risk → not reusable).
 */
export function canReuseApproval(memory: ApprovalMemoryRecord | null, q: ApprovalReuseQuery): boolean {
  if (!memory) return false;
  if (memory.approvalStatus !== "approved") return false;
  if (memory.workspaceId !== q.workspaceId) return false; // workspace isolation
  if (memory.scope !== q.scope) return false;
  if (memory.contentHash !== q.contentHash) return false; // material change → re-approve
  if (memory.validUntil && memory.validUntil.getTime() <= q.now.getTime()) return false;
  const approvedRank = RISK_RANK[memory.riskClass as ApprovalRiskClass];
  if (approvedRank === undefined) return false;
  return RISK_RANK[q.riskClass] <= approvedRank; // higher requested risk cannot reuse
}
