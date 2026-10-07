/**
 * Owner Outcome Persistence v1 (CORE) — real-Postgres proof.
 *
 * Decisions (state / reason / snapshot / idempotency / races), outcome-contract persistence (null ≠ 0, direction never
 * defaulted), deterministic linking (System A / System B never merged), the seven-fact assessment snapshots (all derived
 * by assessOwnerOutcome), newer-diagnosis resolution, versioned history, DB-level append-only/CHECK guards, and
 * workspace + business isolation.
 *
 * Requires TEST_WITH_DB=true and a migrated PostgreSQL. Self-skips otherwise.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import { LIQUIDITY_UNCONFIRMED_FINDING_CODE } from "@/domain/owner-finance/liquidity";
import {
  getLatestOwnerDecision, listOwnerDecisions, recordOwnerDecision, recordOwnerOutcomeContract,
} from "@/services/owner-outcome/owner-decision.service";
import {
  assessPersistedOwnerOutcome, getOwnerOutcomeChain, linkProcessTaskToDecision,
} from "@/services/owner-outcome/owner-outcome-chain.service";
import {
  NOW, daysAgo, withClients, seedActionOutcome, seedComplianceItem, seedFinanceAction, seedFinanceCycle, seedFinanceVerification,
  seedProcessTask, seedRecoveryAction, seedTenant, type Tenant,
} from "./outcome-db-fixtures";

const deps = { now: () => NOW };
let A: Tenant; // the caller's tenant
let B: Tenant; // a different workspace entirely

beforeAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  A = await seedTenant();
  B = await seedTenant();
});

async function financeChain(tn: { ws: string; biz: string }, o: {
  status?: string; completedAt?: Date | null; timeframeDays?: number; findingCode?: string; findingSeverity?: string;
  verification?: { before: number | null; after: number | null; direction?: string; target?: number | null; status?: string; verifiedAt?: Date | null; baselineSource?: string | null };
  cyclePeriodEnd?: Date;
}) {
  const code = o.findingCode ?? "FIN_FIXED_COST_PRESSURE";
  const cyc = await seedFinanceCycle(tn, { periodEnd: o.cyclePeriodEnd ?? daysAgo(70), generatedAt: (o.cyclePeriodEnd ?? daysAgo(70)), findings: [{ code, severity: o.findingSeverity ?? "medium" }] });
  const action = await seedFinanceAction(tn, { cycleId: cyc.cycleId, findingCode: code, status: o.status ?? "completed", completedAt: o.completedAt === undefined ? daysAgo(30) : o.completedAt, timeframeDays: o.timeframeDays ?? 1 });
  let verificationId: string | null = null;
  if (o.verification) verificationId = await seedFinanceVerification(tn, { actionId: action.id, ...o.verification, verifiedAt: o.verification.verifiedAt === undefined ? daysAgo(20) : o.verification.verifiedAt });
  return { ...action, cycleId: cyc.cycleId, verificationId, code };
}

const assess = (tn: Tenant, candidateId: string, d = deps) => assessPersistedOwnerOutcome(tn.ws, tn.actor, tn.biz, { candidateId }, d);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Owner Outcome Persistence v1 — decisions", () => {
  it("1-4. persists ACCEPTED, REJECTED, DEFERRED and MODIFIED as distinct states; the owner reason is stored", async () => {
    const mk = async () => (await seedFinanceAction(A, { cycleId: (await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) })).cycleId })).candidateId;
    const [c1, c2, c3, c4] = [await mk(), await mk(), await mk(), await mk()];
    const accepted = await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: c1, state: "ACCEPTED", ownerReason: "Makes sense", contract: {} }, deps);
    const rejected = await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: c2, state: "REJECTED", ownerReason: "Not now, too costly" }, deps);
    const deferred = await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: c3, state: "DEFERRED", revisitAt: "2026-09-01T00:00:00.000Z" }, deps);
    const modified = await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: c4, state: "MODIFIED", contract: { commitmentDescription: "Renegotiate rent instead of cutting staff" } }, deps);
    expect(accepted.decision.decisionState).toBe("ACCEPTED");
    expect(accepted.decision.ownerReason).toBe("Makes sense");
    expect(rejected.decision.decisionState).toBe("REJECTED");
    expect(rejected.decision.ownerReason).toBe("Not now, too costly");
    expect(deferred.decision.revisitAt?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(modified.decision.decisionState).toBe("MODIFIED");
    expect(modified.decision.commitmentDescription).toMatch(/Renegotiate rent/);
    expect(accepted.decision.decidedById).toBe(A.actor);
    expect(accepted.decision.decisionContractVersion).toBe("owner-decision-v1");
    expect(accepted.decision.candidateId).toBe(c1);
  });

  it("REJECTED / DEFERRED record no execution: no contract is stored and no assessment shows success or failure", async () => {
    const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
    const act = await seedFinanceAction(A, { cycleId: cyc.cycleId, status: "proposed" });
    await expect(recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: act.candidateId, state: "REJECTED", contract: { targetValue: 5 } }, deps)).rejects.toBeInstanceOf(ValidationError);
    const r = await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: act.candidateId, state: "REJECTED" }, deps);
    expect(r.decision.targetDirection).toBeNull();
    expect(r.decision.verificationMetric).toBeNull();
    const { assessment } = await assess(A, act.candidateId);
    expect(assessment.executionStatus).toBe("NOT_STARTED");
    expect(assessment.measurementResult).toBe("NOT_MEASURABLE");
    expect(assessment.ownerDecisionState).toBe("REJECTED");
    expect(assessment.commitmentFidelity).toBe("NOT_COMMITTED");
    expect(assessment.targetAttainment).toBe("UNKNOWN");
  });

  it("6. the recommendation snapshot is preserved: a later change to the source does not rewrite what the owner saw", async () => {
    const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
    const act = await seedFinanceAction(A, { cycleId: cyc.cycleId, title: "Original title", status: "proposed" });
    const first = await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: act.candidateId, state: "DEFERRED" }, deps);
    await db.ownerFinanceAction.update({ where: { id: act.id }, data: { title: "Rewritten title" } });
    const second = await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: act.candidateId, state: "ACCEPTED", contract: {} }, deps);
    const rows = await listOwnerDecisions(A.ws, A.biz, { candidateId: act.candidateId });
    expect((rows[0].recommendationSnapshot as { title: string }).title).toBe("Original title");
    expect((rows[1].recommendationSnapshot as { title: string }).title).toBe("Rewritten title");
    expect(first.decision.id).toBe(rows[0].id);
    expect(second.decision.supersedesId).toBe(first.decision.id);
    expect(second.decision.sequence).toBe(2);
  });

  it("7. a duplicate submit (double click / retry) writes nothing new; an explicit idempotency key replays the original row", async () => {
    const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
    const act = await seedFinanceAction(A, { cycleId: cyc.cycleId, status: "proposed" });
    const body = { candidateId: act.candidateId, state: "ACCEPTED" as const, ownerReason: "go", contract: { verificationMetric: "net_margin_pct" } };
    const r1 = await recordOwnerDecision(A.ws, A.actor, A.biz, body, deps);
    const r2 = await recordOwnerDecision(A.ws, A.actor, A.biz, body, deps);
    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(true);
    expect(r2.decision.id).toBe(r1.decision.id);
    const keyed = { ...body, state: "DEFERRED" as const, contract: undefined, idempotencyKey: `idem-${randomUUID()}` };
    const k1 = await recordOwnerDecision(A.ws, A.actor, A.biz, keyed, deps);
    const k2 = await recordOwnerDecision(A.ws, A.actor, A.biz, keyed, deps);
    expect(k2.decision.id).toBe(k1.decision.id);
    await expect(recordOwnerDecision(A.ws, A.actor, A.biz, { ...keyed, state: "REJECTED" }, deps)).rejects.toBeInstanceOf(ConflictError);
    expect((await listOwnerDecisions(A.ws, A.biz, { candidateId: act.candidateId })).length).toBe(2);
  });

  it("8. concurrent duplicate submits (two tabs) produce exactly one decision row", async () => {
    const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
    const act = await seedFinanceAction(A, { cycleId: cyc.cycleId, status: "proposed" });
    const body = { candidateId: act.candidateId, state: "ACCEPTED" as const, contract: { targetDirection: "up" as const } };
    // each contender on its OWN database connection: the serialization under test is Postgres', not Node's single-connection pool
    const results = await withClients(8, (clients) => Promise.all(clients.map((client) => recordOwnerDecision(A.ws, A.actor, A.biz, body, { ...deps, client }))));
    const rows = await db.ownerDecisionRecord.findMany({ where: { workspaceId: A.ws, candidateId: act.candidateId } });
    expect(rows.length).toBe(1);
    expect(new Set(results.map((r) => r.decision.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed).length).toBe(1);
  });

  it("9. a different, legitimate later decision on the same candidate remains possible (history, not overwrite)", async () => {
    const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
    const act = await seedFinanceAction(A, { cycleId: cyc.cycleId, status: "proposed" });
    await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: act.candidateId, state: "DEFERRED" }, deps);
    await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: act.candidateId, state: "ACCEPTED", contract: {} }, deps);
    await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: act.candidateId, state: "DEFERRED" }, deps); // same content as #1, but not the latest → a new event
    const rows = await listOwnerDecisions(A.ws, A.biz, { candidateId: act.candidateId });
    expect(rows.map((r) => [r.sequence, r.decisionState])).toEqual([[1, "DEFERRED"], [2, "ACCEPTED"], [3, "DEFERRED"]]);
  });

  it("10-12. wrong workspace, wrong business, foreign source and non-canonical identities fail closed with one uniform 404/400", async () => {
    const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
    const act = await seedFinanceAction(A, { cycleId: cyc.cycleId, status: "proposed" });
    const foreign = await seedFinanceAction(B, { cycleId: (await seedFinanceCycle(B, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) })).cycleId, status: "proposed" });
    const missing = `domain_action:finance:${randomUUID()}`;
    // wrong workspace: B's caller on A's business
    await expect(recordOwnerDecision(B.ws, B.actor, A.biz, { candidateId: act.candidateId, state: "ACCEPTED", contract: {} }, deps)).rejects.toBeInstanceOf(NotFoundError);
    // wrong business: same workspace, other business
    await expect(recordOwnerDecision(A.ws, A.actor, A.bizB, { candidateId: act.candidateId, state: "ACCEPTED", contract: {} }, deps)).rejects.toBeInstanceOf(NotFoundError);
    // foreign source: B's action referenced from A's business — indistinguishable from a nonexistent id
    const e1 = await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: foreign.candidateId, state: "ACCEPTED", contract: {} }, deps).catch((e) => e);
    const e2 = await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: missing, state: "ACCEPTED", contract: {} }, deps).catch((e) => e);
    expect(e1).toBeInstanceOf(NotFoundError);
    expect(e2).toBeInstanceOf(NotFoundError);
    expect((e1 as Error).message.replace(foreign.candidateId, "X")).toBe((e2 as Error).message.replace(missing, "X"));
    // foreign compliance item
    const comp = await seedComplianceItem(B, B.actor);
    await expect(recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: comp.candidateId, state: "ACCEPTED", contract: {} }, deps)).rejects.toBeInstanceOf(NotFoundError);
    // display text / non-persistable candidates are not identities
    for (const bad of ["Right-size fixed costs", `business_risk:${randomUUID()}`, `survival_reading:finance:FIN_X`, `domain_action:customer:${randomUUID()}`, "domain_action:finance:not-a-uuid"]) {
      await expect(recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: bad, state: "ACCEPTED", contract: {} }, deps)).rejects.toBeInstanceOf(ValidationError);
    }
    // nothing was written for any of them
    expect((await db.ownerDecisionRecord.findMany({ where: { workspaceId: { in: [A.ws, B.ws] }, candidateId: { in: [act.candidateId, foreign.candidateId] } } })).length).toBe(0);
  });

  it("a completed or cancelled action can no longer be decided on", async () => {
    const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
    const done = await seedFinanceAction(A, { cycleId: cyc.cycleId, status: "completed", completedAt: daysAgo(3) });
    await expect(recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: done.candidateId, state: "ACCEPTED", contract: {} }, deps)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Owner Outcome Persistence v1 — outcome contract", () => {
  const decide = async (contract: Record<string, unknown>) => {
    const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
    const act = await seedFinanceAction(A, { cycleId: cyc.cycleId, status: "proposed" });
    const r = await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: act.candidateId, state: "ACCEPTED", contract }, deps);
    return { act, row: r.decision };
  };

  it("13-17. baseline: known, explicit zero, unknown (null) and provenance are stored exactly; a baseline needs its provenance", async () => {
    const known = (await decide({ baselineValue: 12.5, baselineProvenance: "MEASURED" })).row;
    expect([known.baselineValue, known.baselineProvenance]).toEqual([12.5, "MEASURED"]);
    const zero = (await decide({ baselineValue: 0, baselineProvenance: "OWNER_REPORTED" })).row;
    expect(zero.baselineValue).toBe(0); // a known zero is not null
    const unknown = (await decide({})).row;
    expect(unknown.baselineValue).toBeNull(); // not supplied is not zero
    expect(unknown.baselineProvenance).toBeNull();
    const unknownProv = (await decide({ baselineValue: 7, baselineProvenance: "UNKNOWN" })).row;
    expect(unknownProv.baselineProvenance).toBe("UNKNOWN");
    const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
    const act = await seedFinanceAction(A, { cycleId: cyc.cycleId, status: "proposed" });
    await expect(recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: act.candidateId, state: "ACCEPTED", contract: { baselineValue: 5 } }, deps)).rejects.toBeInstanceOf(ValidationError);
  });

  it("18-20. target: present, absent (null, not zero) and an explicit zero", async () => {
    expect((await decide({ targetValue: 25 })).row.targetValue).toBe(25);
    expect((await decide({})).row.targetValue).toBeNull();
    expect((await decide({ targetValue: 0 })).row.targetValue).toBe(0);
  });

  it("21-23. direction: up, down and unknown — never defaulted to up, never inferred from the metric name", async () => {
    expect((await decide({ targetDirection: "up" })).row.targetDirection).toBe("up");
    expect((await decide({ targetDirection: "down" })).row.targetDirection).toBe("down");
    expect((await decide({})).row.targetDirection).toBe("unknown");
    expect((await decide({ verificationMetric: "revenue_growth_pct" })).row.targetDirection).toBe("unknown"); // a metric that "sounds" like up
    expect((await decide({ verificationMetric: "fixed_cost_ratio", targetDirection: null })).row.targetDirection).toBe("unknown");
  });

  it("24-25. observation window and intended completion: stored when supplied, null when not (never invented)", async () => {
    const withWin = (await decide({ observationWindowDays: 21, intendedCompletionAt: "2026-08-15T00:00:00.000Z", expectedMeasurementSource: "AUTHORITATIVE_SNAPSHOT" })).row;
    expect(withWin.observationWindowDays).toBe(21);
    expect(withWin.intendedCompletionAt?.toISOString()).toBe("2026-08-15T00:00:00.000Z");
    expect(withWin.expectedMeasurementSource).toBe("AUTHORITATIVE_SNAPSHOT");
    const without = (await decide({})).row;
    expect([without.observationWindowDays, without.intendedCompletionAt, without.expectedMeasurementSource]).toEqual([null, null, null]);
  });

  it("amending the contract appends the next version; the earlier contract stays readable; it needs an ACCEPTED/MODIFIED decision", async () => {
    const { act, row } = await decide({ targetValue: 10, targetDirection: "up" });
    const amended = await recordOwnerOutcomeContract(A.ws, A.actor, A.biz, { candidateId: act.candidateId, contract: { targetValue: 0, targetDirection: "down" } }, deps);
    expect(amended.decision.sequence).toBe(2);
    expect(amended.decision.supersedesId).toBe(row.id);
    const rows = await listOwnerDecisions(A.ws, A.biz, { candidateId: act.candidateId });
    expect([rows[0].targetValue, rows[0].targetDirection]).toEqual([10, "up"]);
    expect([rows[1].targetValue, rows[1].targetDirection]).toEqual([0, "down"]);
    const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
    const act2 = await seedFinanceAction(A, { cycleId: cyc.cycleId, status: "proposed" });
    await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: act2.candidateId, state: "REJECTED" }, deps);
    await expect(recordOwnerOutcomeContract(A.ws, A.actor, A.biz, { candidateId: act2.candidateId, contract: { targetValue: 1 } }, deps)).rejects.toBeInstanceOf(ValidationError);
  });

  it("MODIFIED keeps the original recommendation and the owner's own commitment separately, and the chain says it did not follow the recommendation", async () => {
    const cyc = await seedFinanceCycle(A, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
    const act = await seedFinanceAction(A, { cycleId: cyc.cycleId, status: "proposed", title: "Cut fixed costs by 10%" });
    await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: act.candidateId, state: "MODIFIED", contract: { commitmentDescription: "Renegotiate the rent only" } }, deps);
    const chain = await getOwnerOutcomeChain(A.ws, A.biz, { candidateId: act.candidateId });
    expect((chain.commitment?.recommendationSnapshot as { title: string }).title).toBe("Cut fixed costs by 10%");
    expect(chain.commitment?.ownerCommitmentDescription).toBe("Renegotiate the rent only");
    expect(chain.commitment?.followsRecommendedAction).toBe(false);
    const { assessment } = await assess(A, act.candidateId);
    expect(assessment.commitmentFidelity).toBe("MODIFIED_BY_OWNER");
    expect(assessment.causalAttribution).toBe("NOT_ASSESSED");
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Owner Outcome Persistence v1 — assessments (server-derived from persisted sources)", () => {
  const V = (after: number | null, o: Partial<{ before: number | null; direction: string; target: number | null; status: string; baselineSource: string | null }> = {}) =>
    ({ before: 10, after, direction: "up", target: null, ...o });

  const table: Array<[string, Parameters<typeof financeChain>[1], Record<string, unknown>]> = [
    ["33. not completed", { status: "in_progress", completedAt: null }, { executionStatus: "IN_PROGRESS", observationStatus: "NOT_STARTED", measurementResult: "NOT_MEASURABLE", verificationStatus: "unverified" }],
    ["34. completed, never measured", { timeframeDays: 14 }, { executionStatus: "COMPLETED", observationStatus: "READY_TO_MEASURE", measurementResult: "NOT_MEASURABLE", targetAttainment: "UNKNOWN" }],
    ["35. waiting for the window", { completedAt: daysAgo(3), timeframeDays: 14 }, { observationStatus: "WINDOW_OPEN", verificationStatus: "unverified" }],
    ["36. verification attempted, no after evidence", { verification: V(null) }, { observationStatus: "MISSING_AFTER_EVIDENCE", measurementResult: "NOT_MEASURABLE" }],
    ["37/43. improved, no target", { verification: V(14) }, { measurementResult: "IMPROVED", targetAttainment: "NO_TARGET", issueResolution: "NOT_YET_REASSESSED" }],
    ["38. unchanged", { verification: V(10) }, { measurementResult: "UNCHANGED" }],
    ["39. worsened", { verification: V(8) }, { measurementResult: "WORSENED" }],
    ["40. changed but direction unknown, no target", { verification: V(14, { direction: "sideways" }) }, { measurementResult: "CHANGED_DIRECTION_UNKNOWN", targetAttainment: "NO_TARGET" }],
    ["40b. changed, direction unknown, target set: attainment cannot be verified", { verification: V(14, { direction: "sideways", target: 20 }) }, { measurementResult: "CHANGED_DIRECTION_UNKNOWN", targetAttainment: "UNKNOWN" }],
    ["41. target reached is NOT resolved", { verification: V(15, { target: 15, status: "verified_improved" }) }, { measurementResult: "IMPROVED", targetAttainment: "REACHED", issueResolution: "NOT_YET_REASSESSED" }],
    ["42. improved but target not reached", { verification: V(12, { target: 15 }) }, { measurementResult: "IMPROVED", targetAttainment: "NOT_REACHED" }],
    ["44. disputed", { verification: V(14, { status: "disputed" }) }, { measurementResult: "DISPUTED", disputed: true, causalAttribution: "DISPUTED", learningEligibility: "NOT_ELIGIBLE" }],
    ["unknown baseline provenance is no baseline", { verification: V(14, { baselineSource: null }) }, { measurementResult: "NOT_MEASURABLE" }],
  ];

  for (const [name, spec, expected] of table) {
    it(name, async () => {
      const ch = await financeChain(A, spec);
      const { assessment, created } = await assess(A, ch.candidateId);
      expect(created).toBe(true);
      expect(assessment).toMatchObject(expected);
      // Every conclusion is a legitimate policy output; attribution is never stronger than PLAUSIBLE.
      expect(["NOT_ASSESSED", "PLAUSIBLE", "CONFOUNDED", "DISPUTED", "INSUFFICIENT_EVIDENCE"]).toContain(assessment.causalAttribution);
      expect(assessment.learningEligibility).not.toBe("ELIGIBLE_CONFIRMED_BY_GATE"); // Core never runs the gate
      expect(assessment.version).toBe(1);
      expect(assessment.chainKey).toBe(ch.candidateId);
      expect(assessment.systemAActionId).toBe(ch.id);
      expect(assessment.decisionLinkState).toBe("UNLINKED_NO_DECISION"); // legacy action: no fake owner decision
      expect(assessment.policyVersion).toBe("owner-outcome-policy-v1");
    });
  }

  it("26-27. System A action AND its verification are linked by persisted id; the verification row is untouched", async () => {
    const ch = await financeChain(A, { verification: V(14) });
    const before = await db.ownerFinanceVerification.findUniqueOrThrow({ where: { id: ch.verificationId! } });
    const { assessment } = await assess(A, ch.candidateId);
    expect(assessment.systemAActionId).toBe(ch.id);
    expect(assessment.systemAVerificationId).toBe(ch.verificationId);
    expect(assessment.sourceSystem).toBe("SYSTEM_A");
    expect(assessment.sourceLinkState).toBe("LINKED");
    expect(await db.ownerFinanceVerification.findUniqueOrThrow({ where: { id: ch.verificationId! } })).toEqual(before);
  });

  it("the persisted snapshot holds the exact facts the policy saw (null baseline stays null, a zero baseline stays 0)", async () => {
    const zeroBase = await financeChain(A, { verification: V(5, { before: 0 }) });
    const { assessment } = await assess(A, zeroBase.candidateId);
    const snap = assessment.inputSnapshot as { baselineValue: number | null; afterValue: number | null; targetValue: number | null; direction: string };
    expect(snap.baselineValue).toBe(0);
    expect(snap.afterValue).toBe(5);
    expect(snap.targetValue).toBeNull();
    expect(assessment.measurementResult).toBe("IMPROVED");
  });

  it("an owner decision on the action links it to its chain: decision id, state and ACCEPTED fidelity are carried on the snapshot", async () => {
    const ch = await financeChain(A, { status: "proposed", completedAt: null });
    const d = await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: ch.candidateId, state: "ACCEPTED", contract: { targetDirection: "up" } }, deps);
    const { assessment } = await assess(A, ch.candidateId);
    expect(assessment.ownerDecisionId).toBe(d.decision.id);
    expect(assessment.decisionLinkState).toBe("LINKED");
    expect(assessment.commitmentFidelity).toBe("AS_RECOMMENDED");
  });

  it("46-50. issue resolution comes ONLY from a qualifying newer diagnosis, and the specific cycle is referenced", async () => {
    const mk = async (extra?: Parameters<typeof financeChain>[1]) => financeChain(A, { completedAt: daysAgo(20), verification: V(15, { target: 15 }), ...extra });
    // 46. no newer diagnosis at all
    expect((await assess(A, (await mk()).candidateId)).assessment.issueResolution).toBe("NOT_YET_REASSESSED");

    // 47. a newer diagnosis that still raises the issue
    const tn = await seedTenant();
    const mkIn = async (code: string, sev = "medium") => {
      const ch = await financeChain(tn, { completedAt: daysAgo(20), verification: V(15, { target: 15 }), findingCode: code, findingSeverity: sev });
      return ch;
    };
    const still = await mkIn("FIN_STILL");
    await seedFinanceCycle(tn, { periodEnd: daysAgo(5), generatedAt: daysAgo(4), findings: [{ code: "FIN_STILL", severity: "medium" }] });
    const sRes = await assessPersistedOwnerOutcome(tn.ws, tn.actor, tn.biz, { candidateId: still.candidateId }, deps);
    expect(sRes.assessment.issueResolution).toBe("STILL_OPEN");
    expect(sRes.assessment.newerDiagnosisCycleId).not.toBeNull();

    // 48. worsened (higher severity than the diagnosis the action addressed)
    const tn2 = await seedTenant();
    const wch = await financeChain(tn2, { completedAt: daysAgo(20), verification: V(15, { target: 15 }), findingCode: "FIN_W", findingSeverity: "low" });
    await seedFinanceCycle(tn2, { periodEnd: daysAgo(5), generatedAt: daysAgo(4), findings: [{ code: "FIN_W", severity: "critical" }] });
    expect((await assessPersistedOwnerOutcome(tn2.ws, tn2.actor, tn2.biz, { candidateId: wch.candidateId }, deps)).assessment.issueResolution).toBe("WORSENED");

    // 49a. not raised but the evidence is stale → INCONCLUSIVE, never RESOLVED
    const tn3 = await seedTenant();
    const stale = await financeChain(tn3, { completedAt: daysAgo(60), verification: V(15, { target: 15, verifiedAt: daysAgo(58) }), findingCode: "FIN_S", cyclePeriodEnd: daysAgo(80) });
    await seedFinanceCycle(tn3, { periodEnd: daysAgo(50), generatedAt: daysAgo(49), findings: [] });
    const stRes = await assessPersistedOwnerOutcome(tn3.ws, tn3.actor, tn3.biz, { candidateId: stale.candidateId }, deps);
    expect(stRes.assessment.issueResolution).toBe("INCONCLUSIVE");

    // 49b. not raised but cash evidence is incomplete (liquidity unconfirmed) → INCONCLUSIVE
    const tn4 = await seedTenant();
    const gap = await financeChain(tn4, { completedAt: daysAgo(20), verification: V(15, { target: 15 }), findingCode: "FIN_G" });
    await seedFinanceCycle(tn4, { periodEnd: daysAgo(5), generatedAt: daysAgo(4), findings: [{ code: LIQUIDITY_UNCONFIRMED_FINDING_CODE }] });
    expect((await assessPersistedOwnerOutcome(tn4.ws, tn4.actor, tn4.biz, { candidateId: gap.candidateId }, deps)).assessment.issueResolution).toBe("INCONCLUSIVE");

    // 50. current, complete, issue no longer raised → RESOLVED, with the cycle referenced (also a DB CHECK)
    const tn5 = await seedTenant();
    const ok = await financeChain(tn5, { completedAt: daysAgo(20), verification: V(15, { target: 15 }), findingCode: "FIN_OK" });
    const newer = await seedFinanceCycle(tn5, { periodEnd: daysAgo(5), generatedAt: daysAgo(4), findings: [{ code: "FIN_SOMETHING_ELSE" }] });
    const okRes = await assessPersistedOwnerOutcome(tn5.ws, tn5.actor, tn5.biz, { candidateId: ok.candidateId }, deps);
    expect(okRes.assessment.issueResolution).toBe("RESOLVED");
    expect(okRes.assessment.newerDiagnosisCycleId).toBe(newer.cycleId);
    expect(okRes.assessment.newerDiagnosisDomain).toBe("finance");
    expect(okRes.assessment.newerDiagnosisEvidenceAsOf).toEqual(daysAgo(5));
    expect(okRes.assessment.causalAttribution).toBe("NOT_ASSESSED"); // resolved is not "caused by the action"
  });

  it("a newer diagnosis of ANOTHER business, an amended snapshot, or the action's own cycle never resolves anything", async () => {
    const tn = await seedTenant();
    const ch = await financeChain(tn, { completedAt: daysAgo(20), verification: V(15, { target: 15 }), findingCode: "FIN_Z" });
    await seedFinanceCycle({ ws: tn.ws, biz: tn.bizB }, { periodEnd: daysAgo(5), generatedAt: daysAgo(4), findings: [] }); // other business, same workspace
    const amended = await seedFinanceCycle(tn, { periodEnd: daysAgo(6), generatedAt: daysAgo(5), findings: [] });
    await db.ownerFinancialSnapshot.update({ where: { id: amended.snapshotId }, data: { supersededById: randomUUID() } });
    expect((await assessPersistedOwnerOutcome(tn.ws, tn.actor, tn.biz, { candidateId: ch.candidateId }, deps)).assessment.issueResolution).toBe("NOT_YET_REASSESSED");
  });

  it("62-65. history: new facts append version 2; version 1 stays readable; an identical re-assessment is not a new version; latest is deterministic", async () => {
    const ch = await financeChain(A, { completedAt: daysAgo(3), timeframeDays: 14 }); // window still open
    const v1 = await assess(A, ch.candidateId);
    expect([v1.created, v1.assessment.version, v1.assessment.observationStatus]).toEqual([true, 1, "WINDOW_OPEN"]);
    const again = await assess(A, ch.candidateId);
    expect([again.created, again.assessment.id]).toEqual([false, v1.assessment.id]);

    // later: the window has passed and a measurement exists → a new version, not a rewrite
    await seedFinanceVerification(A, { actionId: ch.id, before: 10, after: 14, target: 20, verifiedAt: new Date(NOW.getTime() + 20 * 86_400_000) });
    const later = await assess(A, ch.candidateId, { now: () => new Date(NOW.getTime() + 30 * 86_400_000) });
    expect([later.created, later.assessment.version, later.assessment.previousAssessmentId]).toEqual([true, 2, v1.assessment.id]);
    expect(later.assessment).toMatchObject({ measurementResult: "IMPROVED", targetAttainment: "NOT_REACHED" });

    const chain = await getOwnerOutcomeChain(A.ws, A.biz, { candidateId: ch.candidateId });
    expect(chain.assessments.map((a) => [a.version, a.observationStatus])).toEqual([[1, "WINDOW_OPEN"], [2, "MEASURED"]]);
    expect(chain.currentAssessment?.version).toBe(2);
  });

  it("64. racing assessments of the same facts produce exactly one version", async () => {
    const ch = await financeChain(A, { verification: V(14) });
    const results = await withClients(8, (clients) => Promise.all(clients.map((client) => assess(A, ch.candidateId, { ...deps, client }))));
    const rows = await db.ownerOutcomeAssessment.findMany({ where: { workspaceId: A.ws, chainKey: ch.candidateId } });
    expect(rows.length).toBe(1);
    expect(new Set(results.map((r) => r.assessment.id)).size).toBe(1);
  });

  it("61. the learning gate is confirmed ONLY from a real gate result passed by a server caller; failing blockers always win", async () => {
    const good = await financeChain(A, { verification: V(14, { target: 12 }) });
    expect((await assess(A, good.candidateId)).assessment.learningEligibility).toBe("PENDING_GOVERNANCE"); // 57
    const confirmed = await assess(A, good.candidateId, { now: deps.now, learningGate: { status: "ELIGIBLE", eligible: true } } as never);
    expect(confirmed.assessment.learningEligibility).toBe("ELIGIBLE_CONFIRMED_BY_GATE");
    expect(confirmed.assessment.version).toBe(2);
    const denied = await financeChain(A, { verification: V(14) });
    expect((await assess(A, denied.candidateId, { now: deps.now, learningGate: { status: "REJECTED", eligible: false } } as never)).assessment.learningEligibility).toBe("NOT_ELIGIBLE");
    // a gate "yes" cannot override a disputed outcome (58) or an unknown direction (60)
    const disputed = await financeChain(A, { verification: V(14, { status: "disputed" }) });
    expect((await assess(A, disputed.candidateId, { now: deps.now, learningGate: { status: "ELIGIBLE", eligible: true } } as never)).assessment.learningEligibility).toBe("NOT_ELIGIBLE");
    const noDir = await financeChain(A, { verification: V(14, { direction: "sideways" }) });
    const nd = await assess(A, noDir.candidateId, { now: deps.now, learningGate: { status: "ELIGIBLE", eligible: true } } as never);
    expect(nd.assessment.learningEligibility).toBe("NOT_ELIGIBLE");
    expect(nd.assessment.learningBlockers.join(" ")).toMatch(/direction/i);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Owner Outcome Persistence v1 — Recovery (System A, own column shapes)", () => {
  it("maps the recovery action/verification through the same adapter; with no persisted baseline provenance the comparison is honestly NOT_MEASURABLE (no fabricated baseline)", async () => {
    const r = await seedRecoveryAction(A, { verification: { baseline: 100, after: 50, target: 50, direction: "down", verifiedAt: daysAgo(20) } });
    const { assessment } = await assess(A, r.candidateId);
    expect(assessment).toMatchObject({ sourceSystem: "SYSTEM_A", systemAActionId: r.id, systemAVerificationId: r.verificationId, executionStatus: "COMPLETED", measurementResult: "NOT_MEASURABLE", issueResolution: "NOT_YET_REASSESSED", learningEligibility: "NO_LEARNING_LOOP" });
    const snap = assessment.inputSnapshot as { verificationMetric: string; baselineProvenance: string; direction: string; afterValue: number };
    expect([snap.verificationMetric, snap.baselineProvenance, snap.direction, snap.afterValue]).toEqual(["overdue_receivables", "UNKNOWN", "down", 50]);
    // an unrecorded direction is carried as unknown, never defaulted
    const u = await seedRecoveryAction(A, { verification: { baseline: 100, after: 50, target: 50, direction: "sideways", verifiedAt: daysAgo(20) } });
    expect((await assess(A, u.candidateId)).assessment.inputSnapshot).toMatchObject({ direction: "unknown" });
  });
  it("a recovery action of another business is not reachable from this one", async () => {
    const r = await seedRecoveryAction({ ws: A.ws, biz: A.bizB }, {});
    await expect(assess(A, r.candidateId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Owner Outcome Persistence v1 — System B (process tasks) and explicit linking", () => {
  const acceptCompliance = async (tn: Tenant, contract: Record<string, unknown>) => {
    const item = await seedComplianceItem(tn, tn.actor);
    await recordOwnerDecision(tn.ws, tn.actor, tn.biz, { candidateId: item.candidateId, state: "ACCEPTED", contract }, deps);
    return item;
  };

  it("30/56. a commitment with no linked execution source is explicit: NO_EXECUTION_SOURCE_LINKED, no learning loop, nothing guessed", async () => {
    const item = await acceptCompliance(A, { verificationMetric: "days_to_expiry", targetDirection: "up", baselineValue: 5, baselineProvenance: "MEASURED" });
    const { assessment } = await assess(A, item.candidateId);
    expect(assessment).toMatchObject({ sourceSystem: "NONE", sourceLinkState: "NO_EXECUTION_SOURCE_LINKED", executionStatus: "NOT_STARTED", learningEligibility: "NO_LEARNING_LOOP", processTaskId: null });
    await expect(assess(A, (await seedComplianceItem(A, A.actor)).candidateId)).rejects.toBeInstanceOf(ValidationError); // no decision ⇒ nothing to assess
  });

  it("28-29/10. a task is linked ONLY by explicit reference; direction comes from the commitment; the OwnerActionOutcome is linked; neither source row changes", async () => {
    const item = await acceptCompliance(A, { verificationMetric: "complaint_count", targetDirection: "down" });
    const task = await seedProcessTask(A, { status: "OUTCOME_RECORDED", completedAt: daysAgo(20), targetMetricName: "complaint_count" });
    const outcomeId = await seedActionOutcome(A, { taskKey: task.taskKey, metric: "complaint_count", before: 10, after: 4, periodEnd: daysAgo(2), window: 7 });
    await db.processExecutionTask.update({ where: { id: task.id }, data: { outcomeId } });
    const outcomeBefore = await db.ownerActionOutcome.findUniqueOrThrow({ where: { id: outcomeId } });

    // before linking: the legacy task has NO commitment, so its direction is unknown (never defaulted to up)
    const legacy = await assessPersistedOwnerOutcome(A.ws, A.actor, A.biz, { processTaskKey: task.taskKey }, deps);
    expect(legacy.assessment.chainKey).toBe(`process_task:${task.id}`);
    expect(legacy.assessment).toMatchObject({ ownerDecisionId: null, decisionLinkState: "UNLINKED_NO_DECISION", measurementResult: "CHANGED_DIRECTION_UNKNOWN", targetAttainment: "NO_TARGET", ownerActionOutcomeId: outcomeId, sourceSystem: "SYSTEM_B" });

    // explicit link: the commitment's persisted direction (down) now applies
    const linked = await linkProcessTaskToDecision(A.ws, A.actor, A.biz, { candidateId: item.candidateId, processTaskKey: task.taskKey }, deps);
    expect(linked.assessment.chainKey).toBe(item.candidateId);
    expect(linked.assessment).toMatchObject({ processTaskId: task.id, processTaskKey: task.taskKey, ownerActionOutcomeId: outcomeId, measurementResult: "IMPROVED", sourceSystem: "SYSTEM_B", decisionLinkState: "LINKED" });
    // linking the same pair again is idempotent
    const relink = await linkProcessTaskToDecision(A.ws, A.actor, A.biz, { candidateId: item.candidateId, processTaskKey: task.taskKey }, deps);
    expect(relink.created).toBe(false);
    // the legacy chain history is untouched and the two chains are not merged
    expect((await getOwnerOutcomeChain(A.ws, A.biz, { processTaskKey: task.taskKey })).chainKey).toBe(item.candidateId);
    expect(await db.ownerOutcomeAssessment.count({ where: { workspaceId: A.ws, chainKey: `process_task:${task.id}` } })).toBe(1);
    expect(await db.ownerActionOutcome.findUniqueOrThrow({ where: { id: outcomeId } })).toEqual(outcomeBefore);
  });

  it("a commitment whose metric differs from the task's does not lend it a direction", async () => {
    const item = await acceptCompliance(A, { verificationMetric: "other_metric", targetDirection: "down" });
    const task = await seedProcessTask(A, { status: "OUTCOME_RECORDED", completedAt: daysAgo(20), targetMetricName: "complaint_count" });
    const outcomeId = await seedActionOutcome(A, { taskKey: task.taskKey, metric: "complaint_count", before: 10, after: 4, periodEnd: daysAgo(2) });
    await db.processExecutionTask.update({ where: { id: task.id }, data: { outcomeId } });
    const r = await linkProcessTaskToDecision(A.ws, A.actor, A.biz, { candidateId: item.candidateId, processTaskKey: task.taskKey }, deps);
    expect(r.assessment.measurementResult).toBe("CHANGED_DIRECTION_UNKNOWN");
  });

  it("45/54. an external-event outcome is CONFOUNDED, never success, never learning-eligible; an unverifiable verifier is never 'independent'", async () => {
    const task = await seedProcessTask(A, { status: "OUTCOME_VERIFIED", completedAt: daysAgo(20), targetMetricName: "m" });
    const outcomeId = await seedActionOutcome(A, { taskKey: task.taskKey, status: "external_event_interference", metric: "m", before: 10, after: 4, external: true, periodEnd: daysAgo(2), verifiedBy: A.actor, classification: "EXTERNAL_EVENT_INTERFERENCE" });
    await db.processExecutionTask.update({ where: { id: task.id }, data: { outcomeId } });
    const { assessment } = await assessPersistedOwnerOutcome(A.ws, A.actor, A.biz, { processTaskKey: task.taskKey }, deps);
    expect(assessment).toMatchObject({ externalInterference: true, measurementResult: "EXTERNALLY_CONFOUNDED", causalAttribution: "CONFOUNDED", learningEligibility: "NOT_ELIGIBLE", independentlyVerified: false });
    expect(assessment.verifierKind).toBe("UNKNOWN"); // no persisted independence fact ⇒ not claimed
  });

  it("31. free text / heuristic links are rejected; a System A action cannot be merged with a process task", async () => {
    const item = await acceptCompliance(A, {});
    const task = await seedProcessTask(A, {});
    await expect(linkProcessTaskToDecision(A.ws, A.actor, A.biz, { candidateId: "Renew trade licence", processTaskKey: task.taskKey }, deps)).rejects.toBeInstanceOf(ValidationError);
    await expect(linkProcessTaskToDecision(A.ws, A.actor, A.biz, { candidateId: item.candidateId, processTaskKey: "Renew trade licence task" }, deps)).rejects.toBeInstanceOf(NotFoundError);
    const ch = await financeChain(A, { status: "proposed", completedAt: null });
    await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: ch.candidateId, state: "ACCEPTED", contract: {} }, deps);
    await expect(linkProcessTaskToDecision(A.ws, A.actor, A.biz, { candidateId: ch.candidateId, processTaskKey: task.taskKey }, deps)).rejects.toBeInstanceOf(ValidationError);
  });

  it("a task can belong to only one commitment, and a commitment to only one task", async () => {
    const i1 = await acceptCompliance(A, {});
    const i2 = await acceptCompliance(A, {});
    const t1 = await seedProcessTask(A, {});
    const t2 = await seedProcessTask(A, {});
    await linkProcessTaskToDecision(A.ws, A.actor, A.biz, { candidateId: i1.candidateId, processTaskKey: t1.taskKey }, deps);
    await expect(linkProcessTaskToDecision(A.ws, A.actor, A.biz, { candidateId: i2.candidateId, processTaskKey: t1.taskKey }, deps)).rejects.toBeInstanceOf(ConflictError);
    await expect(linkProcessTaskToDecision(A.ws, A.actor, A.biz, { candidateId: i1.candidateId, processTaskKey: t2.taskKey }, deps)).rejects.toBeInstanceOf(ConflictError);
    // concurrent attempts to claim the same task for two commitments: exactly one wins
    const i3 = await acceptCompliance(A, {});
    const i4 = await acceptCompliance(A, {});
    const t3 = await seedProcessTask(A, {});
    const raced = await withClients(2, ([c1, c2]) => Promise.allSettled([
      linkProcessTaskToDecision(A.ws, A.actor, A.biz, { candidateId: i3.candidateId, processTaskKey: t3.taskKey }, { ...deps, client: c1 }),
      linkProcessTaskToDecision(A.ws, A.actor, A.biz, { candidateId: i4.candidateId, processTaskKey: t3.taskKey }, { ...deps, client: c2 }),
    ]));
    expect(raced.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(await db.ownerOutcomeAssessment.count({ where: { workspaceId: A.ws, processTaskId: t3.id } })).toBe(1);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Owner Outcome Persistence v1 — database guards", () => {
  async function aRow() {
    const ch = await financeChain(A, { verification: V0(14) });
    const d = await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: ch.candidateId, state: "ACCEPTED", contract: {} }, deps).catch(() => null);
    const { assessment } = await assess(A, ch.candidateId);
    return { ch, d, assessment };
  }
  function V0(after: number) { return { before: 10, after, direction: "up" }; }

  it("both tables are append-only: UPDATE and DELETE are refused by the database", async () => {
    const { assessment } = await aRow();
    await expect(db.ownerOutcomeAssessment.update({ where: { id: assessment.id }, data: { issueResolution: "STILL_OPEN" } })).rejects.toThrow(/append-only/);
    await expect(db.ownerOutcomeAssessment.delete({ where: { id: assessment.id } })).rejects.toThrow(/append-only/);
    const dec = await db.ownerDecisionRecord.findFirstOrThrow({ where: { workspaceId: A.ws } });
    await expect(db.ownerDecisionRecord.update({ where: { id: dec.id }, data: { decisionState: "REJECTED" } })).rejects.toThrow(/append-only/);
    await expect(db.ownerDecisionRecord.delete({ where: { id: dec.id } })).rejects.toThrow(/append-only/);
  });

  it("the database refuses causation stronger than PLAUSIBLE, RESOLVED without a diagnosis cycle, and an unreferenced version chain", async () => {
    const { assessment } = await aRow();
    const { id: _id, createdAt: _c, ...rest } = assessment;
    void _id; void _c;
    const make = (over: Record<string, unknown>) => db.ownerOutcomeAssessment.create({ data: { ...(rest as never), id: randomUUID(), chainKey: `chk:${randomUUID()}`, version: 1, previousAssessmentId: null, ownerDecisionId: null, ...over } as never });
    await expect(make({ causalAttribution: "PROVEN" })).rejects.toThrow();
    await expect(make({ causalAttribution: "CAUSED" })).rejects.toThrow();
    await expect(make({ issueResolution: "RESOLVED", newerDiagnosisCycleId: null })).rejects.toThrow();
    await expect(make({ version: 2, previousAssessmentId: null })).rejects.toThrow();
    await expect(make({ version: 1, previousAssessmentId: assessment.id })).rejects.toThrow();
    await expect(make({ learningEligibility: "ELIGIBLE_EVERYWHERE" })).rejects.toThrow();
  });

  it("the database refuses a decision that breaks the contract shape (REJECTED with a contract, a baseline without provenance, a bad direction)", async () => {
    const { ch } = await aRow();
    const base = {
      id: randomUUID(), workspaceId: A.ws, businessId: A.biz, candidateId: ch.candidateId, candidateSource: "domain_action", domain: "finance", sourceId: ch.id,
      decisionState: "REJECTED", sequence: 99, decidedById: A.actor, decidedAt: NOW, recommendationSnapshot: {}, decisionContractVersion: "owner-decision-v1", requestFingerprint: "x",
    };
    await expect(db.ownerDecisionRecord.create({ data: { ...base, targetDirection: "up" } })).rejects.toThrow();
    await expect(db.ownerDecisionRecord.create({ data: { ...base, decisionState: "ACCEPTED", targetDirection: "up", baselineValue: 3 } })).rejects.toThrow();
    await expect(db.ownerDecisionRecord.create({ data: { ...base, decisionState: "ACCEPTED", targetDirection: "sideways" } })).rejects.toThrow();
    await expect(db.ownerDecisionRecord.create({ data: { ...base, decisionState: "ACCEPTED", targetDirection: null } })).rejects.toThrow();
    await expect(db.ownerDecisionRecord.create({ data: { ...base, decisionState: "MAYBE" } })).rejects.toThrow();
    await expect(db.ownerDecisionRecord.create({ data: { ...base, decisionState: "MODIFIED", targetDirection: "up" } })).rejects.toThrow();
  });

  it("every decision / link / assessment write is audited with ids and states only (no metric values)", async () => {
    const tn = await seedTenant();
    const ch = await financeChain(tn, { status: "proposed", completedAt: null });
    await recordOwnerDecision(tn.ws, tn.actor, tn.biz, { candidateId: ch.candidateId, state: "ACCEPTED", contract: { targetValue: 123456, baselineValue: 987654, baselineProvenance: "MEASURED" } }, deps);
    await assessPersistedOwnerOutcome(tn.ws, tn.actor, tn.biz, { candidateId: ch.candidateId }, deps);
    const events = await db.auditEvent.findMany({ where: { workspaceId: tn.ws, eventName: { in: ["owner.decision_recorded", "owner.outcome_assessment_recorded"] } } });
    expect(events.map((e) => e.eventName).sort()).toEqual(["owner.decision_recorded", "owner.outcome_assessment_recorded"]);
    const blob = JSON.stringify(events.map((e) => e.payload));
    expect(blob).not.toMatch(/123456|987654/);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Owner Outcome Persistence v1 — workspace / business isolation", () => {
  it("66+. a caller in workspace B can neither read, assess, link nor list anything of workspace A", async () => {
    const ch = await financeChain(A, { verification: { before: 10, after: 14 } });
    await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: ch.candidateId, state: "ACCEPTED", contract: {} }, deps).catch(() => undefined);
    await assess(A, ch.candidateId);
    const item = await seedComplianceItem(A, A.actor);
    await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: item.candidateId, state: "ACCEPTED", contract: {} }, deps);
    const task = await seedProcessTask(A, { completedAt: daysAgo(3) });

    // B (its own workspace, with its OWN business) targeting A's business id
    await expect(getOwnerOutcomeChain(B.ws, A.biz, { candidateId: ch.candidateId })).rejects.toBeInstanceOf(NotFoundError);
    await expect(assessPersistedOwnerOutcome(B.ws, B.actor, A.biz, { candidateId: ch.candidateId }, deps)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listOwnerDecisions(B.ws, A.biz)).rejects.toBeInstanceOf(NotFoundError);
    await expect(linkProcessTaskToDecision(B.ws, B.actor, A.biz, { candidateId: item.candidateId, processTaskKey: task.taskKey }, deps)).rejects.toBeInstanceOf(NotFoundError);
    // B's own business, A's references: uniformly not found
    await expect(getOwnerOutcomeChain(B.ws, B.biz, { candidateId: ch.candidateId })).rejects.toBeInstanceOf(NotFoundError);
    await expect(assessPersistedOwnerOutcome(B.ws, B.actor, B.biz, { candidateId: ch.candidateId }, deps)).rejects.toBeInstanceOf(NotFoundError);
    await expect(assessPersistedOwnerOutcome(B.ws, B.actor, B.biz, { processTaskKey: task.taskKey }, deps)).rejects.toBeInstanceOf(NotFoundError);
    await expect(linkProcessTaskToDecision(B.ws, B.actor, B.biz, { candidateId: item.candidateId, processTaskKey: task.taskKey }, deps)).rejects.toBeInstanceOf(NotFoundError);
    expect(await getLatestOwnerDecision(B.ws, B.biz, ch.candidateId)).toBeNull();
    expect((await listOwnerDecisions(B.ws, B.biz)).length).toBe(0);
    // nothing from A leaked into B's tables
    expect(await db.ownerOutcomeAssessment.count({ where: { workspaceId: B.ws, chainKey: { in: [ch.candidateId, item.candidateId] } } })).toBe(0);
  });

  it("same workspace, different business: A's second business sees nothing of A's first, and cannot link its tasks", async () => {
    const ch = await financeChain(A, { verification: { before: 10, after: 14 } });
    await assess(A, ch.candidateId);
    await expect(getOwnerOutcomeChain(A.ws, A.bizB, { candidateId: ch.candidateId })).rejects.toBeInstanceOf(NotFoundError);
    await expect(assessPersistedOwnerOutcome(A.ws, A.actor, A.bizB, { candidateId: ch.candidateId }, deps)).rejects.toBeInstanceOf(NotFoundError);
    const itemB = await seedComplianceItem({ ws: A.ws, biz: A.bizB }, A.actor);
    await recordOwnerDecision(A.ws, A.actor, A.bizB, { candidateId: itemB.candidateId, state: "ACCEPTED", contract: {} }, deps);
    const taskA = await seedProcessTask(A, {});
    await expect(linkProcessTaskToDecision(A.ws, A.actor, A.bizB, { candidateId: itemB.candidateId, processTaskKey: taskA.taskKey }, deps)).rejects.toBeInstanceOf(NotFoundError);
    // a business-less (workspace-level) task is never linkable into a business chain
    const wsTask = await seedProcessTask({ ws: A.ws, biz: null }, {});
    await expect(linkProcessTaskToDecision(A.ws, A.actor, A.biz, { candidateId: (await (async () => { const it = await seedComplianceItem(A, A.actor); await recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: it.candidateId, state: "ACCEPTED", contract: {} }, deps); return it; })()).candidateId, processTaskKey: wsTask.taskKey }, deps)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("an OwnerActionOutcome of another business is never attached to a task, even when the task row points at it", async () => {
    const task = await seedProcessTask(A, { status: "OUTCOME_RECORDED", completedAt: daysAgo(10) });
    const foreignOutcome = await seedActionOutcome({ ws: A.ws, biz: A.bizB }, { taskKey: task.taskKey, metric: "m", before: 10, after: 1, periodEnd: daysAgo(1) });
    await db.processExecutionTask.update({ where: { id: task.id }, data: { outcomeId: foreignOutcome } });
    const { assessment } = await assessPersistedOwnerOutcome(A.ws, A.actor, A.biz, { processTaskKey: task.taskKey }, deps);
    expect(assessment.ownerActionOutcomeId).toBeNull();
    expect((assessment.inputSnapshot as { afterValue: number | null }).afterValue).toBeNull();
  });
});
