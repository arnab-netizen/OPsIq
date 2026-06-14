/**
 * B12-S3: Business Condition Profile Workspace Isolation — DB Tests
 *
 * Verifies:
 * - Workspace isolation enforced on queries
 * - Cross-workspace access is blocked
 * - Authorized workspace access only
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createBusinessConditionProfile,
  getEffectiveBusinessConditionProfile,
  getBusinessConditionProfileHistory,
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
});

afterEach(async () => {
  await prisma.$disconnect();
});

const skipIfNoDb = (test: { skip?: boolean }) => {
  if (process.env.TEST_WITH_DB !== "true") {
    test.skip = true;
  }
};

describe("B12-S3: Business Condition Profile Workspace Isolation", () => {
  describe("getEffectiveBusinessConditionProfile", () => {
    it("should block cross-workspace access", async () => {
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

      // Create profile in workspace 1
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

      // Attempt query from workspace 2
      await expect(
        getEffectiveBusinessConditionProfile(
          prisma,
          engagement.id,
          workspace2.id,
        ),
      ).rejects.toThrow("Unauthorized");
    });

    it("should allow authorized workspace access", async () => {
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

      // Query from correct workspace
      const retrieved = await getEffectiveBusinessConditionProfile(
        prisma,
        engagement.id,
        workspace.id,
      );

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(profile.id);
    });

    it("should block access with non-existent engagement", async () => {
      skipIfNoDb(it);

      const workspace = await prisma.workspace.create({
        data: {
          id: `ws_test_${Date.now()}`,
          name: "Test Workspace",
        },
      });

      // Try to query non-existent engagement
      await expect(
        getEffectiveBusinessConditionProfile(
          prisma,
          "eng_nonexistent",
          workspace.id,
        ),
      ).rejects.toThrow("Unauthorized");
    });
  });

  describe("getBusinessConditionProfileHistory", () => {
    it("should return all versions for authorized workspace", async () => {
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

      // Create multiple versions
      await createBusinessConditionProfile(
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

      const assessment3 = { ...mockAssessment, condition_score: 45 };
      await createBusinessConditionProfile(
        prisma,
        {
          engagement_id: engagement.id,
          workspace_id: workspace.id,
          assessment: assessment3,
          assessed_by_user_id: "user_123",
        },
        "user_123",
      );

      // Get history
      const history = await getBusinessConditionProfileHistory(
        prisma,
        engagement.id,
        workspace.id,
      );

      expect(history).toHaveLength(3);
      expect(history[0].version).toBe(3); // Most recent first
      expect(history[2].version).toBe(1);
    });

    it("should block history access from unauthorized workspace", async () => {
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

      // Create profile in workspace 1
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

      // Try to access from workspace 2
      await expect(
        getBusinessConditionProfileHistory(
          prisma,
          engagement.id,
          workspace2.id,
        ),
      ).rejects.toThrow("Unauthorized");
    });
  });
});
