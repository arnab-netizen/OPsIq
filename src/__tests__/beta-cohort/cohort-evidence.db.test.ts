/**
 * Controlled Beta Cohort evidence service — DB-backed contract.
 *
 * Proves, against a real database: assignment is immutable and idempotent; evidence is append-only, idempotent per key
 * with a content fingerprint, and safe under concurrency; ledger rows carry no workspace id (so no tenant read can
 * ever return them); one owner's view never contains another owner's facts or evidence; automatic facts are derived
 * live and never become understanding/trust/action; fixture and internal accounts are never counted.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/beta-cohort/cohort-evidence.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { spawn } from "child_process";
import path from "path";
import { Client } from "pg";
import { randomUUID, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, ValidationError } from "@/infra/errors";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { teardownOwnerBusiness } from "@/__tests__/test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { assignCohortOwner, getCohortView, recordCohortEvidence } from "@/services/beta-cohort/cohort-evidence.service";
import { evidenceEntrySchema, type EvidenceEntry } from "@/domain/beta-cohort/evidence";

const cohortId = `T${randomBytes(5).toString("hex").toUpperCase()}`;
const code = (n: number) => `${cohortId}-${String(n).padStart(3, "0")}`;
const actorId = randomUUID();
const key = () => `key-${randomUUID()}`;
const obs = (over: Record<string, unknown>): EvidenceEntry => evidenceEntrySchema.parse({ entryType: "OBSERVATION", source: "OPERATOR_OBSERVED", ...over });

interface Seeded { betaRequestId: string; workspaceId: string; userId: string; email: string }
const toTear: string[] = [];

async function seedOwner(opts: { status?: string; domain?: string; verified?: boolean; noAccount?: boolean } = {}): Promise<Seeded> {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const betaRequestId = randomUUID();
  const email = `cohort-${userId.slice(0, 8)}@${opts.domain ?? "example.com"}`;
  await db.betaRequest.create({ data: { id: betaRequestId, email, status: opts.status ?? "INVITED", invitedAt: new Date(Date.now() - 3 * 86_400_000), updatedAt: new Date() } });
  if (!opts.noAccount) {
    await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date(), emailVerifiedAt: opts.verified === false ? null : new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "Cohort WS", slug: `cohort-${workspaceId.slice(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId, workspaceId, role: "admin", isActive: true } });
  }
  return { betaRequestId, workspaceId, userId, email };
}

async function productEvent(workspaceId: string, name: keyof typeof AUDIT_EVENTS) {
  await emitAuditEvent({ eventName: AUDIT_EVENTS[name], workspaceId, visibility: "internal" });
}

const assignInput = (s: Seeded, n: number, kind: "REAL_OWNER" | "QA_MECHANICS" = "REAL_OWNER") => ({
  betaRequestId: s.betaRequestId, cohortId, ownerCode: code(n), kind, idempotencyKey: key(),
});

const TSX = path.resolve(process.cwd(), "node_modules/.bin/tsx");
const CHILD = path.resolve(process.cwd(), "src/__tests__/test-helpers/cohort-writer-child.ts");
interface ChildResult { ok: boolean; replayed?: boolean; name?: string; message?: string }
/** A real second session: its own process, own pool. All children wait on the same barrier so they truly overlap. */
function writerProcess(spec: Record<string, unknown>): Promise<ChildResult> {
  const env = { ...process.env } as Record<string, string | undefined>;
  delete env.VITEST; delete env.VITEST_WORKER_ID; delete env.VITEST_POOL_ID;
  const child = spawn(TSX, [CHILD, JSON.stringify(spec)], { env: env as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; let err = "";
  child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (err += d));
  return new Promise((resolve, reject) => {
    child.on("close", () => {
      const line = out.split("\n").find((l) => l.startsWith("RESULT:"));
      if (!line) return reject(new Error(`writer process produced no result: ${err.slice(-600)}`));
      resolve(JSON.parse(line.slice("RESULT:".length)));
    });
  });
}

const countRows = (eventName: string, entityId: string) => db.auditEvent.count({ where: { eventName, entityId } });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Controlled Beta Cohort evidence service", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: actorId, email: `cohort-operator-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  });

  describe("assignment", () => {
    it("assigns an INVITED request, replays the identical assignment as a no-op, and refuses any reassignment", async () => {
      const s = await seedOwner();
      const first = await assignCohortOwner(assignInput(s, 1), actorId);
      expect(first).toMatchObject({ replayed: false, ownerCode: code(1), cohortId });
      const again = await assignCohortOwner(assignInput(s, 1), actorId);
      expect(again).toMatchObject({ replayed: true, assignmentId: first.assignmentId });
      expect(await countRows(AUDIT_EVENTS.BETA_COHORT_OWNER_ASSIGNED, s.betaRequestId)).toBe(1);
      await expect(assignCohortOwner(assignInput(s, 2), actorId)).rejects.toBeInstanceOf(ConflictError);
      await expect(assignCohortOwner(assignInput(s, 1, "QA_MECHANICS"), actorId)).rejects.toBeInstanceOf(ConflictError);
    });

    it("refuses a code already held by another request, and a request that is not INVITED", async () => {
      const a = await seedOwner();
      const b = await seedOwner();
      await assignCohortOwner(assignInput(a, 3), actorId);
      await expect(assignCohortOwner(assignInput(b, 3), actorId)).rejects.toBeInstanceOf(ConflictError);
      const revoked = await seedOwner({ status: "REVOKED" });
      await expect(assignCohortOwner(assignInput(revoked, 4), actorId)).rejects.toBeInstanceOf(ValidationError);
    });

    it("an internal OpsIQ address can only be QA_MECHANICS, never a REAL_OWNER", async () => {
      const internal = await seedOwner({ domain: "opsiq.solutions" });
      await expect(assignCohortOwner(assignInput(internal, 5), actorId)).rejects.toBeInstanceOf(ValidationError);
      await expect(assignCohortOwner(assignInput(internal, 5, "QA_MECHANICS"), actorId)).resolves.toMatchObject({ replayed: false });
    });

    it("concurrent assignments of the SAME code to different requests: exactly one wins", async () => {
      const seeded = await Promise.all([seedOwner(), seedOwner(), seedOwner(), seedOwner(), seedOwner()]);
      const results = await Promise.allSettled(seeded.map((s) => assignCohortOwner({ ...assignInput(s, 6), idempotencyKey: key() }, actorId)));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(4);
    });
  });

  describe("evidence ledger", () => {
    it("refuses evidence for a request that is not assigned", async () => {
      const s = await seedOwner();
      await expect(recordCohortEvidence({ betaRequestId: s.betaRequestId, idempotencyKey: key(), entry: obs({ trust: "YES" }) }, actorId)).rejects.toBeInstanceOf(ValidationError);
    });

    it("is idempotent per key (same entry → replay, no new row) and a different entry under the same key is a conflict", async () => {
      const s = await seedOwner();
      await assignCohortOwner(assignInput(s, 10), actorId);
      const k = key();
      const first = await recordCohortEvidence({ betaRequestId: s.betaRequestId, idempotencyKey: k, entry: obs({ understanding: "YES" }) }, actorId);
      const replay = await recordCohortEvidence({ betaRequestId: s.betaRequestId, idempotencyKey: k, entry: obs({ understanding: "YES" }) }, actorId);
      expect(first.replayed).toBe(false);
      expect(replay).toMatchObject({ replayed: true, entryId: first.entryId });
      expect(await countRows(AUDIT_EVENTS.BETA_COHORT_EVIDENCE_RECORDED, s.betaRequestId)).toBe(1);
      await expect(recordCohortEvidence({ betaRequestId: s.betaRequestId, idempotencyKey: k, entry: obs({ understanding: "NO" }) }, actorId)).rejects.toBeInstanceOf(ConflictError);
    });

    it("concurrent duplicate submissions of one entry produce exactly one row", async () => {
      const s = await seedOwner();
      await assignCohortOwner(assignInput(s, 11), actorId);
      const k = key();
      const results = await Promise.all(Array.from({ length: 6 }, () => recordCohortEvidence({ betaRequestId: s.betaRequestId, idempotencyKey: k, entry: obs({ trust: "PARTIAL" }) }, actorId)));
      expect(results.filter((r) => !r.replayed)).toHaveLength(1);
      expect(await countRows(AUDIT_EVENTS.BETA_COHORT_EVIDENCE_RECORDED, s.betaRequestId)).toBe(1);
    });

    it("rejects future-dated statements", async () => {
      const s = await seedOwner();
      await assignCohortOwner(assignInput(s, 12), actorId);
      const future = new Date(Date.now() + 3 * 86_400_000);
      await expect(recordCohortEvidence({ betaRequestId: s.betaRequestId, idempotencyKey: key(), entry: obs({ trust: "YES", observedAt: future.toISOString() }) }, actorId)).rejects.toBeInstanceOf(ValidationError);
      await expect(recordCohortEvidence({ betaRequestId: s.betaRequestId, idempotencyKey: key(), entry: obs({ realWorldAction: "DONE", actionTakenOn: future.toISOString().slice(0, 10) }) }, actorId)).rejects.toBeInstanceOf(ValidationError);
    });

    it("an issue can be resolved once; resolving a foreign or unknown issue, or resolving twice, is refused", async () => {
      const a = await seedOwner();
      const b = await seedOwner();
      await assignCohortOwner(assignInput(a, 13), actorId);
      await assignCohortOwner(assignInput(b, 14), actorId);
      const issue = await recordCohortEvidence({
        betaRequestId: a.betaRequestId, idempotencyKey: key(),
        entry: evidenceEntrySchema.parse({ entryType: "ISSUE", severity: "P2", category: "TRUST", summary: "Could not tell where the figure came from", trustBlocker: true }),
      }, actorId);
      const resolution = (betaRequestId: string, issueId: string) => recordCohortEvidence({
        betaRequestId, idempotencyKey: key(), entry: evidenceEntrySchema.parse({ entryType: "ISSUE_RESOLUTION", issueId, resolutionNote: "Clarified in copy" }),
      }, actorId);
      await expect(resolution(b.betaRequestId, issue.entryId)).rejects.toBeInstanceOf(ValidationError); // another owner's issue
      await expect(resolution(a.betaRequestId, randomUUID())).rejects.toBeInstanceOf(ValidationError);
      await expect(resolution(a.betaRequestId, issue.entryId)).resolves.toMatchObject({ replayed: false });
      await expect(resolution(a.betaRequestId, issue.entryId)).rejects.toBeInstanceOf(ConflictError);
    });

    it("stores free text redacted (no email, URL or token survives into the ledger)", async () => {
      const s = await seedOwner();
      await assignCohortOwner(assignInput(s, 15), actorId);
      const r = await recordCohortEvidence({
        betaRequestId: s.betaRequestId, idempotencyKey: key(),
        entry: obs({ ownerFeedback: "write to me at someone@example.com or https://example.com/a?b=c token 0123456789abcdef0123456789abcdef" }),
      }, actorId);
      const row = await db.auditEvent.findUnique({ where: { id: r.entryId } });
      const stored = JSON.stringify(row?.payload);
      expect(stored).not.toMatch(/someone@example\.com|https?:\/\/|0123456789abcdef/);
      expect(stored).toContain("[redacted-email]");
    });
  });

  describe("multi-instance concurrency (separate processes, own pools)", () => {
    it("six processes recording the SAME entry under one key produce exactly one row", async () => {
      const s = await seedOwner();
      await assignCohortOwner(assignInput(s, 50), actorId);
      const k = key();
      const startAt = Date.now() + 4000;
      const results = await Promise.all(Array.from({ length: 6 }, () => writerProcess({
        op: "evidence", actorId, startAt,
        input: { betaRequestId: s.betaRequestId, idempotencyKey: k, entry: { entryType: "OBSERVATION", source: "OPERATOR_OBSERVED", trust: "PARTIAL" } },
      })));
      expect(results.every((r) => r.ok)).toBe(true);
      expect(results.filter((r) => r.replayed === false)).toHaveLength(1);
      expect(await countRows(AUDIT_EVENTS.BETA_COHORT_EVIDENCE_RECORDED, s.betaRequestId)).toBe(1);
    }, 60_000);

    it("six processes assigning the SAME owner code to six different requests: exactly one wins, the rest are refused", async () => {
      const seeded = await Promise.all(Array.from({ length: 6 }, () => seedOwner({ noAccount: true })));
      const startAt = Date.now() + 4000;
      const results = await Promise.all(seeded.map((s) => writerProcess({
        op: "assign", actorId, startAt,
        input: { betaRequestId: s.betaRequestId, cohortId, ownerCode: code(51), kind: "REAL_OWNER", idempotencyKey: key() },
      })));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok && r.name === "ConflictError")).toHaveLength(5);
      const rows = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.BETA_COHORT_OWNER_ASSIGNED, payload: { path: ["ownerCode"], equals: code(51) } } });
      expect(rows).toBe(1);
    }, 60_000);

    it("the same request assigned into two DIFFERENT cohorts at once: exactly one assignment exists", async () => {
      const s = await seedOwner({ noAccount: true });
      const other = `U${randomBytes(5).toString("hex").toUpperCase()}`;
      const startAt = Date.now() + 4000;
      const results = await Promise.all([
        writerProcess({ op: "assign", actorId, startAt, input: { betaRequestId: s.betaRequestId, cohortId, ownerCode: code(52), kind: "REAL_OWNER", idempotencyKey: key() } }),
        writerProcess({ op: "assign", actorId, startAt, input: { betaRequestId: s.betaRequestId, cohortId: other, ownerCode: `${other}-001`, kind: "REAL_OWNER", idempotencyKey: key() } }),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await countRows(AUDIT_EVENTS.BETA_COHORT_OWNER_ASSIGNED, s.betaRequestId)).toBe(1);
    }, 60_000);
  });

  describe("the serialisation locks are really taken (deterministic: hold the lock from a second connection)", () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    /** Holds `lockKey` in an open transaction on its OWN connection, runs `action` while held, and reports whether it was blocked. */
    async function blockedWhileHeld<T>(lockKey: string, action: () => Promise<T>): Promise<{ blockedWhileHeld: boolean; result: T }> {
      const holder = new Client({ connectionString: process.env.DATABASE_URL });
      await holder.connect();
      try {
        await holder.query("BEGIN");
        await holder.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);
        let settled = false;
        const pending = action().then((r) => { settled = true; return r; });
        await sleep(1200);
        const blocked = !settled;
        await holder.query("COMMIT"); // release
        return { blockedWhileHeld: blocked, result: await pending };
      } finally {
        await holder.end().catch(() => undefined);
      }
    }

    it("recording evidence waits for the per-owner lock, then completes", async () => {
      const s = await seedOwner();
      await assignCohortOwner(assignInput(s, 53), actorId);
      const r = await blockedWhileHeld(`beta_cohort_evidence:${s.betaRequestId}`, () =>
        recordCohortEvidence({ betaRequestId: s.betaRequestId, idempotencyKey: key(), entry: obs({ trust: "YES" }) }, actorId));
      expect(r.blockedWhileHeld).toBe(true);
      expect(r.result.replayed).toBe(false);
    }, 30_000);

    it("assigning an owner waits for the global assignment lock, then completes", async () => {
      const s = await seedOwner({ noAccount: true });
      const r = await blockedWhileHeld("beta_cohort_assign", () => assignCohortOwner(assignInput(s, 54), actorId));
      expect(r.blockedWhileHeld).toBe(true);
      expect(r.result.replayed).toBe(false);
    }, 30_000);
  });

  describe("isolation", () => {
    it("ledger rows carry no workspace id, so no tenant-scoped audit read can return them; visibility is internal", async () => {
      const s = await seedOwner();
      await assignCohortOwner(assignInput(s, 20), actorId);
      const r = await recordCohortEvidence({ betaRequestId: s.betaRequestId, idempotencyKey: key(), entry: obs({ trust: "NO", whatLooksWrong: "the headline" }) }, actorId);
      const row = await db.auditEvent.findUnique({ where: { id: r.entryId } });
      expect(row?.workspaceId).toBeNull();
      expect(row?.visibility).toBe("internal");
      const tenantRead = await db.auditEvent.findMany({
        where: { workspaceId: s.workspaceId, eventName: { in: [AUDIT_EVENTS.BETA_COHORT_EVIDENCE_RECORDED, AUDIT_EVENTS.BETA_COHORT_OWNER_ASSIGNED] } },
      });
      expect(tenantRead).toHaveLength(0);
    });

    it("each owner's view contains only that owner's facts and evidence", async () => {
      const a = await seedOwner();
      const b = await seedOwner();
      await assignCohortOwner(assignInput(a, 21), actorId);
      await assignCohortOwner(assignInput(b, 22), actorId);
      await productEvent(a.workspaceId, "PRODUCT_FIRST_RESULT_VIEWED");
      await recordCohortEvidence({ betaRequestId: a.betaRequestId, idempotencyKey: key(), entry: obs({ understanding: "YES", trust: "YES" }) }, actorId);
      await recordCohortEvidence({ betaRequestId: b.betaRequestId, idempotencyKey: key(), entry: obs({ understanding: "NO", whatLooksWrong: "unclear" }) }, actorId);

      const view = await getCohortView(cohortId);
      const va = view.owners.find((o) => o.assignment.ownerCode === code(21))!;
      const vb = view.owners.find((o) => o.assignment.ownerCode === code(22))!;
      expect(va.automatic.firstResultViewedAt).not.toBeNull();
      expect(vb.automatic.firstResultViewedAt).toBeNull(); // A's product events never leak into B
      expect(va.evidence.understanding).toBe("YES");
      expect(vb.evidence.understanding).toBe("NO");
      expect(vb.evidence.whatLooksWrong).toBe("unclear");
      expect(va.evidence.whatLooksWrong).toBeNull();
      expect(va.evidence.entryCount).toBe(1);
    });

    it("a different cohort's view does not contain these owners", async () => {
      const other = await getCohortView(`Z${randomBytes(4).toString("hex").toUpperCase()}`);
      expect(other.owners).toHaveLength(0);
      expect(other.gate.gate).toBe("CLOSED");
    });
  });

  describe("automatic facts are derived live and are never evidence", () => {
    it("reflects signup/verification/first read/return visit, while understanding, trust, action and outcome stay UNKNOWN", async () => {
      const s = await seedOwner();
      await assignCohortOwner(assignInput(s, 30), actorId);
      await productEvent(s.workspaceId, "PRODUCT_FIRST_DIAGNOSIS_COMPLETED");
      await productEvent(s.workspaceId, "PRODUCT_FIRST_RESULT_VIEWED");
      await productEvent(s.workspaceId, "PRODUCT_RETURNING_OWNER");
      const v = (await getCohortView(cohortId)).owners.find((o) => o.assignment.ownerCode === code(30))!;
      expect(v.automatic.accountFound).toBe(true);
      expect(v.automatic.signupAt).not.toBeNull();
      expect(v.automatic.emailVerifiedAt).not.toBeNull();
      expect(v.automatic.firstResultViewedAt).not.toBeNull();
      expect(v.automatic.returnVisitCount).toBe(1);
      expect(v.stage).toBe("RETURNED");
      expect([v.evidence.understanding, v.evidence.trust, v.evidence.realWorldAction, v.evidence.outcome]).toEqual(["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"]);
      expect(v.firstTrustedValue).toBeNull();
      expect(v.countedInGate).toBe(true);
    });

    it("an unverified owner shows verification as not observed (null, not a guess)", async () => {
      const s = await seedOwner({ verified: false });
      await assignCohortOwner(assignInput(s, 31), actorId);
      const v = (await getCohortView(cohortId)).owners.find((o) => o.assignment.ownerCode === code(31))!;
      expect(v.automatic.signupAt).not.toBeNull();
      expect(v.automatic.emailVerifiedAt).toBeNull();
      expect(v.stage).toBe("SIGNED_UP");
    });

    it("an invited owner who has not signed up is shown as invited, with no account and not counted", async () => {
      const s = await seedOwner({ noAccount: true });
      await assignCohortOwner(assignInput(s, 32), actorId);
      const v = (await getCohortView(cohortId)).owners.find((o) => o.assignment.ownerCode === code(32))!;
      expect(v.automatic.accountFound).toBe(false);
      expect(v.stage).toBe("INVITED");
      expect(v.countedInGate).toBe(false);
    });

    it("a fixture business is never counted, even when assigned as a REAL_OWNER", async () => {
      const s = await seedOwner();
      const business = await createBusiness({ name: "Cohort Fixture", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, s.userId, s.workspaceId);
      toTear.push(business.id);
      await db.ownerBusiness.update({ where: { id: business.id }, data: { isFixtureBusiness: true } });
      await assignCohortOwner(assignInput(s, 33), actorId);
      const v = (await getCohortView(cohortId)).owners.find((o) => o.assignment.ownerCode === code(33))!;
      expect(v.automatic.isFixtureBusiness).toBe(true);
      expect(v.countedInGate).toBe(false);
    });

    it("assigned owners are removed from the candidate list, and candidates expose only a masked email", async () => {
      const unassigned = await seedOwner({ noAccount: true });
      const assigned = await seedOwner({ noAccount: true });
      await assignCohortOwner(assignInput(assigned, 34), actorId);
      const view = await getCohortView(cohortId);
      expect(view.candidates.some((c) => c.betaRequestId === unassigned.betaRequestId)).toBe(true);
      expect(view.candidates.some((c) => c.betaRequestId === assigned.betaRequestId)).toBe(false);
      const c = view.candidates.find((x) => x.betaRequestId === unassigned.betaRequestId)!;
      expect(c.emailHint).not.toContain(unassigned.email);
      expect(JSON.stringify(view)).not.toContain(unassigned.email);
    });
  });

  describe("end to end", () => {
    it("a genuine owner journey recorded as evidence yields first trusted value, T+7 scheduling and a follow-up; the gate stays CLOSED with one owner", async () => {
      const s = await seedOwner();
      await assignCohortOwner(assignInput(s, 40), actorId);
      await productEvent(s.workspaceId, "PRODUCT_FIRST_DIAGNOSIS_COMPLETED");
      await productEvent(s.workspaceId, "PRODUCT_FIRST_RESULT_VIEWED");
      await recordCohortEvidence({ betaRequestId: s.betaRequestId, idempotencyKey: key(), entry: obs({ understanding: "YES", trust: "YES", wouldTakeAction: "YES" }) }, actorId);
      const acted = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
      await recordCohortEvidence({ betaRequestId: s.betaRequestId, idempotencyKey: key(), entry: obs({ realWorldAction: "DONE", actionTakenOn: acted }) }, actorId);

      let v = (await getCohortView(cohortId)).owners.find((o) => o.assignment.ownerCode === code(40))!;
      expect(v.firstTrustedValue).not.toBeNull();
      expect(v.firstTrustedValue?.stillHolds).toBe(true);
      expect(v.evidence.realWorldAction).toBe("DONE");
      expect(v.t7.status).toBe("NOT_DUE");
      expect(v.t7.dueAt?.toISOString().slice(0, 10)).toBe(new Date(new Date(`${acted}T00:00:00Z`).getTime() + 7 * 86_400_000).toISOString().slice(0, 10));

      await recordCohortEvidence({
        betaRequestId: s.betaRequestId, idempotencyKey: key(),
        entry: evidenceEntrySchema.parse({
          entryType: "FOLLOW_UP_T7", source: "OWNER_STATED", actionTaken: "DONE", recommendationStillRelevant: "YES", measurableSignalChanged: "UNKNOWN",
          ownerUsefulness: "YES", shouldChangeConclusion: "NO", outcome: "UNKNOWN", causalBasis: "NOT_ESTABLISHED",
        }),
      }, actorId);
      const view = await getCohortView(cohortId);
      v = view.owners.find((o) => o.assignment.ownerCode === code(40))!;
      expect(v.t7.status).toBe("COMPLETED");
      expect(v.evidence.outcome).toBe("UNKNOWN"); // honest default retained
      expect(view.gate.gate).toBe("CLOSED");
    });
  });

  it("cleanup", async () => {
    for (const id of toTear) await teardownOwnerBusiness(id).catch(() => undefined);
  });
});
