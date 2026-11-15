/**
 * Owner Mode's business-scoped do-not-repeat override (Decision 3).
 *
 * When the owner records "what has changed" on a do-not-repeat rule, that lifts the rule for OWNER MODE of
 * ONE business only. It never touches the shared rule row: Formal Consulting Mode reads the same table
 * (enforceDoNotRepeatForPromotion honours only the row's own `changedContextExplanation`) and must not
 * observe an owner's override. The override is an append-only Owner operating-memory fact
 * (OperatingMemoryEntry, memoryType DNR_OWNER_OVERRIDE) keyed by rule AND business, carrying the actor,
 * the reason and when it was recorded. The owner gate, the Cockpit and the canonical decision resolve
 * "base rule + this business's Owner override"; nothing else reads it.
 *
 * The generic operating-memory route cannot write or expire this type (RESERVED_OPERATING_MEMORY_TYPES):
 * the only write path is the governed Owner DNR override service.
 */

export const DNR_OWNER_OVERRIDE_MEMORY_TYPE = "DNR_OWNER_OVERRIDE";
export const DNR_OWNER_OVERRIDE_SOURCE_MODEL = "OwnerDoNotRepeatRule";

/** Operating-memory types only a dedicated governed service may write. */
export const RESERVED_OPERATING_MEMORY_TYPES: ReadonlySet<string> = new Set([DNR_OWNER_OVERRIDE_MEMORY_TYPE]);

/** The override's source id: one override per (rule, business). */
export function dnrOwnerOverrideSourceId(ruleId: string, businessId: string): string {
  return `${ruleId}:${businessId}`;
}

/** The override's lookup key; every override of one business shares the prefix. */
export function dnrOwnerOverrideKeyPrefix(businessId: string): string {
  return `dnr-owner-override:${businessId}:`;
}

export function dnrOwnerOverrideKey(ruleId: string, businessId: string): string {
  return `${dnrOwnerOverrideKeyPrefix(businessId)}${ruleId}`;
}

export interface DnrOwnerOverride {
  ruleId: string;
  businessId: string;
  actorId: string;
  reason: string;
  recordedAt: string;
}

/**
 * A stored entry as a valid override of `businessId`, or null. The entry must be this type, name this
 * business in its source id, key and data alike (never another business's override), and carry a
 * non-empty reason and an actor.
 */
export function parseDnrOwnerOverride(
  entry: { memoryType?: unknown; sourceId?: unknown; key?: unknown; data?: unknown } | null | undefined,
  businessId: string
): DnrOwnerOverride | null {
  if (!entry || entry.memoryType !== DNR_OWNER_OVERRIDE_MEMORY_TYPE) return null;
  const d = entry.data as Record<string, unknown> | null | undefined;
  if (!d || typeof d !== "object") return null;
  const { ruleId, actorId, reason, recordedAt } = d;
  if (typeof ruleId !== "string" || !ruleId) return null;
  if (d.businessId !== businessId) return null;
  if (entry.sourceId !== dnrOwnerOverrideSourceId(ruleId, businessId)) return null;
  if (entry.key !== dnrOwnerOverrideKey(ruleId, businessId)) return null;
  if (typeof actorId !== "string" || !actorId) return null;
  if (typeof reason !== "string" || !reason.trim()) return null;
  if (typeof recordedAt !== "string") return null;
  return { ruleId, businessId, actorId, reason, recordedAt };
}
