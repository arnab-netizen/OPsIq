/**
 * Generalized Idempotency Enforcement Middleware
 *
 * Applies idempotency key tracking to any route handler.
 * Prevents duplicate request processing through:
 * - Request deduplication (same key returns cached response)
 * - Concurrent request handling (waiters get result when pending completes)
 * - Payload validation (reuse detected with different payload returns 400)
 *
 * Can be applied to all POST endpoints for duplicate prevention.
 */

import { NextRequest, NextResponse } from "next/server";
import { getIdempotencyStore } from "@/infra/idempotency-store-memory";
import { createHash } from "crypto";

export interface IdempotencyOptions {
  ttlMs?: number; // TTL in milliseconds (default 24 hours)
  requireWorkspaceId?: boolean; // Require x-workspace-id header
  timeoutMs?: number; // Timeout for concurrent request waiting
}

// Track pending operations to prevent concurrent creates
const pendingOperations = new Map<string, Promise<void>>();
const creationInProgress = new Map<string, Promise<void>>();

/**
 * Compute hash of request payload for duplicate detection
 */
function computePayloadHash(body: unknown): string {
  try {
    const normalized = JSON.stringify(body);
    return createHash("sha256").update(normalized).digest("hex");
  } catch {
    return "unknown";
  }
}

/**
 * Wrap a route handler with idempotency enforcement
 *
 * Usage:
 *   export const POST = withIdempotencyEnforcement(
 *     async (request, context) => {
 *       // handler logic
 *     },
 *     { ttlMs: 24 * 60 * 60 * 1000 }
 *   );
 */
