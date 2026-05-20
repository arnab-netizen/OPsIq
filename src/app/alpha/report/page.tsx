'use client';

import { useState, useEffect } from 'react';
import { toOperatorSafeError } from "@/lib/operator-safe-errors";

interface AlphaDailySummary {
  date: string;
  reportGeneratedAt: string;
  operators: {
    active: number;
    totalSessionTime: number;
    stats: Array<{
      actorId: string;
      actorName: string;
      sessionTimeSeconds: number;
      pagesVisited: number;
      actionsCompleted: number;
      actionsInitiated: number;
      errorsEncountered: number;
    }>;
  };
  workflows: {
    completionRate: number;
    stats: Array<{
      workflow: string;
      completions: number;
      initiations: number;
      completionRate: number;
    }>;
  };
  support: {
    totalIncidents: number;
  };
  errors: {
    totalEncountered: number;
    topErrors: Array<{
      message: string;
      count: number;
      pages: string[];
    }>;
  };
  feedback: {
    totalSubmitted: number;
    hotspots: Array<{
      page: string;
      feedbackCount: number;
      topFeedbackTypes: string[];
    }>;
  };
  recommendations: string[];
}

export default function AlphaReportPage() {
  const [report, setReport] = useState<AlphaDailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generateReport = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/alpha/report?workspaceId=alpha-workspace-01');

      if (!response.ok) {
        throw new Error('Failed to fetch report');
      }

      const dailyReport = await response.json();
      setReport(dailyReport);
    } catch (err) {
      setError(toOperatorSafeError(err, "load").error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateReport();
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Alpha Daily Report</h1>
          <p className="text-muted-foreground">
            Real-time operator activity and engagement metrics
          </p>
        </div>

        {loading && (
          <div className="rounded-lg border border-border bg-muted p-6">
            <p className="text-foreground">Generating report...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/5 p-4 mb-6">
            <p className="text-destructive">{error}</p>
            <button
              onClick={generateReport}
              className="mt-2 px-4 py-2 rounded bg-primary text-primary-foreground text-sm"
            >
              Retry
            </button>
          </div>
        )}

        {report && (
          <div className="space-y-6">
            {/* Date & Summary */}
            <div className="rounded-lg border border-border bg-card p-6">
              <p className="text-sm text-muted-foreground">Report Date</p>
              <p className="text-lg font-semibold text-foreground">{report.date}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Generated: {new Date(report.reportGeneratedAt).toLocaleTimeString()}
              </p>
            </div>

            {/* Operators */}
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Active Operators</h2>
              <p className="text-3xl font-bold text-primary mb-4">{report.operators.active}</p>
              <p className="text-sm text-muted-foreground">
                Total Session Time: {(report.operators.totalSessionTime / 3600).toFixed(1)} hours
              </p>

              <div className="mt-4 space-y-3">
                {report.operators.stats.map((op) => (
                  <div key={op.actorId} className="border-t border-border pt-3">
                    <p className="font-medium text-foreground">{op.actorName}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-2">
                      <p>Session: {(op.sessionTimeSeconds / 60).toFixed(0)}m</p>
                      <p>Pages: {op.pagesVisited}</p>
                      <p>Actions: {op.actionsCompleted}/{op.actionsInitiated}</p>
                      <p>Errors: {op.errorsEncountered}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Workflows */}
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Workflows</h2>
              <p className="text-3xl font-bold text-primary mb-2">{report.workflows.completionRate.toFixed(1)}%</p>
              <p className="text-sm text-muted-foreground">Average completion rate</p>

              {report.workflows.stats.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {report.workflows.stats.map((workflow) => (
                    <div key={workflow.workflow} className="p-2 rounded bg-muted">
                      <p className="font-medium text-foreground text-sm">{workflow.workflow}</p>
                      <p className="text-xs text-muted-foreground">
                        {workflow.completions}/{workflow.initiations} completed (
                        {(workflow.completionRate * 100).toFixed(0)}%)
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-4">No workflow data</p>
              )}
            </div>

            {/* Support */}
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Support</h2>
              <p className="text-3xl font-bold text-orange-600 mb-2">
                {report.support.totalIncidents}
              </p>
              <p className="text-sm text-muted-foreground">Support incidents today</p>
            </div>

            {/* Errors */}
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Top Errors</h2>
              <p className="text-3xl font-bold text-red-600 mb-2">
                {report.errors.totalEncountered}
              </p>
              <p className="text-sm text-muted-foreground">Errors encountered</p>

              {report.errors.topErrors.length > 0 && (
                <div className="mt-4 space-y-2">
                  {report.errors.topErrors.slice(0, 3).map((err, idx) => (
                    <div key={idx} className="p-2 rounded bg-muted">
                      <p className="font-medium text-foreground text-sm">{err.message}</p>
                      <p className="text-xs text-muted-foreground">
                        Occurred {err.count} times on {err.pages.join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Feedback Hotspots */}
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Confusion Hotspots</h2>
              <p className="text-3xl font-bold text-yellow-600 mb-2">
                {report.feedback.totalSubmitted}
              </p>
              <p className="text-sm text-muted-foreground">Feedback items submitted</p>

              {report.feedback.hotspots.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {report.feedback.hotspots.map((hotspot) => (
                    <div key={hotspot.page} className="border-l-4 border-yellow-500 pl-3 py-2">
                      <p className="font-medium text-foreground">{hotspot.page}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {hotspot.feedbackCount} feedback items:
                        {hotspot.topFeedbackTypes.join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-4">No hotspots detected</p>
              )}
            </div>

            {/* Recommendations */}
            {report.recommendations.length > 0 && (
              <div className="rounded-lg border border-blue-300 bg-blue-50 p-6">
                <h2 className="text-lg font-semibold text-blue-900 mb-4">Recommendations</h2>
                <ul className="space-y-2">
                  {report.recommendations.map((rec, idx) => (
                    <li key={idx} className="text-sm text-blue-800 flex gap-2">
                      <span>•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Refresh Button */}
            <button
              onClick={generateReport}
              className="w-full px-4 py-2 rounded bg-primary text-primary-foreground font-medium"
            >
              Refresh Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
