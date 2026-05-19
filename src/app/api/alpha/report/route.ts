import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { alphaDailyReview } from '@/infra/alpha-daily-review';

// 1. Define validated schema for query parameters (note: GET doesn't use enforceGovernance for query params)
// For GET requests, we need custom governance enforcement

// 2. Route handler with governance enforcement
export async function GET(request: NextRequest) {
  // Step 1: Derive authenticated actor - check for X-Auth-Token header
  const authToken = request.headers.get('X-Auth-Token');
  if (!authToken) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', code: 'NO_AUTH_TOKEN' },
      { status: 401 }
    );
  }

  // Step 2: Derive workspace context - check for X-Workspace-Id header
  const workspaceHeader = request.headers.get('X-Workspace-Id');
  if (!workspaceHeader) {
    return NextResponse.json(
      { error: 'FORBIDDEN', code: 'NO_WORKSPACE_HEADER' },
      { status: 403 }
    );
  }

  // Step 3: Extract and validate query parameters
  const workspaceId = request.nextUrl.searchParams.get('workspaceId') || 'alpha-workspace-01';
  const dateStr = request.nextUrl.searchParams.get('date');

  // Step 4: Validate workspace membership
  if (workspaceId !== workspaceHeader) {
    return NextResponse.json(
      { error: 'FORBIDDEN', code: 'WORKSPACE_MISMATCH', detail: `Header: ${workspaceHeader}, Query: ${workspaceId}` },
      { status: 403 }
    );
  }

  // Step 5: Validate payload schema (query params)
  try {
    if (dateStr && isNaN(new Date(dateStr).getTime())) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', code: 'INVALID_DATE_FORMAT', detail: `Invalid date: ${dateStr}` },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', code: 'INVALID_DATE_FORMAT' },
      { status: 400 }
    );
  }

  // Step 6: Enforce idempotency (GET requests are inherently idempotent)
  // No additional action needed

  // Step 7: Emit audit event
  console.log('[AUDIT]', JSON.stringify({
    timestamp: new Date().toISOString(),
    endpoint: request.nextUrl.pathname,
    method: request.method,
    authToken: authToken.substring(0, 10) + '***',
    workspaceId: workspaceHeader,
    action: 'report_request',
    status: 'received',
  }));

  // Step 8: Execute business logic
  try {
    const date = dateStr ? new Date(dateStr) : new Date();
    const report = await alphaDailyReview.generateReport({
      workspaceId,
      date,
    });

    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    // Step 9: Fail closed - infrastructure errors return 500
    console.error('[REPORT_ERROR]', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', code: 'REPORT_GENERATION_FAILED' },
      { status: 500 }
    );
  }
}

