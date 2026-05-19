import { NextRequest, NextResponse } from 'next/server';
import { operatorFeedback } from '@/infra/operator-feedback';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { feedbackType, actorId, workspaceId, page, context } = body;

    await operatorFeedback.capture({
      feedbackType,
      actorId,
      workspaceId,
      page,
      context,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[FEEDBACK_API]', error);
    return NextResponse.json(
      { error: 'Failed to capture feedback' },
      { status: 500 }
    );
  }
}
