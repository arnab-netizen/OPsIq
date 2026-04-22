import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/infra/auth";
import { captureException } from "@/infra/logger";
import {
  createEvidenceItem,
  listEvidenceForEngagement,
} from "@/services/evidence";
import { validateEngagementAccess } from "@/policies/engagement";
import type { CreateEvidenceItemInput } from "@/services/evidence";

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
    const input: CreateEvidenceItemInput = {
      engagementId: params.engagementId,
      stageId: body.stageId,
      category: body.category,
      type: body.type,
      sourceType: body.sourceType,
      sourceLabel: body.sourceLabel,
      sourceOwner: body.sourceOwner,
      captureMethod: body.captureMethod,
      capturedAt: body.capturedAt,
      statement: body.statement,
      visibilityClassification: body.visibilityClassification,
    };

    const result = await createEvidenceItem(input, user.id);
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

    const { searchParams } = new URL(request.url);
    const stageId = searchParams.get("stageId");

    const evidence = await listEvidenceForEngagement(params.engagementId, stageId || undefined);
    return NextResponse.json({ evidence });
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
