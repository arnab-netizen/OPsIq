/**
 * GET  /api/owner/learning-candidates — list candidates for authenticated workspace (OWNER_VIEW)
 * POST /api/owner/learning-candidates — create/classify a learning candidate (OWNER_MANAGE)
 *
 * SEC-005: four deterministic records required for POST.
 * All responses are workspace-scoped; cross-tenant access throws at service layer.
 * No learning admission occurs here — this is candidate intake only.
 */

import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import {
  createLearningCandidate,
  listLearningCandidatesForWorkspace,
} from "@/services/controlled-learning-candidate.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Request Schema ───────────────────────────────────────────────────────────

const candidateRecordSchema = z.object({
  ownerDecisionId: z.string().min(1),
  ownerDecisionVerdict: z.enum(["approved", "rejected", "deferred"]),
  ownerDecisionWorkspaceId: z.string().min(1),
  actionId: z.string().min(1),
  actionWasTaken: z.boolean(),
  actionWorkspaceId: z.string().min(1),
  outcomeId: z.string().min(1),
  outcomeWindowElapsed: z.boolean(),
  outcomeWorkspaceId: z.string().min(1),
  humanApprovedBy: z.string().nullable(),
  humanApprovedAt: z.string().nullable(),
  humanReviewWorkspaceId: z.string().min(1),
});

const createCandidateSchema = z.object({
  businessId: z.string().min(1),
  sourceRecommendationId: z.string().optional(),
  evidenceSummary: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  classificationInput: z.object({
    sourceLabel: z.enum([
      "SYNTHETIC_ONLY_CANDIDATE",
      "HUMAN_VERIFIED_CANDIDATE",
      "REAL_SOURCE_BACKED_CANDIDATE",
    ]),
    evidenceOrigin: z.enum([
      "owner_manual_entry",
      "owner_file_upload",
      "owner_csv",
      "owner_pdf",
      "system_computed",
      "ai_generated",
      "synthetic_benchmark",
      "search_snippet_only",
    ]),
    publicSourceFullTextVerified: z.boolean(),
    originatingWorkspaceId: z.string().min(1),
    involvesSafetyRelatedFailure: z.boolean(),
    hasConflictingEvidence: z.boolean(),
    candidateRecord: candidateRecordSchema,
  }),
});

// ─── GET /api/owner/learning-candidates ──────────────────────────────────────

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const candidates = await listLearningCandidatesForWorkspace(db as any, ctx.verifiedWorkspaceId);
    return canonicalJson(candidates, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

// ─── POST /api/owner/learning-candidates ─────────────────────────────────────

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, createCandidateSchema);

    const result = await createLearningCandidate(db as any, {
      workspaceId: ctx.verifiedWorkspaceId,
      businessId: body.businessId,
      sourceRecommendationId: body.sourceRecommendationId,
      evidenceSummary: body.evidenceSummary,
      metadata: body.metadata,
      classificationInput: {
        workspaceId: ctx.verifiedWorkspaceId,
        ...body.classificationInput,
      },
    });

    return canonicalJson(
      {
        candidateId: result.id,
        eligibilityStatus: result.eligibilityStatus,
        eligible: result.eligible,
      },
      { status: 201 }
    );
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
