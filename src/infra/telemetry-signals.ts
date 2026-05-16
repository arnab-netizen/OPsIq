/**
 * PHASE 4: SECURITY & INFRASTRUCTURE SIGNAL ENGINES
 *
 * STEP 6: Security Signal Engine — attack detection aggregation
 * STEP 7: Infrastructure Signal Engine — ops visibility
 *
 * Memory-safe counters with rolling windows.
 * Threshold escalation. No DB dependency.
 * No audit flood.
 */

import { type SecuritySignal, type InfrastructureSignal } from "./telemetry-contracts";

/**
 * Rolling window counter for signal aggregation
 */
class RollingWindowCounter {
  private events: number[] = []; // Timestamps of events
  private windowMs: number;

  constructor(windowMs: number = 60000) {
    this.windowMs = windowMs;
  }

  /**
   * Record an event occurrence
   */
  record(): void {
    const now = Date.now();
    this.events.push(now);
    this.cleanup();
  }

  /**
   * Get count within current window
   */
  getCount(): number {
    this.cleanup();
    return this.events.length;
  }

  /**
   * Get rate (events per second)
   */
  getRate(): number {
    this.cleanup();
    if (this.events.length === 0) return 0;

    const now = Date.now();
    const oldestEvent = this.events[0]!;
    const spanMs = now - oldestEvent;

    if (spanMs === 0) return 0;
    return (this.events.length / spanMs) * 1000;
  }

  /**
   * Clear events outside window
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.events = this.events.filter((ts) => ts > cutoff);
  }

  /**
   * Reset counter
   */
  reset(): void {
    this.events = [];
  }
}

/**
 * Security Signal Engine
 * Detects attack patterns without DB dependency
 */
export class SecuritySignalEngine {
  private authFailureRate = new RollingWindowCounter(60000); // 1 min window
  private workspaceDenialRate = new RollingWindowCounter(60000);
  private capabilityDenialRate = new RollingWindowCounter(60000);
  private replayAttemptRate = new RollingWindowCounter(60000);
  private tamperedCredentialRate = new RollingWindowCounter(60000);

  /**
   * Record auth failure
   */
  recordAuthFailure(): void {
    this.authFailureRate.record();
  }

  /**
   * Record workspace denial
   */
  recordWorkspaceDenial(): void {
    this.workspaceDenialRate.record();
  }

  /**
   * Record capability denial
   */
  recordCapabilityDenial(): void {
    this.capabilityDenialRate.record();
  }

  /**
   * Record replay attempt
   */
  recordReplayAttempt(): void {
    this.replayAttemptRate.record();
  }

  /**
   * Record tampered credential
   */
  recordTamperedCredential(): void {
    this.tamperedCredentialRate.record();
  }

  /**
   * Get current security signals
   */
  getSignals(): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // Credential stuffing: high auth failure rate
    const authFailures = this.authFailureRate.getCount();
    const authFailureRate = this.authFailureRate.getRate();
    if (authFailures > 10 || authFailureRate > 1) {
      signals.push({
        signal: "credential_stuffing",
        severity: authFailures > 50 ? "CRITICAL" : authFailures > 15 ? "HIGH" : "MEDIUM",
        count: authFailures,
        window: 60000,
        threshold: 10,
        currentRate: authFailureRate,
      });
    }

    // Replay attacks: high replay attempt rate
    const replayAttempts = this.replayAttemptRate.getCount();
    const replayRate = this.replayAttemptRate.getRate();
    if (replayAttempts > 5 || replayRate > 0.2) {
      signals.push({
        signal: "replay_attack",
        severity: replayAttempts > 20 ? "CRITICAL" : replayAttempts > 8 ? "HIGH" : "MEDIUM",
        count: replayAttempts,
        window: 60000,
        threshold: 5,
        currentRate: replayRate,
      });
    }

    // Tampered credentials: immediate escalation
    const tamperedCount = this.tamperedCredentialRate.getCount();
    if (tamperedCount > 0) {
      signals.push({
        signal: "tampered_credentials",
        severity: "CRITICAL",
        count: tamperedCount,
        window: 60000,
        threshold: 1,
        currentRate: this.tamperedCredentialRate.getRate(),
      });
    }

    return signals;
  }

  /**
   * Clear all signals (testing only)
   */
  reset(): void {
    this.authFailureRate.reset();
    this.workspaceDenialRate.reset();
    this.capabilityDenialRate.reset();
    this.replayAttemptRate.reset();
    this.tamperedCredentialRate.reset();
  }
}

/**
 * Infrastructure Signal Engine
 * Tracks infrastructure health without DB dependency
 */
export class InfrastructureSignalEngine {
  private authBackendDown: { active: boolean; startedAt: number | null } = {
    active: false,
    startedAt: null,
  };

  private workspaceBackendDown: { active: boolean; startedAt: number | null } = {
    active: false,
    startedAt: null,
  };

  private capabilityBackendDown: { active: boolean; startedAt: number | null } = {
    active: false,
    startedAt: null,
  };

