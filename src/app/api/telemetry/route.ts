import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceGovernanceRestored, cacheResponse } from '@/lib/governance-enforcement';
import { operatorTelemetry } from '@/infra/operator-telemetry';

// Define validated schema (workspace required for session lookup)
const TelemetryRequestSchema = z.object({
  action: z.enum(['pageVisit', 'trackAction', 'pageExit']),
  workspaceId: z.string().min(1), // Required for session lookup
  payload: z.object({
    page: z.string().min(1),
    visitId: z.string().optional(),
    actionType: z.string().optional(),
    result: z.enum(['success', 'failure']).optional(),
    errorMessage: z.string().optional(),
    actionCount: z.number().optional(),
    errorCount: z.number().optional(),
  }),
});

export async function POST(request: NextRequest) {
  // Restored governance enforcement using platform identity chain
  const enforcement = await enforceGovernanceRestored(request, TelemetryRequestSchema);

  if (enforcement instanceof NextResponse) {
    return enforcement;
  }

  const { enforced, body } = enforcement;

  // Execute business logic with VERIFIED identity from session
  let result: any;

  if (body.action === 'pageVisit') {
    const visitId = operatorTelemetry.trackPageVisit({
      actorId: enforced.verifiedActorId,
      workspaceId: enforced.verifiedWorkspaceId,
      page: body.payload.page,
    });
    result = { visitId };
  } else if (body.action === 'trackAction') {
    await operatorTelemetry.trackAction({
      actorId: enforced.verifiedActorId,
      workspaceId: enforced.verifiedWorkspaceId,
      actionType: body.payload.actionType || 'unknown',
      result: body.payload.result || 'unknown',
      page: body.payload.page,
      errorMessage: body.payload.errorMessage,
    });
    result = { success: true };
  } else if (body.action === 'pageExit') {
    operatorTelemetry.trackPageExit({
      actorId: enforced.verifiedActorId,
      workspaceId: enforced.verifiedWorkspaceId,
      page: body.payload.page,
      visitId: body.payload.visitId || '',
      actionCount: body.payload.actionCount || 0,
      errorCount: body.payload.errorCount || 0,
    });
    result = { success: true };
  }

  cacheResponse(enforced.idempotencyKey, result);
  return NextResponse.json(result, { status: 200 });
}
