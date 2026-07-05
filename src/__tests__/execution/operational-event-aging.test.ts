/**
 * Operational-event resolution + aging — pure domain. Status FSM (fail-closed note/reason,
 * terminal-lock, reopen), severity-scaled overdue thresholds computed from the server-trusted
 * createdAt, active/terminal classification, and the owner-facing aging summary + escalation.
 */
import { describe, it, expect } from "vitest";
import {
  planStatusChange, buildOperationalEventAging, isActiveStatus, isTerminalStatus,
  OperationalEventStatus, OVERDUE_THRESHOLD_MS,
  type AgingEventRow,
} from "@/domain/execution/operational-event-aging";

const NOW = Date.parse("2026-07-05T00:00:00.000Z");
const AT = new Date(NOW).toISOString();
const H = 3_600_000;

describe("operational-event status FSM", () => {
  it("classifies active vs terminal statuses", () => {
    expect(isActiveStatus("OPEN")).toBe(true);
    expect(isActiveStatus("IN_REVIEW")).toBe(true);
    expect(isActiveStatus("RESOLVED")).toBe(false);
    expect(isTerminalStatus("DISMISSED")).toBe(true);
    expect(isTerminalStatus("DUPLICATE")).toBe(true);
  });

  it("requires a note to resolve and a note + reason to dismiss (fail-closed)", () => {
    expect(planStatusChange({ currentStatus: "OPEN", targetStatus: "RESOLVED", severity: "HIGH" }).ok).toBe(false);
    const ok = planStatusChange({ currentStatus: "OPEN", targetStatus: "RESOLVED", severity: "HIGH", note: "recleaned + delivered" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.plan.outcome).toBe("RESOLVED_FIXED");
    // Dismiss with a note but no reason fails (never a silent drop).
    expect(planStatusChange({ currentStatus: "OPEN", targetStatus: "DISMISSED", severity: "CRITICAL", note: "looked into it" }).ok).toBe(false);
    const dis = planStatusChange({ currentStatus: "OPEN", targetStatus: "DISMISSED", severity: "CRITICAL", note: "checked", reason: "customer withdrew the complaint" });
    expect(dis.ok).toBe(true);
    if (dis.ok) { expect(dis.plan.reason).toBe("customer withdrew the complaint"); expect(dis.plan.isTerminal).toBe(true); }
  });

  it("locks terminal events, validates the status value, and allows only IN_REVIEW→OPEN reopen", () => {
    expect(planStatusChange({ currentStatus: "RESOLVED", targetStatus: "OPEN", severity: "LOW" }).ok).toBe(false);
    expect(planStatusChange({ currentStatus: "OPEN", targetStatus: "NONSENSE", severity: "LOW" }).ok).toBe(false);
    expect(planStatusChange({ currentStatus: "OPEN", targetStatus: "OPEN", severity: "LOW" }).ok).toBe(false); // OPEN→OPEN not a reopen
    expect(planStatusChange({ currentStatus: "IN_REVIEW", targetStatus: "OPEN", severity: "LOW" }).ok).toBe(true);
    expect(planStatusChange({ currentStatus: "OPEN", targetStatus: "IN_REVIEW", severity: "LOW" }).ok).toBe(true);
  });
});

const ev = (over: Partial<AgingEventRow> = {}): AgingEventRow => ({
  id: "e1", eventType: "COMPLAINT", category: "QUALITY_COMPLAINT", severity: "HIGH", status: "OPEN",
  relatedProofId: "p1", relatedActionId: null, description: "stain remained",
  createdAt: new Date(NOW - 10 * H), resolvedAt: null, updatedAt: new Date(NOW - 10 * H), ...over,
});

describe("operational-event aging", () => {
  it("computes age from server createdAt and flags overdue by severity threshold", () => {
    // HIGH threshold is 48h; a 10h-old open event is NOT overdue.
    const fresh = buildOperationalEventAging("ws-1", [ev()], NOW, AT);
    expect(fresh.events[0].ageMs).toBe(10 * H);
    expect(fresh.events[0].overdue).toBe(false);
    expect(fresh.openCount).toBe(1);
    expect(fresh.activeCount).toBe(1);
    // A 60h-old HIGH open event IS overdue and escalates.
    const old = buildOperationalEventAging("ws-1", [ev({ createdAt: new Date(NOW - 60 * H), updatedAt: new Date(NOW - 60 * H) })], NOW, AT);
    expect(old.events[0].overdue).toBe(true);
    expect(old.overdueCount).toBe(1);
    expect(old.overdueSevereCount).toBe(1);
    expect(old.escalationTriggered).toBe(true);
    expect(old.events[0].escalationTrigger).toMatch(/reassessment/i);
  });

  it("severity scales the overdue window (a MEDIUM event tolerates a longer age than HIGH)", () => {
    expect(OVERDUE_THRESHOLD_MS.HIGH).toBeLessThan(OVERDUE_THRESHOLD_MS.MEDIUM);
    // A 60h-old MEDIUM event (threshold 120h) is NOT overdue, unlike the HIGH one above.
    const med = buildOperationalEventAging("ws-1", [ev({ severity: "MEDIUM", createdAt: new Date(NOW - 60 * H), updatedAt: new Date(NOW - 60 * H) })], NOW, AT);
    expect(med.events[0].overdue).toBe(false);
  });

  it("a resolved event is no longer active and does not count as open/overdue", () => {
    const resolved = buildOperationalEventAging("ws-1", [ev({ status: "RESOLVED", createdAt: new Date(NOW - 60 * H), resolvedAt: new Date(NOW - 40 * H), updatedAt: new Date(NOW - 40 * H) })], NOW, AT);
    expect(resolved.events[0].active).toBe(false);
    expect(resolved.events[0].overdue).toBe(false);
    expect(resolved.openCount).toBe(0);
    expect(resolved.activeCount).toBe(0);
    expect(resolved.resolvedCount).toBe(1);
    expect(resolved.escalationTriggered).toBe(false);
    // unresolvedAge is frozen at resolution (20h), not the full 60h age.
    expect(resolved.events[0].unresolvedAgeMs).toBe(20 * H);
  });

  it("ranks the most urgent active event first (overdue + severity, then oldest)", () => {
    const events = [
      ev({ id: "low-open", severity: "LOW", createdAt: new Date(NOW - 5 * H), updatedAt: new Date(NOW - 5 * H) }),
      ev({ id: "high-overdue", severity: "HIGH", createdAt: new Date(NOW - 60 * H), updatedAt: new Date(NOW - 60 * H) }),
      ev({ id: "done", status: "DISMISSED", createdAt: new Date(NOW - 80 * H), resolvedAt: new Date(NOW - 1 * H), updatedAt: new Date(NOW - 1 * H) }),
    ];
    const a = buildOperationalEventAging("ws-1", events, NOW, AT);
    expect(a.topActiveEvent?.eventId).toBe("high-overdue");
    expect(a.dismissedCount).toBe(1);
    expect(a.recommendedAction).toMatch(/escalate/i);
  });

  it("fabricates nothing for an empty workspace", () => {
    const a = buildOperationalEventAging("ws-clean", [], NOW, AT);
    expect(a.activeCount).toBe(0);
    expect(a.topActiveEvent).toBeNull();
    expect(a.escalationTriggered).toBe(false);
    expect(a.recommendedAction).toMatch(/no open/i);
  });
});
