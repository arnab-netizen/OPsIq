/**
 * [db] Alert email delivery FSM — real PostgreSQL concurrency + state correctness tests
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/alerts/alert-email-delivery-pg.db.test.ts
 *
 * Proves 6 correctness properties against live PostgreSQL:
 *  1  Concurrent claim   — two workers race to CLAIM one PENDING alert; exactly one wins
 *  2  Provider success   — full delivery path → SENT state, emailSentAt set, emailSentAt ≠ NULL
 *  3  Provider failure   — delivery error → FAILED state, emailSentAt=NULL, attempt recorded
 *  4  Crash recovery     — CLAIMED+expired lease reclaimable; CLAIMED+valid lease not reclaimable
 *  5  Retry mechanics    — FAILED alert retried via retryEmailAlert → SENT, attempt count incremented
 *  6  Pre-migration validity — alert with emailSentAt set (legacy pattern) is SENT-terminal, readable
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createAlert } from "@/services/alerts/alert-service";
import { retryEmailAlert } from "@/services/alerts/alert-email-retry.service";

// ── Email provider mock (injectable per-test) ────────────────────────────────

let _mockSend: ReturnType<typeof vi.fn> | null = null;

vi.mock("@/lib/integrations/email-provider", () => ({
  getEmailProvider: vi.fn(() => (_mockSend ? { send: _mockSend } : null)),
  resetEmailProvider: vi.fn(),
}));

vi.mock("@/infra/audit", () => ({ emitAuditEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Seed identifiers (suite-scoped) ──────────────────────────────────────────

const WS = randomUUID();
const USER = randomUUID();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedFixtures(): Promise<void> {
  await db.workspace.create({
    data: { id: WS, name: "PG Email FSM Test WS", slug: `pg-email-fsm-${WS.slice(0, 8)}` },
  });
  await db.user.create({
    data: { id: USER, email: `pg-email-fsm-${USER.slice(0, 8)}@test.local`, isActive: true, updatedAt: new Date() },
  });
  await db.workspaceMembership.create({
    data: { workspaceId: WS, userId: USER, role: "owner", isActive: true },
  });
}

async function insertPendingAlert(): Promise<string> {
  const row = await db.alert.create({
    data: {
      workspaceId: WS,
      userId: USER,
      type: "threshold_breach",
      channel: "email",
      message: "CRITICAL CASH STATE: negative runway",
      severity: "critical",
    },
  });
  return row.id;
}

/**
 * Runs the exact atomic claim UPDATE used by the production delivery service.
 * Returns the number of rows updated (1 = claimed, 0 = lost race or already terminal).
 */
function runClaimSQL(alertId: string, claimExpiry: Date): Promise<number> {
  return db.$executeRaw`
    UPDATE "alerts"
    SET "email_delivery_status"  = 'CLAIMED',
        "email_claimed_at"       = NOW(),
        "email_claim_expires_at" = ${claimExpiry},
        "email_last_attempt_at"  = NOW(),
        "email_attempt_count"    = "email_attempt_count" + 1
    WHERE "id" = ${alertId}
      AND (
        ("email_delivery_status" = 'PENDING')
        OR ("email_delivery_status" = 'CLAIMED' AND "email_claim_expires_at" < NOW())
      )
  ` as Promise<number>;
}

/**
 * Polls the DB until alert reaches the expected emailDeliveryStatus, or times out.
 * Necessary because createAlert fires deliverEmailAlert as a background promise.
 */
async function waitForAlertState(
  id: string,
  status: string,
  maxMs = 6000
): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const row = await db.alert.findFirst({ where: { id } });
    if (String(row?.emailDeliveryStatus) === status) return;
    await new Promise((r) => setTimeout(r, 60));
  }
  const row = await db.alert.findFirst({ where: { id } });
  throw new Error(
    `waitForAlertState timeout: alert ${id} is "${row?.emailDeliveryStatus}", expected "${status}"`
  );
}

