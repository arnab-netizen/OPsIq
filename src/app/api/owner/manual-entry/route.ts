/**
 * POST /api/owner/manual-entry — the real owner MANUAL input path. Validates + scopes + classifies one
 *   structured record through the shared parser, persists it as an owner-confirmed `OwnerDataIntake`,
 *   emits an audit event, and returns the confidence before/after so the owner sees the accuracy gain.
 *
 *   OWNER_MANAGE, workspace-scoped, validated. The verified workspace is authoritative — a record whose
 *   workspaceId/businessId disagree is rejected (cross-workspace / cross-business), never re-homed.
 *   No state-transition or business logic here; it all lives in the parser + manual-entry service.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import { submitManualEntry } from "@/services/owner-mode/owner-manual-entry.service";
import { OWNER_INPUT_CATEGORIES } from "@/domain/owner-mode/input-catalog";
import type { PrismaClient } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fieldValue = z.union([z.number(), z.string(), z.boolean(), z.null()]);

const manualEntrySchema = z.object({
  businessId: z.string().trim().min(1),
  category: z.enum(OWNER_INPUT_CATEGORIES as unknown as [string, ...string[]]),
  fields: z.record(z.string(), fieldValue),
  confirm: z.boolean().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, manualEntrySchema);
    const workspaceId = ctx.verifiedWorkspaceId;

    const result = await submitManualEntry(
      {
        workspaceId,
        businessId: input.businessId,
        confirm: input.confirm,
        record: {
          workspaceId,
          businessId: input.businessId,
          category: input.category as never,
          source: "manual",
          fields: input.fields,
        },
      },
      {
        db: db as unknown as PrismaClient,
        now: new Date(),
        actorId: ctx.verifiedActorId,
      },
    );

    return canonicalJson(result, { status: result.ok ? 200 : 422 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
