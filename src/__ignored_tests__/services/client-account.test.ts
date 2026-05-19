import { describe, it, expect, beforeEach, vi } from "vitest";
import * as clientService from "./client-account";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { NotFoundError, ValidationError } from "@/infra/errors";
import type { AuthContext } from "@/lib/auth-guard";

vi.mock("@/lib/db");
vi.mock("@/infra/audit");
vi.mock("@/infra/logger");

const mockUserId = "user-123";
const mockClientId = "client-123";

function createMockAuthContext(userId: string = mockUserId): AuthContext {
  return {
    session: {
      user: {
        id: userId,
        email: "test@example.com",
        name: "Test User",
        isActive: true,
      },
      sessionId: "session-123",
      expiresAt: new Date(Date.now() + 86400000),
    },
    policy: {
      userId,
      roles: [{ role: "admin" as const }],
    },
  };
}

describe("client-account service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createClient", () => {
    it("creates client and emits audit event", async () => {
      const input = { name: "Test Corp" };

      const mockDb = db as any;
      mockDb.clientAccount = {
        create: vi.fn().mockResolvedValue({
          id: mockClientId,
          name: input.name,
        }),
      };
      mockDb.idempotencyRecord = {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      };

      vi.mocked(emitAuditEvent).mockResolvedValue("event-id");

      const result = await clientService.createClient(input, createMockAuthContext(mockUserId), '550e8400-e29b-41d4-a716-446655440000');

      expect(result.id).toBe(mockClientId);
      expect(emitAuditEvent).toHaveBeenCalled();
    });
  });

  describe("updateClient", () => {
    it("updates client and emits event", async () => {
      const mockDb = db as any;
      mockDb.clientAccount = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockClientId,
          status: "active",
          version: 1,
        }),
        update: vi.fn().mockResolvedValue({
          id: mockClientId,
          name: "New Name",
        }),
      };

      vi.mocked(emitAuditEvent).mockResolvedValue("event-id");

      await clientService.updateClient(
        mockClientId,
        { name: "New Name", version: 1 },
        createMockAuthContext(mockUserId),
        "550e8400-e29b-41d4-a716-446655440000"
      );

      expect(emitAuditEvent).toHaveBeenCalled();
    });

    it("throws when updating archived client", async () => {
      const mockDb = db as any;
      mockDb.clientAccount = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockClientId,
          status: "archived",
        }),
      };

      await expect(
        clientService.updateClient(
          mockClientId,
          { name: "New Name", version: 1 },
          createMockAuthContext(mockUserId),
          "550e8400-e29b-41d4-a716-446655440000"
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("archiveClient", () => {
    it("archives active client", async () => {
      const mockDb = db as any;
      mockDb.clientAccount = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockClientId,
          status: "active",
        }),
        update: vi.fn().mockResolvedValue({
          id: mockClientId,
          status: "archived",
        }),
      };

      vi.mocked(emitAuditEvent).mockResolvedValue("event-id");

      await clientService.archiveClient(mockClientId, createMockAuthContext(mockUserId), 1, "550e8400-e29b-41d4-a716-446655440000");

      expect(emitAuditEvent).toHaveBeenCalled();
    });
  });

  describe("getClientById", () => {
    it("returns client with data", async () => {
      const mockDb = db as any;
      mockDb.clientAccount = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockClientId,
          name: "Test Corp",
          visibility: "internal",
          contacts: [],
          _count: { engagements: 0 },
        }),
      };

      const result = await clientService.getClientById(mockClientId, '550e8400-e29b-41d4-a716-446655440000', true);

      expect(result.id).toBe(mockClientId);
    });
  });

  describe("listClients", () => {
    it("returns paginated clients", async () => {
      const mockDb = db as any;
      mockDb.clientAccount = {
        findMany: vi.fn().mockResolvedValue([
          { id: "c1", name: "Client 1" },
        ]),
        count: vi.fn().mockResolvedValue(1),
      };

      const result = await clientService.listClients('550e8400-e29b-41d4-a716-446655440000', {});

      expect(result.clients).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
