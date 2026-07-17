"use client";

import { useState, useMemo } from "react";
import { z } from "zod";

// ============================================================================
// SCHEMAS & TYPES
// ============================================================================

const EngagementStatusSchema = z.enum([
  "active",
  "paused",
  "completed",
  "at_risk",
  "blocked",
]);

const EngagementMetricsSchema = z.object({
  engagementId: z.string(),
  name: z.string(),
  status: EngagementStatusSchema,
  healthScore: z.number().min(0).max(100),
  impactLevel: z.enum([
    "low",
    "medium",
    "high",
    "critical",
    "existential",
  ]),
  recommendedActions: z.number().min(0),
  completedActions: z.number().min(0),
  atRiskCount: z.number().min(0),
  revenueAtRisk: z.number(),
  owner: z.string(),
  nextReviewDate: z.string(),
});

const PortfolioViewSchema = z.object({
  totalEngagements: z.number(),
  activeEngagements: z.number(),
  averageHealth: z.number(),
  criticalCount: z.number(),
  portfolioRisk: z.enum(["minimal", "low", "moderate", "high", "critical"]),
  engagements: z.array(EngagementMetricsSchema),
  topRisks: z.array(
    z.object({
      engagementId: z.string(),
      riskType: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      mitigation: z.string(),
    })
  ),
});

type EngagementStatus = z.infer<typeof EngagementStatusSchema>;
type EngagementMetrics = z.infer<typeof EngagementMetricsSchema>;
type PortfolioView = z.infer<typeof PortfolioViewSchema>;
type TabType = "overview" | "engagements" | "risks" | "actions";

// ============================================================================
// MOCK DATA GENERATORS
// ============================================================================

function generateMockEngagements(): EngagementMetrics[] {
  const today = new Date();
  const getDaysFromNow = (days: number): string => {
    const date = new Date(today);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  };

  return [
    {
      engagementId: "eng-001",
      name: "SaaS Growth Initiative",
      status: "active",
      healthScore: 85,
      impactLevel: "high",
      recommendedActions: 12,
      completedActions: 8,
      atRiskCount: 1,
      revenueAtRisk: 250000,
      owner: "Alice Chen",
      nextReviewDate: getDaysFromNow(5),
    },
    {
      engagementId: "eng-002",
      name: "Cost Optimization Program",
      status: "active",
      healthScore: 72,
      impactLevel: "medium",
      recommendedActions: 8,
      completedActions: 5,
      atRiskCount: 2,
      revenueAtRisk: 75000,
      owner: "Bob Martinez",
      nextReviewDate: getDaysFromNow(2),
    },
    {
      engagementId: "eng-003",
      name: "Market Expansion - EMEA",
      status: "at_risk",
      healthScore: 45,
      impactLevel: "critical",
      recommendedActions: 15,
      completedActions: 2,
      atRiskCount: 5,
      revenueAtRisk: 500000,
      owner: "Carol Singh",
      nextReviewDate: getDaysFromNow(1),
    },
    {
      engagementId: "eng-004",
      name: "Tech Debt Elimination",
      status: "active",
      healthScore: 68,
      impactLevel: "medium",
      recommendedActions: 10,
      completedActions: 6,
      atRiskCount: 1,
      revenueAtRisk: 100000,
      owner: "David Park",
      nextReviewDate: getDaysFromNow(7),
    },
    {
      engagementId: "eng-005",
      name: "Customer Success Scaling",
      status: "completed",
      healthScore: 95,
      impactLevel: "high",
      recommendedActions: 5,
      completedActions: 5,
      atRiskCount: 0,
      revenueAtRisk: 0,
      owner: "Emma Wilson",
      nextReviewDate: getDaysFromNow(19),
    },
  ];
}

