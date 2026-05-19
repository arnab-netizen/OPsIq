"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/ui/primitives";
import {
  classifyOperatorError,
  type ErrorGovernanceContext,
} from "@/src/lib/operator-error-governance";

interface ExecutionCertaintyData {
  score: number;
  level: "blocked" | "low" | "medium" | "high" | "certain";
  blockers: string[];
  risks: string[];
  reasons: string[];
  overrideApplied?: boolean;
  overrideReason?: string;
  overriddenBy?: string;
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
        const ctx: ErrorGovernanceContext = { context: "load" };
        const govErr = classifyOperatorError(err, ctx);
        setError(govErr.operatorMessage);
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

  // Show blocked state
  if (data.level === "blocked" || data.score < 40) {
    if (data.overrideApplied) {
      // Override applied state
      return (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase text-warning">
                Execution Risk: HIGH — Override Applied
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-2xl font-bold">{data.score}</p>
                <Badge variant="warning" className="text-xs">
                  {data.level}
                </Badge>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {data.overrideReason && (
              <div>
                <p className="text-xs font-medium text-foreground">Reason:</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.overrideReason}
                </p>
              </div>
            )}
            {data.overriddenBy && (
              <p className="text-xs text-muted-foreground">
                Approved by: {data.overriddenBy}
              </p>
            )}
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
          </div>
        </div>
      );
    }

    // Blocked state (no override)
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-destructive">
              Execution Risk: HIGH — Approval Blocked
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-2xl font-bold">{data.score}</p>
              <Badge variant="destructive" className="text-xs">
                {data.level}
              </Badge>
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {data.blockers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-destructive">
                {data.blockers.length} blocker(s):
              </p>
              <div className="mt-1 space-y-1">
                {data.blockers.slice(0, 2).map((blocker, i) => (
                  <p key={i} className="text-xs text-destructive">
                    • {blocker}
                  </p>
                ))}
              </div>
            </div>
          )}
          {data.risks.length > 0 && (
            <p className="text-xs text-warning">
              {data.risks.length} risk(s)
            </p>
          )}
        </div>
      </div>
    );
  }

  // Normal state (not blocked)
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
