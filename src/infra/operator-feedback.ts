/**
 * Operator Feedback Capture Infrastructure
 *
 * Lightweight inline feedback for operators during alpha:
 * - "Confusing" — something doesn't make sense
 * - "Not Sure" — unclear what to do next
 * - "Need Help" — explicit request for guidance
 * - "Unexpected" — result differs from expectation
 *
 * Stored in database for daily review and UX improvement.
 */

import { db } from '@/lib/db';

export type FeedbackType = 'confusing' | 'not_sure' | 'need_help' | 'unexpected';

export interface OperatorFeedbackParams {
  feedbackType: FeedbackType;
  actorId: string;
  workspaceId: string;
  page: string;
  context?: string;
  formField?: string;
  actionAttempted?: string;
  expectedOutcome?: string;
  actualOutcome?: string;
}

export interface FeedbackSummary {
  type: FeedbackType;
  count: number;
  pages: string[];
  contexts: string[];
  examples: OperatorFeedbackParams[];
}

/**
 * Operator Feedback Service
 *
 * Usage in components:
 * ```typescript
 * import { operatorFeedback } from '@/infra/operator-feedback';
 *
 * // In a button callback:
 * const handleConfusing = () => {
 *   operatorFeedback.capture({
 *     feedbackType: 'confusing',
 *     actorId: userId,
 *     workspaceId,
 *     page: '/my-day',
 *     context: 'Form layout unclear'
 *   });
 * };
 * ```
 */
class OperatorFeedbackService {
  /**
   * Capture feedback from operator
   */
  async capture(params: OperatorFeedbackParams): Promise<void> {
    const timestamp = new Date();
    const id = `feedback-${params.actorId}-${timestamp.getTime()}`;

    try {
      await db.auditEvent.create({
        data: {
          id,
          eventName: `operator_feedback_${params.feedbackType}`,
          actorId: params.actorId,
          workspaceId: params.workspaceId,
          payload: {
            feedbackType: params.feedbackType,
            page: params.page,
            context: params.context,
            formField: params.formField,
            actionAttempted: params.actionAttempted,
            expectedOutcome: params.expectedOutcome,
            actualOutcome: params.actualOutcome,
          },
          occurredAt: timestamp,
        },
      });

      console.log('[OPERATOR_FEEDBACK]', {
        type: params.feedbackType,
        page: params.page,
        context: params.context,
      });
    } catch (err) {
      console.error('Failed to record operator feedback:', err);
    }
  }

  /**
   * Get feedback summary for a time period
   */
  async getSummary(params: {
    workspaceId: string;
    since?: Date;
  }): Promise<FeedbackSummary[]> {
    const since = params.since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24 hours

    const feedbackEvents = await db.auditEvent.findMany({
      where: {
        workspaceId: params.workspaceId,
        eventName: {
          in: [
            'operator_feedback_confusing',
            'operator_feedback_not_sure',
            'operator_feedback_need_help',
            'operator_feedback_unexpected',
          ],
        },
        occurredAt: {
          gte: since,
        },
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });

    const summaryMap = new Map<FeedbackType, FeedbackSummary>();

    const types: FeedbackType[] = ['confusing', 'not_sure', 'need_help', 'unexpected'];
    for (const type of types) {
      summaryMap.set(type, {
        type,
        count: 0,
        pages: [],
        contexts: [],
        examples: [],
      });
    }

    for (const event of feedbackEvents) {
      const payload = event.payload as OperatorFeedbackParams;
      const type = payload.feedbackType;

      const summary = summaryMap.get(type);
      if (!summary) continue;

      summary.count++;

      if (!summary.pages.includes(payload.page)) {
        summary.pages.push(payload.page);
      }

      if (payload.context && !summary.contexts.includes(payload.context)) {
        summary.contexts.push(payload.context);
      }

      if (summary.examples.length < 3) {
        summary.examples.push(payload);
      }
    }

    return Array.from(summaryMap.values()).filter((s) => s.count > 0);
  }

  /**
   * Get hotspots (pages with high feedback volume)
   */
  async getHotspots(params: {
    workspaceId: string;
    since?: Date;
    threshold?: number;
  }): Promise<Array<{ page: string; feedbackCount: number; types: FeedbackType[] }>> {
    const since = params.since || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const threshold = params.threshold || 3; // At least 3 feedback items

    const feedbackEvents = await db.auditEvent.findMany({
      where: {
        workspaceId: params.workspaceId,
        eventName: {
          in: [
            'operator_feedback_confusing',
            'operator_feedback_not_sure',
            'operator_feedback_need_help',
            'operator_feedback_unexpected',
          ],
        },
        occurredAt: {
          gte: since,
        },
      },
    });

    const pageMap = new Map<string, { count: number; types: Set<FeedbackType> }>();

    for (const event of feedbackEvents) {
      const payload = event.payload as OperatorFeedbackParams;
      const page = payload.page;
      const type = payload.feedbackType;

      if (!pageMap.has(page)) {
        pageMap.set(page, { count: 0, types: new Set() });
      }

      const entry = pageMap.get(page)!;
      entry.count++;
      entry.types.add(type);
    }

    return Array.from(pageMap.entries())
      .filter(([_, v]) => v.count >= threshold)
      .map(([page, v]) => ({
        page,
        feedbackCount: v.count,
        types: Array.from(v.types),
      }))
      .sort((a, b) => b.feedbackCount - a.feedbackCount);
  }
}

export const operatorFeedback = new OperatorFeedbackService();
