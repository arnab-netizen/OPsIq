import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createEvidence, getEvidenceById } from "@/services/evidence";
import { createFinding } from "@/services/finding";
import { createRecommendation, approveRecommendation } from "@/services/recommendation";
import { createAction, getActionById } from "@/services/action";
import { createClientAccount } from "@/services/client-account";
import { createEngagement } from "@/services/engagement";
import { createUser } from "@/services/user";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

describe("Evidence → Finding → Recommendation → Action Lifecycle", () => {
  let userId: string;
  let clientId: string;
  let engagementId: string;
  let evidenceId: string;
  let findingId: string;
  let recommendationId: string;
  let actionId: string;

  beforeAll(async () => {
    // Create test user
    const userResult = await createUser(
      {
        email: `lifecycle-test-${Date.now()}@example.com`,
        name: "Lifecycle Tester",
        password: "test-password-123",
      },
      "system"
    );
    userId = userResult.id;

    // Create test client
    const clientResult = await createClientAccount(
      {
        name: "Lifecycle Test Client",
        industry: "Technology",
        size: "medium",
      },
      userId
    );
    clientId = clientResult.id;

    // Create test engagement
    const engagementResult = await createEngagement(
      {
        title: "Lifecycle Test Engagement",
        clientId,
        serviceTier: "premium",
        engagementMode: "expert",
        interventionMode: "recovery",
      },
      userId
    );
    engagementId = engagementResult.id;
  });

  afterAll(async () => {
    // Cleanup is handled by test database teardown
  });

  it("1. Should create Evidence linked to Engagement", async () => {
    const result = await createEvidence(
      {
        engagementId,
        title: "Test Evidence: Declining Revenue",
        description: "Q1 revenue declined 15% YoY",
        evidenceType: "metric",
        sourceReference: "Financial Report Q1 2026",
        severity: "high",
      },
      userId
    );

    evidenceId = result.id;
    expect(evidenceId).toBeDefined();

    const evidence = await getEvidenceById(evidenceId);
    expect(evidence.title).toBe("Test Evidence: Declining Revenue");
    expect(evidence.status).toBe("submitted");
    expect(evidence.engagementId).toBe(engagementId);

    // Verify audit event
    const auditEvents = await db.auditEvent.findMany({
      where: {
        entityType: "evidence",
        entityId: evidenceId,
        eventName: AUDIT_EVENTS.EVIDENCE_SUBMITTED,
      },
    });
    expect(auditEvents.length).toBeGreaterThan(0);
  });

  it("2. Should create Finding from Evidence", async () => {
    const result = await createFinding(
      {
        engagementId,
        title: "Finding: Revenue Decline",
        description: "Revenue declining at 15% YoY rate",
        findingType: "operational",
        impactArea: "revenue",
        severity: "critical",
        rootCause: "Lost major customer",
        linkedEvidenceIds: [evidenceId],
      },
      userId
    );

    findingId = result.id;
    expect(findingId).toBeDefined();

    // Verify audit event
    const auditEvents = await db.auditEvent.findMany({
      where: {
        entityType: "finding",
        entityId: findingId,
        eventName: AUDIT_EVENTS.FINDING_CREATED,
      },
    });
    expect(auditEvents.length).toBeGreaterThan(0);
  });

  it("3. Should create Recommendation from Finding", async () => {
    const result = await createRecommendation(
      {
        engagementId,
        findingId,
        title: "Implement customer retention program",
        description:
          "Establish dedicated account management for top customers",
        rationale: "Prevent further customer loss",
        priority: "critical",
        estimatedImpact: "high",
      },
      userId
    );

    recommendationId = result.id;
    expect(recommendationId).toBeDefined();

    // Verify audit event
    const auditEvents = await db.auditEvent.findMany({
      where: {
        entityType: "recommendation",
        entityId: recommendationId,
        eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
      },
    });
    expect(auditEvents.length).toBeGreaterThan(0);
  });

  it("4. Should approve Recommendation", async () => {
    await approveRecommendation(recommendationId, userId);

    // Verify audit event
    const auditEvents = await db.auditEvent.findMany({
      where: {
        entityType: "recommendation",
        entityId: recommendationId,
        eventName: AUDIT_EVENTS.RECOMMENDATION_APPROVED,
      },
    });
    expect(auditEvents.length).toBeGreaterThan(0);
  });

  it("5. Should create Action from approved Recommendation", async () => {
    const result = await createAction(
      {
        engagementId,
        recommendationId,
        title: "Hire Customer Success Manager",
        description: "Hire dedicated person to manage top 5 accounts",
        priority: "critical",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        assignedTo: userId,
      },
      userId
    );

    actionId = result.id;
    expect(actionId).toBeDefined();

    // Verify audit event
    const auditEvents = await db.auditEvent.findMany({
      where: {
        entityType: "action",
        entityId: actionId,
        eventName: AUDIT_EVENTS.ACTION_CREATED,
      },
    });
    expect(auditEvents.length).toBeGreaterThan(0);
  });

  it("6. Should update Action to completed", async () => {
    const action = await getActionById(actionId);

    await db.action.update({
      where: { id: actionId },
      data: {
        status: "completed",
        completedBy: userId,
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });

    const updated = await getActionById(actionId);
    expect(updated.status).toBe("completed");
    expect(updated.completedBy).toBe(userId);
  });

  it("7. Should verify end-to-end audit trail", async () => {
    // Verify all key events are recorded
    const evidenceEvent = await db.auditEvent.findFirst({
      where: {
        entityType: "evidence",
        entityId: evidenceId,
      },
    });
    expect(evidenceEvent).toBeDefined();

    const findingEvent = await db.auditEvent.findFirst({
      where: {
        entityType: "finding",
        entityId: findingId,
      },
    });
    expect(findingEvent).toBeDefined();

    const recommendationEvent = await db.auditEvent.findFirst({
      where: {
        entityType: "recommendation",
        entityId: recommendationId,
      },
    });
    expect(recommendationEvent).toBeDefined();

    const actionEvent = await db.auditEvent.findFirst({
      where: {
        entityType: "action",
        entityId: actionId,
      },
    });
    expect(actionEvent).toBeDefined();

    // Verify all actors are correct
    expect(evidenceEvent?.actorId).toBe(userId);
    expect(findingEvent?.actorId).toBe(userId);
    expect(recommendationEvent?.actorId).toBe(userId);
    expect(actionEvent?.actorId).toBe(userId);
  });

  it("8. Should enforce Recommendation conversion rule", async () => {
    // Should not allow creating Action from non-approved Recommendation
    const newRecommendation = await createRecommendation(
      {
        engagementId,
        findingId,
        title: "Another recommendation",
        priority: "high",
      },
      userId
    );

    try {
      await createAction(
        {
          engagementId,
          recommendationId: newRecommendation.id,
          title: "Should fail",
          priority: "high",
        },
        userId
      );
      expect.fail("Should have thrown validation error");
    } catch (error) {
      expect(error instanceof Error).toBe(true);
      expect((error as Error).message).toContain("approved");
    }
  });

  it("9. Should maintain data consistency across relationships", async () => {
    // Verify Evidence links correctly
    const evidence = await getEvidenceById(evidenceId);
    expect(evidence.engagement.id).toBe(engagementId);

    // Verify Finding links correctly
    const finding = await db.finding.findUnique({
      where: { id: findingId },
      include: { engagement: true },
    });
    expect(finding?.engagement.id).toBe(engagementId);

    // Verify Recommendation links correctly
    const recommendation = await db.recommendation.findUnique({
      where: { id: recommendationId },
      include: { finding: true },
    });
    expect(recommendation?.finding.id).toBe(findingId);

    // Verify Action links correctly
    const action = await getActionById(actionId);
    expect(action.engagement.id).toBe(engagementId);
    expect(action.recommendation.id).toBe(recommendationId);
  });
});
