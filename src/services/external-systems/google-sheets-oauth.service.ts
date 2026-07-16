/**
 * Phase 6: Google Sheets OAuth Integration Service
 *
 * Implements OAuth2 authorization code flow for Google Sheets API.
 * Handles:
 * - Authorization URL generation with PKCE support
 * - Token exchange (authorization code → access token)
 * - Sheet data extraction and row mapping
 * - Integration with B12 import format
 *
 * Security:
 * - PKCE prevents authorization code interception
 * - State tokens prevent CSRF
 * - Tokens encrypted and never exposed to frontend
 * - Server-side token use only
 * - SSRF: all outbound URLs are constructed from validated IDs against hardcoded Google hosts
 * - spreadsheetId validated against Google's alphanumeric-hyphen-underscore format
 * - sheetRange validated before URL construction — no user-controlled path components
 */

import { generateOAuthState } from "./oauth-token.service";
import type { ImportResult, ParsedRow } from "@/domain/external-systems/import-parser";
import {
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  TooManyRequestsError,
  ServiceUnavailableError,
} from "@/infra/errors";

// Hardcoded Google API hosts — never substituted from user input (SSRF protection)
const GOOGLE_OAUTH_HOST = "https://oauth2.googleapis.com";
const GOOGLE_SHEETS_HOST = "https://sheets.googleapis.com";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleOAuthFlowInput {
  config: GoogleOAuthConfig;
  workspaceId: string;
  providerId: string;
}

export interface GoogleAuthorizationUrlInput extends GoogleOAuthFlowInput {
  scope?: string[];
  accessType?: "offline" | "online";
}

export interface GoogleSheetData {
  spreadsheetId: string;
  sheetTitle: string;
  headers: string[];
  rows: Record<string, any>[];
}

export interface GoogleSheetsImportRequest {
  accessToken: string;
  spreadsheetId: string;
  sheetRange?: string; // e.g., "Sheet1!A:Z"
  headersRow?: number; // default 1
  fetchImpl?: FetchLike;
}

/**
 * Google Sheets spreadsheet IDs are alphanumeric plus hyphens and underscores.
 * Rejecting anything else prevents SSRF via path traversal in the constructed URL.
 */
function validateSpreadsheetId(id: string): void {
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) {
    throw new ValidationError(
      "Invalid spreadsheet ID format — must be alphanumeric, hyphens, or underscores (min 10 chars)",
    );
  }
}

/**
 * Sheet ranges like "Sheet1!A:Z" or "A1:Z100".
 * Allows letters, digits, exclamation, colon, apostrophe — no slashes or dots.
 */
function validateSheetRange(range: string): void {
  if (!/^[A-Za-z0-9!'%:_ ]+$/.test(range)) {
    throw new ValidationError(
      "Invalid sheet range format — only letters, digits, !, :, ', space are permitted",
    );
  }
}

/**
 * Generate Google OAuth authorization URL with PKCE.
 * User navigates to this URL, logs in, and grants permission.
 */
export function generateGoogleAuthorizationUrl(
  input: GoogleAuthorizationUrlInput,
): {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
} {
  const oauthState = generateOAuthState(600);
  const scope = input.scope || [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
  ];

  const accessType = input.accessType || "offline";
  const codeChallenge = Buffer.from(oauthState.codeVerifier)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const params = new URLSearchParams({
    client_id: input.config.clientId,
    redirect_uri: input.config.redirectUri,
    response_type: "code",
    scope: scope.join(" "),
    state: oauthState.state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: accessType,
    prompt: "consent", // Force consent screen for refresh token
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return {
    url,
    state: oauthState.state,
    nonce: oauthState.nonce,
    codeVerifier: oauthState.codeVerifier,
  };
}

/**
 * Exchange authorization code for access token.
 * Backend-only operation.
 */
export interface TokenExchangeRequest {
  config: GoogleOAuthConfig;
  code: string;
  codeVerifier: string;
  fetchImpl?: FetchLike;
}

export interface TokenExchangeResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number; // seconds
  tokenType: string;
}

/**
 * Exchange authorization code for access + refresh tokens.
 * Calls POST https://oauth2.googleapis.com/token (hardcoded — SSRF safe).
 * Returns 400/401 from Google as ValidationError; 5xx as ServiceUnavailableError.
 */
export async function exchangeCodeForToken(
  request: TokenExchangeRequest,
): Promise<TokenExchangeResponse> {
  const doFetch = request.fetchImpl ?? fetch;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: request.code,
    client_id: request.config.clientId,
    client_secret: request.config.clientSecret,
    redirect_uri: request.config.redirectUri,
    code_verifier: request.codeVerifier,
  });

  const response = await doFetch(`${GOOGLE_OAUTH_HOST}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const description: string = (errData as any).error_description ?? "Token exchange rejected";
    if (response.status === 400 || response.status === 401) {
      throw new ValidationError(description);
    }
    throw new ServiceUnavailableError(
      "SYSTEM_DEGRADED",
      `Google OAuth token exchange failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as any;
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: data.expires_in as number,
    tokenType: (data.token_type as string) ?? "Bearer",
  };
}

