import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { compareAndSetAction, mergeActionMetadata } from "@/services/action-store";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * action-store — direct statement-level proofs (no caller pre-read to mask a defect).
 *
 *  - Workspace scoping: compareAndSetAction / mergeActionMetadata must match nothing for a
 *    foreign workspace even with the correct id and version (callers' scoped pre-reads would
 *    otherwise hide a missing `e.workspace_id = …` predicate).
 *  - Non-object metadata: a stored JSON null / string / number / array must not make the patch
 *    fail (22023 "cannot delete from scalar" -> 500) or turn metadata into an array; it is
 *    treated as an empty object.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] action-store statements", () => {
  const stamp = randomUUID();
  const actor = randomUUID();
  const ws = randomUUID();
  const otherWs = randomUUID();
  const clientId = randomUUID();
  const engagementId = randomUUID();
  const ids: string[] = [];

  async function makeAction(): Promise<string> {
    const id = randomUUID();
    ids.push(id);
    await db.action.create({ data: { id, engagementId, title: "Store action", status: "in_progress", metadata: { kept: true }, updatedAt: new Date() } });
    return id;
  }
  const snapshot = (id: string) =>
    db.action.findUniqueOrThrow({ where: { id }, select: { status: true, version: true, metadata: true, title: true } });

  beforeAll(async () => {
    await db.user.create({ data: { id: actor, email: `action-store-${stamp}@test.local`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: ws, name: "Action store WS", slug: `action-store-${stamp}` } });
    await db.workspace.create({ data: { id: otherWs, name: "Action store other WS", slug: `action-store-o-${stamp}` } });
    await db.clientAccount.create({ data: { id: clientId, name: "Action store client", createdBy: actor, updatedAt: new Date() } });
    await db.engagement.create({
      data: { id: engagementId, code: `ACT-STORE-${stamp}`, title: "Action store engagement", clientId, serviceTier: "tier_1", engagementMode: "strategic_planning", workspaceId: ws, updatedAt: new Date() },
    });
  });

  afterAll(async () => {
    try {
      await db.action.deleteMany({ where: { id: { in: ids } } });
      await db.engagement.deleteMany({ where: { id: engagementId } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.workspace.deleteMany({ where: { id: { in: [ws, otherWs] } } });
      await db.user.deleteMany({ where: { id: actor } });
    } catch {
      // best-effort cleanup
    }
  });

  it("[db] compareAndSetAction: a foreign workspace (right id and version) gets null and the row is unchanged", async () => {
    const id = await makeAction();
    const before = await snapshot(id);
    const result = await compareAndSetAction(db, {
      actionId: id, workspaceId: otherWs, expectedVersion: 1,
      columns: { status: "blocked", title: "hijacked" }, metadata: { set: { blockerReason: "x" } },
    });
    expect(result).toBeNull();
    expect(await snapshot(id)).toEqual(before);
  });

  it("[db] mergeActionMetadata: a foreign workspace gets false and the row is unchanged", async () => {
    const id = await makeAction();
    const before = await snapshot(id);
    expect(await mergeActionMetadata(db, { actionId: id, workspaceId: otherWs, metadata: { set: { outcomeSnapshot: { x: 1 } }, unset: ["kept"] } })).toBe(false);
    expect(await snapshot(id)).toEqual(before);
  });

  it("[db] own workspace: both statements apply (control)", async () => {
    const id = await makeAction();
    const row = await compareAndSetAction(db, { actionId: id, workspaceId: ws, expectedVersion: 1, columns: { status: "blocked" }, metadata: { set: { blockerReason: "x" } } });
    expect(row).toMatchObject({ id, status: "blocked", version: 2, metadata: { kept: true, blockerReason: "x" } });
    expect(await mergeActionMetadata(db, { actionId: id, workspaceId: ws, metadata: { unset: ["blockerReason"] } })).toBe(true);
    expect((await snapshot(id)).metadata).toEqual({ kept: true });
  });

  for (const [label, literal] of [["JSON null", "null"], ["a string", '"legacy"'], ["a number", "42"], ["an array", '["a","b"]']] as const) {
    it(`[db] stored metadata that is ${label} is treated as an empty object (no 500, no array)`, async () => {
      const id = await makeAction();
      await db.$executeRawUnsafe(`UPDATE actions SET metadata = $1::jsonb WHERE id = $2::uuid`, literal, id);
      const row = await compareAndSetAction(db, { actionId: id, workspaceId: ws, expectedVersion: 1, columns: { status: "blocked" }, metadata: { set: { blockerReason: "vendor" }, unset: ["old"] } });
      expect(row).toMatchObject({ status: "blocked", version: 2, metadata: { blockerReason: "vendor" } });
      expect((await snapshot(id)).metadata).toEqual({ blockerReason: "vendor" });

      await db.$executeRawUnsafe(`UPDATE actions SET metadata = $1::jsonb WHERE id = $2::uuid`, literal, id);
      expect(await mergeActionMetadata(db, { actionId: id, workspaceId: ws, metadata: { set: { outcomeSnapshot: { ok: true } }, unset: ["blockerReason"] } })).toBe(true);
      expect((await snapshot(id)).metadata).toEqual({ outcomeSnapshot: { ok: true } });
    });
  }
});
