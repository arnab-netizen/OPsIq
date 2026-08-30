/**
 * REPORTS PAGE ROOT-CAUSE FIX: HTTP-status-aware error classification.
 *
 * Root cause: client `if (!response.ok) throw new Error("Failed to fetch X")`
 * handlers discarded the real HTTP status and server error body. The generic
 * fallback message ("Failed to fetch...") then collided with the operator
 * error classifier's network-error keyword check (`message.includes("fetch")`),
 * so ANY non-2xx response -- 401, 403, 500, whatever -- rendered to the owner
 * as "Couldn't connect to the server," regardless of what actually happened.
 *
 * These tests prove the fix: HttpResponseError (built from a real fetch
 * Response via toHttpResponseError/httpResponseErrorFromBody) carries the
 * real status code, and classification is now status-driven for anything
 * that has a real HTTP response, never message-substring guessing.
 */
import { describe, it, expect } from "vitest";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import {
  toOperatorSafeError,
  toHttpResponseError,
  httpResponseErrorFromBody,
  HttpResponseError,
} from "@/lib/operator-safe-errors";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HTTP status-aware operator error classification", () => {
  describe("401 renders as an authentication error, never network", () => {
    it("classifyOperatorError does not classify a 401 as a connectivity error", async () => {
      const response = jsonResponse(401, { error: "Unauthorized", correlationId: "corr-1" });
      const httpError = await toHttpResponseError(response);

      const governed = classifyOperatorError(httpError, { context: "load" });

      expect(governed.operatorMessage).not.toContain("Couldn't connect");
      expect(governed.operatorMessage).not.toMatch(/connection/i);
      expect(governed.operatorMessage.toLowerCase()).toContain("sign in");
    });

    it("is stable even when the server's 401 message itself contains the word 'fetch'", async () => {
      // Regression guard for the exact collision that caused the bug: a
      // message containing "fetch" must not flip classification to network
      // once a real HTTP status is known.
      const response = jsonResponse(401, { error: "Failed to fetch report: session invalid" });
      const httpError = await toHttpResponseError(response);
      const safe = toOperatorSafeError(httpError, "load");

      expect(safe.error).not.toContain("Couldn't connect");
      expect(safe.error.toLowerCase()).toContain("sign in");
      expect(safe.shouldRetry).toBe(false);
    });
  });

  describe("403 renders as an authorization/capability error, never network", () => {
    it("classifies a capability-denial 403 as a permission error", async () => {
      const response = jsonResponse(403, { error: "Insufficient permissions", correlationId: "corr-2" });
      const httpError = await toHttpResponseError(response);

      const governed = classifyOperatorError(httpError, { context: "load" });

      expect(governed.operatorMessage).not.toContain("Couldn't connect");
      expect(governed.operatorMessage.toLowerCase()).toContain("permission");
      expect(governed.isRetryable).toBe(false);
    });

    it("classifies a workspace-context 403 distinctly from a plain permission denial", async () => {
      const response = jsonResponse(403, { error: "Workspace required", correlationId: "corr-3" });
      const httpError = await toHttpResponseError(response);

      const governed = classifyOperatorError(httpError, { context: "load" });

      expect(governed.operatorMessage).not.toContain("Couldn't connect");
      expect(governed.operatorMessage.toLowerCase()).toContain("workspace");
    });
  });

  describe("500 renders as a server error, never as network or authorization", () => {
    it("classifies a 500 as a server-trouble message, not a connectivity or permission one", async () => {
      const response = jsonResponse(500, {
        error: "Internal server error",
        correlationId: "corr-4",
        classification: "handler_invocation_failed",
      });
      const httpError = await toHttpResponseError(response);

      const governed = classifyOperatorError(httpError, { context: "load" });

      expect(governed.operatorMessage).not.toContain("Couldn't connect");
      expect(governed.operatorMessage.toLowerCase()).not.toContain("permission");
      expect(governed.operatorMessage.toLowerCase()).toContain("server");
      expect(governed.isRetryable).toBe(true);
    });
  });

  describe("A genuine browser fetch() rejection still classifies as connectivity", () => {
    it("a TypeError thrown before any response arrives is still a network error", () => {
      // This is what fetch() itself throws in real browsers when the
      // request never gets a response at all (no HttpResponseError exists
      // in this path -- there was no response to build one from).
      const networkFailure = new TypeError("Failed to fetch");

      const governed = classifyOperatorError(networkFailure, { context: "load" });

      expect(governed.operatorMessage).toContain("Couldn't connect");
      expect(governed.isRetryable).toBe(true);
    });

    it("a Firefox-style network rejection also classifies as connectivity", () => {
      const networkFailure = new TypeError("NetworkError when attempting to fetch resource.");
      const safe = toOperatorSafeError(networkFailure, "load");

      expect(safe.error).toContain("Couldn't connect");
      expect(safe.shouldRetry).toBe(true);
    });
  });

  describe("The governed API error message is preserved and surfaced", () => {
    it("surfaces the server's own operator-safe message for a non-401/403/5xx status", async () => {
      const response = jsonResponse(400, {
        error: "Couldn't load that data. Please refresh and try again.",
        correlationId: "corr-5",
      });
      const httpError = await toHttpResponseError(response);

      const safe = toOperatorSafeError(httpError, "load");

      expect(safe.error).toBe("Couldn't load that data. Please refresh and try again.");
    });

    it("httpResponseErrorFromBody preserves the server message for call sites that pre-parsed JSON", () => {
      const httpError = httpResponseErrorFromBody(403, { error: "Insufficient permissions" });

      expect(httpError.status).toBe(403);
      expect(httpError.hasServerMessage).toBe(true);
      expect(httpError.message).toBe("Insufficient permissions");

      const governed = classifyOperatorError(httpError, { context: "load" });
      expect(governed.operatorMessage).not.toContain("Couldn't connect");
    });

    it("falls back to a status-only message (never network text) when the body has no error field", async () => {
      const response = new Response("", { status: 503 });
      const httpError = await toHttpResponseError(response);

      expect(httpError.hasServerMessage).toBe(false);
      expect(httpError.status).toBe(503);

      const safe = toOperatorSafeError(httpError, "load");
      expect(safe.error).not.toContain("Couldn't connect");
      expect(safe.error.toLowerCase()).toContain("server");
    });
  });

  describe("No raw/sensitive server internals leak to the owner-facing UI", () => {
    it("never exposes stack traces, SQL, or provider payloads even when present in a status-tagged error", async () => {
      const response = jsonResponse(500, {
        error: "Internal server error",
        correlationId: "corr-6",
        // Simulates a route accidentally including extra diagnostic fields --
        // classification must not echo them into the operator message.
        stack: "at PrismaClient.$connect (/app/node_modules/@prisma/client/index.js:412:11)",
      });
      const httpError = await toHttpResponseError(response);
      const safe = toOperatorSafeError(httpError, "load");

      expect(safe.error).not.toContain("Prisma");
      expect(safe.error).not.toContain("node_modules");
      expect(safe.error).not.toMatch(/at\s+\w+\s+\(/);
    });

    it("HttpResponseError built from a response never carries the raw status text as a leak vector", () => {
      const err = new HttpResponseError("You don't have permission to do this.", 403, true);
      expect(err.name).toBe("HttpResponseError");
      expect(err.status).toBe(403);
    });
  });
});