export function generateMockPortfolioView(): PortfolioView {
  const mockEngagements = generateMockEngagements();
  const activeEngagements = mockEngagements.filter(
    (e) => e.status === "active"
  );
  const averageHealth =
    mockEngagements.reduce((sum, e) => sum + e.healthScore, 0) /
    mockEngagements.length;
  const criticalCount = mockEngagements.filter(
    (e) => e.impactLevel === "critical"
  ).length;
  let portfolioRisk: "minimal" | "low" | "moderate" | "high" | "critical" =
    "minimal";
  if (criticalCount >= 3) portfolioRisk = "critical";
  else if (criticalCount === 2) portfolioRisk = "high";
  else if (criticalCount === 1 || averageHealth < 60)
    portfolioRisk = "moderate";
  else if (averageHealth < 75) portfolioRisk = "low";

  const topRisks: Array<{
    engagementId: string;
    riskType: string;
    severity: "low" | "medium" | "high" | "critical";
    mitigation: string;
  }> = mockEngagements
    .filter((e) => e.atRiskCount > 0)
    .sort((a, b) => b.atRiskCount - a.atRiskCount)
    .slice(0, 5)
    .map((e) => {
      const severity: "low" | "medium" | "high" | "critical" =
        e.impactLevel === "critical"
          ? "critical"
          : e.impactLevel === "high"
            ? "high"
            : "medium";
      return {
        engagementId: e.engagementId,
        riskType:
          e.status === "at_risk" ? "execution_blocked" : "action_overdue",
        severity,
        mitigation:
          e.status === "at_risk"
            ? `Escalate to leadership; address ${e.atRiskCount} critical blockers`
            : `Complete ${e.atRiskCount} overdue actions within 7 days`,
      };
    });

  return {
    totalEngagements: mockEngagements.length,
    activeEngagements: activeEngagements.length,
    averageHealth: Math.round(averageHealth),
    criticalCount,
    portfolioRisk,
    engagements: mockEngagements,
    topRisks,
  };
}

// ============================================================================
// COMPONENT: Portfolio Command Center Shell
// ============================================================================

