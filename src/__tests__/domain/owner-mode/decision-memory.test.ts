import { describe, it, expect } from "vitest";
import {
  MEMORY_CARRIES_LEARNING_SIGNAL,
  MEMORY_BLOCKS_REPETITION,
  recordDecisionMemory,
  repeatIsPermitted,
  type DecisionMemoryInput,
} from "@/domain/owner-mode/decision-memory";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

function base(overrides: Partial<DecisionMemoryInput> = {}): DecisionMemoryInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-001",
    category: "successful_action",
    summary: "Supplier renegotiation achieved 7% COGS reduction within 6-week window.",
    contextSnapshot:
      "Q3 2025. Gross margin at 28%, below 32% target. Supplier contract renewal due in 4 weeks.",
    isRepeatAttempt: false,
    ...overrides,
  };
}

function doNotRepeat(overrides: Partial<DecisionMemoryInput> = {}): DecisionMemoryInput {
  return base({
    category: "do_not_repeat",
    actionId: "action-failed-001",
    summary: "Do not retry aggressive price increase above 12% — caused 18% churn spike.",
    contextSnapshot: "Q2 2025. Post-price-increase churn review.",
    doNotRepeatReason:
      "18% churn increase within 30 days of 15% price hike — customers highly price-sensitive.",
    ...overrides,
  });
}

function repeatAttempt(overrides: Partial<DecisionMemoryInput> = {}): DecisionMemoryInput {
  return base({
    category: "failed_action",
    isRepeatAttempt: true,
    priorMemoryId: "mem-prior-001",
    changedContextExplanation:
      "Situation changed: new cost data shows input cost rose 20%, justifying retry with modified pricing strategy.",
    ...overrides,
  });
}

// ─── Policy table tests ───────────────────────────────────────────────────────

describe("MEMORY_CARRIES_LEARNING_SIGNAL", () => {
  it("accepted_recommendation → carries signal", () =>
    expect(MEMORY_CARRIES_LEARNING_SIGNAL.accepted_recommendation).toBe(true));
  it("rejected_recommendation → carries signal", () =>
    expect(MEMORY_CARRIES_LEARNING_SIGNAL.rejected_recommendation).toBe(true));
  it("successful_action → carries signal", () =>
    expect(MEMORY_CARRIES_LEARNING_SIGNAL.successful_action).toBe(true));
  it("failed_action → carries signal", () =>
    expect(MEMORY_CARRIES_LEARNING_SIGNAL.failed_action).toBe(true));
  it("invalid_test → carries signal", () =>
    expect(MEMORY_CARRIES_LEARNING_SIGNAL.invalid_test).toBe(true));
  it("do_not_repeat → carries signal", () =>
    expect(MEMORY_CARRIES_LEARNING_SIGNAL.do_not_repeat).toBe(true));
  it("owner_goal → does not carry signal", () =>
    expect(MEMORY_CARRIES_LEARNING_SIGNAL.owner_goal).toBe(false));
  it("owner_constraint → does not carry signal", () =>
    expect(MEMORY_CARRIES_LEARNING_SIGNAL.owner_constraint).toBe(false));
  it("owner_preference → does not carry signal", () =>
    expect(MEMORY_CARRIES_LEARNING_SIGNAL.owner_preference).toBe(false));
});

describe("MEMORY_BLOCKS_REPETITION", () => {
  it("do_not_repeat → blocks repetition", () =>
    expect(MEMORY_BLOCKS_REPETITION.do_not_repeat).toBe(true));
  it("owner_constraint → blocks repetition", () =>
    expect(MEMORY_BLOCKS_REPETITION.owner_constraint).toBe(true));
  it("owner_preference → blocks repetition", () =>
    expect(MEMORY_BLOCKS_REPETITION.owner_preference).toBe(true));
  it("business_specific_rule → blocks repetition", () =>
    expect(MEMORY_BLOCKS_REPETITION.business_specific_rule).toBe(true));
  it("successful_action → does not block repetition", () =>
    expect(MEMORY_BLOCKS_REPETITION.successful_action).toBe(false));
  it("failed_action → does not block repetition", () =>
    expect(MEMORY_BLOCKS_REPETITION.failed_action).toBe(false));
  it("accepted_recommendation → does not block repetition", () =>
    expect(MEMORY_BLOCKS_REPETITION.accepted_recommendation).toBe(false));
});

// ─── MEM-RULE-1: summary ─────────────────────────────────────────────────────

describe("MEM-RULE-1: summary required (min 10 chars)", () => {
  it("violation when empty", () => {
    const result = recordDecisionMemory(base({ summary: "" }));
    expect(result.violations.some((v) => v.includes("MEM-RULE-1"))).toBe(true);
  });

  it("violation when too short", () => {
    const result = recordDecisionMemory(base({ summary: "ok" }));
    expect(result.violations.some((v) => v.includes("MEM-RULE-1"))).toBe(true);
  });

  it("no violation when sufficient", () => {
    const result = recordDecisionMemory(base());
    expect(result.violations.some((v) => v.includes("MEM-RULE-1"))).toBe(false);
  });
});

