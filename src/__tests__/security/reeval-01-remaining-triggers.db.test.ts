/**
 * REEVAL-01 remaining triggers [db]: major_client_loss fires on client archive.
 * (owner_non_compliance is exercised by the escalation overdue-action suite.)
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const triggerReEvaluation = vi.hoisted(() => vi.fn().mockResolvedValue({ auditEventId: "ae" }));
vi.mock("@/services/re-evaluation", () => ({ triggerReEvaluation }));

import { archiveClient } from "@/services/client-account";

const userId = randomUUID();
const ws = randomUUID();
const clientId = randomUUID();
const engagementId = randomUUID();
const NOW = new Date("2026-07-04T00:00:00Z");
const authCtx = { verifiedActorId: userId } as any;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] REEVAL-01 major_client_loss on client archive", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `rv-${userId}@e.com`, name: "r", isActive: true, updatedAt: NOW } });
    await db.workspace.upsert({ where: { id: ws }, update: {}, create: { id: ws, name: "WS", slug: `ws-${ws}`, createdBy: userId } });
    await db.clientAccount.create({ data: { id: clientId, workspaceId: ws, name: "c", version: 1, updatedAt: NOW } });
    await db.engagement.create({ data: { id: engagementId, workspaceId: ws, code: `E-${engagementId.slice(0, 8)}`, title: "e", clientId, serviceTier: "standard", engagementMode: "advisory", status: "active", updatedAt: NOW } });
  });
  beforeEach(() => triggerReEvaluation.mockClear());
  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
    await db.engagement.deleteMany({ where: { id: engagementId } });
    await db.clientAccount.deleteMany({ where: { id: clientId } });
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.deleteMany({ where: { id: userId } });
    vi.restoreAllMocks();
  });

  it("archiving a client triggers major_client_loss re-eval for its active engagement", async () => {
    await archiveClient(clientId, authCtx, 1, ws);
    expect((await db.clientAccount.findUnique({ where: { id: clientId } }))?.status).toBe("archived");
    expect(triggerReEvaluation).toHaveBeenCalled();
    const call = triggerReEvaluation.mock.calls.find((c) => c[0].changeType === "major_client_loss");
    expect(call).toBeTruthy();
    expect(call![0]).toMatchObject({ changeType: "major_client_loss", engagementId, workspaceId: ws });
  });
});
