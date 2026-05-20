/**
 * Scheduled Jobs Infrastructure
 *
 * Runs background tasks for alpha monitoring:
 * - Daily alpha review report generation
 * - Operator activity summaries
 * - Feedback hotspot analysis
 *
 * For local development: Call manually or use Next.js API routes
 * For production: Integrate with Cloud Scheduler or similar
 */

import { alphaDailyReview } from './alpha-daily-review';

export interface ScheduledJobConfig {
  name: string;
  schedule: string; // cron expression or human-readable
  handler: () => Promise<void>;
  enabled: boolean;
}

/**
 * Daily Alpha Review Job
 *
 * Runs at 6:00 AM daily
 * Generates comprehensive operator activity report
 * Identifies hotspots and issues
 */
export const dailyAlphaReviewJob: ScheduledJobConfig = {
  name: 'daily-alpha-review',
  schedule: '0 6 * * *', // 6:00 AM daily
  enabled: true,
  handler: async () => {
    console.log('[SCHEDULED_JOB] Starting daily alpha review...');

    try {
      const report = await alphaDailyReview.generateReport({
        workspaceId: 'alpha-workspace-01',
        date: new Date(),
      });

      console.log('[SCHEDULED_JOB] Daily alpha review complete:', {
        activeOperators: report.operators.active,
        workflowsCompleted: report.workflows.stats.length,
        supportIncidents: report.support.totalIncidents,
        feedbackItems: report.feedback.totalSubmitted,
        confusionHotspots: report.feedback.hotspots.length,
        recommendations: report.recommendations.length,
      });

      // In production, would:
      // 1. Store report in database
      // 2. Send to admin email
      // 3. Update admin dashboard
      // 4. Alert on critical issues
    } catch (error) {
      console.error('[SCHEDULED_JOB] Daily alpha review failed:', error);
      throw error;
    }
  },
};

/**
 * Manual Trigger Function
 *
 * For testing or manual execution
 *
 * Usage:
 * ```typescript
 * import { triggerDailyAlphaReview } from '@/infra/scheduled-jobs';
 * await triggerDailyAlphaReview();
 * ```
 */
export async function triggerDailyAlphaReview() {
  return dailyAlphaReviewJob.handler();
}

/**
 * All scheduled jobs registry
 */
export const scheduledJobs: ScheduledJobConfig[] = [dailyAlphaReviewJob];

/**
 * Get all enabled jobs
 */
export function getEnabledJobs(): ScheduledJobConfig[] {
  return scheduledJobs.filter((job) => job.enabled);
}
