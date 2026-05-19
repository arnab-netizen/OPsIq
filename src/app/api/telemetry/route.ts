import { NextRequest, NextResponse } from 'next/server';
import { operatorTelemetry } from '@/infra/operator-telemetry';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, payload } = body;

    if (action === 'pageVisit') {
      const visitId = operatorTelemetry.trackPageVisit(payload);
      return NextResponse.json({ visitId });
    }

    if (action === 'pageExit') {
      operatorTelemetry.trackPageExit(payload);
      return NextResponse.json({ success: true });
    }

    if (action === 'trackAction') {
      await operatorTelemetry.trackAction(payload);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[TELEMETRY_API]', error);
    return NextResponse.json(
      { error: 'Failed to track telemetry' },
      { status: 500 }
    );
  }
}