// ─── MEM-RULE-2: contextSnapshot ─────────────────────────────────────────────

describe("MEM-RULE-2: contextSnapshot required (min 10 chars)", () => {
  it("violation when empty", () => {
    const result = recordDecisionMemory(base({ contextSnapshot: "" }));
    expect(result.violations.some((v) => v.includes("MEM-RULE-2"))).toBe(true);
  });

  it("violation when too short", () => {
    const result = recordDecisionMemory(base({ contextSnapshot: "Q3" }));
    expect(result.violations.some((v) => v.includes("MEM-RULE-2"))).toBe(true);
  });

  it("no violation when sufficient", () => {
    const result = recordDecisionMemory(base());
    expect(result.violations.some((v) => v.includes("MEM-RULE-2"))).toBe(false);
  });
});

// ─── MEM-RULE-3: entity link for learning-signal categories ──────────────────

describe("MEM-RULE-3: entity link required for learning-signal categories", () => {
  it("successful_action without entity link → violation", () => {
    const result = recordDecisionMemory(
      base({ actionId: undefined, recommendationId: undefined, outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("MEM-RULE-3"))).toBe(true);
  });

  it("successful_action with actionId → no violation", () => {
    const result = recordDecisionMemory(
      base({ recommendationId: undefined, outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("MEM-RULE-3"))).toBe(false);
  });

  it("successful_action with recommendationId → no violation", () => {
    const result = recordDecisionMemory(
      base({ actionId: undefined, recommendationId: "rec-001", outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("MEM-RULE-3"))).toBe(false);
  });

  it("owner_goal without entity link → no violation (non-learning category)", () => {
    const result = recordDecisionMemory(
      base({
        category: "owner_goal",
        actionId: undefined,
        recommendationId: undefined,
        outcomeId: undefined,
        summary: "Owner goal is to achieve 35% gross margin by Q4 2025.",
        contextSnapshot: "Gross margin currently at 28% as of Q3 2025.",
      })
    );
    expect(result.violations.some((v) => v.includes("MEM-RULE-3"))).toBe(false);
  });
});

// ─── MEM-RULE-4: do_not_repeat requires reason ───────────────────────────────

describe("MEM-RULE-4: do_not_repeat requires doNotRepeatReason", () => {
  it("violation when do_not_repeat has no reason", () => {
    const result = recordDecisionMemory(doNotRepeat({ doNotRepeatReason: undefined }));
    expect(result.violations.some((v) => v.includes("MEM-RULE-4"))).toBe(true);
  });

  it("no violation when do_not_repeat has reason", () => {
    const result = recordDecisionMemory(doNotRepeat());
    expect(result.violations.some((v) => v.includes("MEM-RULE-4"))).toBe(false);
  });

  it("no violation for other categories without reason", () => {
    const result = recordDecisionMemory(base({ doNotRepeatReason: undefined }));
    expect(result.violations.some((v) => v.includes("MEM-RULE-4"))).toBe(false);
  });
});

// ─── MEM-RULE-5: repeat attempt requires changed context ─────────────────────

describe("MEM-RULE-5: repeat attempt requires priorMemoryId + changedContextExplanation", () => {
  it("violation when isRepeatAttempt=true but no priorMemoryId", () => {
    const result = recordDecisionMemory(repeatAttempt({ priorMemoryId: undefined }));
    expect(result.violations.some((v) => v.includes("MEM-RULE-5"))).toBe(true);
  });

  it("violation when isRepeatAttempt=true but no changedContextExplanation", () => {
    const result = recordDecisionMemory(repeatAttempt({ changedContextExplanation: undefined }));
    expect(result.violations.some((v) => v.includes("MEM-RULE-5"))).toBe(true);
  });

  it("violation when changedContextExplanation is too short", () => {
    const result = recordDecisionMemory(
      repeatAttempt({ changedContextExplanation: "situation changed" })
    );
    expect(result.violations.some((v) => v.includes("MEM-RULE-5"))).toBe(true);
  });

  it("no violation when all repeat fields provided", () => {
    const result = recordDecisionMemory(repeatAttempt());
    expect(result.violations.some((v) => v.includes("MEM-RULE-5"))).toBe(false);
  });

  it("no violation when not a repeat attempt", () => {
    const result = recordDecisionMemory(base({ isRepeatAttempt: false }));
    expect(result.violations.some((v) => v.includes("MEM-RULE-5"))).toBe(false);
  });
});

// ─── Scenario: stores accepted/rejected/success/failed actions ────────────────

describe("scenario: stores accepted and rejected actions", () => {
  it("accepted_recommendation stores with learning signal", () => {
    const result = recordDecisionMemory(
      base({
        category: "accepted_recommendation",
        recommendationId: "rec-001",
        actionId: undefined,
        summary: "Owner accepted supplier renegotiation recommendation targeting 8% COGS reduction.",
        contextSnapshot: "Gross margin at 28%, supplier contract up for renewal in 3 weeks.",
      })
    );
    expect(result.valid).toBe(true);
    expect(result.carriesLearningSignal).toBe(true);
    expect(result.blocksRepetition).toBe(false);
  });

  it("rejected_recommendation stores with learning signal", () => {
    const result = recordDecisionMemory(
      base({
        category: "rejected_recommendation",
        recommendationId: "rec-002",
        actionId: undefined,
        summary: "Owner rejected price increase recommendation due to customer retention concerns.",
        contextSnapshot: "NPS score dropped from 45 to 30 in last quarter; owner risk-averse.",
      })
    );
    expect(result.valid).toBe(true);
    expect(result.carriesLearningSignal).toBe(true);
  });

  it("failed_action stores with learning signal", () => {
    const result = recordDecisionMemory(
      base({
        category: "failed_action",
        summary: "Customer reactivation campaign yielded only 1.2% conversion vs 8% target.",
        contextSnapshot: "Q3 2025. 340 lapsed customers targeted. Email channel used.",
      })
    );
    expect(result.valid).toBe(true);
    expect(result.carriesLearningSignal).toBe(true);
  });
});

// ─── Scenario: do-not-repeat blocks repeat ────────────────────────────────────

describe("scenario: do_not_repeat blocks repeat recommendation", () => {
  it("do_not_repeat memory has blocksRepetition=true", () => {
    const result = recordDecisionMemory(doNotRepeat());
    expect(result.valid).toBe(true);
    expect(result.blocksRepetition).toBe(true);
    expect(result.carriesLearningSignal).toBe(true);
  });

  it("repeatIsPermitted returns false for do_not_repeat without explanation", () => {
    expect(repeatIsPermitted("do_not_repeat", undefined)).toBe(false);
  });

  it("repeatIsPermitted returns false for do_not_repeat with short explanation", () => {
    expect(repeatIsPermitted("do_not_repeat", "changed a bit")).toBe(false);
  });
});

// ─── Scenario: repeat allowed with changed context ───────────────────────────

describe("scenario: repeat allowed only with changed context explanation", () => {
  it("valid repeat attempt with adequate explanation → repeatAllowed=true", () => {
    const result = recordDecisionMemory(repeatAttempt());
    expect(result.valid).toBe(true);
    expect(result.repeatAllowed).toBe(true);
  });

  it("non-repeat attempt → repeatAllowed=false", () => {
    const result = recordDecisionMemory(base());
    expect(result.repeatAllowed).toBe(false);
  });

  it("repeatIsPermitted returns true for do_not_repeat with adequate explanation", () => {
    expect(
      repeatIsPermitted(
        "do_not_repeat",
        "Situation changed: input cost rose 20%, making price increase defensible with customer communication plan."
      )
    ).toBe(true);
  });

  it("repeatIsPermitted returns true for non-blocking category", () => {
    expect(repeatIsPermitted("successful_action", undefined)).toBe(true);
  });

  it("repeatIsPermitted returns true for failed_action (non-blocking)", () => {
    expect(repeatIsPermitted("failed_action", undefined)).toBe(true);
  });
});

// ─── Scenario: wrong workspace forbidden ─────────────────────────────────────

describe("workspace scoping", () => {
  it("throws when workspaceId is empty", () => {
    expect(() => recordDecisionMemory(base({ workspaceId: "" }))).toThrow();
  });

  it("throws when workspaceId is whitespace", () => {
    expect(() => recordDecisionMemory(base({ workspaceId: "   " }))).toThrow();
  });
});

// ─── Valid complete inputs ────────────────────────────────────────────────────

describe("valid complete inputs", () => {
  it("successful_action is valid with no violations", () => {
    const result = recordDecisionMemory(base());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("do_not_repeat is valid with no violations", () => {
    const result = recordDecisionMemory(doNotRepeat());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("owner_goal is valid without entity link", () => {
    const result = recordDecisionMemory(
      base({
        category: "owner_goal",
        actionId: undefined,
        summary: "Owner goal: achieve 35% gross margin by Q4 2025 without staff cuts.",
        contextSnapshot: "Current gross margin 28%. Board review scheduled for Q4.",
      })
    );
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("owner_constraint is valid without entity link", () => {
    const result = recordDecisionMemory(
      base({
        category: "owner_constraint",
        actionId: undefined,
        summary: "Owner will not reduce headcount below 12 employees for operational continuity.",
        contextSnapshot: "Current staff at 14. Minimum viable operations require 12.",
      })
    );
    expect(result.valid).toBe(true);
    expect(result.blocksRepetition).toBe(true);
  });
});