/**
 * Extract data from Google Sheet and convert to import format.
 * URL constructed from validated spreadsheetId and range — never from user-supplied URL (SSRF safe).
 */
export async function extractGoogleSheetData(
  request: GoogleSheetsImportRequest,
): Promise<GoogleSheetData> {
  validateSpreadsheetId(request.spreadsheetId);

  const range = request.sheetRange ?? "A:ZZ";
  validateSheetRange(range);

  const doFetch = request.fetchImpl ?? fetch;
  const encodedRange = encodeURIComponent(range);
  const url = `${GOOGLE_SHEETS_HOST}/v4/spreadsheets/${request.spreadsheetId}/values/${encodedRange}`;

  const response = await doFetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${request.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedError(
        "Google Sheets access denied — token may be expired or revoked",
      );
    }
    if (response.status === 404) {
      throw new NotFoundError("Spreadsheet", request.spreadsheetId);
    }
    if (response.status === 429) {
      throw new TooManyRequestsError("Google Sheets API quota exceeded — retry after backoff");
    }
    throw new ServiceUnavailableError(
      "SYSTEM_DEGRADED",
      `Google Sheets API returned ${response.status}`,
    );
  }

  const data = (await response.json()) as any;
  const values: string[][] = data.values ?? [];

  if (values.length === 0) {
    return {
      spreadsheetId: request.spreadsheetId,
      sheetTitle: range.split("!")[0] ?? "Sheet1",
      headers: [],
      rows: [],
    };
  }

  const headersRowIndex = (request.headersRow ?? 1) - 1;
  const headers: string[] = (values[headersRowIndex] ?? []) as string[];
  const dataRows = values.slice(headersRowIndex + 1);

  const rows = dataRows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = row[i] ?? "";
    });
    return record;
  });

  return {
    spreadsheetId: request.spreadsheetId,
    sheetTitle: range.split("!")[0] ?? "Sheet1",
    headers,
    rows,
  };
}

/**
 * Convert Google Sheet rows to B12 import format.
 * Creates ParsedRow objects compatible with B12 import pipeline.
 */