export function PortfolioCommandCenterShell() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [filterStatus, setFilterStatus] = useState<
    EngagementStatus | "all"
  >("all");
  const [sortBy, setSortBy] = useState<
    "health" | "impact" | "risk" | "name"
  >("health");

  const portfolio = useMemo(() => generateMockPortfolioView(), []);

  const filteredEngagements = useMemo(() => {
    let filtered = portfolio.engagements;

    if (filterStatus !== "all") {
      filtered = filtered.filter((e) => e.status === filterStatus);
    }

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "health":
          return b.healthScore - a.healthScore;
        case "impact":
          const impactOrder = {
            existential: 5,
            critical: 4,
            high: 3,
            medium: 2,
            low: 1,
          };
          return (
            impactOrder[b.impactLevel] - impactOrder[a.impactLevel]
          );
        case "risk":
          return b.atRiskCount - a.atRiskCount;
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [filterStatus, sortBy, portfolio.engagements]);

  const getHealthColor = (score: number): string => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getStatusBadgeColor = (status: EngagementStatus): string => {
    switch (status) {
      case "active":
        return "bg-blue-100 text-blue-800";
      case "at_risk":
        return "bg-red-100 text-red-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "paused":
        return "bg-gray-100 text-gray-800";
      case "blocked":
        return "bg-purple-100 text-purple-800";
    }
  };

  return (
    <div className="w-full bg-white rounded-lg shadow-lg p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Portfolio Command Center
        </h1>
        <p className="text-gray-600 mt-2">
          Real-time portfolio health, risk assessment, and engagement tracking
        </p>
      </div>

      {/* OVERVIEW METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600">Total Engagements</div>
          <div className="text-2xl font-bold text-gray-900">
            {portfolio.totalEngagements}
          </div>
        </div>

        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="text-sm text-gray-600">Active</div>
          <div className="text-2xl font-bold text-blue-600">
            {portfolio.activeEngagements}
          </div>
        </div>

        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="text-sm text-gray-600">Avg Health</div>
          <div className={`text-2xl font-bold ${getHealthColor(portfolio.averageHealth)}`}>
            {portfolio.averageHealth}%
          </div>
        </div>

        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <div className="text-sm text-gray-600">Critical</div>
          <div className="text-2xl font-bold text-red-600">
            {portfolio.criticalCount}
          </div>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <div className="text-sm text-gray-600">Portfolio Risk</div>
          <div className="text-lg font-bold text-purple-600 capitalize">
            {portfolio.portfolioRisk}
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-6">
          {(
            ["overview", "engagements", "risks", "actions"] as const
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 px-2 font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab === "overview"
                ? "Overview"
                : tab === "engagements"
                  ? "Engagements"
                  : tab === "risks"
                    ? "Top Risks"
                    : "Action Items"}
            </button>
          ))}
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Portfolio Summary
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                <h3 className="font-semibold text-gray-900 mb-3">
                  Engagement Status
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">Active</span>
                    <span className="font-bold text-blue-600">
                      {portfolio.activeEngagements}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">At Risk</span>
                    <span className="font-bold text-red-600">
                      {portfolio.engagements.filter((e) => e.status === "at_risk").length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Completed</span>
                    <span className="font-bold text-green-600">
                      {portfolio.engagements.filter((e) => e.status === "completed").length}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                <h3 className="font-semibold text-gray-900 mb-3">
                  Revenue Health
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">Total at Risk</span>
                    <span className="font-bold text-red-600">
                      ${portfolio.engagements.reduce((sum, e) => sum + e.revenueAtRisk, 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Avg Revenue Impact</span>
                    <span className="font-bold text-gray-900">
                      ${(portfolio.engagements.reduce((sum, e) => sum + e.revenueAtRisk, 0) / portfolio.totalEngagements).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ENGAGEMENTS TAB */}
      {activeTab === "engagements" && (
        <div className="space-y-4">
          <div className="flex gap-4 items-center">
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as EngagementStatus | "all")
              }
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="at_risk">At Risk</option>
              <option value="completed">Completed</option>
              <option value="paused">Paused</option>
              <option value="blocked">Blocked</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as "health" | "impact" | "risk" | "name"
                )
              }
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="health">Sort by Health</option>
              <option value="impact">Sort by Impact</option>
              <option value="risk">Sort by Risk Count</option>
              <option value="name">Sort by Name</option>
            </select>
          </div>

          <div className="space-y-3">
            {filteredEngagements.length === 0 ? (
              <div className="text-center py-6 text-gray-600">
                No engagements found
              </div>
            ) : (
              filteredEngagements.map((eng) => (
                <div
                  key={eng.engagementId}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {eng.name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Owner: {eng.owner}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusBadgeColor(eng.status)}`}
                    >
                      {eng.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Health</span>
                      <p className={`font-bold ${getHealthColor(eng.healthScore)}`}>
                        {eng.healthScore}%
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600">Impact</span>
                      <p className="font-bold text-gray-900 capitalize">
                        {eng.impactLevel}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600">Actions</span>
                      <p className="font-bold text-gray-900">
                        {eng.completedActions}/{eng.recommendedActions}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600">Revenue at Risk</span>
                      <p className="font-bold text-red-600">
                        ${eng.revenueAtRisk.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-gray-600">
                    Next review: {eng.nextReviewDate}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TOP RISKS TAB */}
      {activeTab === "risks" && (
        <div className="space-y-3">
          {portfolio.topRisks.length === 0 ? (
            <div className="text-center py-6 text-gray-600">
              No risks identified
            </div>
          ) : (
            portfolio.topRisks.map((risk, idx) => {
              const engagement = portfolio.engagements.find(
                (e) => e.engagementId === risk.engagementId
              );
              return (
                <div
                  key={idx}
                  className="border border-red-200 bg-red-50 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">
                      {engagement?.name || "Unknown"}
                    </h3>
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold capitalize ${
                        risk.severity === "critical"
                          ? "bg-red-200 text-red-800"
                          : "bg-yellow-200 text-yellow-800"
                      }`}
                    >
                      {risk.severity}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Issue:</strong> {risk.riskType.replace(/_/g, " ")}
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>Mitigation:</strong> {risk.mitigation}
                  </p>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ACTION ITEMS TAB */}
      {activeTab === "actions" && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Recommended Actions Across Portfolio
          </h2>
          <div className="space-y-2 text-sm">
            {filteredEngagements
              .filter((e) => e.recommendedActions > e.completedActions)
              .map((eng) => (
                <div
                  key={eng.engagementId}
                  className="border border-gray-200 rounded p-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900">{eng.name}</p>
                    <p className="text-gray-600">
                      {eng.recommendedActions - eng.completedActions} pending actions
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-600">Progress</div>
                    <div className="font-bold text-gray-900">
                      {Math.round(
                        (eng.completedActions / eng.recommendedActions) * 100
                      )}
                      %
                    </div>
                  </div>
                </div>
              ))}
            {filteredEngagements.every(
              (e) => e.recommendedActions === e.completedActions
            ) && (
              <div className="text-center py-6 text-gray-600">
                All actions completed
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
