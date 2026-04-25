import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "./idempotency";

vi.mock("@/lib/db", () => ({
  db: {
    idempotencyRecord: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe("Idempotency Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkIdempotencyKey", () => {
    it("creates new idempotency record for first request", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.idempotencyRecord.findUnique.mockResolvedValue(null);
      mockDb.idempotencyRecord.create.mockResolvedValue({
        id: "idem-1",
        idempotencyKey: "key-1",
        operationName: "createEngagement",
        status: "pending",
        expiresAt: new Date(),
      });

      const result = await checkIdempotencyKey({
        idempotencyKey: "key-1",
        operationName: "createEngagement",
        actorId: "user-1",
        payload: { title: "Test" },
      });

      expect(result.isNew).toBe(true);
      expect(mockDb.idempotencyRecord.create).toHaveBeenCalled();
    });

    it("returns cached response for duplicate request", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.idempotencyRecord.findUnique.mockResolvedValue({
        id: "idem-1",
        idempotencyKey: "key-1",
        operationName: "createEngagement",
        status: "completed",
        responseCode: 201,
        responseBody: { id: "eng-1", title: "Test" },
        expiresAt: new Date(Date.now() + 3600000),
      });

      const result = await checkIdempotencyKey({
        idempotencyKey: "key-1",
        operationName: "createEngagement",
        actorId: "user-1",
        payload: { title: "Test" },
      });

      expect(result.isNew).toBe(false);
      expect(result.cachedResponse).toEqual({
        status: 201,
        body: { id: "eng-1", title: "Test" },
      });
    });

    it("rejects request if key reused for different operation", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.idempotencyRecord.findUnique.mockResolvedValue({
        id: "idem-1",
        idempotencyKey: "key-1",
        operationName: "createEngagement",
        status: "completed",
        expiresAt: new Date(Date.now() + 3600000),
      });

      try {
        await checkIdempotencyKey({
          idempotencyKey: "key-1",
          operationName: "updateEngagement",
          actorId: "user-1",
          payload: { title: "Updated" },
        });
        expect.fail("Should throw ValidationError");
      } catch (error: any) {
        expect(error.message).toContain("Idempotency key reused");
      }
    });

    it("rejects duplicate request in flight", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.idempotencyRecord.findUnique.mockResolvedValue({
        id: "idem-1",
        idempotencyKey: "key-1",
        operationName: "createEngagement",
        status: "pending",
        expiresAt: new Date(Date.now() + 3600000),
      });

      try {
        await checkIdempotencyKey({
          idempotencyKey: "key-1",
          operationName: "createEngagement",
          actorId: "user-1",
          payload: { title: "Test" },
        });
        expect.fail("Should throw ValidationError");
      } catch (error: any) {
        expect(error.message).toContain("Duplicate request in flight");
      }
    });

    it("cleans up expired records and treats as new request", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      const createMock = vi.fn().mockResolvedValue({
        id: "idem-2",
        idempotencyKey: "key-1",
        operationName: "createEngagement",
        status: "pending",
        expiresAt: new Date(Date.now() + 3600000),
      });

      mockDb.idempotencyRecord.findUnique.mockResolvedValue({
        id: "idem-1",
        idempotencyKey: "key-1",
        operationName: "createEngagement",
        status: "completed",
        expiresAt: new Date(Date.now() - 3600000), // Expired
        responseBody: { id: "eng-1" },
      });

      mockDb.idempotencyRecord.create = createMock;

      const result = await checkIdempotencyKey({
        idempotencyKey: "key-1",
        operationName: "createEngagement",
        actorId: "user-1",
        payload: { title: "Test" },
      });

      expect(result.isNew).toBe(true);
      expect(mockDb.idempotencyRecord.delete).toHaveBeenCalled();
      expect(createMock).toHaveBeenCalled();
    });

    it("allows retry of failed request with same key", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.idempotencyRecord.findUnique.mockResolvedValue({
        id: "idem-1",
        idempotencyKey: "key-1",
        operationName: "createEngagement",
        status: "failed",
        expiresAt: new Date(Date.now() + 3600000),
      });

      const result = await checkIdempotencyKey({
        idempotencyKey: "key-1",
        operationName: "createEngagement",
        actorId: "user-1",
        payload: { title: "Test" },
      });

      expect(result.isNew).toBe(true);
    });
  });

  describe("recordIdempotencyResponse", () => {
    it("records completed response", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.idempotencyRecord.update.mockResolvedValue({
        id: "idem-1",
        idempotencyKey: "key-1",
        status: "completed",
        responseCode: 201,
        responseBody: { id: "eng-1" },
        completedAt: new Date(),
      });

      await recordIdempotencyResponse("key-1", 201, { id: "eng-1", title: "Test" });

      expect(mockDb.idempotencyRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { idempotencyKey: "key-1" },
          data: expect.objectContaining({
            status: "completed",
            responseCode: 201,
          }),
        })
      );
    });
  });

  describe("recordIdempotencyError", () => {
    it("records failed response with error message", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.idempotencyRecord.update.mockResolvedValue({
        id: "idem-1",
        idempotencyKey: "key-1",
        status: "failed",
        responseBody: { error: "NotFoundError" },
      });

      await recordIdempotencyError("key-1", new Error("NotFoundError"));

      expect(mockDb.idempotencyRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { idempotencyKey: "key-1" },
          data: expect.objectContaining({
            status: "failed",
          }),
        })
      );
    });
  });
});
