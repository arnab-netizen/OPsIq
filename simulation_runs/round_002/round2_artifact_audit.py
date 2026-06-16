#!/usr/bin/env python3
"""
Round 2 Benchmark Artifact Hostile Re-Audit.
Implements the Universal Benchmark Artifact Quality Gate checks
(execution_consultant_engine_v2.md §13A) against the on-disk case pack.

Pure stdlib. Exit code 0 = READY, 1 = NOT READY.
"""
import json
import os
import re
import sys
from difflib import SequenceMatcher

CASES_DIR = os.path.join(os.path.dirname(__file__), "cases")

VALID_LABELS = {
    "OPERATIONAL_BOTTLENECK", "QUALITY_CONTROL_FAILURE", "CUSTOMER_RETENTION_EROSION",
    "BRAND_EROSION", "DEMAND_FORECASTING_MISMATCH", "UNIT_ECONOMICS_BREAKDOWN",
    "GO_TO_MARKET_MISALIGNMENT", "STRATEGIC_PRICING_ERROR", "GOVERNANCE_COMPLIANCE_FAILURE",
    "TRUST_QUALITY_CRISIS", "CASH_RUNWAY_CRISIS", "INSUFFICIENT_EVIDENCE",
}

REQUIRED_DIMS = {
    "root_cause_accuracy", "first_action_accuracy", "business_relevance",
    "constraint_awareness", "evidence_traceability", "confidence_calibration", "safety",
}

EXPECTED = {
    "RW": list(range(16, 31)),   # 16-30
    "PD": list(range(11, 21)),   # 11-20
    "SYN": list(range(11, 21)),  # 11-20
    "ADV": list(range(11, 21)),  # 11-20
    "BLND": list(range(6, 11)),  # 6-10
}


def case_ids():
    ids = []
    for t, nums in EXPECTED.items():
        for n in nums:
            width = 3
            ids.append(f"{t}-{n:0{width}d}")
    return ids


def load(path):
    with open(path) as f:
        return json.load(f)


