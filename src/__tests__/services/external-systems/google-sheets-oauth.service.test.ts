/**
 * B13-S2: Google Sheets OAuth Integration — Pure Function Tests
 *
 * Verifies:
 * - Authorization URL generation with PKCE
 * - OAuth callback validation
 * - Sheet data conversion to import format
 * - State/CSRF token handling
 * - Error handling for invalid OAuth responses
 */

import { describe, it, expect } from "vitest";
import {
  generateGoogleAuthorizationUrl,
  convertSheetRowsToImportFormat,
  validateGoogleOAuthCallback,
  exchangeCodeForToken,
  extractGoogleSheetData,
  refreshAccessToken,
  revokeGoogleAccess,
  type GoogleAuthorizationUrlInput,
  type GoogleSheetData,
  type GoogleOAuthCallbackRequest,
} from "@/services/external-systems/google-sheets-oauth.service";
import { ValidationError, UnauthorizedError, NotFoundError, TooManyRequestsError } from "@/infra/errors";

const mockConfig = {
  clientId: "test-client-id.apps.googleusercontent.com",
  clientSecret: "test-client-secret",
  redirectUri: "https://opsiq.example.com/oauth/callback",
};

const mockSheetData: GoogleSheetData = {
  spreadsheetId: "1BxiMVs0XRA5nFMon9QV6-xH03ywWD3e",
  sheetTitle: "Sales Data",
  headers: ["Deal ID", "Deal Name", "Deal Amount", "Deal Stage"],
  rows: [
    {
      "Deal ID": "deal_001",
      "Deal Name": "Big Deal",
      "Deal Amount": 50000,
      "Deal Stage": "Negotiation",
    },
    {
      "Deal ID": "deal_002",
      "Deal Name": "Small Deal",
      "Deal Amount": 5000,
      "Deal Stage": "Qualification",
    },
  ],
};

