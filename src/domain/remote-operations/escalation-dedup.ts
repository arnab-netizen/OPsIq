/**
 * R18 — Escalation deduplication + fatigue control (§60, §61). Pure.
 *
 * Prevents alert spam: related alerts are grouped by task/location/issue, identical repeated
 * alerts without a status change are suppressed, escalation fires only when a threshold is
 * crossed, and repeated non-response collapses into one higher-level exception. Alert history
 * is preserved (suppression ≠ deletion).
 */

export interface RemoteAlert {
  /** Grouping key, e.g. `loc:B` or `task:123` or `issue:9`. */
  groupKey: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** A status token; an alert with the same groupKey + status as the last sent is a duplicate. */
  status: string;
}

export interface DedupResult {
  toSend: RemoteAlert[];
  suppressed: RemoteAlert[];
}

/** Suppress alerts whose (groupKey,status) was already sent. `lastSent` maps groupKey→status. */
export function dedupeAlerts(alerts: readonly RemoteAlert[], lastSent: ReadonlyMap<string, string>): DedupResult {
  const toSend: RemoteAlert[] = [];
  const suppressed: RemoteAlert[] = [];
  const sentThisRound = new Map<string, string>();
  for (const a of alerts) {
    const prior = sentThisRound.get(a.groupKey) ?? lastSent.get(a.groupKey);
    if (prior === a.status) suppressed.push(a);
    else { toSend.push(a); sentThisRound.set(a.groupKey, a.status); }
  }
  return { toSend, suppressed };
}

export interface GroupedAlert {
  groupKey: string;
  count: number;
  maxSeverity: RemoteAlert["severity"];
  summary: string;
}

const SEV_RANK: Record<RemoteAlert["severity"], number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/** Group related alerts into one decision-grade summary line per group. */
export function groupAlerts(alerts: readonly RemoteAlert[]): GroupedAlert[] {
  const groups = new Map<string, RemoteAlert[]>();
  for (const a of alerts) {
    if (!groups.has(a.groupKey)) groups.set(a.groupKey, []);
    groups.get(a.groupKey)!.push(a);
  }
  return [...groups.entries()].map(([groupKey, list]) => {
    const maxSeverity = list.reduce<RemoteAlert["severity"]>((m, a) => (SEV_RANK[a.severity] > SEV_RANK[m] ? a.severity : m), "INFO");
    return { groupKey, count: list.length, maxSeverity, summary: `${groupKey}: ${list.length} alert(s), max ${maxSeverity}` };
  });
}

/** Escalate a group only when the count crosses the threshold (repeated non-response → one exception). */
export function groupEscalates(group: GroupedAlert, threshold: number): boolean {
  return group.count >= threshold || group.maxSeverity === "CRITICAL";
}
