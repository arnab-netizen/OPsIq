import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceGovernance, cacheResponse } from '@/lib/governance-enforcement';
import { operatorTelemetry } from '@/infra/operator-telemetry';

// 1. Define validated schema
const TelemetryPayloadSchema = z.object({
  actorId: z.string().min(1),
  workspaceId: z.string().min(1),
  page: z.string().min(1),
  visitId: z.string().optional(),
  actionType: z.string().optional(),
  result: z.enum(['success', 'failure']).optional(),
  errorMessage: z.string().optional(),
  actionCount: z.number().optional(),
  errorCount: z.number().optional(),
});

const TelemetryRequestSchema = z.object({
  action: z.enum(['pageVisit', 'trackAction', 'pageExit']),
  payload: TelemetryPayloadSchema,
});

// 2. Route handler with governance enforcement
export async function POST(request: NextRequest) {
  // Step 1-5: Governance enforcement chain
  // - Authenticate (check X-Auth-Token header)
  // - Derive workspace context (X-Workspace-Id header)
  // - Validate workspace membership
  // - Validate payload schema
  // - Enforce idempotency
  const enforcement = await enforceGovernance(request, TelemetryRequestSchema, {
    requireWorkspaceMatch: true,
  });

  // Return error if governance enforcement failed
  if (enforcement instanceof NextResponse) {
    return enforcement;
  }

  const { govReq, body } = enforcement;

  // Step 6: Execute business logic (now guaranteed to have valid auth + workspace + payload)
  let result: any;

  if (body.action === 'pageVisit') {
    const visitId = operatorTelemetry.trackPageVisit({
      actorId: body.payload.actorId,
      workspaceId: body.payload.workspaceId,
      page: body.payload.page,
    });
    result = { visitId };
  } else if (body.action === 'trackAction') {
    await operatorTelemetry.trackAction({
      actorId: body.payload.actorId,
      workspaceId: body.payload.workspaceId,
      actionType: body.payload.actionType || 'unknown',
      result: body.payload.result || 'unknown',
      page: body.payload.page,
      errorMessage: body.payload.errorMessage,
    });
    result = { success: true };
  } else if (body.action === 'pageExit') {
    operatorTelemetry.trackPageExit({
      actorId: body.payload.actorId,
      workspaceId: body.payload.workspaceId,
      page: body.payload.page,
      visitId: body.payload.visitId || '',
      actionCount: body.payload.actionCount || 0,
      errorCount: body.payload.errorCount || 0,
    });
    result = { success: true };
  }

  // Step 7: Cache response for idempotency
  cacheResponse(govReq.idempotencyKey, result);

  // Step 8: Return success response
  return NextResponse.json(result, { status: 200 });
}

