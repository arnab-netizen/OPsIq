# MARKETPLACE_LAUNCH_READY — missing asset checklist (not built in this mission)

Verified against repo at base `e5749ff`: `/privacy`, `/terms`, `/about`, `/resources` pages exist; `beta` page exists.
Updated for the compliance-minimum iteration: rows 2–5 and 10 now have draft in-repo content; the rest remain unbuilt.

| # | Asset | Status | Owner action |
|---|---|---|---|
| 1 | Pricing copy (plan, free vs paid) | PARTIAL — `/pricing` exists; **price itself is PRICING_DECISION_REQUIRED** | Owner sets governed price |
| 2 | Refund / cancellation copy | DONE (draft) — `/refund-policy`; **REFUND_POLICY_OWNER_REVIEW** (mirrors Paddle standard 14 days) | Confirm intended policy |
| 3 | Terms for paid subscription / Paddle MoR | DONE (draft) — Terms updated; **LEGAL_ENTITY_NAME_REQUIRED**, no legal review | Add company name; legal review |
| 4 | Privacy: Paddle disclosure, billing data | DONE (draft) — Privacy updated; no legal review | Legal review |
| 5 | Support contact | PARTIAL — support@opsiq.solutions published on site; monitoring/SLA unverified | Confirm monitored inbox + response time |
| 6 | Screenshots (onboarding, first diagnosis, cockpit, approval flow) | MISSING | Capture from staging with demo data |
| 7 | Demo (2–3 min walkthrough video or sandbox demo workspace) | MISSING | Record |
| 8 | Product Hunt pack: tagline, description, first comment, gallery (5 imgs), thumbnail, maker video, launch-day plan | MISSING | Produce |
| 9 | General marketplace listing pack: 1-line pitch, long description, category/tags, logo set, feature bullets, FAQ, changelog link | MISSING | Produce |
| 10 | Paddle domain-review pre-reqs on the live domain | PARTIAL — pages exist in code (pricing, terms, privacy, refund, nav links); **not deployed to the live domain, price missing, company name missing, application not started** | Deploy, set price/name, submit domain review |

`MARKETPLACE_ASSET_GAPS=10` (4 rows are now PARTIAL/DRAFT, not closed)
