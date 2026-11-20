/**
 * PHASE RP3: Workspace Isolation Runtime Proof
 *
 * Proves that the platform's OWN isolation controls deny cross-workspace
 * access, against the real PostgreSQL database:
 *
 *   1. src/lib/prisma-workspace-enforcement.ts (DB-level backstop registered on
 *      the real client in src/lib/db.ts) throws `WORKSPACE ISOLATION VIOLATION`
 *      on an INSERT without workspaceId and on an unscoped updateMany/deleteMany,
 *      and the database is left untouched.
 *   2. src/lib/visibility.ts assertEngagementAccess() denies a foreign
 *      engagement / foreign workspace claim with ForbiddenError.
 *   3. src/middleware/workspace-enforcement.ts enforceWorkspaceScoping() denies a
 *      member of workspace A presenting workspace B's id.
 *   4. EventReplayEngine / ProjectionRebuildEngine never read or destroy another
 *      workspace's aggregate.
 *   5. Event numbers are allocated per (workspace, aggregate).
 *
 * Every deny has a positive control so the deny cannot pass because the call is
 * simply broken. The previous revision mostly asserted that Prisma honours a
 * `where: { workspaceId }` filter the test itself wrote (it can never fail),
 * used `rejects.toThrow()` with no message, and swallowed cleanup errors.
 *
 * Only the session SOURCE (getSession, which reads the request cookie) is stubbed
 * for (3); the enforcement logic and its membership reads run for real.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi, type Mock } from "vitest";
import { v4 as uuidv4 } from "uuid";
import type { NextRequest } from "next/server";

vi.mock("@/services/auth", () => ({ getSession: vi.fn() }));

import { getSession } from "@/services/auth";
import { db, getDbInstance } from "@/lib/db";
import { assertEngagementAccess } from "@/lib/visibility";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { ForbiddenError } from "@/infra/errors";
import { EventEmitterService } from "@/services/event-emitter";
import { EventReplayEngine } from "@/services/event-replay-engine";
import { ProjectionRebuildEngine } from "@/services/projection-rebuild-engine";

const VIOLATION = "WORKSPACE ISOLATION VIOLATION";

function asSession(userId: string | null): void {
  (getSession as unknown as Mock).mockResolvedValue(userId ? { user: { id: userId } } : null);
}

describe("Phase RP3: Workspace Isolation Runtime Proof", () => {
  let ws1Id: string;
  let ws2Id: string;
  let user1Id: string;
  let user2Id: string;
  let client1Id: string;
  let client2Id: string;
  let engagement1Id: string;
  let engagement2Id: string;
  let recommendation1Id: string;
  let recommendation2Id: string;

  beforeAll(async () => {
    await getDbInstance();
  });

  beforeEach(async () => {
    ws1Id = uuidv4();
    ws2Id = uuidv4();
    user1Id = uuidv4();
    user2Id = uuidv4();
    client1Id = uuidv4();
    client2Id = uuidv4();
    engagement1Id = uuidv4();
    engagement2Id = uuidv4();
    recommendation1Id = uuidv4();
    recommendation2Id = uuidv4();
    const stamp = uuidv4().slice(0, 8);

    for (const [userId, wsId, clientId, engagementId, n] of [
      [user1Id, ws1Id, client1Id, engagement1Id, 1],
      [user2Id, ws2Id, client2Id, engagement2Id, 2],
    ] as const) {
      await db.user.create({
        data: {
          id: userId,
          email: `rp3-iso-u${n}-${stamp}@example.com`,
          name: `User in Workspace ${n}`,
          hashedPassword: "not-a-real-hash",
          updatedAt: new Date(),
        },
      });
      await db.clientAccount.create({ data: { id: clientId, name: `Client ${n}`, updatedAt: new Date() } });
      await db.workspace.create({
        data: { id: wsId, name: `Workspace ${n}`, slug: `rp3-iso-ws${n}-${stamp}`, createdBy: userId, isActive: true },
      });
      await db.workspaceMembership.create({
        data: { workspaceId: wsId, userId, role: "admin", isActive: true, addedBy: userId },
      });
      await db.engagement.create({
        data: {
          id: engagementId,
          code: `RP3-ISO-${n}-${stamp}`,
          title: `Engagement in WS${n}`,
          clientId,
          workspaceId: wsId,
          serviceTier: "standard",
          engagementMode: "advisory",
          createdBy: userId,
          updatedAt: new Date(),
        },
      });
      await db.engagementMembership.create({
        data: { id: uuidv4(), userId, engagementId, role: "lead", isActive: true, addedBy: userId },
      });
    }
  });

  afterEach(async () => {
    // canonical_events is append-only (DB trigger blocks DELETE) and has no FK to
    // workspaces/users, so those rows are left in place. Everything else is removed
    // in FK order; a cleanup failure fails the test rather than being swallowed.
    const wsIds = [ws1Id, ws2Id];
    await db.recommendation.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await db.snapshotData.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await db.engagementMembership.deleteMany({ where: { engagementId: { in: [engagement1Id, engagement2Id] } } });
    await db.workspaceMembership.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await db.engagement.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await db.workspace.deleteMany({ where: { id: { in: wsIds } } });
    await db.clientAccount.deleteMany({ where: { id: { in: [client1Id, client2Id] } } });
    await db.user.deleteMany({ where: { id: { in: [user1Id, user2Id] } } });
  });

  async function seedRecommendation(id: string, workspaceId: string, engagementId: string, title: string) {
    return db.recommendation.create({
      data: { id, engagementId, workspaceId, title, priority: "high" },
    });
  }

  async function emitCreated(aggregateId: string, workspaceId: string, engagementId: string, actorId: string, title: string) {
    return EventEmitterService.emit({
      aggregateId,
      aggregateType: "recommendation",
      eventType: "recommendation.created",
      eventVersion: 1,
      payload: { engagementId, title, priority: "high" },
      actorId,
      workspaceId,
      visibilityScope: "internal",
      sensitivityClassification: "standard",
    });
  }

  describe("1. DB-level backstop (src/lib/prisma-workspace-enforcement.ts)", () => {
    it("create without workspaceId is refused before reaching the database", async () => {
      const strayId = uuidv4();
      await expect(
        db.recommendation.create({
          data: { id: strayId, engagementId: engagement1Id, title: "no tenant", priority: "high" },
        }),
      ).rejects.toThrow(`${VIOLATION}: create on Recommendation requires workspaceId in data`);
      expect(await db.recommendation.count({ where: { id: strayId } })).toBe(0);
    });

    it("createMany with ONE row missing workspaceId is refused whole (no partial insert)", async () => {
      const okId = uuidv4();
      const strayId = uuidv4();
      await expect(
        db.recommendation.createMany({
          data: [
            { id: okId, engagementId: engagement1Id, workspaceId: ws1Id, title: "scoped", priority: "high" },
            { id: strayId, engagementId: engagement1Id, title: "unscoped", priority: "high" },
          ],
        }),
      ).rejects.toThrow(`${VIOLATION}: createMany on Recommendation requires workspaceId in data`);
      expect(await db.recommendation.count({ where: { id: { in: [okId, strayId] } } })).toBe(0);
    });

    it("positive control: create WITH workspaceId persists in that workspace", async () => {
      const created = await seedRecommendation(recommendation1Id, ws1Id, engagement1Id, "scoped rec");
      expect(created).toMatchObject({ id: recommendation1Id, workspaceId: ws1Id, title: "scoped rec" });
    });

    it("updateMany with an empty or absent WHERE is refused and no workspace's rows change", async () => {
      const expected = `${VIOLATION}: updateMany on Engagement requires a non-empty WHERE (refusing an all-tenant bulk mutation)`;
      await expect(db.engagement.updateMany({ where: {}, data: { title: "PWNED" } })).rejects.toThrow(expected);
      await expect(db.engagement.updateMany({ data: { title: "PWNED" } })).rejects.toThrow(expected);

      const rows = await db.engagement.findMany({
        where: { id: { in: [engagement1Id, engagement2Id] } },
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      });
      expect(rows).toEqual([
        { id: engagement1Id, title: "Engagement in WS1" },
        { id: engagement2Id, title: "Engagement in WS2" },
      ]);
    });

    it("deleteMany with an empty WHERE is refused and every workspace's rows survive", async () => {
      await seedRecommendation(recommendation1Id, ws1Id, engagement1Id, "ws1 rec");
      await seedRecommendation(recommendation2Id, ws2Id, engagement2Id, "ws2 rec");

      await expect(db.recommendation.deleteMany({ where: {} })).rejects.toThrow(
        `${VIOLATION}: deleteMany on Recommendation requires a non-empty WHERE (refusing an all-tenant bulk mutation)`,
      );
      await expect(db.recommendation.deleteMany()).rejects.toThrow(`${VIOLATION}: deleteMany on Recommendation`);
      expect(await db.recommendation.count({ where: { id: { in: [recommendation1Id, recommendation2Id] } } })).toBe(2);
    });

    it("positive control: a workspace-scoped updateMany changes only that workspace", async () => {
      const result = await db.engagement.updateMany({ where: { workspaceId: ws1Id }, data: { title: "renamed in ws1" } });
      expect(result.count).toBe(1);
      const ws2 = await db.engagement.findUnique({ where: { id: engagement2Id }, select: { title: true } });
      expect(ws2).not.toBeNull();
      expect(ws2?.title).toBe("Engagement in WS2");
    });
  });

  describe("2. Service read guard: assertEngagementAccess (src/lib/visibility.ts)", () => {
    it("positive control: a member reading their own engagement in their own workspace is allowed", async () => {
      await expect(assertEngagementAccess(user1Id, engagement1Id, ws1Id)).resolves.toBeUndefined();
    });

    it("denies a foreign engagement id presented under the caller's own workspace", async () => {
      const attempt = assertEngagementAccess(user1Id, engagement2Id, ws1Id);
      await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
      await expect(assertEngagementAccess(user1Id, engagement2Id, ws1Id)).rejects.toThrow(
        `User does not have access to engagement: ${engagement2Id}`,
      );
    });

    it("denies the caller's own engagement when the request claims a different workspace", async () => {
      await expect(assertEngagementAccess(user1Id, engagement1Id, ws2Id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("denies another tenant's user even when they name the right workspace", async () => {
      await expect(assertEngagementAccess(user2Id, engagement1Id, ws1Id)).rejects.toThrow(
        `User does not have access to engagement: ${engagement1Id}`,
      );
    });

    it("denies a deactivated engagement membership", async () => {
      await db.engagementMembership.updateMany({
        where: { userId: user1Id, engagementId: engagement1Id },
        data: { isActive: false },
      });
      await expect(assertEngagementAccess(user1Id, engagement1Id, ws1Id)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("3. Route guard: enforceWorkspaceScoping (src/middleware/workspace-enforcement.ts)", () => {
    const req = {} as NextRequest;

    it("positive control: an active member of workspace 1 is admitted with their role", async () => {
      asSession(user1Id);
      await expect(enforceWorkspaceScoping(req, ws1Id)).resolves.toEqual({ userId: user1Id, role: "admin" });
    });

    it("a member of workspace 1 presenting workspace 2's id is denied (null)", async () => {
      asSession(user1Id);
      await expect(enforceWorkspaceScoping(req, ws2Id)).resolves.toBeNull();
      asSession(user2Id);
      await expect(enforceWorkspaceScoping(req, ws1Id)).resolves.toBeNull();
    });

    it("a malformed workspace id is rejected with ForbiddenError before any lookup", async () => {
      asSession(user1Id);
      const attempt = enforceWorkspaceScoping(req, `${ws1Id}' OR '1'='1`);
      await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
      await expect(enforceWorkspaceScoping(req, "not-a-uuid")).rejects.toThrow("Invalid workspace ID format");
    });
  });

  describe("4. Event replay and projection rebuild stay inside their workspace", () => {
    it("EventReplayEngine cannot replay workspace 2's aggregate from workspace 1", async () => {
      await emitCreated(recommendation2Id, ws2Id, engagement2Id, user2Id, "Rec in WS2");

      await expect(
        EventReplayEngine.replayAggregate(recommendation2Id, "recommendation", ws1Id),
      ).rejects.toThrow(`No events found for aggregate ${recommendation2Id}/recommendation`);

      // Positive control: the owning workspace replays it.
      const replayed = await EventReplayEngine.replayAggregate(recommendation2Id, "recommendation", ws2Id);
      expect(replayed.eventCount).toBe(1);
      expect(replayed.state.title).toBe("Rec in WS2");
      expect(replayed.state.engagementId).toBe(engagement2Id);
    });

    it("positive control: rebuilding a projection in its own workspace restores it from events", async () => {
      await emitCreated(recommendation1Id, ws1Id, engagement1Id, user1Id, "WS1 Rec");
      await seedRecommendation(recommendation1Id, ws1Id, engagement1Id, "stale title");

      const result = await ProjectionRebuildEngine.rebuildRecommendationProjection(recommendation1Id, ws1Id);
      expect(result).toMatchObject({ success: true, eventsProcessed: 1, errors: [] });

      const rebuilt = await db.recommendation.findUnique({ where: { id: recommendation1Id } });
      expect(rebuilt).not.toBeNull();
      expect(rebuilt?.workspaceId).toBe(ws1Id);
      expect(rebuilt?.title).toBe("WS1 Rec");
      expect(rebuilt?.engagementId).toBe(engagement1Id);
    });

    it("a rebuild requested under workspace 2 neither reads nor deletes workspace 1's projection", async () => {
      await emitCreated(recommendation1Id, ws1Id, engagement1Id, user1Id, "WS1 Rec");
      await seedRecommendation(recommendation1Id, ws1Id, engagement1Id, "WS1 Rec");

      const result = await ProjectionRebuildEngine.rebuildRecommendationProjection(recommendation1Id, ws2Id);
      expect(result.success).toBe(false);
      expect(result.eventsProcessed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/^Rebuild failed: /);

      const survivor = await db.recommendation.findUnique({ where: { id: recommendation1Id } });
      expect(survivor).not.toBeNull();
      expect(survivor?.workspaceId).toBe(ws1Id);
      expect(survivor?.title).toBe("WS1 Rec");
    });
  });

  describe("5. Event numbers are allocated per (workspace, aggregate)", () => {
    it("the same aggregate id in two workspaces gets two independent 1..n sequences", async () => {
      const sharedAggregateId = uuidv4();
      for (let i = 0; i < 5; i++) {
        await EventEmitterService.emit({
          aggregateId: sharedAggregateId,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { iteration: String(i) },
          actorId: user1Id,
          workspaceId: ws1Id,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        });
      }
      for (let i = 0; i < 3; i++) {
        await EventEmitterService.emit({
          aggregateId: sharedAggregateId,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { iteration: String(i) },
          actorId: user2Id,
          workspaceId: ws2Id,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        });
      }

      const numbers = async (workspaceId: string) =>
        (
          await db.canonicalEvent.findMany({
            where: { workspaceId, aggregateId: sharedAggregateId },
            orderBy: { eventNumber: "asc" },
            select: { eventNumber: true, actorId: true },
          })
        ).map((e: { eventNumber: number; actorId: string }) => [e.eventNumber, e.actorId]);

      expect(await numbers(ws1Id)).toEqual([1, 2, 3, 4, 5].map((n) => [n, user1Id]));
      expect(await numbers(ws2Id)).toEqual([1, 2, 3].map((n) => [n, user2Id]));
    });
  });
});
