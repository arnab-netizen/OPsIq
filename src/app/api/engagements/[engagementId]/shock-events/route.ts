import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/infra/auth";
import { captureException } from "@/infra/logger";
import {
  createShockEvent,
  listShockEventsForEngagement,
} from "@/services/shock-event";
import { validateEngagementAccess } from "@/policies/engagement";
import type { CreateShockEventInput } from "@/services/shock-event";

export async function POST(
  request: NextRequest,
  { params }: { params: { engagementId: string } }
): Promise<NextResponse> {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify engagement access
    await validateEngagementAccess(params.engagementId, user.id);

    const body = await request.json();
    const input: CreateShockEventInput = {
      engagementId: params.engagementId,
      type: body.type,
      severity: body.severity,
      happenedAt: body.happenedAt,
      notes: body.notes,
    };

    const result = await createShockEvent(input, user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    captureException(error);
    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message.includes("Invalid")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { engagementId: string } }
): Promise<NextResponse> {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify engagement access
    await validateEngagementAccess(params.engagementId, user.id);

    const events = await listShockEventsForEngagement(params.engagementId);
    return NextResponse.json({ events });
  } catch (error) {
    captureException(error);
    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
