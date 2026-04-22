import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  validateInterventionPhaseTransition,
  getInterventionPhaseAllowedTransitions,
} from "@/policies/state-transition";
import { InvalidStateTransitionError } from "@/infra/errors";
import type { InterventionPhase } from "@/domain/constants/statuses";

describe("Intervention Phase Transitions", () => {
  describe("validateInterventionPhaseTransition", () => {
    it("should allow assessment -> planning", () => {
      expect(() =>
        validateInterventionPhaseTransition("assessment", "planning")
      ).not.toThrow();
    });

    it("should allow planning -> execution", () => {
      expect(() =>
        validateInterventionPhaseTransition("planning", "execution")
      ).not.toThrow();
    });

    it("should allow execution -> review", () => {
      expect(() =>
        validateInterventionPhaseTransition("execution", "review")
      ).not.toThrow();
    });

    it("should allow review -> handover", () => {
      expect(() =>
        validateInterventionPhaseTransition("review", "handover")
      ).not.toThrow();
    });

    it("should allow review -> execution (loop back)", () => {
      expect(() =>
        validateInterventionPhaseTransition("review", "execution")
      ).not.toThrow();
    });

    it("should allow handover -> closed", () => {
      expect(() =>
        validateInterventionPhaseTransition("handover", "closed")
      ).not.toThrow();
    });

    it("should reject closed -> any transition", () => {
      expect(() =>
        validateInterventionPhaseTransition("closed", "assessment")
      ).toThrow(InvalidStateTransitionError);
    });

    it("should reject skipping phases (assessment -> execution)", () => {
      expect(() =>
        validateInterventionPhaseTransition("assessment", "execution")
      ).toThrow(InvalidStateTransitionError);
    });

    it("should reject backwards transitions (planning -> assessment)", () => {
      expect(() =>
        validateInterventionPhaseTransition("planning", "assessment")
      ).toThrow(InvalidStateTransitionError);
    });

    it("should reject invalid phase names", () => {
      expect(() =>
        validateInterventionPhaseTransition("invalid" as InterventionPhase, "planning")
      ).toThrow(InvalidStateTransitionError);
    });
  });

  describe("getInterventionPhaseAllowedTransitions", () => {
    it("should return [planning] for assessment", () => {
      const allowed = getInterventionPhaseAllowedTransitions("assessment");
      expect(allowed).toEqual(["planning"]);
    });

    it("should return [execution] for planning", () => {
      const allowed = getInterventionPhaseAllowedTransitions("planning");
      expect(allowed).toEqual(["execution"]);
    });

    it("should return [review] for execution", () => {
      const allowed = getInterventionPhaseAllowedTransitions("execution");
      expect(allowed).toEqual(["review"]);
    });

    it("should return [handover, execution] for review", () => {
      const allowed = getInterventionPhaseAllowedTransitions("review");
      expect(allowed).toEqual(["handover", "execution"]);
    });

    it("should return [closed] for handover", () => {
      const allowed = getInterventionPhaseAllowedTransitions("handover");
      expect(allowed).toEqual(["closed"]);
    });

    it("should return [] for closed", () => {
      const allowed = getInterventionPhaseAllowedTransitions("closed");
      expect(allowed).toEqual([]);
    });
  });
});
