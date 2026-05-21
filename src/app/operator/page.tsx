'use client';

import { classifyOperatorError } from '@/lib/operator-error-governance';
import { useState, useEffect } from 'react';
import { OperatorItem } from '@/domain/operator/types';
import { calculateBadges, getBadgeVariant } from '@/services/badges/engine';
import { Badge } from '@/ui/primitives';

interface QueueResponse {
  items: OperatorItem[];
}

interface QueueError {
  error: string;
}

export default function OperatorQueuePage() {
  const [items, setItems] = useState<OperatorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/operator/queue');
        const data = (await response.json()) as QueueResponse | QueueError;

        if (!response.ok) {
          const errorData = data as QueueError;
          setError(errorData.error || 'Failed to fetch queue');
          setItems([]);
          return;
        }

        const queueData = data as QueueResponse;
        setItems(queueData.items);
      } catch (err) {
        const governed = classifyOperatorError(err instanceof Error ? err : new Error('Network error'), { context: "load" });
        setError(`Error: ${governed.operatorMessage}`);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchQueue();
  }, []);

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-8">
      <div className="w-full max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Operator Queue
          </h1>
          <p className="mt-2 text-xs md:text-sm text-muted-foreground">
            {loading
              ? 'Loading items...'
              : `Showing ${items.length} item${items.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/5 p-3 md:p-4 mb-6">
            <p className="text-xs md:text-sm font-medium text-destructive">
              {error}
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="space-y-3 md:space-y-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-muted p-3 md:p-4 animate-pulse"
              >
                <div className="h-4 bg-muted-foreground/20 rounded mb-2 w-3/4"></div>
                <div className="h-3 bg-muted-foreground/20 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && items.length === 0 && !error && (
          <div className="rounded-lg border border-border bg-muted p-6 md:p-8 text-center">
            <p className="text-sm md:text-base text-muted-foreground">
              No pending or in-progress items
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Great job! Your queue is empty.
            </p>
          </div>
        )}

        {/* Queue List */}
        {!loading && items.length > 0 && (
          <div className="space-y-3 md:space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-card p-3 md:p-4 hover:border-primary/50 transition-colors"
              >
                {/* Problem & Status Badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-xs md:text-sm font-semibold text-foreground flex-1 break-words">
                    {item.problem}
                  </h3>
                  <span
                    className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                      item.status === 'pending'
                        ? 'bg-yellow/10 text-yellow-700'
                        : item.status === 'in_progress'
                          ? 'bg-blue/10 text-blue-700'
                          : item.status === 'done'
                            ? 'bg-success/10 text-success'
                            : 'bg-destructive/10 text-destructive'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                {/* Trust Badges */}
                {(() => {
                  const badges = calculateBadges(item);
                  return badges.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {badges.map((badge) => (
                        <div key={badge.type} title={badge.description}>
                          <Badge
                            variant={getBadgeVariant(badge.type)}
                            className="text-xs"
                          >
                            {badge.label}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}

                {/* Action */}
                <p className="text-xs md:text-sm text-muted-foreground mb-3 break-words leading-relaxed">
                  {item.action}
                </p>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-3">
                  {/* Expected Impact */}
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-xs text-muted-foreground mb-1">
                      Impact
                    </p>
                    <p className="text-sm md:text-base font-semibold text-foreground">
                      ${item.impactExpected.toFixed(0)}
                    </p>
                  </div>

                  {/* Confidence */}
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-xs text-muted-foreground mb-1">
                      Confidence
                    </p>
                    <p className="text-sm md:text-base font-semibold text-foreground">
                      {(item.confidence * 100).toFixed(0)}%
                    </p>
                  </div>

                  {/* Priority Score */}
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-xs text-muted-foreground mb-1">
                      Priority
                    </p>
                    <p className="text-sm md:text-base font-semibold text-foreground">
                      {item.priorityScore.toFixed(0)}
                    </p>
                  </div>

                  {/* Due Date */}
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-xs text-muted-foreground mb-1">
                      Due
                    </p>
                    <p className="text-xs md:text-sm font-semibold text-foreground break-words">
                      {item.dueAt
                        ? new Date(item.dueAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Impact Range */}
                <div className="rounded-lg bg-muted/50 p-2 text-xs md:text-sm">
                  <p className="text-muted-foreground">
                    Range: ${item.impactLow.toFixed(0)}–${item.impactHigh.toFixed(0)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Footer */}
        <div className="mt-6 md:mt-8 rounded-lg border border-border bg-muted p-3 md:p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium">Queue Info:</span> Items are sorted by
            priority score (highest first) and due date (earliest first).
          </p>
        </div>
      </div>
    </div>
  );
}
