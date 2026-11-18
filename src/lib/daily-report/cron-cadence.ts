/**
 * A deliberately small cron-cadence estimator -- not a full cron engine -- covering the patterns
 * actually used by this repo's own scheduled workflows (daily at a fixed minute/hour, monthly on a
 * fixed day, and the common "every N minutes/hours" step forms). No new dependency: js-yaml is
 * already a devDependency used to parse the workflow files; this module is pure arithmetic on the
 * parsed cron string.
 *
 * `estimateCronIntervalMs` returns null when the expression's shape isn't one of the patterns below --
 * callers must treat null as "cadence unknown", never guess a number, since a wrong guess could mask
 * (or manufacture) an overdue alert.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function parseField(field: string): { kind: "any" } | { kind: "value"; value: number } | { kind: "step"; step: number } | { kind: "list"; values: number[] } | { kind: "unsupported" } {
  if (field === "*") return { kind: "any" };
  const stepMatch = /^\*\/(\d+)$/.exec(field);
  if (stepMatch) return { kind: "step", step: Number(stepMatch[1]) };
  if (/^\d+$/.test(field)) return { kind: "value", value: Number(field) };
  if (/^\d+(,\d+)+$/.test(field)) return { kind: "list", values: field.split(",").map(Number) };
  return { kind: "unsupported" };
}

/**
 * Best-effort expected interval between occurrences of a standard 5-field cron expression
 * ("minute hour day-of-month month day-of-week"), in milliseconds. Returns null for any shape not
 * explicitly recognized (ranges, step-of-dom/month, combined dom+dow, etc).
 */
export function estimateCronIntervalMs(cronExpr: string): number | null {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dom, month, dow] = parts.map(parseField);

  if (month.kind !== "any") return null; // yearly/month-specific schedules are out of scope for this estimator

  // Monthly: fixed day-of-month, any day-of-week, fixed-or-any hour/minute.
  if (dom.kind === "value" && dow.kind === "any") {
    return 28 * DAY_MS; // conservative lower bound for "once a month" (shortest month)
  }

  // Weekly: any day-of-month, fixed day-of-week.
  if (dom.kind === "any" && (dow.kind === "value" || dow.kind === "list")) {
    return 7 * DAY_MS;
  }

  // Daily-or-more-frequent: any/every day-of-month and day-of-week.
  if (dom.kind === "any" && dow.kind === "any") {
    if (hour.kind === "step") return hour.step * HOUR_MS;
    if (hour.kind === "value" || hour.kind === "list") {
      // Fixed hour(s): once a day if a single hour, else the gap implied by how many fire slots/day.
      const count = hour.kind === "list" ? hour.values.length : 1;
      return Math.round(DAY_MS / count);
    }
    if (hour.kind === "any") {
      if (minute.kind === "step") return minute.step * 60 * 1000;
      if (minute.kind === "value" || minute.kind === "list") return HOUR_MS; // fixed minute(s) every hour
    }
  }

  return null;
}

/**
 * Whether `lastRunAt` is overdue against `cronExpr`'s estimated cadence, with a grace multiplier to
 * absorb normal scheduler jitter/GitHub Actions scheduling delay. Returns null (cadence unknown --
 * never guess) when the expression isn't one of the recognized shapes.
 */
export function isOverdue(lastRunAt: Date, cronExpr: string, now: Date, graceMultiplier = 2): boolean | null {
  const interval = estimateCronIntervalMs(cronExpr);
  if (interval === null) return null;
  return now.getTime() - lastRunAt.getTime() > interval * graceMultiplier;
}
