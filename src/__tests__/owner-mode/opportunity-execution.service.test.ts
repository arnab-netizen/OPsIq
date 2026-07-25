/**
 * Opportunity Execution service — unit tests with an in-memory DB (no real Postgres).
 *
 * Proves the governed write path: a valid update persists a row + atomic audit; an identical re-update is
 * idempotent; an owner-approval task cannot be completed by a non-owner; an evidence-less completion of an
 * evidence-required task is not COMPLETED; reads are workspace-scoped (isolation); a clean workspace yields
 * nothing.
 */
import { describe, it, expect } from "vitest";
import { recordExecutionTaskUpdate, getPersistedExecutionTasks, type ExecutionDb, type ExecutionDeps } from "@/services/owner-mode/opportunity-execution.service";

const WS = "ws-e-1";
const OTHER = "ws-e-2";
interface Stored { id: string; workspaceId: string; taskKey: string; updatedAt: Date; [k: string]: unknown }

function makeDeps(): { deps: ExecutionDeps; rows: Stored[]; audits: unknown[] } {
  const rows: Stored[] = [];
  const audits: unknown[] = [];
  let n = 0;
  const db: ExecutionDb = {
    opportunityExecutionTask: {
      findFirst: async ({ where }) => {
        const w = where as { workspaceId: string; taskKey: string };
        return (rows.find((r) => r.workspaceId === w.workspaceId && r.taskKey === w.taskKey) as never) ?? null;
      },
      findMany: async ({ where }) => {
        const w = where as { workspaceId: string };
        return [...rows].filter((r) => r.workspaceId === w.workspaceId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()) as never;
      },
    },
    $transaction: async (fn) => fn({
      opportunityExecutionTask: {
        create: async ({ data }) => { rows.push({ ...(data as Stored) }); return { id: (data as Stored).id }; },
        updateMany: async ({ where, data }) => {
          let count = 0;
          for (const r of rows) { if (r.workspaceId === (where as { workspaceId: string }).workspaceId && r.taskKey === (where as { taskKey: string }).taskKey) { Object.assign(r, data); count += 1; } }
          return { count };
        },
      },
      auditEvent: { create: async ({ data }) => { audits.push(data); return {}; } },
    }),
  };
  return { deps: { db, uuid: () => `id-${(n += 1)}`, now: () => new Date("2026-07-06T00:00:00.000Z") }, rows, audits };
}

const collectCost = {
  taskKey: "task:ws-e-1:opp-a:COLLECT_COST_DATA", opportunityKey: "opp-a", taskType: "COLLECT_COST_DATA" as const,
  sourceType: "MISSING_DATA", sourceKey: "opp-a:cost", nextActionOwner: "MANAGER", approvalLevel: "MANAGER",
};

