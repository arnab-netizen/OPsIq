import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { createMutationResponse, createListResponse, queryAuditEvents } from "@/lib/response-formatter";
import { ValidationError } from "@/infra/errors";
import { z } from "zod/v4";

vi.mock("@/lib/db", () => ({
  db: {
    auditEvent: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "event-1",
          eventName: "action.created",
          actorId: "actor-1",
          entityType: "action",
          entityId: "action-1",
          payload: '{"title":"Test"}',
          correlationId: "corr-1",
          occurredAt: new Date(),
        },
      ]),
      count: vi.fn().mockResolvedValue(1),
    },
  },
}));

describe("Phase 8: API Hardening + Audit Surface", () => {
  describe("1. Request Validation", () => {
    it("should reject unknown fields in request body", async () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ name: "John", age: 30, unknownField: "test" }),
      });

      await expect(async () => {
        await parseRequestBody(request, schema);
      }).rejects.toThrow(ValidationError);
    });

    it("should accept valid request body with no unknown fields", async () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ name: "John", age: 30 }),
      });

      const result = await parseRequestBody(request, schema);
      await expect(result).toEqual({ name: "John", age: 30 });
    });

    it("should enforce enum validation", async () => {
      const schema = z.object({ status: z.enum(["active", "inactive"]) });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ status: "invalid" }),
      });

      await expect(async () => {
        await parseRequestBody(request, schema);
      }).rejects.toThrow(ValidationError);
    });

    it("should reject invalid JSON", async () => {
      const schema = z.object({ name: z.string() });
      const request = new Request("http://localhost", {
        method: "POST",
        body: "invalid json",
      });

      await expect(async () => {
        await parseRequestBody(request, schema);
      }).rejects.toThrow(ValidationError);
    });
  });

  describe("2. Error System", () => {
    it("should format validation errors consistently", async () => {
      const schema = z.object({ name: z.string().min(1) });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      });

      try {
        await parseRequestBody(request, schema);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const appError = error as ValidationError;
        expect(appError.code).toBe("VALIDATION_ERROR");
        expect(appError.statusCode).toBe(400);
        expect(appError.toJSON()).toHaveProperty("error.code");
        expect(appError.toJSON()).toHaveProperty("error.message");
      }
    });

    it("should include error details in response", async () => {
      const error = new ValidationError("Test error", {
        field: "email",
        reason: "invalid format",
      });
      const json = error.toJSON();
      expect(json.error.details).toEqual({
        field: "email",
        reason: "invalid format",
      });
    });
  });

  describe("3. Audit Read API", () => {
    it("should support filtering by engagementId", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      const result = await queryAuditEvents({
        engagementId: "eng-1",
        limit: 50,
        offset: 0,
      });

      expect(mockDb.auditEvent.findMany).toHaveBeenCalled();
      expect(result.events).toBeDefined();
      expect(result.total).toBeDefined();
    });

    it("should support filtering by entityType", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      await queryAuditEvents({
        entityType: "action",
        limit: 50,
        offset: 0,
      });

      expect(mockDb.auditEvent.findMany).toHaveBeenCalled();
    });

    it("should support filtering by eventName", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      await queryAuditEvents({
        eventName: "action.created",
        limit: 50,
        offset: 0,
      });

      expect(mockDb.auditEvent.findMany).toHaveBeenCalled();
    });

    it("should support date range filtering", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      await queryAuditEvents({
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-12-31T23:59:59Z",
        limit: 50,
        offset: 0,
      });

      expect(mockDb.auditEvent.findMany).toHaveBeenCalled();
    });

    it("should format audit event responses correctly", async () => {
      const result = await queryAuditEvents({ limit: 50, offset: 0 });

      expect(result.events[0]).toHaveProperty("id");
      expect(result.events[0]).toHaveProperty("eventName");
      expect(result.events[0]).toHaveProperty("actorId");
      expect(result.events[0]).toHaveProperty("entityType");
      expect(result.events[0]).toHaveProperty("entityId");
      expect(result.events[0]).toHaveProperty("payload");
      expect(result.events[0]).toHaveProperty("occurredAt");
    });
  });

  describe("4. Response Guarantees", () => {
    it("should format mutation responses with required fields", async () => {
      const data = { id: "action-1", version: 2, name: "Test" };
      const response = await createMutationResponse(data, "event-1");

      expect(response).toHaveProperty("data");
      expect(response).toHaveProperty("meta");
      expect(response.meta).toHaveProperty("id", "action-1");
      expect(response.meta).toHaveProperty("version", 2);
      expect(response.meta).toHaveProperty("timestamp");
      expect(response.meta).toHaveProperty("auditEventId", "event-1");
    });

    it("should include timestamp in ISO format", async () => {
      const data = { id: "action-1", version: 1 };
      const response = await createMutationResponse(data, "event-1");

      expect(response.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should expose idempotencyKey when provided", async () => {
      const data = { id: "action-1", version: 1 };
      const response = await createMutationResponse(data, "event-1", "key-123");

      expect(response.meta.idempotencyKey).toBe("key-123");
    });

    it("should expose replay flag when provided", async () => {
      const data = { id: "action-1", version: 1 };
      const response = await createMutationResponse(data, "event-1", "key-123", true);

      expect(response.meta.replay).toBe(true);
    });
  });

  describe("5. Pagination", () => {
    it("should enforce max limit of 100", () => {
      const schema = z.object({
        limit: z.coerce.number().int().min(1).max(100).default(25),
        offset: z.coerce.number().int().min(0).default(0),
      });

      const url = "http://localhost?limit=200&offset=0";
      expect(() => {
        parseSearchParams(url, schema);
      }).toThrow();
    });

    it("should reject negative offset", () => {
      const schema = z.object({
        limit: z.coerce.number().int().min(1).max(100).default(25),
        offset: z.coerce.number().int().min(0).default(0),
      });

      const url = "http://localhost?limit=25&offset=-1";
      expect(() => {
        parseSearchParams(url, schema);
      }).toThrow();
    });

    it("should provide pagination metadata in list responses", () => {
      const items = [{ id: "1" }, { id: "2" }];
      const response = createListResponse(items, 25, 0, 100);

      expect(response.pagination).toEqual({
        limit: 25,
        offset: 0,
        total: 100,
        hasMore: true,
      });
    });

    it("should calculate hasMore correctly", () => {
      const items = [{ id: "1" }, { id: "2" }];
      const response = createListResponse(items, 25, 75, 100);

      expect(response.pagination.hasMore).toBe(false);
    });
  });

  describe("6. Idempotency Exposure", () => {
    it("should include idempotencyKey in mutation response", async () => {
      const data = { id: "kpi-1", version: 3 };
      const response = await createMutationResponse(data, "event-1", "idem-key-123");

      expect(response.meta.idempotencyKey).toBe("idem-key-123");
    });

    it("should indicate replay in response", async () => {
      const data = { id: "kpi-1", version: 3 };
      const response = await createMutationResponse(data, "event-1", "idem-key-123", true);

      expect(response.meta.replay).toBe(true);
    });

    it("should not include replay flag when false", async () => {
      const data = { id: "kpi-1", version: 3 };
      const response = await createMutationResponse(data, "event-1", "idem-key-123", false);

      expect(response.meta).not.toHaveProperty("replay");
    });
  });

  describe("7. Audit Query Response Format", () => {
    it("should format audit response with pagination", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.auditEvent.count).mockResolvedValue(5);

      const result = await queryAuditEvents({ limit: 25, offset: 0 });

      expect(result).toHaveProperty("events");
      expect(result).toHaveProperty("total", 5);
    });

    it("should parse JSON payload in audit events", async () => {
      const result = await queryAuditEvents({ limit: 50, offset: 0 });

      expect(typeof result.events[0].payload).toBe("object");
      expect(result.events[0].payload).toHaveProperty("title");
    });

    it("should format createdAt as ISO string", async () => {
      const result = await queryAuditEvents({ limit: 50, offset: 0 });

      expect(result.events[0].occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("8. Comprehensive Coverage", () => {
    it("should have strict validation enabled by default", async () => {
      const schema = z.object({ name: z.string() });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ name: "test", extra: "field" }),
      });

      await expect(async () => {
        await parseRequestBody(request, schema);
      }).rejects.toThrow(ValidationError);
    });

    it("should return consistent error format", async () => {
      const schema = z.object({ count: z.number() });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ count: "not a number" }),
      });

      try {
        await parseRequestBody(request, schema);
        expect.fail("Should have thrown");
      } catch (error) {
        const appError = error as ValidationError;
        const json = appError.toJSON();
        expect(json).toHaveProperty("error.code");
        expect(json).toHaveProperty("error.message");
      }
    });

    it("should enforce all pagination constraints", () => {
      const url = "http://localhost?limit=0&offset=0";
      const schema = z.object({
        limit: z.coerce.number().int().min(1).max(100).default(25),
        offset: z.coerce.number().int().min(0).default(0),
      });

      expect(() => {
        parseSearchParams(url, schema);
      }).toThrow();
    });

    it("should support all audit query filters", async () => {
      const filters = {
        engagementId: "eng-1",
        entityType: "action",
        entityId: "action-1",
        eventName: "action.created",
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-12-31T23:59:59Z",
        limit: 50,
        offset: 0,
      };

      const result = await queryAuditEvents(filters);

      expect(result).toBeDefined();
      expect(result.events).toBeInstanceOf(Array);
      expect(result.total).toBeGreaterThanOrEqual(0);
    });
  });
});
