/**
 * B12-S4: Business Condition Profile Audit Events — DB Tests
 *
 * Verifies:
 * - Audit events emitted on profile creation
 * - Audit events emitted on condition transitions
 * - No duplicate audit on idempotent operations
 * - Audit payload contains required fields
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createBusinessConditionProfile,
  updateBusinessConditionProfile,
} from "../../../services/business-condition/business-condition-profile.service";
import { evaluateConditionTransition } from "../../../domain/business-facts/business-condition-profile";
import type { BusinessConditionProfileAssessment } from "../../../domain/business-facts/business-condition-profile";

let prisma: PrismaClient;

const mockAssessment: BusinessConditionProfileAssessment = {
  condition_score: 65,
  health_scores: {
    owner_health_score: 70,
    team_health_score: 60,
    customer_health_score: 65,
    financial_health_score: 60,
  },
  condition_status: "stable",
  risk_factors: ["test risk"],
  strengths: ["test strength"],
  urgency_level: "medium",
  hardening_pressure: "normal",
};

beforeEach(async () => {
  prisma = new PrismaClient();
});

afterEach(async () => {
  await prisma.$disconnect();
});

const skipIfNoDb = (test: { skip?: boolean }) => {
  if (process.env.TEST_WITH_DB !== "true") {
    test.skip = true;
  }
};

describe("B12-S4: Business Condition Profile Audit Events", () => {
  describe("Profile Creation Audit Events", () => {
    it("should emit BUSINESS_CONDITION_PROFILE_CREATED audit event", async () => {
      skipIfNoDb(it);

      const workspace = await prisma.workspace.create({
        data: {
          id: `ws_test_${Date.now()}`,
          name: "Test Workspace",
        },
      });

      const client = await prisma.clientAccount.create({
        data: {
          id: `cl_test_${Date.now()}`,
          name: "Test Client",
        },
      });

      const engagement = await prisma.engagement.create({
        data: {
          id: `eng_test_${Date.now()}`,
          code: `ENG-TEST-${Date.now()}`,
          title: "Test Engagement",
          clientId: client.id,
          workspaceId: workspace.id,
          serviceTier: "standard",
          engagementMode: "consulting",
        },
      });

      // Create profile
      const profile = await createBusinessConditionProfile(
        prisma,
        {
          engagement_id: engagement.id,
          workspace_id: workspace.id,
          assessment: mockAssessment,
          assessed_by_user_id: "user_123",
        },
        "user_123",
      );

      // Query audit events
      const auditEvents = await prisma.auditEvent.findMany({
        where: {
          eventName: "BUSINESS_CONDITION_PROFILE_CREATED",
          entityId: profile.id,
          workspaceId: workspace.id,
        },
      });

      expect(auditEvents.length).toBeGreaterThan(0);
      const event = auditEvents[0];
      expect(event.eventName).toBe("BUSINESS_CONDITION_PROFILE_CREATED");
      expect(event.entityType).toBe("BusinessConditionProfile");
      expect(event.actorId).toBe("user_123");
    });

    it("should include condition_status and score in audit payload", async () => {
      skipIfNoDb(it);

      const workspace = await prisma.workspace.create({
        data: {
          id: `ws_test_${Date.now()}`,
          name: "Test Workspace",
        },
      });

      const client = await prisma.clientAccount.create({
        data: {
          id: `cl_test_${Date.now()}`,
          name: "Test Client",
        },
      });

      const engagement = await prisma.engagement.create({
        data: {
          id: `eng_test_${Date.now()}`,
          code: `ENG-TEST-${Date.now()}`,
          title: "Test Engagement",
          clientId: client.id,
          workspaceId: workspace.id,
          serviceTier: "standard",
          engagementMode: "consulting",
        },
      });

      const profile = await createBusinessConditionProfile(
        prisma,
        {
          engagement_id: engagement.id,
          workspace_id: workspace.id,
          assessment: mockAssessment,
          assessed_by_user_id: "user_123",
        },
        "user_123",
      );

      const auditEvents = await prisma.auditEvent.findMany({
        where: {
          eventName: "BUSINESS_CONDITION_PROFILE_CREATED",
          entityId: profile.id,
        },
      });

      const event = auditEvents[0];
      const payload = event.payload as any;

      expect(payload).toBeDefined();
      expect(payload.condition_status).toBe("stable");
      expect(payload.condition_score).toBe(65);
      expect(payload.engagement_id).toBe(engagement.id);
    });
  });

  describe("Profile Transition Audit Events", () => {
    it("should emit BUSINESS_CONDITION_PROFILE_TRANSITIONED on status change", async () => {
      skipIfNoDb(it);

      const workspace = await prisma.workspace.create({
        data: {
          id: `ws_test_${Date.now()}`,
          name: "Test Workspace",
        },
      });

      const client = await prisma.clientAccount.create({
        data: {
          id: `cl_test_${Date.now()}`,
          name: "Test Client",
        },
      });

      const engagement = await prisma.engagement.create({
        data: {
          id: `eng_test_${Date.now()}`,
          code: `ENG-TEST-${Date.now()}`,
          title: "Test Engagement",
          clientId: client.id,
          workspaceId: workspace.id,
          serviceTier: "standard",
          engagementMode: "consulting",
        },
      });

      // Create initial profile
      const profile1 = await createBusinessConditionProfile(
        prisma,
        {
          engagement_id: engagement.id,
          workspace_id: workspace.id,
          assessment: mockAssessment,
          assessed_by_user_id: "user_123",
        },
        "user_123",
      );

      // Update with different status
      const stressedAssessment: BusinessConditionProfileAssessment = {
        ...mockAssessment,
        condition_score: 35,
        condition_status: "stressed",
      };

      const transition = evaluateConditionTransition(
        "stable",
        "stressed",
        65,
        35,
      );

      await updateBusinessConditionProfile(
        prisma,
        {
          profile_id: profile1.id,
          workspace_id: workspace.id,
          assessment: stressedAssessment,
          transition,
        },
        "user_123",
      );

      // Check for transition audit event
      const transitionEvents = await prisma.auditEvent.findMany({
        where: {
          eventName: "BUSINESS_CONDITION_PROFILE_TRANSITIONED",
          workspaceId: workspace.id,
        },
      });

      expect(transitionEvents.length).toBeGreaterThan(0);
      const event = transitionEvents[0];
      const payload = event.payload as any;

      expect(payload.previous_status).toBe("stable");
      expect(payload.new_status).toBe("stressed");
      expect(payload.requires_adaptive_reevaluation).toBe(true);
    });

    it("should not emit transition event on idempotent update", async () => {
      skipIfNoDb(it);

      const workspace = await prisma.workspace.create({
        data: {
          id: `ws_test_${Date.now()}`,
          name: "Test Workspace",
        },
      });

      const client = await prisma.clientAccount.create({
        data: {
          id: `cl_test_${Date.now()}`,
          name: "Test Client",
        },
      });

      const engagement = await prisma.engagement.create({
        data: {
          id: `eng_test_${Date.now()}`,
          code: `ENG-TEST-${Date.now()}`,
          title: "Test Engagement",
          clientId: client.id,
          workspaceId: workspace.id,
          serviceTier: "standard",
          engagementMode: "consulting",
        },
      });

      // Create initial profile
      const profile1 = await createBusinessConditionProfile(
        prisma,
        {
          engagement_id: engagement.id,
          workspace_id: workspace.id,
          assessment: mockAssessment,
          assessed_by_user_id: "user_123",
        },
        "user_123",
      );

      // Get audit events after creation
      const eventsAfterCreation = await prisma.auditEvent.findMany({
        where: {
          workspaceId: workspace.id,
        },
      });
      const creationEventCount = eventsAfterCreation.length;

      // Update with same assessment (idempotent)
      await updateBusinessConditionProfile(
        prisma,
        {
          profile_id: profile1.id,
          workspace_id: workspace.id,
          assessment: mockAssessment, // Same assessment
        },
        "user_123",
      );

      // Check audit events again - should not add transition event
      const eventsAfterUpdate = await prisma.auditEvent.findMany({
        where: {
          workspaceId: workspace.id,
        },
      });

      // Should not have added transition event (might have other events)
      const transitionEventCount = eventsAfterUpdate.filter(
        (e) => e.eventName === "BUSINESS_CONDITION_PROFILE_TRANSITIONED",
      ).length;

      expect(transitionEventCount).toBe(0);
    });
  });

  describe("Audit Event Payload Structure", () => {
    it("should include engagement_id in all audit events", async () => {
      skipIfNoDb(it);

      const workspace = await prisma.workspace.create({
        data: {
          id: `ws_test_${Date.now()}`,
          name: "Test Workspace",
        },
      });

      const client = await prisma.clientAccount.create({
        data: {
          id: `cl_test_${Date.now()}`,
          name: "Test Client",
        },
      });

      const engagement = await prisma.engagement.create({
        data: {
          id: `eng_test_${Date.now()}`,
          code: `ENG-TEST-${Date.now()}`,
          title: "Test Engagement",
          clientId: client.id,
          workspaceId: workspace.id,
          serviceTier: "standard",
          engagementMode: "consulting",
        },
      });

      const profile = await createBusinessConditionProfile(
        prisma,
        {
          engagement_id: engagement.id,
          workspace_id: workspace.id,
          assessment: mockAssessment,
          assessed_by_user_id: "user_123",
        },
        "user_123",
      );

      const auditEvents = await prisma.auditEvent.findMany({
        where: {
          eventName: "BUSINESS_CONDITION_PROFILE_CREATED",
          workspaceId: workspace.id,
        },
      });

      auditEvents.forEach((event) => {
        const payload = event.payload as any;
        expect(payload.engagement_id).toBe(engagement.id);
      });
    });

    it("should include version information in audit events", async () => {
      skipIfNoDb(it);

      const workspace = await prisma.workspace.create({
        data: {
          id: `ws_test_${Date.now()}`,
          name: "Test Workspace",
        },
      });

      const client = await prisma.clientAccount.create({
        data: {
          id: `cl_test_${Date.now()}`,
          name: "Test Client",
        },
      });

      const engagement = await prisma.engagement.create({
        data: {
          id: `eng_test_${Date.now()}`,
          code: `ENG-TEST-${Date.now()}`,
          title: "Test Engagement",
          clientId: client.id,
          workspaceId: workspace.id,
          serviceTier: "standard",
          engagementMode: "consulting",
        },
      });

      const profile = await createBusinessConditionProfile(
        prisma,
        {
          engagement_id: engagement.id,
          workspace_id: workspace.id,
          assessment: mockAssessment,
          assessed_by_user_id: "user_123",
        },
        "user_123",
      );

      const auditEvents = await prisma.auditEvent.findMany({
        where: {
          eventName: "BUSINESS_CONDITION_PROFILE_CREATED",
          workspaceId: workspace.id,
        },
      });

      const event = auditEvents[0];
      const payload = event.payload as any;

      expect(payload.previous_version).toBe(0);
      expect(payload.new_version).toBe(1);
    });
  });
});
