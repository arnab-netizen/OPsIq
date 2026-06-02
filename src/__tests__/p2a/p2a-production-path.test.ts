import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRecommendation, updateRecommendation, getRecommendation } from "@/services/recommendation";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

describe("P2A Production Path - Real Service Functions", () => {
  const testWorkspaceId = uuidv4();
  const testClientId = uuidv4();
  const testEngagementId = uuidv4();
  const testEvidenceId = uuidv4();
  const testFindingId = uuidv4();
  const testRecommendationId = uuidv4();
  const testUserId = uuidv4();

  let createdRecommendationId: string;

  beforeAll(async () => {
    // Create test workspace
    await db.workspace.create({
      data: {
        id: testWorkspaceId,
        name: "P2A Test Workspace",
        slug: `p2a-test-${Date.now()}`,
      },
    });

    // Create test client
    await db.clientAccount.create({
      data: {
        id: testClientId,
        name: "P2A Test Client",
      },
    });

    // Create test engagement
    await db.engagement.create({
      data: {
        id: testEngagementId,
        code: `P2A-${Date.now()}`,
        title: "P2A Test Engagement",
        clientId: testClientId,
        serviceTier: "tier_1",
        engagementMode: "strategic_planning",
        workspaceId: testWorkspaceId,
      },
    });

    // Create test evidence
    await db.evidence.create({
      data: {
        id: testEvidenceId,
        engagementId: testEngagementId,
        title: "P2A Test Evidence",
        description: "Test evidence for P2A",
        source: "test",
        status: "validated",
      },
    });

    // Create test finding
    await db.finding.create({
      data: {
        id: testFindingId,
        engagementId: testEngagementId,
        primaryEvidenceId: testEvidenceId,
        title: "P2A Test Finding",
        summary: "Test finding for P2A",
        severity: "high",
        impactArea: "operational",
      },
    });

    console.log("✓ Test data setup complete");
  });

  afterAll(async () => {
    try {
      // Delete in reverse dependency order
      await db.recommendation.deleteMany({
        where: { engagementId: testEngagementId },
      });
      await db.finding.deleteMany({
        where: { engagementId: testEngagementId },
      });
      await db.evidence.deleteMany({
        where: { engagementId: testEngagementId },
      });
      await db.engagement.deleteMany({
        where: { id: testEngagementId },
      });
      await db.clientAccount.deleteMany({
        where: { id: testClientId },
      });
      await db.workspace.deleteMany({
        where: { id: testWorkspaceId },
      });
      console.log("✓ Test data cleaned up");
    } catch (error) {
      console.error("Cleanup failed:", error);
    }
  });

  it("should import actual createRecommendation function", () => {
    expect(typeof createRecommendation).toBe("function");
  });

  it("should import actual updateRecommendation function", () => {
    expect(typeof updateRecommendation).toBe("function");
  });

  it("should import actual getRecommendation function", () => {
    expect(typeof getRecommendation).toBe("function");
  });

  it("should call real createRecommendation with expectation fields", async () => {
    // Mock auth context (minimal required fields)
    const authContext: CanonicalAuthContext = {
      verifiedActorId: testUserId,
      verifiedActorType: "user",
      verifiedActor: null,
      verifiedWorkspaceId: testWorkspaceId,
      verifiedCapabilities: ["RECOMMENDATION_CREATE"],
      verifiedSessionSnapshot: {
        actorId: testUserId,
        sessionId: uuidv4(),
        createdAt: new Date(),
      } as any,
      policy: null,
    };

    const createInput = {
      engagementId: testEngagementId,
      findingId: testFindingId,
      title: "P2A Production Test Recommendation",
      summary: "Test recommendation with expectation fields",
      priority: "high",
      type: "corrective_action",
      rationale: "Testing P2A expectation fields",
      why_now: "Revenue declining at 2% per week for the past month",
      cost_of_inaction: "Backlog grows by 50% monthly due to approval delays",
      expected_metric: "approval_rate",
      expected_direction: "INCREASE",
      expected_target: "85%+",
    };

    // Call actual service function
    const result = await createRecommendation(createInput, authContext, testWorkspaceId);

    createdRecommendationId = result.id;

    // Verify result structure
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.engagementId).toBe(testEngagementId);
    expect(result.title).toBe("P2A Production Test Recommendation");
    expect(result.priority).toBe("high");

    console.log("✓ createRecommendation called successfully");
  });

  it("should verify expectation fields stored in constraintsConsidered JSON", async () => {
    // Fetch recommendation from database
    const retrieved = await db.recommendation.findUnique({
      where: { id: createdRecommendationId },
    });

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(createdRecommendationId);

    // Verify constraintsConsidered contains all expectation fields
    const constraints = retrieved?.constraintsConsidered as Record<string, any>;
    expect(constraints).toBeDefined();
    expect(constraints.why_now).toBe(
      "Revenue declining at 2% per week for the past month"
    );
    expect(constraints.cost_of_inaction).toBe(
      "Backlog grows by 50% monthly due to approval delays"
    );
    expect(constraints.expected_metric).toBe("approval_rate");
    expect(constraints.expected_direction).toBe("INCREASE");
    expect(constraints.expected_target).toBe("85%+");

    console.log("✓ All expectation fields verified in constraintsConsidered JSON");
  });

  it("should call real getRecommendation function", async () => {
    // Call actual service function
    const retrieved = await getRecommendation(createdRecommendationId, testWorkspaceId);

    expect(retrieved).toBeDefined();
    expect(retrieved.id).toBe(createdRecommendationId);
    expect(retrieved.title).toBe("P2A Production Test Recommendation");

    console.log("✓ getRecommendation called successfully");
  });

  it("should call real updateRecommendation with expectation field changes", async () => {
    const authContext: CanonicalAuthContext = {
      verifiedActorId: testUserId,
      verifiedActorType: "user",
      verifiedActor: null,
      verifiedWorkspaceId: testWorkspaceId,
      verifiedCapabilities: ["RECOMMENDATION_APPROVE"],
      verifiedSessionSnapshot: {
        actorId: testUserId,
        sessionId: uuidv4(),
        createdAt: new Date(),
      } as any,
      policy: null,
    };

    const updateInput = {
      version: 1,
      why_now: "Updated reason: Processing backlog critical",
      expected_metric: "processing_time",
      expected_direction: "DECREASE",
      expected_target: "< 24 hours",
    };

    // Call actual service function
    await updateRecommendation(
      createdRecommendationId,
      updateInput,
      authContext,
      testWorkspaceId
    );

    console.log("✓ updateRecommendation called successfully");
  });

  it("should verify expectation field changes persisted", async () => {
    // Fetch updated recommendation
    const updated = await db.recommendation.findUnique({
      where: { id: createdRecommendationId },
    });

    expect(updated).toBeDefined();

    const constraints = updated?.constraintsConsidered as Record<string, any>;
    expect(constraints).toBeDefined();

    // Updated fields should be present
    expect(constraints.why_now).toBe("Updated reason: Processing backlog critical");
    expect(constraints.expected_metric).toBe("processing_time");
    expect(constraints.expected_direction).toBe("DECREASE");
    expect(constraints.expected_target).toBe("< 24 hours");

    // Original fields should be preserved from CREATE
    expect(constraints.cost_of_inaction).toBe(
      "Backlog grows by 50% monthly due to approval delays"
    );

    console.log("✓ Expectation field changes verified in database");
  });

  it("should verify audit events were emitted", async () => {
    // Query audit events for this recommendation
    const auditEvents = await db.auditEvent.findMany({
      where: {
        entityId: createdRecommendationId,
        workspaceId: testWorkspaceId,
      },
      orderBy: { occurredAt: "desc" },
    });

    expect(auditEvents.length).toBeGreaterThan(0);

    // Check for CREATE event
    const createEvent = auditEvents.find((e) =>
      e.eventName.includes("created") || e.eventName.includes("CREATED")
    );

    if (createEvent) {
      const payload = createEvent.payload as Record<string, any>;
      expect(payload).toBeDefined();
      // Verify at least some expectation fields are in payload
      expect(
        payload.why_now ||
        payload.expected_metric ||
        payload.expected_direction ||
        payload.expected_target
      ).toBeTruthy();
    }

    console.log(
      `✓ Audit events emitted (${auditEvents.length} events found)`
    );
  });
});
