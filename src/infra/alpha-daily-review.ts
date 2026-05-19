/**
 * Alpha Daily Review Pipeline
 *
 * Generates daily summary of operator activity during internal alpha:
 * - Active operators and session time
 * - Actions completed and workflows progressed
 * - Errors encountered and resolution rates
 * - Operator feedback and hotspots
 * - Support requests and escalations
 *
 * Output: JSON report for easy consumption by admin dashboard.
 */

import { db } from '@/lib/db';

export interface OperatorDayStats {
  actorId: string;
  actorName: string;
  sessionTimeSeconds: number;
  pagesVisited: number;
  actionsInitiated: number;
  actionsCompleted: number;
  actionsFailed: number;
  errorsEncountered: number;
  feedbackSubmitted: number;
  supportRequests: number;
}

export interface WorkflowStats {
  workflow: string;
  initiations: number;
  completions: number;
  completionRate: number;
  averageDurationSeconds: number;
  mostCommonErrors: string[];
}

export interface ConfusionHotspot {
  page: string;
  feedbackCount: number;
  topFeedbackTypes: string[];
  mostCitedContexts: string[];
}

export interface AlphaDailySummary {
  date: string;
  reportGeneratedAt: string;
  period: {
    startTime: string;
    endTime: string;
  };
  operators: {
    active: number;
    totalSessionTime: number;
    stats: OperatorDayStats[];
  };
  workflows: {
    total: number;
    completionRate: number;
    stats: WorkflowStats[];
  };
  support: {
    totalIncidents: number;
    byType: Record<string, number>;
    avgResolutionTime: number;
  };
  errors: {
    totalEncountered: number;
    topErrors: Array<{ message: string; count: number; pages: string[] }>;
  };
  feedback: {
    totalSubmitted: number;
    byType: Record<string, number>;
    hotspots: ConfusionHotspot[];
  };
  recommendations: string[];
}

/**
 * Alpha Daily Review Service
 *
 * Usage:
 * ```typescript
 * import { alphaDailyReview } from '@/infra/alpha-daily-review';
 *
 * const report = await alphaDailyReview.generateReport({
 *   workspaceId: 'alpha-workspace-01',
 *   date: new Date('2026-05-19')
 * });
 * ```
 */
class AlphaDailyReviewService {
  /**
   * Generate daily alpha review report
   */
  async generateReport(params: {
    workspaceId: string;
    date?: Date;
  }): Promise<AlphaDailySummary> {
    const date = params.date || new Date();
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const [operatorStats, workflowStats, supportStats, errorStats, feedbackStats] =
      await Promise.all([
        this.getOperatorStats(params.workspaceId, dayStart, dayEnd),
        this.getWorkflowStats(params.workspaceId, dayStart, dayEnd),
        this.getSupportStats(params.workspaceId, dayStart, dayEnd),
        this.getErrorStats(params.workspaceId, dayStart, dayEnd),
        this.getFeedbackStats(params.workspaceId, dayStart, dayEnd),
      ]);

    const recommendations = this.generateRecommendations({
      operatorStats,
      errorStats,
      feedbackStats,
    });

    return {
      date: date.toISOString().split('T')[0],
      reportGeneratedAt: new Date().toISOString(),
      period: {
        startTime: dayStart.toISOString(),
        endTime: dayEnd.toISOString(),
      },
      operators: {
        active: operatorStats.length,
        totalSessionTime: operatorStats.reduce((sum, op) => sum + op.sessionTimeSeconds, 0),
        stats: operatorStats,
      },
      workflows: {
        total: workflowStats.length,
        completionRate:
          workflowStats.length > 0
            ? Math.round(
                (workflowStats.reduce((sum, w) => sum + w.completionRate, 0) /
                  workflowStats.length) *
                  100
              ) / 100
            : 0,
        stats: workflowStats.slice(0, 5), // Top 5 workflows
      },
      support: supportStats,
      errors: errorStats,
      feedback: feedbackStats,
      recommendations,
    };
  }

