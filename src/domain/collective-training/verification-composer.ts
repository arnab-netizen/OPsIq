/**
 * C11 — Collective proof + verification composer (pure).
 *
 * Assembles the proof requirement and verification plan and decides whether a "success"
 * may be claimed. Proof of ACTION is never proof of SUCCESS. Wires the existing F8
 * harm-ledger rule (`harmfulSideEffectPreventsSuccess`) — a material side effect blocks
 * success even when the primary metric improved. A missing baseline becomes a
 * baseline-collection action; an unverifiable outcome blocks success.
 */

import type { HarmEntry } from "@/domain/domain-training/harm-ledger";
import { harmfulSideEffectPreventsSuccess, isMaterialHarm } from "@/domain/domain-training/harm-ledger";
import type { VerificationPlan } from "@/domain/collective-training/collective-types";

export interface VerificationInput {
  lever: string;
  sideEffectMetrics: string[];
  harms: HarmEntry[];
  primaryImproved: boolean;
  baselinePresent: boolean;
  outcomeVerifiable: boolean;
  proofOwner: string;
  reviewWindow: string;
}

export interface VerificationComposition {
  proofRequired: { evidenceType: string; sourceStrength: string; deadline: string; responsiblePerson: string };
  verificationPlan: VerificationPlan;
  successAllowed: boolean;
  reasons: string[];
}

export function composeVerification(i: VerificationInput): VerificationComposition {
  const reasons: string[] = [];

  // F8 rule: material harm OR no primary improvement → not a success.
  const harmBlocks = harmfulSideEffectPreventsSuccess(i.primaryImproved, i.harms);
  if (i.harms.some(isMaterialHarm)) reasons.push("material_side_effect");
  if (!i.primaryImproved) reasons.push("primary_not_improved");
  if (!i.outcomeVerifiable) reasons.push("outcome_not_verifiable");

  const successAllowed = !harmBlocks && i.outcomeVerifiable;

  const baseline = i.baselinePresent
    ? "recorded baseline metric"
    : "ACTION: collect the baseline metric first (no baseline on record)";
  if (!i.baselinePresent) reasons.push("baseline_missing");

  const verificationPlan: VerificationPlan = {
    baseline,
    successMetric: `${i.lever}: target metric improved AND verified against baseline`,
    failureMetric: `${i.lever}: target metric flat/worse or unverifiable`,
    sideEffectMetrics: i.sideEffectMetrics.length > 0 ? i.sideEffectMetrics : ["complaints", "cash", "quality"],
    reviewWindow: i.reviewWindow,
    proofOwner: i.proofOwner,
  };

  return {
    proofRequired: {
      evidenceType: `${i.lever} outcome evidence (not merely proof the action happened)`,
      sourceStrength: i.outcomeVerifiable ? "verified/strong" : "insufficient — strengthen before claiming success",
      deadline: i.reviewWindow,
      responsiblePerson: i.proofOwner,
    },
    verificationPlan,
    successAllowed,
    reasons,
  };
}
