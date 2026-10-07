/**
 * Pre-merge hostile fixes for Outcome Persistence v1 (real Postgres).
 *
 *  P1  CONTRACT_DECISION_RACE — an outcome-contract amendment must never resurrect an ACCEPTED/MODIFIED commitment that a
 *      concurrent REJECTED / DEFERRED already replaced. The two interleavings are FORCED, not left to timing: a separate
 *      transaction holds the candidate's serialization lock, the operations queue on it in a known order (confirmed through
 *      pg_locks), and the holder releases them in that order.
 *  P2  COMMITMENT_INPUT_DOMAIN_TRUTH — a persisted `inputSnapshot` never carries a placeholder domain.
 *
 * Requires TEST_WITH_DB=true and a migrated PostgreSQL. Self-skips otherwise.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { ValidationError } from "@/infra/errors";
import {
  lockOwnerCandidate, ownerCandidateLockKey, recordOwnerDecision, recordOwnerOutcomeContract, listOwnerDecisions,
} from "@/services/owner-outcome/owner-decision.service";
import { assessPersistedOwnerOutcome, linkProcessTaskToDecision } from "@/services/owner-outcome/owner-outcome-chain.service";
import {
  NOW, daysAgo, seedActionOutcome, seedComplianceItem, seedFinanceAction, seedFinanceCycle, seedProcessTask, seedTenant, withClients, type Tenant,
} from "./outcome-db-fixtures";

const deps = { now: () => NOW };
let A: Tenant;
beforeAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  A = await seedTenant();
});

async function acceptedCandidate(): Promise<string> {
  const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
  const act = await seedFinanceAction(A, { cycleId: cyc.cycleId, status: "proposed" });
  await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: act.candidateId, state: "ACCEPTED", contract: { targetValue: 10, targetDirection: "up" } }, deps);
  return act.candidateId;
}

/** How many sessions are currently WAITING for the candidate's advisory lock. */
async function waiters(candidateId: string): Promise<number> {
  const key = ownerCandidateLockKey(A.ws, A.biz, candidateId);
  const rows = await db.$queryRaw<Array<{ w: bigint }>>`
    SELECT count(*) FILTER (WHERE NOT granted) AS w FROM pg_locks
    WHERE locktype = 'advisory' AND objsubid = 1
      AND classid = ((hashtextextended(${key}, 0) >> 32) & 4294967295)::bigint::oid
      AND objid = (hashtextextended(${key}, 0) & 4294967295)::bigint::oid`;
  return Number(rows[0].w);
}
async function until(cond: () => Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

type Settled = { ok: true; value: unknown } | { ok: false; error: unknown };
const settle = (p: Promise<unknown>): Promise<Settled> => p.then((value) => ({ ok: true as const, value }), (error) => ({ ok: false as const, error }));

type Op = (client: typeof db) => Promise<unknown>;

/**
 * Run `first` then `second` in a guaranteed order through the candidate lock, each on its OWN connection (plus the holder on a
 * third), so the ordering is decided by Postgres' lock queue, not by Node's single-connection pool.
 */
async function runOrdered(candidateId: string, first: Op, second: Op): Promise<[Settled, Settled]> {
  return withClients(3, async ([holderClient, c1, c2]) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let acquired!: () => void;
    const got = new Promise<void>((r) => (acquired = r));
    const holder = holderClient.$transaction(async (tx) => { await lockOwnerCandidate(tx, A.ws, A.biz, candidateId); acquired(); await gate; }, { timeout: 60_000, maxWait: 30_000 });
    await got;
    const p1 = settle(first(c1));
    await until(async () => (await waiters(candidateId)) >= 1, "first operation queued on the candidate lock");
    const p2 = settle(second(c2));
    await until(async () => (await waiters(candidateId)) >= 2, "second operation queued on the candidate lock");
    release();
    await holder;
    return [await p1, await p2] as [Settled, Settled];
  });
}

