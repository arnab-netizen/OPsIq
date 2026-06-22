/**
 * Batch 1 Scoring Script — OpsIQ Real-World Simulation Program
 *
 * Loads all 12 simulation fixtures, applies mock outputs of varying quality,
 * scores each case using scoreSimulationOutput(), and prints a JSON result per
 * case plus summary stats.
 *
 * EXECUTION PATH VERDICT: MOCK ONLY.
 * The real OpsIQ engine (runCaseAgainstOpsiq) requires SmbFixture format +
 * evidence-hint sidecars per case. No simulation-to-SmbFixture adapter exists,
 * no sidecar files exist for the 12 simulation cases, and the normalizeFixtureToEvidence
 * function expects scenario.business/symptoms/facts_known_to_owner — not
 * input_packet.business_description. Until an adapter and per-case sidecar files
 * are authored, all output strings are mock-constructed and no real engine validation
 * is possible.
 */

import { loadSimulationFixtures } from "./loadSimulationFixtures";
import {
  scoreSimulationOutput,
  checkAdversarialResistance,
  checkTrapResistance,
} from "./simulationScoringContract";
import type { SimulationFixture } from "./simulationFixtureSchema";

// ── Mock output library ───────────────────────────────────────────────────────
// Outputs are written to hit or miss specific scoring criteria.
// They are NOT derived from the fixture answer keys — they are hand-crafted
// diagnostic prose that resembles realistic OpsIQ output at three quality levels.
// Quality is varied across the 12 cases per the scoring script mandate.

/**
 * STRONG outputs — hit most must_identify terms, request missing inputs,
 * include conditional framing, avoid all bad_recs.
 */
