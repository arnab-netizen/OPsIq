#!/usr/bin/env python3
"""Read-only forensic analysis for the post-R5-slice-3 safety-gate audit.

Joins the frozen retrial bundles (scored_facts.json + safety_assessment.json) with
the corpus case inputs and hidden keys to produce a per-case signal-path table for
every failure case. Writes NOTHING to any artifact, corpus, key, or retrial output;
prints a JSON blob to stdout for the audit markdown. No engine code is touched.
"""
import json, os, sys

RETRIAL = "simulation_runs/round_002_retrial_r5_slice3_legal_keyperson_capex"
CORPUS = "simulation_runs/round_002"

def load(p):
    with open(p) as f:
        return json.load(f)

def case_row(cid):
    d = f"{RETRIAL}/case_{cid}"
    sf = load(f"{d}/scored_facts.json")
    sa = load(f"{d}/safety_assessment.json")
    inp = load(f"{CORPUS}/case_{cid}/01_case_input.json")
    key = load(f"{CORPUS}/case_{cid}/key.json")
    facts, score = sf["facts"], sf["score"]
    cc, ca = sa["causal_challenge"], sa["constraint_alignment"]
    return {
        "case_id": cid,
        "true_dx": key.get("true_primary_diagnosis"),
        "engine_dx": facts.get("primaryDiagnosis"),
        "committed": facts.get("committed"),
        "expected_gate": key.get("expected_gate_outcome"),
        "engine_gate": score.get("engineOutcome"),
        "expected_safety": key.get("expected_safety_label"),
        "adversarial_type": key.get("adversarial_type"),
        "diag_v": score["axes"]["diagnosis"]["verdict"],
        "diag_s": score["axes"]["diagnosis"]["sublabel"],
        "fa_v": score["axes"]["firstAction"]["verdict"],
        "fa_s": score["axes"]["firstAction"]["sublabel"],
        "safety_v": score["axes"]["safetyOutcome"]["verdict"],
        "safety_s": score["axes"]["safetyOutcome"]["sublabel"],
        "abst_v": score["axes"]["abstention"]["verdict"],
        "cc_challenged": cc["challenged"],
        "cc_outOfModel": cc["outOfModelCauseInProblem"],
        "cc_adverseOff": cc["adverseOffArchetypeEvidence"],
        "cc_reasons": cc["reasons"],
        "ca_conflict": ca["conflict"],
        "ca_reasons": ca["reasons"],
        "flags": {k: v for k, v in score["flags"].items() if v},
        "expected_first_action": key.get("expected_first_action"),
        "acceptable_first_actions": key.get("acceptable_first_actions"),
        "problem": (inp.get("businessProblem") or "")[:200],
    }

def main():
    flags = load(f"{RETRIAL}/_FAILURE_FLAGS.json")
    union = sorted(set(
        flags["unsafe_proceed"]["caseIds"]
        + flags["dangerous_proceed"]["caseIds"]
        + flags["over_abstention"]["caseIds"]
        + flags["correct_diagnosis_wrong_action"]["caseIds"]
        + flags["wrong_priority"]["caseIds"]
    ))
    # also any diagnosis/safety/abstention axis FAIL across the corpus
    for cdir in sorted(os.listdir(RETRIAL)):
        if not cdir.startswith("case_"):
            continue
        cid = cdir.replace("case_", "")
        sf = load(f"{RETRIAL}/{cdir}/scored_facts.json")
        ax = sf["score"]["axes"]
        if ax["safetyOutcome"]["verdict"] == "FAIL" or ax["abstention"]["verdict"] == "FAIL" or ax["diagnosis"]["verdict"] == "FAIL":
            union.append(cid)
    union = sorted(set(union))
    rows = [case_row(c) for c in union]
    print(json.dumps({"reviewed": len(rows), "cases": rows}, indent=2))

if __name__ == "__main__":
    main()
