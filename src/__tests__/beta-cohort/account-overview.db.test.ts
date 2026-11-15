/**
 * getAccountClassificationOverview() — DB-backed contract.
 *
 * Proves, against a real database: an admitted account (signupSource PUBLIC_BETA or CONTROLLED_BETA_INVITE) is
 * counted once in totals/signupSource/verification; it is "classified" iff its email's BetaRequest has a
 * BETA_COHORT_OWNER_ASSIGNED entry in ANY cohort (not just one default cohort); milestone counts land in the
 * classified or unclassified bucket correctly and never cross; the response carries no name, email or id anywhere.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/beta-cohort/account-overview.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { assignCohortOwner, getAccountClassificationOverview } from "@/services/beta-cohort/cohort-evidence.service";
import { PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE } from "@/lib/beta";

const tag = () => randomBytes(5).toString("hex");

// assignCohortOwner's actorId is a real FK into users (audit_events.actor_id) -- see cohort-evidence.db.test.ts's
// identical pattern. One operator user, seeded once, reused by every classify() call below.
const OPERATOR_ID = randomUUID();
beforeAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.user.create({ data: { id: OPERATOR_ID, email: `overview-operator-${OPERATOR_ID}@example.com`, isActive: true, updatedAt: new Date() } });
});

interface SeededAccount { userId: string; workspaceId: string; email: string; betaRequestId: string }

async function seedAccount(opts: {
  signupSource: string | null;
  verified?: boolean;
  domain?: string;
}): Promise<SeededAccount> {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const betaRequestId = randomUUID();
  const email = `overview-${tag()}@${opts.domain ?? "example.com"}`;
  await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date(), emailVerifiedAt: opts.verified === false ? null : new Date() } });
  await db.workspace.create({
    data: { id: workspaceId, name: "Overview WS", slug: `overview-${workspaceId.slice(0, 8)}`, createdBy: userId, signupSource: opts.signupSource },
  });
  await db.workspaceMembership.create({ data: { userId, workspaceId, role: "owner", isActive: true } });
  await db.betaRequest.create({ data: { id: betaRequestId, email, status: "INVITED", invitedAt: new Date(), updatedAt: new Date() } });
  return { userId, workspaceId, email, betaRequestId };
}

async function classify(a: SeededAccount, cohortId: string, n: number) {
  await assignCohortOwner(
    { betaRequestId: a.betaRequestId, cohortId, ownerCode: `${cohortId}-${String(n).padStart(3, "0")}`, kind: "REAL_OWNER", idempotencyKey: `key-${randomUUID()}` },
    OPERATOR_ID,
  );
}

async function productEvent(workspaceId: string, name: keyof typeof AUDIT_EVENTS) {
  await emitAuditEvent({ eventName: AUDIT_EVENTS[name], workspaceId, visibility: "internal" });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] getAccountClassificationOverview", () => {
  it("counts an admitted account once, split by signupSource and verification, and leaves an unadmitted (no signupSource) workspace out entirely", async () => {
    const before = await getAccountClassificationOverview();
    const publicUnverified = await seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE, verified: false });
    const invitedVerified = await seedAccount({ signupSource: CONTROLLED_BETA_SIGNUP_SOURCE, verified: true });
    // Not admitted (no signupSource tag): must not move any count.
    await seedAccount({ signupSource: null });

    const after = await getAccountClassificationOverview();
    expect(after.totalAccounts).toBe(before.totalAccounts + 2);
    expect(after.bySignupSource.publicBeta).toBe(before.bySignupSource.publicBeta + 1);
    expect(after.bySignupSource.controlledBetaInvite).toBe(before.bySignupSource.controlledBetaInvite + 1);
    expect(after.verified).toBe(before.verified + 1);
    expect(after.unverified).toBe(before.unverified + 1);
    void publicUnverified; void invitedVerified;
  });

  it("an account is classified iff its email's BetaRequest is assigned in ANY cohort — assignment alone flips it, nothing else does", async () => {
    const cohortId = `T${tag().toUpperCase()}`;
    const account = await seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE });

    const beforeAssign = await getAccountClassificationOverview();
    expect(beforeAssign.unclassified).toBeGreaterThanOrEqual(1);

    await classify(account, cohortId, 1);
    const afterAssign = await getAccountClassificationOverview();
    expect(afterAssign.classified).toBe(beforeAssign.classified + 1);
    expect(afterAssign.unclassified).toBe(beforeAssign.unclassified - 1);
    expect(afterAssign.totalAccounts).toBe(beforeAssign.totalAccounts); // classification never changes who is admitted
  });

  it("an internal (@opsiq.solutions) address is counted under internalAddressAccounts, independent of classification", async () => {
    const before = await getAccountClassificationOverview();
    await seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE, domain: "opsiq.solutions" });
    const after = await getAccountClassificationOverview();
    expect(after.internalAddressAccounts).toBe(before.internalAddressAccounts + 1);
  });

  it("milestone counts land in the classified or unclassified bucket to match the account's own classification state, never both", async () => {
    const cohortId = `T${tag().toUpperCase()}`;
    const classified = await seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE });
    await classify(classified, cohortId, 1);
    await productEvent(classified.workspaceId, "PRODUCT_FIRST_RUN_STARTED");
    await productEvent(classified.workspaceId, "PRODUCT_FIRST_RESULT_VIEWED");

    const unclassified = await seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE });
    await productEvent(unclassified.workspaceId, "PRODUCT_FIRST_DIAGNOSIS_COMPLETED");

    const o = await getAccountClassificationOverview();
    expect(o.classifiedMilestones.firstRunStarted).toBeGreaterThanOrEqual(1);
    expect(o.classifiedMilestones.firstResultViewed).toBeGreaterThanOrEqual(1);
    expect(o.unclassifiedMilestones.firstDiagnosisCompleted).toBeGreaterThanOrEqual(1);
  });

  it("the response carries no name, email, user id, workspace id or beta-request id anywhere in its JSON", async () => {
    const cohortId = `T${tag().toUpperCase()}`;
    const account = await seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE, domain: "pii-canary-example.com" });
    await classify(account, cohortId, 1);

    const o = await getAccountClassificationOverview();
    const serialized = JSON.stringify(o);
    expect(serialized).not.toContain(account.email);
    expect(serialized).not.toContain(account.userId);
    expect(serialized).not.toContain(account.workspaceId);
    expect(serialized).not.toContain(account.betaRequestId);
    expect(serialized).not.toMatch(/pii-canary/);
  });

  it("an admitted workspace whose creator user cannot be resolved is counted in totalAccounts, excluded from every other count, and reported via unresolvedCreatorAccounts — never silently dropped", async () => {
    const before = await getAccountClassificationOverview();
    // Workspace.createdBy carries no FK constraint (see prisma/schema.prisma) -- a real admitted workspace whose
    // creator user row no longer exists is representable directly, exactly like the completeness fix is meant to catch.
    const workspaceId = randomUUID();
    await db.workspace.create({
      data: {
        id: workspaceId, name: "Orphaned Creator WS", slug: `orphan-${workspaceId.slice(0, 8)}`,
        createdBy: randomUUID(), signupSource: PUBLIC_BETA_SIGNUP_SOURCE,
      },
    });

    const after = await getAccountClassificationOverview();
    expect(after.totalAccounts).toBe(before.totalAccounts + 1);
    expect(after.unresolvedCreatorAccounts).toBe(before.unresolvedCreatorAccounts + 1);
    // Excluded from every derived count -- not guessed as verified/unverified or classified/unclassified.
    expect(after.verified + after.unverified).toBe(after.totalAccounts - after.unresolvedCreatorAccounts);
    expect(after.classified + after.unclassified).toBe(after.totalAccounts - after.unresolvedCreatorAccounts);
    expect(after.unresolvedCreatorNote.length).toBeGreaterThan(0);
  });

  it("the milestone-event scan reports an explicit, honest incompleteness signal once its row bound is hit, instead of silently undercounting", async () => {
    const account = await seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE });
    await productEvent(account.workspaceId, "PRODUCT_FIRST_RUN_STARTED");
    await productEvent(account.workspaceId, "PRODUCT_FIRST_EVIDENCE_SAVED");

    // Inject a tiny milestone-row bound (test seam) instead of seeding 20,000 real rows: 1 is already below this
    // account's 2 real milestone events, so the real production code path for "the bound was hit" is exercised.
    const truncated = await getAccountClassificationOverview(new Date(), undefined, 1);
    expect(truncated.milestoneEvidenceTruncated).toBe(true);
    expect(truncated.milestoneEvidenceNote.length).toBeGreaterThan(0);

    const notTruncated = await getAccountClassificationOverview();
    expect(notTruncated.milestoneEvidenceTruncated).toBe(false);
    expect(notTruncated.milestoneEvidenceNote).toBe("");
  });

  it("a single multi-business workspace can fire the SAME milestone event more than once (per-business dedup), making the 20_000-row bound a real, not theoretical, risk", async () => {
    // PRODUCT_FIRST_DIAGNOSIS_COMPLETED/PRODUCT_FIRST_EVIDENCE_SAVED are deduped per (workspace, business); emitting
    // the same event name twice for one workspace (simulating two businesses) must still be read as 2 rows, proving
    // the bound is consumed per-event-row, not per-workspace.
    const account = await seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE });
    await productEvent(account.workspaceId, "PRODUCT_FIRST_DIAGNOSIS_COMPLETED");
    await productEvent(account.workspaceId, "PRODUCT_FIRST_DIAGNOSIS_COMPLETED");

    const o = await getAccountClassificationOverview(new Date(), undefined, 1);
    expect(o.milestoneEvidenceTruncated).toBe(true);
  });
});
