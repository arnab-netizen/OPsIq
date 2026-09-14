/**
 * markBetaRequestInvited — atomicity of the BetaRequest state mutation and
 * its audit event (AUDIT-01, same defect class as PR #473's
 * grantBetaRequestOperator/revokeBetaRequestOperator — see
 * scripts/provision-beta-request-operator.ts).
 *
 * ROOT CAUSE FIXED: the conditional REQUESTED -> INVITED update and the
 * emitAuditEvent call used to be two separate, non-transactional
 * statements. If emitAuditEvent threw for any reason after the update had
 * already committed, the row was left durably INVITED with no audit event,
 * and — because the update is conditional on status="REQUESTED" — a retry
 * would find the row already INVITED and silently no-op, so the approval
 * email (only sent on an actual transition) would never be sent either.
 * Fixed by wrapping the conditional update and emitAuditEvent in one
 * db.$transaction, passing the same transaction client to emitAuditEvent
 * (infra/audit.ts's AuditClient) exactly as PR #473 does. The approval
 * email is deliberately sent AFTER the transaction commits, never inside
 * it: best-effort delivery must never roll back an already-durable state
 * change.
 *
 * `emitAuditEvent` is wrapped with `vi.fn(actual)` (calls through by
 * default, same pattern as provision-beta-request-operator.db.test.ts) so a
 * single test can force it to throw and prove the update rolls back with
 * it, without disturbing every other test's real behavior. Note:
 * `markBetaRequestInvited`'s emitAuditEvent call carries no `workspaceId`
 * (a BetaRequest is pre-account/pre-workspace, same as BETA_REQUEST_CREATED)
 * — as of the Administration V1 pre-workspace-audit-durability fix (see
 * infra/audit.ts's createUnchainedPlatformEvent), this now DOES persist a
 * real, durable `audit_event` row (workspaceId: null, previousHash: null,
 * explicitly unchained — no hash-chain/tamper-evidence claim), where
 * previously it silently no-opped. What these tests prove is the CALL
 * itself — that it happens exactly once, atomically with the state
 * mutation, and that a thrown error from it rolls the mutation back — plus
 * one assertion below that the row is now genuinely durable.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/admin/beta-request-invite-atomicity.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

vi.mock("@/infra/audit", async () => {
  const actual = await vi.importActual<typeof import("@/infra/audit")>("@/infra/audit");
  return { ...actual, emitAuditEvent: vi.fn(actual.emitAuditEvent) };
});

vi.mock("@/lib/integrations/email-provider", () => ({
  getEmailProvider: vi.fn(),
}));

import { emitAuditEvent } from "@/infra/audit";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { markBetaRequestInvited } from "@/services/admin/admin-operability.service";

const mockedEmitAuditEvent = vi.mocked(emitAuditEvent);
const mockedGetEmailProvider = vi.mocked(getEmailProvider);
// Must be a real UUID: AuditEvent.actorId is @db.Uuid, and — unlike before
// the Administration V1 pre-workspace-audit-durability fix — this actorId
// now actually reaches a real INSERT (previously the pre-workspace fail-safe
// silently no-opped before ever touching the audit_events table).
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";

async function seedBetaRequest(status: "REQUESTED" | "INVITED" = "REQUESTED"): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = `invite-atomicity-${id}@example.com`;
  await db.betaRequest.create({ data: { id, email, status } });
  return { id, email };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] markBetaRequestInvited — grant/audit atomicity", () => {
  const sendMock = vi.fn();
  let seededId: string | null = null;

  // AuditEvent.actorId carries a real FK to users.id (onDelete: Restrict) —
  // exercised for real now that pre-workspace events genuinely persist (see
  // ACTOR_ID's own comment). A real User row must exist for the whole suite.
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: ACTOR_ID },
      update: {},
      create: { id: ACTOR_ID, email: `atomicity-actor-${ACTOR_ID}@example.com`, updatedAt: new Date() },
    });
  });
  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: ACTOR_ID } }).catch(() => undefined);
    await db.user.delete({ where: { id: ACTOR_ID } }).catch(() => undefined);
  });

  afterEach(async () => {
    mockedEmitAuditEvent.mockClear();
    mockedGetEmailProvider.mockReset();
    sendMock.mockClear();
    if (seededId) {
      await db.auditEvent.deleteMany({ where: { entityId: seededId } }).catch(() => undefined);
      await db.betaRequest.delete({ where: { id: seededId } }).catch(() => undefined);
      seededId = null;
    }
  });

  it("[db] successful transition: BetaRequest becomes INVITED and emitAuditEvent is called exactly once, atomically with the mutation", async () => {
    mockedGetEmailProvider.mockReturnValue({ send: sendMock });
    sendMock.mockResolvedValue({ accepted: true });
    const { id } = await seedBetaRequest("REQUESTED");
    seededId = id;

    const result = await markBetaRequestInvited({ betaRequestId: id, actorId: ACTOR_ID });

    expect(result.status).toBe("INVITED");
    const row = await db.betaRequest.findUnique({ where: { id } });
    expect(row?.status).toBe("INVITED");
    expect(row?.invitedBy).toBe(ACTOR_ID);

    expect(mockedEmitAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "beta_request.marked_invited", entityId: id, actorId: ACTOR_ID }),
      expect.anything() // the transaction client
    );

    // Approval email is sent once, after the transaction commits.
    expect(sendMock).toHaveBeenCalledTimes(1);

    // Administration V1: the pre-workspace audit fix means this now
    // persists a real, durable, explicitly-unchained audit_event row.
    const persisted = await db.auditEvent.findFirst({
      where: { eventName: "beta_request.marked_invited", entityId: id },
    });
    expect(persisted).not.toBeNull();
    expect(persisted?.workspaceId).toBeNull();
    expect(persisted?.previousHash).toBeNull();
  });

  it("[db] a simulated audit failure rolls the mutation back (row stays REQUESTED); a subsequent retry performs a fresh real transition and sends the approval email exactly once; a further replay sends no additional audit or email", async () => {
    mockedGetEmailProvider.mockReturnValue({ send: sendMock });
    sendMock.mockResolvedValue({ accepted: true });
    const { id, email } = await seedBetaRequest("REQUESTED");
    seededId = id;

    // --- Step 1: simulated audit failure rolls the mutation back ---
    mockedEmitAuditEvent.mockImplementationOnce(async () => {
      throw new Error("SIMULATED_AUDIT_FAILURE_ON_INVITE");
    });

    await expect(markBetaRequestInvited({ betaRequestId: id, actorId: ACTOR_ID })).rejects.toThrow(
      "SIMULATED_AUDIT_FAILURE_ON_INVITE"
    );

    const afterFailure = await db.betaRequest.findUnique({ where: { id } });
    expect(afterFailure?.status).toBe("REQUESTED");
    expect(afterFailure?.invitedAt).toBeNull();
    expect(afterFailure?.invitedBy).toBeNull();
    // The failed transaction must not have sent an email either.
    expect(sendMock).not.toHaveBeenCalled();

    // --- Step 2: retry after the failure performs a fresh real transition ---
    const retryResult = await markBetaRequestInvited({ betaRequestId: id, actorId: ACTOR_ID });

    expect(retryResult.status).toBe("INVITED");
    const afterRetry = await db.betaRequest.findUnique({ where: { id } });
    expect(afterRetry?.status).toBe("INVITED");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].to).toBe(email);

    // --- Step 3: replaying an already-INVITED request is a pure no-op ---
    mockedEmitAuditEvent.mockClear();
    sendMock.mockClear();

    const replayResult = await markBetaRequestInvited({ betaRequestId: id, actorId: ACTOR_ID });

    expect(replayResult.status).toBe("INVITED");
    expect(mockedEmitAuditEvent).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
