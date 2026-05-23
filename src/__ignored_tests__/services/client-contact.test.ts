import { describe, it, expect, beforeEach, vi } from "vitest";
import * as contactService from "./client-contact";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { NotFoundError } from "@/infra/errors";

vi.mock("@/lib/db");
vi.mock("@/infra/audit");
vi.mock("@/infra/logger");

const mockUserId = "user-123";
const mockClientId = "client-123";
const mockContactId = "contact-123";
const mockWorkspaceId = "workspace-123";
const mockAuthContext = {
  session: {
    user: { id: mockUserId, email: "user@test.com", name: "Test", isActive: true },
    sessionId: "session-123",
    expiresAt: new Date(),
  },
  policy: { userId: mockUserId, roles: [] },
};

describe("client-contact service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createContact", () => {
    it("creates contact with required fields", async () => {
      const input = {
        clientId: mockClientId,
        name: "John Doe",
        email: "john@example.com",
      };

      const mockDb = db as unknown;
      mockDb.clientAccount = {
        findUnique: vi.fn().mockResolvedValue({ id: mockClientId }),
      };
      mockDb.clientContact = {
        create: vi.fn().mockResolvedValue({
          id: mockContactId,
          ...input,
        }),
      };

      vi.mocked(emitAuditEvent).mockResolvedValue("event-id");

      const result = await contactService.createContact(input, mockAuthContext as unknown, mockWorkspaceId);

      expect(result.id).toBe(mockContactId);
      expect(emitAuditEvent).toHaveBeenCalled();
    });

    it("throws when client not found", async () => {
      const input = {
        clientId: mockClientId,
        name: "John Doe",
      };

      const mockDb = db as unknown;
      mockDb.clientAccount = {
        findUnique: vi.fn().mockResolvedValue(null),
      };

      await expect(
        contactService.createContact(input, mockAuthContext as unknown, mockWorkspaceId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getContactsForClient", () => {
    it("returns active contacts ordered by primary then recency", async () => {
      const mockDb = db as unknown;
      mockDb.clientContact = {
        findMany: vi.fn().mockResolvedValue([
          { id: "c1", isPrimary: true },
          { id: "c2", isPrimary: false },
        ]),
      };

      const result = await contactService.getContactsForClient(mockClientId);

      expect(result).toHaveLength(2);
      // Verify query filters by isActive
      expect(mockDb.clientContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        })
      );
    });

    it("returns empty when no contacts", async () => {
      const mockDb = db as unknown;
      mockDb.clientContact = {
        findMany: vi.fn().mockResolvedValue([]),
      };

      const result = await contactService.getContactsForClient(mockClientId);

      expect(result).toEqual([]);
    });
  });
});
