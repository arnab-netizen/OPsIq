import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getEvidenceById, updateEvidence } from "@/services/evidence";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { EVIDENCE_STATUSES } from "@/domain/constants/statuses";


const updateEvidenceSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  evidenceType: z
    .enum(["document", "interview", "metric", "observation"])
    .optional(),
  sourceReference: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(EVIDENCE_STATUSES).optional(),
  rejectionReason: z.string().optional(),
  version: z.number().int().min(1),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = nextRequest.headers.get("x-workspace-id");
    const { evidenceId } = params;
    parseOrThrow(uuidSchema, evidenceId);

    const evidence = await getEvidenceById(evidenceId, workspaceId);
    return Response.json(evidence);
  },
  { requireCapabilities: [CAPABILITIES.EVIDENCE_VIEW], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = nextRequest.headers.get("x-workspace-id");
    const { evidenceId } = params;
    parseOrThrow(uuidSchema, evidenceId);

    const body = await parseRequestBody(ctx.request!, updateEvidenceSchema);
    await updateEvidence(evidenceId, body, ctx, workspaceId);

    const updated = await getEvidenceById(evidenceId, workspaceId);
    return Response.json(updated);
  },
  { requireCapabilities: [CAPABILITIES.EVIDENCE_VALIDATE], requireWorkspace: true }
);
