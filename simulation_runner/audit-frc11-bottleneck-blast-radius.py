#!/usr/bin/env python3
"""Read-only blast-radius scan for the FRC-11 bottleneck-pattern audit. Identifies every
corpus case that carries the PROPOSED standalone-bottleneck signal (critical
operational_efficiency item with bottleneck/turnaround/capacity vocab, non-positive
framing, and a turnaround/utilization/capacity numeric) — i.e. the cases the relaxed
operational_bottleneck trigger would newly let match. Joins the frozen pc01 retrial with
the corpus inputs/keys. Writes NOTHING; prints JSON. No engine code touched.
"""
import json, glob, os, re

RETRIAL = "simulation_runs/round_002_retrial_pc01_survival_dominance"
CORPUS = "simulation_runs/round_002"
OPERATIONAL_TOPIC = re.compile(
    r"turnaround|slow|capacity|delay|utiliz|utilis|backlog|throughput|queue|bottleneck|lead time|wait|cycle time"
)
POSITIVE = re.compile(
    r"healthy|strong|robust|comfortabl|ample|plenti|plenty|lengthy|extended|generous|solid|stable|steady|improv|expand|grew|growing|grown|surplus|well[- ]|profitab|favou?rab|reassur|on track|on target|above target|ahead of target|no (concern|issue|problem|risk)|not (a |an |the )?(concern|issue|problem)"
)


def txt(e):
    return (e["finding"] + " " + json.dumps(e.get("supportingData") or {})).lower()


def num(e, k):
    v = (e.get("supportingData") or {}).get(k)
    return v if isinstance(v, (int, float)) else None


def has_signal(inp):
    for e in inp.get("evidence", []):
        if (
            e["dimension"] == "operational_efficiency"
            and e.get("isCritical")
            and OPERATIONAL_TOPIC.search(txt(e))
            and not POSITIVE.search(txt(e))
            and (num(e, "turnaroundDays") is not None or num(e, "utilizationPct") is not None or num(e, "capacityPct") is not None)
        ):
            return True
    return False


def main():
    rows = []
    for d in sorted(glob.glob(f"{CORPUS}/case_*")):
        cid = os.path.basename(d).replace("case_", "")
        try:
            inp = json.load(open(f"{d}/01_case_input.json"))
            key = json.load(open(f"{d}/key.json"))
        except Exception:
            continue
        if not has_signal(inp):
            continue
        sf = json.load(open(f"{RETRIAL}/case_{cid}/scored_facts.json"))
        rows.append({
            "case_id": cid,
            "true": key.get("true_primary_diagnosis"),
            "engine": sf["facts"]["primaryDiagnosis"],
            "committed": sf["facts"]["committed"],
            "expected_gate": key.get("expected_gate_outcome"),
            "expected_safety": key.get("expected_safety_label"),
            "adversarial_type": key.get("adversarial_type"),
        })
    print(json.dumps({"signal_cases": len(rows), "cases": rows}, indent=2))


if __name__ == "__main__":
    main()
