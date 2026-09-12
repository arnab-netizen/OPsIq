# Deferred / Broad Gaps (PASS 39)

## Delivered
A read-only, OWNER-gated `GET /api/owner/public-signals` that projects the proven
PASS 28-30 public-signal pipeline over the workspace's **already-persisted, controlled
intake records** (no live fetch, no connectors, no LLM) into a governed, fail-closed
"Outside signals" summary, surfaced as a **collapsed, low-load** cockpit section. No
raw text/PII, no fabricated money, no live-ingestion claim, no autonomous action.

## Deferred beyond PASS 39
1. **Live ingestion / connectors — intentionally NOT built (frozen).** The surface reads
   only controlled persisted records. Any live public-data fetch, connector, or crawler
   is out of scope and remains frozen.
2. **Richer archetype fidelity.** The read path uses a conservative `unknown` archetype
   (the intake rows do not carry a proven public-signal archetype). A future pass could
   derive the archetype from the workspace's business context — the interpreter only
   downgrades, so this cannot fabricate a stronger signal.
3. **Actionable public signals.** The section is read-only; acting on a public-signal-
   derived correction is done via the existing top-action bridge. Wiring public signals
   directly to governed tasks (still evidence-gated, owner-approved, non-autonomous) is a
   later pass.
4. **Per-business scoping.** Intake rows are workspace-scoped (no businessId at the intake
   layer); per-business filtering is deferred.

## Explicitly out of scope (frozen — not built, not implied)
Public SaaS, billing, Product Hunt / launch readiness, live integrations/connectors,
Local Mode, enterprise/compliance, autonomous browsing/external action, LLM/NLP,
private owner shadow pilot, marketing/landing/pricing.

## Honest limitation
The DB test proves the real read path + workspace isolation + sanitisation of a seeded
PII/injection row + clean=NONE + no fabrication. The full interpret/conflict/prioritise
matrix is proven by the pure PASS 28-30 unit suites + the 10 new unit tests (deterministic)
— an explicit, honest split, not a coverage gap.
