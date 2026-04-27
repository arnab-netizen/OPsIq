"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/ui/primitives";

interface ExecutionCertaintyData {
  score: number;
  level: "blocked" | "low" | "medium" | "high" | "certain";
  blockers: string[];
  risks: string[];
  reasons: string[];
}

interface ExecutionCertaintyCardProps {
  engagementId: string;
}

const LEVEL_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  blocked: "destructive",
  low: "destructive",
  medium: "warning",
  high: "success",
  certain: "success",
};

export function ExecutionCertaintyCard({ engagementId }: ExecutionCertaintyCardProps) {
  const [data, setData] = useState<ExecutionCertaintyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCertainty() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(
          `/api/engagements/${engagementId}/execution-certainty`
        );
        if (!response.ok) {
          throw new Error("Failed to load execution certainty");
        }
        const certaintyData = await response.json();
        setData(certaintyData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setData({
          score: 0,
          level: "blocked",
          blockers: [],
          risks: [],
          reasons: [],
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchCertainty();
  }, [engagementId]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-muted/10 p-4">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Execution Certainty
        </p>
        <div className="mt-2 animate-pulse">
          <div className="h-8 w-12 rounded bg-muted"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-border bg-destructive/5 p-4">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Execution Certainty
        </p>
        <p className="mt-2 text-xs text-destructive">{error || "Unable to load"}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        Execution Certainty
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-bold">{data.score}</p>
        <Badge variant={LEVEL_VARIANTS[data.level] ?? "muted"} className="text-xs">
          {data.level}
        </Badge>
      </div>
      <div className="mt-3 space-y-2">
        {data.blockers.length > 0 && (
          <p className="text-xs text-destructive">
            {data.blockers.length} blocker(s)
          </p>
        )}
        {data.risks.length > 0 && (
          <p className="text-xs text-warning">
            {data.risks.length} risk(s)
          </p>
        )}
        {data.reasons.length > 0 && (
          <div className="mt-2 space-y-1">
            {data.reasons.slice(0, 3).map((reason, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                • {reason}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
