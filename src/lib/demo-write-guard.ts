/**
 * Demo-write guard (Phase 0 truth/safety correction).
 *
 * A few growth engines persist ONLY to in-memory `static Map`s (PricingEngine,
 * RetentionEngine). That data is lost on restart and is not safe across multiple
 * instances, and no audit event is emitted. Until those engines are backed by
 * durable, tenant-scoped, audited storage, their write routes MUST NOT behave
 * like production endpoints.
 *
 * This guard fails closed: in production it BLOCKS the write with a clear
 * `NOT_PERSISTED_DEMO_ONLY` 503; outside production it allows the demo path so
 * local/dev/test flows still work. This keeps a production-looking write route
 * from silently accepting data that will vanish.
 */

/** Features whose writes are backed only by non-durable in-memory storage.
 * Empty: all growth write routes are now DB-backed with audit events.
 */
export const IN_MEMORY_DEMO_WRITE_FEATURES = [] as const;
export type DemoWriteFeature = (typeof IN_MEMORY_DEMO_WRITE_FEATURES)[number];

/** True only in a production runtime. */
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export interface DemoWriteEvaluation {
  blocked: boolean;
  feature: DemoWriteFeature;
  reason: string;
}

/**
 * Decide whether a demo-only (in-memory) write must be blocked. Blocked in
 * production; allowed elsewhere.
 */
export function evaluateDemoWrite(feature: DemoWriteFeature): DemoWriteEvaluation {
  if (isProductionRuntime()) {
    return {
      blocked: true,
      feature,
      reason:
        `"${feature}" is a non-persistent demo-only feature (in-memory storage, no audit) ` +
        `and is disabled in production until durable, tenant-scoped, audited persistence exists.`,
    };
  }
  return { blocked: false, feature, reason: "" };
}

/**
 * Standard 503 response for a blocked demo-only write. The body is explicit that
 * the feature is non-production and non-persistent.
 */
export function demoOnlyBlockedResponse(feature: DemoWriteFeature): Response {
  const evaluation = evaluateDemoWrite(feature);
  return Response.json(
    {
      error: evaluation.reason || `"${feature}" is demo-only and not available in production.`,
      code: "NOT_PERSISTED_DEMO_ONLY",
      feature,
      persistence: "in-memory",
      productionEnabled: false,
    },
    { status: 503 },
  );
}
