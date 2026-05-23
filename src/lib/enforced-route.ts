/**
 * PHASE I10.2: ENFORCED API ROUTE WRAPPER
 *
 * Mandatory wrapper for all API routes.
 * Ensures NO route bypasses: runtime context, health checks, error handling, audit.
 * Replaces withRequestContext() to integrate with enforceRequest() layer.
 */

import { NextRequest, NextResponse } from "next/server";
import { enforceRequest, EnforcedRequestContext } from "@/runtime/enforcement/request-enforcer";

export type EnforcedHandler = (
  context: EnforcedRequestContext,
  params: Record<string, string>
) => Promise<unknown>;

export type EnforcedHandlerWithRequest = (
  req: NextRequest,
  context: EnforcedRequestContext,
  params: Record<string, string>
) => Promise<unknown>;

/**
 * MANDATORY: Wrap all API route handlers with enforceRequest() enforcement.
 *
 * Usage:
 * ```
 * const handler = withEnforcement(async (ctx, params) => {
 *   return { data: "result" };
 * });
 *
 * export const GET = handler;
 * export const POST = handler;
 * ```
 */
export function withEnforcement(
  handler: EnforcedHandler,
  options?: {
    require_workspace_id?: boolean;
    require_execution_id?: boolean;
    bypass_health_check?: boolean;
    skipReadinessCheck?: boolean;
  }
): (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<NextResponse> {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const params = await context.params;

    return enforceRequest(
      req,
      async (enforcedCtx) => {
        return await handler(enforcedCtx, params);
      },
      options
    );
  };
}

/**
 * MANDATORY: Wrap route handlers that need access to the full NextRequest.
 * Most existing routes need this because they access body, headers, search params.
 *
 * Usage:
 * ```
 * const handler = withEnforcementFull(async (req, ctx, params) => {
 *   const body = await req.json();
 *   const searchParams = req.nextUrl.searchParams;
 *   return { processed: true };
 * });
 *
 * export const GET = handler;
 * export const POST = handler;
 * ```
 */
export function withEnforcementFull(
  handler: EnforcedHandlerWithRequest,
  options?: {
    require_workspace_id?: boolean;
    require_execution_id?: boolean;
    bypass_health_check?: boolean;
    skipReadinessCheck?: boolean;
  }
): (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<NextResponse> {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const params = await context.params;

    return enforceRequest(
      req,
      async (enforcedCtx) => {
        return await handler(req, enforcedCtx, params);
      },
      options
    );
  };
}

/**
 * MANDATORY: Get params from route context with async handling.
 * Use in handlers that need dynamic route segments.
 *
 * Example: /leads/[leadId]
 * ```
 * const handler = withEnforcement(async (ctx, params) => {
 *   const leadId = params.leadId;
 *   return { lead: await getLead(leadId) };
 * });
 * ```
 */
export async function getRouteParams(
  context: { params: Promise<Record<string, string>> }
): Promise<Record<string, string>> {
  return context.params;
}
