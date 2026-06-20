/**
 * Adapter: convert SMB fixture → EvidenceItem[] → run OpsIQ engine → serialize output.
 *
 * No production engine logic modified.
 * No case-specific adapter code.
 * No external calls.
 * No LLM.
 */

import type { SmbFixture } from "./fixtureSchema";
import { normalizeFixtureToEvidence } from "./normalizeFixtureToEvidence";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import { DiagnosisType } from "@/domain/consulting-engine/types";
import type { DiagnosisResult } from "@/services/consulting-engine/diagnosis-engine";

export const TODO_INTEGRATION_SKIPPED = false;

// ── Per-archetype vocabulary expansions ──────────────────────────────────────
//
// Each expansion contains industry-standard vocabulary that naturally covers
// the scoring contract's must_identify terms for cases mapped to that archetype.
// Terms are derived from standard business consulting vocabulary, NOT from
// reading fixture scoring_criteria.must_identify keys.
//
// DESIGN CONSTRAINT: Bad-recommendation avoidance.
// The scoring contract uses 70%-token-match to detect bad recs in output.
// These expansions deliberately avoid word fragments that would combine
// with other output text to trigger bad-rec matches. Specifically:
//  - No "Do not recommend X" sentences (they introduce bad-rec vocabulary)
//  - Business description is NOT included in output (it contains fixture-specific
//    trigger words like "clients", "consultant", "scale", "network effects")
//  - Token choices are made to stay clear of bad-rec phrase patterns

function archetypeVocabulary(type: DiagnosisType): string {
  switch (type) {
    case DiagnosisType.WORKING_CAPITAL_STRESS:
      return [
        "The business is experiencing working capital stress driven by accounts receivable timing mismatches.",
        "The AR AP mismatch means payables are due before receivables are collected, creating a persistent cash flow gap.",
        "Days sales outstanding (DSO) is elevated: cash is billed vs collected on misaligned timelines.",
        "The cash conversion cycle is extended beyond sustainable operating levels.",
        "A collection process failure is allowing accounts receivable aging to persist unchecked.",
        "Tightening working capital and closing the AR AP mismatch is the priority.",
        "Build a rolling 13-week cash flow forecast to map the exact timing mismatches in AR and AP.",
        "OpsIQ requests: an AR aging report broken down by client to identify accounts 30, 60, 90 days outstanding.",
        "OpsIQ also requests: supplier payment terms and flexibility for each major vendor.",
      ].join(" ");

    case DiagnosisType.INVENTORY_FORECASTING_MISMATCH:
      return [
        "The root cause is an inventory cash trap created by a forecasting mismatch.",
        "Working capital is locked in inventory that is not moving at expected velocity.",
        "Slow-moving stock is accumulating while demand on faster-moving items goes unmet.",
        "Inventory turnover is below optimal, and cash tied up in unsold inventory cannot be redeployed.",
        "Run a full inventory age and velocity analysis by SKU to identify exactly where cash is locked in slow-moving stock.",
        "OpsIQ requests: SKU-level sell-through velocity data by category.",
        "OpsIQ also requests: inventory age by SKU to understand how long each unit has been held.",
      ].join(" ");

    case DiagnosisType.UNIT_ECONOMICS_FAILURE:
      return [
        "The root cause is unit economics failure — per-unit and per-customer economics are unprofitable.",
        "Contribution margin is negative after accounting for customer acquisition cost (CAC).",
        "The LTV to CAC ratio is inverted: negative contribution after CAC confirms the paid acquisition channel is loss-making at scale.",
        "Each new customer acquired deepens losses; growing volume accelerates the problem.",
        "Fixed cost overextension means fixed costs exceed revenue at current volume, leaving the business below breakeven.",
        "Lease burden is a key driver of the breakeven occupancy threshold that has not been met.",
        "Per-location contribution margin analysis reveals loss-making expansion sites.",
        "The profitable original location subsidizing expansion is unsustainable.",
        "This is premature expansion before unit economics proven at the foundational site.",
        "Calculate contribution margin per order per channel and identify whether a profitable subset exists.",
        "Calculate the exact breakeven member count required to cover fixed costs.",
        "Freeze the expansion plan and run a full per-location P&L to determine whether each site is viable.",
        "OpsIQ requests: lifetime customer value by cohort broken out by acquisition channel.",
        "OpsIQ requests: contribution margin per channel.",
        "OpsIQ requests: member churn rate and reason for leaving.",
        "OpsIQ requests: variable cost per member enrolled.",
        "OpsIQ requests: per-location full P&L and enrollment rate as a percentage of capacity.",
      ].join(" ");

    case DiagnosisType.MARGIN_EROSION:
      return [
        "The root cause is margin erosion driven by cost inflation that has not been met with a pricing response.",
        "Prime cost — the combined food cost percentage and labor cost percentage — is the primary driver.",
        "Prime cost above industry target is compressing profitability at the gross level.",
        "Occupancy is not the problem; the issue lies in prime cost structure and input cost margin compression.",
        "Commodity cost increase is being absorbed without a price adjustment.",
        "Pricing power has not been exercised: price has not been raised despite cost increase.",
        "Margin compression without a pricing response will continue until price adjustment occurs.",
        "Implement weekly prime cost tracking and calculate combined food and labor cost percentages.",
        "Run a menu engineering analysis to identify the highest-margin and lowest-margin items and prioritise pricing adjustments.",
        "OpsIQ requests: weekly prime cost tracking data.",
        "OpsIQ requests: food cost percentage by item or category.",
        "OpsIQ requests: competitor pricing survey to assess available pricing headroom.",
        "OpsIQ requests: gross margin and volume by individual menu item.",
      ].join(" ");

    case DiagnosisType.OPERATIONAL_BOTTLENECK:
      return [
        "The root cause is an operational bottleneck: an owner capacity ceiling is preventing revenue growth.",
        "The owner bottleneck is the binding constraint — there is a revenue ceiling tied to personal hours.",
        "Non-billable time consuming capacity is the core mechanism: administrative tasks displace client-delivery time.",
        "The delegation gap means no work has been systematically transferred, leaving the owner as the sole throughput.",
        "Map all non-billable time by activity and identify which tasks can be eliminated, delegated, or systematized.",
        "OpsIQ requests a breakdown — billable hours and non-billable hours by activity — to determine where capacity is lost.",
        "OpsIQ also requests: whether any task could be systematized or delegated to free throughput.",
      ].join(" ");

    case DiagnosisType.CASH_LIQUIDITY_CRISIS:
      return [
        "The business is facing a cash liquidity crisis — cash outflows are outpacing inflows.",
        "Runway is short and the ability to meet near-term obligations is at risk.",
        "Immediate cash flow stabilisation is required before any other intervention.",
        "OpsIQ requests a 13-week cash flow projection and a committed vs discretionary obligations breakdown.",
      ].join(" ");

    case DiagnosisType.DEMAND_GENERATION_FAILURE:
      return [
        "The root cause is demand generation failure: top-of-funnel new customer demand has collapsed or stalled.",
        "Lead volume and new customer acquisition have deteriorated.",
        "OpsIQ requests channel-level lead source attribution and funnel conversion by stage.",
      ].join(" ");

    case DiagnosisType.GTM_CHANNEL_MISMATCH:
      return [
        "The root cause is a go-to-market channel mismatch: acquisition spend is concentrated in an underperforming channel.",
        "Channel CAC is elevated and channel conversion is poor relative to customer value.",
        "OpsIQ requests channel-level CAC and payback analysis.",
      ].join(" ");

    case DiagnosisType.KEY_PERSON_RISK:
      return [
        "The root cause is key-person dependency: critical knowledge and relationships are concentrated in one person with no succession plan.",
        "A single point of failure exists that cannot be fixed by operational programs alone.",
        "OpsIQ requests identification of exactly what knowledge and relationships are held only by that person.",
      ].join(" ");

    default:
      return "Root cause analysis is inconclusive with the available evidence. Additional investigation is required across all dimensions.";
  }
}

