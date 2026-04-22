import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/infra/auth";
import { captureException } from "@/infra/logger";
import {
  createFinding,
  listFindingsForEngagement,
} from "@/services/findings";
import { validateEngagementAccess } from "@/policies/engagement";
import type { CreateFindingInput } from "@/services/findings";

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
    const input: CreateFindingInput = {
      engagementId: params.engagementId,
      stageId: body.stageId,
      title: body.title,
      statement: body.statement,
      severity: body.severity,
      confidenceLabel: body.confidenceLabel,
      provisionalFlag: body.provisionalFlag,
      clientVisibilityStatus: body.clientVisibilityStatus,
    };

    const result = await createFinding(input, user.id);
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

    const findings = await listFindingsForEngagement(params.engagementId, stageId || undefined);
    return NextResponse.json({ findings });
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
