# Claude Code Skill Classification — Current Main Reality Audit

- Branch `claude/current-main-reality-audit-bqkz4q` · HEAD `a14fae15` · Date 2026-07-07

This document classifies the proposed audit items (Claude operating layer, real Claude skills, subagents, Playwright proof, connector/Local-Mode/LLM readiness, product hardening) against **what actually exists in the repo today** and answers the six required questions.

## Current state (verified)
- `find .claude -type d` → only `.claude/` and `.claude/commands/`. **No `.claude/skills/`, no `.claude/agents/`, no `.claude/hooks/`, no `settings.json`.**
- Operating-layer artifacts that are real Claude Code config: `CLAUDE.md` (repo rules), `.claude/commands/continue-build.md`, `.claude/commands/continue-post-owner-build.md`, and the state/gate JSON they consume (`.claude/execution_state.json`, `governance-baseline.json`, `lint-baseline.json`, `test-quarantine.json`).
- `.claude/` also holds ~85 audit OUTPUT files (`*.json`/`*.md` inventories & reports) — **not** operating config.
- `opsiq_claude_low_usage_pack/.claude/commands/*.md` (8 files) is an **orphaned, un-merged** extracted starter pack; its own `USAGE.md` step 1 is "Add all files from this pack to the repo. Commit them." Claude Code only loads repo-root `.claude/`, so this pack is inert.
- `grep -rli skill .claude` → none. Every "skill" in `src` is business staff-skill modeling (e.g. `src/domain/owner-mode/staff-training.ts` `SkillRecord`), not a Claude skill.

## Classification of proposed / candidate items

| Proposed item | What it actually is | Should live where | Call it a "Claude skill"? |
|---|---|---|---|
| Claude Code operating layer | Partly exists: `CLAUDE.md` + 2 slash commands + JSON state/baselines | `.claude/` (present) | It's the operating layer, not a skill |
| "Real Claude Code skills" | **Do not exist** today | `.claude/skills/*/SKILL.md` (to be created) | Yes — once created |
| Subagents | **Do not exist** as repo config (`.claude/agents/`) | `.claude/agents/*.md` (to be created) | Agents, not skills |
| Hooks | **Do not exist** (`.claude/hooks/`, no `settings.json`) | `.claude/settings.json` hooks | Neither — harness config |
| Playwright proof | Exists (53 specs, config, fixtures, CI) — a **product test asset** | `tests/browser/`, `.github/workflows` | No — it is a test suite |
| Connector / Local-Mode readiness | **Product capability** (placeholder scaffolding) | `src/services/external-systems`, `src/services/private-mode` | No — product code |
| LLM/NLP governed analysis | **Product capability** (governed copilot) | `src/services/ai/*` | No — product code |
| Product business-capability hardening | **Product work** (schema/service/UI/tests) | `src/{domain,services,app}` | No — product code |
| `continue-build` / `continue-post-owner-build` | Real autonomous **slash commands** (also surfaced as session Skills) | `.claude/commands/` (present) | Yes — these are the only real Claude workflow commands today |
| `opsiq_claude_low_usage_pack` commands | Thin per-slice **policy/checklist prompts**, orphaned | Would need merging into root `.claude/` to matter | No — checklists, and not wired in |

## The six required answers

**1. Which proposed items are ACTUAL Claude Code skills?**
Today, **none** exist under `.claude/skills/`. The only real Claude Code *workflow* artifacts are the two slash commands `.claude/commands/continue-build.md` and `.claude/commands/continue-post-owner-build.md` (commands, not skills). If a skills layer is built, genuine skill candidates are **process/workflow** helpers a coding agent runs: e.g. "run governed-vertical-slice scaffold", "reactivate & run a quarantined test group", "capability reality-check". These are workflow skills, not product features.

**2. Which are only hardening / checklist prompts?**
- The 8 `opsiq_claude_low_usage_pack/.claude/commands/*` (`read-current`, `implement-{schema,backend,ui,tests}`, `audit-current`, `integrate-current`, `update-status`) — thin checklist prompts, currently orphaned.
- `CLAUDE.md` hard rules, `continue-build.md` PRIORITY ORDER / DoD-style classification, `governance-baseline.json`/`lint-baseline.json`/`test-quarantine.json` gates — these are **policy/checklists**, not skills.
- The dozens of `docs/*` proof/readiness reports and `.claude/*_audit.json` — audit playbooks/output, not skills.

**3. Which are product-side business capabilities (must NOT be called Claude skills)?**
All of: Owner Mode, Manual Entry, Diagnosis/Recommendation/Action, Evidence/Audit, Finance/Budget/Cash/Profit, Staff/Operator Proof, SOP/Training, Retention/Reactivation, Marketing ROI, Opportunity/Wealth/Tender, Startup Mode, Pricing, Vendor/Procurement, Compliance/Risk, Capacity/Bottleneck, Waste/Leakage, Local Mode, LLM/NLP governed analysis, Live Connectors, Simulation, Learning/Outcome Review. These are `src/` product code — **never** `.claude/skills/`.

**4. Which should be created under `.claude/skills`?**
Only genuine **agent workflows**, and only if the team wants them — examples grounded in this repo's real gaps:
- `governed-vertical-slice` — scaffold a snapshot→diagnosis→action→verification vertical using the Marketing (#9) template + `owner-action-gate` + `emitAuditEvent`.
- `reactivate-quarantined-tests` — move a group out of `src/__ignored_tests__`, wire it into vitest, prove it passes (targets the 91 quarantined files / diagnostic-core engines).
- `capability-reality-check` — run the search/classify pattern this audit used against one capability and emit an evidence block.
None of these are product features; they are how-the-agent-works skills. (No business-capability skill registry — that would violate the repo rule against product logic outside `src/`.)

**5. Which should NOT be called Claude skills?**
Everything in section 3 (product capabilities), the Playwright suite, the connector/LLM code, all `docs/*` reports, all `.claude/*_audit.json` inventories, and the checklist prompts in section 2. Calling any product capability a "Claude skill" would misrepresent product work as agent tooling.

**6. Which existing repo files already cover some of these?**
- Operating layer already covered by: `CLAUDE.md`, `.claude/commands/continue-build.md`, `.claude/commands/continue-post-owner-build.md`, `.claude/execution_state.json`, `execution.md`, `execution_post_owner_mode.md`, `governance-baseline.json`, `lint-baseline.json`, `test-quarantine.json`.
- The "audit-current / implement-* / update-status" workflow intent is already prototyped (orphaned) in `opsiq_claude_low_usage_pack/.claude/commands/*` and `opsiq_claude_low_usage_pack/docs/opsiq/prompts/*`.
- Playwright proof already covered by `playwright.config.ts`, `tests/browser/*` (53 specs) + `scripts/seed-*.ts`.
- CI enforcement already covered by `.github/workflows/*` (78 workflows incl. `ci.yml`, `db-verification.yml`, `owner-e2e.yml`, `ai-live-smoke.yml`).

## Bottom line
There is **no Claude skills/agents/hooks layer today** — only `CLAUDE.md` + two slash commands + JSON gates. Before "adding real Claude Code skills/subagents", the honest first step is: (a) decide whether a `.claude/skills/` + `.claude/agents/` layer is wanted at all, (b) if so, populate it **only** with agent-workflow skills, and (c) keep every one of the 22 product capabilities in `src/` — never as a "skill".
