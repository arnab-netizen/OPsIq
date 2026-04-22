import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getEvidenceItemById } from "@/services/evidence-item";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId, evidenceItemId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  parseOrThrow(uuidSchema, evidenceItemId);
  await withAuth({ capability: CAPABILITIES.EVIDENCE_VIEW });

  const item = await getEvidenceItemById(evidenceItemId, engagementId);
  return Response.json(item);
});
