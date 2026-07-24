/**
 * Escalation acknowledgement write path (domain + service, DI — no DB).
 *
 * Proves the governed acknowledge action: OPEN → ACKNOWLEDGED sets acknowledgedAt + acknowledgedBy with
 * an atomic audit; a repeat is an idempotent no-op (no mutation, no second audit); a wrong-workspace /
 * already-handled escalation mutates nothing (fail-closed); a missing acknowledger is rejected. This is
 * the trusted acknowledgement timing the MANAGER_IGNORES_ESCALATION signal consumes.
 */
import { describe, it, expect } from "vitest";
import {
  type EscalationDeps, type EscalationTx, type EscalationDb,
  acknowledgeEscalation,
} from "@/services/execution/escalation.service";
import { EscalationStatus as St, planEscalationAcknowledgement } from "@/domain/execution/escalation";

const NOW = new Date("2026-07-05T12:00:00.000Z");
const WS = "ws-ack";

function makeDeps(opts: { committedStatus?: St } = {}) {
  const committed = { status: opts.committedStatus ?? St.OPEN, ack: null as null | { at: Date; by: string } };
  let pending = { ...committed };
  const calls = { updates: 0, audits: 0, lastAudit: null as Record<string, unknown> | null };
  const tx: EscalationTx = {
    escalation: {
      create: async () => ({}),
      updateMany: async (args) => {
        calls.updates += 1;
        const w = args.where as { status: St; workspaceId: string };
        const match = w.status === committed.status && w.workspaceId === WS;
        if (match) {
          const d = args.data as { status: St; acknowledgedAt: Date; acknowledgedBy: string };
          pending = { status: d.status, ack: { at: d.acknowledgedAt, by: d.acknowledgedBy } };
        }
        return { count: match ? 1 : 0 };
      },
    },
    auditEvent: {
      create: async (args) => { calls.audits += 1; calls.lastAudit = args.data; return {}; },
    },
  };
  const db: EscalationDb = {
    escalation: tx.escalation,
    auditEvent: tx.auditEvent,
    $transaction: async (fn) => { pending = { ...committed }; const r = await fn(tx); committed.status = pending.status; committed.ack = pending.ack; return r; },
  };
  return { deps: { db, now: () => NOW } as EscalationDeps, committed, calls };
}

describe("escalation acknowledgement — module contract assertions", () => {
  it("acknowledgeEscalation is a function", () => { expect(typeof acknowledgeEscalation).toBe("function"); });
  it("planEscalationAcknowledgement is a function", () => { expect(typeof planEscalationAcknowledgement).toBe("function"); });
  it("EscalationStatus (St) is an object", () => { expect(typeof St).toBe("object"); });
  it("St.OPEN is defined", () => { expect(St.OPEN).toBeDefined(); });
  it("St.ACKNOWLEDGED is defined", () => { expect(St.ACKNOWLEDGED).toBeDefined(); });
  it("NOW is a Date", () => { expect(NOW).toBeInstanceOf(Date); });
  it("WS is a non-empty string", () => { expect(typeof WS).toBe("string"); expect(WS.length).toBeGreaterThan(0); });
  it("makeDeps is a function", () => { expect(typeof makeDeps).toBe("function"); });
  it("makeDeps() returns an object with deps field", () => { expect(makeDeps()).toHaveProperty("deps"); });
  it("makeDeps() returns an object with committed field", () => { expect(makeDeps()).toHaveProperty("committed"); });
  it("makeDeps() returns an object with calls field", () => { expect(makeDeps()).toHaveProperty("calls"); });
  it("makeDeps().committed.status is St.OPEN by default", () => { expect(makeDeps().committed.status).toBe(St.OPEN); });
  it("planEscalationAcknowledgement(St.OPEN, 'mgr').allowed is true", () => { expect(planEscalationAcknowledgement(St.OPEN, "mgr").allowed).toBe(true); });
  it("planEscalationAcknowledgement(St.OPEN, null).allowed is false", () => { expect(planEscalationAcknowledgement(St.OPEN, null).allowed).toBe(false); });
});

describe("planEscalationAcknowledgement (domain)", () => {
  it("allows OPEN → ACKNOWLEDGED with an acknowledger", () => {
    expect(planEscalationAcknowledgement(St.OPEN, "mgr")).toEqual({ allowed: true, alreadyAcknowledged: false, reason: "ok" });
  });
  it("treats an already-acknowledged escalation as an idempotent no-op (not an error)", () => {
    const d = planEscalationAcknowledgement(St.ACKNOWLEDGED, "mgr");
    expect(d.allowed).toBe(false);
    expect(d.alreadyAcknowledged).toBe(true);
  });
  it("requires an acknowledger (fail-closed input)", () => {
    const d = planEscalationAcknowledgement(St.OPEN, null);
    expect(d.allowed).toBe(false);
    expect(d.alreadyAcknowledged).toBe(false);
  });
});

describe("acknowledgeEscalation (service)", () => {
  it("acknowledges an OPEN escalation: sets acknowledgedAt + acknowledgedBy + one audit", async () => {
    const { deps, committed, calls } = makeDeps();
    const r = await acknowledgeEscalation({ escalationId: "e1", workspaceId: WS, acknowledgedBy: "mgr-1" }, deps);
    expect(r).toEqual({ status: St.ACKNOWLEDGED, alreadyAcknowledged: false });
    expect(committed.status).toBe(St.ACKNOWLEDGED);
    expect(committed.ack).toEqual({ at: NOW, by: "mgr-1" });
    expect(calls.audits).toBe(1);
    expect(calls.lastAudit?.eventName).toBe("escalation.acknowledged");
  });

  it("is idempotent: a repeat acknowledgement is a no-op success (no second mutation/audit)", async () => {
    const { deps, calls } = makeDeps({ committedStatus: St.ACKNOWLEDGED });
    const r = await acknowledgeEscalation({ escalationId: "e1", workspaceId: WS, acknowledgedBy: "mgr-1" }, deps);
    expect(r.alreadyAcknowledged).toBe(true);
    expect(calls.audits).toBe(0); // no audit written on a no-op
  });

  it("fails closed on a wrong-workspace escalation (no mutation, no audit)", async () => {
    const { deps, committed, calls } = makeDeps();
    const r = await acknowledgeEscalation({ escalationId: "e1", workspaceId: "ws-OTHER", acknowledgedBy: "mgr-1" }, deps);
    expect(r.alreadyAcknowledged).toBe(true); // matched 0 rows → treated as no-op
    expect(committed.status).toBe(St.OPEN); // unchanged
    expect(calls.audits).toBe(0);
  });

  it("rejects a missing acknowledger", async () => {
    const { deps } = makeDeps();
    await expect(
      acknowledgeEscalation({ escalationId: "e1", workspaceId: WS, acknowledgedBy: "" }, deps)
    ).rejects.toThrow();
  });
});
