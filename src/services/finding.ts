/**
 * Finding Service
 *
 * Creates, classifies, and manages findings derived from evidence.
 * Findings are actionable conclusions about business condition.
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import {
  EvidenceRecord,
  Finding,
  FindingSchema,
  detectContradictions,
  calculateEvidenceReliability,
} from "@/domain/evidence/evidence";

/**
 * Finding not found error
 */
export class FindingNotFoundError extends Error {
  constructor(findingId: string) {
    super(`Finding ${findingId} not found`);
    this.name = "FindingNotFoundError";
  }
}

/**
 * In-memory finding store for non-DB testing
 */
const findingStore = new Map<string, Finding>();

/**
 * Create a new finding from evidence
 */
export function createFinding(params: {
  workspaceId: string;
  engagementId: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  supportingEvidenceIds: string[];
  contradictingEvidenceIds?: string[];
  confidenceScore: number;
  createdByUserId: string;
}): Finding {
  const id = generateFindingId();

  // Validate confidence score
  if (params.confidenceScore < 0 || params.confidenceScore > 100) {
    throw new Error("Confidence score must be between 0 and 100");
  }

  const finding: Finding = {
    id,
    workspaceId: params.workspaceId,
    engagementId: params.engagementId,
    title: params.title,
    description: params.description,
    severity: params.severity,
    supportingEvidenceIds: params.supportingEvidenceIds,
    contradictingEvidenceIds: params.contradictingEvidenceIds || [],
    confidenceScore: params.confidenceScore,
    discoveredAt: new Date(),
    discoveredByUserId: params.createdByUserId,
    status: "active",
  };

  // Validate against schema
  const parsed = FindingSchema.safeParse(finding);
  if (!parsed.success) {
    throw new Error(`Invalid finding: ${parsed.error.message}`);
  }

  findingStore.set(id, parsed.data);
  return parsed.data;
}

/**
 * Classify finding severity based on evidence and impact
 */
export function classifySeverity(params: {
  impactScore: number; // 0-100
  urgencyScore: number; // 0-100
  evidenceQuality: number; // 0-100
}): "critical" | "high" | "medium" | "low" {
  const combinedScore = (params.impactScore + params.urgencyScore) / 2;

  // Critical: high impact/urgency AND good evidence
  if (combinedScore >= 80 && params.evidenceQuality >= 70) {
    return "critical";
  }

  // High: above average impact/urgency
  if (combinedScore >= 60) {
    return "high";
  }

  // Medium: moderate impact/urgency
  if (combinedScore >= 40) {
    return "medium";
  }

  return "low";
}

/**
 * Calculate finding confidence from supporting evidence
 */
export function calculateFindingConfidence(params: {
  supportingEvidence: EvidenceRecord[];
  contradictingEvidence: EvidenceRecord[];
}): number {
  if (params.supportingEvidence.length === 0) {
    return 0;
  }

  const supportingReliability = calculateEvidenceReliability(params.supportingEvidence);
  const contradictionPenalty =
    params.contradictingEvidence.length > 0
      ? Math.min(50, params.contradictingEvidence.length * 10)
      : 0;

  return Math.max(0, supportingReliability - contradictionPenalty);
}

/**
 * Get a finding by ID
 */
export function getFinding(findingId: string): Finding | null {
  return findingStore.get(findingId) || null;
}

/**
 * Require finding to exist
 */
export function requireFinding(findingId: string): Finding {
  const finding = getFinding(findingId);
  if (!finding) {
    throw new FindingNotFoundError(findingId);
  }
  return finding;
}

/**
 * Get all findings for an engagement
 */
export function getEngagementFindings(
  workspaceId: string,
  engagementId: string
): Finding[] {
  return Array.from(findingStore.values()).filter(
    (f) => f.workspaceId === workspaceId && f.engagementId === engagementId
  );
}

/**
 * Get active findings for an engagement
 */
export function getActiveFindings(
  workspaceId: string,
  engagementId: string
): Finding[] {
  return getEngagementFindings(workspaceId, engagementId).filter((f) => f.status === "active");
}

/**
 * Get critical findings
 */
export function getCriticalFindings(
  workspaceId: string,
  engagementId: string
): Finding[] {
  return getActiveFindings(workspaceId, engagementId).filter((f) => f.severity === "critical");
}

/**
 * Update finding status
 */
export function updateFindingStatus(
  findingId: string,
  newStatus: "active" | "resolved" | "invalidated" | "parked"
): Finding {
  const finding = requireFinding(findingId);

  const updated: Finding = {
    ...finding,
    status: newStatus,
  };

  findingStore.set(findingId, updated);
  return updated;
}

/**
 * Invalidate a finding (evidence proved wrong)
 */
export function invalidateFinding(findingId: string): Finding {
  return updateFindingStatus(findingId, "invalidated");
}

/**
 * Resolve a finding (action taken, issue addressed)
 */
export function resolveFinding(findingId: string): Finding {
  return updateFindingStatus(findingId, "resolved");
}

/**
 * Park a finding temporarily (revisit later)
 */
export function parkFinding(findingId: string): Finding {
  return updateFindingStatus(findingId, "parked");
}

/**
 * Get findings sorted by severity (critical → high → medium → low)
 */
export function prioritizeFindings(findings: Finding[]): Finding[] {
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...findings].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
}

/**
 * Filter findings by severity threshold
 */
export function filterFindingsBySeverity(
  findings: Finding[],
  minSeverity: "critical" | "high" | "medium" | "low"
): Finding[] {
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const threshold = severityOrder[minSeverity];
  return findings.filter((f) => severityOrder[f.severity] <= threshold);
}

/**
 * Analyze contradiction patterns in findings
 */
export function analyzeContradictions(
  findings: Finding[]
): Map<string, string[]> {
  const contradictionMap = new Map<string, string[]>();

  findings.forEach((finding) => {
    const contradictions = finding.contradictingEvidenceIds || [];
    if (contradictions.length > 0) {
      contradictionMap.set(finding.id, contradictions);
    }
  });

  return contradictionMap;
}

/**
 * Count findings by severity
 */
export function countFindingsBySeverity(
  findings: Finding[]
): {
  critical: number;
  high: number;
  medium: number;
  low: number;
} {
  return {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };
}

/**
 * Count findings by status
 */
export function countFindingsByStatus(
  findings: Finding[]
): {
  active: number;
  resolved: number;
  invalidated: number;
  parked: number;
} {
  return {
    active: findings.filter((f) => f.status === "active").length,
    resolved: findings.filter((f) => f.status === "resolved").length,
    invalidated: findings.filter((f) => f.status === "invalidated").length,
    parked: findings.filter((f) => f.status === "parked").length,
  };
}

/**
 * Get recent findings (last N days)
 */
export function getRecentFindings(
  workspaceId: string,
  engagementId: string,
  daysBack: number = 7
): Finding[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  return getEngagementFindings(workspaceId, engagementId).filter(
    (f) => f.discoveredAt > cutoffDate
  );
}

/**
 * Clear all findings (for testing)
 */
export function clearFindings(): void {
  findingStore.clear();
}

/**
 * Generate a unique finding ID (valid UUID v4)
 */
function generateFindingId(): string {
  return randomUUID();
}
