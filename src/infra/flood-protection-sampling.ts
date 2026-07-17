/**
 * PHASE 5: ADAPTIVE SAMPLING ENGINE
 *
 * Deterministic, memory-safe sampling controller with escalation states.
 *
 * Escalation model:
 * - NORMAL: 1:100 sampling (1% of events)
 * - ELEVATED: 1:10 sampling (10% of events) — warning emitted
 * - HIGH: 1:2 sampling (50% of events) — high alert emitted
 * - CRITICAL: 1:1 sampling (100% of events) — incident escalation
 *
 * Sampling is DETERMINISTIC: same correlation ID = same decision (always sampled or always dropped)
 *
 * Memory model: Rolling windows with TTL expiration, no unbounded maps
 */

import { logger } from "@/infra/logger";

/**
 * Escalation state of the system
 */
export type EscalationState = "NORMAL" | "ELEVATED" | "HIGH" | "CRITICAL";

/**
 * Sampling window bucket (for rolling-window counters)
 */
interface SamplingBucket {
  timestamp: number;
  count: number;
  isEscalated: boolean;
}

/**
 * Adaptive sampling controller
 */
export class AdaptiveSamplingController {
  private escalationState: EscalationState = "NORMAL";
  // Rolling-window counters (memory-bounded)
  private buckets: SamplingBucket[] = [];
  private readonly BUCKET_WINDOW_MS = 1000; // 1-second buckets
  private readonly MAX_BUCKETS = 60; // Keep 60 seconds of history
  private readonly TTL_MS = 60000; // 60-second TTL on buckets

  // Escalation thresholds (configurable)
  private thresholds = {
    NORMAL_TO_ELEVATED: 100, // events/sec
    ELEVATED_TO_HIGH: 500,
    HIGH_TO_CRITICAL: 2000,
    CRITICAL_TO_HIGH: 1000, // De-escalation threshold
    HIGH_TO_ELEVATED: 400,
    ELEVATED_TO_NORMAL: 80,
  };

  // Cooldown tracking (prevent rapid escalation flapping)
  private lastEscalationChange: number = 0;
  private ESCALATION_COOLDOWN_MS = 10000; // 10-second cooldown

  // Cooldown for incident escalation (prevent duplicate incidents)
  private lastIncidentEmitted: Record<string, number> = {};
  private INCIDENT_COOLDOWN_MS = 300000; // 5-minute cooldown per incident type

  constructor(options?: Partial<typeof AdaptiveSamplingController.prototype.thresholds>) {
    if (options) {
      this.thresholds = { ...this.thresholds, ...options };
    }
  }

  /**
   * Make sampling decision for an event
   *
   * Returns: { shouldSample: boolean, escalationState: EscalationState }
   */
  public decideSampling(
    correlationId: string,
    telemetryClass: string
  ): {
    shouldSample: boolean;
    escalationState: EscalationState;
    sampleRate: number;
  } {
    // Update rolling window (prune expired buckets)
    this.pruneExpiredBuckets();

    // Update escalation state based on current event rate
    this.updateEscalationState(telemetryClass);

    // Get sample rate based on escalation state
    const sampleRate = this.getSampleRate();

    // Make deterministic sampling decision
    const shouldSample = this.determineIfSampled(correlationId, sampleRate);

    return {
      shouldSample,
      escalationState: this.escalationState,
      sampleRate,
    };
  }

  /**
   * Get sample rate for current escalation state
   */
  private getSampleRate(): number {
    switch (this.escalationState) {
      case "NORMAL":
        return 0.01; // 1:100
      case "ELEVATED":
        return 0.1; // 1:10
      case "HIGH":
        return 0.5; // 1:2
      case "CRITICAL":
        return 1.0; // 1:1 (all events)
    }
  }

  /**
   * Deterministic sampling decision
   *
   * Same correlation ID always makes same decision (deterministic)
   */
  private determineIfSampled(correlationId: string, sampleRate: number): boolean {
    if (sampleRate >= 1) return true;
    if (sampleRate <= 0) return false;

    // Hash correlation ID for deterministic decision
    // Same ID always produces same decision
    const hash = correlationId
      .split("")
      .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);