const amend = (candidateId: string): Op => (client) => recordOwnerOutcomeContract(A.ws, A.actor, A.biz, { candidateId, contract: { targetValue: 99, targetDirection: "down" } }, { ...deps, client });
const decide = (candidateId: string, state: "REJECTED" | "DEFERRED"): Op => (client) => recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId, state, ownerReason: `now ${state}` }, { ...deps, client });
const history = async (candidateId: string) => (await listOwnerDecisions(A.ws, A.biz, { candidateId })).map((r) => [r.sequence, r.decisionState, r.targetValue] as const);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] CONTRACT_DECISION_RACE — an amendment can never resurrect a rejected/deferred commitment", () => {
  for (const state of ["REJECTED", "DEFERRED"] as const) {
    it(`Race ${state === "REJECTED" ? 1 : 2}a — amendment commits FIRST: history is ACCEPTED → amended ACCEPTED → ${state}; the final state is ${state}`, async () => {
      const c = await acceptedCandidate();
      const [a, d] = await runOrdered(c, amend(c), decide(c, state));
      expect([a.ok, d.ok]).toEqual([true, true]);
      expect(await history(c)).toEqual([[1, "ACCEPTED", 10], [2, "ACCEPTED", 99], [3, state, null]]);
    });

    it(`Race ${state === "REJECTED" ? 1 : 2}b — ${state} commits FIRST: the amendment FAILS and nothing ACCEPTED/MODIFIED is appended after it`, async () => {
      const c = await acceptedCandidate();
      const [d, a] = await runOrdered(c, decide(c, state), amend(c));
      expect(d.ok).toBe(true);
      expect(a.ok).toBe(false);
      expect((a as { error: unknown }).error).toBeInstanceOf(ValidationError);
      expect(await history(c)).toEqual([[1, "ACCEPTED", 10], [2, state, null]]);
    });

    it(`Race ${state === "REJECTED" ? 3 : 4} — ${state} has definitely committed; a later amendment fails and writes no row`, async () => {
      const c = await acceptedCandidate();
      await decide(c, state)(db);
      const before = await history(c);
      await expect(amend(c)(db)).rejects.toBeInstanceOf(ValidationError);
      expect(await history(c)).toEqual(before);
      expect(before[before.length - 1][1]).toBe(state);
      expect(before.filter((r) => r[1] === "ACCEPTED" || r[1] === "MODIFIED").every((r) => r[0] < before[before.length - 1][0])).toBe(true);
    });
  }

  it("an amendment of a MODIFIED commitment is also refused once the owner has since deferred it", async () => {
    const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
    const act = await seedFinanceAction(A, { cycleId: cyc.cycleId, status: "proposed" });
    await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: act.candidateId, state: "MODIFIED", contract: { commitmentDescription: "Do Y" } }, deps);
    const [d, a] = await runOrdered(act.candidateId, decide(act.candidateId, "DEFERRED"), (client) =>
      recordOwnerOutcomeContract(A.ws, A.actor, A.biz, { candidateId: act.candidateId, contract: { commitmentDescription: "Do Y harder" } }, { ...deps, client }));
    expect([d.ok, a.ok]).toEqual([true, false]);
    expect((await history(act.candidateId)).map((r) => r[1])).toEqual(["MODIFIED", "DEFERRED"]);
  });

  it("unforced concurrency (many rounds, real timing): the invariant holds whichever ordering wins", async () => {
    for (let round = 0; round < 12; round++) {
      const c = await acceptedCandidate();
      const state = round % 2 === 0 ? "REJECTED" : "DEFERRED";
      const [a, d] = await withClients(2, ([c1, c2]) => Promise.all([settle(amend(c)(c1)), settle(decide(c, state)(c2))]));
      expect(d.ok).toBe(true);
      const rows = await history(c);
      const lastTerminal = rows.map((r) => r[1]).lastIndexOf(state);
      // nothing ACCEPTED/MODIFIED may follow the rejection/deferral
      expect(rows.slice(lastTerminal + 1)).toEqual([]);
      expect(rows[rows.length - 1][1]).toBe(state);
      expect(rows.length).toBe(a.ok ? 3 : 2);
    }
  });

  it("the amendment and a new decision share ONE candidate lock (a held lock queues both)", async () => {
    const c = await acceptedCandidate();
    const [x, y] = await runOrdered(c, amend(c), amend(c));
    expect([x.ok, y.ok]).toEqual([true, true]); // identical amendments: the second is recognised as a replay, not a second row
    expect((await history(c)).length).toBe(2);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] COMMITMENT_INPUT_DOMAIN_TRUTH — the persisted input names the real chain domain", () => {
  const snapDomain = (a: { inputSnapshot: unknown }) => (a.inputSnapshot as { domain: string }).domain;

  it("a compliance commitment with no execution source persists domain 'compliance' (never a placeholder like 'operations')", async () => {
    const item = await seedComplianceItem(A, A.actor);
    const d = await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: item.candidateId, state: "ACCEPTED", contract: { verificationMetric: "days_to_expiry" } }, deps);
    const { assessment } = await assessPersistedOwnerOutcome(A.ws, A.actor, A.biz, { candidateId: item.candidateId }, deps);
    expect(snapDomain(assessment)).toBe("compliance");
    expect(snapDomain(assessment)).not.toBe("operations");
    expect(assessment.domain).toBe("compliance");
    expect(d.decision.domain).toBe("compliance");
    expect([assessment.domain, snapDomain(assessment), d.decision.domain].every((x) => x === "compliance")).toBe(true);
  });

  it("a compliance commitment linked to a process task keeps 'compliance' on the chain, the row and the input", async () => {
    const item = await seedComplianceItem(A, A.actor);
    await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: item.candidateId, state: "ACCEPTED", contract: { verificationMetric: "m", targetDirection: "down" } }, deps);
    const task = await seedProcessTask(A, { status: "OUTCOME_RECORDED", completedAt: daysAgo(20), targetMetricName: "m" });
    const outcomeId = await seedActionOutcome(A, { taskKey: task.taskKey, metric: "m", before: 10, after: 4, periodEnd: daysAgo(2) });
    await db.processExecutionTask.update({ where: { id: task.id }, data: { outcomeId } });
    const { assessment } = await linkProcessTaskToDecision(A.ws, A.actor, A.biz, { candidateId: item.candidateId, processTaskKey: task.taskKey }, deps);
    expect(assessment.sourceSystem).toBe("SYSTEM_B");
    expect([assessment.domain, snapDomain(assessment)]).toEqual(["compliance", "compliance"]);
  });

  it("an undecided legacy process task persists domain 'process_execution' on the row and the input", async () => {
    const task = await seedProcessTask(A, { status: "COMPLETED", completedAt: daysAgo(20) });
    const { assessment } = await assessPersistedOwnerOutcome(A.ws, A.actor, A.biz, { processTaskKey: task.taskKey }, deps);
    expect([assessment.domain, snapDomain(assessment)]).toEqual(["process_execution", "process_execution"]);
  });

  it("a System A action keeps its own domain on the candidate id, the row and the input", async () => {
    const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
    const act = await seedFinanceAction(A, { cycleId: cyc.cycleId, status: "in_progress" });
    const { assessment } = await assessPersistedOwnerOutcome(A.ws, A.actor, A.biz, { candidateId: act.candidateId }, deps);
    expect(act.candidateId.split(":")[1]).toBe("finance");
    expect([assessment.domain, snapDomain(assessment)]).toEqual(["finance", "finance"]);
  });

  it("no persisted assessment anywhere carries an input domain that contradicts its own row domain", async () => {
    const rows = await db.ownerOutcomeAssessment.findMany({ where: { workspaceId: A.ws } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => snapDomain(r) !== r.domain).map((r) => `${r.chainKey}: row=${r.domain} input=${snapDomain(r)}`)).toEqual([]);
  });
});
