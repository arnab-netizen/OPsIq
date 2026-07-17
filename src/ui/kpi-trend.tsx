"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/ui/primitives";

interface KPISnapshot {
  value: number;
  recordedAt: string;
}

interface KPI {
  id: string;
  name: string;
  currentValue?: number;
  baseline?: number;
  targetValue?: number;
  direction: "up" | "down";
  snapshots?: KPISnapshot[];
}

interface KPITrendProps {
  kpis: KPI[];
}

export function KPITrend({ kpis }: KPITrendProps) {
  const [_withSnapshots, setWithSnapshots] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function enrichKPIs() {
      try {
        const enriched = await Promise.all(
          kpis.map(async (kpi) => {
            // Snapshots would ideally come from the API, but using stored data
            return kpi;
          })
        );
        setWithSnapshots(enriched);
      } finally {
        setLoading(false);
      }
    }

    enrichKPIs();
  }, [kpis]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">KPI Trends</h2>
        <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const getTrendDirection = (kpi: KPI) => {
    if (!kpi.snapshots || kpi.snapshots.length < 2) return null;
    const current = kpi.snapshots[0].value;
    const previous = kpi.snapshots[1].value;
    return current > previous ? "up" : current < previous ? "down" : "stable";
  };

  const isDeteriating = (kpi: KPI) => {
    if (!kpi.snapshots || kpi.snapshots.length < 2) return false;
    const current = kpi.snapshots[0].value;
    const previous = kpi.snapshots[1].value;
    return kpi.direction === "up"
      ? current < previous
      : current > previous;
  };

  return (
    <div className="rounded-lg border border-border p-6">
      <h2 className="text-lg font-semibold text-foreground">
        KPI Trends ({kpis.length})
      </h2>
      {kpis.length > 0 ? (
        <div className="mt-4 space-y-4">
          {kpis.map((kpi) => {
            const trend = getTrendDirection(kpi);
            const deteriorating = isDeteriating(kpi);
            const recentSnapshots = kpi.snapshots?.slice(0, 5) || [];

            return (
              <div
                key={kpi.id}
                className="rounded-md border border-border p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">
                      {kpi.name}
                    </h3>
                    <p className="mt-1 text-2xl font-bold text-foreground">
                      {kpi.currentValue}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {kpi.direction === "up"
                        ? "Target: higher is better"
                        : "Target: lower is better"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    {deteriorating && (
                      <Badge variant="destructive">⚠️ Deteriorating</Badge>
                    )}
                    {trend === "up" && !deteriorating && (
                      <Badge variant="success">↑ Improving</Badge>
                    )}
                    {trend === "down" && !deteriorating && (
                      <Badge variant="success">↓ Improving</Badge>
                    )}
                    {trend === "stable" && (
                      <Badge variant="default">→ Stable</Badge>
                    )}
                  </div>
                </div>

                {recentSnapshots.length > 0 && (
                  <div className="mt-3 flex gap-2 items-end">
                    {recentSnapshots.reverse().map((snap, idx) => {
                      const normalized =
                        kpi.currentValue !== undefined
                          ? Math.min(
                              100,
                              (Math.abs(snap.value) /
                                Math.max(
                                  Math.abs(kpi.currentValue || 1),
                                  1
                                )) *
                                100
                            )
                          : 0;
                      return (
                        <div
                          key={idx}
                          className="flex flex-col items-center gap-1"
                        >
                          <div
                            className="w-8 bg-primary rounded"
                            style={{ height: `${Math.max(20, normalized)}px` }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {snap.value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No KPIs defined.</p>
      )}
    </div>
  );
}
