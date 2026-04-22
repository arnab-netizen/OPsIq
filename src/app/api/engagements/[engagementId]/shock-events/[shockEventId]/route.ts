import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/infra/auth";
import { captureException } from "@/infra/logger";
import {
  getShockEventDetail,
  updateShockEvent,
} from "@/services/shock-event";
import { validateEngagementAccess } from "@/policies/engagement";
import type { UpdateShockEventInput } from "@/services/shock-event";

export async function GET(
  request: NextRequest,
  { params }: { params: { engagementId: string; shockEventId: string } }
): Promise<NextResponse> {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify engagement access
    await validateEngagementAccess(params.engagementId, user.id);

    const event = await getShockEventDetail(params.shockEventId);
    if (event.engagementId !== params.engagementId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(event);
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { engagementId: string; shockEventId: string } }
): Promise<NextResponse> {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify engagement access
    await validateEngagementAccess(params.engagementId, user.id);

    // Verify shock event belongs to engagement
    const event = await getShockEventDetail(params.shockEventId);
    if (event.engagementId !== params.engagementId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const input: UpdateShockEventInput = {
      type: body.type,
      severity: body.severity,
      happenedAt: body.happenedAt,
      notes: body.notes,
      version: body.version,
    };

    const result = await updateShockEvent(params.shockEventId, input, user.id);
    return NextResponse.json(result);
  } catch (error) {
    captureException(error);
    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message.includes("Invalid") || error.message.includes("Version")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
