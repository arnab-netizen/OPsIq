/**
 * ADDENDUM F: Mocked Load Tests
 *
 * Simulates load testing scenarios with mock data to verify performance
 * characteristics without requiring a live database.
 *
 * Non-DB: Pure testing harness with mock data generation and timing analysis.
 * Ready for: Integration with real database once available.
 */

import { z } from 'zod';

// ============================================================================
// LOAD TEST CONTRACTS
// ============================================================================

/** Load test configuration */
export const LoadTestConfigSchema = z.object({
  testName: z.string(),
  scenarioType: z.enum(['ramp', 'spike', 'sustained', 'stress', 'endurance']),
  duration: z.number().min(1), // milliseconds
  concurrentUsers: z.number().min(1),
  requestsPerSecond: z.number().min(1),
  thinkTime: z.number().min(0), // milliseconds between requests
  timeout: z.number().min(100), // milliseconds
});

export type LoadTestConfig = z.infer<typeof LoadTestConfigSchema>;

/** Load test request */
export const LoadTestRequestSchema = z.object({
  requestId: z.string(),
  operationType: z.enum(['create', 'read', 'update', 'delete', 'list', 'search']),
  entityType: z.string(),
  timestamp: z.date(),
  durationMs: z.number().min(0),
  success: z.boolean(),
  statusCode: z.number(),
  responseSize: z.number().min(0),
  error: z.string().optional(),
});

export type LoadTestRequest = z.infer<typeof LoadTestRequestSchema>;

/** Load test metric snapshot */
export const LoadTestMetricsSchema = z.object({
  timestamp: z.date(),
  concurrentUsers: z.number(),
  requestsPerSecond: z.number(),
  averageLatencyMs: z.number(),
  p95LatencyMs: z.number(),
  p99LatencyMs: z.number(),
  maxLatencyMs: z.number(),
  successCount: z.number(),
  errorCount: z.number(),
  successRate: z.number().min(0).max(100),
  throughputBytesPerSecond: z.number(),
});

export type LoadTestMetrics = z.infer<typeof LoadTestMetricsSchema>;

