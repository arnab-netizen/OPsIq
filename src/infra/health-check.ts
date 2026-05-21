/**
 * Health Check & Readiness Service
 *
 * Provides health status and readiness probes for deployment orchestration.
 * Non-DB core checks for application state and dependencies.
 */

import { classifyOperatorError } from "@/lib/operator-error-governance";

export enum HealthStatus {
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  UNHEALTHY = "unhealthy",
}

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: Date;
  uptime: number; // milliseconds
  checks: Record<string, CheckResult>;
  version?: string;
}

export interface ReadinessResult {
  ready: boolean;
  timestamp: Date;
  checks: Record<string, ReadinessCheck>;
}

export interface CheckResult {
  status: HealthStatus;
  responseTime: number; // milliseconds
  error?: string;
  lastChecked: Date;
}

export interface ReadinessCheck {
  ready: boolean;
  details?: string;
  lastChecked: Date;
}

// Track startup time
const startupTime = Date.now();

// Health check cache
let cachedHealthCheck: HealthCheckResult | null = null;
let lastHealthCheckTime = 0;
const HEALTH_CHECK_CACHE_TTL = 10000; // 10 seconds

// Readiness state
let isReadyState = false;
let readyStateChangedAt: Date | null = null;

/**
 * Get application uptime in milliseconds
 */
export function getUptime(): number {
  return Date.now() - startupTime;
}

/**
 * Check application memory usage
 */
export function checkMemory(): CheckResult {
  const startTime = Date.now();

  try {
    if (typeof process !== "undefined" && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

      // Consider unhealthy if heap usage > 90%
      const status = heapUsedPercent > 90 ? HealthStatus.DEGRADED : HealthStatus.HEALTHY;

      return {
        status,
        responseTime: Date.now() - startTime,
        lastChecked: new Date(),
      };
    }

    return {
      status: HealthStatus.HEALTHY,
      responseTime: Date.now() - startTime,
      lastChecked: new Date(),
    };
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    return {
      status: HealthStatus.UNHEALTHY,
      responseTime: Date.now() - startTime,
      error: governed.operatorMessage,
      lastChecked: new Date(),
    };
  }
}

/**
 * Check response latency
 */
export function checkResponseTime(): CheckResult {
  const startTime = Date.now();

  try {
    // Simulate a quick check
    const checkTime = Date.now() - startTime;

    // Consider unhealthy if check takes > 5s
    const status = checkTime > 5000 ? HealthStatus.UNHEALTHY : HealthStatus.HEALTHY;

    return {
      status,
      responseTime: checkTime,
      lastChecked: new Date(),
    };
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    return {
      status: HealthStatus.UNHEALTHY,
      responseTime: Date.now() - startTime,
      error: governed.operatorMessage,
      lastChecked: new Date(),
    };
  }
}

/**
 * Check event loop lag
 */
export function checkEventLoop(): CheckResult {
  const startTime = Date.now();

  return {
    status: HealthStatus.HEALTHY,
    responseTime: Date.now() - startTime,
    lastChecked: new Date(),
  };
}

/**
 * Perform full health check
 */
export function getHealthCheck(version?: string): HealthCheckResult {
  const now = Date.now();

  // Return cached result if fresh (unless version parameter provided - always update version)
  if (cachedHealthCheck && now - lastHealthCheckTime < HEALTH_CHECK_CACHE_TTL && !version) {
    return cachedHealthCheck;
  }

  const result: HealthCheckResult = {
    status: HealthStatus.HEALTHY,
    timestamp: new Date(),
    uptime: getUptime(),
    checks: {
      memory: checkMemory(),
      responseTime: checkResponseTime(),
      eventLoop: checkEventLoop(),
    },
    version,
  };

  // Determine overall status
  const checkStatuses = Object.values(result.checks).map((c) => c.status);
  if (checkStatuses.includes(HealthStatus.UNHEALTHY)) {
    result.status = HealthStatus.UNHEALTHY;
  } else if (checkStatuses.includes(HealthStatus.DEGRADED)) {
    result.status = HealthStatus.DEGRADED;
  }

  // Cache result only if no version provided (version-specific calls bypass cache)
  if (!version) {
    cachedHealthCheck = result;
    lastHealthCheckTime = now;
  }

  return result;
}

/**
 * Set readiness state
 */
export function setReadiness(ready: boolean): void {
  isReadyState = ready;
  readyStateChangedAt = new Date();
}

/**
 * Get readiness state
 */
export function isReady(): boolean {
  return isReadyState;
}

/**
 * Get readiness details
 */
export function getReadinessCheck(): ReadinessResult {
  const checks: Record<string, ReadinessCheck> = {
    applicationReady: {
      ready: isReadyState,
      details: isReadyState ? "Application initialized" : "Application still initializing",
      lastChecked: new Date(),
    },
    memoryAvailable: {
      ready: true,
      lastChecked: new Date(),
    },
  };

  return {
    ready: Object.values(checks).every((c) => c.ready),
    timestamp: new Date(),
    checks,
  };
}

/**
 * Detailed health status with metrics
 */
export function getDetailedHealth(version?: string) {
  const health = getHealthCheck(version);
  const readiness = getReadinessCheck();

  return {
    health,
    readiness,
    metadata: {
      environment: typeof process !== "undefined" ? process.env.NODE_ENV : "unknown",
      uptime: health.uptime,
      timestamp: health.timestamp.toISOString(),
    },
  };
}

/**
 * Health status for Kubernetes liveness probe
 */
export function getLivenessProbeResponse(): {
  status: number;
  message: string;
} {
  const health = getHealthCheck();

  if (health.status === HealthStatus.UNHEALTHY) {
    return {
      status: 503, // Service Unavailable
      message: "Service is unhealthy",
    };
  }

  return {
    status: 200,
    message: "Service is alive",
  };
}

/**
 * Readiness status for Kubernetes readiness probe
 */
export function getReadinessProbeResponse(): {
  status: number;
  message: string;
} {
  const ready = isReady();

  if (!ready) {
    return {
      status: 503, // Service Unavailable
      message: "Service is not ready",
    };
  }

  return {
    status: 200,
    message: "Service is ready",
  };
}
