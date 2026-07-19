/**
 * Phase 4 — Operating Memory routes.
 *
 * GET  /api/owner/operating-memory — list active memory entries for the workspace
 * POST /api/owner/operating-memory — upsert or expire a memory entry
 *
 * Workspace isolation enforced via canonical auth. OWNER_MANAGE required.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { upsertMemoryEntry, getMemoryEntries, expireMemoryEntry } from "@/services/owner-mode/operating-memory.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MEMORY_TYPES = [
  "APPROVAL", "DO_NOT_REPEAT", "SELF_EVALUATION", "SOP",
  "CONSTRAINT", "RISK", "KPI_OWNERSHIP", "OBJECTIVE",
] as const;

const schema = z.object({
  action: z.enum(["UPSERT", "EXPIRE"]).default("UPSERT"),
  memoryType: z.enum(MEMORY_TYPES),
  sourceModel: z.string().trim().min(1).max(200).optional(),
  sourceId: z.string().trim().min(1).max(200),
  key: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().min(1).max(1000).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  validUntil: z.string().datetime().nullish(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const memoryType = url.searchParams.get("memoryType");
    const key = url.searchParams.get("key");
    const entries = await getMemoryEntries(ctx.verifiedWorkspaceId, {
      memoryType: memoryType as (typeof MEMORY_TYPES)[number] | undefined ?? undefined,
      key: key ?? undefined,
    });
    return canonicalJson({ entries }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    if (input.action === "EXPIRE") {
      await expireMemoryEntry(workspaceId, input.memoryType, input.sourceId);
      return canonicalJson({ ok: true }, { status: 200 });
    }

    if (!input.sourceModel || !input.key || !input.summary) {
      return canonicalJson({ error: "sourceModel, key, and summary required for UPSERT" }, { status: 400 });
    }

    const entry = await upsertMemoryEntry({
      workspaceId,
      actorId,
      memoryType: input.memoryType,
      sourceModel: input.sourceModel,
      sourceId: input.sourceId,
      key: input.key,
      summary: input.summary,
      data: input.data,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
    });
    return canonicalJson({ entry }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
