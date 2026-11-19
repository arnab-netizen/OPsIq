/**
 * Action has no blocker-reason column (the `actions` table never had one in any migration; the
 * Prisma field was dropped in the May 2026 schema restore). The reason a blocked action must carry
 * (action-lifecycle rule "action.blocker.required.blocked") lives in the existing `metadata` JSON
 * column under `blockerReason`, alongside other per-action state such as `outcomeSnapshot`.
 */
export function readActionMetadata(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
}

export function readActionBlockerReason(metadata: unknown): string | null {
  const reason = readActionMetadata(metadata).blockerReason;
  return typeof reason === "string" && reason.trim().length > 0 ? reason : null;
}

/** Metadata after a status change: a blocked action keeps its reason; leaving blocked clears it. */
export function withActionBlockerReason(metadata: unknown, status: string, reason: string | null): Record<string, unknown> {
  const next = readActionMetadata(metadata);
  if (status === "blocked" && reason) {
    next.blockerReason = reason;
  } else {
    delete next.blockerReason;
  }
  return next;
}