describe("B13-S2: Google Sheets OAuth Integration", () => {
  describe("Authorization URL Generation", () => {
    it("should generate valid authorization URL", () => {
      const input: GoogleAuthorizationUrlInput = {
        config: mockConfig,
        workspaceId: "ws_123",
        providerId: "google_sheets",
      };

      const result = generateGoogleAuthorizationUrl(input);

      expect(result.url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(result.url).toContain("client_id=" + mockConfig.clientId);
      expect(result.url).toContain("redirect_uri=" + encodeURIComponent(mockConfig.redirectUri));
      expect(result.url).toContain("response_type=code");
      expect(result.url).toContain("scope=");
    });

    it("should include PKCE code challenge", () => {
      const input: GoogleAuthorizationUrlInput = {
        config: mockConfig,
        workspaceId: "ws_123",
        providerId: "google_sheets",
      };

      const result = generateGoogleAuthorizationUrl(input);

      expect(result.url).toContain("code_challenge=");
      expect(result.url).toContain("code_challenge_method=S256");
      expect(result.codeVerifier).toBeDefined();
      expect(result.codeVerifier.length).toBeGreaterThan(40);
    });

    it("should generate state and nonce tokens", () => {
      const input: GoogleAuthorizationUrlInput = {
        config: mockConfig,
        workspaceId: "ws_123",
        providerId: "google_sheets",
      };

      const result = generateGoogleAuthorizationUrl(input);

      expect(result.state).toBeDefined();
      expect(result.nonce).toBeDefined();
      expect(result.state.length).toBe(64);
      expect(result.nonce.length).toBe(64);
    });

    it("should include Google Sheets and Drive readonly scopes by default", () => {
      const input: GoogleAuthorizationUrlInput = {
        config: mockConfig,
        workspaceId: "ws_123",
        providerId: "google_sheets",
      };

      const result = generateGoogleAuthorizationUrl(input);

      expect(result.url).toContain("spreadsheets.readonly");
      expect(result.url).toContain("drive.readonly");
    });

    it("should support custom scopes", () => {
      const input: GoogleAuthorizationUrlInput = {
        config: mockConfig,
        workspaceId: "ws_123",
        providerId: "google_sheets",
        scope: ["https://www.googleapis.com/auth/spreadsheets"],
      };

      const result = generateGoogleAuthorizationUrl(input);

      expect(result.url).toContain("spreadsheets");
      expect(result.url).not.toContain("drive.readonly");
    });

    it("should request offline access for refresh tokens", () => {
      const input: GoogleAuthorizationUrlInput = {
        config: mockConfig,
        workspaceId: "ws_123",
        providerId: "google_sheets",
        accessType: "offline",
      };

      const result = generateGoogleAuthorizationUrl(input);

      expect(result.url).toContain("access_type=offline");
    });

    it("should generate unique state for each authorization", () => {
      const input: GoogleAuthorizationUrlInput = {
        config: mockConfig,
        workspaceId: "ws_123",
        providerId: "google_sheets",
      };

      const result1 = generateGoogleAuthorizationUrl(input);
      const result2 = generateGoogleAuthorizationUrl(input);

      expect(result1.state).not.toBe(result2.state);
      expect(result1.codeVerifier).not.toBe(result2.codeVerifier);
    });
  });

  describe("OAuth Callback Validation", () => {
    it("should validate successful OAuth callback", () => {
      const callback: GoogleOAuthCallbackRequest = {
        code: "4/0AY0e-g...",
        state: "abc123def456",
      };

      const result = validateGoogleOAuthCallback(callback, "abc123def456");

      expect(result.valid).toBe(true);
      expect(result.authorizationCode).toBe("4/0AY0e-g...");
    });

    it("should reject callback with mismatched state (CSRF)", () => {
      const callback: GoogleOAuthCallbackRequest = {
        code: "4/0AY0e-g...",
        state: "wrong_state",
      };

      const result = validateGoogleOAuthCallback(callback, "abc123def456");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("State mismatch");
    });

    it("should reject callback with error from Google", () => {
      const callback: GoogleOAuthCallbackRequest = {
        code: "4/0AY0e-g...",
        state: "abc123def456",
        error: "access_denied",
        error_description: "User denied access",
      };

      const result = validateGoogleOAuthCallback(callback, "abc123def456");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("access_denied");
      expect(result.error).toContain("User denied");
    });

    it("should reject callback with missing authorization code", () => {
      const callback: GoogleOAuthCallbackRequest = {
        code: "",
        state: "abc123def456",
      };

      const result = validateGoogleOAuthCallback(callback, "abc123def456");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("authorization code");
    });

    it("should handle common OAuth error codes", () => {
      const errorCodes = ["access_denied", "invalid_scope", "server_error", "temporarily_unavailable"];

      errorCodes.forEach((errorCode) => {
        const callback: GoogleOAuthCallbackRequest = {
          code: "code",
          state: "state",
          error: errorCode,
        };

        const result = validateGoogleOAuthCallback(callback, "state");

        expect(result.valid).toBe(false);
        expect(result.error).toContain(errorCode);
      });
    });
  });

  describe("Sheet Data Conversion", () => {
    it("should convert sheet rows to import format", () => {
      const result = convertSheetRowsToImportFormat(mockSheetData);

      expect(result.recordCount).toBe(2);
      expect(result.parsedRows).toHaveLength(2);
      expect(result.totalConfidence).toBe(0.95);
    });

    it("should create source reference IDs for rows", () => {
      const result = convertSheetRowsToImportFormat(mockSheetData);

      result.parsedRows.forEach((row) => {
        expect(row.mapped.source_reference_id).toBeDefined();
        expect(row.mapped.source_reference_id).toContain("gs_");
        expect(row.mapped.source_reference_id).toContain(mockSheetData.spreadsheetId);
      });
    });

    it("should preserve original sheet data", () => {
      const result = convertSheetRowsToImportFormat(mockSheetData);

      expect(result.parsedRows[0].original["Deal ID"]).toBe("deal_001");
      expect(result.parsedRows[0].original["Deal Name"]).toBe("Big Deal");
      expect(result.parsedRows[0].original["Deal Amount"]).toBe(50000);
    });

    it("should map sheet headers to lowercase with underscores", () => {
      const result = convertSheetRowsToImportFormat(mockSheetData);

      expect(result.parsedRows[0].mapped["deal_id"]).toBe("deal_001");
      expect(result.parsedRows[0].mapped["deal_name"]).toBe("Big Deal");
      expect(result.parsedRows[0].mapped["deal_amount"]).toBe(50000);
    });

    it("should mark all fields as mapped (no unmapped columns)", () => {
      const result = convertSheetRowsToImportFormat(mockSheetData);

      result.parsedRows.forEach((row) => {
        expect(row.unmappedColumns).toHaveLength(0);
        expect(row.mappedFields.length).toBeGreaterThan(0);
      });
    });

    it("should set high confidence for API-sourced data", () => {
      const result = convertSheetRowsToImportFormat(mockSheetData);

      result.parsedRows.forEach((row) => {
        expect(row.confidence).toBe(0.95);
        expect(row.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });

    it("should handle empty sheet", () => {
      const emptySheet: GoogleSheetData = {
        ...mockSheetData,
        rows: [],
      };

      const result = convertSheetRowsToImportFormat(emptySheet);

      expect(result.recordCount).toBe(0);
      expect(result.parsedRows).toHaveLength(0);
    });

    it("should handle null/undefined values in sheet", () => {
      const sheetWithNulls: GoogleSheetData = {
        ...mockSheetData,
        rows: [
          {
            "Deal ID": "deal_003",
            "Deal Name": null,
            "Deal Amount": undefined,
            "Deal Stage": "Open",
          },
        ],
      };

      const result = convertSheetRowsToImportFormat(sheetWithNulls);

      expect(result.parsedRows[0].original["Deal ID"]).toBe("deal_003");
      expect(result.parsedRows[0].original["Deal Name"]).toBeNull();
      expect(result.parsedRows[0].original["Deal Amount"]).toBeUndefined();
    });
  });

  describe("Acceptance Gates (Protocol §21)", () => {
    it("should support Google Sheets as official API provider", () => {
      // Gate: Official API connector established for first provider
      const input: GoogleAuthorizationUrlInput = {
        config: mockConfig,
        workspaceId: "ws_123",
        providerId: "google_sheets",
      };

      const result = generateGoogleAuthorizationUrl(input);

      expect(result.url).toContain("accounts.google.com");
      expect(result.state).toBeDefined();
    });

    it("should maintain CSRF protection via state tokens", () => {
      // Gate: State tokens prevent CSRF attacks
      const input: GoogleAuthorizationUrlInput = {
        config: mockConfig,
        workspaceId: "ws_123",
        providerId: "google_sheets",
      };

      const { state } = generateGoogleAuthorizationUrl(input);

      const callback: GoogleOAuthCallbackRequest = {
        code: "auth_code",
        state: state,
      };

      const validation = validateGoogleOAuthCallback(callback, state);
      expect(validation.valid).toBe(true);

      // Different state should fail
      const invalidCallback: GoogleOAuthCallbackRequest = {
        code: "auth_code",
        state: "wrong_state",
      };

      const invalidValidation = validateGoogleOAuthCallback(invalidCallback, state);
      expect(invalidValidation.valid).toBe(false);
    });

    it("should preserve source lineage in converted data", () => {
      // Gate: Source reference IDs maintained for audit trail
      const result = convertSheetRowsToImportFormat(mockSheetData);

      result.parsedRows.forEach((row) => {
        expect(row.mapped.source_reference_id).toContain("gs_");
        expect(row.mapped.source_reference_id).toContain(mockSheetData.spreadsheetId);
      });
    });

    it("should provide high confidence for directly-extracted data", () => {
      // Gate: API-sourced data has higher confidence than manual imports
      const result = convertSheetRowsToImportFormat(mockSheetData);

      result.parsedRows.forEach((row) => {
        expect(row.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });
});

// Helpers for fetch mocking
function makeFetch(status: number, body: unknown): () => Promise<Response> {
  return () =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as unknown as Response);
}

const VALID_SPREADSHEET_ID = "1BxiMVs0XRA5nFMon9QV6-xH03ywWD3e";

describe("Phase 6 — HTTP connector implementations", () => {
  describe("exchangeCodeForToken", () => {
    it("returns accessToken and refreshToken on 200", async () => {
      const fetchImpl = makeFetch(200, {
        access_token: "ya29.access",
        refresh_token: "1//refresh",
        expires_in: 3600,
        token_type: "Bearer",
      });

      const result = await exchangeCodeForToken({
        config: mockConfig,
        code: "auth-code-123",
        codeVerifier: "verifier-abc",
        fetchImpl,
      });

      expect(result.accessToken).toBe("ya29.access");
      expect(result.refreshToken).toBe("1//refresh");
      expect(result.expiresIn).toBe(3600);
      expect(result.tokenType).toBe("Bearer");
    });

    it("posts to the Google OAuth token endpoint (not a user-supplied URL)", async () => {
      let capturedUrl = "";
      const fetchImpl = (url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: "t", expires_in: 3600, token_type: "Bearer" }),
        } as unknown as Response);
      };

      await exchangeCodeForToken({ config: mockConfig, code: "c", codeVerifier: "v", fetchImpl });

      expect(capturedUrl).toBe("https://oauth2.googleapis.com/token");
    });

    it("throws ValidationError on 400 from Google", async () => {
      const fetchImpl = makeFetch(400, {
        error: "invalid_grant",
        error_description: "Code has already been used",
      });

      await expect(
        exchangeCodeForToken({ config: mockConfig, code: "used-code", codeVerifier: "v", fetchImpl }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("throws ValidationError on 401 from Google", async () => {
      const fetchImpl = makeFetch(401, { error: "unauthorized_client" });

      await expect(
        exchangeCodeForToken({ config: mockConfig, code: "c", codeVerifier: "v", fetchImpl }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe("extractGoogleSheetData", () => {
    it("returns headers and rows on 200", async () => {
      const fetchImpl = makeFetch(200, {
        values: [
          ["Deal ID", "Deal Name", "Amount"],
          ["d1", "Big Deal", "50000"],
          ["d2", "Small Deal", "5000"],
        ],
      });

      const result = await extractGoogleSheetData({
        accessToken: "ya29.token",
        spreadsheetId: VALID_SPREADSHEET_ID,
        sheetRange: "Sheet1!A:C",
        fetchImpl,
      });

      expect(result.headers).toEqual(["Deal ID", "Deal Name", "Amount"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]["Deal ID"]).toBe("d1");
      expect(result.spreadsheetId).toBe(VALID_SPREADSHEET_ID);
    });

    it("constructs URL from validated spreadsheetId (SSRF protection)", async () => {
      let capturedUrl = "";
      const fetchImpl = (url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ values: [] }),
        } as unknown as Response);
      };

      await extractGoogleSheetData({
        accessToken: "token",
        spreadsheetId: VALID_SPREADSHEET_ID,
        fetchImpl,
      });

      expect(capturedUrl).toMatch(/^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\//);
      expect(capturedUrl).toContain(VALID_SPREADSHEET_ID);
      // URL must NOT contain any user-controlled host or protocol
      expect(capturedUrl).not.toContain("http://");
    });

    it("rejects spreadsheetId that looks like a URL (SSRF protection)", async () => {
      await expect(
        extractGoogleSheetData({
          accessToken: "token",
          spreadsheetId: "https://evil.com/path",
          fetchImpl: makeFetch(200, {}),
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("rejects spreadsheetId with path traversal characters", async () => {
      await expect(
        extractGoogleSheetData({
          accessToken: "token",
          spreadsheetId: "../../etc/passwd",
          fetchImpl: makeFetch(200, {}),
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("rejects sheetRange with forbidden characters", async () => {
      await expect(
        extractGoogleSheetData({
          accessToken: "token",
          spreadsheetId: VALID_SPREADSHEET_ID,
          sheetRange: "Sheet1!A:Z/../../../evil",
          fetchImpl: makeFetch(200, {}),
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("returns empty data when Google returns no values", async () => {
      const result = await extractGoogleSheetData({
        accessToken: "token",
        spreadsheetId: VALID_SPREADSHEET_ID,
        fetchImpl: makeFetch(200, {}),
      });

      expect(result.headers).toHaveLength(0);
      expect(result.rows).toHaveLength(0);
    });

    it("throws UnauthorizedError on 401", async () => {
      await expect(
        extractGoogleSheetData({
          accessToken: "expired",
          spreadsheetId: VALID_SPREADSHEET_ID,
          fetchImpl: makeFetch(401, { error: "UNAUTHENTICATED" }),
        }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("throws UnauthorizedError on 403", async () => {
      await expect(
        extractGoogleSheetData({
          accessToken: "token",
          spreadsheetId: VALID_SPREADSHEET_ID,
          fetchImpl: makeFetch(403, { error: "PERMISSION_DENIED" }),
        }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("throws NotFoundError on 404", async () => {
      await expect(
        extractGoogleSheetData({
          accessToken: "token",
          spreadsheetId: VALID_SPREADSHEET_ID,
          fetchImpl: makeFetch(404, { error: "NOT_FOUND" }),
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("throws TooManyRequestsError on 429", async () => {
      await expect(
        extractGoogleSheetData({
          accessToken: "token",
          spreadsheetId: VALID_SPREADSHEET_ID,
          fetchImpl: makeFetch(429, { error: "RESOURCE_EXHAUSTED" }),
        }),
      ).rejects.toBeInstanceOf(TooManyRequestsError);
    });
  });

  describe("refreshAccessToken", () => {
    it("returns new accessToken on 200", async () => {
      const fetchImpl = makeFetch(200, {
        access_token: "ya29.new-access",
        expires_in: 3600,
        token_type: "Bearer",
      });

      const result = await refreshAccessToken({
        config: mockConfig,
        refreshToken: "1//refresh",
        fetchImpl,
      });

      expect(result.accessToken).toBe("ya29.new-access");
      expect(result.expiresIn).toBe(3600);
    });

    it("posts to the Google OAuth token endpoint", async () => {
      let capturedUrl = "";
      let capturedBody = "";
      const fetchImpl = (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = (init?.body as string) ?? "";
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: "t", expires_in: 3600, token_type: "Bearer" }),
        } as unknown as Response);
      };

      await refreshAccessToken({ config: mockConfig, refreshToken: "rt", fetchImpl });

      expect(capturedUrl).toBe("https://oauth2.googleapis.com/token");
      expect(capturedBody).toContain("grant_type=refresh_token");
      expect(capturedBody).toContain("refresh_token=rt");
    });

    it("throws ValidationError on 400 (invalid/expired refresh token)", async () => {
      const fetchImpl = makeFetch(400, {
        error: "invalid_grant",
        error_description: "Token has been expired or revoked",
      });

      await expect(
        refreshAccessToken({ config: mockConfig, refreshToken: "expired-rt", fetchImpl }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe("revokeGoogleAccess", () => {
    it("resolves without error on 200", async () => {
      await expect(
        revokeGoogleAccess({
          config: mockConfig,
          accessToken: "ya29.access",
          fetchImpl: makeFetch(200, {}),
        }),
      ).resolves.toBeUndefined();
    });

    it("resolves without error on 400 (token already revoked)", async () => {
      // Google returns 400 when token is already invalid — treated as success
      await expect(
        revokeGoogleAccess({
          config: mockConfig,
          accessToken: "already-revoked",
          fetchImpl: makeFetch(400, { error: "invalid_token" }),
        }),
      ).resolves.toBeUndefined();
    });

    it("posts to the Google revocation endpoint", async () => {
      let capturedUrl = "";
      const fetchImpl = (url: string) => {
        capturedUrl = url;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as unknown as Response);
      };

      await revokeGoogleAccess({ config: mockConfig, accessToken: "t", fetchImpl });

      expect(capturedUrl).toBe("https://oauth2.googleapis.com/revoke");
    });
  });
});
