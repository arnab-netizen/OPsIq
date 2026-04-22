import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createAction, updateAction, listActionsForEngagement, getActionDetail } from "./action";
import { createEngagement } from "./engagement";
import { createClient } from "./client-account";
import { createFinding } from "./findings";

describe("Action Service", () => {
  let clientId: string;
  let engagementId: string;
  let recommendationId: string;
  let findingId: string;
  let actorId = "test-actor-id";

  beforeAll(async () => {
    const client = await createClient(
      {
        name: "Test Client",
        industry: "Technology",
        size: "large",
      },
      actorId
    );
    clientId = client.id;

    const engagement = await createEngagement(
      {
        title: "Test Engagement",
        clientId,
        serviceTier: "premium",
        engagementMode: "expert",
        interventionMode: "recovery",
      },
      actorId
    );
    engagementId = engagement.id;

    const finding = await createFinding(
      {
        engagementId,
        title: "Test Finding",
        statement: "A test finding",
        severity: "high",
        confidenceLabel: "high",
      },
      actorId
    );
    findingId = finding.id;

    const recResult = await db.recommendation.create({
      data: {
        engagementId,
        title: "Test Recommendation",
        statement: "Test recommendation",
        severity: "high",
        rationale: "Test rationale",
        sourceFindingIds: [findingId],
        sourceShockDetected: false,
        priority: 2,
        status: "draft",
        createdBy: actorId,
      },
      select: { id: true },
    });
    recommendationId = recResult.id;
  });

  afterAll(async () => {
    try {
      await (db.action.deleteMany as any)({ where: { engagementId } });
      await (db.recommendation.deleteMany as any)({ where: { engagementId } });
      await (db.finding.deleteMany as any)({ where: { engagementId } });
      await (db.engagement.deleteMany as any)({ where: { id: engagementId } });
      await (db.clientAccount.deleteMany as any)({ where: { id: clientId } });
    } catch {
      // Cleanup best-effort
    }
  });

  describe("createAction", () => {
    it("should create action with valid inputs", async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const action = await createAction(
        {
          engagementId,
          title: "Complete Financial Review",
          description: "Review all financial statements",
          priority: 1,
          owner: "consultant-1",
          dueDate: futureDate,
        },
        actorId
      );

      expect(action.id).toBeDefined();
      expect(action.title).toBe("Complete Financial Review");
      expect(action.status).toBe("open");
      expect(action.priority).toBe(1);
    });

    it("should reject action with past due date", async () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      expect(async () => {
        await createAction(
          {
            engagementId,
            title: "Invalid Action",
            description: "Should fail",
            priority: 2,
            owner: "consultant-1",
            dueDate: pastDate,
          },
          actorId
        );
      }).rejects.toThrow("future");
    });

    it("should reject invalid priority", async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      expect(async () => {
        await createAction(
          {
            engagementId,
            title: "Invalid Priority",
            description: "Should fail",
            priority: 5,
            owner: "consultant-1",
            dueDate: futureDate,
          },
          actorId
        );
      }).rejects.toThrow("Priority");
    });

    it("should link action to recommendation if provided", async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const action = await createAction(
        {
          engagementId,
          recommendationId,
          title: "Implement Recommendation",
          description: "Action based on recommendation",
          priority: 2,
          owner: "consultant-1",
          dueDate: futureDate,
        },
        actorId
      );

      expect(action.recommendationId).toBe(recommendationId);
    });
  });

  describe("updateAction", () => {
    let actionId: string;

    beforeAll(async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const action = await createAction(
        {
          engagementId,
          title: "Updateable Action",
          description: "For update tests",
          priority: 2,
          owner: "consultant-1",
          dueDate: futureDate,
        },
        actorId
      );
      actionId = action.id;
    });

    it("should update action status: open -> in_progress", async () => {
      const updated = await updateAction(
        actionId,
        {
          status: "in_progress",
          version: 1,
        },
        actorId
      );

      expect(updated.status).toBe("in_progress");
    });

    it("should update action status: in_progress -> done", async () => {
      const updated = await updateAction(
        actionId,
        {
          status: "done",
          version: 2,
        },
        actorId
      );

      expect(updated.status).toBe("done");
      expect(updated.completedAt).toBeDefined();
    });

    it("should reject invalid status transition", async () => {
      expect(async () => {
        await updateAction(
          actionId,
          {
            status: "open",
            version: 3,
          },
          actorId
        );
      }).rejects.toThrow("Invalid status transition");
    });

    it("should reject version mismatch", async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const action = await createAction(
        {
          engagementId,
          title: "Version Test Action",
          description: "For version check",
          priority: 3,
          owner: "consultant-1",
          dueDate: futureDate,
        },
        actorId
      );

      expect(async () => {
        await updateAction(
          action.id,
          {
            status: "in_progress",
            version: 999,
          },
          actorId
        );
      }).rejects.toThrow("Version mismatch");
    });
  });

  describe("listActionsForEngagement", () => {
    it("should list all actions for engagement", async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await createAction(
        {
          engagementId,
          title: "Action 1",
          description: "First action",
          priority: 2,
          owner: "consultant-1",
          dueDate: futureDate,
        },
        actorId
      );

      const actions = await listActionsForEngagement(engagementId);
      expect(actions.length).toBeGreaterThan(0);
    });

    it("should filter internal-only actions from client view", async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const internalAction = await createAction(
        {
          engagementId,
          title: "Internal Action",
          description: "For internal use only",
          priority: 1,
          owner: "consultant-1",
          dueDate: futureDate,
          visibilityStatus: "internal",
        },
        actorId
      );

      const clientAction = await createAction(
        {
          engagementId,
          title: "Client-Visible Action",
          description: "For client visibility",
          priority: 2,
          owner: "consultant-1",
          dueDate: futureDate,
          visibilityStatus: "client_visible",
        },
        actorId
      );

      const internalOnly = await listActionsForEngagement(engagementId, "internal");
      const allActions = await listActionsForEngagement(engagementId, "all");

      expect(internalOnly.some((a) => a.id === internalAction.id)).toBe(true);
      expect(internalOnly.some((a) => a.id === clientAction.id)).toBe(false);
      expect(allActions.some((a) => a.id === internalAction.id)).toBe(true);
      expect(allActions.some((a) => a.id === clientAction.id)).toBe(true);
    });

    it("should not expose visibilityStatus in response", async () => {
      const actions = await listActionsForEngagement(engagementId);
      if (actions.length > 0) {
        expect((actions[0] as any).visibilityStatus).toBeUndefined();
      }
    });
  });

  describe("getActionDetail", () => {
    let actionId: string;

    beforeAll(async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const action = await createAction(
        {
          engagementId,
          title: "Detail Test Action",
          description: "For detail retrieval",
          priority: 2,
          owner: "consultant-1",
          dueDate: futureDate,
          visibilityStatus: "internal",
        },
        actorId
      );
      actionId = action.id;
    });

    it("should get action detail", async () => {
      const action = await getActionDetail(actionId);
      expect(action.id).toBe(actionId);
      expect(action.title).toBe("Detail Test Action");
    });

    it("should throw on internal-only action with client visibility", async () => {
      expect(async () => {
        await getActionDetail(actionId, "internal");
      }).rejects.toThrow("not found");
    });

    it("should allow access with 'all' visibility", async () => {
      const action = await getActionDetail(actionId, "all");
      expect(action.id).toBe(actionId);
    });

    it("should not expose visibilityStatus in response", async () => {
      const action = await getActionDetail(actionId);
      expect((action as any).visibilityStatus).toBeUndefined();
    });
  });

  describe("security boundaries", () => {
    it("should prevent access to non-existent action", async () => {
      expect(async () => {
        await getActionDetail("non-existent-id");
      }).rejects.toThrow("not found");
    });

    it("should reject action for non-existent engagement", async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      expect(async () => {
        await createAction(
          {
            engagementId: "non-existent",
            title: "Invalid",
            description: "Should fail",
            priority: 1,
            owner: "consultant-1",
            dueDate: futureDate,
          },
          actorId
        );
      }).rejects.toThrow("Engagement");
    });
  });
});
