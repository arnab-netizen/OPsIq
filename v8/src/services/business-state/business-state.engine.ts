import type { DiagnosisDomainKey, DiagnosisV2Result, Severity } from "@/domain/diagnosis-v2/types";
import { round } from "@/services/diagnosis-v2/utils";

export interface BusinessStateDomainSnapshot {
  domainKey: DiagnosisDomainKey;
  score: number;
  band: string;
  confidence: number;
  topDriverKeys: string[];
}

export interface BusinessStateSnapshot {
  engagementId: string;
  diagnosisRunId?: string;
  status: "critical" | "stressed" | "recovering" | "stable";
  confidence: number;
  generatedAt: string;
  domains: BusinessStateDomainSnapshot[];
  blockingIssueCount: number;
  highestSeverity: Severity | "none";
  currentDominantHypothesis?: string;
  recommendedNextAction?: string;
  weakestDomains: DiagnosisDomainKey[];
}

const severityRank: Record<Severity | "none", number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

export function computeBusinessStateSnapshot(result: DiagnosisV2Result): BusinessStateSnapshot {
  const domains = result.scorecard.map((score) => ({
    domainKey: score.domainKey,
    score: score.score,
    band: score.band,
    confidence: score.rationale.confidence,
    topDriverKeys: score.rationale.topDrivers.map((driver) => driver.key),
  }));
  const avgScore = domains.length ? domains.reduce((sum, domain) => sum + domain.score, 0) / domains.length : 0;
  const blockingIssueCount = result.validationIssues.filter((issue) => issue.blocksCompletion).length;
  const highestSeverity = result.validationIssues.reduce<Severity | "none">((current, issue) => severityRank[issue.severity] > severityRank[current] ? issue.severity : current, "none");
  const weakestDomains = [...domains].sort((a, b) => a.score - b.score).slice(0, 3).map((domain) => domain.domainKey);
  const status = blockingIssueCount > 0 || highestSeverity === "critical" || avgScore < 35
    ? "critical"
    : avgScore < 55
      ? "stressed"
      : avgScore < 75
        ? "recovering"
        : "stable";

  return {
    engagementId: result.run.engagementId,
    diagnosisRunId: result.run.runId,
    status,
    confidence: round(result.run.confidence, 2),
    generatedAt: result.run.completedAt,
    domains,
    blockingIssueCount,
    highestSeverity,
    currentDominantHypothesis: result.hypotheses[0]?.title,
    recommendedNextAction: result.recommendations[0]?.title,
    weakestDomains,
  };
}
