'use client';

import { useState, useEffect } from 'react';
import { OperatorItem } from '@/domain/operator/types';
import {
  classifyOperatorError,
  type ErrorGovernanceContext,
} from '@/lib/operator-error-governance';

interface MyDayResponse {
  items: OperatorItem[];
}

interface MyDayError {
  error: string;
}

interface ActionRequest {
  id: string;
  status: 'in_progress' | 'done' | 'failed';
  actualOutcome?: number;
}

export default function MyDayPage() {
  const [items, setItems] = useState<OperatorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingItemId, setActingItemId] = useState<string | null>(null);
  const [completingItemId, setCompletingItemId] = useState<string | null>(null);
  const [actualOutcome, setActualOutcome] = useState<string>('');
  const [pageVisitId, setPageVisitId] = useState<string>('');
  const [actionCountLocal, setActionCountLocal] = useState(0);
  const [errorCountLocal, setErrorCountLocal] = useState(0);

  const fetchMyDay = async () => {
    try {
      setLoading(true);
      setError(null);
      setActionCountLocal(0);
      setErrorCountLocal(0);

      const response = await fetch('/api/operator/myday');
      const data = (await response.json()) as MyDayResponse | MyDayError;

      if (!response.ok) {
        const errorData = data as MyDayError;
        setError(errorData.error || 'Failed to fetch My Day items');
        setItems([]);
        return;
      }

      const myDayData = data as MyDayResponse;
      setItems(myDayData.items);
    } catch (err) {
      const ctx: ErrorGovernanceContext = { context: 'load' };
      const govErr = classifyOperatorError(err, ctx);
      setError(govErr.operatorMessage);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const trackPageVisit = async () => {
      try {
        const res = await fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'pageVisit',
            payload: {
              actorId: 'operator-unknown',
              workspaceId: 'workspace-unknown',
              page: '/my-day',
            },
          }),
        });
        const data = await res.json();
        setPageVisitId(data.visitId);
      } catch (err) {
        console.error('Failed to track page visit:', err);
      }
    };

    trackPageVisit();
    fetchMyDay();

    // Track page exit on unmount
    return () => {
      if (pageVisitId) {
        fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'pageExit',
            payload: {
              actorId: 'operator-unknown',
              workspaceId: 'workspace-unknown',
              page: '/my-day',
              visitId: pageVisitId,
              actionCount: actionCountLocal,
              errorCount: errorCountLocal,
            },
          }),
        }).catch((err) => console.error('Failed to track page exit:', err));
      }
    };
  }, []);

  const handleAction = async (
    itemId: string,
    status: 'in_progress' | 'done' | 'failed',
    outcome?: number
  ) => {
    try {
      setActingItemId(itemId);
      setError(null);
      setActionCountLocal((prev) => prev + 1);

      const payload: ActionRequest = {
        id: itemId,
        status,
      };

      if (status === 'done' && outcome !== undefined) {
        payload.actualOutcome = outcome;
      }

      const response = await fetch('/api/operator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMsg = errorData.error || `Failed to update item status to ${status}`;
        setError(errorMsg);
        setErrorCountLocal((prev) => prev + 1);
        await fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'trackAction',
            payload: {
              actorId: 'operator-unknown',
              workspaceId: 'workspace-unknown',
              actionType: `action_${status}`,
              result: 'failure',
              page: '/my-day',
              errorMessage: errorMsg,
            },
          }),
        });
        return;
      }

      // Track successful action
      await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'trackAction',
          payload: {
            actorId: 'operator-unknown',
            workspaceId: 'workspace-unknown',
            actionType: `action_${status}`,
            result: 'success',
            page: '/my-day',
          },
        }),
      });

      // Reset completion form
      setCompletingItemId(null);
      setActualOutcome('');

      // Refresh queue
      await fetchMyDay();
    } catch (err) {
      const ctx: ErrorGovernanceContext = { context: 'save' };
      const govErr = classifyOperatorError(err, ctx);
      setError(govErr.operatorMessage);
      setErrorCountLocal((prev) => prev + 1);
      await operatorTelemetry.trackAction({
        actorId: 'operator-unknown',
        workspaceId: 'workspace-unknown',
        actionType: `action_${status}`,
        result: 'failure',
        page: '/my-day',
        errorMessage: govErr.operatorMessage,
      });
    } finally {
      setActingItemId(null);
    }
  };

  const startItem = (itemId: string) => {
    handleAction(itemId, 'in_progress');
  };

  const completeItem = (itemId: string, outcome: number) => {
    handleAction(itemId, 'done', outcome);
  };

  const failItem = (itemId: string) => {
    handleAction(itemId, 'failed');
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-8">
      <div className="w-full max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            My Day
          </h1>
          <p className="mt-2 text-xs md:text-sm text-muted-foreground">
            {loading
              ? 'Loading your top items...'
              : `${items.length} high-priority item${items.length !== 1 ? 's' : ''}`}
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
              No high-priority items for today
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Check back later or view the full queue.
            </p>
          </div>
        )}

        {/* My Day Items */}
        {!loading && items.length > 0 && (
          <div className="space-y-3 md:space-y-4">
            {items.map((item, index) => (
              <div
                key={item.id}
                className={`rounded-lg border p-3 md:p-4 transition-colors ${
                  item.status === 'in_progress'
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card'
                }`}
              >
                {/* Priority Badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {index < 3 && (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-primary/20 text-xs font-semibold text-primary">
                          Top {index + 1}
                        </span>
                      )}
                      <span
                        className={`text-xs font-semibold uppercase ${
                          item.status === 'in_progress'
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {item.status === 'in_progress' ? 'Started' : 'Ready'}
                      </span>
                    </div>
                    <h3 className="text-sm md:text-base font-semibold text-foreground break-words">
                      {item.problem}
                    </h3>
                  </div>
                </div>

                {/* Action */}
                <p className="text-xs md:text-sm text-muted-foreground mb-3 break-words leading-relaxed">
                  {item.action}
                </p>

                {/* Quick Metrics */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="rounded bg-muted p-2">
                    <p className="text-xs text-muted-foreground mb-1">
                      Impact
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      ${item.impactExpected.toFixed(0)}
                    </p>
                  </div>
                  <div className="rounded bg-muted p-2">
                    <p className="text-xs text-muted-foreground mb-1">
                      Confidence
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {(item.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="rounded bg-muted p-2">
                    <p className="text-xs text-muted-foreground mb-1">
                      Due
                    </p>
                    <p className="text-xs font-semibold text-foreground">
                      {item.dueAt
                        ? new Date(item.dueAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                {item.status === 'pending' && (
                  <button
                    onClick={() => startItem(item.id)}
                    disabled={actingItemId === item.id}
                    className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                  >
                    {actingItemId === item.id ? 'Starting...' : 'Start'}
                  </button>
                )}

                {item.status === 'in_progress' && (
                  <div className="space-y-2">
                    {/* Complete Form */}
                    {completingItemId === item.id ? (
                      <div className="space-y-2 p-3 rounded-lg bg-muted/50 border border-border">
                        <label
                          htmlFor={`outcome-${item.id}`}
                          className="block text-xs font-medium text-foreground"
                        >
                          Actual Impact
                        </label>
                        <input
                          id={`outcome-${item.id}`}
                          type="number"
                          value={actualOutcome}
                          onChange={(e) => setActualOutcome(e.target.value)}
                          placeholder={`e.g., ${item.impactExpected.toFixed(0)}`}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                          disabled={actingItemId === item.id}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              completeItem(
                                item.id,
                                parseFloat(actualOutcome) || item.impactExpected
                              )
                            }
                            disabled={
                              !actualOutcome || actingItemId === item.id
                            }
                            className="flex-1 rounded-lg bg-success px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                          >
                            {actingItemId === item.id ? 'Saving...' : 'Done'}
                          </button>
                          <button
                            onClick={() => {
                              setCompletingItemId(null);
                              setActualOutcome('');
                            }}
                            disabled={actingItemId === item.id}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCompletingItemId(item.id)}
                          disabled={actingItemId === item.id}
                          className="flex-1 rounded-lg bg-success px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => failItem(item.id)}
                          disabled={actingItemId === item.id}
                          className="flex-1 rounded-lg border border-destructive bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        >
                          {actingItemId === item.id ? 'Updating...' : 'Fail'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Info Footer */}
        {!loading && items.length > 0 && (
          <div className="mt-6 md:mt-8 rounded-lg border border-border bg-muted p-3 md:p-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium">Tip:</span> Items are prioritized by
              impact and urgency. Complete or fail items to update your queue.
            </p>
          </div>
        )}

        {/* Feedback Section */}
        <div className="mt-6 md:mt-8 rounded-lg border border-border bg-background p-3 md:p-4">
          <p className="text-xs font-medium text-foreground mb-3">Help us improve</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={async () => {
                await fetch('/api/feedback', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    feedbackType: 'confusing',
                    actorId: 'operator-unknown',
                    workspaceId: 'workspace-unknown',
                    page: '/my-day',
                    context: 'Queue interface or workflow unclear',
                  }),
                });
                alert('Thank you for the feedback');
              }}
              className="px-3 py-1.5 rounded text-xs border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"
            >
              Confusing
            </button>
            <button
              onClick={async () => {
                await fetch('/api/feedback', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    feedbackType: 'not_sure',
                    actorId: 'operator-unknown',
                    workspaceId: 'workspace-unknown',
                    page: '/my-day',
                    context: 'Not clear what to do next',
                  }),
                });
                alert('Thank you for the feedback');
              }}
              className="px-3 py-1.5 rounded text-xs border border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
            >
              Not Sure
            </button>
            <button
              onClick={async () => {
                await fetch('/api/feedback', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    feedbackType: 'need_help',
                    actorId: 'operator-unknown',
                    workspaceId: 'workspace-unknown',
                    page: '/my-day',
                    context: 'Need guidance or help',
                  }),
                });
                alert('Support team notified');
              }}
              className="px-3 py-1.5 rounded text-xs border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
            >
              Need Help
            </button>
            <button
              onClick={async () => {
                await fetch('/api/feedback', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    feedbackType: 'unexpected',
                    actorId: 'operator-unknown',
                    workspaceId: 'workspace-unknown',
                    page: '/my-day',
                    context: 'Result or behavior was unexpected',
                  }),
                });
                alert('Thank you for the feedback');
              }}
              className="px-3 py-1.5 rounded text-xs border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
            >
              Unexpected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
