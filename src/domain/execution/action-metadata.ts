/**
 * Action has no blocker-reason column (the `actions` table never had one in any migration; the
 * Prisma field was dropped in the May 2026 schema restore). The reason a blocked action must carry
 * (action-lifecycle rule "action.blocker.required.blocked") lives in the existing `metadata` JSON
 * column under `blockerReason`, alongside other per-action state such as `outcomeSnapshot`.
 *
 * Several independent writers own different metadata keys, so no writer may write the whole
 * object back from a stale read. Writers describe only their own keys as an ActionMetadataPatch,
 * which the action store applies atomically in SQL (jsonb `-` then `||`).
 */
export interface ActionMetadataPatch {
  /** Keys merged into metadata (overwriting only these keys). */
  readonly set?: Readonly<Record<string, unknown>>;
  /** Keys removed from metadata. */
  readonly unset?: readonly string[];
}

export function readActionMetadata(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
}

export function readActionBlockerReason(metadata: unknown): string | null {
  const reason = readActionMetadata(metadata).blockerReason;
  return typeof reason === "string" && reason.trim().length > 0 ? reason : null;
}

/** The blocker-reason patch for a status: a blocked action keeps its reason; any other status clears it. */
export function blockerReasonPatch(status: string, reason: string | null): ActionMetadataPatch {
  return status === "blocked" && reason ? { set: { blockerReason: reason } } : { unset: ["blockerReason"] };
}
