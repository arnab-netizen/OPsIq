"use client";

import { useState } from "react";
import { Badge } from "@/ui/primitives";

interface Recommendation {
  id: string;
  title: string;
  priority: string;
  score?: number;
  scoreBreakdown?: {
    weights: Record<string, number>;
    normalizedInputs: Record<string, number>;
    contributions: Record<string, number>;
    finalScore: number;
  };
}

interface RecommendationsViewProps {
  recommendations: Recommendation[];
}

export function RecommendationsView({
  recommendations,
}: RecommendationsViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...recommendations].sort((a, b) => {
    const scoreA = a.score ?? 0;
    const scoreB = b.score ?? 0;
    return scoreB - scoreA;
  });

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case "critical":
        return "destructive";
      case "high":
        return "warning";
      case "medium":
        return "default";
      default:
        return "muted";
    }
  };

  return (
    <div className="rounded-lg border border-border p-6">
      <h2 className="text-lg font-semibold text-foreground">
        Recommendations ({recommendations.length})
      </h2>
      {sorted.length > 0 ? (
        <div className="mt-4 space-y-3">
          {sorted.map((rec) => (
            <div
              key={rec.id}
              className="rounded-md border border-border p-3 hover:bg-muted/50 cursor-pointer"
              onClick={() =>
                setExpandedId(expandedId === rec.id ? null : rec.id)
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-foreground">
                    {rec.title}
                  </h3>
                  {rec.score !== undefined && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Score: {(rec.score * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
                <Badge variant={getPriorityVariant(rec.priority)}>
                  {rec.priority}
                </Badge>
              </div>

              {expandedId === rec.id && rec.scoreBreakdown && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Score Breakdown:
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {Object.entries(rec.scoreBreakdown.contributions).map(
                        ([key, value]) => (
                          <div key={key} className="text-xs">
                            <span className="font-medium capitalize">
                              {key.replace(/_/g, " ")}:
                            </span>{" "}
                            {(value as number).toFixed(3)}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No recommendations yet.
        </p>
      )}
    </div>
  );
}
