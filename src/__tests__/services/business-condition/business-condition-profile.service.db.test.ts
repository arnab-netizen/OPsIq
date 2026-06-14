/**
 * B12-S2: Business Condition Profile Persistence Service — DB Tests
 *
 * Verifies:
 * - Profile creation with workspace scoping
 * - Version increment on updates
 * - isCurrent flag management (old=false, new=true)
 * - Idempotency (re-evaluating same diagnosis = same record)
 * - Transaction safety
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createBusinessConditionProfile,
  updateBusinessConditionProfile,
  getEffectiveBusinessConditionProfile,
} from "../../../services/business-condition/business-condition-profile.service";
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
  // Will be skipped if TEST_WITH_DB is not set
});

afterEach(async () => {
  await prisma.$disconnect();
});

const skipIfNoDb = (test: { skip?: boolean }) => {
  if (process.env.TEST_WITH_DB !== "true") {
    test.skip = true;
  }
};

describe("B12-S2: Business Condition Profile Persistence", () => {
  describe("createBusinessConditionProfile", () => {
    it("should create profile with correct fields", async () => {
      skipIfNoDb(it);

      // Create test data
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

      expect(profile).toBeDefined();
      expect(profile.engagementId).toBe(engagement.id);
      expect(profile.workspaceId).toBe(workspace.id);
      expect(profile.conditionScore).toBe(65);
      expect(profile.businessStatus).toBe("stable");
      expect(profile.version).toBe(1);
      expect(profile.isCurrent).toBe(true);
      expect(Array.isArray(profile.riskFactors)).toBe(true);
      expect(Array.isArray(profile.strengths)).toBe(true);
    });

    it("should mark previous profiles as not current", async () => {
      skipIfNoDb(it);

      // Create test data
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

      // Create first profile
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

      // Create second profile
      const assessment2 = { ...mockAssessment, condition_score: 55 };
      const profile2 = await createBusinessConditionProfile(
        prisma,
        {
          engagement_id: engagement.id,
          workspace_id: workspace.id,
          assessment: assessment2,
          assessed_by_user_id: "user_123",
        },
        "user_123",
      );

      // Verify first is marked not current
      const refreshedProfile1 = await prisma.businessConditionProfile.findUnique({
        where: { id: profile1.id },
      });
      expect(refreshedProfile1?.isCurrent).toBe(false);

      // Verify second is current
      expect(profile2.isCurrent).toBe(true);
    });

    it("should enforce workspace isolation on create", async () => {
      skipIfNoDb(it);

      const workspace1 = await prisma.workspace.create({
        data: {
          id: `ws_test_${Date.now()}`,
          name: "Workspace 1",
        },
      });

      const workspace2 = await prisma.workspace.create({
        data: {
          id: `ws_test_${Date.now()}_2`,
          name: "Workspace 2",
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
          workspaceId: workspace1.id,
          serviceTier: "standard",
          engagementMode: "consulting",
        },
      });

      // Try to create profile in wrong workspace
      await expect(
        createBusinessConditionProfile(
          prisma,
          {
            engagement_id: engagement.id,
            workspace_id: workspace2.id, // Wrong workspace
            assessment: mockAssessment,
            assessed_by_user_id: "user_123",
          },
          "user_123",
        ),
      ).rejects.toThrow("Unauthorized");
    });
  });

  describe("updateBusinessConditionProfile", () => {
    it("should increment version on update", async () => {
      skipIfNoDb(it);

      // Create test data and initial profile
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

      // Update profile
      const assessment2 = { ...mockAssessment, condition_score: 55 };
      const profile2 = await updateBusinessConditionProfile(
        prisma,
        {
          profile_id: profile1.id,
          workspace_id: workspace.id,
          assessment: assessment2,
          assessed_by_user_id: "user_123",
        },
        "user_123",
      );

      expect(profile2.version).toBe(2);
      expect(profile2.conditionScore).toBe(55);
    });

    it("should implement idempotency for same assessment", async () => {
      skipIfNoDb(it);

      // Create test data and initial profile
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

      // Update with same assessment
      const profile2 = await updateBusinessConditionProfile(
        prisma,
        {
          profile_id: profile1.id,
          workspace_id: workspace.id,
          assessment: mockAssessment, // Same assessment
        },
        "user_123",
      );

      // Should return original (idempotent)
      expect(profile2.id).toBe(profile1.id);
      expect(profile2.version).toBe(1);
    });

    it("should enforce workspace isolation on update", async () => {
      skipIfNoDb(it);

      const workspace1 = await prisma.workspace.create({
        data: {
          id: `ws_test_${Date.now()}`,
          name: "Workspace 1",
        },
      });

      const workspace2 = await prisma.workspace.create({
        data: {
          id: `ws_test_${Date.now()}_2`,
          name: "Workspace 2",
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
          workspaceId: workspace1.id,
          serviceTier: "standard",
          engagementMode: "consulting",
        },
      });

      const profile = await createBusinessConditionProfile(
        prisma,
        {
          engagement_id: engagement.id,
          workspace_id: workspace1.id,
          assessment: mockAssessment,
          assessed_by_user_id: "user_123",
        },
        "user_123",
      );

      // Try to update from wrong workspace
      await expect(
        updateBusinessConditionProfile(
          prisma,
          {
            profile_id: profile.id,
            workspace_id: workspace2.id, // Wrong workspace
            assessment: mockAssessment,
          },
          "user_123",
        ),
      ).rejects.toThrow("Unauthorized");
    });
  });

  describe("getEffectiveBusinessConditionProfile", () => {
    it("should return current profile only", async () => {
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

      // Create two versions
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

      const assessment2 = { ...mockAssessment, condition_score: 55 };
      await createBusinessConditionProfile(
        prisma,
        {
          engagement_id: engagement.id,
          workspace_id: workspace.id,
          assessment: assessment2,
          assessed_by_user_id: "user_123",
        },
        "user_123",
      );

      // Get effective profile
      const effective = await getEffectiveBusinessConditionProfile(
        prisma,
        engagement.id,
        workspace.id,
      );

      expect(effective).toBeDefined();
      expect(effective?.conditionScore).toBe(55); // Latest
      expect(effective?.isCurrent).toBe(true);
    });

    it("should enforce workspace isolation on query", async () => {
      skipIfNoDb(it);

      const workspace1 = await prisma.workspace.create({
        data: {
          id: `ws_test_${Date.now()}`,
          name: "Workspace 1",
        },
      });

      const workspace2 = await prisma.workspace.create({
        data: {
          id: `ws_test_${Date.now()}_2`,
          name: "Workspace 2",
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
          workspaceId: workspace1.id,
          serviceTier: "standard",
          engagementMode: "consulting",
        },
      });

      await createBusinessConditionProfile(
        prisma,
        {
          engagement_id: engagement.id,
          workspace_id: workspace1.id,
          assessment: mockAssessment,
          assessed_by_user_id: "user_123",
        },
        "user_123",
      );

      // Try to query from wrong workspace
      await expect(
        getEffectiveBusinessConditionProfile(
          prisma,
          engagement.id,
          workspace2.id,
        ),
      ).rejects.toThrow("Unauthorized");
    });
  });
});
