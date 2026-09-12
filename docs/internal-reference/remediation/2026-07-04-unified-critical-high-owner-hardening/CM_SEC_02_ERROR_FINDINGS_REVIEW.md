# CM-SEC-02 — 32 Frozen Error-Leak Findings

## Status
The "32 frozen error findings" originate from the owner-hardening branch's register (not on main). On this unified branch they are **NOT individually itemized/closed** — the register itself is not present on the reconciled base.

## Reconciliation decision
- The canonical response/error path (`withCanonicalEnforcement` + `classifyOperatorError` + canonical-json-response) already sanitizes client-visible errors while retaining server diagnostics for the routes wrapped in it.
- WRAP-01 (29 wrapped-handler `Response.json` violations) and the CM-SEC-02 raw-leak itemization are **STILL_OPEN**: each of the 32 needs route/file, current sanitization state, and a regression test.

## Required future work
For each of the 32: record {id, route, original risk, current state, evidence, classification (CLOSED / STILL_OPEN / DOWNGRADED_WITH_PROOF / FALSE_POSITIVE_WITH_PROOF)}, fix raw leaks via the existing canonical wrapper, add a regression test per fixed leak.

**Status: STILL_OPEN (undifferentiated → must be itemized; not a single frozen blocker).**
