import { describe, it, expect } from "vitest";
import { scoreOutput } from "./scoringContract";
import { getRealWorldSmbCaseById } from "./loadFixtures";

// ── SMB-001: Cash flow / working capital trap ─────────────────────────────────

describe("SMB-001: strong root-cause answer passes", () => {
  it("identifies working capital timing gap and requests missing inputs", () => {
    const fixture = getRealWorldSmbCaseById("SMB-001");
    const strongAnswer = [
      "The primary issue is a working capital cash flow trap.",
      "Your accounts receivable timing creates a structural cash conversion cycle gap:",
      "you pay suppliers in 30 days but collect from clients in 60 days.",
      "The AR AP mismatch means you are financing your clients' operations with your own credit line.",
      "Before any other action, build a 13-week rolling cash flow forecast.",
      "Missing inputs I need: your AR aging report broken down by client,",
      "the payment terms flexibility with your major suppliers,",
      "and your current cash conversion cycle calculation.",
    ].join(" ");

    const result = scoreOutput(strongAnswer, fixture);
    expect(result.passed).toBe(true);
    expect(result.totalScore).toBeGreaterThanOrEqual(0.7);
    expect(result.dimensionResults.ROOT_CAUSE_ALIGNMENT.passed).toBe(true);
    expect(result.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.passed).toBe(true);
  });
});

describe("SMB-001: generic marketing answer fails BAD_RECOMMENDATION_AVOIDANCE", () => {
  it("fails when output recommends increasing marketing and sales", () => {
    const fixture = getRealWorldSmbCaseById("SMB-001");
    const badAnswer =
      "You should increase marketing and sales efforts to grow revenue and overcome cash shortfalls. " +
      "More sales volume will eventually fix the cash problem.";

    const result = scoreOutput(badAnswer, fixture);
    expect(result.passed).toBe(false);
    expect(result.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.passed).toBe(false);
    expect(result.criticalFailures).toContain("BAD_RECOMMENDATION_AVOIDANCE");
  });
});

// ── SMB-002: Inventory cash trap ─────────────────────────────────────────────

describe("SMB-002: answer ignoring inventory trap fails ROOT_CAUSE_ALIGNMENT", () => {
  it("fails when output focuses on marketing without identifying inventory issue", () => {
    const fixture = getRealWorldSmbCaseById("SMB-002");
    const ignoresInventory =
      "Focus on increasing your sales and marketing to move more products. " +
      "Hire a sales consultant to drive more volume and improve your revenue trajectory.";

    const result = scoreOutput(ignoresInventory, fixture);
    expect(result.passed).toBe(false);
    expect(result.dimensionResults.ROOT_CAUSE_ALIGNMENT.passed).toBe(false);
  });
});

// ── SMB-003: Negative unit economics / paid ads ───────────────────────────────

describe("SMB-003: more-ads answer fails BAD_RECOMMENDATION_AVOIDANCE", () => {
  it("fails when output recommends increasing ad spend", () => {
    const fixture = getRealWorldSmbCaseById("SMB-003");
    const moreAds =
      "Increase your ad spend to scale customer acquisition faster. " +
      "Launch more campaigns across additional platforms to maximize reach and revenue growth.";

    const result = scoreOutput(moreAds, fixture);
    expect(result.passed).toBe(false);
    expect(result.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.passed).toBe(false);
  });
});

// ── SMB-004: Restaurant prime cost ───────────────────────────────────────────

describe("SMB-004: restaurant answer identifying prime cost passes", () => {
  it("passes when output identifies prime cost and food + labor percentage", () => {
    const fixture = getRealWorldSmbCaseById("SMB-004");
    const primeAnswer = [
      "The core issue is prime cost — your combined food cost and labor cost as a percentage of revenue.",
      "At 68% prime cost (food 38% + labor 30%), you are above the industry target of 60-65%.",
      "The restaurant being busy on weekends is a misleading signal — occupancy is not the problem.",
      "The margin structure is broken.",
      "First action: implement weekly prime cost tracking so you can see real food cost percentage",
      "and labor cost percentage each week.",
      "I need to understand your food waste tracking and your labor scheduling before recommending further.",
    ].join(" ");

    const result = scoreOutput(primeAnswer, fixture);
    expect(result.passed).toBe(true);
    expect(result.dimensionResults.ROOT_CAUSE_ALIGNMENT.passed).toBe(true);
    expect(result.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.passed).toBe(true);
  });
});

