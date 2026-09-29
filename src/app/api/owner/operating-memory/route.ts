/**
 * Phase 4 — Operating Memory routes.
 *
 * GET  /api/owner/operating-memory — list active memory entries for the workspace
 * POST /api/owner/operating-memory — upsert or expire a memory entry
 *
 * Workspace isolation enforced via canonical auth. OWNER_MANAGE required.
 *
 * Reserved memory types (RESERVED_OPERATING_MEMORY_TYPES — e.g. the Owner do-not-repeat override) are
 * written only by their own governed service; this generic route refuses to write or expire them.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { upsertMemoryEntry, getMemoryEntries, expireMemoryEntry } from "@/services/owner-mode/operating-memory.service";
import { RESERVED_OPERATING_MEMORY_TYPES } from "@/domain/owner-mode/dnr-owner-override";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["UPSERT", "EXPIRE"]).default("UPSERT"),
  memoryType: z.string().trim().min(1).max(100),
  sourceModel: z.string().trim().min(1).max(200).optional(),
  sourceId: z.string().trim().min(1).max(200),
  key: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().min(1).max(1000).optional(),
  content: z.string().trim().max(2000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  validUntil: z.string().datetime().nullish(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const memoryType = url.searchParams.get("memoryType");
    const key = url.searchParams.get("key");
    const entries = await getMemoryEntries(ctx.verifiedWorkspaceId, {
      memoryType: memoryType ?? undefined,
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

    if (RESERVED_OPERATING_MEMORY_TYPES.has(input.memoryType.toUpperCase())) {
      return canonicalJson({ error: "This memory type is recorded through its own workflow and cannot be changed here." }, { status: 422 });
    }

    if (input.action === "EXPIRE") {
      await expireMemoryEntry(workspaceId, input.memoryType, input.sourceId);
      return canonicalJson({ ok: true }, { status: 200 });
    }

    const effectiveSummary = input.summary || input.content || input.sourceId;
    const effectiveKey = input.key || input.sourceId;
    const effectiveSourceModel = input.sourceModel || input.memoryType;
    const effectiveData: Record<string, unknown> = {
      ...(input.data ?? {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    };

    const entry = await upsertMemoryEntry({
      workspaceId,
      actorId,
      memoryType: input.memoryType,
      sourceModel: effectiveSourceModel,
      sourceId: input.sourceId,
      key: effectiveKey,
      summary: effectiveSummary,
      data: effectiveData,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
    });
    return canonicalJson({ entry }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
