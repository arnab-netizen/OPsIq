import { OperatorItem } from "@/domain/operator/types";
import { ProblemType } from "@/domain/decision/types";

export interface DetectedPattern {
  patternId: string;
  problemType: ProblemType;
  outcomePattern: "success" | "failure";
  frequency: number;
  avgImpact: number;
  impactRange: {
    min: number;
    max: number;
  };
  successRate: number;
  itemIds: string[];
}

interface PatternCandidate {
  problemType: ProblemType;
  outcomePattern: "success" | "failure";
  items: OperatorItem[];
}

function getOutcomePattern(item: OperatorItem): "success" | "failure" {
  if (item.actualOutcomeValue !== null && item.actualOutcomeValue !== undefined) {
    return item.actualOutcomeValue > 0 ? "success" : "failure";
  }
  if (item.outcomeDelta !== null && item.outcomeDelta !== undefined) {
    return item.outcomeDelta > 0 ? "success" : "failure";
  }
  return item.status === "done" ? "success" : "failure";
}

function getImpactValue(item: OperatorItem): number {
  if (item.actualOutcomeValue !== null && item.actualOutcomeValue !== undefined) {
    return Math.abs(Number(item.actualOutcomeValue));
  }
  if (item.outcomeDelta !== null && item.outcomeDelta !== undefined) {
    return Math.abs(Number(item.outcomeDelta));
  }
  return Math.abs(Number(item.impactExpected));
}

function clusterByImpactRange(items: OperatorItem[]): OperatorItem[][] {
  if (items.length === 0) return [];

  // Sort by impact
  const sorted = [...items].sort((a, b) => getImpactValue(a) - getImpactValue(b));

  const clusters: OperatorItem[][] = [];
  let currentCluster: OperatorItem[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const currentClusterImpacts = currentCluster.map(getImpactValue);
    const avgImpact = currentClusterImpacts.reduce((a, b) => a + b, 0) / currentClusterImpacts.length;
    const itemImpact = getImpactValue(item);

    // Within ±20% of cluster average
    const tolerance = avgImpact * 0.2;
    if (Math.abs(itemImpact - avgImpact) <= tolerance) {
      currentCluster.push(item);
    } else {
      if (currentCluster.length >= 3) {
        clusters.push(currentCluster);
      }
      currentCluster = [item];
    }
  }

  if (currentCluster.length >= 3) {
    clusters.push(currentCluster);
  }

  return clusters;
}

export function detectPatterns(items: OperatorItem[]): DetectedPattern[] {
  // Filter to completed items only
  const completed = items.filter((item) => item.status === "done" || item.actualOutcomeValue !== null);

  // Group by problemType and outcomePattern
  const candidates = new Map<string, PatternCandidate>();

  for (const item of completed) {
    if (!item.problemType) continue;

    const outcome = getOutcomePattern(item);
    const key = `${item.problemType}:${outcome}`;

    if (!candidates.has(key)) {
      candidates.set(key, {
        problemType: item.problemType,
        outcomePattern: outcome,
        items: [],
      });
    }

    candidates.get(key)!.items.push(item);
  }

  // Cluster by impact range and generate patterns
  const patterns: DetectedPattern[] = [];
  let patternCounter = 0;

  for (const candidate of candidates.values()) {
    const clusters = clusterByImpactRange(candidate.items);

    for (const cluster of clusters) {
      if (cluster.length < 3) continue;

      const impacts = cluster.map(getImpactValue);
      const avgImpact = impacts.reduce((a, b) => a + b, 0) / impacts.length;
      const minImpact = Math.min(...impacts);
      const maxImpact = Math.max(...impacts);

      // Calculate success rate within cluster
      const successCount = cluster.filter((item) => getOutcomePattern(item) === "success").length;
      const successRate = (successCount / cluster.length) * 100;

      patterns.push({
        patternId: `pattern-${patternCounter++}`,
        problemType: candidate.problemType,
        outcomePattern: candidate.outcomePattern,
        frequency: cluster.length,
        avgImpact: Math.round(avgImpact),
        impactRange: {
          min: Math.round(minImpact),
          max: Math.round(maxImpact),
        },
        successRate: Math.round(successRate * 100) / 100,
        itemIds: cluster.map((item) => item.id),
      });
    }
  }

  // Sort by frequency (descending) and limit to 20
  return patterns.sort((a, b) => b.frequency - a.frequency).slice(0, 20);
}