// ── SMB-007: Solopreneur capacity ceiling ─────────────────────────────────────

describe("SMB-007: work-harder answer fails BAD_RECOMMENDATION_AVOIDANCE", () => {
  it("fails when output tells solopreneur to work harder or take on more clients", () => {
    const fixture = getRealWorldSmbCaseById("SMB-007");
    const workHarder =
      "You need to work harder and take on more clients to grow revenue. " +
      "With more discipline and effort, you can serve your waitlist and increase income.";

    const result = scoreOutput(workHarder, fixture);
    expect(result.passed).toBe(false);
    expect(result.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.passed).toBe(false);
    expect(result.criticalFailures).toContain("BAD_RECOMMENDATION_AVOIDANCE");
  });
});

// ── SMB-011: SaaS vanity metrics ─────────────────────────────────────────────

describe("SMB-011: answer distinguishing audience from paid validation passes", () => {
  it("passes when output identifies paid conversion gap vs audience engagement", () => {
    const fixture = getRealWorldSmbCaseById("SMB-011");
    const distinguishesCorrectly = [
      "Your 38% email open rate and social following are genuine engagement signals,",
      "but audience engagement is not the same as willingness to pay.",
      "The critical issue is the gap between free users and paid conversion rate — 2.1% paid",
      "conversion after 8 months with 4,200 free users indicates a product market fit gap.",
      "Before growing your audience further, you need to understand why free users are not converting.",
      "First action: interview 10 non-converting free users and 5 paying users",
      "to identify the willingness to pay threshold and the job-to-be-done.",
      "Missing inputs: exit survey data, willingness to pay research, and whether paying users retain.",
    ].join(" ");

    const result = scoreOutput(distinguishesCorrectly, fixture);
    expect(result.passed).toBe(true);
    expect(result.dimensionResults.ROOT_CAUSE_ALIGNMENT.passed).toBe(true);
  });

  it("fails when output treats audience engagement alone as product market fit signal", () => {
    const fixture = getRealWorldSmbCaseById("SMB-011");
    const treatsEngagementAsFit =
      "Your audience engagement is strong and your open rate of 38% is excellent. " +
      "Build on your social media following and grow content output to convert more followers. " +
      "Launch an affiliate program to drive more signups and revenue will follow.";

    const result = scoreOutput(treatsEngagementAsFit, fixture);
    // Should fail either ROOT_CAUSE (no paid conversion / product market fit identified)
    // or BAD_RECOMMENDATION (affiliate program / grow social media are flagged)
    expect(result.passed).toBe(false);
  });
});

// ── Missing input requests ─────────────────────────────────────────────────────

describe("answer with no missing-input requests loses score", () => {
  it("scores lower when root cause is partly correct but no missing inputs are requested", () => {
    const fixture = getRealWorldSmbCaseById("SMB-001");
    const noMissingInputs =
      "The issue is a working capital cash flow problem caused by AR AP mismatch. " +
      "Your cash conversion cycle is too long. Build a 13-week cash flow forecast immediately. " +
      "Negotiate better payment terms with your suppliers.";
    // Has correct root cause content but never asks for missing inputs

    const result = scoreOutput(noMissingInputs, fixture);
    // Should not get a perfect score because MISSING_INPUT_REQUESTS is near zero
    expect(result.dimensionResults.MISSING_INPUT_REQUESTS.score).toBeLessThan(0.5);
    // Total score should be lower than a complete answer
    expect(result.totalScore).toBeLessThan(0.9);
  });
});
