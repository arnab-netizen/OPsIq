import { describe, it, expect } from "vitest";
import {
  GOVERNED_STAGE_STATES,
  INTERVENTION_MODES,
  INTERVENTION_PHASES,
  BUSINESS_CONDITION_RATINGS,
  HUMAN_FACTOR_TYPES,
  ACTION_STATUSES,
  EVIDENCE_STATUSES,
  APPROVAL_STATUSES,
  RISK_SEVERITIES,
  RISK_STATUSES,
  VISIBILITY_LEVELS,
  ENGAGEMENT_STATUSES,
  DELIVERABLE_STATUSES,
} from "./statuses";

describe("Domain status constants", () => {
  it("GOVERNED_STAGE_STATES has all 18 required states", () => {
    expect(GOVERNED_STAGE_STATES).toHaveLength(18);
    expect(GOVERNED_STAGE_STATES).toContain("draft");
    expect(GOVERNED_STAGE_STATES).toContain("not_started");
    expect(GOVERNED_STAGE_STATES).toContain("active");
    expect(GOVERNED_STAGE_STATES).toContain("pending_input");
    expect(GOVERNED_STAGE_STATES).toContain("awaiting_client");
    expect(GOVERNED_STAGE_STATES).toContain("awaiting_consultant");
    expect(GOVERNED_STAGE_STATES).toContain("awaiting_validation");
    expect(GOVERNED_STAGE_STATES).toContain("awaiting_approval");
    expect(GOVERNED_STAGE_STATES).toContain("blocked");
    expect(GOVERNED_STAGE_STATES).toContain("deferred");
    expect(GOVERNED_STAGE_STATES).toContain("partially_completed");
    expect(GOVERNED_STAGE_STATES).toContain("completed");
    expect(GOVERNED_STAGE_STATES).toContain("cancelled");
    expect(GOVERNED_STAGE_STATES).toContain("reopened");
    expect(GOVERNED_STAGE_STATES).toContain("disputed");
    expect(GOVERNED_STAGE_STATES).toContain("provisional_output_only");
    expect(GOVERNED_STAGE_STATES).toContain("forced_closure_review");
    expect(GOVERNED_STAGE_STATES).toContain("dormant");
  });

  it("INTERVENTION_MODES has all required modes", () => {
    expect(INTERVENTION_MODES).toHaveLength(5);
    expect(INTERVENTION_MODES).toContain("recovery");
    expect(INTERVENTION_MODES).toContain("stabilization");
    expect(INTERVENTION_MODES).toContain("growth");
    expect(INTERVENTION_MODES).toContain("shock_response");
    expect(INTERVENTION_MODES).toContain("mixed");
  });

  it("INTERVENTION_PHASES has all required phases", () => {
    expect(INTERVENTION_PHASES).toHaveLength(4);
    expect(INTERVENTION_PHASES).toContain("triage");
    expect(INTERVENTION_PHASES).toContain("stabilization");
    expect(INTERVENTION_PHASES).toContain("recovery");
    expect(INTERVENTION_PHASES).toContain("growth");
  });

  it("BUSINESS_CONDITION_RATINGS has 6 levels", () => {
    expect(BUSINESS_CONDITION_RATINGS).toHaveLength(6);
    expect(BUSINESS_CONDITION_RATINGS).toContain("critical");
    expect(BUSINESS_CONDITION_RATINGS).toContain("strong");
  });

  it("HUMAN_FACTOR_TYPES has all 8 operational types", () => {
    expect(HUMAN_FACTOR_TYPES).toHaveLength(8);
    expect(HUMAN_FACTOR_TYPES).toContain("owner_bottlenecking");
    expect(HUMAN_FACTOR_TYPES).toContain("follow_through_risk");
    expect(HUMAN_FACTOR_TYPES).toContain("resistance_to_change");
    expect(HUMAN_FACTOR_TYPES).toContain("communication_breakdown");
    expect(HUMAN_FACTOR_TYPES).toContain("morale_fragility");
    expect(HUMAN_FACTOR_TYPES).toContain("management_capability");
    expect(HUMAN_FACTOR_TYPES).toContain("key_person_dependency");
    expect(HUMAN_FACTOR_TYPES).toContain("accountability_weakness");
  });

  it("all status arrays contain no duplicates", () => {
    const arrays = [
      GOVERNED_STAGE_STATES,
      INTERVENTION_MODES,
      INTERVENTION_PHASES,
      BUSINESS_CONDITION_RATINGS,
      HUMAN_FACTOR_TYPES,
      ACTION_STATUSES,
      EVIDENCE_STATUSES,
      APPROVAL_STATUSES,
      RISK_SEVERITIES,
      RISK_STATUSES,
      VISIBILITY_LEVELS,
      ENGAGEMENT_STATUSES,
      DELIVERABLE_STATUSES,
    ];
    for (const arr of arrays) {
      expect(new Set(arr).size).toBe(arr.length);
    }
  });
});
