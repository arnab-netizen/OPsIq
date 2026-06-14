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
  type GoogleAuthorizationUrlInput,
  type GoogleSheetData,
  type GoogleOAuthCallbackRequest,
} from "@/services/external-systems/google-sheets-oauth.service";

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
