/**
 * Jarvis 360 Slice 14 — compliance surface.
 * POST /api/owner/compliance — record a compliance item (licence/permit/insurance/tax).
 * GET  /api/owner/compliance — list items needing review (expired / expiring soon).
 * OWNER_MANAGE (write) / OWNER_VIEW (read), workspace-scoped.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { recordComplianceItem, getComplianceReviewItems } from "@/services/owner-mode/compliance.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  businessId: z.string().uuid().optional(),
  kind: z.enum(["licence", "permit", "insurance", "tax", "document"]),
  name: z.string().trim().min(1),
  reference: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  jurisdiction: z.string().max(200).optional(),
  legalBasis: z.string().max(500).optional(),
  obligationOwner: z.string().max(200).optional(),
  evidenceValidityDays: z.number().int().min(1).max(3650).optional(),
  recurrenceMonths: z.number().int().min(1).max(120).optional(),
  penaltyDescription: z.string().max(500).optional(),
  provenanceSource: z.enum(["owner_input", "professional_input", "authoritative_document"]).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const id = await recordComplianceItem({
      ...input,
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });
    return canonicalJson({ id }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const items = await getComplianceReviewItems(ctx.verifiedWorkspaceId);
    return canonicalJson({ items }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
