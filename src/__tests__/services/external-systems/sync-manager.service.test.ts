/**
 * B13-S3: Sync Manager Service — DB-backed Integration Tests
 *
 * Verifies:
 * - Pre-sync token validation
 * - Sync error handling and token refresh detection
 * - Connection health checking
 * - Atomic sync operations with transaction rollback
 * - Integration with token lifecycle service
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDbInstance } from "@/lib/db";
import {
  preSyncTokenValidation,
  handleSyncFailure,
  recordSyncSuccess,
  executeSyncWithTokenValidation,
  checkConnectionHealth,
} from "@/services/external-systems/sync-manager.service";
import { storeOAuthToken } from "@/services/external-systems/token-lifecycle.service";

const TEST_WORKSPACE_ID = "ws_test_sync_manager";
const TEST_CONNECTION_ID = "conn_test_sync_manager";

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = await getDbInstance();

  // Create test workspace
  await prisma.workspace.upsert({
    where: { id: TEST_WORKSPACE_ID },
    create: {
      id: TEST_WORKSPACE_ID,
      name: "Test Sync Manager Workspace",
      slug: "test-sync-manager-workspace",
    },
    update: {},
  });

  // Create test provider
  await prisma.externalProvider.upsert({
    where: { id: "google_sheets" },
    create: {
      id: "google_sheets",
      name: "Google Sheets",
      apiBaseUrl: "https://sheets.googleapis.com",
      oauthTokenUrl: "https://oauth2.googleapis.com/token",
      requiresOAuth: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });

  // Create test connection
  await prisma.externalConnection.upsert({
    where: { id: TEST_CONNECTION_ID },
    create: {
      id: TEST_CONNECTION_ID,
      workspaceId: TEST_WORKSPACE_ID,
      providerId: "google_sheets",
      connectionName: "Test Sync Connection",
      status: "active",
      oauthScope: ["spreadsheets.readonly"],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });
});

afterEach(async () => {
  // Cleanup test data
  await prisma.externalSyncJob.deleteMany({
    where: {
      connection: {
        workspaceId: TEST_WORKSPACE_ID,
      },
    },
  });

  await prisma.externalOAuthToken.deleteMany({
    where: {
      connection: {
        workspaceId: TEST_WORKSPACE_ID,
      },
    },
  });

  await prisma.externalConnection.deleteMany({
    where: {
      workspaceId: TEST_WORKSPACE_ID,
    },
  });

  await prisma.workspace.deleteMany({
    where: {
      id: TEST_WORKSPACE_ID,
    },
  });
});

describe("B13-S3: Sync Manager Service — DB-Backed Integration Tests", () => {
  describe("Pre-Sync Token Validation", () => {
    it("should validate token that is not expired", async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      const token = {
        accessToken: "valid_token",
        refreshToken: "refresh_token",
        expiresAt: futureDate,
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      const result = await preSyncTokenValidation(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        300,
      );

      expect(result.requiresRefresh).toBe(false);
      expect(result.refreshTokenAvailable).toBe(true);
    });

    it("should detect token requiring refresh", async () => {
      const expiresSoon = new Date();
      expiresSoon.setSeconds(expiresSoon.getSeconds() + 100);

      const token = {
        accessToken: "expiring_token",
        refreshToken: "refresh_token",
        expiresAt: expiresSoon,
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      const result = await preSyncTokenValidation(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        300,
      );

      expect(result.requiresRefresh).toBe(true);
      expect(result.refreshTokenAvailable).toBe(true);
    });

    it("should handle token with no refresh token available", async () => {
      const expiresSoon = new Date();
      expiresSoon.setSeconds(expiresSoon.getSeconds() + 100);

      const token = {
        accessToken: "expiring_token",
        expiresAt: expiresSoon,
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      const result = await preSyncTokenValidation(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        300,
      );

      expect(result.requiresRefresh).toBe(true);
      expect(result.refreshTokenAvailable).toBe(false);
    });
  });

  describe("Sync Error Handling", () => {
    it("should classify token errors correctly", async () => {
      const tokenErrors = [
        "401 Unauthorized",
        "403 Forbidden",
        "invalid_grant",
        "token_expired",
      ];

      for (const errorMsg of tokenErrors) {
        const result = await handleSyncFailure(
          prisma,
          TEST_CONNECTION_ID,
          TEST_WORKSPACE_ID,
          errorMsg,
          5,
        );

        expect(result.success).toBe(false);
        expect(result.requiresTokenRefresh).toBe(true);
        expect(result.recordsImported).toBe(5);

        // Reset connection status for next test
        await prisma.externalConnection.update({
          where: { id: TEST_CONNECTION_ID },
          data: { status: "active" },
        });
      }
    });

    it("should mark connection expired on token error", async () => {
      await handleSyncFailure(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        "401 Unauthorized",
        0,
      );

      const connection = await prisma.externalConnection.findUnique({
        where: { id: TEST_CONNECTION_ID },
        select: { status: true, lastErrorAt: true, lastErrorMessage: true },
      });

      expect(connection?.status).toBe("expired");
      expect(connection?.lastErrorAt).toBeDefined();
      expect(connection?.lastErrorMessage).toContain("401");
    });

    it("should classify non-token errors differently", async () => {
      const result = await handleSyncFailure(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        "Network timeout",
        3,
      );

      expect(result.success).toBe(false);
      expect(result.requiresTokenRefresh).toBe(false);

      // Connection status should not change for non-token errors
      const connection = await prisma.externalConnection.findUnique({
        where: { id: TEST_CONNECTION_ID },
        select: { status: true },
      });

      expect(connection?.status).toBe("active");
    });

    it("should record failed sync job with error", async () => {
      await handleSyncFailure(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        "API error: rate limit exceeded",
        10,
      );

      const syncJobs = await prisma.externalSyncJob.findMany({
        where: { connectionId: TEST_CONNECTION_ID },
      });

      expect(syncJobs).toHaveLength(1);
      expect(syncJobs[0].status).toBe("failed");
      expect(syncJobs[0].errorMessage).toContain("rate limit");
      expect(syncJobs[0].recordsImported).toBe(10);
    });
  });

  describe("Sync Success Recording", () => {
    it("should record successful sync", async () => {
      await recordSyncSuccess(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        50,
      );

      const connection = await prisma.externalConnection.findUnique({
        where: { id: TEST_CONNECTION_ID },
        select: { lastSyncAt: true },
      });

      expect(connection?.lastSyncAt).toBeDefined();

      const syncJobs = await prisma.externalSyncJob.findMany({
        where: { connectionId: TEST_CONNECTION_ID },
      });

      expect(syncJobs).toHaveLength(1);
      expect(syncJobs[0].status).toBe("completed");
      expect(syncJobs[0].recordsImported).toBe(50);
    });
  });

  describe("Atomic Sync Operations", () => {
    it("should execute sync with valid token", async () => {
      const token = {
        accessToken: "valid_sync_token",
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      let syncFnCalled = false;
      const result = await executeSyncWithTokenValidation(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        async (token: string) => {
          syncFnCalled = true;
          expect(token).toBeDefined();
          return 25;
        },
      );

      expect(syncFnCalled).toBe(true);
      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(25);

      // Verify sync job was recorded
      const syncJobs = await prisma.externalSyncJob.findMany({
        where: { connectionId: TEST_CONNECTION_ID },
      });

      expect(syncJobs).toHaveLength(1);
      expect(syncJobs[0].recordsImported).toBe(25);
    });

    it("should reject sync if token is expired", async () => {
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);

      const token = {
        accessToken: "expired_sync_token",
        tokenType: "Bearer",
        expiresAt: expiredDate,
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      let syncFnCalled = false;
      const result = await executeSyncWithTokenValidation(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        async () => {
          syncFnCalled = true;
          return 0;
        },
      );

      expect(syncFnCalled).toBe(false);
      expect(result.success).toBe(false);
      expect(result.requiresTokenRefresh).toBe(false); // No refresh token
    });

    it("should handle sync function errors", async () => {
      const token = {
        accessToken: "sync_error_token",
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      const result = await executeSyncWithTokenValidation(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        async () => {
          throw new Error("Sync operation failed");
        },
      );

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("Sync operation failed");

      // Verify failed job was recorded
      const syncJobs = await prisma.externalSyncJob.findMany({
        where: { connectionId: TEST_CONNECTION_ID },
      });

      expect(syncJobs).toHaveLength(1);
      expect(syncJobs[0].status).toBe("failed");
    });
  });

  describe("Connection Health Check", () => {
    it("should report healthy connection with valid token", async () => {
      const token = {
        accessToken: "healthy_token",
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      const health = await checkConnectionHealth(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
      );

      expect(health.connectionStatus).toBe("active");
      expect(health.tokenStatus).toBe("valid");
      expect(health.canSync).toBe(false); // No refresh token
    });

    it("should report unhealthy connection with expired token", async () => {
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);

      const token = {
        accessToken: "unhealthy_token",
        tokenType: "Bearer",
        expiresAt: expiredDate,
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      const health = await checkConnectionHealth(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
      );

      expect(health.connectionStatus).toBe("active");
      expect(health.tokenStatus).toBe("expired");
      expect(health.canSync).toBe(false);
    });

    it("should include last sync and error timestamps", async () => {
      const token = {
        accessToken: "token_with_history",
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      await recordSyncSuccess(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        10,
      );

      const health = await checkConnectionHealth(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
      );

      expect(health.lastSyncAt).toBeDefined();
    });

    it("should report missing connection", async () => {
      const health = await checkConnectionHealth(
        prisma,
        "conn_nonexistent",
        TEST_WORKSPACE_ID,
      );

      expect(health.connectionStatus).toBe("not_found");
      expect(health.canSync).toBe(false);
    });
  });

  describe("Acceptance Gates (Protocol §21)", () => {
    it("should prevent sync without token validation", async () => {
      // No token stored
      const result = await executeSyncWithTokenValidation(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        async () => 0,
      );

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("Token not found");
    });

    it("should maintain workspace isolation in health checks", async () => {
      const token = {
        accessToken: "private_token",
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      // Try to check health from different workspace
      const health = await checkConnectionHealth(
        prisma,
        TEST_CONNECTION_ID,
        "ws_different",
      );

      // Should still report connection not found (workspace isolation)
      expect(health.connectionStatus).toBe("not_found");
    });

    it("should prevent token refresh without refresh token", async () => {
      const token = {
        accessToken: "no_refresh_token",
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() + 200 * 1000), // Expires soon
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      const result = await executeSyncWithTokenValidation(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        async () => 0,
      );

      // Should fail because token needs refresh and no refresh token available
      expect(result.success).toBe(false);
      expect(result.requiresTokenRefresh).toBe(false);
    });
  });
});
