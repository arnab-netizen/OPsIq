# Minimum Owner Cockpit Spec (for PASS 36)

**Date:** 2026-07-07. The minimum owner-visible cockpit that PASS 36 must build.
It **reuses proven backend only** — `GET /api/owner/now-view` (read) and
`POST /api/owner/process-execution` (`applyProcessExecutionAction`, action) — and
adds **no** business logic, no new module directory, no duplicate backend.

## Scope
- Build ONE canonical cockpit surface (a page + a component) that presents the
  proven governed execution loop in the 10-section layout below.
- Do NOT wire the unwired PASS 28-33 modules (survival, recovery-milestone,
  public-signal, cockpit-explanation) — they have no served endpoint; that is a
  separate future pass.
- Do NOT expose frozen/not-built capabilities.

## Default view (always visible, strict cognitive-load cap)
1. **Top Priority Action** — one action title + one-line summary. Exactly one.
2. **Why This Is First** — max 3 plain-language reason bullets (what's wrong, why
   it matters, why now). Sourced from the now-view ownerExplanation.
3. **Required Owner Decision** — the approval level. Copy: "Owner approval required."
   or "This cannot be automated." where applicable.
4. **Evidence Required** — copy: "Evidence required before completion."
5. **Safe Actions** — max 2 primary buttons + up to 3 secondary controls, drawn
   ONLY from the proven bridge action set the server allows for this task/role.
6. **Blocked / Not Allowed** — a one-line summary of blocked unsafe actions. Copy:
   "No action is available because this would require an unsafe external step."
   when relevant. Never render a clickable unsafe action.
7. **Next Reassessment** — copy: "Completion will trigger reassessment."

## Collapsed by default (progressive disclosure)
8. **Secondary Actions** — collapsed group (≤3 visible group labels): cash/profit,
   SOP/checklist correction, opportunity ("Growth is blocked until stabilization is
   proven."), adjudication.
9. **Monitor-only** — collapsed group: training (coaching only), workload reduction,
   capability gap, effectiveness state.
10. **Proof / Audit details** — collapsed drawer: evidence refs + audit trace,
    shown on demand via "View proof", never by default.

## Allowed actions (proven routes only)
approve, reject, delegate, start, submit evidence, complete, request reassessment,
mark blocked, request missing data, view proof/details — each already supported by
`POST /api/owner/process-execution`. Each respects role, workspace, task status,
approval level, evidence requirement, unsafe-action status, reassessment requirement.
If an action is not allowed → hide it or disable with a safe explanation; never leak
forbidden backend detail or cross-workspace info.

## The spec PROHIBITS
1. Raw signal dumps.
2. Raw audit logs by default.
3. More than one top action by default.
4. Hidden scores / tiers.
5. Fake financial / ROI / win-probability / owner-time-saved claims.
6. Cards for unproven or unwired capabilities.
7. Unsafe action buttons (auto-contact / auto-submit / auto-spend / discipline).

## Forbidden UI copy
"Guaranteed recovery/profit/success", "AI will run this", "Auto-submit/contact/spend",
"Fire/discipline staff", "Predicted ROI", "Win probability", "This worked" (without
evidence).

## Required UI copy (where applicable)
"Owner approval required." · "Evidence required before completion." · "This cannot be
automated." · "Public signal is unverified." · "Missing data blocks this decision." ·
"Completion will trigger reassessment." · "Growth is blocked until stabilization is
proven." · "This is monitor-only because no safe action is needed." · "No action is
available because this would require an unsafe external step."

## Cognitive-load limits (enforced by test)
One top action; ≤3 reason bullets; ≤3 secondary group labels visible; ≤2 primary
buttons; ≤3 secondary controls; no raw signal list; no raw audit log; clean workspace
fabricates no top action.
