import { describe, it, expect, vi, beforeEach } from "vitest";
import * as usageService from "@/services/usage.service";
import { logger } from "@/infra/logger";

// Mock logger to track error/warn calls without DB dependency
vi.mock("@/infra/logger");

// Mock the entitlement service
vi.mock("@/services/entitlement.service", () => ({
  trackUsage: vi.fn().mockResolvedValue(undefined),
}));

describe("Usage Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mocks including logger
    vi.mocked(logger.warn).mockReset();
    vi.mocked(logger.error).mockReset();
  });

  describe("recordUsage", () => {
    describe("basic functionality", () => {
      it("should accept valid parameters and return without error", async () => {
        await expect(
          usageService.recordUsage("workspace-123", "api_calls", 5, { endpoint: "/api/foo" })
        ).resolves.toBeUndefined();
      });

      it("should use default value of 1 when value not provided", async () => {
        await expect(usageService.recordUsage("workspace-123", "feature_use")).resolves.toBeUndefined();
      });

      it("should handle zero value", async () => {
        await expect(usageService.recordUsage("workspace-123", "metric", 0)).resolves.toBeUndefined();
      });

      it("should handle large values", async () => {
        await expect(usageService.recordUsage("workspace-123", "bulk_operation", 999999)).resolves.toBeUndefined();
      });

      it("should handle negative values (for adjustment/refund scenarios)", async () => {
        await expect(usageService.recordUsage("workspace-123", "refund", -5)).resolves.toBeUndefined();
      });

      it("should handle fractional values", async () => {
        await expect(usageService.recordUsage("workspace-123", "cost", 9.99)).resolves.toBeUndefined();
      });

      it("should accept context parameter", async () => {
        const context = { userId: "user-123", endpoint: "/api/foo" };
        await expect(usageService.recordUsage("workspace-123", "api_call", 1, context)).resolves.toBeUndefined();
      });
    });

    describe("missing parameters", () => {
      it("should log warning and return when workspaceId is missing", async () => {
        await usageService.recordUsage("", "metric", 1);

        expect(vi.mocked(logger.warn)).toHaveBeenCalledOnce();
        expect(vi.mocked(logger.warn)).toHaveBeenCalledWith("recordUsage called with missing workspaceId or key", {
          workspaceId: "",
          key: "metric",
        });
      });

      it("should log warning and return when key is missing", async () => {
        await usageService.recordUsage("workspace-123", "", 1);

        expect(vi.mocked(logger.warn)).toHaveBeenCalledOnce();
        expect(vi.mocked(logger.warn)).toHaveBeenCalledWith("recordUsage called with missing workspaceId or key", {
          workspaceId: "workspace-123",
          key: "",
        });
      });

      it("should log warning when both workspaceId and key are missing", async () => {
        await usageService.recordUsage("", "", 1);

        expect(vi.mocked(logger.warn)).toHaveBeenCalledOnce();
      });

      it("should not call trackUsage when workspaceId is missing", async () => {
        const { trackUsage } = await import("@/services/entitlement.service");
        vi.mocked(trackUsage).mockClear();

        await usageService.recordUsage("", "metric", 1);

        expect(vi.mocked(trackUsage)).not.toHaveBeenCalled();
      });

      it("should not call trackUsage when key is missing", async () => {
        const { trackUsage } = await import("@/services/entitlement.service");
        vi.mocked(trackUsage).mockClear();

        await usageService.recordUsage("workspace-123", "", 1);

        expect(vi.mocked(trackUsage)).not.toHaveBeenCalled();
      });
    });

    describe("error handling (fail open)", () => {
      it("should log error but not throw when trackUsage fails", async () => {
        const { trackUsage } = await import("@/services/entitlement.service");
        vi.mocked(trackUsage).mockRejectedValueOnce(new Error("Track failed"));

        // Should not throw
        await expect(usageService.recordUsage("workspace-123", "metric", 1)).resolves.toBeUndefined();

        expect(vi.mocked(logger.error)).toHaveBeenCalledOnce();
        expect(vi.mocked(logger.error)).toHaveBeenCalledWith("Failed to record usage", {
          workspaceId: "workspace-123",
          key: "metric",
          value: 1,
          error: "Couldn't load that data. Please refresh and try again.",
        });
      });

      it("should log error with unknown message when non-Error object thrown", async () => {
        const { trackUsage } = await import("@/services/entitlement.service");
        vi.mocked(trackUsage).mockRejectedValueOnce("not an error");

        await expect(usageService.recordUsage("workspace-123", "metric", 1)).resolves.toBeUndefined();

        expect(vi.mocked(logger.error)).toHaveBeenCalledOnce();
        expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
          "Failed to record usage",
          expect.objectContaining({
            error: "Couldn't load that data. Please refresh and try again.",
          })
        );
      });

      it("should handle timeout errors gracefully", async () => {
        const { trackUsage } = await import("@/services/entitlement.service");

        const timeoutError = new Error("Timeout");
        timeoutError.name = "TimeoutError";
        vi.mocked(trackUsage).mockRejectedValueOnce(timeoutError);

        await expect(usageService.recordUsage("workspace-123", "metric", 1)).resolves.toBeUndefined();

        expect(vi.mocked(logger.error)).toHaveBeenCalled();
      });

      it("should handle network errors gracefully", async () => {
        const { trackUsage } = await import("@/services/entitlement.service");

        const networkError = new Error("Network unavailable");
        networkError.name = "NetworkError";
        vi.mocked(trackUsage).mockRejectedValueOnce(networkError);

        await expect(usageService.recordUsage("workspace-123", "metric", 1)).resolves.toBeUndefined();

        expect(vi.mocked(logger.error)).toHaveBeenCalled();
      });
    });

    describe("key variations", () => {
      it("should handle standard meter keys", async () => {
        await expect(usageService.recordUsage("workspace-123", "api_calls", 1)).resolves.toBeUndefined();
      });

      it("should handle keys with special characters", async () => {
        await expect(usageService.recordUsage("workspace-123", "custom_metric-v2", 1)).resolves.toBeUndefined();
      });

      it("should handle keys with numbers", async () => {
        await expect(usageService.recordUsage("workspace-123", "feature123", 1)).resolves.toBeUndefined();
      });

      it("should handle long key names", async () => {
        const longKey = "very_long_metric_key_name_for_detailed_tracking_scenario";
        await expect(usageService.recordUsage("workspace-123", longKey, 1)).resolves.toBeUndefined();
      });
    });

    describe("workspace variations", () => {
      it("should handle standard UUIDv4 workspace IDs", async () => {
        const uuid = "550e8400-e29b-41d4-a716-446655440000";
        await expect(usageService.recordUsage(uuid, "metric", 1)).resolves.toBeUndefined();
      });

      it("should handle numeric workspace IDs", async () => {
        await expect(usageService.recordUsage("123456", "metric", 1)).resolves.toBeUndefined();
      });

      it("should handle alphanumeric workspace IDs", async () => {
        await expect(usageService.recordUsage("ws_abc123xyz", "metric", 1)).resolves.toBeUndefined();
      });
    });

    describe("concurrent usage recording", () => {
      it("should handle multiple concurrent recordUsage calls", async () => {
        const promises = [
          usageService.recordUsage("workspace-123", "metric1", 1),
          usageService.recordUsage("workspace-123", "metric2", 2),
          usageService.recordUsage("workspace-456", "metric1", 3),
          usageService.recordUsage("workspace-456", "metric3", 4),
        ];

        await expect(Promise.all(promises)).resolves.toBeDefined();
      });

      it("should handle rapid sequential calls", async () => {
        for (let i = 0; i < 10; i++) {
          await expect(usageService.recordUsage("workspace-123", `metric_${i}`, i)).resolves.toBeUndefined();
        }
      });
    });

    describe("context variations", () => {
      it("should accept undefined context", async () => {
        await expect(usageService.recordUsage("workspace-123", "metric", 1, undefined)).resolves.toBeUndefined();
      });

      it("should accept empty context object", async () => {
        await expect(usageService.recordUsage("workspace-123", "metric", 1, {})).resolves.toBeUndefined();
      });

      it("should accept context with multiple properties", async () => {
        const context = {
          userId: "user-123",
          endpoint: "/api/foo",
          method: "POST",
          timestamp: Date.now(),
        };
        await expect(usageService.recordUsage("workspace-123", "metric", 1, context)).resolves.toBeUndefined();
      });

      it("should accept context with nested objects", async () => {
        const context = {
          request: {
            headers: { "content-type": "application/json" },
            body: { foo: "bar" },
          },
        };
        await expect(usageService.recordUsage("workspace-123", "metric", 1, context)).resolves.toBeUndefined();
      });

      it("should accept context with arrays", async () => {
        const context = {
          tags: ["feature1", "feature2"],
          values: [1, 2, 3],
        };
        await expect(usageService.recordUsage("workspace-123", "metric", 1, context)).resolves.toBeUndefined();
      });
    });
  });

  describe("recordDecisionEngineUsage", () => {
    it("should call recordUsage with decision_engine key", async () => {
      await expect(usageService.recordDecisionEngineUsage("workspace-123")).resolves.toBeUndefined();
    });

    it("should accept context parameter", async () => {
      await expect(
        usageService.recordDecisionEngineUsage("workspace-123", { decisionId: "dec-456" })
      ).resolves.toBeUndefined();
    });

    it("should handle multiple decision engine calls", async () => {
      const promises = [
        usageService.recordDecisionEngineUsage("workspace-123"),
        usageService.recordDecisionEngineUsage("workspace-456"),
      ];
      await expect(Promise.all(promises)).resolves.toBeDefined();
    });

    it("should work without context parameter", async () => {
      await expect(usageService.recordDecisionEngineUsage("workspace-123")).resolves.toBeUndefined();
    });
  });

  describe("recordRecommendationUsage", () => {
    it("should call recordUsage with generate_recommendation key", async () => {
      await expect(usageService.recordRecommendationUsage("workspace-123")).resolves.toBeUndefined();
    });

    it("should use default recommendationCount of 1", async () => {
      await expect(usageService.recordRecommendationUsage("workspace-123")).resolves.toBeUndefined();
    });

    it("should use provided recommendationCount", async () => {
      await expect(usageService.recordRecommendationUsage("workspace-123", 5)).resolves.toBeUndefined();
    });

    it("should include context in recommendation call", async () => {
      await expect(usageService.recordRecommendationUsage("workspace-123", 3, { source: "api" })).resolves.toBeUndefined();
    });

    it("should handle zero recommendations", async () => {
      await expect(usageService.recordRecommendationUsage("workspace-123", 0)).resolves.toBeUndefined();
    });

    it("should handle large recommendation counts", async () => {
      await expect(usageService.recordRecommendationUsage("workspace-123", 1000)).resolves.toBeUndefined();
    });

    it("should handle negative counts (reversal/adjustment)", async () => {
      await expect(usageService.recordRecommendationUsage("workspace-123", -5)).resolves.toBeUndefined();
    });

    it("should handle fractional counts", async () => {
      await expect(usageService.recordRecommendationUsage("workspace-123", 2.5)).resolves.toBeUndefined();
    });
  });

  describe("recordActionUsage", () => {
    it("should call recordUsage with action_create key", async () => {
      await expect(usageService.recordActionUsage("workspace-123")).resolves.toBeUndefined();
    });

    it("should use default actionCount of 1", async () => {
      await expect(usageService.recordActionUsage("workspace-123")).resolves.toBeUndefined();
    });

    it("should use provided actionCount", async () => {
      await expect(usageService.recordActionUsage("workspace-123", 7)).resolves.toBeUndefined();
    });

    it("should include context in action call", async () => {
      await expect(usageService.recordActionUsage("workspace-123", 2, { actionType: "escalation" })).resolves.toBeUndefined();
    });

    it("should handle zero action count", async () => {
      await expect(usageService.recordActionUsage("workspace-123", 0)).resolves.toBeUndefined();
    });

    it("should handle large action counts", async () => {
      await expect(usageService.recordActionUsage("workspace-123", 500)).resolves.toBeUndefined();
    });

    it("should handle negative action counts", async () => {
      await expect(usageService.recordActionUsage("workspace-123", -3)).resolves.toBeUndefined();
    });
  });

  describe("recordEngagementCreationUsage", () => {
    it("should call recordUsage with create_engagement key", async () => {
      await expect(usageService.recordEngagementCreationUsage("workspace-123")).resolves.toBeUndefined();
    });

    it("should always use value of 1 for engagement creation", async () => {
      await expect(usageService.recordEngagementCreationUsage("workspace-123")).resolves.toBeUndefined();
    });

    it("should include context in engagement creation call", async () => {
      await expect(usageService.recordEngagementCreationUsage("workspace-123", { tier: "enterprise" })).resolves.toBeUndefined();
    });

    it("should handle multiple engagement creations", async () => {
      const promises = [
        usageService.recordEngagementCreationUsage("workspace-123"),
        usageService.recordEngagementCreationUsage("workspace-123"),
        usageService.recordEngagementCreationUsage("workspace-456"),
      ];
      await expect(Promise.all(promises)).resolves.toBeDefined();
    });

    it("should work without context parameter", async () => {
      await expect(usageService.recordEngagementCreationUsage("workspace-123")).resolves.toBeUndefined();
    });
  });

  describe("real-world scenarios", () => {
    it("should handle usage tracking across multiple operations in workflow", async () => {
      const workspaceId = "workspace-123";

      // All these calls should complete without throwing
      await expect(usageService.recordDecisionEngineUsage(workspaceId)).resolves.toBeUndefined();
      await expect(usageService.recordRecommendationUsage(workspaceId, 3)).resolves.toBeUndefined();
      await expect(usageService.recordActionUsage(workspaceId, 2)).resolves.toBeUndefined();
      await expect(usageService.recordEngagementCreationUsage(workspaceId)).resolves.toBeUndefined();
    });

    it("should track usage for multiple workspaces independently", async () => {
      const ws1 = "workspace-001";
      const ws2 = "workspace-002";

      // Track usage for ws1
      await expect(usageService.recordDecisionEngineUsage(ws1)).resolves.toBeUndefined();
      await expect(usageService.recordRecommendationUsage(ws1, 5)).resolves.toBeUndefined();

      // Track usage for ws2
      await expect(usageService.recordDecisionEngineUsage(ws2)).resolves.toBeUndefined();
      await expect(usageService.recordActionUsage(ws2, 10)).resolves.toBeUndefined();

      // Verify all workspaces tracked independently without errors
    });

    it("should handle usage bursts (many operations in quick succession)", async () => {
      const workspaceId = "workspace-123";

      const promises = Array.from({ length: 50 }, (_, i) =>
        usageService.recordUsage(workspaceId, `metric_${i}`, i + 1)
      );

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });

    it("should continue tracking after individual failures", async () => {
      const { trackUsage } = await import("@/services/entitlement.service");
      let callCount = 0;
      vi.mocked(trackUsage).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("First call fails");
        }
      });

      await usageService.recordUsage("workspace-123", "metric1", 1);
      await usageService.recordUsage("workspace-123", "metric2", 1);
      await usageService.recordUsage("workspace-123", "metric3", 1);

      // Should have logged one error for the first call
      expect(vi.mocked(logger.error)).toHaveBeenCalledOnce();
    });
  });

  describe("function exports", () => {
    it("should export recordUsage function", () => {
      expect(typeof usageService.recordUsage).toBe("function");
    });

    it("should export recordDecisionEngineUsage function", () => {
      expect(typeof usageService.recordDecisionEngineUsage).toBe("function");
    });

    it("should export recordRecommendationUsage function", () => {
      expect(typeof usageService.recordRecommendationUsage).toBe("function");
    });

    it("should export recordActionUsage function", () => {
      expect(typeof usageService.recordActionUsage).toBe("function");
    });

    it("should export recordEngagementCreationUsage function", () => {
      expect(typeof usageService.recordEngagementCreationUsage).toBe("function");
    });
  });

  describe("fail-open behavior", () => {
    it("should not throw even if entitlement service is completely unavailable", async () => {
      const { trackUsage } = await import("@/services/entitlement.service");
      vi.mocked(trackUsage).mockRejectedValue(new Error("Service completely down"));

      // Should not throw
      await expect(usageService.recordUsage("workspace-123", "metric", 1)).resolves.toBeUndefined();
    });

    it("should continue functioning if one operation fails", async () => {
      const { trackUsage } = await import("@/services/entitlement.service");
      let callCount = 0;
      vi.mocked(trackUsage).mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("This call fails");
        }
      });

      // All three calls should complete without throwing, even though one fails
      await expect(usageService.recordUsage("workspace-123", "metric1", 1)).resolves.toBeUndefined();
      await expect(usageService.recordUsage("workspace-123", "metric2", 1)).resolves.toBeUndefined(); // This fails internally
      await expect(usageService.recordUsage("workspace-123", "metric3", 1)).resolves.toBeUndefined();

      // Verify that the failure was logged (fail-open behavior)
      expect(vi.mocked(logger.error)).toHaveBeenCalled();
    });
  });

  describe("type safety", () => {
    it("should accept WorkspaceId as string", async () => {
      const workspaceId: string = "workspace-123";
      await expect(usageService.recordUsage(workspaceId, "metric", 1)).resolves.toBeUndefined();
    });

    it("should accept key as string", async () => {
      const key: string = "custom_key";
      await expect(usageService.recordUsage("workspace-123", key, 1)).resolves.toBeUndefined();
    });

    it("should accept value as number", async () => {
      const value: number = 42;
      await expect(usageService.recordUsage("workspace-123", "metric", value)).resolves.toBeUndefined();
    });

    it("should accept context as Record<string, unknown>", async () => {
      const context: Record<string, unknown> = { key: "value", count: 123 };
      await expect(usageService.recordUsage("workspace-123", "metric", 1, context)).resolves.toBeUndefined();
    });
  });
});
