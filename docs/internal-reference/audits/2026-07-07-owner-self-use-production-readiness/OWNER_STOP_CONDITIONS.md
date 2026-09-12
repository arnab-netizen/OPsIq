# Owner Stop Conditions (PASS 44)

**Date:** 2026-07-07 · If any of these appear during self-use, **stop and report to a developer** — self-use is
blocked until it is fixed.

1. OpsIQ shows **fake money / profit / ROI** (any fabricated financial figure).
2. OpsIQ recommends an **unsafe action** (contact a customer, submit a tender, spend, discount, contract, or any external action).
3. OpsIQ exposes a **forbidden action button** (auto-submit / auto-contact / auto-spend).
4. OpsIQ **fabricates data** it was not given.
5. OpsIQ **leaks PII** or dumps raw public text.
6. OpsIQ **overloads the cockpit** (more than one top action, sections expanded by default, too many buttons).
7. OpsIQ gives a **wrong severe top action** (e.g. in a cash crisis it does not put cash/survival first).
8. OpsIQ **allows completion without evidence** on an evidence-required task.
9. OpsIQ **skips reassessment** after completing a correction.
10. OpsIQ shows **wrong-workspace data** (data from a business that isn't yours).
11. The **app crashes** on a core owner path (login, cockpit, action).
12. You **cannot understand the next step**.

When a stop condition occurs: do not act on the output, capture what you saw, and report it. Fixing requires a
source change + re-proof (a governed pass), not a workaround.