describe("opportunity-execution service — module contract assertions", () => {
  it("recordExecutionTaskUpdate is a function", () => {
    expect(typeof recordExecutionTaskUpdate).toBe("function");
  });
  it("getPersistedExecutionTasks is a function", () => {
    expect(typeof getPersistedExecutionTasks).toBe("function");
  });
  it("makeDeps() returns object with deps field", () => {
    expect(makeDeps()).toHaveProperty("deps");
  });
  it("makeDeps() returns object with rows field", () => {
    expect(makeDeps()).toHaveProperty("rows");
  });
  it("makeDeps() returns object with audits field", () => {
    expect(makeDeps()).toHaveProperty("audits");
  });
  it("makeDeps().rows starts empty", () => {
    expect(makeDeps().rows).toHaveLength(0);
  });
  it("makeDeps().audits starts empty", () => {
    expect(makeDeps().audits).toHaveLength(0);
  });
  it("WS is a string", () => {
    expect(typeof WS).toBe("string");
  });
  it("OTHER is a string different from WS", () => {
    expect(typeof OTHER).toBe("string");
    expect(OTHER).not.toBe(WS);
  });
  it("collectCost has taskKey field", () => {
    expect(collectCost).toHaveProperty("taskKey");
  });
  it("collectCost has opportunityKey field", () => {
    expect(collectCost).toHaveProperty("opportunityKey", "opp-a");
  });
  it("collectCost.taskType is 'COLLECT_COST_DATA'", () => {
    expect(collectCost.taskType).toBe("COLLECT_COST_DATA");
  });
  it("recordExecutionTaskUpdate returns a Promise", () => {
    const { deps } = makeDeps();
    const r = recordExecutionTaskUpdate({ workspaceId: WS, actorId: "u1", actorRole: "manager", submission: { ...collectCost, action: "COMPLETE", evidenceRefs: ["x"] } }, deps);
    expect(r instanceof Promise).toBe(true);
    return r;
  });
  it("getPersistedExecutionTasks returns a Promise", () => {
    const { deps } = makeDeps();
    const r = getPersistedExecutionTasks(WS, deps);
    expect(r instanceof Promise).toBe(true);
    return r;
  });
  it("getPersistedExecutionTasks resolves to a Map", async () => {
    const { deps } = makeDeps();
    const r = await getPersistedExecutionTasks(WS, deps);
    expect(r instanceof Map).toBe(true);
  });
});

describe("recordExecutionTaskUpdate", () => {
  it("1. persists a valid completion (with evidence) + atomic audit; updates the opportunity", async () => {
    const { deps, rows, audits } = makeDeps();
    const r = await recordExecutionTaskUpdate({ workspaceId: WS, actorId: "u1", actorRole: "manager", submission: { ...collectCost, action: "COMPLETE", evidenceRefs: ["per-unit cost captured"] } }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.status).toBe("COMPLETED"); expect(r.updatesOpportunity).toBe(true); }
    expect(rows).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("2. an evidence-less completion of an evidence-required task is not COMPLETED (no fake completion)", async () => {
    const { deps } = makeDeps();
    const r = await recordExecutionTaskUpdate({ workspaceId: WS, actorId: "u1", actorRole: "manager", submission: { ...collectCost, action: "COMPLETE", evidenceRefs: [] } }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("IN_PROGRESS");
  });

  it("3. an owner-approval task cannot be completed by a non-owner (fail closed, no write)", async () => {
    const { deps, rows } = makeDeps();
    const r = await recordExecutionTaskUpdate({ workspaceId: WS, actorId: "u1", actorRole: "manager", submission: { taskKey: "task:ws-e-1:opp-a:OWNER_APPROVAL_REVIEW", opportunityKey: "opp-a", taskType: "OWNER_APPROVAL_REVIEW", sourceType: "APPROVAL_POLICY", sourceKey: "k", nextActionOwner: "OWNER", approvalLevel: "OWNER", action: "COMPLETE", outcomeSummary: "ok" } }, deps);
    expect(r.ok).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it("4. an identical re-update is idempotent (no second row)", async () => {
    const { deps, rows } = makeDeps();
    const body = { ...collectCost, action: "COMPLETE" as const, evidenceRefs: ["per-unit cost captured"] };
    await recordExecutionTaskUpdate({ workspaceId: WS, actorId: "u1", actorRole: "manager", submission: body }, deps);
    const again = await recordExecutionTaskUpdate({ workspaceId: WS, actorId: "u1", actorRole: "manager", submission: body }, deps);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.deduped).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it("5. reads are workspace-scoped; a clean workspace yields an empty map", async () => {
    const { deps } = makeDeps();
    await recordExecutionTaskUpdate({ workspaceId: WS, actorId: "u1", actorRole: "manager", submission: { ...collectCost, action: "COMPLETE", evidenceRefs: ["x"] } }, deps);
    const mine = await getPersistedExecutionTasks(WS, deps);
    const other = await getPersistedExecutionTasks(OTHER, deps);
    expect(mine.size).toBe(1);
    expect(other.size).toBe(0);
  });
});