/** Load test result */
export const LoadTestResultSchema = z.object({
  testId: z.string(),
  config: LoadTestConfigSchema,
  totalRequests: z.number(),
  successfulRequests: z.number(),
  failedRequests: z.number(),
  totalDurationMs: z.number(),
  startTime: z.date(),
  endTime: z.date(),
  overallLatencyStats: z.object({
    minMs: z.number(),
    maxMs: z.number(),
    meanMs: z.number(),
    medianMs: z.number(),
    p95Ms: z.number(),
    p99Ms: z.number(),
  }),
  errorSummary: z.record(z.string(), z.number()),
  requestMetrics: z.array(LoadTestRequestSchema),
  metricSnapshots: z.array(LoadTestMetricsSchema),
  throughputMetrics: z.object({
    totalBytesTransferred: z.number(),
    averageBytesPerSecond: z.number(),
    peakBytesPerSecond: z.number(),
  }),
  conclusions: z.object({
    performanceGrade: z.enum(['A', 'B', 'C', 'D', 'F']),
    bottlenecks: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),
});

export type LoadTestResult = z.infer<typeof LoadTestResultSchema>;

// ============================================================================
// LOAD TEST EXECUTION HARNESS
// ============================================================================

/**
 * Simulate a single request with mock latency
 */
export function simulateRequest(operationType: string): LoadTestRequest {
  const baseLatency = 10 + Math.random() * 90;
  const jitter = operationType === 'list' || operationType === 'search' ? Math.random() * 40 : 0;
  const latency = baseLatency + jitter;
  const simulatedError = Math.random() < 0.05; // 5% error rate

  return {
    requestId: `req_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    operationType: operationType as LoadTestRequest['operationType'],
    entityType: ['action', 'decision', 'experiment'][Math.floor(Math.random() * 3)]!,
    timestamp: new Date(),
    durationMs: Math.round(latency),
    success: !simulatedError,
    statusCode: simulatedError ? (Math.random() < 0.5 ? 500 : 503) : 200,
    responseSize: operationType === 'list' ? 5000 + Math.random() * 10000 : 1000 + Math.random() * 2000,
    error: simulatedError ? 'Simulated backend timeout' : undefined,
  };
}

/**
 * Generate mock load test requests
 */
export function generateMockLoadTestRequests(config: LoadTestConfig): LoadTestRequest[] {
  const requests: LoadTestRequest[] = [];
  const targetRequests = Math.ceil((config.duration / 1000) * config.requestsPerSecond);
  const operations: Array<LoadTestRequest['operationType']> = ['create', 'read', 'update', 'delete', 'list', 'search'];

  for (let i = 0; i < targetRequests; i++) {
    const operation = operations[i % operations.length]!;
    requests.push(simulateRequest(operation));
  }

  return requests;
}

/**
 * Calculate latency percentile
 */
export function calculatePercentile(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] || 0;
}

/**
 * Calculate metric snapshot from requests
 */
export function calculateMetricSnapshot(
  requests: LoadTestRequest[],
  config: LoadTestConfig,
): LoadTestMetrics {
  const latencies = requests.map((r) => r.durationMs);
  const successCount = requests.filter((r) => r.success).length;
  const errorCount = requests.length - successCount;
  const totalBytes = requests.reduce((sum, r) => sum + r.responseSize, 0);

  return {
    timestamp: new Date(),
    concurrentUsers: config.concurrentUsers,
    requestsPerSecond: config.requestsPerSecond,
    averageLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    p95LatencyMs: Math.round(calculatePercentile(latencies, 95)),
    p99LatencyMs: Math.round(calculatePercentile(latencies, 99)),
    maxLatencyMs: Math.max(...latencies),
    successCount,
    errorCount,
    successRate: Math.round((successCount / requests.length) * 100),
    throughputBytesPerSecond: Math.round(totalBytes / (config.duration / 1000)),
  };
}

/**
 * Determine performance grade
 */
export function determinePerformanceGrade(result: Omit<LoadTestResult, 'conclusions'>): LoadTestResult['conclusions']['performanceGrade'] {
  const p95 = result.overallLatencyStats.p95Ms;
  const successRate = (result.successfulRequests / result.totalRequests) * 100;

  if (p95 < 100 && successRate > 99) return 'A';
  if (p95 < 200 && successRate > 98) return 'B';
  if (p95 < 500 && successRate > 95) return 'C';
  if (p95 < 1000 && successRate > 90) return 'D';
  return 'F';
}

/**
 * Identify performance bottlenecks
 */
export function identifyBottlenecks(result: Omit<LoadTestResult, 'conclusions'>): string[] {
  const bottlenecks: string[] = [];
  const p95 = result.overallLatencyStats.p95Ms;
  const successRate = (result.successfulRequests / result.totalRequests) * 100;

  if (p95 > 500) {
    bottlenecks.push('High latency detected (P95 > 500ms)');
  }

  if (successRate < 99) {
    bottlenecks.push(`Low success rate (${successRate.toFixed(1)}%)`);
  }

  if (result.overallLatencyStats.p99Ms - result.overallLatencyStats.medianMs > 200) {
    bottlenecks.push('High latency variance detected');
  }

  // Identify error patterns
  const errorTypes = Object.keys(result.errorSummary);
  if (errorTypes.length > 0) {
    const topError = errorTypes.reduce((a, b) => (result.errorSummary[a] > result.errorSummary[b] ? a : b));
    bottlenecks.push(`Common error: ${topError}`);
  }

  return bottlenecks;
}

/**
 * Generate performance recommendations
 */
export function generateRecommendations(result: Omit<LoadTestResult, 'conclusions'>): string[] {
  const recommendations: string[] = [];
  const p95 = result.overallLatencyStats.p95Ms;

  if (p95 > 1000) {
    recommendations.push('Consider database indexing optimization');
    recommendations.push('Evaluate query complexity and N+1 issues');
  }

  if (p95 > 500) {
    recommendations.push('Implement caching layer (Redis/Memcached)');
    recommendations.push('Consider horizontal scaling');
  }

  const successRate = (result.successfulRequests / result.totalRequests) * 100;
  if (successRate < 99.5) {
    recommendations.push('Improve error handling and retry logic');
    recommendations.push('Increase backend resource capacity');
  }

  if (result.config.concurrentUsers > 100 && result.overallLatencyStats.meanMs > 200) {
    recommendations.push('Implement rate limiting to protect backend');
  }

  return recommendations.length === 0 ? ['Performance is acceptable'] : recommendations;
}

/**
 * Execute load test
 */
export function executeLoadTest(config: LoadTestConfig): LoadTestResult {
  const startTime = new Date();
  const requests = generateMockLoadTestRequests(config);
  const endTime = new Date();

  const latencies = requests.map((r) => r.durationMs);
  const successCount = requests.filter((r) => r.success).length;
  const failedCount = requests.length - successCount;
  const totalBytes = requests.reduce((sum, r) => sum + r.responseSize, 0);

  // Create metric snapshots at intervals
  const snapshotInterval = Math.max(1000, Math.ceil(config.duration / 10));
  const metricSnapshots: LoadTestMetrics[] = [];

  for (let i = 0; i < requests.length; i += Math.ceil(requests.length / 10)) {
    const slice = requests.slice(i, i + Math.ceil(requests.length / 10));
    metricSnapshots.push(calculateMetricSnapshot(slice, config));
  }

  // Error summary
  const errorSummary: Record<string, number> = {};
  for (const request of requests) {
    if (request.error) {
      errorSummary[request.error] = (errorSummary[request.error] || 0) + 1;
    }
  }

  const resultBase = {
    testId: `test_${Date.now()}`,
    config,
    totalRequests: requests.length,
    successfulRequests: successCount,
    failedRequests: failedCount,
    totalDurationMs: config.duration,
    startTime,
    endTime,
    overallLatencyStats: {
      minMs: Math.min(...latencies),
      maxMs: Math.max(...latencies),
      meanMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      medianMs: Math.round(calculatePercentile(latencies, 50)),
      p95Ms: Math.round(calculatePercentile(latencies, 95)),
      p99Ms: Math.round(calculatePercentile(latencies, 99)),
    },
    errorSummary,
    requestMetrics: requests,
    metricSnapshots,
    throughputMetrics: {
      totalBytesTransferred: totalBytes,
      averageBytesPerSecond: Math.round(totalBytes / (config.duration / 1000)),
      peakBytesPerSecond: Math.max(
        ...metricSnapshots.map((m) => m.throughputBytesPerSecond),
      ),
    },
  };

  const grade = determinePerformanceGrade(resultBase);
  const bottlenecks = identifyBottlenecks(resultBase);
  const recommendations = generateRecommendations(resultBase);

  return {
    ...resultBase,
    conclusions: {
      performanceGrade: grade,
      bottlenecks,
      recommendations,
    },
  };
}

// ============================================================================
// LOAD TEST SCENARIO BUILDERS
// ============================================================================

/**
 * Build ramp-up load test (gradually increasing load)
 */
export function buildRampLoadTest(peakUsers: number, durationSeconds: number): LoadTestConfig {
  return {
    testName: 'Ramp-up Load Test',
    scenarioType: 'ramp',
    duration: durationSeconds * 1000,
    concurrentUsers: peakUsers,
    requestsPerSecond: peakUsers,
    thinkTime: 100,
    timeout: 5000,
  };
}

/**
 * Build spike load test (sudden increase in load)
 */
export function buildSpikeLoadTest(normalUsers: number, spikeUsers: number, durationSeconds: number): LoadTestConfig {
  return {
    testName: 'Spike Load Test',
    scenarioType: 'spike',
    duration: durationSeconds * 1000,
    concurrentUsers: spikeUsers,
    requestsPerSecond: spikeUsers,
    thinkTime: 50,
    timeout: 10000,
  };
}

/**
 * Build stress load test (maximum load until failure)
 */
export function buildStressLoadTest(startUsers: number, maxUsers: number, durationSeconds: number): LoadTestConfig {
  return {
    testName: 'Stress Load Test',
    scenarioType: 'stress',
    duration: durationSeconds * 1000,
    concurrentUsers: maxUsers,
    requestsPerSecond: maxUsers,
    thinkTime: 0,
    timeout: 15000,
  };
}

/**
 * Build endurance load test (sustained load over extended period)
 */
export function buildEnduranceLoadTest(steadyUsers: number, durationMinutes: number): LoadTestConfig {
  return {
    testName: 'Endurance Load Test',
    scenarioType: 'endurance',
    duration: durationMinutes * 60 * 1000,
    concurrentUsers: steadyUsers,
    requestsPerSecond: steadyUsers,
    thinkTime: 200,
    timeout: 5000,
  };
}

/**
 * Build sustained load test (steady state)
 */
export function buildSustainedLoadTest(steadyUsers: number, durationSeconds: number): LoadTestConfig {
  return {
    testName: 'Sustained Load Test',
    scenarioType: 'sustained',
    duration: durationSeconds * 1000,
    concurrentUsers: steadyUsers,
    requestsPerSecond: steadyUsers,
    thinkTime: 100,
    timeout: 5000,
  };
}
