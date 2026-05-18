/**
 * Error Monitoring & Alerting
 *
 * Tracks error rates and sends alerts when thresholds exceeded.
 * Integration point for Sentry, DataDog, or other monitoring systems.
 */

import { logger } from "@/infra/logger";

interface ErrorMetric {
  timestamp: number;
  category: string;
  message: string;
  count: number;
}

interface AlertThreshold {
  category: string;
  errorRatePercent: number; // Alert if error rate > this
  failuresPerMinute: number; // Alert if more than this many in 60s
  durationMs: number; // Time window in ms
}

const DEFAULT_THRESHOLDS: AlertThreshold[] = [
  {
    category: "DATABASE_ERROR",
    errorRatePercent: 5, // > 5% of database ops fail
    failuresPerMinute: 10,
    durationMs: 60 * 1000,
  },
  {
    category: "AUTH_ERROR",
    errorRatePercent: 10, // > 10% of auth ops fail
    failuresPerMinute: 20,
    durationMs: 60 * 1000,
  },
  {
    category: "EXTERNAL_API_ERROR",
    errorRatePercent: 15, // > 15% of API calls fail
    failuresPerMinute: 15,
    durationMs: 60 * 1000,
  },
  {
    category: "VALIDATION_ERROR",
    errorRatePercent: 20, // > 20% of requests fail validation
    failuresPerMinute: 30,
    durationMs: 60 * 1000,
  },
];

class ErrorMonitor {
  private errors: ErrorMetric[] = [];
  private requestCount = 0;
  private errorCount = 0;
  private lastAlertTime: Record<string, number> = {};
  private alertDebounceMs = 5 * 60 * 1000; // Don't alert more than every 5 min

  /**
   * Record an HTTP request completion
   */
  recordRequest(success: boolean): void {
    this.requestCount++;
    if (!success) {
      this.errorCount++;
    }
  }

  /**
   * Record an error occurrence
   */
  recordError(category: string, message: string): void {
    const timestamp = Date.now();

    // Find or create metric
    const existing = this.errors.find((e) => e.category === category && e.message === message);
    if (existing) {
      existing.count++;
    } else {
      this.errors.push({ timestamp, category, message, count: 1 });
    }

    // Clean up old entries (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    this.errors = this.errors.filter((e) => e.timestamp > tenMinutesAgo);

    // Check thresholds
    this.checkAlertThresholds(category);
  }

  /**
   * Get error rate for a category (percentage)
   */
  getErrorRate(category: string): number {
    if (this.requestCount === 0) return 0;

    const categoryErrors = this.errors
      .filter((e) => e.category === category)
      .reduce((sum, e) => sum + e.count, 0);

    return (categoryErrors / this.requestCount) * 100;
  }

  /**
   * Get error count for a category in a time window
   */
  getErrorsInWindow(category: string, windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    return this.errors
      .filter((e) => e.category === category && e.timestamp > cutoff)
      .reduce((sum, e) => sum + e.count, 0);
  }

  /**
   * Check if error rate exceeds thresholds and alert if needed
   */
  private checkAlertThresholds(category: string): void {
    const threshold = DEFAULT_THRESHOLDS.find((t) => t.category === category);
    if (!threshold) return;

    const errorRate = this.getErrorRate(category);
    const errorsInWindow = this.getErrorsInWindow(category, threshold.durationMs);

    // Check if we should alert
    let shouldAlert = false;
    let reason = "";

    if (errorRate > threshold.errorRatePercent) {
      shouldAlert = true;
      reason = `Error rate ${errorRate.toFixed(2)}% exceeds threshold ${threshold.errorRatePercent}%`;
    }

    if (errorsInWindow > threshold.failuresPerMinute) {
      shouldAlert = true;
      reason = `${errorsInWindow} errors in ${threshold.durationMs}ms exceeds threshold ${threshold.failuresPerMinute}`;
    }

    // Debounce alerts to prevent spam
    if (shouldAlert) {
      const lastAlert = this.lastAlertTime[category] || 0;
      const timeSinceLastAlert = Date.now() - lastAlert;

      if (timeSinceLastAlert > this.alertDebounceMs) {
        this.sendAlert(category, reason, {
          error_rate: errorRate.toFixed(2),
          errors_in_window: errorsInWindow,
          request_count: this.requestCount,
          threshold_error_rate: threshold.errorRatePercent,
          threshold_failures: threshold.failuresPerMinute,
        });

        this.lastAlertTime[category] = Date.now();
      }
    }
  }

  /**
   * Send alert to monitoring system
   */
  private sendAlert(category: string, reason: string, metrics: Record<string, unknown>): void {
    logger.error("🚨 ERROR RATE ALERT", {
      category,
      reason,
      metrics,
      alert_type: "error_rate_threshold_exceeded",
    });

    // TODO: Integrate with Sentry/DataDog/CloudWatch
    // Example:
    // Sentry.captureException(new Error(reason), {
    //   level: "error",
    //   tags: { alert: "error_rate", category },
    //   extra: metrics,
    // });
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      request_count: this.requestCount,
      error_count: this.errorCount,
      error_rate_percent: (this.errorCount / Math.max(this.requestCount, 1)) * 100,
      categories: DEFAULT_THRESHOLDS.map((t) => ({
        name: t.category,
        rate: this.getErrorRate(t.category),
        recent_count: this.getErrorsInWindow(t.category, t.durationMs),
      })),
    };
  }

  /**
   * Reset counters (for testing)
   */
  reset(): void {
    this.errors = [];
    this.requestCount = 0;
    this.errorCount = 0;
    this.lastAlertTime = {};
  }
}

// Singleton instance
let monitor: ErrorMonitor | null = null;

function getMonitor(): ErrorMonitor {
  if (!monitor) {
    monitor = new ErrorMonitor();
  }
  return monitor;
}

/**
 * Public API: Record request
 */
export function recordHttpMetric(success: boolean): void {
  getMonitor().recordRequest(success);
}

/**
 * Public API: Record error
 */
export function trackError(category: string, message: string): void {
  getMonitor().recordError(category, message);
}

/**
 * Public API: Get current error rate
 */
export function getErrorRate(category: string): number {
  return getMonitor().getErrorRate(category);
}

/**
 * Public API: Get monitoring status
 */
export function getMonitoringStatus() {
  return getMonitor().getStatus();
}
