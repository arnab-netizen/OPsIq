/**
 * QuickBooks Online — provider constants and app-configuration resolution.
 *
 * Pure module: no DB, no network, no process.env reads (callers pass the env
 * record explicitly so tests and the fail-closed contract are deterministic).
 *
 * Endpoint URLs are taken from Intuit's own OAuth client
 * (github.com/intuit/oauth-jsclient src/OAuthClient.js) and API hosts from the
 * same source. They are hardcoded here and NEVER derived from request input
 * (SSRF protection): the only per-request path component is the realmId, which
 * is validated by QBO_REALM_ID_PATTERN before any URL is built.
 *
 * Missing credentials fail closed: resolveQboConfig returns
 * { available: false, missing } and every caller must render the connector as
 * unavailable instead of attempting OAuth or API calls.
 */

export const QBO_PROVIDER = "QUICKBOOKS" as const;

/** Accounting scope — the only scope OpsIQ requests. */
export const QBO_ACCOUNTING_SCOPE = "com.intuit.quickbooks.accounting";

/**
 * Intuit raised the minimum supported minor version to 75 (older values are
 * upgraded server-side). Pinned explicitly on every request so behaviour does
 * not drift when Intuit moves its default.
 */
export const QBO_MINOR_VERSION = 75;

export const QBO_OAUTH_ENDPOINTS = {
  authorize: "https://appcenter.intuit.com/connect/oauth2",
  token: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  revoke: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
} as const;

export const QBO_API_HOSTS = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
} as const;

export type QboEnvironment = keyof typeof QBO_API_HOSTS;

/** QBO realm (company) ids are numeric strings. Anything else is rejected before URL construction. */
export const QBO_REALM_ID_PATTERN = /^[0-9]{1,32}$/;

/** QBO entity ids are numeric strings. */
export const QBO_ENTITY_ID_PATTERN = /^[0-9]{1,32}$/;

/** OAuth state lifetime. */
export const QBO_OAUTH_STATE_TTL_SECONDS = 600;

/** Refresh an access token this long before its stated expiry. */
export const QBO_ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 300;

/** Intuit `requestid` maximum length. OpsIQ derives a 36-char UUID-shaped value, well within it. */
export const QBO_REQUEST_ID_MAX_LENGTH = 50;

/** QBO query endpoint maximum page size. */
export const QBO_QUERY_MAX_RESULTS = 1000;

/** CDC lookback window accepted by QBO (days). */
export const QBO_CDC_MAX_LOOKBACK_DAYS = 30;

export interface QboAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: QboEnvironment;
  /** Webhook verifier token; null disables the webhook endpoint (fail closed). */
  webhookVerifierToken: string | null;
}

export type QboConfigResult =
  | { available: true; config: QboAppConfig }
  | { available: false; missing: string[]; invalid: string[] };

export const QBO_ENV_KEYS = {
  clientId: "QUICKBOOKS_CLIENT_ID",
  clientSecret: "QUICKBOOKS_CLIENT_SECRET",
  redirectUri: "QUICKBOOKS_REDIRECT_URI",
  environment: "QUICKBOOKS_ENVIRONMENT",
  webhookVerifierToken: "QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN",
  tokenEncryptionKey: "OAUTH_TOKEN_ENCRYPTION_KEY",
} as const;

function clean(v: string | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Resolve QuickBooks app configuration from an env record.
 *
 * Required: client id, client secret, redirect URI (absolute https URL, or
 * http://localhost for development), environment (sandbox | production), and
 * the OAuth token encryption key (tokens can never be stored without it).
 */
export function resolveQboConfig(env: Record<string, string | undefined>): QboConfigResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  const clientId = clean(env[QBO_ENV_KEYS.clientId]);
  const clientSecret = clean(env[QBO_ENV_KEYS.clientSecret]);
  const redirectUri = clean(env[QBO_ENV_KEYS.redirectUri]);
  const environmentRaw = clean(env[QBO_ENV_KEYS.environment]).toLowerCase();
  const verifier = clean(env[QBO_ENV_KEYS.webhookVerifierToken]);
  const encryptionKey = clean(env[QBO_ENV_KEYS.tokenEncryptionKey]);

  if (!clientId) missing.push(QBO_ENV_KEYS.clientId);
  if (!clientSecret) missing.push(QBO_ENV_KEYS.clientSecret);
  if (!redirectUri) missing.push(QBO_ENV_KEYS.redirectUri);
  if (!environmentRaw) missing.push(QBO_ENV_KEYS.environment);
  if (!encryptionKey) missing.push(QBO_ENV_KEYS.tokenEncryptionKey);

  if (redirectUri) {
    let ok = false;
    try {
      const u = new URL(redirectUri);
      ok = u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
    } catch {
      ok = false;
    }
    if (!ok) invalid.push(QBO_ENV_KEYS.redirectUri);
  }
  if (environmentRaw && environmentRaw !== "sandbox" && environmentRaw !== "production") {
    invalid.push(QBO_ENV_KEYS.environment);
  }

  if (missing.length > 0 || invalid.length > 0) {
    return { available: false, missing, invalid };
  }

  return {
    available: true,
    config: {
      clientId,
      clientSecret,
      redirectUri,
      environment: environmentRaw as QboEnvironment,
      webhookVerifierToken: verifier || null,
    },
  };
}

export function isValidRealmId(realmId: unknown): realmId is string {
  return typeof realmId === "string" && QBO_REALM_ID_PATTERN.test(realmId);
}

export function isValidQboEntityId(id: unknown): id is string {
  return typeof id === "string" && QBO_ENTITY_ID_PATTERN.test(id);
}
