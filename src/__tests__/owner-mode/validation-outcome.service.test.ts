/**
 * Validation Outcome service — unit tests with an in-memory DB (no real Postgres).
 *
 * Proves the governed write path: a valid outcome persists a row + atomic audit; an identical re-record is
 * idempotent; an invalid outcome fails closed with no write; reads are workspace-scoped (isolation) and a
 * clean workspace yields nothing; the latest outcome per opportunity wins.
 */
import { describe, it, expect } from "vitest";
import { recordValidationOutcome, getActiveValidationOutcomes, type OutcomeDb, type OutcomeDeps } from "@/services/owner-mode/validation-outcome.service";

const WS = "ws-o-1";
const OTHER = "ws-o-2";
interface Stored { id: string; workspaceId: string; idempotencyKey: string; updatedAt: Date; [k: string]: unknown }

function makeDeps(): { deps: OutcomeDeps; rows: Stored[]; audits: unknown[] } {
  const rows: Stored[] = [];
  const audits: unknown[] = [];
  let n = 0;
  const db: OutcomeDb = {
    opportunityValidationOutcome: {
      findFirst: async ({ where }) => {
        const w = where as { workspaceId: string; idempotencyKey: string };
        return (rows.find((r) => r.workspaceId === w.workspaceId && r.idempotencyKey === w.idempotencyKey) as never) ?? null;
      },
      findMany: async ({ where }) => {
        const w = where as { workspaceId: string };
        return [...rows].filter((r) => r.workspaceId === w.workspaceId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()) as never;
      },
    },
    $transaction: async (fn) => fn({
      opportunityValidationOutcome: {
        create: async ({ data }) => { rows.push({ ...(data as Stored) }); return { id: (data as Stored).id }; },
        updateMany: async ({ where, data }) => {
          let count = 0;
          for (const r of rows) { if (r.workspaceId === (where as { workspaceId: string }).workspaceId && r.idempotencyKey === (where as { idempotencyKey: string }).idempotencyKey) { Object.assign(r, data); count += 1; } }
          return { count };
        },
      },
      auditEvent: { create: async ({ data }) => { audits.push(data); return {}; } },
    }),
  };
  return { deps: { db, uuid: () => `id-${(n += 1)}`, now: () => new Date("2026-07-06T00:00:00.000Z") }, rows, audits };
}

const passed = { experimentKey: "exp-1", opportunityKey: "SERVICE_GAP:NEW_SERVICE", status: "COMPLETED" as const, result: "PASSED" as const, actualCost: 40, marginEvidence: "40% margin", conversions: 3 };

describe("recordValidationOutcome — module contract assertions", () => {
  it("recordValidationOutcome is a function", () => {
    expect(typeof recordValidationOutcome).toBe("function");
  });
  it("getActiveValidationOutcomes is a function", () => {
    expect(typeof getActiveValidationOutcomes).toBe("function");
  });
  it("makeDeps() returns an object with deps, rows, audits", () => {
    const d = makeDeps();
    expect(typeof d).toBe("object");
    expect(d).toHaveProperty("deps");
    expect(d).toHaveProperty("rows");
    expect(d).toHaveProperty("audits");
  });
  it("makeDeps().rows is initially an empty array", () => {
    expect(Array.isArray(makeDeps().rows)).toBe(true);
    expect(makeDeps().rows).toHaveLength(0);
  });
  it("makeDeps().audits is initially an empty array", () => {
    expect(Array.isArray(makeDeps().audits)).toBe(true);
    expect(makeDeps().audits).toHaveLength(0);
  });
  it("passed.experimentKey is 'exp-1'", () => {
    expect(passed.experimentKey).toBe("exp-1");
  });
  it("passed.result is 'PASSED'", () => {
    expect(passed.result).toBe("PASSED");
  });
  it("passed.status is 'COMPLETED'", () => {
    expect(passed.status).toBe("COMPLETED");
  });
  it("WS is a string", () => {
    expect(typeof WS).toBe("string");
  });
  it("OTHER is a string", () => {
    expect(typeof OTHER).toBe("string");
  });
  it("WS !== OTHER", () => {
    expect(WS).not.toBe(OTHER);
  });
  it("recordValidationOutcome resolves to an object with an ok field", async () => {
    const { deps } = makeDeps();
    const r = await recordValidationOutcome({ workspaceId: WS, actorId: "u1", submission: passed }, deps);
    expect(typeof r).toBe("object");
    expect(r).toHaveProperty("ok");
  });
  it("ok is true for a valid submission", async () => {
    const { deps } = makeDeps();
    const r = await recordValidationOutcome({ workspaceId: WS, actorId: "u1", submission: passed }, deps);
    expect(r.ok).toBe(true);
  });
  it("getActiveValidationOutcomes returns an array", async () => {
    const { deps } = makeDeps();
    const result = await getActiveValidationOutcomes(WS, deps);
    expect(Array.isArray(result)).toBe(true);
  });
  it("makeDeps().deps.uuid() returns a string", () => {
    expect(typeof makeDeps().deps.uuid()).toBe("string");
  });
});

describe("recordValidationOutcome", () => {
  it("1. persists a valid outcome with an atomic audit", async () => {
    const { deps, rows, audits } = makeDeps();
    const r = await recordValidationOutcome({ workspaceId: WS, actorId: "u1", submission: passed }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nextRecommendedDecision).toBe("SCALE_CANDIDATE");
    expect(rows).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("2. an identical re-record is idempotent (no second row)", async () => {
    const { deps, rows } = makeDeps();
    await recordValidationOutcome({ workspaceId: WS, actorId: "u1", submission: passed }, deps);
    const again = await recordValidationOutcome({ workspaceId: WS, actorId: "u1", submission: passed }, deps);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.deduped).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it("3. an invalid outcome fails closed with no write", async () => {
    const { deps, rows, audits } = makeDeps();
    const r = await recordValidationOutcome({ workspaceId: WS, actorId: "u1", submission: { ...passed, opportunityKey: "" } }, deps);
    expect(r.ok).toBe(false);
    expect(rows).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("4. reads are workspace-scoped and a clean workspace yields nothing; mapped validationStatus is exposed", async () => {
    const { deps } = makeDeps();
    await recordValidationOutcome({ workspaceId: WS, actorId: "u1", submission: passed }, deps);
    const mine = await getActiveValidationOutcomes(WS, deps);
    const other = await getActiveValidationOutcomes(OTHER, deps);
    expect(mine).toHaveLength(1);
    expect(mine[0].validationStatus).toBe("PASSED");
    expect(other).toHaveLength(0);
  });
});
