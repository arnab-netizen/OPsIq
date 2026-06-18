#!/usr/bin/env python3
"""Read-only forensic trace for the 3 diagnosis-engine residual over-abstentions
(FRC-11, HC-02, PC-01). Joins the frozen evidence_support_refinement retrial bundles
with the corpus inputs and hidden keys. Writes NOTHING to any artifact/corpus/key/
retrial output; prints a JSON trace to stdout. No engine code is touched.
"""
import json

RETRIAL = "simulation_runs/round_002_retrial_evidence_support_refinement"
CORPUS = "simulation_runs/round_002"
CASES = ["R2-FRC-11", "R2-HC-02", "R2-PC-01"]


def load(p):
    with open(p) as f:
        return json.load(f)


def trace(cid):
    inp = load(f"{CORPUS}/case_{cid}/01_case_input.json")
    key = load(f"{CORPUS}/case_{cid}/key.json")
    sf = load(f"{RETRIAL}/case_{cid}/scored_facts.json")
    sa = load(f"{RETRIAL}/case_{cid}/safety_assessment.json")
    return {
        "case_id": cid,
        "problem": inp.get("businessProblem"),
        "true_primary": key.get("true_primary_diagnosis"),
        "true_secondary": key.get("true_secondary_diagnosis"),
        "expected_gate": key.get("expected_gate_outcome"),
        "expected_safety": key.get("expected_safety_label"),
        "adversarial_type": key.get("adversarial_type"),
        "expected_first_action": key.get("expected_first_action"),
        "acceptable_first_actions": key.get("acceptable_first_actions"),
        "engine_dx": sf["facts"]["primaryDiagnosis"],
        "committed": sf["facts"]["committed"],
        "confidence": sf["facts"]["diagnosisConfidence"],
        "status": sf["facts"]["status"],
        "diagnosis_verdict": sf["score"]["axes"]["diagnosis"],
        "first_action": sf["score"]["axes"]["firstAction"]["sublabel"],
        "safety": sf["score"]["axes"]["safetyOutcome"]["sublabel"],
        "gate_conditions": [u["condition_type"] for u in sa["assessment"]["unsafe_conditions"]],
        "abstain": sa["assessment"]["abstain"],
        "causal_challenge": sa["causal_challenge"],
        "owner_action_danger": sa["owner_action_danger"]["danger"],
        "evidence_support": sa["inputs"]["evidence_support"],
        "evidence": [
            {"dim": e["dimension"], "crit": e.get("isCritical"), "finding": e["finding"], "data": e.get("supportingData")}
            for e in inp.get("evidence", [])
        ],
    }


if __name__ == "__main__":
    print(json.dumps({c: trace(c) for c in CASES}, indent=2))