def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def main():
    failures = []
    warnings = []
    ids = case_ids()

    inputs = {}
    keys = {}

    # ---- PHASE A: inventory + parser validity ----
    complete = 0
    for cid in ids:
        d = os.path.join(CASES_DIR, cid)
        inp = os.path.join(d, "01_case_input.json")
        ak = os.path.join(d, f"ANSWER_KEY_{cid}.json")
        if not os.path.isdir(d):
            failures.append(f"[INVENTORY] missing directory: {cid}")
            continue
        if not os.path.isfile(inp):
            failures.append(f"[INVENTORY] missing case input: {cid}")
            continue
        if not os.path.isfile(ak):
            failures.append(f"[INVENTORY] missing answer key: {cid}")
            continue
        try:
            inputs[cid] = load(inp)
        except Exception as e:
            failures.append(f"[PARSER] invalid JSON input {cid}: {e}")
            continue
        try:
            keys[cid] = load(ak)
        except Exception as e:
            failures.append(f"[PARSER] invalid JSON answer key {cid}: {e}")
            continue
        complete += 1

    print(f"complete_case_pairs: {complete}/{len(ids)}")

    # ---- PHASE B: answer-key field + label + scoring validity ----
    for cid, ak in keys.items():
        rc = ak.get("root_cause_diagnosis")
        if not rc:
            failures.append(f"[ANSWERKEY] {cid}: missing root_cause_diagnosis")
        elif rc not in VALID_LABELS:
            failures.append(f"[ANSWERKEY] {cid}: invalid root-cause label '{rc}'")
        if not ak.get("first_priority_action"):
            failures.append(f"[ANSWERKEY] {cid}: missing first_priority_action")
        sc = ak.get("scoring_criteria") or {}
        missing_dims = REQUIRED_DIMS - set(sc.keys())
        if missing_dims:
            failures.append(f"[SCORING] {cid}: missing scoring dimensions {sorted(missing_dims)}")
        for dim, body in sc.items():
            if not isinstance(body, dict) or not body:
                failures.append(f"[SCORING] {cid}.{dim}: empty/malformed criteria")
                continue
            if "rubric_10" not in body:
                failures.append(f"[SCORING] {cid}.{dim}: missing rubric_10")
        # required hardened fields
        for fld in ("automatic_fail_conditions", "source_references",
                    "accepted_alternative_actions", "bad_actions"):
            v = ak.get(fld)
            if not v:
                warnings.append(f"[FIELD] {cid}: missing/empty '{fld}'")

    # ---- PHASE: duplicate / near-duplicate answer keys ----
    fp = {}
    for cid, ak in keys.items():
        sig = norm(ak.get("root_cause_description", "")) + "||" + norm(ak.get("first_priority_action", ""))
        fp.setdefault(sig, []).append(cid)
    for sig, group in fp.items():
        if len(group) > 1:
            failures.append(f"[DUPLICATE] identical answer-key core: {group}")

    # near-duplicate (>0.92) of first_priority_action across cases
    items = list(keys.items())
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            a = norm(items[i][1].get("first_priority_action", ""))
            b = norm(items[j][1].get("first_priority_action", ""))
            if not a or not b:
                continue
            r = SequenceMatcher(None, a, b).ratio()
            if r > 0.92:
                failures.append(f"[NEAR-DUP] {items[i][0]} ~ {items[j][0]} first_action ratio={r:.2f}")

    # ---- duplicate / near-duplicate inputs ----
    fpi = {}
    for cid, inp in inputs.items():
        sig = norm(json.dumps(inp.get("ownerIntake", {}), sort_keys=True))
        fpi.setdefault(sig, []).append(cid)
    for sig, group in fpi.items():
        if len(group) > 1:
            failures.append(f"[DUPLICATE-INPUT] identical ownerIntake: {group}")

    # ---- generic template phrase scan ----
    GENERIC = [
        "public dataset case", "synthetic stress-test case",
        "adversarial case", "blind-outcome case",
        "forward-looking strategic decision with uncertain outcomes",
    ]
    for cid, ak in keys.items():
        desc = norm(ak.get("root_cause_description", ""))
        for g in GENERIC:
            if g in desc and len(desc) < 400:
                warnings.append(f"[GENERIC] {cid}: possibly generic root_cause_description")

    # ---- PHASE C: leakage ----
    for cid, inp in inputs.items():
        raw = norm(json.dumps(inp))
        # adversarial inputs must not contain the literal word 'trap'
        if cid.startswith("ADV") and "trap" in raw:
            failures.append(f"[LEAKAGE] {cid}: 'trap' appears in visible input")
        ak = keys.get(cid, {})
        rc = ak.get("root_cause_diagnosis", "")
        # the exact root-cause label must not appear verbatim in the visible input
        if rc and rc not in ("INSUFFICIENT_EVIDENCE",):
            if rc.lower() in raw:
                failures.append(f"[LEAKAGE] {cid}: root-cause label '{rc}' present in visible input")
        # blind hidden outcome must not be in input
        if cid.startswith("BLND"):
            bs = ak.get("blind_structure", {})
            if not bs.get("hidden_outcome"):
                failures.append(f"[BLIND] {cid}: answer key missing blind_structure.hidden_outcome")
            for hindsight in ("as it turned out", "in hindsight", "ultimately succeeded", "ultimately failed"):
                if hindsight in raw:
                    failures.append(f"[BLIND] {cid}: hindsight phrase '{hindsight}' in input")

    # ---- PD deterministic requirements ----
    for cid, ak in keys.items():
        if cid.startswith("PD"):
            ds = ak.get("deterministic_scoring", {})
            if not ds:
                failures.append(f"[PD-DET] {cid}: missing deterministic_scoring")
                continue
            if not ds.get("expected_values"):
                failures.append(f"[PD-DET] {cid}: missing expected_values")
            if not ds.get("tolerance"):
                failures.append(f"[PD-DET] {cid}: missing tolerance")
            if not ds.get("required_formulas"):
                failures.append(f"[PD-DET] {cid}: missing required_formulas")

    # ---- type-specific structure ----
    for cid, ak in keys.items():
        if cid.startswith("ADV") and not ak.get("trap_definition"):
            failures.append(f"[ADV] {cid}: missing trap_definition")
        if cid.startswith("SYN") and not ak.get("synthetic_fact_mapping"):
            warnings.append(f"[SYN] {cid}: missing synthetic_fact_mapping")

    # ---- owner decision pressure / depth ----
    for cid, inp in inputs.items():
        oi = inp.get("ownerIntake", {})
        if not oi.get("ownerConstraints") or len(oi.get("ownerConstraints", [])) < 3:
            warnings.append(f"[DEPTH] {cid}: <3 ownerConstraints")
        if not inp.get("evidence") or len(inp.get("evidence", [])) < 3:
            warnings.append(f"[DEPTH] {cid}: <3 evidence items")

    # ---- distribution report ----
    dist = {}
    for cid, ak in keys.items():
        rc = ak.get("root_cause_diagnosis", "?")
        dist[rc] = dist.get(rc, 0) + 1

    print("\nroot_cause_distribution:")
    for k, v in sorted(dist.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")

    print(f"\nWARNINGS ({len(warnings)}):")
    for w in warnings:
        print("  " + w)

    print(f"\nFAILURES ({len(failures)}):")
    for f in failures:
        print("  " + f)

    print("\n" + "=" * 60)
    if failures:
        print("UNIVERSAL_BENCHMARK_ARTIFACT_QUALITY_GATE: FAIL")
        sys.exit(1)
    else:
        print("UNIVERSAL_BENCHMARK_ARTIFACT_QUALITY_GATE: PASS")
        sys.exit(0)


if __name__ == "__main__":
    main()
