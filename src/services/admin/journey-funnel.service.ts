/**
 * Read-only operator view of the signup → first-value journey for the last N days. Counts only (event names and
 * workspace ids go in, aggregates come out): it never selects payloads, emails, tokens or financial values, and it
 * reads audit_events through the read-only accessor. Each event is counted on its own and bounded per event, so a flood
 * of one event type (anonymous beacons can be spammed) cannot crowd out the counts of the others.
 */
import { getAuditEventReadOnlyClient } from "@/infra/audit";
import { FAILURE_CATEGORIES, FUNNEL_STEPS, type FunnelCount } from "@/domain/admin/journey-funnel";

/** Most distinct workspaces read for one step; beyond it the step is reported as a minimum. */
export const FUNNEL_MAX_ROWS = 5_000;

export interface JourneyFunnel {
  windowDays: number;
  since: string;
  steps: FunnelCount[];
  failures: FunnelCount[];
  /** True when a step hit its bound: that count is a lower bound. */
  truncated: boolean;
}

export async function getJourneyFunnel(windowDays = 7, now: Date = new Date()): Promise<JourneyFunnel> {
  const days = Math.min(Math.max(Math.trunc(windowDays), 1), 90);
  const since = new Date(now.getTime() - days * 86_400_000);
  const audit = getAuditEventReadOnlyClient();
  let truncated = false;

  // Raw occurrences (events with no workspace yet, and failures): an exact COUNT, no rows read.
  const occurrences = (eventName: string) => audit.count({ where: { eventName, occurredAt: { gte: since } } });
  // Distinct workspaces: one id per workspace, bounded.
  const workspaces = async (eventName: string): Promise<number> => {
    const rows = await audit.findMany({
      where: { eventName, occurredAt: { gte: since }, workspaceId: { not: null } },
      distinct: ["workspaceId"],
      select: { workspaceId: true },
      take: FUNNEL_MAX_ROWS + 1,
    });
    if (rows.length > FUNNEL_MAX_ROWS) {
      truncated = true;
      return FUNNEL_MAX_ROWS;
    }
    return rows.length;
  };

  const steps: FunnelCount[] = await Promise.all(
    FUNNEL_STEPS.map(async (s) => ({ key: s.key, label: s.label, count: s.unit === "attempts" ? await occurrences(s.eventName) : await workspaces(s.eventName) })),
  );
  const failures: FunnelCount[] = await Promise.all(
    FAILURE_CATEGORIES.map(async (f) => ({ key: f.key, label: f.label, count: await occurrences(f.eventName) })),
  );
  return { windowDays: days, since: since.toISOString(), steps, failures, truncated };
}
