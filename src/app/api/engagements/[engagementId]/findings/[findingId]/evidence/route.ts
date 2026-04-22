import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/infra/auth";
import { captureException } from "@/infra/logger";
import {
  getFindingDetail,
  linkEvidenceToFinding,
} from "@/services/findings";
import { validateEngagementAccess } from "@/policies/engagement";
import type { FindingEvidenceLinkType } from "@/domain/constants/statuses";

export async function POST(
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
    const result = await linkEvidenceToFinding(
      params.findingId,
      body.evidenceItemId,
      (body.linkType || "supports") as FindingEvidenceLinkType,
      user.id
    );
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
