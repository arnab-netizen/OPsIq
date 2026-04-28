import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOperatorReviewQueue } from "@/services/operator-review/operator-review.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withRequestContext(async () => {
  await withAuth({
    capability: CAPABILITIES.REVIEW_VIEW,
  });

  const queue = await getOperatorReviewQueue();
  return Response.json({ success: true, data: queue });
});
