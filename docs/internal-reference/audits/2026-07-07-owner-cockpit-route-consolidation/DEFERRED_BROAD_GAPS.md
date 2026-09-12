# Deferred / Broad Gaps (PASS 38)

## Delivered
- **`/owner/cockpit` is now the canonical owner surface**: the primary owner sidebar
  entry ("Owner Cockpit") points to it (previously the only owner entry was the older
  `/owner/recovery`).
- The overlapping decision surfaces (`/owner`, `/owner/now`, `/owner/process-intelligence`)
  each carry a low-load **CanonicalCockpitLink** banner guiding the owner back to the cockpit.
- **Nothing was deleted.** `/owner/recovery` stays reachable via existing `/owner` +
  `/owner/home` deep-links.

## Deferred beyond PASS 38 (recorded, not done)
1. **Replace remaining `prompt()` on `/owner/process-intelligence`.** Its action path
   still uses `window.prompt()`. Replacing it safely touches the actionable bridge and
   risks regressing a proven action flow, so it is deferred. The canonical
   `/owner/cockpit` already uses labelled controls (PASS 36).
2. **Redirect vs deep-link for `/owner/now`.** It is kept as a read-only deep-link with a
   canonical pointer. A hard redirect to `/owner/cockpit` was deliberately NOT done to
   avoid removing the read-only 360 view + avoid-list before confirming owners don't rely
   on it. A future pass may redirect once usage is confirmed.
3. **Consolidate the two SOP/recovery engines.** `/owner/recovery` (older recovery-cycle
   CRUD) and the PASS 32/33 survival/recovery-milestone modules remain separate systems.
   Unifying them is a larger backend effort, out of route-hygiene scope.
4. **Trim `/owner` command-center overlap.** The command center still shows priorities +
   a top action that partially overlap the cockpit. Deeper de-duplication is a follow-up
   (avoided here to prevent a broad UI redesign).

## Explicitly out of scope (frozen — not built, not implied)
Public SaaS, billing, Product Hunt / launch readiness, live integrations/connectors,
Local Mode, enterprise/compliance, autonomous browsing/external action, LLM/NLP,
private owner shadow pilot, marketing/landing/pricing.

## Honest limitation
The route consolidation is proven by component tests (nav retarget + banner) and a browser
E2E (canonical nav visible; legacy page guides back; legacy page still works). It is a
navigation/hygiene change, not a redesign — the underlying pages and their safety gates are
unchanged.