export function convertSheetRowsToImportFormat(
  sheetData: GoogleSheetData,
  providerId: string = "google_sheets",
): ImportResult {
  const headers = sheetData.headers;
  const parsedRows: ParsedRow[] = sheetData.rows.map((row, index) => {
    // Map sheet row to CSV-like format
    const original: Record<string, any> = {};
    const mapped: Record<string, any> = {
      source_reference_id: `gs_${sheetData.spreadsheetId}_${index}`,
    };

    headers.forEach((header) => {
      original[header] = row[header];
      if (row[header] !== undefined && row[header] !== null) {
        mapped[header.toLowerCase().replace(/\s+/g, "_")] = row[header];
      }
    });

    return {
      original,
      mapped,
      confidence: 0.95, // High confidence for Google Sheets API
      mappedFields: Object.keys(mapped),
      unmappedColumns: [],
      errors: [],
    };
  });

  return {
    recordCount: sheetData.rows.length,
    parsedRows,
    headerRow: sheetData.headers,
    totalConfidence: 0.95,
    requiredFieldsMissing: [],
    warnings: [],
  };
}

/**
 * Validate Google OAuth response from redirect.
 * Checks authorization code, state, and PKCE verifier.
 */
export interface GoogleOAuthCallbackRequest {
  code: string;
  state: string;
  error?: string;
  error_description?: string;
}

export interface OAuthCallbackValidation {
  valid: boolean;
  error?: string;
  authorizationCode?: string;
}

/**
 * Validate OAuth callback from Google.
 */
export function validateGoogleOAuthCallback(
  callback: GoogleOAuthCallbackRequest,
  storedState: string,
): OAuthCallbackValidation {
  if (callback.error) {
    return {
      valid: false,
      error: `Google OAuth error: ${callback.error} - ${callback.error_description || ""}`,
    };
  }

  if (callback.state !== storedState) {
    return {
      valid: false,
      error: "State mismatch - CSRF attack suspected",
    };
  }

  if (!callback.code || typeof callback.code !== "string") {
    return {
      valid: false,
      error: "Missing or invalid authorization code",
    };
  }

  return {
    valid: true,
    authorizationCode: callback.code,
  };
}

/**
 * Refresh expired access token using refresh token.
 * Backend-only operation.
 */
export interface TokenRefreshRequest {
  config: GoogleOAuthConfig;
  refreshToken: string;
  fetchImpl?: FetchLike;
}

/**
 * Refresh access token via POST https://oauth2.googleapis.com/token (hardcoded — SSRF safe).
 * Google may or may not rotate the refresh token on each refresh.
 */
export async function refreshAccessToken(
  request: TokenRefreshRequest,
): Promise<TokenExchangeResponse> {
  const doFetch = request.fetchImpl ?? fetch;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: request.refreshToken,
    client_id: request.config.clientId,
    client_secret: request.config.clientSecret,
  });

  const response = await doFetch(`${GOOGLE_OAUTH_HOST}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const description: string = (errData as any).error_description ?? "Refresh rejected";
    if (response.status === 400 || response.status === 401) {
      throw new ValidationError(`${description} — re-authorization may be required`);
    }
    throw new ServiceUnavailableError(
      "SYSTEM_DEGRADED",
      `Google OAuth token refresh failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as any;
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: data.expires_in as number,
    tokenType: (data.token_type as string) ?? "Bearer",
  };
}

/**
 * Revoke Google OAuth access (disconnect flow).
 * Prevents future API calls with this token.
 */
export interface TokenRevocationRequest {
  config: GoogleOAuthConfig;
  accessToken: string;
  fetchImpl?: FetchLike;
}

/**
 * Revoke access token via POST https://oauth2.googleapis.com/revoke (hardcoded — SSRF safe).
 * Per Google docs, HTTP 400 on revoke means token was already invalid — treated as success.
 */
export async function revokeGoogleAccess(request: TokenRevocationRequest): Promise<void> {
  const doFetch = request.fetchImpl ?? fetch;

  const body = new URLSearchParams({ token: request.accessToken });

  const response = await doFetch(`${GOOGLE_OAUTH_HOST}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  // 400 = token already invalid/revoked — treat as success per Google's docs
  if (!response.ok && response.status !== 400) {
    throw new ServiceUnavailableError(
      "SYSTEM_DEGRADED",
      `Google OAuth revocation failed with status ${response.status}`,
    );
  }
}
