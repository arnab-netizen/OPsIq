import { NextRequest, NextResponse } from 'next/server';
import { alphaDailyReview } from '@/infra/alpha-daily-review';

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId') || 'alpha-workspace-01';
    const dateStr = request.nextUrl.searchParams.get('date');
    const date = dateStr ? new Date(dateStr) : new Date();

    const report = await alphaDailyReview.generateReport({
      workspaceId,
      date,
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error('[REPORT_API]', error);
    return NextResponse.json(
      { error: 'Failed to generate report', details: error instanceof Error ? error.message : '' },
      { status: 500 }
    );
  }
}
