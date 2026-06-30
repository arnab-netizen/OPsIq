/**
 * Maximum-reliability — persisted expert adjudication queue.
 *
 * Routes uncertain / high-risk / conflicting decisions to a human expert before they can shape production
 * output or be promoted. Items carry full context (case/source/domain/output/gold/failure labels/assurance
 * failures/proposed correction+artifact/risk/status/audit). A rejected correction is never applied; an
 * approved correction is. Any UNRESOLVED high-risk item blocks the maximum-reliability readiness gate. The
 * queue is JSON-serialisable so it can be persisted/loaded (no DB dependency in this layer).
 */

export type AdjudicationStatus = "open" | "approved" | "rejected";
export type RiskLevel = "low" | "medium" | "high";

export interface AdjudicationSignals {
  domainNearThreshold?: boolean;
  lowConfidence?: boolean;
  scorerConflict?: boolean;
  highImpactAssuranceFailure?: boolean;
  lowSourceReliability?: boolean;
  complianceUncertainty?: boolean;
  artifactPlaybookConflict?: boolean;
  repeatedDomainFailure?: boolean;
  outputGoldDivergence?: boolean;
  unrealisticSyntheticVariant?: boolean;
  contradictionDetected?: boolean;
  ownerBurdenOverload?: boolean;
  questionableSourceValidity?: boolean;
  globalPromotionRequested?: boolean;
}

export interface AdjudicationItem {
  caseId: string;
  sourceId?: string;
  domain: string;
  businessCategory: string;
  output: string;
  goldAnswer: string;
  failureLabels: string[];
  assuranceFailures: string[];
  proposedCorrection?: string;
  proposedArtifactId?: string;
  riskLevel: RiskLevel;
  status: AdjudicationStatus;
  auditTrail: Array<{ at: string; actor: string; action: string }>;
}

const TRIGGERS: Array<keyof AdjudicationSignals> = [
  "domainNearThreshold", "lowConfidence", "scorerConflict", "highImpactAssuranceFailure", "lowSourceReliability",
  "complianceUncertainty", "artifactPlaybookConflict", "repeatedDomainFailure", "outputGoldDivergence",
  "unrealisticSyntheticVariant", "contradictionDetected", "ownerBurdenOverload", "questionableSourceValidity",
  "globalPromotionRequested",
];

/** True iff any adjudication trigger fired. */
export function needsAdjudication(s: AdjudicationSignals): boolean {
  return TRIGGERS.some((k) => s[k] === true);
}

/** High risk if any of the safety-critical triggers fired. */
export function riskOf(s: AdjudicationSignals): RiskLevel {
  if (s.highImpactAssuranceFailure || s.complianceUncertainty || s.contradictionDetected || s.outputGoldDivergence || s.scorerConflict) return "high";
  if (s.lowConfidence || s.artifactPlaybookConflict || s.ownerBurdenOverload || s.repeatedDomainFailure) return "medium";
  return "low";
}

export class AdjudicationQueue {
  private items: AdjudicationItem[] = [];

  constructor(initial: AdjudicationItem[] = []) { this.items = [...initial]; }

  /** Enqueue iff the signals require it. Returns the created item, or null if no trigger fired. */
  enqueueIfNeeded(base: Omit<AdjudicationItem, "status" | "auditTrail" | "riskLevel">, signals: AdjudicationSignals, at: string): AdjudicationItem | null {
    if (!needsAdjudication(signals)) return null;
    const item: AdjudicationItem = {
      ...base,
      riskLevel: riskOf(signals),
      status: "open",
      auditTrail: [{ at, actor: "assurance", action: `queued: ${TRIGGERS.filter((k) => signals[k]).join(",")}` }],
    };
    this.items.push(item);
    return item;
  }

  resolve(caseId: string, status: "approved" | "rejected", actor: string, at: string): AdjudicationItem {
    const item = this.items.find((i) => i.caseId === caseId && i.status === "open");
    if (!item) throw new Error(`no open adjudication item for ${caseId}`);
    item.status = status;
    item.auditTrail.push({ at, actor, action: status });
    return item;
  }

  /** A correction may be applied only if its item was APPROVED (a rejected correction is never used). */
  correctionApplicable(caseId: string): boolean {
    const item = this.items.find((i) => i.caseId === caseId);
    return !!item && item.status === "approved" && !!item.proposedCorrection;
  }

  unresolvedHighRisk(): AdjudicationItem[] {
    return this.items.filter((i) => i.status === "open" && i.riskLevel === "high");
  }

  /** The readiness gate: MAX_READY is blocked while any high-risk item is unresolved. */
  blocksMaxReady(): boolean {
    return this.unresolvedHighRisk().length > 0;
  }

  report(): { total: number; open: number; approved: number; rejected: number; unresolvedHighRisk: number; byRisk: Record<RiskLevel, number> } {
    const byRisk: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0 };
    for (const i of this.items) byRisk[i.riskLevel]++;
    return {
      total: this.items.length,
      open: this.items.filter((i) => i.status === "open").length,
      approved: this.items.filter((i) => i.status === "approved").length,
      rejected: this.items.filter((i) => i.status === "rejected").length,
      unresolvedHighRisk: this.unresolvedHighRisk().length,
      byRisk,
    };
  }

  toJSON(): AdjudicationItem[] { return this.items; }
}
