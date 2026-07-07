# OpsIQ — Demo Script Truth Guide

**Date:** 2026-07-07 · Truth-control audit (PASS 34).

How to demo OpsIQ **without lying**. The rule: demo the governed reasoning and the
CI-proven safety behaviour — never imply a real business, real money, or an
owner-visible product that does not exist yet.

## What you MAY demo
- **The reasoning pipeline** on a controlled fixture: raw signals → structured issues → prioritised → explained → survival/recovery plan → evidence-gated milestones. Say: *"This is running our deterministic engine on a synthetic case, in a test harness."*
- **The safety gates live**: try to complete a correction with no evidence → `EVIDENCE_REQUIRED`; try to approve as a non-owner → `OWNER_APPROVAL_REQUIRED`; try to skip a milestone → blocked. These are real and CI-verified.
- **The honesty behaviours**: show that missing money data becomes a data task (no fake number), that an unrecoverable business is not given fake optimism, that growth stays blocked until stabilization.
- **The test/CI evidence**: show the LANE_B run and the 28 DB simulations passing.

## What you MUST say out loud during any demo
1. "This is a **backend / test-harness** demo. There is no owner-facing product UI yet."
2. "The data is **synthetic**. OpsIQ has **not** been run on a real business."
3. "OpsIQ **proposes**; a human approves and acts. It does **nothing** in the outside world."
4. "No numbers shown are real financial figures unless the owner entered them."

## What you MUST NOT do in a demo
- Do not show a fabricated dashboard implying real customers/revenue.
- Do not say "AI" as if a model is deciding — it is deterministic rules.
- Do not present a synthetic recovery as a real turnaround.
- Do not quote time-saved, money-saved, ROI, or success-probability numbers.
- Do not imply integrations (bank/POS/CRM) are connected.

## Truth framing (the one-liner to open with)
> "OpsIQ is a **governed reasoning engine** for small-business intervention. Today it is proven in **backend code, 911 tests, and 28 DB-backed CI simulations** — not yet in an owner-facing product, and not yet on a real business. What I'll show is the engine and its safety gates on a synthetic case."
