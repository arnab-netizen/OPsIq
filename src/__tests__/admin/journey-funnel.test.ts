/**
 * SEA_OBSERVABILITY_VIEW — the operator funnel is aggregates only. Privacy is asserted structurally: the service
 * selects ONLY workspace ids (never a payload), counts raw occurrences with COUNT, and each event is bounded on its own.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FUNNEL_EVENT_NAMES, FUNNEL_STEPS, FAILURE_CATEGORIES } from "@/domain/admin/journey-funnel";
import { PRODUCT_EVENTS } from "@/domain/analytics/product-events";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const findMany = vi.hoisted(() => vi.fn());
const count = vi.hoisted(() => vi.fn());
vi.mock("@/infra/audit", () => ({ getAuditEventReadOnlyClient: () => ({ findMany, count }) }));

import { FUNNEL_MAX_ROWS, getJourneyFunnel } from "@/services/admin/journey-funnel.service";

beforeEach(() => { findMany.mockReset(); count.mockReset(); });

describe("funnel definition", () => {
  it("every step and failure category is a real, governed event name", () => {
    const known = new Set<string>(Object.values(AUDIT_EVENTS));
    for (const name of FUNNEL_EVENT_NAMES) expect(known.has(name), name).toBe(true);
    const productNames = new Set<string>(Object.values(PRODUCT_EVENTS));
    for (const step of FUNNEL_STEPS) expect(productNames.has(step.eventName), step.key).toBe(true);
    expect(FAILURE_CATEGORIES.map((f) => f.key)).toEqual(["signup_refused_closed", "signup_refused_capacity", "verification_email_not_sent"]);
  });
  it("the two anonymous pre-account steps are labelled approximate (a spammable beacon feeds them)", () => {
    for (const key of ["start_free_clicked", "signup_started"]) {
      const step = FUNNEL_STEPS.find((s) => s.key === key)!;
      expect(step.unit).toBe("attempts");
      expect(step.label).toMatch(/approximate/i);
    }
  });
});

describe("getJourneyFunnel", () => {
  it("counts raw occurrences with COUNT and distinct workspaces with ids only (no payload, actor, entity or email)", async () => {
    count.mockResolvedValue(3);
    findMany.mockResolvedValue([{ workspaceId: "w1" }, { workspaceId: "w2" }]);
    const now = new Date("2026-10-10T12:00:00Z");
    const out = await getJourneyFunnel(7, now);
    const since = new Date("2026-10-03T12:00:00Z");
    for (const call of findMany.mock.calls) {
      const a = call[0];
      expect(a.select).toEqual({ workspaceId: true });
      expect(a.distinct).toEqual(["workspaceId"]);
      expect(a.where.occurredAt.gte).toEqual(since);
      expect(a.take).toBe(FUNNEL_MAX_ROWS + 1);
      expect(JSON.stringify(a.select)).not.toMatch(/payload|actor|entity|email/);
    }
    for (const call of count.mock.calls) expect(call[0].where.occurredAt.gte).toEqual(since);
    expect(out.steps.find((s) => s.key === "start_free_clicked")!.count).toBe(3); // exact COUNT
    expect(out.steps.find((s) => s.key === "email_verified")!.count).toBe(2); // distinct workspaces
    expect(out.failures.every((f) => f.count === 3)).toBe(true);
    expect(out.truncated).toBe(false);
  });
  it("a flood of one event type cannot crowd out another: every event is queried on its own", async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);
    await getJourneyFunnel(7);
    const queried = [...findMany.mock.calls, ...count.mock.calls].map((c) => c[0].where.eventName);
    expect(new Set(queried)).toEqual(new Set(FUNNEL_EVENT_NAMES));
  });
  it("clamps the window and flags a bounded step instead of silently under-counting", async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue(Array.from({ length: FUNNEL_MAX_ROWS + 1 }, (_, i) => ({ workspaceId: `w${i}` })));
    const out = await getJourneyFunnel(10_000);
    expect(out.windowDays).toBe(90);
    expect(out.truncated).toBe(true);
    expect(out.steps.find((s) => s.key === "cockpit_reached")!.count).toBe(FUNNEL_MAX_ROWS);
    expect((await getJourneyFunnel(0)).windowDays).toBe(1);
  });
  it("the result carries counts and labels only", async () => {
    count.mockResolvedValue(1);
    findMany.mockResolvedValue([{ workspaceId: "11111111-1111-4111-8111-111111111111" }]);
    const out = await getJourneyFunnel(7);
    expect(JSON.stringify(out)).not.toMatch(/11111111-1111|@/);
    for (const item of [...out.steps, ...out.failures]) expect(Object.keys(item).sort()).toEqual(["count", "key", "label"]);
  });
});
