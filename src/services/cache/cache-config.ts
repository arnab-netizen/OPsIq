export const CACHE_TTLS = {
  RISK_DASHBOARD: 300, // 5 minutes
  TIMESERIES_SNAPSHOT: 600, // 10 minutes
  THRESHOLDS: 1800, // 30 minutes (less volatile)
  DECISION_COMPARISON: 600, // 10 minutes
  GUARDRAIL_METRICS: 300, // 5 minutes
  ALERT_STATUS: 180, // 3 minutes (fast feedback)
} as const;