  private circuitOpen: { active: boolean; startedAt: number | null; path?: string } = {
    active: false,
    startedAt: null,
  };

  private requestShedActive: { active: boolean; startedAt: number | null; rate?: number } = {
    active: false,
    startedAt: null,
  };

  /**
   * Mark auth backend as unavailable
   */
  markAuthBackendDown(): void {
    if (!this.authBackendDown.active) {
      this.authBackendDown.active = true;
      this.authBackendDown.startedAt = Date.now();
    }
  }

  /**
   * Mark auth backend as recovered
   */
  markAuthBackendUp(): void {
    this.authBackendDown.active = false;
    this.authBackendDown.startedAt = null;
  }

  /**
   * Mark workspace backend as unavailable
   */
  markWorkspaceBackendDown(): void {
    if (!this.workspaceBackendDown.active) {
      this.workspaceBackendDown.active = true;
      this.workspaceBackendDown.startedAt = Date.now();
    }
  }

  /**
   * Mark workspace backend as recovered
   */
  markWorkspaceBackendUp(): void {
    this.workspaceBackendDown.active = false;
    this.workspaceBackendDown.startedAt = null;
  }

  /**
   * Mark capability backend as unavailable
   */
  markCapabilityBackendDown(): void {
    if (!this.capabilityBackendDown.active) {
      this.capabilityBackendDown.active = true;
      this.capabilityBackendDown.startedAt = Date.now();
    }
  }

  /**
   * Mark capability backend as recovered
   */
  markCapabilityBackendUp(): void {
    this.capabilityBackendDown.active = false;
    this.capabilityBackendDown.startedAt = null;
  }

  /**
   * Mark circuit breaker as open
   */
  markCircuitOpen(path?: string): void {
    if (!this.circuitOpen.active) {
      this.circuitOpen.active = true;
      this.circuitOpen.startedAt = Date.now();
      this.circuitOpen.path = path;
    }
  }

  /**
   * Mark circuit breaker as closed
   */
  markCircuitClosed(): void {
    this.circuitOpen.active = false;
    this.circuitOpen.startedAt = null;
  }

  /**
   * Mark request shedding as active
   */
  markRequestShedActive(shedRate?: number): void {
    if (!this.requestShedActive.active) {
      this.requestShedActive.active = true;
      this.requestShedActive.startedAt = Date.now();
      this.requestShedActive.rate = shedRate;
    }
  }

  /**
   * Mark request shedding as inactive
   */
  markRequestShedInactive(): void {
    this.requestShedActive.active = false;
    this.requestShedActive.startedAt = null;
  }

  /**
   * Get current infrastructure signals
   */
  getSignals(): InfrastructureSignal[] {
    const signals: InfrastructureSignal[] = [];
    const now = Date.now();

    if (this.authBackendDown.active && this.authBackendDown.startedAt) {
      signals.push({
        signal: "auth_backend_down",
        severity: "CRITICAL",
        isActive: true,
        durationMs: now - this.authBackendDown.startedAt,
        affectedPath: "/api/auth/*",
        upstreamService: "auth-backend",
      });
    }

    if (this.workspaceBackendDown.active && this.workspaceBackendDown.startedAt) {
      signals.push({
        signal: "workspace_backend_down",
        severity: "CRITICAL",
        isActive: true,
        durationMs: now - this.workspaceBackendDown.startedAt,
        affectedPath: "/api/workspaces/*",
        upstreamService: "workspace-backend",
      });
    }

    if (this.capabilityBackendDown.active && this.capabilityBackendDown.startedAt) {
      signals.push({
        signal: "capability_backend_down",
        severity: "CRITICAL",
        isActive: true,
        durationMs: now - this.capabilityBackendDown.startedAt,
        affectedPath: "/api/capabilities/*",
        upstreamService: "capability-backend",
      });
    }

    if (this.circuitOpen.active && this.circuitOpen.startedAt) {
      signals.push({
        signal: "circuit_open",
        severity: "HIGH",
        isActive: true,
        durationMs: now - this.circuitOpen.startedAt,
        affectedPath: this.circuitOpen.path || "unknown",
        upstreamService: "circuit-breaker",
      });
    }

    if (this.requestShedActive.active && this.requestShedActive.startedAt) {
      signals.push({
        signal: "request_shed_active",
        severity: "HIGH",
        isActive: true,
        durationMs: now - this.requestShedActive.startedAt,
        affectedPath: "/api/*",
        upstreamService: "load-shedder",
      });
    }

    return signals;
  }

  /**
   * Clear all signals (testing only)
   */
  reset(): void {
    this.authBackendDown = { active: false, startedAt: null };
    this.workspaceBackendDown = { active: false, startedAt: null };
    this.capabilityBackendDown = { active: false, startedAt: null };
    this.circuitOpen = { active: false, startedAt: null };
    this.requestShedActive = { active: false, startedAt: null };
  }
}

/**
 * Global signal engines (singletons)
 */
export const securitySignalEngine = new SecuritySignalEngine();
export const infrastructureSignalEngine = new InfrastructureSignalEngine();