    return Math.abs(hash % 100) < sampleRate * 100;
  }

  /**
   * Update escalation state based on current event rate
   */
  private updateEscalationState(telemetryClass: string): void {
    const now = Date.now();

    // Check cooldown (prevent flapping)
    if (now - this.lastEscalationChange < this.ESCALATION_COOLDOWN_MS) {
      return;
    }

    // Count events in last window
    const eventRate = this.getEventRate();

    const previousState = this.escalationState;

    // State transition logic
    if (this.escalationState === "NORMAL") {
      if (eventRate >= this.thresholds.NORMAL_TO_ELEVATED) {
        this.escalationState = "ELEVATED";
        logger.warn("Audit sampling escalated to ELEVATED", {
          eventRate,
          threshold: this.thresholds.NORMAL_TO_ELEVATED,
          telemetryClass,
        });
        this.emitEscalationWarning("ELEVATED", eventRate);
      }
    } else if (this.escalationState === "ELEVATED") {
      if (eventRate >= this.thresholds.ELEVATED_TO_HIGH) {
        this.escalationState = "HIGH";
        logger.warn("Audit sampling escalated to HIGH", {
          eventRate,
          threshold: this.thresholds.ELEVATED_TO_HIGH,
          telemetryClass,
        });
        this.emitEscalationWarning("HIGH", eventRate);
      } else if (eventRate < this.thresholds.ELEVATED_TO_NORMAL) {
        this.escalationState = "NORMAL";
      }
    } else if (this.escalationState === "HIGH") {
      if (eventRate >= this.thresholds.HIGH_TO_CRITICAL) {
        this.escalationState = "CRITICAL";
        logger.error("Audit sampling escalated to CRITICAL", {
          eventRate,
          threshold: this.thresholds.HIGH_TO_CRITICAL,
          telemetryClass,
        });
        this.emitIncidentEscalation("CRITICAL_SAMPLING", eventRate);
      } else if (eventRate < this.thresholds.HIGH_TO_ELEVATED) {
        this.escalationState = "ELEVATED";
      }
    } else if (this.escalationState === "CRITICAL") {
      if (eventRate < this.thresholds.CRITICAL_TO_HIGH) {
        this.escalationState = "HIGH";
        logger.warn("Audit sampling de-escalated from CRITICAL to HIGH", {
          eventRate,
          threshold: this.thresholds.CRITICAL_TO_HIGH,
        });
      }
    }

    if (previousState !== this.escalationState) {
      this.lastEscalationChange = now;
    }
  }

  /**
   * Get current event rate (events per second)
   */
  private getEventRate(): number {
    if (this.buckets.length === 0) return 0;

    const now = Date.now();
    const oneSecondAgo = now - 1000;

    const recentEvents = this.buckets.filter((b) => b.timestamp >= oneSecondAgo);
    const totalEvents = recentEvents.reduce((sum, b) => sum + b.count, 0);

    // Return events per second
    return totalEvents > 0 ? totalEvents : 0;
  }

  /**
   * Record event for rate tracking
   */
  public recordEvent(telemetryClass: string): void {
    const now = Date.now();

    // Find or create bucket for current second
    const bucketKey = Math.floor(now / this.BUCKET_WINDOW_MS);
    const bucketTimestamp = bucketKey * this.BUCKET_WINDOW_MS;

    let bucket = this.buckets.find((b) => b.timestamp === bucketTimestamp);
    if (!bucket) {
      bucket = { timestamp: bucketTimestamp, count: 0, isEscalated: false };
      this.buckets.push(bucket);
    }

    bucket.count++;
    bucket.isEscalated = this.escalationState !== "NORMAL";
  }

  /**
   * Prune expired buckets (older than TTL)
   */
  private pruneExpiredBuckets(): void {
    const now = Date.now();
    const expiredThreshold = now - this.TTL_MS;

    // Keep only recent buckets
    this.buckets = this.buckets.filter((b) => b.timestamp > expiredThreshold);

    // Enforce max bucket limit
    if (this.buckets.length > this.MAX_BUCKETS) {
      this.buckets = this.buckets.slice(-this.MAX_BUCKETS);
    }
  }

  /**
   * Emit escalation warning (non-critical)
   */
  private emitEscalationWarning(state: EscalationState, eventRate: number): void {
    // In real implementation, this would emit to monitoring system
    logger.warn("Escalation warning", {
      escalationState: state,
      eventRate,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit incident escalation (critical)
   * Includes cooldown to prevent duplicate escalations
   */
  private emitIncidentEscalation(incidentType: string, eventRate: number): void {
    const now = Date.now();
    const lastEmission = this.lastIncidentEmitted[incidentType] || 0;

    // Check cooldown (prevent duplicate incidents)
    if (now - lastEmission < this.INCIDENT_COOLDOWN_MS) {
      return;
    }

    this.lastIncidentEmitted[incidentType] = now;

    logger.error("Incident escalation", {
      incidentType,
      eventRate,
      timestamp: new Date().toISOString(),
    });

    // In real implementation, this would emit to incident management system
    // emit({ type: "INCIDENT_OPENED", incidentType, eventRate, timestamp: now })
  }

  /**
   * Get current state (for testing/monitoring)
   */
  public getState(): {
    escalationState: EscalationState;
    eventRate: number;
    bucketCount: number;
    sampleRate: number;
  } {
    return {
      escalationState: this.escalationState,
      eventRate: this.getEventRate(),
      bucketCount: this.buckets.length,
      sampleRate: this.getSampleRate(),
    };
  }

  /**
   * Reset state (testing only)
   */
  public reset(): void {
    this.escalationState = "NORMAL";
    this.buckets = [];
    this.lastEscalationChange = 0;
    this.lastIncidentEmitted = {};
  }
}

/**
 * Global adaptive sampling controller (singleton)
 */
let globalSamplingController: AdaptiveSamplingController | null = null;

/**
 * Get or create global adaptive sampling controller
 */
export function getAdaptiveSamplingController(): AdaptiveSamplingController {
  if (!globalSamplingController) {
    globalSamplingController = new AdaptiveSamplingController();
  }
  return globalSamplingController;
}

/**
 * Reset global controller (testing only)
 */
export function resetAdaptiveSamplingController(): void {
  globalSamplingController = null;
}
