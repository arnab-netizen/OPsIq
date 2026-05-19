import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Governance enforcement middleware
export interface GovernedRequest {
  authToken: string;
  workspaceId: string;
  userId: string;
  idempotencyKey: string | null;
}

// In-memory caches for demo (should use Redis in production)
const idempotencyCache = new Map<string, { response: any; timestamp: number }>();
const auditLog: any[] = [];

// Governance enforcement function
export async function enforceGovernance(
  req: NextRequest,
  schema: z.ZodSchema,
  options: { requireWorkspaceMatch?: boolean } = {}
): Promise<{
  govReq: GovernedRequest;
  body: any;
}> {
  // Step 1: Authenticate - check for X-Auth-Token header
  const authToken = req.headers.get('X-Auth-Token');
  if (!authToken) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', code: 'NO_AUTH_TOKEN' },
      { status: 401 }
    ) as any;
  }

  // Step 2: Extract workspace context from header
  const workspaceHeader = req.headers.get('X-Workspace-Id');
  if (!workspaceHeader) {
    return NextResponse.json(
      { error: 'FORBIDDEN', code: 'NO_WORKSPACE_HEADER' },
      { status: 403 }
    ) as any;
  }

  // Step 3: Parse request body
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', code: 'INVALID_JSON' },
      { status: 400 }
    ) as any;
  }

  // Step 4: Validate payload schema
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', code: 'INVALID_PAYLOAD', issues: parsed.error.issues },
      { status: 400 }
    ) as any;
  }

  // Step 5: Validate workspace match (check both root and nested payload)
  if (options.requireWorkspaceMatch) {
    const payloadWorkspaceId = body.workspaceId || (body.payload && body.payload.workspaceId);
    if (payloadWorkspaceId && payloadWorkspaceId !== workspaceHeader) {
      return NextResponse.json(
        { error: 'FORBIDDEN', code: 'WORKSPACE_MISMATCH', detail: `Header: ${workspaceHeader}, Payload: ${payloadWorkspaceId}` },
        { status: 403 }
      ) as any;
    }
  }

  // Step 6: Enforce idempotency
  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (idempotencyKey) {
    const cached = idempotencyCache.get(idempotencyKey);
    if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute window
      // Return cached response immediately
      return NextResponse.json(cached.response, {
        status: 200,
        headers: { 'X-Idempotency-Cache-Hit': 'true' }
      }) as any;
    }
  }

  // Step 7: Emit audit event
  auditLog.push({
    timestamp: new Date().toISOString(),
    endpoint: req.nextUrl.pathname,
    method: req.method,
    authToken: authToken.substring(0, 10) + '***',
    workspaceId: workspaceHeader,
    action: body.action || body.feedbackType || 'unknown',
    status: 'received',
  });

  return {
    govReq: {
      authToken,
      workspaceId: workspaceHeader,
      userId: authToken.split(':')[0],
      idempotencyKey,
    },
    body: parsed.data,
  };
}

export function cacheResponse(idempotencyKey: string | null, response: any) {
  if (idempotencyKey) {
    idempotencyCache.set(idempotencyKey, {
      response,
      timestamp: Date.now(),
    });
  }
}

export function getAuditLog() {
  return auditLog;
}
