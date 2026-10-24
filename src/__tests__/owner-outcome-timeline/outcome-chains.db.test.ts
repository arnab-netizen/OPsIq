/**
 * Owner Outcome Timeline v1 — real-Postgres proof of the business-level chain read and of the
 * decision → commitment → assessment history the timeline renders.
 *
 * Covers: zero state, ordering, full immutable history, current = highest version, stale-vs-current assessment,
 * unknown-vs-zero round trip, rejected/deferred chains, idempotent duplicate submissions, equality with the single-chain
 * read, truncation, and cross-business / cross-workspace isolation. Uses the existing outcome fixtures and services; adds
 * no engine and writes no rows except through the existing services (and bulk decision rows for the truncation case).
 *
 * Requires TEST_WITH_DB=true and a migrated PostgreSQL. Self-skips otherwise.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { recordOwnerDecision, recordOwnerOutcomeContract } from "@/services/owner-outcome/owner-decision.service";
import {
  OWNER_OUTCOME_CHAIN_LIST_LIMIT, assessPersistedOwnerOutcome, getOwnerOutcomeChain, linkProcessTaskToDecision, listOwnerOutcomeChains,
} from "@/services/owner-outcome/owner-outcome-chain.service";
import { NOW, daysAgo, seedComplianceItem, seedFinanceAction, seedFinanceCycle, seedFinanceVerification, seedProcessTask, seedTenant, type Tenant } from "@/__tests__/owner-outcome/outcome-db-fixtures";
import { NEEDS_NEW_CHECK_COPY, buildTimelineStages, chainFreshness, type OwnerOutcomeChainDto } from "@/domain/owner-spine/owner-outcome-presentation";

const deps = (offsetMs = 0) => ({ now: () => new Date(NOW.getTime() + offsetMs) });
let A: Tenant;
let B: Tenant;

async function financeCandidate(tn: Tenant, biz = tn.biz, o: { status?: string; title?: string } = {}) {
  const cyc = await seedFinanceCycle({ ws: tn.ws, biz }, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
  return seedFinanceAction({ ws: tn.ws, biz }, { cycleId: cyc.cycleId, status: o.status ?? "proposed", title: o.title });
}
const asDto = (c: unknown) => JSON.parse(JSON.stringify(c)) as OwnerOutcomeChainDto;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("owner outcome timeline — chain list read [db]", () => {
  beforeAll(async () => {
    A = await seedTenant();
    B = await seedTenant();
  });

  it("zero state: a business with no decisions has no chains, no assessments, and is not 'truncated'", async () => {
    const t = await seedTenant();
    expect(await listOwnerOutcomeChains(t.ws, t.biz)).toEqual({ businessId: t.biz, chains: [], truncated: false });
  });

  it("lists decision-backed chains most recently decided first, each with its full decision history", async () => {
    const t = await seedTenant();
    const a1 = await financeCandidate(t, t.biz, { title: "First action" });
    const a2 = await financeCandidate(t, t.biz, { title: "Second action" });
    await recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: a1.candidateId, state: "ACCEPTED", contract: {} }, deps(0));
    await recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: a2.candidateId, state: "ACCEPTED", contract: {} }, deps(60_000));
    await recordOwnerOutcomeContract(t.ws, t.actor, t.biz, { candidateId: a1.candidateId, contract: { targetDirection: "up", targetValue: 0 } }, deps(120_000));
    const list = await listOwnerOutcomeChains(t.ws, t.biz);
    expect(list.truncated).toBe(false);
    expect(list.chains.map((c) => c.chainKey)).toEqual([a1.candidateId, a2.candidateId]); // a1 was amended last
    const first = list.chains[0];
    expect(first.decisions.map((d) => d.sequence)).toEqual([1, 2]); // amendment appended, original kept
    expect(first.currentDecision?.sequence).toBe(2);
    expect(first.currentDecision?.targetValue).toBe(0); // a known zero target, preserved
    expect(first.decisions[0].targetValue).toBeNull(); // the original had no target — not target 0
    expect(list.chains[1].decisions).toHaveLength(1);
  });

  it("equals the single-chain read for the same candidate (one shared assembly, no second read model)", async () => {
    const t = await seedTenant();
    const a = await financeCandidate(t);
    await recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: a.candidateId, state: "MODIFIED", contract: { commitmentDescription: "Do it differently" } }, deps());
    await assessPersistedOwnerOutcome(t.ws, t.actor, t.biz, { candidateId: a.candidateId }, deps());
    const single = asDto(await getOwnerOutcomeChain(t.ws, t.biz, { candidateId: a.candidateId }));
    const listed = asDto((await listOwnerOutcomeChains(t.ws, t.biz)).chains[0]);
    expect(listed).toEqual(single);
    expect(listed.commitment?.followsRecommendedAction).toBe(false); // MODIFIED never looks like the recommendation was followed
  });

  it("keeps every immutable assessment version; current = highest; a changed commitment marks the old result out of date until re-checked", async () => {
    const t = await seedTenant();
    const a = await financeCandidate(t);
    await recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: a.candidateId, state: "ACCEPTED", contract: { targetDirection: "up" } }, deps(0));
    const v1 = (await assessPersistedOwnerOutcome(t.ws, t.actor, t.biz, { candidateId: a.candidateId }, deps(1_000))).assessment;
    expect(v1.version).toBe(1);
    // identical facts → same snapshot (the refresh button is safe to press repeatedly)
    const again = await assessPersistedOwnerOutcome(t.ws, t.actor, t.biz, { candidateId: a.candidateId }, deps(2_000));
    expect(again.created).toBe(false);
    expect(again.assessment.id).toBe(v1.id);

    await recordOwnerOutcomeContract(t.ws, t.actor, t.biz, { candidateId: a.candidateId, contract: { targetDirection: "up", observationWindowDays: 30 } }, deps(3_000));
    let chain = asDto((await listOwnerOutcomeChains(t.ws, t.biz)).chains[0]);
    expect(chainFreshness(chain).assessmentIsStale).toBe(true); // the assessment predates the amended commitment
    expect(chain.assessments).toHaveLength(1);
    // …and with REAL rows: the current stages carry none of v1's conclusions, while v1 itself is untouched in history.
    for (const id of ["execution", "observation", "measurement", "target", "issue", "attribution", "learning"]) {
      const st = buildTimelineStages(chain).find((s) => s.id === id)!;
      expect(st.code, id).toBeUndefined();
      expect(st.headline, id).toBe(NEEDS_NEW_CHECK_COPY);
    }
    expect(chain.assessments[0].id).toBe(v1.id);

    const v2 = (await assessPersistedOwnerOutcome(t.ws, t.actor, t.biz, { candidateId: a.candidateId }, deps(4_000))).assessment;
    expect(v2.version).toBe(2);
    expect(v2.previousAssessmentId).toBe(v1.id);
    chain = asDto((await listOwnerOutcomeChains(t.ws, t.biz)).chains[0]);
    expect(chain.assessments.map((x) => x.version)).toEqual([1, 2]);
    expect(chain.currentAssessment?.version).toBe(2);
    expect(chain.assessments[0].id).toBe(v1.id); // version 1 untouched
    expect(chainFreshness(chain).assessmentIsStale).toBe(false);
  });

  it("an assessed chain with no after-evidence renders honest, incomplete stages — never improved, resolved or caused", async () => {
    const t = await seedTenant();
    const a = await financeCandidate(t);
    await recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: a.candidateId, state: "ACCEPTED", contract: { targetDirection: "up" } }, deps());
    await assessPersistedOwnerOutcome(t.ws, t.actor, t.biz, { candidateId: a.candidateId }, deps());
    const chain = asDto((await listOwnerOutcomeChains(t.ws, t.biz)).chains[0]);
    const stages = Object.fromEntries(buildTimelineStages(chain).map((s) => [s.id, s]));
    expect(stages.measurement.code).not.toBe("IMPROVED");
    expect(stages.issue.code).not.toBe("RESOLVED");
    expect(stages.attribution.code).not.toBe("PLAUSIBLE");
    expect(stages.learning.code).not.toBe("ELIGIBLE_CONFIRMED_BY_GATE");
  });

  it("a verified improvement is shown as the persisted facts say: improved, NOT resolved, attribution at most possible", async () => {
    const t = await seedTenant();
    const cyc = await seedFinanceCycle(t, { periodEnd: daysAgo(70), generatedAt: daysAgo(70) });
    const act = await seedFinanceAction(t, { cycleId: cyc.cycleId, status: "proposed", timeframeDays: 1 });
    // A decision can only be recorded while the action is still open; execution and verification happen afterwards.
    await recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: act.candidateId, state: "ACCEPTED", contract: { targetDirection: "up" } }, deps());
    await db.ownerFinanceAction.update({ where: { id: act.id }, data: { status: "completed", completedAt: daysAgo(30) } });
    await seedFinanceVerification(t, { actionId: act.id, before: 10, after: 14, verifiedAt: daysAgo(20) });
    await assessPersistedOwnerOutcome(t.ws, t.actor, t.biz, { candidateId: act.candidateId }, deps());
    const chain = asDto((await listOwnerOutcomeChains(t.ws, t.biz)).chains[0]);
    const a = chain.currentAssessment!;
    expect(a.measurementResult).toBe("IMPROVED");
    expect(a.issueResolution).not.toBe("RESOLVED"); // no strictly newer, complete diagnosis → never resolved
    expect(["NOT_ASSESSED", "PLAUSIBLE", "CONFOUNDED", "DISPUTED", "INSUFFICIENT_EVIDENCE"]).toContain(a.causalAttribution);
    expect(a.causalAttribution).not.toBe("PROVEN");
    const st = Object.fromEntries(buildTimelineStages(chain).map((s) => [s.id, s]));
    expect(st.measurement.headline).toBe("Improved");
    expect(st.measurement.caveat).toMatch(/does not by itself show/);
    expect(st.issue.headline.toLowerCase()).not.toContain("resolved in");
  });

  it("REJECTED and DEFERRED chains are listed with no assessment and no execution facts", async () => {
    const t = await seedTenant();
    const r = await financeCandidate(t);
    const d = await financeCandidate(t);
    await recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: r.candidateId, state: "REJECTED" }, deps(0));
    await recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: d.candidateId, state: "DEFERRED", revisitAt: "2026-09-01T00:00:00.000Z" }, deps(1_000));
    const chains = (await listOwnerOutcomeChains(t.ws, t.biz)).chains.map(asDto);
    expect(chains.map((c) => c.currentDecision?.decisionState).sort()).toEqual(["DEFERRED", "REJECTED"]);
    for (const c of chains) {
      expect(c.assessments).toEqual([]);
      expect(c.currentDecision?.verificationMetric).toBeNull();
      expect(c.currentDecision?.targetDirection).toBeNull();
      expect(buildTimelineStages(c).find((s) => s.id === "execution")?.state).toBe("not_applicable");
    }
  });

  it("round-trips unknown vs zero: unset baseline stays null, a known 0 baseline stays 0 with its provenance", async () => {
    const t = await seedTenant();
    const unknown = await financeCandidate(t);
    const zero = await financeCandidate(t);
    await recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: unknown.candidateId, state: "ACCEPTED", contract: { verificationMetric: "m" } }, deps(0));
    await recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: zero.candidateId, state: "ACCEPTED", contract: { verificationMetric: "m", baselineValue: 0, baselineProvenance: "OWNER_REPORTED", targetValue: 0, targetDirection: "down" } }, deps(1_000));
    const by = Object.fromEntries((await listOwnerOutcomeChains(t.ws, t.biz)).chains.map((c) => [c.chainKey, c.currentDecision!]));
    expect(by[unknown.candidateId].baselineValue).toBeNull();
    expect(by[unknown.candidateId].baselineProvenance).toBeNull();
    expect(by[unknown.candidateId].targetValue).toBeNull();
    expect(by[unknown.candidateId].targetDirection).toBe("unknown"); // explicit unknown, never defaulted to up
    expect(by[zero.candidateId].baselineValue).toBe(0);
    expect(by[zero.candidateId].baselineProvenance).toBe("OWNER_REPORTED");
    expect(by[zero.candidateId].targetValue).toBe(0);
    expect(by[zero.candidateId].targetDirection).toBe("down");
  });

  it("duplicate decision submissions (same idempotency key / same event) leave exactly one history row", async () => {
    const t = await seedTenant();
    const a = await financeCandidate(t);
    const input = { candidateId: a.candidateId, state: "ACCEPTED" as const, contract: { targetDirection: "up" as const }, idempotencyKey: `tab-${randomUUID()}` };
    const results = await Promise.all([1, 2, 3].map(() => recordOwnerDecision(t.ws, t.actor, t.biz, input, deps())));
    expect(new Set(results.map((r) => r.decision.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    const chain = (await listOwnerOutcomeChains(t.ws, t.biz)).chains[0];
    expect(chain.decisions).toHaveLength(1);
  });

  it("compliance commitments are listed and checkable with an honest 'no execution source linked' state", async () => {
    const t = await seedTenant();
    const item = await seedComplianceItem(t, t.actor);
    await recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: item.candidateId, state: "ACCEPTED", contract: {} }, deps());
    await assessPersistedOwnerOutcome(t.ws, t.actor, t.biz, { candidateId: item.candidateId }, deps());
    const chain = asDto((await listOwnerOutcomeChains(t.ws, t.biz)).chains[0]);
    expect(chain.currentAssessment?.sourceLinkState).toBe("NO_EXECUTION_SOURCE_LINKED");
    expect(chain.currentAssessment?.executionStatus).toBe("NOT_STARTED");
  });

  describe("tenant isolation", () => {
    it("never returns another business's chains, even inside the same workspace", async () => {
      const t = await seedTenant();
      const mine = await financeCandidate(t, t.biz);
      const theirs = await financeCandidate(t, t.bizB);
      await recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: mine.candidateId, state: "ACCEPTED", contract: {} }, deps());
      await recordOwnerDecision(t.ws, t.actor, t.bizB, { candidateId: theirs.candidateId, state: "ACCEPTED", contract: {} }, deps());
      const forA = await listOwnerOutcomeChains(t.ws, t.biz);
      const forB = await listOwnerOutcomeChains(t.ws, t.bizB);
      expect(forA.chains.map((c) => c.chainKey)).toEqual([mine.candidateId]);
      expect(forB.chains.map((c) => c.chainKey)).toEqual([theirs.candidateId]);
      expect(forA.chains.every((c) => c.businessId === t.biz)).toBe(true);
    });
    it("a business of another workspace is the uniform not-found, in both directions", async () => {
      await expect(listOwnerOutcomeChains(B.ws, A.biz)).rejects.toThrow(/not found/i);
      await expect(listOwnerOutcomeChains(A.ws, B.biz)).rejects.toThrow(/not found/i);
      await expect(listOwnerOutcomeChains(A.ws, randomUUID())).rejects.toThrow(/not found/i);
    });
    it("a candidate that belongs to another business cannot be decided, so it can never appear in this business's timeline", async () => {
      const t = await seedTenant();
      const foreign = await financeCandidate(t, t.bizB);
      await expect(recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: foreign.candidateId, state: "ACCEPTED", contract: {} }, deps())).rejects.toThrow(/not found/i);
      expect((await listOwnerOutcomeChains(t.ws, t.biz)).chains).toEqual([]);
    });
    it("a candidate that belongs to another workspace cannot be decided or assessed", async () => {
      const foreign = await financeCandidate(B);
      await expect(recordOwnerDecision(A.ws, A.actor, A.biz, { candidateId: foreign.candidateId, state: "ACCEPTED", contract: {} }, deps())).rejects.toThrow(/not found/i);
      await expect(assessPersistedOwnerOutcome(A.ws, A.actor, A.biz, { candidateId: foreign.candidateId }, deps())).rejects.toThrow();
    });
    it("a process task of another business or another workspace cannot be linked to this business's commitment", async () => {
      const t = await seedTenant();
      const item = await seedComplianceItem(t, t.actor);
      await recordOwnerDecision(t.ws, t.actor, t.biz, { candidateId: item.candidateId, state: "ACCEPTED", contract: {} }, deps());
      const otherBizTask = await seedProcessTask({ ws: t.ws, biz: t.bizB });
      const otherWsTask = await seedProcessTask({ ws: B.ws, biz: B.biz });
      for (const task of [otherBizTask, otherWsTask]) {
        await expect(linkProcessTaskToDecision(t.ws, t.actor, t.biz, { candidateId: item.candidateId, processTaskKey: task.taskKey }, deps())).rejects.toThrow(/not found/i);
      }
      const chain = (await listOwnerOutcomeChains(t.ws, t.biz)).chains[0];
      expect(chain.assessments).toEqual([]); // nothing was written by the refused links
    });
    it("a foreign chain cannot be fetched through the single-chain read either", async () => {
      const t = await seedTenant();
      const foreign = await financeCandidate(t, t.bizB);
      await recordOwnerDecision(t.ws, t.actor, t.bizB, { candidateId: foreign.candidateId, state: "ACCEPTED", contract: {} }, deps());
      await expect(getOwnerOutcomeChain(t.ws, t.biz, { candidateId: foreign.candidateId })).rejects.toThrow(/not found/i);
    });
  });

  it("truncates visibly at the list limit: the newest chains are returned and `truncated` says so", async () => {
    const t = await seedTenant();
    const rows = Array.from({ length: OWNER_OUTCOME_CHAIN_LIST_LIMIT + 1 }, (_, i) => {
      const sourceId = randomUUID();
      return {
        id: randomUUID(), workspaceId: t.ws, businessId: t.biz, candidateId: `domain_action:finance:${sourceId}`, candidateSource: "domain_action", domain: "finance",
        sourceId, decisionState: "REJECTED", sequence: 1, decidedById: t.actor, decidedAt: new Date(NOW.getTime() + i * 1000), recommendationSnapshot: { title: `Bulk ${i}` },
        decisionContractVersion: "owner-decision-v1", requestFingerprint: `fp-${randomUUID()}`,
      };
    });
    await db.ownerDecisionRecord.createMany({ data: rows });
    const list = await listOwnerOutcomeChains(t.ws, t.biz);
    expect(list.truncated).toBe(true);
    expect(list.chains).toHaveLength(OWNER_OUTCOME_CHAIN_LIST_LIMIT);
    const titles = new Set(list.chains.map((c) => (c.currentDecision?.recommendationSnapshot as { title: string }).title));
    expect(titles.has(`Bulk ${OWNER_OUTCOME_CHAIN_LIST_LIMIT}`)).toBe(true); // newest kept
    expect(titles.has("Bulk 0")).toBe(false); // oldest dropped, and reported as truncated
  });
});