  /**
   * Get per-operator stats for the day
   */
  private async getOperatorStats(
    workspaceId: string,
    dayStart: Date,
    dayEnd: Date
  ): Promise<OperatorDayStats[]> {
    const events = await db.auditEvent.findMany({
      where: {
        workspaceId,
        actorId: { not: null },
        occurredAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    const operatorMap = new Map<string, OperatorDayStats>();

    // Get all unique operators
    // @ts-ignore - events are strongly typed by prisma findMany result
    const uniqueActorIds = Array.from(
      new Set(events.map((e: any) => e.actorId).filter(Boolean))
    ) as string[];
    const users = await db.user.findMany({
      where: {
        id: {
          in: uniqueActorIds,
        },
      },
    });

    for (const user of users) {
      operatorMap.set(user.id, {
        actorId: user.id,
        actorName: user.email?.split('@')[0] || user.id,
        sessionTimeSeconds: 0,
        pagesVisited: 0,
        actionsInitiated: 0,
        actionsCompleted: 0,
        actionsFailed: 0,
        errorsEncountered: 0,
        feedbackSubmitted: 0,
        supportRequests: 0,
      });
    }

    // Aggregate events
    for (const event of events) {
      if (!event.actorId) continue;

      const stat = operatorMap.get(event.actorId);
      if (!stat) continue;

      if (event.eventName === 'operator_page_exit') {
        const payload = event.payload as { durationSeconds?: number };
        if (payload.durationSeconds) {
          stat.sessionTimeSeconds += payload.durationSeconds;
        }
        stat.pagesVisited++;
      } else if (event.eventName === 'operator_action_success') {
        stat.actionsCompleted++;
      } else if (event.eventName === 'operator_action_failed') {
        stat.actionsFailed++;
      } else if (event.eventName === 'operator_error_displayed') {
        stat.errorsEncountered++;
      } else if (event.eventName.startsWith('operator_feedback_')) {
        stat.feedbackSubmitted++;
      } else if (event.eventName === 'operator_support_requested') {
        stat.supportRequests++;
      }
    }

    return Array.from(operatorMap.values()).sort(
      (a, b) => b.sessionTimeSeconds - a.sessionTimeSeconds
    );
  }

  /**
   * Get workflow completion stats
   */
  private async getWorkflowStats(
    workspaceId: string,
    dayStart: Date,
    dayEnd: Date
  ): Promise<WorkflowStats[]> {
    // Map action types to workflow names
    const workflowMap = new Map<
      string,
      { initiations: number; completions: number; durations: number[]; errors: string[] }
    >();

    const events = await db.auditEvent.findMany({
      where: {
        workspaceId,
        eventName: {
          in: ['operator_action_success', 'operator_action_failed', 'operator_action_retried'],
        },
        occurredAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    for (const event of events) {
      const payload = event.payload as { actionType?: string; errorMessage?: string };
      const workflow = payload.actionType || 'unknown';

      if (!workflowMap.has(workflow)) {
        workflowMap.set(workflow, {
          initiations: 0,
          completions: 0,
          durations: [],
          errors: [],
        });
      }

      const stats = workflowMap.get(workflow)!;
      stats.initiations++;

      if (event.eventName === 'operator_action_success') {
        stats.completions++;
      }

      if (payload.errorMessage) {
        stats.errors.push(payload.errorMessage);
      }
    }

    return Array.from(workflowMap.entries()).map(([workflow, stats]) => ({
      workflow,
      initiations: stats.initiations,
      completions: stats.completions,
      completionRate: stats.initiations > 0 ? stats.completions / stats.initiations : 0,
      averageDurationSeconds: stats.durations.length
        ? Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length)
        : 0,
      mostCommonErrors: stats.errors.slice(0, 3),
    }));
  }

  /**
   * Get support/feedback stats
   */
  private async getSupportStats(
    workspaceId: string,
    dayStart: Date,
    dayEnd: Date
  ): Promise<{ totalIncidents: number; byType: Record<string, number>; avgResolutionTime: number }> {
    const events = await db.auditEvent.findMany({
      where: {
        workspaceId,
        eventName: 'operator_support_requested',
        occurredAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    const byType: Record<string, number> = {};
    for (const event of events) {
      const payload = event.payload as { requestType?: string };
      const type = payload.requestType || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    }

    return {
      totalIncidents: events.length,
      byType,
      avgResolutionTime: 0, // Would need resolution timestamps
    };
  }

  /**
   * Get error stats
   */
  private async getErrorStats(
    workspaceId: string,
    dayStart: Date,
    dayEnd: Date
  ): Promise<{ totalEncountered: number; topErrors: Array<{ message: string; count: number; pages: string[] }> }> {
    const events = await db.auditEvent.findMany({
      where: {
        workspaceId,
        eventName: 'operator_error_displayed',
        occurredAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    const errorMap = new Map<string, { count: number; pages: Set<string> }>();

    for (const event of events) {
      const payload = event.payload as { errorMessage?: string; page?: string };
      const error = payload.errorMessage || 'Unknown error';
      const page = payload.page || 'unknown';

      if (!errorMap.has(error)) {
        errorMap.set(error, { count: 0, pages: new Set() });
      }

      const entry = errorMap.get(error)!;
      entry.count++;
      entry.pages.add(page);
    }

    const topErrors = Array.from(errorMap.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 5)
      .map(([message, { count, pages }]) => ({
        message,
        count,
        pages: Array.from(pages),
      }));

    return {
      totalEncountered: events.length,
      topErrors,
    };
  }

  /**
   * Get operator feedback stats
   */
  private async getFeedbackStats(
    workspaceId: string,
    dayStart: Date,
    dayEnd: Date
  ): Promise<{ totalSubmitted: number; byType: Record<string, number>; hotspots: ConfusionHotspot[] }> {
    const events = await db.auditEvent.findMany({
      where: {
        workspaceId,
        eventName: {
          in: [
            'operator_feedback_confusing',
            'operator_feedback_not_sure',
            'operator_feedback_need_help',
            'operator_feedback_unexpected',
          ],
        },
        occurredAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    const byType: Record<string, number> = {};
    const pageMap = new Map<string, { count: number; types: Set<string> }>();

    for (const event of events) {
      const type = event.eventName.replace('operator_feedback_', '');
      byType[type] = (byType[type] || 0) + 1;

      const payload = event.payload as { page?: string };
      const page = payload.page || 'unknown';

      if (!pageMap.has(page)) {
        pageMap.set(page, { count: 0, types: new Set() });
      }

      const entry = pageMap.get(page)!;
      entry.count++;
      entry.types.add(type);
    }

    const hotspots: ConfusionHotspot[] = Array.from(pageMap.entries())
      .map(([page, { count, types }]) => ({
        page,
        feedbackCount: count,
        topFeedbackTypes: Array.from(types),
        mostCitedContexts: [],
      }))
      .sort((a, b) => b.feedbackCount - a.feedbackCount)
      .slice(0, 5);

    return {
      totalSubmitted: events.length,
      byType,
      hotspots,
    };
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(params: {
    operatorStats: OperatorDayStats[];
    errorStats: Record<string, unknown>;
    feedbackStats: Record<string, unknown>;
  }): string[] {
    const recommendations: string[] = [];

    // Check operator engagement
    if (params.operatorStats.length === 0) {
      recommendations.push('No operator activity detected. Check if seed data is loaded.');
    }

    // Check for high error rates
    const errorStats = params.errorStats as { totalEncountered?: number };
    const totalOperatorActions = params.operatorStats.reduce(
      (sum, op) => sum + (op.actionsInitiated || 0),
      0
    );
    if (totalOperatorActions > 0 && (errorStats.totalEncountered || 0) > totalOperatorActions * 0.2) {
      recommendations.push(
        'High error rate detected (>20%). Review error governance and recovery paths.'
      );
    }

    // Check for abandonment
    const abandonmentRate = params.operatorStats
      .filter((op) => op.sessionTimeSeconds < 60)
      .length;
    if (abandonmentRate > params.operatorStats.length * 0.3) {
      recommendations.push(
        'High abandonment rate detected. Check onboarding flow and initial setup.'
      );
    }

    // Check feedback hotspots
    const feedbackStats = params.feedbackStats as {
      totalSubmitted?: number;
      hotspots?: ConfusionHotspot[];
    };
    if ((feedbackStats.hotspots || []).length > 0) {
      const topHotspot = feedbackStats.hotspots?.[0];
      recommendations.push(
        `Review ${topHotspot?.page} for UX improvements (${topHotspot?.feedbackCount} feedback items).`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Alpha execution proceeding normally. Continue monitoring.');
    }

    return recommendations;
  }

  /**
   * Save report to file
   */
  async saveReport(report: AlphaDailySummary, filePath: string): Promise<void> {
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, JSON.stringify(report, null, 2));
  }
}

export const alphaDailyReview = new AlphaDailyReviewService();
