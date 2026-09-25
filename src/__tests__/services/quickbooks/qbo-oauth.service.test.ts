/**
 * Unit tests for qbo-oauth.service.ts — pure provider calls, fetch mocked via
 * the injectable `fetchImpl`. No DB, no network.
 */
import { describe, it, expect, vi } from "vitest";
import {
  buildQboAuthorizationUrl,
  exchangeQboAuthorizationCode,
  refreshQboTokens,
  revokeQboToken,
} from "@/services/quickbooks/qbo-oauth.service";
import { QboApiError } from "@/domain/quickbooks/qbo-contracts";
import { QBO_OAUTH_ENDPOINTS, QBO_ACCOUNTING_SCOPE, type QboAppConfig } from "@/domain/quickbooks/qbo-config";

const config: QboAppConfig = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret-super-secret",
  redirectUri: "https://app.example.com/callback",
  environment: "sandbox",
  webhookVerifierToken: null,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("buildQboAuthorizationUrl", () => {
  it("includes response_type, client_id, redirect_uri, scope and state", () => {
    const url = new URL(buildQboAuthorizationUrl(config, "opaque-state-value"));
    expect(url.origin + url.pathname).toBe(QBO_OAUTH_ENDPOINTS.authorize);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(config.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("scope")).toBe(QBO_ACCOUNTING_SCOPE);
    expect(url.searchParams.get("state")).toBe("opaque-state-value");
  });

  it("rejects an empty state", () => {
    expect(() => buildQboAuthorizationUrl(config, "")).toThrow(QboApiError);
  });
});

describe("exchangeQboAuthorizationCode", () => {
  it("posts grant_type=authorization_code with Basic auth and parses the token response", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(QBO_OAUTH_ENDPOINTS.token);
      expect(init.method).toBe("POST");
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(
        `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      );
      expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(headers.Accept).toBe("application/json");
      const body = new URLSearchParams(init.body as string);
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("auth-code-123");
      expect(body.get("redirect_uri")).toBe(config.redirectUri);
      return jsonResponse(200, {
        access_token: "access-abc",
        refresh_token: "refresh-abc",
        token_type: "bearer",
        expires_in: 3600,
        x_refresh_token_expires_in: 8726400,
      });
    });

    const result = await exchangeQboAuthorizationCode(config, "auth-code-123", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.accessToken).toBe("access-abc");
    expect(result.refreshToken).toBe("refresh-abc");
    expect(result.expiresInSeconds).toBe(3600);
    expect(result.refreshTokenExpiresInSeconds).toBe(8726400);
    expect(result.refreshTokenHardExpiresInSeconds).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies invalid_grant as AUTH", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, { error: "invalid_grant" }));
    await expect(
      exchangeQboAuthorizationCode(config, "bad-code", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ kind: "AUTH" });
  });

  it("classifies a 401 as AUTH even without invalid_grant", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: "unauthorized" }));
    await expect(
      exchangeQboAuthorizationCode(config, "bad-code", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ kind: "AUTH" });
  });

  it("classifies a 5xx as TRANSIENT", async () => {
    const fetchImpl = vi.fn(async () => new Response("Server Error", { status: 503 }));
    await expect(
      exchangeQboAuthorizationCode(config, "code", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ kind: "TRANSIENT" });
  });

  it("classifies a fetch network error as TRANSIENT", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(
      exchangeQboAuthorizationCode(config, "code", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ kind: "TRANSIENT" });
  });

  it("classifies an abort (timeout) as TIMEOUT", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    await expect(
      exchangeQboAuthorizationCode(config, "code", { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5 }),
    ).rejects.toMatchObject({ kind: "TIMEOUT" });
  });

  it("classifies a non-JSON body as MALFORMED", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>not json</html>", { status: 200 }));
    await expect(
      exchangeQboAuthorizationCode(config, "code", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ kind: "MALFORMED" });
  });

  it("classifies a JSON body missing required fields as MALFORMED", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { access_token: "only-this" }));
    await expect(
      exchangeQboAuthorizationCode(config, "code", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ kind: "MALFORMED" });
  });

  it("rejects a missing code without calling fetch", async () => {
    const fetchImpl = vi.fn();
    await expect(
      exchangeQboAuthorizationCode(config, "", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ kind: "VALIDATION" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("refreshQboTokens", () => {
  it("posts grant_type=refresh_token and returns the rotated refresh token", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(init.body as string);
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("old-refresh-token");
      return jsonResponse(200, {
        access_token: "new-access",
        refresh_token: "rotated-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        x_refresh_token_expires_in: 8726400,
        x_refresh_token_hard_expires_in: 8726400,
      });
    });
    const result = await refreshQboTokens(config, "old-refresh-token", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.refreshToken).toBe("rotated-refresh-token");
    expect(result.refreshTokenHardExpiresInSeconds).toBe(8726400);
  });

  it("classifies invalid_grant on refresh as AUTH (reuse of a rotated-out refresh token)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, { error: "invalid_grant" }));
    await expect(
      refreshQboTokens(config, "stale-refresh-token", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ kind: "AUTH" });
  });
});

describe("revokeQboToken", () => {
  it("posts a JSON body {token} with Basic auth and resolves on 200", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(QBO_OAUTH_ENDPOINTS.revoke);
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(
        `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      );
      expect(headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(init.body as string)).toEqual({ token: "refresh-to-revoke" });
      return new Response(null, { status: 200 });
    });
    await expect(
      revokeQboToken(config, "refresh-to-revoke", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBeUndefined();
  });

  it("classifies a 5xx on revoke as TRANSIENT", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 }));
    await expect(
      revokeQboToken(config, "tok", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ kind: "TRANSIENT" });
  });
});

describe("no secrets leak into thrown errors", () => {
  it("AUTH error message from an invalid_grant response never contains the client secret or code", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, { error: "invalid_grant", error_description: "token expired" }));
    try {
      await exchangeQboAuthorizationCode(config, "super-secret-auth-code", { fetchImpl: fetchImpl as unknown as typeof fetch });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(QboApiError);
      const message = (err as QboApiError).message;
      expect(message).not.toContain(config.clientSecret);
      expect(message).not.toContain("super-secret-auth-code");
    }
  });

  it("a refresh-token failure message never contains the raw refresh token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, { error: "invalid_grant" }));
    try {
      await refreshQboTokens(config, "extremely-secret-refresh-token", { fetchImpl: fetchImpl as unknown as typeof fetch });
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = (err as QboApiError).message;
      expect(message).not.toContain("extremely-secret-refresh-token");
    }
  });
});
