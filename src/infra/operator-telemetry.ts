/**
 * Operator Telemetry Infrastructure
 *
 * Captures real operator behavior during internal alpha:
 * - page visits and dwell time
 * - action initiation and completion
 * - errors encountered and recovery patterns
 * - support requests and confusion events
 * - repeated clicks (sign of confusion)
 * - form abandonment
 *
 * Stores in database for daily review and analysis.
 */

import { db } from '@/lib/db';

export interface TelemetryEvent {
  eventType:
    | 'page_visit'
    | 'page_exit'
    | 'action_initiated'
    | 'action_completed'
    | 'action_failed'
    | 'action_retried'
    | 'error_displayed'
    | 'support_requested'
    | 'form_abandoned'
    | 'button_clicked'
    | 'repeated_click';
  actorId: string;
  workspaceId: string;
  page: string;
  context?: Record<string, unknown>;
  duration?: number;
  timestamp: Date;
}

export interface PageVisitEvent {
  actorId: string;
  workspaceId: string;
  page: string;
  enteredAt: Date;
  exitedAt?: Date;
  durationSeconds?: number;
  actionCount?: number;
  errorCount?: number;
}

export interface ActionEvent {
  actorId: string;
  workspaceId: string;
  actionType: string;
  result: 'success' | 'failure' | 'retry';
  page: string;
  errorMessage?: string;
  attemptNumber: number;
  timestamp: Date;
}

export interface SupportEvent {
  actorId: string;
  workspaceId: string;
  requestType: 'need_help' | 'not_sure' | 'confused' | 'unexpected';
  page: string;
  context?: string;
  resolved: boolean;
  resolvedAt?: Date;
  timestamp: Date;
}

/**
 * Operator Telemetry Service
 *
 * Usage in components:
 * ```typescript
 * import { operatorTelemetry } from '@/infra/operator-telemetry';
 *
 * // Track page visit
 * const pageId = operatorTelemetry.trackPageVisit({
 *   actorId: userId,
 *   workspaceId,
 *   page: '/my-day'
 * });
 *
 * // Track action
 * operatorTelemetry.trackAction({
 *   actorId: userId,
 *   workspaceId,
 *   actionType: 'decision_created',
 *   result: 'success',
 *   page: '/decision'
 * });
 *
 * // Track error
 * operatorTelemetry.trackError({
 *   actorId: userId,
 *   workspaceId,
 *   page: '/my-day',
 *   errorMessage: 'Network error'
 * });
 * ```
 */
class OperatorTelemetryService {
  private pageVisitStack: Map<string, { enteredAt: Date; page: string }> = new Map();

  /**
   * Track page visit
   * Call when operator navigates to a page
   */
  trackPageVisit(params: {
    actorId: string;
    workspaceId: string;
    page: string;
  }): string {
    const visitId = `${params.actorId}-${params.page}-${Date.now()}`;
    this.pageVisitStack.set(visitId, {
      enteredAt: new Date(),
      page: params.page,
    });

    this.recordEvent({
      eventType: 'page_visit',
      actorId: params.actorId,
      workspaceId: params.workspaceId,
      page: params.page,
      timestamp: new Date(),
    });

    return visitId;
  }

  /**
   * Track page exit with duration
   * Call when operator leaves a page
   */
  async trackPageExit(params: {
    actorId: string;
    workspaceId: string;
    page: string;
    visitId?: string;
    actionCount?: number;
    errorCount?: number;
  }): Promise<void> {
    const exitTime = new Date();
    const visitId = params.visitId || `${params.actorId}-${params.page}`;
    const visit = this.pageVisitStack.get(visitId);

    const durationSeconds = visit
      ? Math.floor((exitTime.getTime() - visit.enteredAt.getTime()) / 1000)
      : undefined;

    this.pageVisitStack.delete(visitId);

    // Store in database
    try {
      await db.auditEvent.create({
        data: {
          id: `${Date.now()}-page-exit`,
          eventName: 'operator_page_exit',
          actorId: params.actorId,
          workspaceId: params.workspaceId,
          payload: {
            page: params.page,
            durationSeconds,
            actionCount: params.actionCount,
            errorCount: params.errorCount,
          },
          occurredAt: exitTime,
        },
      });
    } catch (err) {
      console.error('Failed to record page exit:', err);
    }

    this.recordEvent({
      eventType: 'page_exit',
      actorId: params.actorId,
      workspaceId: params.workspaceId,
      page: params.page,
      duration: durationSeconds,
      timestamp: exitTime,
    });
  }

  /**
   * Track action initiation or completion
   */
  async trackAction(params: {
    actorId: string;
    workspaceId: string;
    actionType: string;
    result: 'success' | 'failure' | 'retry';
    page: string;
    errorMessage?: string;
    attemptNumber?: number;
  }): Promise<void> {
    const timestamp = new Date();
    const attemptNumber = params.attemptNumber || 1;

    this.recordEvent({
      eventType:
        params.result === 'success'
          ? 'action_completed'
          : params.result === 'retry'
            ? 'action_retried'
            : 'action_failed',
      actorId: params.actorId,
      workspaceId: params.workspaceId,
      page: params.page,
      context: {
        actionType: params.actionType,
        errorMessage: params.errorMessage,
        attemptNumber,
      },
      timestamp,
    });

    // Store in database
    try {
      await db.auditEvent.create({
        data: {
          id: `${timestamp.getTime()}-action-${params.actionType}`,
          eventName: `operator_action_${params.result}`,
          actorId: params.actorId,
          workspaceId: params.workspaceId,
          payload: {
            actionType: params.actionType,
            page: params.page,
            errorMessage: params.errorMessage,
            attemptNumber,
          },
          occurredAt: timestamp,
        },
      });
    } catch (err) {
      console.error('Failed to record action:', err);
    }
  }

