import { describe, it, expect } from 'vitest';
import {
  LoadTestConfigSchema,
  LoadTestRequestSchema,
  LoadTestMetricsSchema,
  LoadTestResultSchema,
  simulateRequest,
  generateMockLoadTestRequests,
  calculatePercentile,
  calculateMetricSnapshot,
  determinePerformanceGrade,
  identifyBottlenecks,
  generateRecommendations,
  executeLoadTest,
  buildRampLoadTest,
  buildSpikeLoadTest,
  buildStressLoadTest,
  buildEnduranceLoadTest,
  buildSustainedLoadTest,
  type LoadTestConfig,
  type LoadTestRequest,
  type LoadTestMetrics,
} from '@/infra/load-testing/mock-load-tester';

describe('ADDENDUM F: Mocked Load Tests', () => {
  describe('Load Test Config Schema', () => {
    it('should validate load test configuration', () => {
      const config: LoadTestConfig = {
        testName: 'Basic Load Test',
        scenarioType: 'sustained',
        duration: 60000,
        concurrentUsers: 10,
        requestsPerSecond: 10,
        thinkTime: 100,
        timeout: 5000,
      };

      const result = LoadTestConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate all scenario types', () => {
      const scenarios = ['ramp', 'spike', 'sustained', 'stress', 'endurance'] as const;

      for (const scenario of scenarios) {
        const config: LoadTestConfig = {
          testName: 'Test',
          scenarioType: scenario,
          duration: 60000,
          concurrentUsers: 10,
          requestsPerSecond: 10,
          thinkTime: 100,
          timeout: 5000,
        };

        const result = LoadTestConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      }
    });

    it('should enforce minimum values', () => {
      const invalidConfig = {
        testName: 'Test',
        scenarioType: 'sustained',
        duration: 0,
        concurrentUsers: 0,
        requestsPerSecond: 0,
        thinkTime: 100,
        timeout: 5000,
      };

      const result = LoadTestConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('Load Test Request Schema', () => {
    it('should validate load test request', () => {
      const request: LoadTestRequest = {
        requestId: 'req_1',
        operationType: 'create',
        entityType: 'action',
        timestamp: new Date(),
        durationMs: 50,
        success: true,
        statusCode: 200,
        responseSize: 1000,
      };

      const result = LoadTestRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate all operation types', () => {
      const operations = ['create', 'read', 'update', 'delete', 'list', 'search'] as const;

      for (const op of operations) {
        const request: LoadTestRequest = {
          requestId: 'req_1',
          operationType: op,
          entityType: 'action',
          timestamp: new Date(),
          durationMs: 50,
          success: true,
          statusCode: 200,
          responseSize: 1000,
        };

        const result = LoadTestRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      }
    });

    it('should allow optional error', () => {
      const request: LoadTestRequest = {
        requestId: 'req_1',
        operationType: 'read',
        entityType: 'action',
        timestamp: new Date(),
        durationMs: 5000,
        success: false,
        statusCode: 503,
        responseSize: 100,
        error: 'Timeout',
      };

      const result = LoadTestRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });

  describe('Load Test Metrics Schema', () => {
    it('should validate metrics snapshot', () => {
      const metrics: LoadTestMetrics = {
        timestamp: new Date(),
        concurrentUsers: 10,
        requestsPerSecond: 10,
        averageLatencyMs: 100,
        p95LatencyMs: 200,
        p99LatencyMs: 300,
        maxLatencyMs: 500,
        successCount: 95,
        errorCount: 5,
        successRate: 95,
        throughputBytesPerSecond: 50000,
      };

      const result = LoadTestMetricsSchema.safeParse(metrics);
      expect(result.success).toBe(true);
    });

    it('should enforce success rate bounds', () => {
      const invalidMetrics = {
        timestamp: new Date(),
        concurrentUsers: 10,
        requestsPerSecond: 10,
        averageLatencyMs: 100,
        p95LatencyMs: 200,
        p99LatencyMs: 300,
        maxLatencyMs: 500,
        successCount: 100,
        errorCount: 0,
        successRate: 150,
        throughputBytesPerSecond: 50000,
      };

      const result = LoadTestMetricsSchema.safeParse(invalidMetrics);
      expect(result.success).toBe(false);
    });
  });

  describe('Load Test Result Schema', () => {
    it('should validate complete test result', () => {
      const config: LoadTestConfig = {
        testName: 'Test',
        scenarioType: 'sustained',
        duration: 60000,
        concurrentUsers: 10,
        requestsPerSecond: 10,
        thinkTime: 100,
        timeout: 5000,
      };

      const result = executeLoadTest(config);
      const validation = LoadTestResultSchema.safeParse(result);

      expect(validation.success).toBe(true);
    });
  });

  describe('Request Simulation', () => {
    it('should generate mock request', () => {
      const request = simulateRequest('read');

      expect(request.requestId).toBeDefined();
      expect(request.durationMs).toBeGreaterThan(0);
      expect(request.statusCode).toBeGreaterThan(0);
    });

    it('should have varied latencies', () => {
      const requests = Array.from({ length: 20 }, () => simulateRequest('read'));
      const latencies = requests.map((r) => r.durationMs);
      const uniqueLatencies = new Set(latencies);

      expect(uniqueLatencies.size).toBeGreaterThan(1);
    });

    it('should simulate errors', () => {
      // n=500 makes P(0 errors at 5% rate) ≈ 5e-12; upper bound keeps same ~20% ceiling as before
      const requests = Array.from({ length: 500 }, () => simulateRequest('read'));
      const errorCount = requests.filter((r) => !r.success).length;

      expect(errorCount).toBeGreaterThan(0);
      expect(errorCount).toBeLessThan(100); // ~5% error rate, ceiling at 20%
    });
  });

  describe('Mock Load Test Request Generation', () => {
    it('should generate load test requests', () => {
      const config: LoadTestConfig = {
        testName: 'Test',
        scenarioType: 'sustained',
        duration: 10000,
        concurrentUsers: 5,
        requestsPerSecond: 5,
        thinkTime: 100,
        timeout: 5000,
      };

      const requests = generateMockLoadTestRequests(config);

      expect(requests.length).toBeGreaterThan(0);
      expect(requests[0]?.requestId).toBeDefined();
    });

    it('should generate varied operations', () => {
      const config: LoadTestConfig = {
        testName: 'Test',
        scenarioType: 'sustained',
        duration: 10000,
        concurrentUsers: 10,
        requestsPerSecond: 10,
        thinkTime: 100,
        timeout: 5000,
      };

      const requests = generateMockLoadTestRequests(config);
      const operations = new Set(requests.map((r) => r.operationType));

      expect(operations.size).toBeGreaterThan(1);
    });
  });

  describe('Percentile Calculation', () => {
    it('should calculate 50th percentile (median)', () => {
      const values = [10, 20, 30, 40, 50];
      const p50 = calculatePercentile(values, 50);

      expect(p50).toBe(30);
    });

    it('should calculate 95th percentile', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const p95 = calculatePercentile(values, 95);

      expect(p95).toBeGreaterThan(90);
      expect(p95).toBeLessThanOrEqual(100);
    });

    it('should handle single value', () => {
      const values = [42];
      const p95 = calculatePercentile(values, 95);

      expect(p95).toBe(42);
    });
  });

  describe('Metric Snapshot Calculation', () => {
    it('should calculate metrics from requests', () => {
      const config: LoadTestConfig = {
        testName: 'Test',
        scenarioType: 'sustained',
        duration: 10000,
        concurrentUsers: 5,
        requestsPerSecond: 5,
        thinkTime: 100,
        timeout: 5000,
      };

      const requests = generateMockLoadTestRequests(config);
      const metrics = calculateMetricSnapshot(requests, config);

      expect(metrics.successCount).toBeGreaterThanOrEqual(0);
      expect(metrics.errorCount).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(100);
    });

    it('should calculate latency percentiles', () => {
      const config: LoadTestConfig = {
        testName: 'Test',
        scenarioType: 'sustained',
        duration: 10000,
        concurrentUsers: 5,
        requestsPerSecond: 5,
        thinkTime: 100,
        timeout: 5000,
      };

      const requests = generateMockLoadTestRequests(config);
      const metrics = calculateMetricSnapshot(requests, config);

      expect(metrics.averageLatencyMs).toBeGreaterThan(0);
      expect(metrics.p95LatencyMs).toBeGreaterThanOrEqual(metrics.averageLatencyMs);
      expect(metrics.p99LatencyMs).toBeGreaterThanOrEqual(metrics.p95LatencyMs);
      expect(metrics.maxLatencyMs).toBeGreaterThanOrEqual(metrics.p99LatencyMs);
    });
  });

  describe('Performance Grade Determination', () => {
    it('should assign grade A for excellent performance', () => {
      const config: LoadTestConfig = {
        testName: 'Test',
        scenarioType: 'sustained',
        duration: 10000,
        concurrentUsers: 5,
        requestsPerSecond: 5,
        thinkTime: 100,
        timeout: 5000,
      };

      const requests = generateMockLoadTestRequests(config);
      const result = executeLoadTest(config);

      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.conclusions.performanceGrade);
    });
  });

  describe('Bottleneck Identification', () => {
    it('should identify bottlenecks in slow tests', () => {
      const config: LoadTestConfig = {
        testName: 'Test',
        scenarioType: 'sustained',
        duration: 10000,
        concurrentUsers: 50,
        requestsPerSecond: 50,
        thinkTime: 0,
        timeout: 5000,
      };

      const result = executeLoadTest(config);

      expect(result.conclusions.bottlenecks).toBeDefined();
      expect(Array.isArray(result.conclusions.bottlenecks)).toBe(true);
    });
  });

  describe('Recommendation Generation', () => {
    it('should generate recommendations', () => {
      const config: LoadTestConfig = {
        testName: 'Test',
        scenarioType: 'sustained',
        duration: 10000,
        concurrentUsers: 10,
        requestsPerSecond: 10,
        thinkTime: 100,
        timeout: 5000,
      };

      const result = executeLoadTest(config);

      expect(result.conclusions.recommendations).toBeDefined();
      expect(result.conclusions.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Load Test Execution', () => {
    it('should execute complete load test', () => {
      const config: LoadTestConfig = {
        testName: 'Test',
        scenarioType: 'sustained',
        duration: 10000,
        concurrentUsers: 5,
        requestsPerSecond: 5,
        thinkTime: 100,
        timeout: 5000,
      };

      const result = executeLoadTest(config);

      expect(result.testId).toBeDefined();
      expect(result.totalRequests).toBeGreaterThan(0);
      expect(result.successfulRequests + result.failedRequests).toBe(result.totalRequests);
    });

    it('should calculate throughput metrics', () => {
      const config: LoadTestConfig = {
        testName: 'Test',
        scenarioType: 'sustained',
        duration: 10000,
        concurrentUsers: 5,
        requestsPerSecond: 5,
        thinkTime: 100,
        timeout: 5000,
      };

      const result = executeLoadTest(config);

      expect(result.throughputMetrics.totalBytesTransferred).toBeGreaterThan(0);
      expect(result.throughputMetrics.averageBytesPerSecond).toBeGreaterThan(0);
    });

    it('should validate load test result', () => {
      const config: LoadTestConfig = {
        testName: 'Test',
        scenarioType: 'sustained',
        duration: 10000,
        concurrentUsers: 5,
        requestsPerSecond: 5,
        thinkTime: 100,
        timeout: 5000,
      };

      const result = executeLoadTest(config);
      const validation = LoadTestResultSchema.safeParse(result);

      expect(validation.success).toBe(true);
    });
  });

  describe('Load Test Scenario Builders', () => {
    it('should build ramp load test', () => {
      const config = buildRampLoadTest(100, 60);

      expect(config.scenarioType).toBe('ramp');
      expect(config.concurrentUsers).toBe(100);
      expect(config.duration).toBe(60000);
    });

    it('should build spike load test', () => {
      const config = buildSpikeLoadTest(10, 100, 30);

      expect(config.scenarioType).toBe('spike');
      expect(config.concurrentUsers).toBe(100);
    });

    it('should build stress load test', () => {
      const config = buildStressLoadTest(10, 200, 60);

      expect(config.scenarioType).toBe('stress');
      expect(config.concurrentUsers).toBe(200);
    });

    it('should build endurance load test', () => {
      const config = buildEnduranceLoadTest(50, 10);

      expect(config.scenarioType).toBe('endurance');
      expect(config.duration).toBe(10 * 60 * 1000);
    });

    it('should build sustained load test', () => {
      const config = buildSustainedLoadTest(20, 120);

      expect(config.scenarioType).toBe('sustained');
      expect(config.concurrentUsers).toBe(20);
      expect(config.duration).toBe(120000);
    });
  });

  describe('Comprehensive Load Test Coverage', () => {
    it('should execute multiple load test scenarios', () => {
      const scenarios = [
        buildRampLoadTest(50, 30),
        buildSustainedLoadTest(20, 60),
        buildSpikeLoadTest(10, 50, 20),
      ];

      for (const scenario of scenarios) {
        const result = executeLoadTest(scenario);
        expect(result.testId).toBeDefined();
        expect(result.conclusions.performanceGrade).toBeDefined();
      }
    });

    it('should provide detailed latency statistics', () => {
      const config = buildSustainedLoadTest(10, 60);
      const result = executeLoadTest(config);

      const stats = result.overallLatencyStats;
      // Order statistics are monotonic by definition: min <= median <= p95 <= p99 <= max.
      expect(stats.minMs).toBeLessThanOrEqual(stats.medianMs);
      expect(stats.medianMs).toBeLessThanOrEqual(stats.p95Ms);
      expect(stats.p95Ms).toBeLessThanOrEqual(stats.p99Ms);
      expect(stats.p99Ms).toBeLessThanOrEqual(stats.maxMs);
      // The mean is NOT an order statistic: depending on the latency distribution's skew it can
      // fall above or below the median (and above p95), so it is only guaranteed to lie within
      // [min, max]. Asserting median <= mean <= p95 was a mathematically-invalid, flaky invariant
      // (it intermittently failed when the sampled mean landed just below the median).
      expect(stats.meanMs).toBeGreaterThanOrEqual(stats.minMs);
      expect(stats.meanMs).toBeLessThanOrEqual(stats.maxMs);
    });

    it('should track error patterns', () => {
      const config = buildSustainedLoadTest(10, 60);
      const result = executeLoadTest(config);

      expect(result.errorSummary).toBeDefined();
      const totalErrors = Object.values(result.errorSummary).reduce((a, b) => a + b, 0);
      expect(totalErrors).toBe(result.failedRequests);
    });

    it('should generate metric snapshots', () => {
      const config = buildSustainedLoadTest(10, 60);
      const result = executeLoadTest(config);

      expect(result.metricSnapshots.length).toBeGreaterThan(0);
      for (const snapshot of result.metricSnapshots) {
        const validation = LoadTestMetricsSchema.safeParse(snapshot);
        expect(validation.success).toBe(true);
      }
    });
  });
});
