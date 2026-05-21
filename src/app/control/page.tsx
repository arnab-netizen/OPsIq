'use client';

import { classifyOperatorError } from '@/lib/operator-error-governance';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface BlockedDecision {
  id: string;
  problem: string;
  blockReason: string;
  estimatedLoss: number;
  timestamp: string;
}

interface LossDriver {
  name: string;
  impact: number;
  description: string;
}

interface RecommendedAction {
  id: string;
  action: string;
  estimatedLoss: number;
  expectedImpact: number;
  confidence: number;
  priority: number;
}

interface ConfidenceRisk {
  variable: string;
  confidence: number;
  status: 'low' | 'medium' | 'high';
}

interface BlockedMetrics {
  workspace: {
    workspaceId: string;
  };
  period: {
    startDate: string;
    endDate: string;
  };
  metrics: {
    blockedCount: number;
    rejectedImpact: number;
    avgBlockedConfidence: number;
    lowConfidenceBlockCount: number;
    blocksByStage: Record<
      string,
      {
        count: number;
        rejectedImpact: number;
        avgConfidence: number;
      }
    >;
    topGuardrailViolations: Array<{
      ruleId: string;
      count: number;
      totalExpectedImpact: number;
    }>;
    blockReasonsByStage: Array<{
      stage: string;
      reasonExamples: string[];
      count: number;
      totalExpectedImpact: number;
      avgConfidence: number;
    }>;
  };
}

interface DashboardData {
  blockedDecisions: BlockedDecision[];
  lossDrivers: LossDriver[];
  recommendedActions: RecommendedAction[];
  confidenceRisks: ConfidenceRisk[];
  valueData: any;
  blockedMetrics: BlockedMetrics | null;
}