const STRONG_OUTPUTS: Record<string, string> = {
  "SIM-01-001": [
    "The presenting pattern here is a recurring cash shortfall at payroll date driven by",
    "accounts receivable collection lag from enterprise clients who are slow to settle.",
    "The debtors aged by client will show which enterprise clients are routinely paying late.",
    "The billing cycle timing does not align with the bi-weekly payroll schedule —",
    "invoices are issued after service delivery but collected weeks later, creating a structural",
    "cash shortfall at every payroll cycle. No structured collections process exists to pursue",
    "overdue balances before the payroll date arrives.",
    "Before any action: I need to see outstanding balances broken down by client and number of days",
    "past due. I also require the billing terms in each client contract and when invoices are",
    "issued relative to service delivery, plus historical payment patterns for the top five clients.",
    "Once we have the aged debtors report by client, the first action is to contact the three",
    "largest slow-paying clients to request immediate settlement or a payment schedule.",
    "This analysis assumes the underlying revenue and margin position is sound —",
    "if further evidence changes that picture, the priority sequence may need revision.",
  ].join(" "),

  "SIM-02-002": [
    "Revenue growth of 58% has been accompanied by declining owner earnings — this is a",
    "cost of purchased stock as proportion of revenue problem, not a demand problem.",
    "The business has added product range which has driven slow-moving inventory and increased",
    "dependence on discount dependency clearance events to move stock.",
    "The full-price sell-through rate has fallen as product range overextension has created",
    "more lines than the business can sell at full price within a normal season cycle.",
    "The gross margin compression from promotional discounting is the primary mechanism.",
    "I need to see the cost of purchased stock as a proportion of revenue for each of the",
    "past three years, inventory turnover by product category, and the split between",
    "full-price and discounted revenue.",
    "If the margin breakdown confirms discount dependency is structural, the path forward is",
    "range rationalisation — not further catalogue expansion.",
    "First action: calculate what percentage of revenue was sold at full price versus marked",
    "down for each of the past three years, then identify which product categories have the",
    "highest rate of discounted clearance. Assuming this data confirms the pattern, the",
    "recommendation will be to reduce SKU count, not increase it.",
  ].join(" "),

  "SIM-03-002": [
    "The surplus decline is most likely explained by food cost as proportion of revenue rising",
    "over the past 24 months while menu pricing not reviewed has left selling prices unchanged.",
    "This is cost absorption without recovery — direct costs rising against stable selling prices",
    "has produced margin erosion over time that cannot be explained by catering volume alone.",
    "The owner's attribution of the problem to catering booking softness is consistent with the",
    "narrative but does not account for the sustained multi-year decline across the full business.",
    "I need to see current food and packaging cost as a percentage of revenue compared to two",
    "years ago, and a breakdown of café revenue and costs separately from catering.",
    "First action: calculate what percentage of café revenue is consumed by the cost of food",
    "and packaging today versus two years ago, then compare current menu prices against the actual",
    "cost to produce the five highest-volume items.",
    "Once we have this data, if cost absorption without recovery is confirmed, the primary lever",
    "is a menu repricing exercise — not a catering marketing campaign.",
    "Pending the cost breakdown, this diagnosis may need revision if catering margin is materially",
    "different from the café operation.",
  ].join(" "),

  "SIM-04-002": [
    "The average client tenure of only three months is the key diagnostic signal here.",
    "This is a staff consistency per client problem — not a pricing competitiveness problem.",
    "The roster rotation appears to be assigning different cleaners to the same household between",
    "visits, which is the most likely driver of early departure. Clients who experience a change",
    "of cleaner between first and subsequent bookings typically stop rebooking.",
    "The owner's instinct to cut rates risks reducing margin without addressing the actual",
    "driver: pricing misattribution by owner is obscuring a need to audit departure pattern",
    "against staff assignment.",
    "I need to see which specific staff member performed each session for clients who subsequently",
    "stopped booking, any exit feedback from clients who did not rebook after their second or",
    "third session, and the roster scheduling process used to assign staff.",
    "First action: map which staff member completed each session for the clients who departed",
    "in the past 90 days, then identify whether clients who left experienced a change of cleaner",
    "between their first and subsequent bookings.",
    "If this pattern confirms, the fix is a consistent cleaner assignment policy — not a price cut.",
    "Assuming the data supports the pattern, pricing changes should be avoided until the",
    "retention driver is confirmed.",
  ].join(" "),

  "SIM-06-002": [
    "There is a direct conflict between the owner's stated 70 percent utilisation and the",
    "operational experience of declining new contracts due to staff shortage.",
    "If 14 staff are at 70 percent utilisation, approximately 4 full-time equivalent positions",
    "of spare capacity should exist. These two statements cannot both be true without explanation —",
    "either the utilisation figure is incorrect, or spare capacity exists but is inaccessible due",
    "to scheduling, geography, or contract timing constraints.",
    "The scheduling and routing inefficiency is the most likely explanation: non-contiguous site",
    "scheduling creating idle travel time, manual roster construction not optimising geographic",
    "clustering, and new contracts declined without testing whether the existing roster can",
    "accommodate them.",
    "I need to see a schedule showing each staff member's booked hours, travel time, and idle",
    "gaps for a typical week, the geographic locations of all current contract sites, and the",
    "start and finish times required under each contract.",
    "First action: map each staff member's weekly schedule showing booked hours, travel time,",
    "and idle gaps, then calculate actual productive cleaning hours as a percentage of paid hours.",
    "This must be done before any recruitment decision. Assuming the audit confirms scheduling",
    "inefficiency, hiring before resolving the roster converts a process problem into a",
    "permanent higher cost base.",
  ].join(" "),
};

/**
 * MEDIUM outputs — hit ~60% of must_identify terms, miss some inputs,
 * generally correct archetype but incomplete coverage.
 */
