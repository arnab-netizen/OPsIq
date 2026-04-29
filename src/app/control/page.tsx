'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ApiData {
  value?: any;
  calibration?: any;
  intelligence?: any;
  myDay?: any;
}

interface LoadingState {
  value: boolean;
  calibration: boolean;
  intelligence: boolean;
  myDay: boolean;
}

interface ErrorState {
  value: string | null;
  calibration: string | null;
  intelligence: string | null;
  myDay: string | null;
}

export default function ControlPage() {
  const [data, setData] = useState<ApiData>({});
  const [loading, setLoading] = useState<LoadingState>({
    value: true,
    calibration: true,
    intelligence: true,
    myDay: true,
  });
  const [errors, setErrors] = useState<ErrorState>({
    value: null,
    calibration: null,
    intelligence: null,
    myDay: null,
  });

  // Fetch all APIs in parallel
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch 7-day value metrics
        fetch('/api/value/7day')
          .then((res) => (res.ok ? res.json() : Promise.reject('Failed to load')))
          .then((data) => {
            setData((prev) => ({ ...prev, value: data }));
            setLoading((prev) => ({ ...prev, value: false }));
          })
          .catch((err) => {
            setErrors((prev) => ({
              ...prev,
              value: err instanceof Error ? err.message : 'Unable to load value metrics',
            }));
            setLoading((prev) => ({ ...prev, value: false }));
          });

        // Fetch calibration metrics
        fetch('/api/calibration')
          .then((res) => (res.ok ? res.json() : Promise.reject('Failed to load')))
          .then((data) => {
            setData((prev) => ({ ...prev, calibration: data }));
            setLoading((prev) => ({ ...prev, calibration: false }));
          })
          .catch((err) => {
            setErrors((prev) => ({
              ...prev,
              calibration: err instanceof Error ? err.message : 'Unable to load calibration metrics',
            }));
            setLoading((prev) => ({ ...prev, calibration: false }));
          });

        // Fetch intelligence summary
        fetch('/api/intelligence/summary')
          .then((res) => (res.ok ? res.json() : Promise.reject('Failed to load')))
          .then((data) => {
            setData((prev) => ({ ...prev, intelligence: data }));
            setLoading((prev) => ({ ...prev, intelligence: false }));
          })
          .catch((err) => {
            setErrors((prev) => ({
              ...prev,
              intelligence: err instanceof Error ? err.message : 'Unable to load intelligence data',
            }));
            setLoading((prev) => ({ ...prev, intelligence: false }));
          });

        // Fetch My Day items
        fetch('/api/operator/myday')
          .then((res) => (res.ok ? res.json() : Promise.reject('Failed to load')))
          .then((data) => {
            setData((prev) => ({ ...prev, myDay: data }));
            setLoading((prev) => ({ ...prev, myDay: false }));
          })
          .catch((err) => {
            setErrors((prev) => ({
              ...prev,
              myDay: err instanceof Error ? err.message : 'Unable to load My Day items',
            }));
            setLoading((prev) => ({ ...prev, myDay: false }));
          });
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };

    fetchData();

    // Refresh data every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Card component for consistent styling
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

  const ErrorCard = ({ message }: { message: string }) => (
    <Card className="border-destructive/50 bg-destructive/5">
      <p className="text-xs text-destructive">{message}</p>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background p-3 md:p-8 sm:p-4">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl font-bold text-foreground md:text-4xl">
            Control Dashboard
          </h1>
          <p className="mt-2 text-xs md:text-sm text-muted-foreground">
            Real-time business intelligence from decision system
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* 1. What is wrong? */}
          <Card>
            <div className="mb-4">
              <h2 className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
                What is wrong?
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Most common problem type</p>
            </div>

            {loading.intelligence ? (
              <LoadingCard />
            ) : errors.intelligence ? (
              <ErrorCard message={errors.intelligence} />
            ) : data.intelligence?.patterns && data.intelligence.patterns.length > 0 ? (
              <div>
                <p className="text-xl md:text-2xl font-bold text-foreground">
                  {data.intelligence.patterns[0].problemType || 'Unknown'}
                </p>
                <p className="text-xs md:text-sm text-muted-foreground mt-2">
                  Frequency: <span className="font-semibold text-foreground">{data.intelligence.patterns[0].frequency || 0}</span>
                </p>
                {data.intelligence.patterns[0].successRate !== undefined && (
                  <p className="text-xs md:text-sm text-muted-foreground mt-1">
                    Success Rate: <span className="font-semibold text-foreground">{Math.round(data.intelligence.patterns[0].successRate)}%</span>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No patterns detected yet</p>
            )}
          </Card>

          {/* 2. What is it costing? */}
          <Card>
            <div className="mb-4">
              <h2 className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
                What is it costing?
              </h2>
              <p className="text-xs text-muted-foreground mt-1">7-day net impact</p>
            </div>

            {loading.value ? (
              <LoadingCard />
            ) : errors.value ? (
              <ErrorCard message={errors.value} />
            ) : data.value && data.value.valid ? (
              <div>
                <p className={`text-xl md:text-2xl font-bold ${
                  data.value.totalDelta >= 0 ? 'text-success' : 'text-destructive'
                }`}>
                  ${data.value.totalDelta ? data.value.totalDelta.toFixed(0) : '0'}
                </p>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Expected</p>
                    <p className="font-semibold text-foreground text-sm">
                      ${data.value.totalExpected ? data.value.totalExpected.toFixed(0) : '0'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Actual</p>
                    <p className="font-semibold text-foreground text-sm">
                      ${data.value.totalActual ? data.value.totalActual.toFixed(0) : '0'}
                    </p>
                  </div>
                </div>
                {data.value.lossFromWrongDecisions > 0 && (
                  <p className="text-xs text-destructive mt-2">
                    Loss from wrong decisions: ${data.value.lossFromWrongDecisions.toFixed(0)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No value data available</p>
            )}
          </Card>

          {/* 3. What to do today? */}
          <Card>
            <div className="mb-4">
              <h2 className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
                What to do today?
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Top priority action</p>
            </div>

            {loading.myDay ? (
              <LoadingCard />
            ) : errors.myDay ? (
              <ErrorCard message={errors.myDay} />
            ) : data.myDay?.items && data.myDay.items.length > 0 ? (
              <div>
                <p className="text-sm md:text-base font-semibold text-foreground leading-snug">
                  {data.myDay.items[0].action || 'Unknown action'}
                </p>
                <div className="mt-3 space-y-2">
                  {data.myDay.items[0].problemType && (
                    <p className="text-xs text-muted-foreground">
                      Type: <span className="font-medium text-foreground">{data.myDay.items[0].problemType}</span>
                    </p>
                  )}
                  {data.myDay.items[0].impactExpected && (
                    <p className="text-xs text-muted-foreground">
                      Expected Impact: <span className="font-medium text-foreground">${data.myDay.items[0].impactExpected.toFixed(0)}</span>
                    </p>
                  )}
                  {data.myDay.items[0].priorityScore && (
                    <p className="text-xs text-muted-foreground">
                      Priority: <span className="font-medium text-foreground">{Math.round(data.myDay.items[0].priorityScore)}</span>
                    </p>
                  )}
                </div>
                <Link
                  href="/my-day"
                  className="inline-block mt-4 text-xs md:text-sm font-medium text-primary hover:underline"
                >
                  View all →
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No actions scheduled</p>
            )}
          </Card>

          {/* 4. What worked? */}
          <Card>
            <div className="mb-4">
              <h2 className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
                What worked?
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Decision accuracy</p>
            </div>

            {loading.calibration ? (
              <LoadingCard />
            ) : errors.calibration ? (
              <ErrorCard message={errors.calibration} />
            ) : data.calibration?.overall ? (
              <div>
                <div className="grid grid-cols-2 gap-3">
                  {data.calibration.overall.weightedAccuracy !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Accuracy</p>
                      <p className="text-lg md:text-xl font-bold text-success">
                        {Math.round(data.calibration.overall.weightedAccuracy * 100)}%
                      </p>
                    </div>
                  )}
                  {data.calibration.overall.decisionsAnalyzed !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Decisions</p>
                      <p className="text-lg md:text-xl font-bold text-foreground">
                        {data.calibration.overall.decisionsAnalyzed}
                      </p>
                    </div>
                  )}
                </div>
                {data.calibration.overall.calibrationScore !== undefined && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground">Calibration</p>
                    <p className="text-sm font-semibold text-foreground">
                      {Math.round(data.calibration.overall.calibrationScore * 100)}%
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No calibration data available</p>
            )}
          </Card>

          {/* 5. What is blocked and why? */}
          <Card className="md:col-span-2">
            <div className="mb-4">
              <h2 className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
                What is blocked and why?
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Recent guardrail or gate blocks</p>
            </div>

            {loading.intelligence ? (
              <LoadingCard />
            ) : errors.intelligence ? (
              <ErrorCard message={errors.intelligence} />
            ) : data.intelligence?.patterns ? (
              <div className="space-y-3">
                {/* This would show recent blocks if available in the API */}
                {data.intelligence.patterns && data.intelligence.patterns.length > 0 ? (
                  <div className="text-sm">
                    <p className="text-muted-foreground mb-2">
                      Patterns detected: <span className="font-semibold text-foreground">{data.intelligence.patterns.length}</span>
                    </p>
                    {data.intelligence.patterns.slice(0, 3).map((pattern: any, index: number) => (
                      <div key={index} className="text-xs p-2 rounded bg-muted/50 mb-2">
                        <p className="font-medium text-foreground">{pattern.problemType}</p>
                        <p className="text-muted-foreground">Success: {Math.round(pattern.successRate || 0)}%</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No blocks recorded</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No block data available</p>
            )}
          </Card>
        </div>

        {/* Footer Info */}
        <div className="mt-6 md:mt-8 rounded-lg border border-border bg-muted p-3 md:p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium">Dashboard Note:</span> This dashboard refreshes every 30 seconds with real data from the decision system. All metrics are based on actual decisions and outcomes.
          </p>
        </div>

        {/* Navigation Links */}
        <div className="mt-6 md:mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            href="/decision"
            className="rounded-lg border border-border p-3 md:p-4 hover:bg-muted transition-colors text-center"
          >
            <p className="text-xs md:text-sm font-medium text-foreground">Make Decision</p>
          </Link>
          <Link
            href="/my-day"
            className="rounded-lg border border-border p-3 md:p-4 hover:bg-muted transition-colors text-center"
          >
            <p className="text-xs md:text-sm font-medium text-foreground">My Day</p>
          </Link>
          <Link
            href="/report"
            className="rounded-lg border border-border p-3 md:p-4 hover:bg-muted transition-colors text-center"
          >
            <p className="text-xs md:text-sm font-medium text-foreground">Reports</p>
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-border p-3 md:p-4 hover:bg-muted transition-colors text-center"
          >
            <p className="text-xs md:text-sm font-medium text-foreground">Dashboard</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