export default function ControlPage() {
  const [data, setData] = useState<DashboardData>({
    blockedDecisions: [],
    lossDrivers: [],
    recommendedActions: [],
    confidenceRisks: [],
    valueData: null,
    blockedMetrics: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch value data for loss drivers and approved metrics
        const valueRes = await fetch('/api/value/7day');
        let valueData = null;
        if (valueRes.ok) {
          valueData = await valueRes.json();
        }

        // Fetch blocked decisions metrics
        const blockedMetricsRes = await fetch('/api/control/blocked-metrics?days=7');
        let blockedMetrics: BlockedMetrics | null = null;
        if (blockedMetricsRes.ok) {
          blockedMetrics = await blockedMetricsRes.json();
        }

        // Build dashboard data from APIs
        const blockedDecisions: BlockedDecision[] = [];
        const recommendedActions: RecommendedAction[] = [];
        const confidenceRisks: ConfidenceRisk[] = [];

        // Fetch my day items for recommended actions
        const myDayRes = await fetch('/api/operator');
        if (myDayRes.ok) {
          const myDayData = await myDayRes.json();
          if (Array.isArray(myDayData)) {
            const actions = myDayData
              .filter((item: any) => item.status === 'pending')
              .map((item: any) => ({
                id: item.id,
                action: item.action || 'Unknown',
                estimatedLoss: item.estimatedLoss || 0,
                expectedImpact: item.impactExpected || 0,
                confidence: item.confidence || 0.7,
                priority: item.priorityScore || 0,
              }))
              .sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0))
              .slice(0, 3);
            recommendedActions.push(...actions);
          }
        }

        // Build loss drivers from value data
        const lossDrivers: LossDriver[] = [];
        if (valueData?.valid) {
          if (valueData.lossFromWrongDecisions > 0) {
            lossDrivers.push({
              name: 'Wrong Decisions',
              impact: valueData.lossFromWrongDecisions,
              description: `Loss from ${valueData.wrongDecisionCount || 1} incorrect decision(s)`,
            });
          }
          if (valueData.totalActual < valueData.totalExpected) {
            lossDrivers.push({
              name: 'Underperformance',
              impact: valueData.totalExpected - valueData.totalActual,
              description: 'Actual results below expected threshold',
            });
          }
        }

        // Add confidence risk data based on item confidences
        if (Array.isArray(recommendedActions) && recommendedActions.length > 0) {
          recommendedActions.forEach((action: any) => {
            const conf = action.confidence || 0;
            const status = conf >= 0.8 ? 'high' : conf >= 0.6 ? 'medium' : 'low';
            if (status !== 'high') {
              confidenceRisks.push({
                variable: action.action,
                confidence: conf,
                status,
              });
            }
          });
        }

        // Build blocked decisions from metrics
        if (blockedMetrics && blockedMetrics.metrics.blockReasonsByStage.length > 0) {
          blockedMetrics.metrics.blockReasonsByStage.forEach((reason, idx) => {
            blockedDecisions.push({
              id: `blocked-${idx}`,
              problem: reason.reasonExamples[0] || `${reason.stage} block`,
              blockReason: `[${reason.stage}] ${reason.count} decision(s) blocked`,
              estimatedLoss: reason.totalExpectedImpact,
              timestamp: new Date().toISOString(),
            });
          });
        }

        setData({
          blockedDecisions,
          lossDrivers: lossDrivers.sort((a, b) => b.impact - a.impact),
          recommendedActions,
          confidenceRisks,
          valueData,
          blockedMetrics,
        });

        setLastUpdate(new Date().toLocaleTimeString());
      } catch (err) {
        const governed = classifyOperatorError(err instanceof Error ? err : new Error('Failed to load dashboard data'), { context: 'load' });
        setError(governed.operatorMessage);
        console.error('Dashboard error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`rounded-lg border border-border bg-card p-4 md:p-6 ${className}`}>
      {children}
    </div>
  );

  const LoadingCard = () => (
    <Card className="animate-pulse">
      <div className="h-4 bg-muted rounded mb-2 w-3/4"></div>
      <div className="h-8 bg-muted rounded w-1/2"></div>
    </Card>
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-background p-3 md:p-8 sm:p-4">
      <div className="mx-auto w-full max-w-5xl">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold text-foreground md:text-3xl">
                Decision Control Dashboard
              </h1>
              <p className="mt-1 text-xs md:text-sm text-muted-foreground">
                Real-time decision health and risk oversight
              </p>
            </div>
            {lastUpdate && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Updated</p>
                <p className="text-xs font-medium text-foreground">{lastUpdate}</p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <Card className="mb-6 border-destructive/50 bg-destructive/5">
            <p className="text-xs text-destructive">{error}</p>
          </Card>
        )}

        {/* Main Grid - Mobile First */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {/* 1. Blocked Decisions */}
          <Card className="md:col-span-1 lg:col-span-2">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Blocked Decisions
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Decisions stopped by control layer
              </p>
            </div>

            {loading ? (
              <LoadingCard />
            ) : data.blockedDecisions.length > 0 ? (
              <div className="space-y-3">
                {data.blockedDecisions.map((decision) => (
                  <div
                    key={decision.id}
                    className="border-l-2 border-destructive pl-3 py-2"
                  >
                    <p className="text-xs font-medium text-foreground line-clamp-2">
                      {decision.problem}
                    </p>
                    <p className="text-xs text-destructive mt-1">
                      {decision.blockReason}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Loss: {formatCurrency(decision.estimatedLoss)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No decisions blocked today - all decisions passed control gates
              </p>
            )}
          </Card>

          {/* 2. 7-Day Summary */}
          <Card className="md:col-span-1">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                7-Day Decision Health
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Approved vs blocked outcomes
              </p>
            </div>

            {loading ? (
              <LoadingCard />
            ) : data.valueData ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-green-50 border border-green-200">
                    <p className="text-muted-foreground">Approved</p>
                    <p className="font-bold text-green-600">
                      {data.valueData.metrics?.approvedCount || 0}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-red-50 border border-red-200">
                    <p className="text-muted-foreground">Blocked</p>
                    <p className="font-bold text-red-600">
                      {data.valueData.metrics?.blockedCount || 0}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Rejected Impact</p>
                  <p className="font-semibold text-red-600">
                    {formatCurrency(data.valueData.metrics?.rejectedImpact || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Approved Actual Impact</p>
                  <p className="font-semibold text-green-600">
                    {formatCurrency(data.valueData.metrics?.actualImpactApproved || 0)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No decision data available
              </p>
            )}
          </Card>

          {/* 3. Top Loss Drivers */}
          <Card className="md:col-span-2 lg:col-span-1">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Top Loss Drivers
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ranked by financial impact
              </p>
            </div>

            {loading ? (
              <LoadingCard />
            ) : data.lossDrivers.length > 0 ? (
              <div className="space-y-3">
                {data.lossDrivers.slice(0, 3).map((driver, idx) => (
                  <div
                    key={idx}
                    className="border border-orange-200 rounded p-2 bg-orange-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          {driver.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {driver.description}
                        </p>
                      </div>
                      <p className="text-xs font-bold text-orange-600 whitespace-nowrap">
                        {formatCurrency(driver.impact)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No loss drivers identified
              </p>
            )}
          </Card>

          {/* 4. Recommended Actions Today */}
          <Card className="md:col-span-2 lg:col-span-2">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Recommended Actions Today
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Top 3 prioritized by impact
              </p>
            </div>

            {loading ? (
              <LoadingCard />
            ) : data.recommendedActions.length > 0 ? (
              <div className="space-y-3">
                {data.recommendedActions.slice(0, 3).map((action, idx) => (
                  <div
                    key={action.id || idx}
                    className="border border-green-200 rounded p-3 bg-green-50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-foreground line-clamp-2">
                          {action.action}
                        </p>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">At Risk</p>
                            <p className="font-semibold text-foreground">
                              {formatCurrency(action.estimatedLoss)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Expected</p>
                            <p className="font-semibold text-foreground">
                              {formatCurrency(action.expectedImpact)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Confidence</p>
                            <p className="font-semibold text-foreground">
                              {Math.round(action.confidence * 100)}%
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No pending actions
              </p>
            )}
          </Card>

          {/* 5. Confidence Risk */}
          <Card>
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Confidence Risk
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Low-confidence decisions
              </p>
            </div>

            {loading ? (
              <LoadingCard />
            ) : data.confidenceRisks.length > 0 ? (
              <div className="space-y-2">
                {data.confidenceRisks.map((risk, idx) => (
                  <div key={idx} className="p-2 rounded bg-yellow-50 border border-yellow-200">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-foreground line-clamp-1">
                        {risk.variable}
                      </p>
                      <div className="flex items-center gap-1">
                        <div className="w-12 h-1.5 bg-yellow-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-yellow-600"
                            style={{ width: `${risk.confidence * 100}%` }}
                          ></div>
                        </div>
                        <p className="text-xs font-semibold text-yellow-700 whitespace-nowrap">
                          {Math.round(risk.confidence * 100)}%
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                All decisions have good confidence
              </p>
            )}
          </Card>

          {/* 6. Top Guardrail Violations */}
          <Card className="md:col-span-2 lg:col-span-1">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Top Guardrail Blocks
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Most common violations
              </p>
            </div>

            {loading ? (
              <LoadingCard />
            ) : data.blockedMetrics?.metrics.topGuardrailViolations.length ? (
              <div className="space-y-2">
                {data.blockedMetrics.metrics.topGuardrailViolations.slice(0, 3).map(
                  (violation, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-red-50 border border-red-200 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-foreground">
                            {violation.ruleId}
                          </p>
                          <p className="text-muted-foreground">
                            {violation.count} block{violation.count !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-red-600">
                            {formatCurrency(violation.totalExpectedImpact)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No guardrail violations
              </p>
            )}
          </Card>
        </div>

        {/* Footer Info */}
        <div className="mt-8 rounded-lg border border-border bg-muted/30 p-3 md:p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium">Dashboard:</span> Displays real decisions from your control layer.
            Blocked decisions show control layer effectiveness. Loss drivers surface real financial impact.
            Confidence risk identifies decisions needing more data. Auto-refreshes every 30 seconds.
          </p>
        </div>

        {/* Navigation Links */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            href="/decision"
            className="rounded-lg border border-border p-3 md:p-4 hover:bg-muted transition-colors text-center"
          >
            <p className="text-xs md:text-sm font-medium text-foreground">
              Make Decision
            </p>
          </Link>
          <Link
            href="/my-day"
            className="rounded-lg border border-border p-3 md:p-4 hover:bg-muted transition-colors text-center"
          >
            <p className="text-xs md:text-sm font-medium text-foreground">
              My Day
            </p>
          </Link>
          <Link
            href="/report"
            className="rounded-lg border border-border p-3 md:p-4 hover:bg-muted transition-colors text-center"
          >
            <p className="text-xs md:text-sm font-medium text-foreground">
              Reports
            </p>
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-border p-3 md:p-4 hover:bg-muted transition-colors text-center"
          >
            <p className="text-xs md:text-sm font-medium text-foreground">
              Dashboard
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
