import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceGovernanceRestored } from '@/lib/governance-enforcement';
import { operatorFeedback } from '@/infra/operator-feedback';

// Define validated schema
const FeedbackRequestSchema = z.object({
  feedbackType: z.enum(['confusing', 'not_sure', 'need_help', 'unexpected']),
  workspaceId: z.string().min(1), // Required for session lookup
  page: z.string().min(1),
  context: z.string(),
});

export async function POST(request: NextRequest) {
  // Restored governance enforcement using platform identity chain
  const enforcement = await enforceGovernanceRestored(request, FeedbackRequestSchema);

  if (enforcement instanceof NextResponse) {
    return enforcement;
  }

  const { enforced, body } = enforcement;

  // Execute business logic with VERIFIED identity from session
  await operatorFeedback.capture({
    feedbackType: body.feedbackType,
    actorId: enforced.verifiedActorId,  // From verified session
    workspaceId: enforced.verifiedWorkspaceId,  // From verified session
    page: body.page,
    context: body.context,
  });

  return NextResponse.json({ success: true }, { status: 200 });
}
