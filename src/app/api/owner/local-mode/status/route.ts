/**
 * GET /api/owner/local-mode/status — Local / Private Mode Configuration Status (Module #18).
 *
 * Returns the current runtime configuration of Local Mode (storage and scheduler
 * providers, private mode enabled flag). Pure read — no DB access, no mutations.
 *
 * Local Mode means:
 *   - STORAGE_PROVIDER=local (filesystem or in-process storage instead of cloud)
 *   - SCHEDULER_PROVIDER=in-memory (no external queue)
 *   - PrivateModeAccess controls restrict which roles can access each workspace
 *
 * This endpoint lets the owner view their current environment's local-mode
 * posture without requiring a database query. The DB-backed private-mode role
 * service (src/services/private-mode/) handles access grants separately.
 *
 * Hard governance rules:
 * - Does not expose API keys, secrets, or DATABASE_URL
 * - Does not expose internal IP addresses or infrastructure topology
 * - Reports only non-sensitive configuration flags
 * - workspaceId sourced only from ctx.verifiedWorkspaceId
 *
 * Auth: OWNER_VIEW capability, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type StorageProvider = "local" | "s3" | "gcs" | "azure" | "unknown";
export type SchedulerProvider = "in-memory" | "redis" | "pg" | "unknown";

function resolveStorageProvider(): StorageProvider {
  const raw = process.env.STORAGE_PROVIDER?.toLowerCase().trim();
  if (raw === "local") return "local";
  if (raw === "s3") return "s3";
  if (raw === "gcs") return "gcs";
  if (raw === "azure") return "azure";
  return "unknown";
}

function resolveSchedulerProvider(): SchedulerProvider {
  const raw = process.env.SCHEDULER_PROVIDER?.toLowerCase().trim();
  if (raw === "in-memory") return "in-memory";
  if (raw === "redis") return "redis";
  if (raw === "pg") return "pg";
  return "unknown";
}

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const storageProvider = resolveStorageProvider();
    const schedulerProvider = resolveSchedulerProvider();

    const localModeActive =
      storageProvider === "local" && schedulerProvider === "in-memory";

    return {
      workspaceId: ctx.verifiedWorkspaceId,
      localModeActive,
      storageProvider,
      schedulerProvider,
      capabilities: {
        offlineStorage: storageProvider === "local",
        inMemoryScheduler: schedulerProvider === "in-memory",
        privateRoleAccess: true, // Always available via DB; capability is real regardless of local mode
      },
      notes: localModeActive
        ? "Running in full local mode — no cloud storage or external scheduler."
        : "Not in full local mode — one or more cloud services may be configured.",
    };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
