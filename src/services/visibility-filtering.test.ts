import { describe, it, expect, beforeEach, vi } from "vitest";
import * as clientService from "./client-account";
import * as engagementService from "./engagement";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";

vi.mock("@/lib/db");
vi.mock("@/infra/audit");
vi.mock("@/infra/logger");

const mockClientId = "client-123";
const mockEngagementId = "eng-123";
const mockWorkspaceId = "550e8400-e29b-41d4-a716-446655440000";

describe("visibility filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("client visibility filtering", () => {
    it("internal user sees internal clients in list", async () => {
      const mockDb = db as any;
      mockDb.clientAccount = {
        findMany: vi.fn().mockResolvedValue([
          { id: "c1", visibility: "internal", name: "Internal Client" },
        ]),
        count: vi.fn().mockResolvedValue(1),
      };

      const result = await clientService.listClients(mockWorkspaceId, {}, true);

      expect(mockDb.clientAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            visibility: { in: ["internal", "client_visible"] },
          }),
        })
      );
      expect(result.clients).toHaveLength(1);
    });

    it("client user only sees client_visible clients in list", async () => {
      const mockDb = db as any;
      mockDb.clientAccount = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      };

      await clientService.listClients(mockWorkspaceId, {}, false);

      expect(mockDb.clientAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            visibility: "client_visible",
          }),
        })
      );
    });

    it("internal user can get internal client by id", async () => {
      const mockDb = db as any;
      mockDb.clientAccount = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockClientId,
          visibility: "internal",
          contacts: [],
          _count: { engagements: 0 },
        }),
      };

      const result = await clientService.getClientById(mockClientId, mockWorkspaceId, true);

      expect(result.id).toBe(mockClientId);
    });

    it("client user cannot get internal client by id", async () => {
      const mockDb = db as any;
      mockDb.clientAccount = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockClientId,
          visibility: "internal",
          contacts: [],
          _count: { engagements: 0 },
        }),
      };

      await expect(
        clientService.getClientById(mockClientId, mockWorkspaceId, false)
      ).rejects.toThrow(NotFoundError);
    });

    it("client user can get client_visible client by id", async () => {
      const mockDb = db as any;
      mockDb.clientAccount = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockClientId,
          visibility: "client_visible",
          contacts: [],
          _count: { engagements: 0 },
        }),
      };

      const result = await clientService.getClientById(mockClientId, mockWorkspaceId, false);

      expect(result.id).toBe(mockClientId);
    });
  });

  describe("engagement visibility filtering", () => {
    it("internal user sees internal engagements in list", async () => {
      const mockDb = db as any;
      mockDb.engagement = {
        findMany: vi.fn().mockResolvedValue([
          { id: "e1", visibility: "internal", code: "INT-001" },
        ]),
        count: vi.fn().mockResolvedValue(1),
      };

      const result = await engagementService.listEngagements(mockWorkspaceId, {}, true);

      expect(mockDb.engagement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            visibility: { in: ["internal", "client_visible"] },
          }),
        })
      );
      expect(result.engagements).toHaveLength(1);
    });

    it("client user only sees client_visible engagements in list", async () => {
      const mockDb = db as any;
      mockDb.engagement = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      };

      await engagementService.listEngagements(mockWorkspaceId, {}, false);

      expect(mockDb.engagement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            visibility: "client_visible",
          }),
        })
      );
    });

    it("internal user can get internal engagement by id", async () => {
      const mockDb = db as any;
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          visibility: "internal",
          client: { id: "c1", name: "Client 1" },
          parent: null,
          children: [],
          conditionProfiles: [],
          memberships: [],
          _count: { leads: 0 },
        }),
      };

      const result = await engagementService.getEngagementById(
        mockEngagementId,
        mockWorkspaceId,
        true
      );

      expect(result.id).toBe(mockEngagementId);
    });

    it("client user cannot get internal engagement by id", async () => {
      const mockDb = db as any;
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          visibility: "internal",
          client: { id: "c1", name: "Client 1" },
          parent: null,
          children: [],
          conditionProfiles: [],
          memberships: [],
          _count: { leads: 0 },
        }),
      };

      await expect(
        engagementService.getEngagementById(mockEngagementId, mockWorkspaceId, false)
      ).rejects.toThrow(NotFoundError);
    });

    it("client user can get client_visible engagement by id", async () => {
      const mockDb = db as any;
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          visibility: "client_visible",
          client: { id: "c1", name: "Client 1" },
          parent: null,
          children: [],
          conditionProfiles: [],
          memberships: [],
          _count: { leads: 0 },
        }),
      };

      const result = await engagementService.getEngagementById(
        mockEngagementId,
        mockWorkspaceId,
        false
      );

      expect(result.id).toBe(mockEngagementId);
    });
  });
});
