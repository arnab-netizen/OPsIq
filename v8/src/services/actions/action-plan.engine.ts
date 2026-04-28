import type { Priority, RecommendationRiskV2, RecommendationV2 } from "@/domain/diagnosis-v2/types";
import { slugKey } from "@/services/diagnosis-v2/utils";

export type ActionStatus = "not_started" | "in_progress" | "blocked" | "completed";

export interface ActionItemV2 {
  actionKey: string;
  title: string;
  description: string;
  ownerRole: "owner" | "manager" | "finance" | "operations" | "sales" | "advisor";
  priority: Priority;
  status: ActionStatus;
  sequenceNo: number;
  dueInDays: number;
  successMetric: string;
  dependencyKeys: string[];
  linkedRecommendationKey: string;
  linkedRecommendationTitle: string;
}

export interface ActionPlanV2 {
  phase: "stabilize" | "diagnose" | "recover" | "grow";
  summary: string;
  items: ActionItemV2[];
}

function ownerRoleFor(category: string): ActionItemV2["ownerRole"] {
  if (/cash|cost|pricing|margin|finance|liquidity/i.test(category)) return "finance";
  if (/operation|capacity|service/i.test(category)) return "operations";
  if (/demand|customer|retention|sales|revenue/i.test(category)) return "sales";
  if (/control|reporting|evidence|monitoring/i.test(category)) return "owner";
  return "owner";
}

function dueInDaysFor(priority: Priority, riskScore: number): number {
  if (priority === "critical" || riskScore >= 80) return 2;
  if (priority === "high" || riskScore >= 60) return 7;
  if (priority === "medium") return 14;
  return 30;
}

function priorityOrder(priority: Priority): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[priority];
}

export function buildActionPlan(input: { recommendations: RecommendationV2[]; risks: RecommendationRiskV2[] }): ActionPlanV2 {
  const riskByKey = new Map(input.risks.map((risk) => [risk.recommendationKey, risk]));
  const sorted = [...input.recommendations].sort((a, b) => {
    const byPriority = priorityOrder(a.priority) - priorityOrder(b.priority);
    if (byPriority !== 0) return byPriority;
    return (riskByKey.get(b.recommendationKey)?.overallRiskScore ?? 0) - (riskByKey.get(a.recommendationKey)?.overallRiskScore ?? 0);
  });

  const items = sorted.map<ActionItemV2>((recommendation, index) => {
    const risk = riskByKey.get(recommendation.recommendationKey);
    const actionKey = `act_${String(index + 1).padStart(2, "0")}_${slugKey(recommendation.recommendationKey)}`;
    const previous = index > 0 ? sorted[index - 1] : undefined;
    return {
      actionKey,
      title: recommendation.title,
      description: recommendation.description,
      ownerRole: ownerRoleFor(recommendation.category),
      priority: recommendation.priority,
      status: risk?.riskClass === "blocked" ? "blocked" : "not_started",
      sequenceNo: index + 1,
      dueInDays: dueInDaysFor(recommendation.priority, risk?.overallRiskScore ?? 50),
      successMetric: String(recommendation.expectedUpside.primaryMetric ?? recommendation.expectedUpside.metric ?? "Owner-defined leading indicator"),
      dependencyKeys: previous ? [`act_${String(index).padStart(2, "0")}_${slugKey(previous.recommendationKey)}`] : [],
      linkedRecommendationKey: recommendation.recommendationKey,
      linkedRecommendationTitle: recommendation.title,
    };
  });

  const phase = items.some((item) => item.priority === "critical")
    ? "stabilize"
    : items.some((item) => item.priority === "high")
      ? "recover"
      : items.some((item) => /evidence|controls|monitor/i.test(item.linkedRecommendationKey))
        ? "diagnose"
        : "grow";
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  return {
    phase,
    summary: items.length
      ? `Generated ${items.length} sequenced action(s); ${blockedCount} blocked pending governance or evidence.`
      : "No action plan generated because no recommendations were available.",
    items,
  };
}
