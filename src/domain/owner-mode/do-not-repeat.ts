/**
 * Jarvis 360 Slice 12 — do-not-repeat rules (pure).
 *
 * Audit finding: do_not_repeat memories were persisted but never checked before
 * re-recommending. This decides whether an active do_not_repeat memory blocks a new
 * recommendation that shares its key, and whether an explicit changed-context reason
 * is required to proceed. No DB/I-O.
 */

export interface DoNotRepeatMemory {
  category: string;
  blocksRepetition: boolean;
  memoryKey: string | null;
}

export interface DoNotRepeatDecision {
  blocked: boolean;
  /** When blocked, proceeding requires an explicit changed-context reason. */
  requiresChangedContextReason: boolean;
  reason: string | null;
}

/** A matching, active do_not_repeat memory blocks a repeat recommendation. */
export function evaluateDoNotRepeat(memory: DoNotRepeatMemory | null, changedContextReason?: string | null): DoNotRepeatDecision {
  if (!memory || memory.category !== "do_not_repeat" || !memory.blocksRepetition) {
    return { blocked: false, requiresChangedContextReason: false, reason: null };
  }
  const hasReason = !!changedContextReason && changedContextReason.trim().length > 0;
  if (hasReason) {
    return { blocked: false, requiresChangedContextReason: false, reason: "Proceeding under an explicit changed-context override." };
  }
  return {
    blocked: true,
    requiresChangedContextReason: true,
    reason: "A do-not-repeat rule blocks this recommendation. Provide a changed-context reason to override.",
  };
}
