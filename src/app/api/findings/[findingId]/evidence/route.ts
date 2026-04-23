import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { linkEvidenceToFinding, unlinkEvidenceFromFinding } from "@/services/findings";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";

const linkEvidenceSchema = z.object({
  evidenceId: z.string().uuid(),
});

const unlinkEvidenceSchema = z.object({
  evidenceId: z.string().uuid(),
});

export const POST = withRequestContext(async (request, context) => {
  const { findingId } = await context.params;
  parseOrThrow(uuidSchema, findingId);

  const { session } = await withAuth({
    capability: CAPABILITIES.FINDING_UPDATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, linkEvidenceSchema);
  const result = await linkEvidenceToFinding(findingId, body.evidenceId, session.user.id);

  return Response.json(result, { status: 201 });
});

export const DELETE = withRequestContext(async (request, context) => {
  const { findingId } = await context.params;
  parseOrThrow(uuidSchema, findingId);

  const { session } = await withAuth({
    capability: CAPABILITIES.FINDING_UPDATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, unlinkEvidenceSchema);
  const result = await unlinkEvidenceFromFinding(findingId, body.evidenceId, session.user.id);

  return Response.json(result, { status: 200 });
});
