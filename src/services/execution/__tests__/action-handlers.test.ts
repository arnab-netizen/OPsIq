import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock logger before importing handlers
vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

import { triggerAction } from "../action-handlers";
import { logger } from "@/infra/logger";

describe("Action Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("triggerAction", () => {
    it("should return null if no actionType provided", async () => {
      const result = await triggerAction(
        "d1",
        "ws-123",
        null,
        { email: "test@example.com" },
        "user-001"
      );

      expect(result).toBeNull();
    });

    it("should return null if no actionPayload provided", async () => {
      const result = await triggerAction("d1", "ws-123", "email", null, "user-001");

      expect(result).toBeNull();
    });

    it("should handle unknown action type gracefully", async () => {
      const result = await triggerAction(
        "d1",
        "ws-123",
        "unknown" as any,
        { email: "test@example.com" },
        "user-001"
      );

      expect(result).toBeNull();
    });
  });

  describe("Email Action Handler", () => {
    it("should trigger email action successfully", async () => {
      const result = await triggerAction("d1", "ws-123", "email", {
        email: "user@example.com",
        subject: "Decision Executed",
        body: "Your decision has been executed",
      }, "user-001");

      expect(result?.success).toBe(true);
      expect(result?.actionType).toBe("email");
      expect(result?.message).toContain("user@example.com");
      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Email action triggered (stub)",
        expect.objectContaining({
          to: "user@example.com",
        })
      );
    });

    it("should fail if email address is missing", async () => {
      const result = await triggerAction("d1", "ws-123", "email", {
        subject: "Test",
      }, "user-001");

      expect(result?.success).toBe(false);
      expect(result?.error).toContain("Missing email");
    });

    it("should use default subject and body if not provided", async () => {
      await triggerAction("d1", "ws-123", "email", {
        email: "user@example.com",
      }, "user-001");

      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Email action triggered (stub)",
        expect.objectContaining({
          subject: "Decision Execution Notification",
          body: "Decision d1 has been executed.",
        })
      );
    });

    it("should log action success in audit", async () => {
      await triggerAction("d1", "ws-123", "email", {
        email: "user@example.com",
      }, "user-001");

      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Action triggered successfully",
        expect.objectContaining({
          actionType: "email",
          decisionId: "d1",
        })
      );
    });
  });

  describe("Webhook Action Handler", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    it("should trigger webhook successfully", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as any);

      const result = await triggerAction("d1", "ws-123", "webhook", {
        url: "https://example.com/hook",
        method: "POST",
      }, "user-001");

      expect(result?.success).toBe(true);
      expect(result?.actionType).toBe("webhook");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/hook",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("should fail if webhook URL is missing", async () => {
      const result = await triggerAction("d1", "ws-123", "webhook", {
        method: "POST",
      }, "user-001");

      expect(result?.success).toBe(false);
      expect(result?.error).toContain("Missing webhook URL");
    });

    it("should use POST as default method", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as any);

      await triggerAction("d1", "ws-123", "webhook", {
        url: "https://example.com/hook",
      }, "user-001");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("should send default payload if body not provided", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      vi.stubGlobal("fetch", mockFetch);

      await triggerAction("d1", "ws-123", "webhook", {
        url: "https://example.com/hook",
      }, "user-001");

      const callArg = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArg.body);
      expect(body).toEqual(
        expect.objectContaining({
          decisionId: "d1",
          workspaceId: "ws-123",
        })
      );
    });

    it("should send custom body if provided", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      vi.stubGlobal("fetch", mockFetch);

      await triggerAction("d1", "ws-123", "webhook", {
        url: "https://example.com/hook",
        body: { custom: "data" },
      }, "user-001");

      const callArg = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArg.body);
      expect(body).toEqual({ custom: "data" });
    });

    it("should handle webhook errors", async () => {
      const mockFetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetch);

      const result = await triggerAction("d1", "ws-123", "webhook", {
        url: "https://example.com/hook",
      }, "user-001");

      expect(result?.success).toBe(false);
      expect(result?.error).toContain("Network error");
    });

    it("should fail on non-OK HTTP response", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as any);

      const result = await triggerAction("d1", "ws-123", "webhook", {
        url: "https://example.com/hook",
      }, "user-001");

      expect(result?.success).toBe(false);
      expect(result?.error).toContain("500");
    });

    it("should include custom headers", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as any);

      await triggerAction("d1", "ws-123", "webhook", {
        url: "https://example.com/hook",
        headers: { Authorization: "Bearer token123" },
      }, "user-001");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer token123",
          }),
        })
      );
    });
  });

  describe("Task Action Handler", () => {
    it("should trigger task action successfully", async () => {
      const result = await triggerAction("d1", "ws-123", "task", {
        title: "Follow up on decision",
        description: "Check execution results",
        assignedTo: "user-002",
      }, "user-001");

      expect(result?.success).toBe(true);
      expect(result?.actionType).toBe("task");
      expect(result?.message).toContain("Follow up on decision");
      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Task action triggered",
        expect.objectContaining({
          title: "Follow up on decision",
        })
      );
    });

    it("should fail if task title is missing", async () => {
      const result = await triggerAction("d1", "ws-123", "task", {
        description: "Test",
      }, "user-001");

      expect(result?.success).toBe(false);
      expect(result?.error).toContain("Missing task title");
    });

    it("should include decision reference in task", async () => {
      await triggerAction("d1", "ws-123", "task", {
        title: "Follow up",
      }, "user-001");

      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Task action triggered",
        expect.objectContaining({
          relatedDecision: "d1",
          workspaceId: "ws-123",
          createdBy: "user-001",
        })
      );
    });
  });

  describe("Action Failure Handling (Fail-Safe)", () => {
    it("should catch unexpected errors and return failure result", async () => {
      // Force an error by passing invalid payload (missing email)
      const result = await triggerAction("d1", "ws-123", "email", {
        email: null as any,
      }, "user-001");

      expect(result?.success).toBe(false);
      expect(result?.error).toContain("Missing email");
    });

    it("should log warning when action fails", async () => {
      const result = await triggerAction("d1", "ws-123", "email", {
        // Missing required email field
      }, "user-001");

      if (!result?.success) {
        expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
          "Action trigger failed",
          expect.any(Object)
        );
      }
    });

    it("should include error details in audit logs", async () => {
      await triggerAction("d1", "ws-123", "email", {}, "user-001");

      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        "Action trigger failed",
        expect.objectContaining({
          actionType: "email",
          decisionId: "d1",
        })
      );
    });
  });

  describe("Action Logging", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as any));
    });

    it("should log successful action trigger", async () => {
      await triggerAction("d1", "ws-123", "email", {
        email: "test@example.com",
      }, "user-001");

      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Action triggered successfully",
        expect.objectContaining({
          actionType: "email",
          workspaceId: "ws-123",
        })
      );
    });

    it("should include workspace in all action logs", async () => {
      await triggerAction("d1", "ws-123", "webhook", {
        url: "https://example.com/hook",
      }, "user-001");

      const calls = vi.mocked(logger.info).mock.calls;
      expect(calls.some((call) =>
        JSON.stringify(call).includes("ws-123")
      )).toBe(true);
    });
  });
});
