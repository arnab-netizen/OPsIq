import { assertWorkspaceScopedQuery } from "./security-rules";

export type MemoryCategory =
  | "owner_goal"
  | "owner_constraint"
  | "accepted_recommendation"
  | "rejected_recommendation"
  | "successful_action"
  | "failed_action"
  | "invalid_test"
  | "corrected_diagnosis"
  | "repeated_execution_issue"
  | "do_not_repeat"
  | "owner_preference"
  | "business_specific_rule";

// Categories that carry learning signal (positive or negative)
export const MEMORY_CARRIES_LEARNING_SIGNAL: Readonly<Record<MemoryCategory, boolean>> = {
  owner_goal: false,
  owner_constraint: false,
  accepted_recommendation: true,
  rejected_recommendation: true,
  successful_action: true,
  failed_action: true,
  invalid_test: true,
  corrected_diagnosis: true,
  repeated_execution_issue: true,
  do_not_repeat: true,
  owner_preference: false,
  business_specific_rule: false,
};

// Categories that actively block new recommendations if matched
export const MEMORY_BLOCKS_REPETITION: Readonly<Record<MemoryCategory, boolean>> = {
  owner_goal: false,
  owner_constraint: true,
  accepted_recommendation: false,
  rejected_recommendation: false,
  successful_action: false,
  failed_action: false,
  invalid_test: false,
  corrected_diagnosis: false,
  repeated_execution_issue: false,
  do_not_repeat: true,
  owner_preference: true,
  business_specific_rule: true,
};

export interface DecisionMemoryInput {
  workspaceId: string;
  businessId: string;
  category: MemoryCategory;
  // Entity links
  recommendationId?: string;
  actionId?: string;
  outcomeId?: string;
  // Memory content
  summary: string; // human-readable summary
  contextSnapshot: string; // business context when decision was made
  // Repeat-guard fields
  isRepeatAttempt: boolean;
  priorMemoryId?: string;
  changedContextExplanation?: string;
  // do_not_repeat enforcement
  doNotRepeatReason?: string;
}

export interface DecisionMemoryResult {
  valid: boolean;
  violations: string[];
  category: MemoryCategory;
  carriesLearningSignal: boolean;
  blocksRepetition: boolean;
  repeatAllowed: boolean; // only true when isRepeatAttempt + adequate context change explanation
}

const MIN_SUMMARY_LENGTH = 10;
const MIN_CONTEXT_LENGTH = 10;
const MIN_CHANGED_CONTEXT_LENGTH = 20;

// MEM-RULE-1: summary must be non-trivial
// MEM-RULE-2: contextSnapshot must be non-trivial
// MEM-RULE-3: at least one entity link required (for learning-signal categories)
// MEM-RULE-4: do_not_repeat requires doNotRepeatReason
// MEM-RULE-5: repeat attempt requires changedContextExplanation (min 20 chars)
//             and must reference priorMemoryId

export function recordDecisionMemory(input: DecisionMemoryInput): DecisionMemoryResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // MEM-RULE-1
  if (!input.summary || input.summary.trim().length < MIN_SUMMARY_LENGTH) {
    violations.push(`summary must be at least ${MIN_SUMMARY_LENGTH} characters (MEM-RULE-1)`);
  }

  // MEM-RULE-2
  if (!input.contextSnapshot || input.contextSnapshot.trim().length < MIN_CONTEXT_LENGTH) {
    violations.push(
      `contextSnapshot must be at least ${MIN_CONTEXT_LENGTH} characters (MEM-RULE-2)`
    );
  }

  // MEM-RULE-3: learning-signal categories need an entity link
  if (
    MEMORY_CARRIES_LEARNING_SIGNAL[input.category] &&
    !input.recommendationId &&
    !input.actionId &&
    !input.outcomeId
  ) {
    violations.push(
      "At least one of recommendationId, actionId, or outcomeId is required for learning-signal categories (MEM-RULE-3)"
    );
  }

  // MEM-RULE-4
  if (input.category === "do_not_repeat" && !input.doNotRepeatReason) {
    violations.push("doNotRepeatReason required for do_not_repeat category (MEM-RULE-4)");
  }

  // MEM-RULE-5
  if (input.isRepeatAttempt) {
    if (!input.priorMemoryId) {
      violations.push(
        "priorMemoryId required when isRepeatAttempt=true (MEM-RULE-5)"
      );
    }
    if (
      !input.changedContextExplanation ||
      input.changedContextExplanation.trim().length < MIN_CHANGED_CONTEXT_LENGTH
    ) {
      violations.push(
        `changedContextExplanation must be at least ${MIN_CHANGED_CONTEXT_LENGTH} characters when isRepeatAttempt=true (MEM-RULE-5)`
      );
    }
  }

  const carriesLearningSignal = MEMORY_CARRIES_LEARNING_SIGNAL[input.category];
  const blocksRepetition = MEMORY_BLOCKS_REPETITION[input.category];

  // Repeat is allowed only when: it is a repeat attempt + valid + adequate changed context
  const repeatAllowed =
    input.isRepeatAttempt &&
    violations.length === 0 &&
    !!input.priorMemoryId &&
    !!input.changedContextExplanation &&
    input.changedContextExplanation.trim().length >= MIN_CHANGED_CONTEXT_LENGTH;

  return {
    valid: violations.length === 0,
    violations,
    category: input.category,
    carriesLearningSignal,
    blocksRepetition,
    repeatAllowed,
  };
}

export function repeatIsPermitted(
  priorCategory: MemoryCategory,
  changedContextExplanation: string | undefined
): boolean {
  if (!MEMORY_BLOCKS_REPETITION[priorCategory]) return true;
  if (!changedContextExplanation || changedContextExplanation.trim().length < MIN_CHANGED_CONTEXT_LENGTH) {
    return false;
  }
  return true;
}