  /**
   * Track error display to operator
   */
  async trackError(params: {
    actorId: string;
    workspaceId: string;
    page: string;
    errorMessage: string;
    errorContext?: string;
  }): Promise<void> {
    const timestamp = new Date();

    this.recordEvent({
      eventType: 'error_displayed',
      actorId: params.actorId,
      workspaceId: params.workspaceId,
      page: params.page,
      context: {
        errorMessage: params.errorMessage,
        errorContext: params.errorContext,
      },
      timestamp,
    });

    try {
      await db.auditEvent.create({
        data: {
          id: `${timestamp.getTime()}-error`,
          eventName: 'operator_error_displayed',
          actorId: params.actorId,
          workspaceId: params.workspaceId,
          payload: {
            page: params.page,
            errorMessage: params.errorMessage,
            errorContext: params.errorContext,
          },
          occurredAt: timestamp,
        },
      });
    } catch (err) {
      console.error('Failed to record error event:', err);
    }
  }

  /**
   * Track support request (help request)
   */
  async trackSupportRequest(params: {
    actorId: string;
    workspaceId: string;
    requestType: 'need_help' | 'not_sure' | 'confused' | 'unexpected';
    page: string;
    context?: string;
  }): Promise<void> {
    const timestamp = new Date();

    this.recordEvent({
      eventType: 'support_requested',
      actorId: params.actorId,
      workspaceId: params.workspaceId,
      page: params.page,
      context: {
        requestType: params.requestType,
        context: params.context,
      },
      timestamp,
    });

    try {
      await db.auditEvent.create({
        data: {
          id: `${timestamp.getTime()}-support`,
          eventName: 'operator_support_requested',
          actorId: params.actorId,
          workspaceId: params.workspaceId,
          payload: {
            page: params.page,
            requestType: params.requestType,
            context: params.context,
          },
          occurredAt: timestamp,
        },
      });
    } catch (err) {
      console.error('Failed to record support request:', err);
    }
  }

  /**
   * Track repeated clicks (sign of confusion)
   */
  async trackRepeatedClick(params: {
    actorId: string;
    workspaceId: string;
    page: string;
    buttonName: string;
    clickCount: number;
  }): Promise<void> {
    const timestamp = new Date();

    if (params.clickCount < 3) return; // Only track if 3+ clicks

    this.recordEvent({
      eventType: 'repeated_click',
      actorId: params.actorId,
      workspaceId: params.workspaceId,
      page: params.page,
      context: {
        buttonName: params.buttonName,
        clickCount: params.clickCount,
      },
      timestamp,
    });

    try {
      await db.auditEvent.create({
        data: {
          id: `${timestamp.getTime()}-repeated-click`,
          eventName: 'operator_repeated_click',
          actorId: params.actorId,
          workspaceId: params.workspaceId,
          payload: {
            page: params.page,
            buttonName: params.buttonName,
            clickCount: params.clickCount,
          },
          occurredAt: timestamp,
        },
      });
    } catch (err) {
      console.error('Failed to record repeated click:', err);
    }
  }

  /**
   * Track form abandonment
   */
  async trackFormAbandonment(params: {
    actorId: string;
    workspaceId: string;
    page: string;
    formName: string;
    fieldsCompleted: number;
    totalFields: number;
  }): Promise<void> {
    const timestamp = new Date();

    this.recordEvent({
      eventType: 'form_abandoned',
      actorId: params.actorId,
      workspaceId: params.workspaceId,
      page: params.page,
      context: {
        formName: params.formName,
        fieldsCompleted: params.fieldsCompleted,
        totalFields: params.totalFields,
      },
      timestamp,
    });

    try {
      await db.auditEvent.create({
        data: {
          id: `${timestamp.getTime()}-form-abandoned`,
          eventName: 'operator_form_abandoned',
          actorId: params.actorId,
          workspaceId: params.workspaceId,
          payload: {
            page: params.page,
            formName: params.formName,
            fieldsCompleted: params.fieldsCompleted,
            totalFields: params.totalFields,
            percentComplete: Math.round(
              (params.fieldsCompleted / params.totalFields) * 100
            ),
          },
          occurredAt: timestamp,
        },
      });
    } catch (err) {
      console.error('Failed to record form abandonment:', err);
    }
  }

  /**
   * Record event to in-memory log
   */
  private recordEvent(event: TelemetryEvent): void {
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[TELEMETRY]', {
        ...event,
        timestamp: event.timestamp.toISOString(),
      });
    }
  }
}

export const operatorTelemetry = new OperatorTelemetryService();