export function withIdempotencyEnforcement(
  handler: (request: NextRequest, ...args: unknown[]) => Promise<NextResponse>,
  options: IdempotencyOptions = {}
): (request: NextRequest, ...args: unknown[]) => Promise<NextResponse> {
  return (async (request: NextRequest, ...args: unknown[]): Promise<NextResponse> => {
    const store = getIdempotencyStore();
    const idempotencyKey = request.headers.get("Idempotency-Key");

    // If no idempotency key, pass through to handler
    if (!idempotencyKey) {
      return handler(request, ...args);
    }

    // Validate workspace scoping if required
    if (options.requireWorkspaceId) {
      const workspaceId = request.headers.get("x-workspace-id");
      if (!workspaceId) {
        return NextResponse.json(
          {
            error: "IDEMPOTENCY_ERROR",
            message: "x-workspace-id header required with Idempotency-Key",
          },
          { status: 400 }
        );
      }
    }

    // Scope idempotency key to workspace if available
    const workspaceId = request.headers.get("x-workspace-id");
    const scopedKey = workspaceId ? `${workspaceId}:${idempotencyKey}` : idempotencyKey;

    // Parse body for payload hash and create new request with body
    let bodyData: unknown = null;
    let bodyText = "";
    try {
      bodyText = await request.text();
      bodyData = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      // If body not JSON, just proceed
    }

    const payloadHash = bodyData ? computePayloadHash(bodyData) : undefined;

    // Create new request with body (original is consumed)
    const newRequest = new NextRequest(request, { body: bodyText || undefined });

    // Try to claim creation for this key
    if (creationInProgress.has(scopedKey)) {
      // Another request is creating this key, wait for it
      await creationInProgress.get(scopedKey);

      // After creation is done, check the result
      const existing = await store.get(scopedKey);
      if (!existing) {
        // Record was created but then expired/deleted, treat as not found
        return NextResponse.json(
          {
            error: "IDEMPOTENCY_ERROR",
            message: "Idempotency key record expired",
          },
          { status: 400 }
        );
      }

      // Payload validation: reject if reused with different payload
      if (payloadHash && existing.payload && existing.payload !== payloadHash) {
        return NextResponse.json(
          {
            error: "IDEMPOTENCY_ERROR",
            message: "Idempotency key reused with different request body",
          },
          { status: 400 }
        );
      }

      // If completed, return cached response
      if (existing.status === "completed") {
        const response = NextResponse.json(existing.response, { status: 200 });
        response.headers.set("x-idempotency-replayed", "true");
        response.headers.set("x-idempotency-key", idempotencyKey);
        return response;
      }

      // If pending, wait for completion
      if (existing.status === "pending") {
        try {
          const completed = await store.waitForCompletion(scopedKey, options.timeoutMs ?? 30000);
          const response = NextResponse.json(completed.response, { status: 200 });
          response.headers.set("x-idempotency-replayed", "true");
          response.headers.set("x-idempotency-key", idempotencyKey);
          return response;
        } catch (error) {
          return NextResponse.json(
            {
              error: "IDEMPOTENCY_TIMEOUT",
              message: `Concurrent request timeout for ${idempotencyKey}`,
            },
            { status: 504 }
          );
        }
      }
    }

    // Mark creation as in-progress atomically
    let resolveCreation: () => void;
    const creationPromise = new Promise<void>((resolve) => {
      resolveCreation = resolve;
    });
    creationInProgress.set(scopedKey, creationPromise);

    // Check for existing record (should be null since we now have creation lock)
    const existing = await store.get(scopedKey);

    if (existing) {
      // Payload validation: reject if reused with different payload
      if (payloadHash && existing.payload && existing.payload !== payloadHash) {
        resolveCreation!();
        creationInProgress.delete(scopedKey);
        return NextResponse.json(
          {
            error: "IDEMPOTENCY_ERROR",
            message: "Idempotency key reused with different request body",
          },
          { status: 400 }
        );
      }

      // If already completed, return cached response
      if (existing.status === "completed") {
        resolveCreation!();
        creationInProgress.delete(scopedKey);
        const response = NextResponse.json(existing.response, { status: 200 });
        response.headers.set("x-idempotency-replayed", "true");
        response.headers.set("x-idempotency-key", idempotencyKey);
        return response;
      }

      // If still pending, wait for completion (concurrent request)
      if (existing.status === "pending") {
        resolveCreation!();
        creationInProgress.delete(scopedKey);
        try {
          const completed = await store.waitForCompletion(scopedKey, options.timeoutMs ?? 30000);
          const response = NextResponse.json(completed.response, { status: 200 });
          response.headers.set("x-idempotency-replayed", "true");
          response.headers.set("x-idempotency-key", idempotencyKey);
          return response;
        } catch (error) {
          return NextResponse.json(
            {
              error: "IDEMPOTENCY_TIMEOUT",
              message: `Concurrent request timeout for ${idempotencyKey}`,
            },
            { status: 504 }
          );
        }
      }
    }

    // Mark operation as pending for completion tracking
    let resolveOperation: () => void;
    const operationPromise = new Promise<void>((resolve) => {
      resolveOperation = resolve;
    });
    pendingOperations.set(scopedKey, operationPromise);

    // Create pending record
    const record = await store.create(
      scopedKey,
      newRequest.url,
      payloadHash,
      options.ttlMs ?? 24 * 60 * 60 * 1000
    );

    // Creation is complete
    resolveCreation!();
    creationInProgress.delete(scopedKey);

    try {
      // Call handler with new request
      const response = await handler(newRequest, ...args);

      // Read response body if JSON
      let responseData: unknown = null;
      try {
        const clone = response.clone();
        responseData = await clone.json();
      } catch {
        // Response not JSON, just store null
        responseData = null;
      }

      // Update record with response
      await store.update(scopedKey, responseData, "completed");

      // Notify other waiting requests
      resolveOperation!();
      pendingOperations.delete(scopedKey);

      // Return response with idempotency header
      const respHeaders = new Headers(response.headers);
      respHeaders.set("x-idempotency-key", idempotencyKey);

      const respWithHeaders = new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
      });
      return respWithHeaders;
    } catch (error) {
      // Update record with failure
      await store.update(scopedKey, { error: String(error) }, "failed");

      // Notify other waiting requests
      resolveOperation!();
      pendingOperations.delete(scopedKey);

      throw error;
    }
  }) as (request: NextRequest, ...args: unknown[]) => Promise<NextResponse>;
}

/**
 * Extract idempotency key from request
 */
export function getIdempotencyKey(request: NextRequest): string | null {
  return request.headers.get("Idempotency-Key");
}

/**
 * Check if request is an idempotency replay
 */
export function isIdempotencyReplay(response: NextResponse): boolean {
  return response.headers.get("x-idempotency-replayed") === "true";
}
