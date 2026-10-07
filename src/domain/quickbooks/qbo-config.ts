/**
 * QuickBooks Online — provider constants and strict, fail-closed configuration.
 *
 * Pure module: no DB, no network, no process.env reads (callers pass the env record, so the
 * fail-closed contract is deterministic and testable).
 *
 * Provider facts (verified against Intuit's own `oauth-jsclient` source and the current
 * developer documentation as surfaced by search; see the PR source note for the limits of that
 * verification):
 *  - OAuth endpoints are the same for sandbox and production apps; which one applies is decided
 *    by the app keys. Authorization: appcenter.intuit.com, token: oauth.platform.intuit.com,
 *    revoke: developer.api.intuit.com.
 *  - The accounting API host differs: sandbox-quickbooks.api.intuit.com vs quickbooks.api.intuit.com.
 *  - The read-only accounting scope is com.intuit.quickbooks.accounting. Nothing else is requested.
 *  - PKCE: Intuit's QuickBooks authorization-code flow is a confidential-client flow. Its own
 *    reference client sends no code_challenge, and the current documentation does not describe
 *    PKCE for it. OpsIQ therefore sends NO PKCE parameters (QBO_PKCE_PARAMETERS_SENT = false).
 *    CSRF protection is the `state` parameter, which is mandatory.
 *  - Production redirect URIs must be https and may not be IP addresses; sandbox additionally
 *    allows http://localhost.
 *
 * Every provider URL is a fixed constant. Nothing here derives a host from request input (SSRF).
 *
 * The client secret never appears on the returned config object as an enumerable property: it is
 * reachable only through `config.credentials.basicAuthorization()`, so JSON.stringify(config),
 * util.inspect(config) and structured loggers cannot leak it.
 */

import { inspect } from "node:util";

export const QBO_PROVIDER = "QUICKBOOKS" as const;

/** The only scope OpsIQ requests: read-only-capable accounting access. No Payments / payroll / OpenID. */
export const QBO_ACCOUNTING_SCOPE = "com.intuit.quickbooks.accounting" as const;

/** OpsIQ sends no PKCE parameters on the QBO authorization-code flow (see module doc). */
export const QBO_PKCE_PARAMETERS_SENT = false as const;

/**
 * Intuit treats minor versions 1–74 as 75 and defaults to 75. Pinning it keeps responses stable if
 * Intuit moves its default; raising it is a deliberate, tested change.
 */
export const QBO_MINOR_VERSION = 75;

export const QBO_OAUTH_ENDPOINTS = Object.freeze({
  authorize: "https://appcenter.intuit.com/connect/oauth2",
  token: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  revoke: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
});

export const QBO_API_BASE_URLS = Object.freeze({
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
});

export type QboEnvironment = keyof typeof QBO_API_BASE_URLS;

/**
 * Documented Intuit REST limits per realm: 500 requests/minute, 10 requests/second (per realm and
 * app), 10 concurrent requests, a 1000-entity query page. Throttled calls get HTTP 429.
 */
export const QBO_PROVIDER_LIMITS = Object.freeze({
  requestsPerMinutePerRealm: 500,
  requestsPerSecondPerRealm: 10,
  concurrentRequestsPerRealm: 10,
  queryMaxResults: 1000,
});

export const QBO_ENV_KEYS = Object.freeze({
  clientId: "QUICKBOOKS_CLIENT_ID",
  clientSecret: "QUICKBOOKS_CLIENT_SECRET",
  redirectUri: "QUICKBOOKS_REDIRECT_URI",
  environment: "QUICKBOOKS_ENVIRONMENT",
});

/**
 * QBO realm (company) ids are numeric strings. Only digits are accepted, at most 20 of them, so a
 * realm id can never become a host, a path segment separator, a traversal sequence, a query
 * string or SQL. Format validity is NOT authorization: binding a realm to a workspace and
 * business is the connection layer's job.
 */
export const QBO_REALM_ID_PATTERN = /^[0-9]{1,20}$/;

export function isValidRealmId(value: unknown): value is string {
  return typeof value === "string" && QBO_REALM_ID_PATTERN.test(value);
}

export interface QboCredentials {
  readonly clientId: string;
  /** `Basic base64(clientId:clientSecret)` for Intuit's token and revoke endpoints. */
  basicAuthorization(): string;
}

export interface QboProviderConfig {
  readonly environment: QboEnvironment;
  readonly redirectUri: string;
  readonly scope: typeof QBO_ACCOUNTING_SCOPE;
  readonly authorizationUrl: string;
  readonly tokenUrl: string;
  readonly revokeUrl: string;
  readonly apiBaseUrl: string;
  readonly minorVersion: number;
  readonly credentials: QboCredentials;
}

