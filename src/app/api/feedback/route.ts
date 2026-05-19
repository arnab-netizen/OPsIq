import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceGovernance } from '@/lib/governance-enforcement';
import { operatorFeedback } from '@/infra/operator-feedback';

// 1. Define validated schema
const FeedbackRequestSchema = z.object({
  feedbackType: z.enum(['confusing', 'not_sure', 'need_help', 'unexpected']),
  actorId: z.string().min(1),
  workspaceId: z.string().min(1),
  page: z.string().min(1),
  context: z.string(),
});

// 2. Route handler with governance enforcement
export async function POST(request: NextRequest) {
  // Step 1-6: Governance enforcement chain
  // - Authenticate (check X-Auth-Token header)
  // - Derive workspace context (X-Workspace-Id header)
  // - Validate workspace membership
  // - Validate payload schema
  // - Enforce idempotency
  const enforcement = await enforceGovernance(request, FeedbackRequestSchema, {
    requireWorkspaceMatch: true,
  });

  // Return error if governance enforcement failed
  if (enforcement instanceof NextResponse) {
    return enforcement;
  }

  const { govReq, body } = enforcement;

  // Step 7: Execute business logic (now guaranteed to have valid auth + workspace + payload)
  await operatorFeedback.capture({
    feedbackType: body.feedbackType,
    actorId: body.actorId,
    workspaceId: body.workspaceId,
    page: body.page,
    context: body.context,
  });

  const result = { success: true };

  // Step 8: Return success response
  return NextResponse.json(result, { status: 200 });
}