const MEDIUM_OUTPUTS: Record<string, string> = {
  "SIM-01-002": [
    "The cash stress across the business appears to be driven by project billing schedule",
    "issues — milestone claims are not being submitted promptly after completion.",
    "Staged invoicing is not being enforced systematically and retention balances have",
    "accumulated across multiple completed jobs.",
    "The owner's attribution of all current stress to the client who delayed payment",
    "14 months ago is not supported by the current data — the historical late payment was",
    "recovered but the structural billing discipline gap remains.",
    "I need to see a schedule of all active projects with what has been completed and billed,",
    "and the billing terms for each project contract.",
    "First action: build a billing schedule for every active project showing each milestone,",
    "whether it has been invoiced, and the expected receipt date.",
    "Once we have this, the next step is to identify any milestone already completed but not",
    "yet billed. Depending on the volume of unbilled completed work, the immediate action",
    "may be to issue invoices before any other diagnostic step.",
  ].join(" "),

  "SIM-02-001": [
    "The business has a fixed overhead per location that exceeds what current revenue",
    "can support at two of the four sites. The expansion decision was made without",
    "location-level viability assessment at each site.",
    "The owner is using network revenue to subsidise locations not covering their own costs.",
    "Revenue per location is not the primary constraint — the fixed cost base at each site is.",
    "I need to see a location-by-location profit and loss for the past 12 months and the",
    "fixed costs for each location.",
    "First action: produce a location-by-location profit and loss for the past three months",
    "and identify which locations are covering their fixed cost base.",
    "If evidence confirms that two locations have never covered their own costs, the path",
    "forward is structural: consolidate or close underperforming sites before any marketing",
    "investment. Subject to the P&L review, further expansion would be contraindicated.",
  ].join(" "),

  "SIM-04-001": [
    "The actual departure rate versus stated rate is the critical discrepancy here.",
    "With 200 subscribers and 12 new signups per month producing no net growth, the implied",
    "departure rate is approximately 6 per month or around 36 percent annualised — not 5 percent.",
    "This is a churn calculation methodology failure: the owner is not tracking actual",
    "monthly departure count.",
    "Exit feedback indicating product or onboarding issues suggests the retention problem",
    "is concentrated in the early subscriber lifecycle.",
    "I need to see the actual number of subscribers who cancelled each month for the past",
    "12 months and exit survey data from departing subscribers.",
    "The net subscriber growth stall despite new signups confirms that retention, not",
    "acquisition, is the constraint.",
    "First action: calculate the actual number of subscribers who left over the past",
    "12 months and compare to the stated departure figure.",
    "Assuming the real departure rate is confirmed at approximately 36 percent, the priority",
    "is an onboarding and early-tenure retention intervention — not feature addition or",
    "price reduction.",
  ].join(" "),

  "SIM-05-002": [
    "The flat active member count despite consistent new signups of 18 per month means",
    "approximately 18 members are also leaving each month — the attrition rate is offsetting",
    "new member intake exactly.",
    "This is a retention failure not an acquisition failure. The member attrition rate",
    "exceeds what the acquisition rate can overcome. Departure pattern not tracked means",
    "the owner has no visibility into why members leave.",
    "More advertising spend will not change the net membership count if the departure rate",
    "remains at current levels.",
    "I need to see the number of members who did not renew each month for the past 12 months",
    "and any feedback from members who have left.",
    "First action: calculate how many members left or did not renew each month for the past",
    "12 months and determine the net membership change to confirm whether the problem is",
    "acquisition or attrition.",
    "If attrition is confirmed as the constraint, the next step is a retention intervention —",
    "not expanded advertising. Depending on feedback data, the intervention may target",
    "engagement, programming, or the member experience.",
  ].join(" "),
};

/**
 * WEAK outputs — hit <50% of must_identify terms, may suggest a bad_rec,
 * lack strong evidence requests.
 */
const WEAK_OUTPUTS: Record<string, string> = {
  "SIM-03-001": [
    "The declining surplus is likely due to general market cost pressure and the business",
    "may need to expand its customer base to compensate. Revenue has held steady but costs",
    "have risen across the board. The owner should consider growing total revenue by adding",
    "new overseas suppliers and expanding the product range to gain more scale.",
    "A dedicated salesperson could help grow revenue and offset the cost increases.",
    "Costs have probably risen across all three product categories equally given general",
    "inflation. The business should invest in building an online sales channel to reach",
    "more customers and improve total volumes. Consider increasing general promotional",
    "activity to raise brand awareness and drive revenue growth.",
    "The main lever here is revenue growth. If the owner can grow total sales volume,",
    "the fixed cost base will be absorbed more efficiently.",
  ].join(" "),

  "SIM-05-001": [
    "The low conversion rate suggests the intake team needs to follow up faster.",
    "Implementing a CRM system to improve tracking and follow-up of incoming enquiries",
    "would significantly improve the conversion rate from 4 percent.",
    "Hiring a dedicated intake manager to handle lead follow-up more consistently",
    "would also help ensure enquiries are not lost. The business should increase the",
    "digital advertising budget to generate a higher total volume of enquiries to compensate",
    "for the low conversion rate. More advertising channels should be added to diversify",
    "lead sources. With better follow-up processes in place the firm should be able to",
    "convert more of its existing enquiry volume into retained clients.",
  ].join(" "),

  "SIM-06-001": [
    "The business clearly needs more craftspeople and should hire immediately to reduce",
    "lead times. All five production staff appear uniformly busy which confirms a general",
    "capacity shortage. The owner should invest in a larger workshop facility to accommodate",
    "more simultaneous orders. The business could also reduce the number of furniture designs",
    "offered to simplify production. An additional two craftspeople as the owner suggests",
    "would be a reasonable starting point. Revenue will improve once more capacity is added.",
    "The throughput problem is a straightforward headcount issue.",
  ].join(" "),
};

// ── Score all 12 cases ────────────────────────────────────────────────────────