// ── Suite setup / teardown ────────────────────────────────────────────────────

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Alert email delivery FSM — PostgreSQL", () => {
  beforeAll(async () => {
    await seedFixtures();
  });

  afterAll(async () => {
    // FK-safe teardown: alerts cascade from workspace, but explicit order is cleaner
    await db.alert.deleteMany({ where: { workspaceId: WS } });
    await db.workspaceMembership.deleteMany({ where: { workspaceId: WS } });
    await db.workspace.deleteMany({ where: { id: WS } });
    await db.user.deleteMany({ where: { id: USER } });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    _mockSend = null;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: Concurrent claim
  // ──────────────────────────────────────────────────────────────────────────

  it("1 — concurrent claim: two workers race to CLAIM one PENDING alert; exactly one wins", async () => {
    const alertId = await insertPendingAlert();
    const claimExpiry = new Date(Date.now() + 5 * 60 * 1000);

    // Fire both UPDATE claims concurrently from two Prisma connections.
    // PostgreSQL serializes the row lock: the second UPDATE re-evaluates the WHERE
    // predicate after the first commits, finds status='CLAIMED' (not PENDING), and
    // matches 0 rows.
    const [r1, r2] = await Promise.all([
      runClaimSQL(alertId, claimExpiry),
      runClaimSQL(alertId, claimExpiry),
    ]);

    expect(r1 + r2).toBe(1); // exactly one claim wins

    const row = await db.alert.findFirst({ where: { id: alertId } });
    expect(row!.emailDeliveryStatus).toBe("CLAIMED");
    expect(row!.emailAttemptCount).toBe(1);
    expect(row!.emailClaimedAt).toBeInstanceOf(Date);
    expect(row!.emailClaimExpiresAt).toBeInstanceOf(Date);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Provider success
  // ──────────────────────────────────────────────────────────────────────────

  it("2 — provider success: full delivery path → SENT state, emailSentAt set, emailSentAt ≠ NULL", async () => {
    _mockSend = vi.fn().mockResolvedValue({ id: "resend-pg-success-001" });

    const alert = await createAlert({
      workspaceId: WS,
      userId: USER,
      type: "threshold_breach",
      channel: "email",
      message: "Cash below runway threshold — immediate action required",
      severity: "critical",
    });

    await waitForAlertState(alert.id, "SENT");

    const row = await db.alert.findFirst({ where: { id: alert.id } });
    expect(row!.emailDeliveryStatus).toBe("SENT");
    // emailSentAt is set ONLY when provider confirms delivery (not during CLAIMED)
    expect(row!.emailSentAt).toBeInstanceOf(Date);
    expect(row!.resendMessageId).toBe("resend-pg-success-001");
    expect(row!.emailError).toBeNull();
    expect(row!.emailAttemptCount).toBe(1);
    // emailClaimedAt was set on the CLAIMED transition before send
    expect(row!.emailClaimedAt).toBeInstanceOf(Date);
    expect(_mockSend).toHaveBeenCalledOnce();
    const sendArg = _mockSend.mock.calls[0][0];
    expect(sendArg.to).toContain("@test.local");
    expect(sendArg.subject).toContain("CRITICAL");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: Provider failure
  // ──────────────────────────────────────────────────────────────────────────

  it("3 — provider failure: FAILED state, emailSentAt=NULL, attempt count recorded", async () => {
    _mockSend = vi
      .fn()
      .mockRejectedValue(new Error("Resend API error 503: service temporarily unavailable"));

    const alert = await createAlert({
      workspaceId: WS,
      userId: USER,
      type: "execution_failure",
      channel: "email",
      message: "Action execution failed — critical dependency missing",
      severity: "high",
    });

    await waitForAlertState(alert.id, "FAILED");

    const row = await db.alert.findFirst({ where: { id: alert.id } });
    expect(row!.emailDeliveryStatus).toBe("FAILED");
    // FAILED ≠ SENT invariant: emailSentAt must remain NULL after a failed delivery
    expect(row!.emailSentAt).toBeNull();
    // Error message captured (operator-safe format)
    expect(row!.emailError).not.toBeNull();
    expect(row!.emailAttemptCount).toBeGreaterThanOrEqual(1);
    // Alert row is preserved (not deleted) on failure
    expect(row!.id).toBe(alert.id);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4a: Crash recovery — expired lease is reclaimable
  // ──────────────────────────────────────────────────────────────────────────

  it("4a — crash recovery: CLAIMED+expired lease is reclaimable (stale-claim recovery path)", async () => {
    const alertId = await insertPendingAlert();

    // Simulate a crashed worker: CLAIMED with a lease that expired 1 second ago
    await db.alert.update({
      where: { id: alertId },
      data: {
        emailDeliveryStatus: "CLAIMED",
        emailClaimedAt: new Date(Date.now() - 10 * 60 * 1000), // 10m ago
        emailClaimExpiresAt: new Date(Date.now() - 1000),      // expired 1s ago
        emailAttemptCount: 1,
      },
    });

    // Recovery worker re-runs the claim SQL — should succeed because lease is expired
    const claimed = await runClaimSQL(alertId, new Date(Date.now() + 5 * 60 * 1000));
    expect(claimed).toBe(1);

    const row = await db.alert.findFirst({ where: { id: alertId } });
    expect(row!.emailDeliveryStatus).toBe("CLAIMED");
    // Attempt count incremented on successful reclaim
    expect(row!.emailAttemptCount).toBe(2);
    // New lease applied
    expect(row!.emailClaimExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4b: Crash recovery — valid lease is NOT reclaimable
  // ──────────────────────────────────────────────────────────────────────────

  it("4b — crash recovery: CLAIMED+valid lease cannot be stolen by concurrent worker", async () => {
    const alertId = await insertPendingAlert();
    const futureExpiry = new Date(Date.now() + 5 * 60 * 1000);

    // Worker A holds a valid lease
    await db.alert.update({
      where: { id: alertId },
      data: {
        emailDeliveryStatus: "CLAIMED",
        emailClaimedAt: new Date(),
        emailClaimExpiresAt: futureExpiry,
        emailAttemptCount: 1,
      },
    });

    // Worker B attempts to reclaim — should be rejected (lease still valid)
    const claimed = await runClaimSQL(alertId, new Date(Date.now() + 5 * 60 * 1000));
    expect(claimed).toBe(0);

    const row = await db.alert.findFirst({ where: { id: alertId } });
    // State unchanged: still CLAIMED, attempt count not incremented
    expect(row!.emailDeliveryStatus).toBe("CLAIMED");
    expect(row!.emailAttemptCount).toBe(1);
    // Original lease preserved
    expect(row!.emailClaimExpiresAt!.getTime()).toBeCloseTo(futureExpiry.getTime(), -3);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 5: Retry mechanics
  // ──────────────────────────────────────────────────────────────────────────

  it("5 — retry mechanics: FAILED alert retried via retryEmailAlert → SENT, attempt count incremented", async () => {
    _mockSend = vi.fn().mockResolvedValue({ id: "resend-retry-pg-001" });

    // Seed a FAILED alert (simulates a prior delivery attempt that failed)
    const alertId = await insertPendingAlert();
    await db.alert.update({
      where: { id: alertId },
      data: {
        emailDeliveryStatus: "FAILED",
        emailError: "Resend API error 503: service temporarily unavailable",
        emailAttemptCount: 1,
      },
    });

    const result = await retryEmailAlert(alertId, WS, USER);

    expect(result.status).toBe("SENT");
    expect(result.alertId).toBe(alertId);

    const row = await db.alert.findFirst({ where: { id: alertId } });
    expect(row!.emailDeliveryStatus).toBe("SENT");
    // emailSentAt set only on confirmed delivery
    expect(row!.emailSentAt).toBeInstanceOf(Date);
    expect(row!.emailError).toBeNull();
    expect(row!.resendMessageId).toBe("resend-retry-pg-001");
    // Attempt count: 1 (prior) + 1 (this retry claim) = 2
    expect(row!.emailAttemptCount).toBe(2);
    expect(_mockSend).toHaveBeenCalledOnce();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 6: Pre-migration alert validity
  // ──────────────────────────────────────────────────────────────────────────

  it("6 — pre-migration validity: alert with emailSentAt set is SENT-terminal and fully readable", async () => {
    // Simulate a pre-migration alert row: emailSentAt was the sole delivery indicator
    // before the FSM was introduced. The migration backfill sets emailDeliveryStatus=SENT
    // for rows where email_sent_at IS NOT NULL AND email_error IS NULL.
    const legacySentAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
    const alertId = await insertPendingAlert();

    await db.alert.update({
      where: { id: alertId },
      data: {
        emailDeliveryStatus: "SENT",
        emailSentAt: legacySentAt,
        resendMessageId: "legacy-resend-msg-001",
        emailAttemptCount: 1,
        emailError: null,
      },
    });

    // Row is fully readable with both old and new fields consistent
    const row = await db.alert.findFirst({ where: { id: alertId } });
    expect(row!.emailDeliveryStatus).toBe("SENT");
    expect(row!.emailSentAt).toBeInstanceOf(Date);
    expect(row!.emailSentAt!.getTime()).toBeCloseTo(legacySentAt.getTime(), -3);
    expect(row!.resendMessageId).toBe("legacy-resend-msg-001");

    // SENT is terminal: retryEmailAlert must return ALREADY_TERMINAL without modifying state
    const retryResult = await retryEmailAlert(alertId, WS, USER);
    expect(retryResult.status).toBe("ALREADY_TERMINAL");
    expect(retryResult.message).toContain("delivered");

    // State unchanged after retry attempt
    const rowAfterRetry = await db.alert.findFirst({ where: { id: alertId } });
    expect(rowAfterRetry!.emailDeliveryStatus).toBe("SENT");
    expect(rowAfterRetry!.emailSentAt!.getTime()).toBeCloseTo(legacySentAt.getTime(), -3);
    expect(rowAfterRetry!.emailAttemptCount).toBe(1); // not incremented
  });
});
