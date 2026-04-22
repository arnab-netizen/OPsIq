import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/infra/auth";
import { captureException } from "@/infra/logger";
import {
  getEvidenceItemDetail,
  updateEvidenceItem,
} from "@/services/evidence";
import { validateEngagementAccess } from "@/policies/engagement";
import type { UpdateEvidenceItemInput } from "@/services/evidence";

export async function GET(
  request: NextRequest,
  { params }: { params: { engagementId: string; evidenceId: string } }
): Promise<NextResponse> {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify engagement access
    await validateEngagementAccess(params.engagementId, user.id);

    const evidence = await getEvidenceItemDetail(params.evidenceId);
    if (evidence.engagementId !== params.engagementId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(evidence);
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
  { params }: { params: { engagementId: string; evidenceId: string } }
): Promise<NextResponse> {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify engagement access
    await validateEngagementAccess(params.engagementId, user.id);

    // Verify evidence belongs to engagement
    const evidence = await getEvidenceItemDetail(params.evidenceId);
    if (evidence.engagementId !== params.engagementId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const input: UpdateEvidenceItemInput = {
      statement: body.statement,
      validationStatus: body.validationStatus,
      traceabilityStatus: body.traceabilityStatus,
      version: body.version,
    };

    const result = await updateEvidenceItem(params.evidenceId, input, user.id);
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
