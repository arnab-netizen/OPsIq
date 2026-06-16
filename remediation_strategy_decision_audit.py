#!/usr/bin/env python3
"""
REMEDIATION_STRATEGY_DECISION_AUDIT

Analyze whether the existing remediation order (Slices 1-5) should continue
with Slice 2, or whether architecture must be revised before Slice 2.

Five phases:
1. FAILURE_PRIORITY_AUDIT — Rank failure modes by leverage
2. SLICE_2_VALUE_AUDIT — Evaluate numeric layer benefit
3. ALTERNATIVE_NEXT_SLICE_AUDIT — Compare 6 alternatives
4. REVISED_REMEDIATION_ROADMAP — Recommend order or revision
5. REMEDIATION_STRATEGY_DECISION_CLOSEOUT — Final decision
"""

import json
from typing import Dict, List, Any
from datetime import datetime


class RemediationStrategyAuditor:
    """Audit remediation strategy based on trusted baseline."""

    def __init__(self):
        self.baseline = {
            "average_score": 5.53,
            "median_score": 5.25,
            "root_cause_correct": 6,
            "root_cause_correct_pct": 15.0,
            "root_cause_missed": 29,
            "root_cause_missed_pct": 72.5,
            "root_cause_partial": 5,
            "root_cause_partial_pct": 12.5,
            "first_action_correct": 0,
            "first_action_correct_pct": 0.0,
            "first_action_partial": 38,
            "first_action_partial_pct": 95.0,
            "first_action_generic": 2,
            "first_action_generic_pct": 5.0,
            "dangerous": 0,
            "hallucinations": 0,
            "false_confidence": 0,
            "leakage": 0,
            "constraint_violations": 5,
            "slice_1_verdict": "NO_EFFECT",
            "total_cases": 40,
        }

        self.existing_roadmap = {
            "Slice 1": {
                "name": "Diagnosis Archetype Expansion",
                "status": "COMPLETE - NO_EFFECT",
                "cases_affected": "12 targeted",
                "expected_lift": 0.0,
            },
            "Slice 2": {
                "name": "Numeric Calculation Layer",
                "status": "AUTHORIZED - PENDING",
                "cases_affected": "Calculation-heavy cases",
                "expected_lift": "0.4-0.6",
            },
            "Slice 3": {
                "name": "Business Dimension Classifier",
                "status": "PLANNED",
                "cases_affected": "Multi-factor cases",
                "expected_lift": "0.5",
            },
            "Slice 4": {
                "name": "Case-Library Retrieval",
                "status": "DEFERRED - ROUND 2 DEPENDENCY",
                "cases_affected": "Context-heavy cases",
                "expected_lift": "UNKNOWN",
            },
            "Slice 5": {
                "name": "Safety Governance",
                "status": "PLANNED",
                "cases_affected": "Adversarial/safety cases",
                "expected_lift": "0 (safety only)",
            },
        }

        self.audit_results = {}

    def phase_1_failure_priority_audit(self) -> Dict[str, Any]:
        """Phase 1: Rank failure modes by leverage."""
        print("\n[PHASE 1] FAILURE_PRIORITY_AUDIT")
        print("="*80)

        failure_modes = {
            1: {
                "failure_mode": "Root cause diagnosis gap",
                "description": "Engine correctly diagnoses root cause in only 15% of cases (6/40), misses 72.5% (29/40)",
                "cases_affected": 29,
                "pct_affected": 72.5,
                "score_impact_per_case": 2.0,  # Incorrect diagnosis → lower scores
                "owner_use_impact": "CRITICAL - Wrong diagnosis leads to wrong strategy, wasted effort",
                "is_slice_1_issue": False,
                "is_slice_2_issue": False,
                "is_slice_3_issue": False,
                "is_slice_4_issue": True,  # Case library could help with examples
                "is_slice_5_issue": False,
                "leverage_score": 95,  # Highest leverage - affects 72.5% of cases
            },
            2: {
                "failure_mode": "First priority action gap",
                "description": "Engine provides fully correct first action in 0% of cases (0/40), partial in 95% (38/40)",
                "cases_affected": 38,
                "pct_affected": 95.0,
                "score_impact_per_case": 1.5,  # Weak action → lower scores
                "owner_use_impact": "HIGH - Generic actions fail to address case-specific urgency, business context",
                "is_slice_1_issue": False,
                "is_slice_2_issue": False,
                "is_slice_3_issue": True,  # Business dimension could help
                "is_slice_4_issue": True,  # Case library could help
                "is_slice_5_issue": False,
                "leverage_score": 90,  # Very high - affects 95% of cases
            },
            3: {
                "failure_mode": "Business context integration gap",
                "description": "First actions lack business context (0% correct), are generic/structural, miss strategic fit",
                "cases_affected": 38,
                "pct_affected": 95.0,
                "score_impact_per_case": 1.5,
                "owner_use_impact": "CRITICAL - Without business context, recommendations may be technically sound but strategically wrong",
                "is_slice_1_issue": False,
                "is_slice_2_issue": False,
                "is_slice_3_issue": False,  # Business dimension classifier alone won't fix
                "is_slice_4_issue": True,  # Case library + context would help
                "is_slice_5_issue": False,
                "leverage_score": 85,  # Very high - affects strategy quality
            },
            4: {
                "failure_mode": "Numeric reasoning gap",
                "description": "Calculation-heavy cases cannot be scored with 13-dimension model (excluded from baseline)",
                "cases_affected": 10,  # PD cases
                "pct_affected": 20.0,  # Of total 50
                "score_impact_per_case": 1.0,
                "owner_use_impact": "MEDIUM - 10 PD cases unscored, but represent only 20% of Round 1",
                "is_slice_1_issue": False,
                "is_slice_2_issue": True,  # Slice 2 addresses this
                "is_slice_3_issue": False,
                "is_slice_4_issue": False,
                "is_slice_5_issue": False,
                "leverage_score": 50,  # Lower leverage - affects smaller subset
            },
            5: {
                "failure_mode": "Evidence-to-dimension routing gap",
                "description": "Evidence from case input may not map clearly to 13 dimensions for scoring",
                "cases_affected": 40,
                "pct_affected": 100.0,
                "score_impact_per_case": 0.5,
                "owner_use_impact": "MEDIUM - Affects scoring fairness, not diagnosis correctness",
                "is_slice_1_issue": False,
                "is_slice_2_issue": False,
                "is_slice_3_issue": False,
                "is_slice_4_issue": False,
                "is_slice_5_issue": False,
                "leverage_score": 40,  # Lower - architectural issue, not diagnostic
            },
            6: {
                "failure_mode": "Recommendation specificity gap",
                "description": "Recommendations are structurally sound but generic; lack case-specific details, urgency, timing",
                "cases_affected": 38,
                "pct_affected": 95.0,
                "score_impact_per_case": 1.0,
                "owner_use_impact": "HIGH - Generic recommendations require owner to fill in critical details",
                "is_slice_1_issue": False,
                "is_slice_2_issue": False,
                "is_slice_3_issue": False,
                "is_slice_4_issue": True,  # Case library with examples would help
                "is_slice_5_issue": False,
                "leverage_score": 75,  # High - affects recommendation quality
            },
        }

        # Sort by leverage
        sorted_modes = sorted(failure_modes.items(), key=lambda x: x[1]["leverage_score"], reverse=True)

        audit = {
            "timestamp": datetime.now().isoformat(),
            "failure_modes_ranked": [],
            "highest_priority": sorted_modes[0][1]["failure_mode"],
            "highest_priority_leverage": sorted_modes[0][1]["leverage_score"],
        }

        for rank, (idx, mode) in enumerate(sorted_modes, 1):
            audit["failure_modes_ranked"].append({
                "rank": rank,
                "failure_mode": mode["failure_mode"],
                "cases_affected": mode["cases_affected"],
                "pct_affected": mode["pct_affected"],
                "score_impact": mode["score_impact_per_case"],
                "owner_use_impact": mode["owner_use_impact"],
                "addressed_by": {
                    "Slice 1": mode["is_slice_1_issue"],
                    "Slice 2": mode["is_slice_2_issue"],
                    "Slice 3": mode["is_slice_3_issue"],
                    "Slice 4": mode["is_slice_4_issue"],
                    "Slice 5": mode["is_slice_5_issue"],
                },
                "leverage_score": mode["leverage_score"],
            })

        return audit

    def phase_2_slice_2_value_audit(self) -> Dict[str, Any]:
        """Phase 2: Evaluate Slice 2 (Numeric Calculation Layer)."""
        print("\n[PHASE 2] SLICE_2_VALUE_AUDIT")
        print("="*80)

        audit = {
            "timestamp": datetime.now().isoformat(),
            "pd_cases_excluded_from_manual_baseline": 10,
            "pd_cases_pct": 20.0,
            "numeric_gap_exists": True,
            "numeric_gap_cases": ["PD-001", "PD-002", "PD-003", "PD-004", "PD-005", "PD-006", "PD-007", "PD-008", "PD-009", "PD-010"],
            "slice_2_expected_benefit": {
                "pd_cases_now_scorable": True,
                "expected_score_lift_pd_cases": "Unknown - requires numeric scorer implementation",
                "expected_score_lift_non_pd_cases": "0.0 (no impact on RW/ADV/BLND/SYN)",
                "aggregate_expected_lift": "Estimated 0.0-0.1 (if PD cases improve, diluted across 50-case pool)",
            },
            "slice_2_limitations": [
                "Only addresses 10 of 50 cases (20%)",
                "Does not improve root cause accuracy (6/40 → 6/40)",
                "Does not improve first action quality (0/40 → 0/40)",
                "Does not add business context to recommendations",
                "Does not improve diagnostic accuracy on non-PD cases",
                "Calculation-heavy cases (PD) are niche subset of business problem",
            ],
            "does_slice_2_fix_root_cause_accuracy": False,
            "does_slice_2_fix_first_action_quality": False,
            "does_slice_2_fix_business_context_gap": False,
            "does_slice_2_address_highest_priority_failure": False,
            "proceed_now": False,
            "reason": "Slice 2 addresses low-priority numeric gap (50 leverage score) instead of high-priority diagnostic gap (95 leverage score). Expected benefit marginal (0.0-0.1 lift for 20% of cases). Meanwhile, root cause accuracy (72.5% missed) and first action quality (0% correct) remain unaddressed. Would be more strategic to address root cause diagnosis gap first.",
        }

        return audit

    def phase_3_alternative_next_slice_audit(self) -> Dict[str, Any]:
        """Phase 3: Evaluate 6 alternative next slices."""
        print("\n[PHASE 3] ALTERNATIVE_NEXT_SLICE_AUDIT")
        print("="*80)

        alternatives = {
            "A": {
                "option": "Continue Slice 2 - Numeric Calculation Layer",
                "cases_addressed": "PD-001..010 (10 calculation-heavy cases)",
                "expected_impact": "Estimated +0.0-0.1 on aggregate score (20% of pool with unknown improvement)",
                "risk": "LOW technical risk, but MEDIUM strategic risk (low-priority gap, marginal lift)",
                "implementation_complexity": "2-3 days",
                "safety_risk": "LOW",
                "overfitting_risk": "LOW",
                "recommended": False,
                "reason": "Addresses low-priority numeric gap instead of high-priority diagnostic gap. Expected score lift marginal while 72.5% of root causes still missed.",
            },
            "B": {
                "option": "Revise Slice 1 triggers to improve diagnosis coverage",
                "cases_addressed": "RW-001..015, ADV-001..010, BLND-001..005, SYN-001..010 (40 cases)",
                "expected_impact": "Estimated +0.5-1.0 if triggers generalize to real-world evidence patterns",
                "risk": "MEDIUM - Slice 1 already showed minimal impact (NO_EFFECT); broader triggers may have same limitation",
                "implementation_complexity": "1-2 days (pattern analysis + trigger rewriting)",
                "safety_risk": "LOW - can test on non-adversarial cases first",
                "overfitting_risk": "MEDIUM - risk of overfitting to Round 1 cases if not careful",
                "recommended": "MAYBE",
                "reason": "Directly addresses root cause accuracy weakness. But Slice 1's NO_EFFECT verdict suggests problem may be deeper than triggers. Would need careful evidence analysis to avoid overfitting to specific Round 1 cases.",
            },
            "C": {
                "option": "Build evidence-to-dimension classifier before Slice 2",
                "cases_addressed": "All 40 cases (improves evidence routing)",
                "expected_impact": "Estimated +0.2-0.4 (helps with score fairness and evidence trace)",
                "risk": "MEDIUM - architectural change, needs integration with existing scorer",
                "implementation_complexity": "3-5 days",
                "safety_risk": "LOW",
                "overfitting_risk": "LOW",
                "recommended": "MAYBE",
                "reason": "Addresses evidence-to-dimension gap (score fairness) but not root cause diagnosis. Secondary issue compared to diagnostic accuracy.",
            },
            "D": {
                "option": "Build first-priority action selector before Slice 2",
                "cases_addressed": "All 40 cases (improves first action quality)",
                "expected_impact": "Estimated +0.5-1.0 if can improve from 0/40 correct to 10-15/40 correct",
                "risk": "MEDIUM-HIGH - requires business context understanding, not just pattern matching",
                "implementation_complexity": "5-7 days",
                "safety_risk": "LOW",
                "overfitting_risk": "MEDIUM - risk of learning case-specific patterns that don't generalize",
                "recommended": "YES",
                "reason": "Directly addresses second-highest priority failure (first action accuracy 0%). Would improve recommendation quality for 95% of cases. Requires business context integration but high payoff.",
            },
            "E": {
                "option": "Build business-context integration layer before Slice 2",
                "cases_addressed": "All 40 cases (improves diagnosis + action + recommendations)",
                "expected_impact": "Estimated +1.0-2.0 if can add strategic/market context to recommendations",
                "risk": "HIGH - architectural addition, complex integration with existing diagnosis",
                "implementation_complexity": "7-10 days",
                "safety_risk": "MEDIUM - needs careful validation to avoid hallucinations",
                "overfitting_risk": "HIGH - risk of learning case-pack-specific patterns",
                "recommended": "MAYBE",
                "reason": "Most comprehensive but also most complex. Would address root cause (by adding context) and first action (by adding business awareness). But high risk and implementation complexity. Could consider as post-Slice 2 priority.",
            },
            "F": {
                "option": "Pause engine fixes and create Round 2 pack first",
                "cases_addressed": "Round 2 validation cases (50+ new cases)",
                "expected_impact": "Enables Slice 4 (Case Library) immediately; validates improvements on diverse dataset",
                "risk": "MEDIUM-HIGH - delays engine improvements; requires Round 2 case pack creation effort",
                "implementation_complexity": "5-7 days (case pack), then 3-5 days (Slice 4 implementation)",
                "safety_risk": "LOW",
                "overfitting_risk": "MEDIUM - Round 1 case pack might be over-represented in Slices 1-3",
                "recommended": "MAYBE",
                "reason": "Strategic approach: build Round 2 validation set to prevent overfitting to Round 1. But delays improvements. Could be considered after Slice 3.",
            },
        }

        audit = {
            "timestamp": datetime.now().isoformat(),
            "alternatives_evaluated": [],
        }

        for option_key, option_data in alternatives.items():
            audit["alternatives_evaluated"].append({
                "option": option_key,
                "option_name": option_data["option"],
                "cases_addressed": option_data["cases_addressed"],
                "expected_impact": option_data["expected_impact"],
                "risk": option_data["risk"],
                "implementation_complexity": option_data["implementation_complexity"],
                "safety_risk": option_data["safety_risk"],
                "overfitting_risk": option_data["overfitting_risk"],
                "recommended": option_data["recommended"],
                "reason": option_data["reason"],
            })

        return audit

    def phase_4_revised_roadmap(self) -> Dict[str, Any]:
        """Phase 4: Recommend revised roadmap."""
        print("\n[PHASE 4] REVISED_REMEDIATION_ROADMAP")
        print("="*80)

        # Based on Phase 1-3 analysis
        roadmap = {
            "timestamp": datetime.now().isoformat(),
            "analysis_summary": {
                "failure_priority_1": "Root cause diagnosis gap (95 leverage - 72.5% of cases affected)",
                "failure_priority_2": "First action quality gap (90 leverage - 95% of cases affected)",
                "failure_priority_3": "Business context integration (85 leverage - strategy critical)",
                "failure_priority_4": "Recommendation specificity (75 leverage - owner usability)",
                "failure_priority_5": "Numeric reasoning gap (50 leverage - 20% of cases)",
                "slice_1_verdict": "NO_EFFECT - minimal impact despite correct diagnosis on one case",
                "slice_2_benefit": "Addresses low-priority gap (50 leverage) with marginal score lift (0.0-0.1)",
            },
            "recommended_next_step": "Build first-priority action selector before Slice 2",
            "reason": "Addresses second-highest priority failure (0% → 10-15% correct first actions) affecting 95% of cases. Slice 2 (numeric layer) only benefits 20% of cases with marginal lift. Strategic to fix first action quality before expanding to other failures.",
            "revised_slice_order": [
                {"position": 1, "slice": "Slice 1 (COMPLETE)", "status": "DONE - NO_EFFECT", "reason": "Already executed"},
                {"position": 2, "slice": "NEW: First Priority Action Selector", "status": "RECOMMENDED", "reason": "Addresses 95% of cases, 0% → ~15% correct actions, high ROI"},
                {"position": 3, "slice": "Slice 2 (Numeric Calculation Layer)", "status": "DEFER - POST ACTION SELECTOR", "reason": "Low-priority numeric gap; after action selector in place"},
                {"position": 4, "slice": "Slice 3 (Business Dimension Classifier)", "status": "PLANNED", "reason": "Addresses multi-factor cases after action selector"},
                {"position": 5, "slice": "Slice 4 (Case Library Retrieval)", "status": "DEFERRED - ROUND 2 DEPENDENCY", "reason": "Requires Round 2 pack; adds context to diagnosis and actions"},
                {"position": 6, "slice": "Slice 5 (Safety Governance)", "status": "PLANNED", "reason": "Safety enhancements; baseline already safe"},
            ],
            "slice_to_defer": "Slice 2 (Numeric Calculation Layer)",
            "slice_to_insert": "NEW: First Priority Action Selector (between Slice 1 and Slice 2)",
            "required_execution_file_update": True,
            "required_tests": [
                "Unit tests for first priority action scoring logic",
                "Integration tests with recommendation generation",
                "Regression tests on baseline cases to ensure no score degradation",
                "Adversarial tests to ensure safe refusal preserved",
            ],
            "required_benchmark_reruns": [
                "Re-baseline after action selector to measure improvement vs. 5.53 current",
                "Verify all 40 cases still valid under new scoring",
                "Confirm safety properties maintained",
            ],
            "final_status": "ROADMAP_REVISION_REQUIRED",
        }

        return roadmap

    def phase_5_decision_closeout(self) -> Dict[str, Any]:
        """Phase 5: Final decision closeout."""
        print("\n[PHASE 5] REMEDIATION_STRATEGY_DECISION_CLOSEOUT")
        print("="*80)

        closeout = {
            "timestamp": datetime.now().isoformat(),
            "trusted_baseline_used": True,
            "baseline_characteristics": {
                "cases_reviewed": 40,
                "average_manual_score": 5.53,
                "median_manual_score": 5.25,
                "root_cause_correct": 6,
                "root_cause_correct_pct": 15.0,
                "root_cause_missed": 29,
                "root_cause_missed_pct": 72.5,
                "first_action_correct": 0,
                "first_action_correct_pct": 0.0,
                "first_action_partial": 38,
                "first_action_partial_pct": 95.0,
                "safety_clean": True,
            },
            "slice_1_status": "COMPLETE - NO_EFFECT (1 diagnosis improved, 11 unchanged, 0 regressed)",
            "slice_2_status": "AUTHORIZED BUT SHOULD DEFER - Addresses low-priority gap; marginal benefit",
            "failure_priority_ranking": [
                {"rank": 1, "failure": "Root cause diagnosis (72.5% missed)", "leverage": 95, "addressed_by": "Slices 1,3,4 (none fully fix)"},
                {"rank": 2, "failure": "First action quality (0% correct)", "leverage": 90, "addressed_by": "NEW ACTION SELECTOR, Slices 3,4"},
                {"rank": 3, "failure": "Business context gap", "leverage": 85, "addressed_by": "NEW CONTEXT LAYER, Slice 4"},
                {"rank": 4, "failure": "Recommendation specificity", "leverage": 75, "addressed_by": "Slices 4,5"},
                {"rank": 5, "failure": "Numeric reasoning gap", "leverage": 50, "addressed_by": "Slice 2"},
            ],
            "recommended_next_action": "BUILD_NEW_FIRST_PRIORITY_ACTION_SELECTOR_SLICE",
            "reason": "Addresses 0% → ~15% correct first actions affecting 95% of cases. Slice 2 addresses 20% of cases with marginal lift. Strategic ROI favors action selector first.",
            "recommended_next_action_details": {
                "new_slice_name": "First Priority Action Selector",
                "placement": "Between Slice 1 (complete) and Slice 2 (deferred)",
                "scope": "40 non-PD cases",
                "expected_improvement": "0% → 10-15% fully correct first actions; 0% → ~50% strongly aligned actions",
                "estimated_effort": "5-7 days (action classification, business context integration, testing)",
                "expected_score_lift": "+0.5-1.0 on aggregate (from current 5.53)",
                "safety_risk": "LOW (action category and structure sound, adding business context)",
                "testing_requirement": "Regression tests on baseline, adversarial safety tests",
            },
            "final_status": "READY_FOR_USER_DECISION",
            "required_user_decision": "Approve roadmap revision (insert new First Priority Action Selector slice before Slice 2) OR continue with original Slice 2 authorization despite lower priority/marginal benefit",
        }

        return closeout

    def run_full_audit(self) -> Dict[str, Any]:
        """Run complete 5-phase audit."""
        print("\n" + "="*80)
        print("REMEDIATION_STRATEGY_DECISION_AUDIT - FULL ANALYSIS")
        print("="*80)

        results = {
            "timestamp": datetime.now().isoformat(),
            "phase_1_failure_priority_audit": self.phase_1_failure_priority_audit(),
            "phase_2_slice_2_value_audit": self.phase_2_slice_2_value_audit(),
            "phase_3_alternative_next_slice_audit": self.phase_3_alternative_next_slice_audit(),
            "phase_4_revised_remediation_roadmap": self.phase_4_revised_roadmap(),
            "phase_5_remediation_strategy_decision_closeout": self.phase_5_decision_closeout(),
        }

        return results

    def save_results(self, results: Dict[str, Any]):
        """Save audit results."""
        path = "/home/user/OPsIq/REMEDIATION_STRATEGY_DECISION_AUDIT.json"
        with open(path, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        print(f"\n✓ Full audit saved: {path}")

    def print_summary(self, results: Dict[str, Any]):
        """Print executive summary."""
        closeout = results["phase_5_remediation_strategy_decision_closeout"]

        print("\n" + "="*80)
        print("AUDIT SUMMARY & RECOMMENDATION")
        print("="*80)
        print()
        print("TRUSTED BASELINE:")
        print(f"  • 40 cases manually reviewed")
        print(f"  • Average score: 5.53/10")
        print(f"  • Root cause accuracy: 6/40 correct (15%)")
        print(f"  • First action accuracy: 0/40 correct (0%)")
        print(f"  • Safety: CLEAN (0 dangerous, hallucinations, false confidence)")
        print()
        print("FAILURE PRIORITY (by leverage):")
        print(f"  1. Root cause diagnosis gap (95 leverage - 72.5% affected)")
        print(f"  2. First action quality gap (90 leverage - 95% affected)")
        print(f"  3. Business context integration (85 leverage)")
        print(f"  4. Recommendation specificity (75 leverage)")
        print(f"  5. Numeric reasoning gap (50 leverage - 20% affected)")
        print()
        print("SLICE 2 EVALUATION:")
        print(f"  • Addresses: Numeric gap (priority 5, 50 leverage)")
        print(f"  • Cases affected: 10 of 50 (20%)")
        print(f"  • Expected benefit: 0.0-0.1 score lift (marginal)")
        print(f"  • Verdict: LOW PRIORITY - defer")
        print()
        print("RECOMMENDATION:")
        print(f"  → {closeout['recommended_next_action']}")
        print(f"  → Insert new First Priority Action Selector BEFORE Slice 2")
        print(f"  → Expected improvement: +0.5-1.0 on aggregate score")
        print(f"  → Cases affected: 40 of 40 (100%)")
        print()
        print("REVISED ROADMAP:")
        print(f"  1. Slice 1: ✓ COMPLETE (NO_EFFECT)")
        print(f"  2. NEW: First Priority Action Selector (RECOMMENDED)")
        print(f"  3. Slice 2: Numeric Calculation Layer (DEFER)")
        print(f"  4. Slice 3: Business Dimension Classifier (PLAN)")
        print(f"  5. Slice 4: Case Library Retrieval (PLAN)")
        print(f"  6. Slice 5: Safety Governance (PLAN)")
        print()
        print(f"FINAL STATUS: {closeout['final_status']}")
        print("="*80)


def main():
    """Execute full audit."""
    auditor = RemediationStrategyAuditor()
    results = auditor.run_full_audit()
    auditor.save_results(results)
    auditor.print_summary(results)
    return results


if __name__ == "__main__":
    main()
