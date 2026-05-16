/**
 * PHASE I-5: CIRCUIT BREAKER + BACKPRESSURE
 *
 * Prevent cascading failures through:
 * - Circuit breaker state machine
 * - Retry budgets
 * - Exponential backoff
 * - Request shedding
 * - Concurrency ceilings
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failure_threshold: number; // % of requests that trigger open
  success_threshold: number; // # of successes to close from half-open
  timeout_ms: number; // How long to wait before half-open
  min_requests_before_eval: number; // Min requests to evaluate threshold
  max_concurrent_requests: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  total_requests: number;
  last_failure_time?: Date;
  opened_at?: Date;
  failure_rate: number;
}

class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures: number = 0;
  private successes: number = 0;
  private total_requests: number = 0;
  private last_failure_time?: Date;
  private opened_at?: Date;
  private config: CircuitBreakerConfig;
  private concurrent_requests: number = 0;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (this.shouldAttemptReset()) {
        this.state = "HALF_OPEN";
      } else {
        throw new Error(
          `Circuit breaker OPEN. Retry after ${this.timeUntilReset()}ms`,
        );
      }
    }

    if (this.concurrent_requests >= this.config.max_concurrent_requests) {
      throw new Error(
        `Request shedding - max concurrent requests (${this.config.max_concurrent_requests}) exceeded`,
      );
    }

    this.concurrent_requests++;
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    } finally {
      this.concurrent_requests--;
    }
  }

  private recordSuccess(): void {
    this.successes++;
    this.total_requests++;

    if (this.state === "HALF_OPEN") {
      if (this.successes >= this.config.success_threshold) {
        this.reset();
      }
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.total_requests++;
    this.last_failure_time = new Date();

    if (this.total_requests >= this.config.min_requests_before_eval) {
      const failure_rate = this.getFailureRate();
      if (failure_rate > this.config.failure_threshold / 100) {
        this.open();
      }
    }
  }

  private open(): void {
    this.state = "OPEN";
    this.opened_at = new Date();
  }

  private reset(): void {
    this.state = "CLOSED";
    this.failures = 0;
    this.successes = 0;
    this.total_requests = 0;
    this.opened_at = undefined;
  }

  private shouldAttemptReset(): boolean {
    if (!this.opened_at) return false;
    const elapsed = Date.now() - this.opened_at.getTime();
    return elapsed > this.config.timeout_ms;
  }

  private getFailureRate(): number {
    if (this.total_requests === 0) return 0;
    return (this.failures / this.total_requests) * 100;
  }

  private timeUntilReset(): number {
    if (!this.opened_at) return 0;
    const elapsed = Date.now() - this.opened_at.getTime();
    return Math.max(0, this.config.timeout_ms - elapsed);
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      total_requests: this.total_requests,
      last_failure_time: this.last_failure_time,
      opened_at: this.opened_at,
      failure_rate: this.getFailureRate(),
    };
  }

  getState(): CircuitState {
    return this.state;
  }
}

class RetryBudget {
  private max_retries: number;
  private current_retries: number = 0;
  private reset_interval_ms: number;
  private last_reset: Date = new Date();

  constructor(max_retries: number, reset_interval_ms: number = 60000) {
    this.max_retries = max_retries;
    this.reset_interval_ms = reset_interval_ms;
  }

  canRetry(): boolean {
    this.resetIfNeeded();
    return this.current_retries < this.max_retries;
  }

  recordRetry(): void {
    this.resetIfNeeded();
    this.current_retries++;
  }

  private resetIfNeeded(): void {
    const now = new Date();
    const elapsed = now.getTime() - this.last_reset.getTime();
    if (elapsed > this.reset_interval_ms) {
      this.current_retries = 0;
      this.last_reset = now;
    }
  }

  getRemainingBudget(): number {
    this.resetIfNeeded();
    return Math.max(0, this.max_retries - this.current_retries);
  }
}

class ExponentialBackoff {
  private initial_ms: number;
  private max_ms: number;
  private multiplier: number;
  private jitter_factor: number;

  constructor(
    initial_ms: number = 100,
    max_ms: number = 30000,
    multiplier: number = 2,
    jitter_factor: number = 0.1,
  ) {
    this.initial_ms = initial_ms;
    this.max_ms = max_ms;
    this.multiplier = multiplier;
    this.jitter_factor = jitter_factor;
  }

  getDelayMs(attempt: number): number {
    const delay = Math.min(
      this.max_ms,
      this.initial_ms * Math.pow(this.multiplier, attempt),
    );

    // Add jitter: ± jitter_factor % of delay
    const jitter = delay * this.jitter_factor * (Math.random() * 2 - 1);
    return Math.max(0, delay + jitter);
  }

  async waitBeforeRetry(attempt: number): Promise<void> {
    const delay = this.getDelayMs(attempt);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

class RequestShedding {
  private max_queue_size: number;
  private current_queue_size: number = 0;

  constructor(max_queue_size: number = 1000) {
    this.max_queue_size = max_queue_size;
  }

  canAccept(): boolean {
    return this.current_queue_size < this.max_queue_size;
  }

  enqueue(): void {
    if (!this.canAccept()) {
      throw new Error("Request queue full - request shedding active");
    }
    this.current_queue_size++;
  }

  dequeue(): void {
    this.current_queue_size = Math.max(0, this.current_queue_size - 1);
  }

  getQueueSize(): number {
    return this.current_queue_size;
  }

  getQueueUtilization(): number {
    return (this.current_queue_size / this.max_queue_size) * 100;
  }
}

export { CircuitBreaker, RetryBudget, ExponentialBackoff, RequestShedding };
