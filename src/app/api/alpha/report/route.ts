import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFact, getPolicyContextFact } from '@/services/auth';
import { alphaDailyReview } from '@/infra/alpha-daily-review';

// For GET requests, custom enforcement (query params)
export async function GET(request: NextRequest) {
  try {
    // Step 1: Extract workspace from query (for session lookup only)
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', code: 'WORKSPACE_REQUIRED' },
        { status: 400 }
      );
    }

    // Step 2: Get verified session from platform
    const sessionFact = await getSessionFact(workspaceId);
    if (!sessionFact.valid || !sessionFact.session) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', code: 'INVALID_SESSION' },
        { status: 401 }
      );
    }

    // Step 3: Get policy context to verify workspace membership
    const policyFact = await getPolicyContextFact(workspaceId);
    if (!policyFact.valid || !policyFact.policy) {
      return NextResponse.json(
        { error: 'FORBIDDEN', code: 'NO_WORKSPACE_ACCESS' },
        { status: 403 }
      );
    }

    // Step 4: Derive workspace from verified session
    const verifiedWorkspaceId = sessionFact.session.workspace?.id || workspaceId;

    // Step 5: Verify workspace membership
    if (workspaceId !== verifiedWorkspaceId) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          code: 'WORKSPACE_MISMATCH',
          detail: `Authenticated workspace: ${verifiedWorkspaceId}, Requested: ${workspaceId}`,
        },
        { status: 403 }
      );
    }

    // Step 6: Emit audit event
    console.log('[AUDIT]', JSON.stringify({
      timestamp: new Date().toISOString(),
      endpoint: request.nextUrl.pathname,
      method: request.method,
      verifiedActorId: sessionFact.session.user.id.substring(0, 20) + '***',
      verifiedWorkspaceId,
      action: 'report_request',
      status: 'received',
    }));

    // Step 7: Execute business logic with verified identity
    const dateStr = request.nextUrl.searchParams.get('date');
    const date = dateStr ? new Date(dateStr) : new Date();

    const report = await alphaDailyReview.generateReport({
      workspaceId: verifiedWorkspaceId,
      date,
    });

    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    console.error('[REPORT_ERROR]', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', code: 'REPORT_GENERATION_FAILED' },
      { status: 500 }
    );
  }
}
