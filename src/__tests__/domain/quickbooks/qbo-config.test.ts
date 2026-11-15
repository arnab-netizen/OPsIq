import { describe, it, expect } from "vitest";
import { inspect } from "node:util";
import {
  QBO_REALM_ID_MAX_LENGTH,
  QBO_ACCOUNTING_SCOPE,
  QBO_API_BASE_URLS,
  QBO_OAUTH_ENDPOINTS,
  QBO_PKCE_PARAMETERS_SENT,
  isAcceptableRedirectUri,
  isValidRealmId,
  resolveQboConfig,
} from "@/domain/quickbooks/qbo-config";

const SECRET = "s3cr3t-client-secret-VALUE";
const good = (over: Record<string, string | undefined> = {}) => ({
  QUICKBOOKS_CLIENT_ID: "client-id-123",
  QUICKBOOKS_CLIENT_SECRET: SECRET,
  QUICKBOOKS_REDIRECT_URI: "https://app.opsiq.example/api/cb",
  QUICKBOOKS_ENVIRONMENT: "sandbox",
  ...over,
});

describe("resolveQboConfig", () => {
  it("resolves sandbox to the sandbox API host and fixed Intuit OAuth endpoints", () => {
    const r = resolveQboConfig(good());
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.config.environment).toBe("sandbox");
    expect(r.config.apiBaseUrl).toBe("https://sandbox-quickbooks.api.intuit.com");
    expect(r.config.authorizationUrl).toBe(QBO_OAUTH_ENDPOINTS.authorize);
    expect(r.config.tokenUrl).toBe("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer");
    expect(r.config.revokeUrl).toBe("https://developer.api.intuit.com/v2/oauth2/tokens/revoke");
  });

  it("resolves production to the production API host", () => {
    const r = resolveQboConfig(good({ QUICKBOOKS_ENVIRONMENT: "production" }));
    expect(r.available && r.config.apiBaseUrl).toBe("https://quickbooks.api.intuit.com");
    expect(QBO_API_BASE_URLS.production).toBe("https://quickbooks.api.intuit.com");
  });

  it("accepts environment case-insensitively but only sandbox|production", () => {
    expect(resolveQboConfig(good({ QUICKBOOKS_ENVIRONMENT: " Production " })).available).toBe(true);
    for (const bad of ["prod", "staging", "live", "sandbox,production"]) {
      const r = resolveQboConfig(good({ QUICKBOOKS_ENVIRONMENT: bad }));
      expect(r.available).toBe(false);
      if (!r.available) expect(r.invalid).toContain("QUICKBOOKS_ENVIRONMENT");
    }
  });

  it("never defaults the environment: missing means unavailable, not sandbox and not production", () => {
    const r = resolveQboConfig(good({ QUICKBOOKS_ENVIRONMENT: undefined }));
    expect(r.available).toBe(false);
    if (!r.available) expect(r.missing).toEqual(["QUICKBOOKS_ENVIRONMENT"]);
  });

  it("fails closed naming each missing variable (never values)", () => {
    const r = resolveQboConfig({});
    expect(r.available).toBe(false);
    if (r.available) return;
    expect(r.missing.sort()).toEqual(
      ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET", "QUICKBOOKS_ENVIRONMENT", "QUICKBOOKS_REDIRECT_URI"].sort(),
    );
    const missingClientId = resolveQboConfig(good({ QUICKBOOKS_CLIENT_ID: "  " }));
    expect(!missingClientId.available && missingClientId.missing).toEqual(["QUICKBOOKS_CLIENT_ID"]);
    const missingSecret = resolveQboConfig(good({ QUICKBOOKS_CLIENT_SECRET: "" }));
    expect(!missingSecret.available && missingSecret.missing).toEqual(["QUICKBOOKS_CLIENT_SECRET"]);
  });

  it("rejects credentials containing whitespace or control characters (header injection)", () => {
    expect(resolveQboConfig(good({ QUICKBOOKS_CLIENT_ID: "id with space" })).available).toBe(false);
    expect(resolveQboConfig(good({ QUICKBOOKS_CLIENT_SECRET: "a\r\nX-Evil: 1" })).available).toBe(false);
  });

  describe("redirect URI", () => {
    it("requires https in production and does not downgrade localhost/http", () => {
      for (const uri of ["http://localhost:3000/cb", "http://app.opsiq.example/cb", "http://127.0.0.1/cb"]) {
        expect(resolveQboConfig(good({ QUICKBOOKS_ENVIRONMENT: "production", QUICKBOOKS_REDIRECT_URI: uri })).available).toBe(false);
      }
      expect(resolveQboConfig(good({ QUICKBOOKS_ENVIRONMENT: "production", QUICKBOOKS_REDIRECT_URI: "https://app.opsiq.example/cb" })).available).toBe(true);
    });

    it("allows http://localhost in sandbox only (not IP addresses, not other http hosts)", () => {
      expect(isAcceptableRedirectUri("http://localhost:3000/cb", "sandbox")).toBe(true);
      expect(isAcceptableRedirectUri("http://127.0.0.1:3000/cb", "sandbox")).toBe(false);
      expect(isAcceptableRedirectUri("http://[::1]:3000/cb", "sandbox")).toBe(false);
      expect(isAcceptableRedirectUri("http://staging.opsiq.example/cb", "sandbox")).toBe(false);
      expect(isAcceptableRedirectUri("https://10.0.0.5/cb", "sandbox")).toBe(false);
    });

    it("rejects malformed, credentialed, fragment and non-http(s) redirect URIs", () => {
      for (const uri of ["not a url", "javascript:alert(1)", "https://user:pw@app.opsiq.example/cb", "https://app.opsiq.example/cb#frag", "ftp://app.opsiq.example/cb"]) {
        expect(isAcceptableRedirectUri(uri, "sandbox")).toBe(false);
      }
    });
  });

  it("locks the scope to accounting and sends no PKCE parameters", () => {
    const r = resolveQboConfig(good());
    expect(r.available && r.config.scope).toBe("com.intuit.quickbooks.accounting");
    expect(QBO_ACCOUNTING_SCOPE).toBe("com.intuit.quickbooks.accounting");
    expect(QBO_PKCE_PARAMETERS_SENT).toBe(false);
  });

  it("the client secret is not reachable through JSON, inspect or enumeration", () => {
    const r = resolveQboConfig(good());
    expect(r.available).toBe(true);
    if (!r.available) return;
    const asJson = JSON.stringify(r.config);
    expect(asJson).not.toContain(SECRET);
    expect(asJson).not.toContain(Buffer.from(`client-id-123:${SECRET}`).toString("base64"));
    expect(inspect(r.config, { depth: 5 })).not.toContain(SECRET);
    expect(inspect(r.config.credentials)).not.toContain(SECRET);
    expect(Object.values(r.config).some((v) => v === SECRET)).toBe(false);
    expect(r.config.credentials.basicAuthorization()).toBe(`Basic ${Buffer.from(`client-id-123:${SECRET}`).toString("base64")}`);
  });

  it("the resolved config is frozen", () => {
    const r = resolveQboConfig(good());
    expect(r.available && Object.isFrozen(r.config)).toBe(true);
  });
});

describe("isValidRealmId", () => {
  it("accepts digit-only ids and rejects anything that could alter a URL, path or query", () => {
    expect(isValidRealmId("9130357000000001")).toBe(true);
    expect(isValidRealmId("123")).toBe(true);
    for (const bad of ["", "abc", "123/../456", "123?x=1", "123#", "12 3", "123\n", "1".repeat(65), "../", "12.3", "-1", "1e5", "%32", "evil.com", "123@evil.com"]) {
      expect(isValidRealmId(bad)).toBe(false);
    }
    // No Intuit-documented maximum exists: 20 digits is NOT a limit (the old assumption), only the defensive bound is.
    expect(isValidRealmId("1".repeat(21))).toBe(true);
    expect(isValidRealmId("9".repeat(QBO_REALM_ID_MAX_LENGTH))).toBe(true);
    expect(isValidRealmId(123 as unknown)).toBe(false);
    expect(isValidRealmId(null as unknown)).toBe(false);
  });
});
