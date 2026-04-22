import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/infra/auth";
import { captureException } from "@/infra/logger";
import {
  getFindingDetail,
  updateFinding,
  validateFinding,
  disputeFinding,
} from "@/services/findings";
import { validateEngagementAccess } from "@/policies/engagement";
import type { UpdateFindingInput } from "@/services/findings";

export async function GET(
  request: NextRequest,
  { params }: { params: { engagementId: string; findingId: string } }
): Promise<NextResponse> {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify engagement access
    await validateEngagementAccess(params.engagementId, user.id);

    const finding = await getFindingDetail(params.findingId);
    if (finding.engagementId !== params.engagementId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(finding);
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
  { params }: { params: { engagementId: string; findingId: string } }
): Promise<NextResponse> {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify engagement access
    await validateEngagementAccess(params.engagementId, user.id);

    // Verify finding belongs to engagement
    const finding = await getFindingDetail(params.findingId);
    if (finding.engagementId !== params.engagementId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const input: UpdateFindingInput = {
      title: body.title,
      statement: body.statement,
      severity: body.severity,
      status: body.status,
      confidenceLabel: body.confidenceLabel,
      provisionalFlag: body.provisionalFlag,
      clientVisibilityStatus: body.clientVisibilityStatus,
      version: body.version,
    };

    const result = await updateFinding(params.findingId, input, user.id);
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