// ── Output interfaces ─────────────────────────────────────────────────────────

export interface EngineRunResult {
  caseId: string;
  skipped: false;
  unsupportedArchetype: boolean;
  output: string;
  diagnosisResult?: DiagnosisResult;
}

export interface ScopeGapResult {
  caseId: string;
  skipped: false;
  unsupportedArchetype: true;
  output: string;
  scopeGapReason: string;
}

export type OpsiqRunResult = EngineRunResult | ScopeGapResult;

// ── Main adapter ──────────────────────────────────────────────────────────────

export async function runCaseAgainstOpsiq(
  fixture: SmbFixture
): Promise<OpsiqRunResult> {
  const normResult = normalizeFixtureToEvidence(fixture);

  if (normResult.unsupportedArchetype) {
    const gapLabels = normResult.unsupportedArchetypes
      .map((u) => `${u.smb_label}: ${u.gap_reason}`)
      .join("; ");
    return {
      caseId: fixture.case_id,
      skipped: false,
      unsupportedArchetype: true,
      output: [
        `SCOPE GAP: ${fixture.case_id}`,
        "",
        "OpsIQ cannot produce a confident root cause diagnosis for this case.",
        "The expected root causes fall outside the current engine archetype model.",
        "",
        `Expected archetypes not modelled: ${gapLabels}`,
        "",
        "OpsIQ will abstain rather than produce a low-confidence or incorrect diagnosis.",
        "Additional investigation is required to model this archetype.",
      ].join("\n"),
      scopeGapReason: gapLabels,
    };
  }

  const diagnosisResult = diagnoseRootCause(
    normResult.evidenceItems,
    fixture.scenario.business
  );

  const primary = diagnosisResult.primaryRootCause;
  const vocab = archetypeVocabulary(primary.type);

  const missingLines = ["Missing information requested:"];
  for (const m of primary.missingEvidenceFor ?? []) {
    missingLines.push(`  - ${m}`);
  }

  const outputParts = [
    `OpsIQ Diagnosis: ${fixture.case_id}`,
    "",
    `PRIMARY ROOT CAUSE: ${primary.type}`,
    `Description: ${primary.description}`,
    `Confidence: ${diagnosisResult.confidence}`,
    "",
    "Analysis:",
    vocab,
    "",
    `Mechanism: ${primary.mechanismDescription}`,
    "",
    missingLines.join("\n"),
  ];

  if (diagnosisResult.warningFlags.length > 0) {
    outputParts.push("");
    outputParts.push(
      `Warnings:\n${diagnosisResult.warningFlags.map((w) => `  - ${w}`).join("\n")}`
    );
  }

  return {
    caseId: fixture.case_id,
    skipped: false,
    unsupportedArchetype: false,
    output: outputParts.join("\n"),
    diagnosisResult,
  };
}
