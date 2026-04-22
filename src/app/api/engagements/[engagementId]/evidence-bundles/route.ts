import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/infra/auth";
import { captureException } from "@/infra/logger";
import {
  createEvidenceBundle,
  listEvidenceBundlesForEngagement,
} from "@/services/evidence";
import { validateEngagementAccess } from "@/policies/engagement";
import type { CreateEvidenceBundleInput } from "@/services/evidence";

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
    const input: CreateEvidenceBundleInput = {
      engagementId: params.engagementId,
      title: body.title,
      description: body.description,
    };

    const result = await createEvidenceBundle(input, user.id);
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

    const bundles = await listEvidenceBundlesForEngagement(params.engagementId);
    return NextResponse.json({ bundles });
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