export type QboConfigResult =
  | { available: true; config: QboProviderConfig }
  | { available: false; missing: string[]; invalid: string[] };

function clean(v: string | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Printable ASCII with no whitespace: rules out header/URL injection through credentials. */
const CREDENTIAL_PATTERN = /^[\x21-\x7e]+$/;

/**
 * Intuit redirect-URI rules: https everywhere; plain http only for `localhost` and only in
 * sandbox; no IP addresses; no embedded credentials; no fragment.
 */
export function isAcceptableRedirectUri(uri: string, environment: QboEnvironment): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.username !== "" || u.password !== "" || u.hash !== "") return false;
  if (uri.includes("#")) return false;
  const host = u.hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false; // IPv4 / IPv6 literals
  if (u.protocol === "https:") return true;
  return environment === "sandbox" && u.protocol === "http:" && host === "localhost";
}

/**
 * Configs produced by resolveQboConfig, and only those. The OAuth functions and the API client refuse
 * any other object, so a hand-built config (for example one pointing at an attacker-chosen host)
 * can never be used to send client credentials or bearer tokens anywhere but Intuit.
 */
const RESOLVED_CONFIGS = new WeakSet<object>();

export function isResolvedQboConfig(config: unknown): config is QboProviderConfig {
  return typeof config === "object" && config !== null && RESOLVED_CONFIGS.has(config);
}

function makeCredentials(clientId: string, clientSecret: string): QboCredentials {
  const authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
  const credentials = {
    clientId,
    basicAuthorization: () => authorization,
  };
  // Make the object log-safe: the authorization header (which encodes the secret) is reachable only
  // through the function above, and every serializer sees a redacted shape.
  Object.defineProperty(credentials, "toJSON", { value: () => ({ clientId, clientSecret: "[REDACTED]" }) });
  Object.defineProperty(credentials, inspect.custom, {
    value: () => `QboCredentials { clientId: '${clientId}', clientSecret: '[REDACTED]' }`,
  });
  return Object.freeze(credentials) as QboCredentials;
}

/**
 * Resolve QuickBooks provider configuration from an env record.
 *
 * Fail closed: any missing or invalid value yields `{ available: false }` naming the offending
 * variables (never their values). The environment must be stated explicitly — there is no default,
 * so a missing or mistyped value can never silently select sandbox over production or the reverse.
 */
export function resolveQboConfig(env: Record<string, string | undefined>): QboConfigResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  const clientId = clean(env[QBO_ENV_KEYS.clientId]);
  const clientSecret = clean(env[QBO_ENV_KEYS.clientSecret]);
  const redirectUri = clean(env[QBO_ENV_KEYS.redirectUri]);
  const environmentRaw = clean(env[QBO_ENV_KEYS.environment]).toLowerCase();

  if (!clientId) missing.push(QBO_ENV_KEYS.clientId);
  else if (!CREDENTIAL_PATTERN.test(clientId)) invalid.push(QBO_ENV_KEYS.clientId);
  if (!clientSecret) missing.push(QBO_ENV_KEYS.clientSecret);
  else if (!CREDENTIAL_PATTERN.test(clientSecret)) invalid.push(QBO_ENV_KEYS.clientSecret);
  if (!redirectUri) missing.push(QBO_ENV_KEYS.redirectUri);
  if (!environmentRaw) missing.push(QBO_ENV_KEYS.environment);
  else if (environmentRaw !== "sandbox" && environmentRaw !== "production") invalid.push(QBO_ENV_KEYS.environment);

  const environment = environmentRaw === "sandbox" || environmentRaw === "production" ? environmentRaw : null;
  if (redirectUri && environment && !isAcceptableRedirectUri(redirectUri, environment)) {
    invalid.push(QBO_ENV_KEYS.redirectUri);
  }

  if (missing.length > 0 || invalid.length > 0 || environment === null) {
    return { available: false, missing, invalid };
  }

  const resolved: QboProviderConfig = Object.freeze({
      environment,
      redirectUri,
      scope: QBO_ACCOUNTING_SCOPE,
      authorizationUrl: QBO_OAUTH_ENDPOINTS.authorize,
      tokenUrl: QBO_OAUTH_ENDPOINTS.token,
      revokeUrl: QBO_OAUTH_ENDPOINTS.revoke,
      apiBaseUrl: QBO_API_BASE_URLS[environment],
      minorVersion: QBO_MINOR_VERSION,
      credentials: makeCredentials(clientId, clientSecret),
    });
  RESOLVED_CONFIGS.add(resolved);
  return { available: true, config: resolved };
}
