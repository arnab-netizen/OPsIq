export interface FirstWinCheckInput {
  expectedImpact: number;
  actualOutcomeValue?: number | null;
  outcomeDelta?: number | null;
  impactExpected: number;
}

// First win threshold: impact must exceed $50,000
const FIRST_WIN_THRESHOLD = 50000;

export function isFirstWinConditionMet(input: FirstWinCheckInput): boolean {
  const { expectedImpact, actualOutcomeValue, outcomeDelta, impactExpected } = input;

  // Check if actual outcome exceeds expected
  let actualOutcome = actualOutcomeValue ?? outcomeDelta ?? 0;

  // Fallback: use expectedImpact if outcomes not available
  if (!actualOutcomeValue && !outcomeDelta) {
    actualOutcome = expectedImpact;
  }

  // First win: actual outcome > expected impact AND impact > threshold
  return actualOutcome > expectedImpact && impactExpected > FIRST_WIN_THRESHOLD;
}

export function getFirstWinMessage(input: FirstWinCheckInput): string | null {
  if (isFirstWinConditionMet(input)) {
    return "First Win Achieved";
  }
  return null;
}
