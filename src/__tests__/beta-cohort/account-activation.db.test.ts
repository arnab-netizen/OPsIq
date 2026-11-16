/**
 * listAccountActivationForAdmin() — DB-backed contract.
 *
 * Proves, against a real database: each returned row is paired with its OWN workspaceId's own facts and never
 * another seeded account's (the #1 correctness risk for a per-account, not aggregate, view); classification mirrors
 * getAccountClassificationOverview's own rule; pagination walks every admitted account exactly once with no
 * duplicates or gaps across page boundaries; an unresolvable creator is reported, never guessed; the response
 * carries no email, user id or beta-request id anywhere -- workspaceId is the only identifier; and the call makes
 * zero writes.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/beta-cohort/account-activation.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { assignCohortOwner, listAccountActivationForAdmin } from "@/services/beta-cohort/cohort-evidence.service";
import { PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE } from "@/lib/beta";

const tag = () => randomBytes(5).toString("hex");

// assignCohortOwner's actorId is a real FK into users -- same pattern account-overview.db.test.ts uses.
const OPERATOR_ID = randomUUID();
beforeAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.user.create({ data: { id: OPERATOR_ID, email: `activation-operator-${OPERATOR_ID}@example.com`, isActive: true, updatedAt: new Date() } });
});

// Every workspace/user/betaRequest created below is tracked and deleted in afterAll -- a leftover row here would
// silently inflate the global, unscoped admitted-workspace scan for every other .db.test.ts file sharing the same
// CI Postgres instance, exactly the lesson account-overview.db.test.ts's own cleanup convention already encodes.
const seededWorkspaceIds: string[] = [];
const seededUserIds: string[] = [];
const seededBetaRequestIds: string[] = [];

interface SeededAccount { userId: string; workspaceId: string; email: string; betaRequestId: string }

async function seedAccount(opts: { signupSource: string | null; verified?: boolean; domain?: string }): Promise<SeededAccount> {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const betaRequestId = randomUUID();
  const email = `activation-${tag()}@${opts.domain ?? "example.com"}`;
  await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date(), emailVerifiedAt: opts.verified === false ? null : new Date() } });
  await db.workspace.create({
    data: { id: workspaceId, name: "Activation WS", slug: `activation-${workspaceId.slice(0, 8)}`, createdBy: userId, signupSource: opts.signupSource },
  });
  await db.workspaceMembership.create({ data: { userId, workspaceId, role: "owner", isActive: true } });
  await db.betaRequest.create({ data: { id: betaRequestId, email, status: "INVITED", invitedAt: new Date(), updatedAt: new Date() } });
  seededWorkspaceIds.push(workspaceId);
  seededUserIds.push(userId);
  seededBetaRequestIds.push(betaRequestId);
  return { userId, workspaceId, email, betaRequestId };
}

afterAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.auditEvent.deleteMany({
    where: {
      OR: [
        { workspaceId: { in: seededWorkspaceIds.length > 0 ? seededWorkspaceIds : [""] } },
        { entityId: { in: seededBetaRequestIds.length > 0 ? seededBetaRequestIds : [""] } },
        { actorId: OPERATOR_ID },
      ],
    },
  });
  if (seededWorkspaceIds.length > 0) {
    await db.workspaceMembership.deleteMany({ where: { workspaceId: { in: seededWorkspaceIds } } });
    await db.workspace.deleteMany({ where: { id: { in: seededWorkspaceIds } } });
  }
  if (seededBetaRequestIds.length > 0) {
    await db.betaRequest.deleteMany({ where: { id: { in: seededBetaRequestIds } } });
  }
  if (seededUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: seededUserIds } } });
  }
  await db.user.deleteMany({ where: { id: OPERATOR_ID } });
});

async function classify(a: SeededAccount, cohortId: string, n: number) {
  await assignCohortOwner(
    { betaRequestId: a.betaRequestId, cohortId, ownerCode: `${cohortId}-${String(n).padStart(3, "0")}`, kind: "REAL_OWNER", idempotencyKey: `key-${randomUUID()}` },
    OPERATOR_ID,
  );
}

async function productEvent(workspaceId: string, name: keyof typeof AUDIT_EVENTS) {
  await emitAuditEvent({ eventName: AUDIT_EVENTS[name], workspaceId, visibility: "internal" });
}

/** Walks every page via the cursor chain and returns every row seen, in order. Bounded against an infinite loop. */
async function walkAllPages(limit: number): Promise<Array<{ workspaceId: string }>> {
  const all: Array<{ workspaceId: string }> = [];
  let cursor: string | null = null;
  for (let i = 0; i < 2000; i++) {
    const page = await listAccountActivationForAdmin({ limit, cursor });
    all.push(...page.accounts);
    if (!page.pagination.hasMore) return all;
    cursor = page.pagination.nextCursor;
  }
  throw new Error("walkAllPages: did not terminate within 2000 pages");
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] listAccountActivationForAdmin", () => {
  it("pairs each row with its OWN workspace's own milestones, never another seeded account's", async () => {
    const a = await seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE });
    await productEvent(a.workspaceId, "PRODUCT_FIRST_RUN_STARTED");
    await productEvent(a.workspaceId, "PRODUCT_FIRST_RESULT_VIEWED");

    const b = await seedAccount({ signupSource: CONTROLLED_BETA_SIGNUP_SOURCE });
    await productEvent(b.workspaceId, "PRODUCT_FIRST_DIAGNOSIS_COMPLETED");

    const rows = await walkAllPages(200);
    const rowA = rows.find((r) => r.workspaceId === a.workspaceId) as unknown as {
      firstRunStarted: boolean; firstEvidenceSaved: boolean; firstDiagnosisCompleted: boolean; firstResultViewed: boolean; signupSource: string;
    };
    const rowB = rows.find((r) => r.workspaceId === b.workspaceId) as unknown as {
      firstRunStarted: boolean; firstEvidenceSaved: boolean; firstDiagnosisCompleted: boolean; firstResultViewed: boolean; signupSource: string;
    };
    expect(rowA).toBeDefined();
    expect(rowB).toBeDefined();
    expect(rowA).toMatchObject({ signupSource: "PUBLIC_BETA", firstRunStarted: true, firstResultViewed: true, firstDiagnosisCompleted: false, firstEvidenceSaved: false });
    expect(rowB).toMatchObject({ signupSource: "CONTROLLED_BETA_INVITE", firstDiagnosisCompleted: true, firstRunStarted: false, firstResultViewed: false, firstEvidenceSaved: false });
  });

  it("classified flips to true only via assignCohortOwner, mirroring getAccountClassificationOverview's own rule", async () => {
    const cohortId = `T${tag().toUpperCase()}`;
    const a = await seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE });
    const before = (await walkAllPages(200)).find((r) => r.workspaceId === a.workspaceId) as unknown as { classified: boolean };
    expect(before.classified).toBe(false);

    await classify(a, cohortId, 1);
    const after = (await walkAllPages(200)).find((r) => r.workspaceId === a.workspaceId) as unknown as { classified: boolean };
    expect(after.classified).toBe(true);
  });

  it("walking every page by cursor returns each seeded account exactly once, with no duplicates or gaps", async () => {
    const accounts = await Promise.all([
      seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE }),
      seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE }),
      seedAccount({ signupSource: CONTROLLED_BETA_SIGNUP_SOURCE }),
    ]);

    const rows = await walkAllPages(1); // force every seeded account onto its own page
    const ids = rows.map((r) => r.workspaceId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates across the whole walk
    for (const a of accounts) expect(ids).toContain(a.workspaceId);
  });

  it("an admitted workspace whose creator cannot be resolved is excluded from accounts[] and reported via unresolvedCreatorAccounts, never guessed", async () => {
    const workspaceId = randomUUID();
    await db.workspace.create({
      data: { id: workspaceId, name: "Orphaned Creator WS", slug: `orphan-act-${workspaceId.slice(0, 8)}`, createdBy: randomUUID(), signupSource: PUBLIC_BETA_SIGNUP_SOURCE },
    });
    seededWorkspaceIds.push(workspaceId);

    // Walk with a tiny limit until this workspace's page is reached (createdAt ordering puts it wherever it falls).
    let cursor: string | null = null;
    let found = false;
    let unresolvedSeenOnItsPage = 0;
    for (let i = 0; i < 2000; i++) {
      const page = await listAccountActivationForAdmin({ limit: 25, cursor });
      if (page.accounts.some((r) => r.workspaceId === workspaceId)) throw new Error("orphaned-creator workspace leaked into accounts[]");
      // Its own page (by creation order it's seeded last in this test, but other tests may have seeded rows after it
      // in real time -- so just confirm the orphan is never present and the flag is set on SOME page across the walk).
      if (page.unresolvedCreatorAccounts > 0) unresolvedSeenOnItsPage += page.unresolvedCreatorAccounts;
      if (!page.pagination.hasMore) { found = true; break; }
      cursor = page.pagination.nextCursor;
    }
    expect(found).toBe(true);
    expect(unresolvedSeenOnItsPage).toBeGreaterThanOrEqual(1);
  });

  it("the response carries no email, user id or beta-request id anywhere -- workspaceId is the only identifier", async () => {
    const cohortId = `T${tag().toUpperCase()}`;
    const a = await seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE, domain: "pii-canary-activation.com" });
    await classify(a, cohortId, 1);

    const page = await listAccountActivationForAdmin({ limit: 200 });
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain(a.email);
    expect(serialized).not.toContain(a.userId);
    expect(serialized).not.toContain(a.betaRequestId);
    expect(serialized).not.toMatch(/pii-canary/);
    expect(serialized).toContain(a.workspaceId); // the one sanctioned identifier must still be present
  });

  it("makes zero writes: workspace/user/betaRequest/auditEvent row counts are unchanged across the call", async () => {
    const a = await seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE });
    await productEvent(a.workspaceId, "PRODUCT_FIRST_RUN_STARTED");

    const countAll = async () => ({
      workspace: await db.workspace.count(), user: await db.user.count(),
      betaRequest: await db.betaRequest.count(), auditEvent: await db.auditEvent.count(),
    });
    const before = await countAll();
    await listAccountActivationForAdmin({ limit: 200 });
    const after = await countAll();
    expect(after).toEqual(before);
  });

  it("the milestone-evidence scan reports an explicit truncation signal once its per-page row bound is hit", async () => {
    const a = await seedAccount({ signupSource: PUBLIC_BETA_SIGNUP_SOURCE });
    await productEvent(a.workspaceId, "PRODUCT_FIRST_RUN_STARTED");
    await productEvent(a.workspaceId, "PRODUCT_FIRST_EVIDENCE_SAVED");

    // Inject a tiny milestone-row bound (test seam): 1 is below this account's 2 real milestone rows.
    const truncated = await listAccountActivationForAdmin({ limit: 200 }, 1);
    expect(truncated.milestoneEvidenceTruncated).toBe(true);

    const notTruncated = await listAccountActivationForAdmin({ limit: 200 });
    expect(notTruncated.milestoneEvidenceTruncated).toBe(false);
  });
});
