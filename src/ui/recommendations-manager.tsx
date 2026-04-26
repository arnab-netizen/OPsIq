"use client";

import { useState } from "react";
import { Badge, Button } from "@/ui/primitives";

interface Recommendation {
  id: string;
  title: string;
  priority: string;
  status?: string;
  version: number;
  engagementId: string;
  score?: number;
  scoreBreakdown?: {
    weights: Record<string, number>;
    normalizedInputs: Record<string, number>;
    contributions: Record<string, number>;
    finalScore: number;
  };
  rationale?: string;
}

interface RecommendationsManagerProps {
  recommendations: Recommendation[];
  engagementId: string;
  onRecommendationUpdated?: () => void;
}

const PRIORITY_OPTIONS = ["critical", "high", "medium", "low"];

const PRIORITY_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  critical: "destructive",
  high: "warning",
  medium: "default",
  low: "muted",
};

const STATUS_OPTIONS = ["pending", "approved", "rejected"];

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  pending: "muted",
  approved: "success",
  rejected: "destructive",
};

export function RecommendationsManager({
  recommendations,
  engagementId,
  onRecommendationUpdated,
}: RecommendationsManagerProps) {
  const [localRecommendations, setLocalRecommendations] = useState(recommendations);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reranking, setReranking] = useState(false);

  const handleUpdateRecommendation = async (
    recommendationId: string,
    updates: { priority?: string; status?: string },
    version: number
  ) => {
    setUpdating(recommendationId);
    setErrors({});

    try {
      const res = await fetch(`/api/recommendations/${recommendationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...updates,
          version,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData?.error?.message || "Failed to update recommendation";
        setErrors({ [recommendationId]: errorMessage });
        return;
      }

      const updated = await res.json();
      setLocalRecommendations(
        localRecommendations.map((r) =>
          r.id === recommendationId
            ? {
                ...r,
                priority: updated.priority || r.priority,
                status: updated.status || r.status,
                version: (updated.version || version) + 1,
              }
            : r
        )
      );

      onRecommendationUpdated?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update recommendation";
      setErrors({ [recommendationId]: errorMessage });
    } finally {
      setUpdating(null);
    }
  };

  const handleRerank = async () => {
    setReranking(true);
    setErrors({});

    try {
      const res = await fetch(`/api/engagements/${engagementId}/recommendations/rerank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData?.error?.message || "Failed to rerank recommendations";
        setErrors({ form: errorMessage });
        return;
      }

      onRecommendationUpdated?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to rerank recommendations";
      setErrors({ form: errorMessage });
    } finally {
      setReranking(false);
    }
  };

  const sorted = [...localRecommendations].sort((a, b) => {
    const scoreA = a.score ?? 0;
    const scoreB = b.score ?? 0;
    return scoreB - scoreA;
  });

  const criticalRecommendations = sorted.filter((r) => r.priority === "critical");
  const highRecommendations = sorted.filter((r) => r.priority === "high");
  const otherRecommendations = sorted.filter((r) => r.priority === "medium" || r.priority === "low");

  return (
    <div className="space-y-4">
      {/* Error State */}
      {errors.form && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
          {errors.form}
        </div>
      )}

      {/* Rerank Button */}
      {localRecommendations.length > 0 && (
        <Button size="sm" variant="outline" onClick={handleRerank} disabled={reranking}>
          {reranking ? "Reranking..." : "Rerank All"}
        </Button>
      )}

      {/* Critical Recommendations */}
      {criticalRecommendations.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <h4 className="font-semibold text-destructive">
            Critical ({criticalRecommendations.length})
          </h4>
          <div className="mt-3 space-y-2">
            {criticalRecommendations.map((rec) => (
              <div
                key={rec.id}
                className="rounded-md border border-destructive/30 bg-background p-3 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}>
                    <h5 className="font-medium">{rec.title}</h5>
                    {rec.score !== undefined && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Score: {(rec.score * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                  <Badge variant={PRIORITY_VARIANTS[rec.priority]}>
                    {rec.priority}
                  </Badge>
                </div>

                {expandedId === rec.id && (
                  <>
                    {rec.rationale && (
                      <div className="rounded-md border border-border/50 bg-muted/20 p-2 text-xs text-muted-foreground">
                        <p className="font-medium mb-1">Rationale:</p>
                        <p>{rec.rationale}</p>
                      </div>
                    )}
                    {rec.scoreBreakdown && (
                      <div className="rounded-md border border-border/50 bg-muted/20 p-2">
                        <p className="text-xs font-medium mb-2">Score Breakdown:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(rec.scoreBreakdown.contributions).map(([key, value]) => (
                            <div key={key} className="text-xs text-muted-foreground">
                              <span className="font-medium capitalize">{key.replace(/_/g, " ")}:</span>{" "}
                              {(value as number).toFixed(3)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {errors[rec.id] && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
                    {errors[rec.id]}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <select
                    value={rec.status || "pending"}
                    onChange={(e) => handleUpdateRecommendation(rec.id, { status: e.target.value }, rec.version)}
                    disabled={updating === rec.id}
                    className="rounded border border-border bg-background p-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                  {PRIORITY_OPTIONS.map((priority) => (
                    <Button
                      key={priority}
                      size="sm"
                      variant={rec.priority === priority ? "primary" : "outline"}
                      disabled={updating === rec.id}
                      onClick={() => handleUpdateRecommendation(rec.id, { priority }, rec.version)}
                    >
                      {priority}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* High Recommendations */}
      {highRecommendations.length > 0 && (
        <div className="rounded-lg border border-warning/50 bg-warning/5 p-4">
          <h4 className="font-semibold text-warning">High ({highRecommendations.length})</h4>
          <div className="mt-3 space-y-2">
            {highRecommendations.map((rec) => (
              <div
                key={rec.id}
                className="rounded-md border border-warning/30 bg-background p-3 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}>
                    <h5 className="font-medium">{rec.title}</h5>
                    {rec.score !== undefined && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Score: {(rec.score * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                  <Badge variant={PRIORITY_VARIANTS[rec.priority]}>
                    {rec.priority}
                  </Badge>
                </div>

                {expandedId === rec.id && (
                  <>
                    {rec.rationale && (
                      <div className="rounded-md border border-border/50 bg-muted/20 p-2 text-xs text-muted-foreground">
                        <p className="font-medium mb-1">Rationale:</p>
                        <p>{rec.rationale}</p>
                      </div>
                    )}
                    {rec.scoreBreakdown && (
                      <div className="rounded-md border border-border/50 bg-muted/20 p-2">
                        <p className="text-xs font-medium mb-2">Score Breakdown:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(rec.scoreBreakdown.contributions).map(([key, value]) => (
                            <div key={key} className="text-xs text-muted-foreground">
                              <span className="font-medium capitalize">{key.replace(/_/g, " ")}:</span>{" "}
                              {(value as number).toFixed(3)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {errors[rec.id] && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
                    {errors[rec.id]}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <select
                    value={rec.status || "pending"}
                    onChange={(e) => handleUpdateRecommendation(rec.id, { status: e.target.value }, rec.version)}
                    disabled={updating === rec.id}
                    className="rounded border border-border bg-background p-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                  {PRIORITY_OPTIONS.map((priority) => (
                    <Button
                      key={priority}
                      size="sm"
                      variant={rec.priority === priority ? "primary" : "outline"}
                      disabled={updating === rec.id}
                      onClick={() => handleUpdateRecommendation(rec.id, { priority }, rec.version)}
                    >
                      {priority}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other Recommendations */}
      {otherRecommendations.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h4 className="font-semibold">Other ({otherRecommendations.length})</h4>
          <div className="mt-3 space-y-2">
            {otherRecommendations.map((rec) => (
              <div
                key={rec.id}
                className="rounded-md border border-border bg-background p-3 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}>
                    <h5 className="font-medium">{rec.title}</h5>
                    {rec.score !== undefined && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Score: {(rec.score * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                  <Badge variant={PRIORITY_VARIANTS[rec.priority]}>
                    {rec.priority}
                  </Badge>
                </div>

                {expandedId === rec.id && (
                  <>
                    {rec.rationale && (
                      <div className="rounded-md border border-border/50 bg-muted/20 p-2 text-xs text-muted-foreground">
                        <p className="font-medium mb-1">Rationale:</p>
                        <p>{rec.rationale}</p>
                      </div>
                    )}
                    {rec.scoreBreakdown && (
                      <div className="rounded-md border border-border/50 bg-muted/20 p-2">
                        <p className="text-xs font-medium mb-2">Score Breakdown:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(rec.scoreBreakdown.contributions).map(([key, value]) => (
                            <div key={key} className="text-xs text-muted-foreground">
                              <span className="font-medium capitalize">{key.replace(/_/g, " ")}:</span>{" "}
                              {(value as number).toFixed(3)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {errors[rec.id] && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
                    {errors[rec.id]}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <select
                    value={rec.status || "pending"}
                    onChange={(e) => handleUpdateRecommendation(rec.id, { status: e.target.value }, rec.version)}
                    disabled={updating === rec.id}
                    className="rounded border border-border bg-background p-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                  {PRIORITY_OPTIONS.map((priority) => (
                    <Button
                      key={priority}
                      size="sm"
                      variant={rec.priority === priority ? "primary" : "outline"}
                      disabled={updating === rec.id}
                      onClick={() => handleUpdateRecommendation(rec.id, { priority }, rec.version)}
                    >
                      {priority}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {localRecommendations.length === 0 && (
        <div className="rounded-lg border border-border p-8 text-center">
          <p className="text-muted-foreground">No recommendations yet.</p>
        </div>
      )}
    </div>
  );
}
