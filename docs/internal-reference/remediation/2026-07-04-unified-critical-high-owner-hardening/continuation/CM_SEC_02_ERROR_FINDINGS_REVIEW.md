# CM-SEC-02 — Error-Leak Findings Review

The "32 frozen error findings" register originated on the owner-hardening branch and is NOT present on
this reconciled base, so the 32 are not individually reproducible here. Structural status:

- Client-visible errors on canonical-wrapped routes are sanitized via `withCanonicalEnforcement` +
  `classifyOperatorError` + canonical-json-response (server retains diagnostics; client gets safe message).
- `WRAP-01`: `npm run audit:wrapped-handlers` reports 29 wrapped routes calling `Response.json()` directly
  (canonical-shape bypass, not necessarily a raw-error leak). A CI ratchet blocks NEW violations.

## Classification
**STILL_OPEN — requires itemization.** Each of the 32 (once the register is available on this branch)
needs {route, risk, wrapper status, test status, classification, fix}. Not closed. Not a hard pilot
blocker (canonical routes sanitize), but must be itemized before commercialization. Owner action: port the
32-item register from the hardening branch or re-derive via the route-scanner, then fix + regression-test
each raw leak using the existing wrapper.