function getMockOutput(fixture: SimulationFixture): string {
  const caseId = fixture.case_id;
  if (STRONG_OUTPUTS[caseId]) return STRONG_OUTPUTS[caseId];
  if (MEDIUM_OUTPUTS[caseId]) return MEDIUM_OUTPUTS[caseId];
  if (WEAK_OUTPUTS[caseId]) return WEAK_OUTPUTS[caseId];
  // Fallback: empty output (should not happen if all 12 are covered)
  return "";
}

function main(): void {
  const corpus = loadSimulationFixtures();
  if (corpus.status === "NOT_READY") {
    console.error("CORPUS NOT READY:", corpus.reason);
    process.exit(1);
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log("OPSIQ REAL-WORLD SIMULATION — BATCH 1 SCORING");
  console.log(`${"=".repeat(72)}`);
  console.log(`Cases loaded: ${corpus.fixtures.length}`);
  console.log("Output source: MOCK (no real engine adapter)\n");

  const results: Array<{
    case_id: string;
    category: string;
    test_type: string;
    title: string;
    output_source: string;
    score: ReturnType<typeof scoreSimulationOutput>;
    adversarialResult?: ReturnType<typeof checkAdversarialResistance>;
    trapResult?: ReturnType<typeof checkTrapResistance>;
    failureClass: string;
  }> = [];

  for (const fixture of corpus.fixtures) {
    const output = getMockOutput(fixture);
    const score = scoreSimulationOutput(output, fixture);

    let adversarialResult: ReturnType<typeof checkAdversarialResistance> | undefined;
    let trapResult: ReturnType<typeof checkTrapResistance> | undefined;

    // TT-2 adversarial check
    if (fixture.test_type === "TT-2") {
      const adv = (fixture as Record<string, unknown>).adversarial as
        | { expected_misclassification?: string }
        | undefined;
      const expMisclass = adv?.expected_misclassification;
      if (expMisclass) {
        adversarialResult = checkAdversarialResistance(output, expMisclass);
      }
    }

    // TT-5 trap check
    if (fixture.test_type === "TT-5") {
      const sta = (fixture as Record<string, unknown>).signal_trap_analysis as
        | { primary_trap?: string }
        | undefined;
      const primaryTrap = sta?.primary_trap;
      if (primaryTrap) {
        trapResult = checkTrapResistance(output, primaryTrap);
      }
    }

    // Failure classification
    let failureClass = "PASS";
    if (!score.passed) {
      if (fixture.test_type === "TT-2" && adversarialResult && !adversarialResult.passed) {
        failureClass = "SIM_TRAP_TAKEN";
      } else if (fixture.test_type === "TT-5" && trapResult && !trapResult.passed) {
        failureClass = "SIM_TRAP_TAKEN";
      } else if (!score.dimensionResults.badRecommendationAvoidance.passed) {
        failureClass = "SIM_ENGINE_GAP"; // bad recs present = wrong archetype territory
      } else if (!score.dimensionResults.evidenceDiscipline.passed) {
        failureClass = "SIM_CONFABULATION"; // no evidence requests
      } else if (!score.dimensionResults.rootCause.passed) {
        const rcScore = score.dimensionResults.rootCause.score;
        if (rcScore === 0) {
          failureClass = "SIM_ENGINE_GAP";
        } else {
          failureClass = "SIM_INPUT_MODEL_GAP";
        }
      } else {
        failureClass = "SIM_SCORING_LIMITATION";
      }
    }

    const outputSource = STRONG_OUTPUTS[fixture.case_id]
      ? "MOCK_STRONG"
      : MEDIUM_OUTPUTS[fixture.case_id]
      ? "MOCK_MEDIUM"
      : WEAK_OUTPUTS[fixture.case_id]
      ? "MOCK_WEAK"
      : "MOCK_EMPTY";

    results.push({
      case_id: fixture.case_id,
      category: fixture.category,
      test_type: fixture.test_type,
      title: fixture.title,
      output_source: outputSource,
      score,
      adversarialResult,
      trapResult,
      failureClass,
    });

    // Per-case JSON output
    console.log(`\n── ${fixture.case_id} (${fixture.test_type}) ──`);
    console.log(
      JSON.stringify(
        {
          case_id: score.case_id,
          output_source: outputSource,
          totalScore: score.totalScore,
          passed: score.passed,
          failureClass,
          criticalFailures: score.criticalFailures,
          failedDimensions: score.failedDimensions,
          rootCause: {
            score: score.dimensionResults.rootCause.score,
            passed: score.dimensionResults.rootCause.passed,
            matched: score.dimensionResults.rootCause.matchedTerms,
            missing: score.dimensionResults.rootCause.missingTerms,
          },
          badRecommendationAvoidance: {
            passed: score.dimensionResults.badRecommendationAvoidance.passed,
            flagged: score.dimensionResults.badRecommendationAvoidance.matchedTerms,
          },
          evidenceDiscipline: {
            passed: score.dimensionResults.evidenceDiscipline.passed,
          },
          missingInputRequests: {
            score: score.dimensionResults.missingInputRequests.score,
            passed: score.dimensionResults.missingInputRequests.passed,
          },
          ...(adversarialResult ? { adversarialResistance: adversarialResult } : {}),
          ...(trapResult ? { trapResistance: trapResult } : {}),
        },
        null,
        2
      )
    );
  }

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalCases = results.length;
  const passedCases = results.filter((r) => r.score.passed).length;
  const failedCases = totalCases - passedCases;
  const passRate = passedCases / totalCases;

  const badRecViolations = results.filter(
    (r) => !r.score.dimensionResults.badRecommendationAvoidance.passed
  );
  const badRecDetails = badRecViolations.flatMap((r) =>
    r.score.dimensionResults.badRecommendationAvoidance.matchedTerms.map(
      (t) => `${r.case_id}: "${t}"`
    )
  );

  const tt4Cases = results.filter((r) => r.test_type === "TT-4");
  const conflictFlagged = tt4Cases.filter((r) => {
    // TT-4: check if conflict terms were flagged (utilisation conflict, churn conflict)
    const output = getMockOutput(corpus.fixtures.find((f) => f.case_id === r.case_id)!);
    const norm = output.toLowerCase();
    return norm.includes("conflict") || norm.includes("cannot both") || norm.includes("discrepancy") ||
      norm.includes("in direct conflict") || norm.includes("understated") || norm.includes("implied");
  });

  const tt5Cases = results.filter((r) => r.test_type === "TT-5");
  const trapResisted = tt5Cases.filter((r) => !r.trapResult || r.trapResult.passed);

  const failureClassCounts: Record<string, number> = {};
  for (const r of results) {
    failureClassCounts[r.failureClass] = (failureClassCounts[r.failureClass] ?? 0) + 1;
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log("SUMMARY");
  console.log(`${"=".repeat(72)}`);
  console.log(
    JSON.stringify(
      {
        totalCases,
        passedCases,
        failedCases,
        passRate: Math.round(passRate * 100) / 100,
        passRatePct: `${Math.round(passRate * 100)}%`,
        badRecommendationViolations: badRecViolations.length,
        badRecDetails,
        tt4_conflict_detection: {
          total: tt4Cases.length,
          flagged: conflictFlagged.length,
          rate: tt4Cases.length > 0 ? Math.round((conflictFlagged.length / tt4Cases.length) * 100) / 100 : null,
        },
        tt5_trap_resistance: {
          total: tt5Cases.length,
          resisted: trapResisted.length,
          rate: tt5Cases.length > 0 ? Math.round((trapResisted.length / tt5Cases.length) * 100) / 100 : null,
        },
        failureClassBreakdown: failureClassCounts,
        realEngineUsed: false,
        validationEvidence: "NO — mock outputs only; real engine execution pending adapter build",
      },
      null,
      2
    )
  );

  console.log(`\n${"=".repeat(72)}`);
  console.log("PER-CASE SCORE TABLE");
  console.log(`${"=".repeat(72)}`);
  console.log(
    [
      "case_id     | cat   | TT  | source       | score | pass | RC.score | BRA.pass | EVD.pass | MIR.score | failClass",
      "-".repeat(120),
    ].join("\n")
  );
  for (const r of results) {
    const dim = r.score.dimensionResults;
    console.log(
      [
        r.case_id.padEnd(11),
        r.category.padEnd(5),
        r.test_type.padEnd(4),
        r.output_source.padEnd(13),
        String(r.score.totalScore).padEnd(5),
        String(r.score.passed).padEnd(5),
        String(dim.rootCause.score).padEnd(8),
        String(dim.badRecommendationAvoidance.passed).padEnd(8),
        String(dim.evidenceDiscipline.passed).padEnd(8),
        String(dim.missingInputRequests.score).padEnd(10),
        r.failureClass,
      ].join(" | ")
    );
  }

  process.exit(failedCases > 0 ? 0 : 0); // Always exit 0 — failures are expected in mock mode
}

main();
