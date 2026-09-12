# A0 — Skill Classification Audit

**Date:** 2026-07-10  
**Branch:** claude/current-main-reality-audit-operating-layer  
**Base commit:** ef7706b (main)

---

## Q1 — What actual Claude Code skills exist?

**Finding: NONE (zero `.claude/skills/` directory)**

The `.claude/` directory contains:
- `commands/` — 2 files (`continue-build.md`, `continue-post-owner-build.md`)
- 80+ flat audit/planning JSON and markdown files (artifact dump, not skills)

There is **no `.claude/skills/`**, **no `.claude/agents/`**, **no `.claude/hooks/`**.

The two `commands/` files are Claude Code slash-command scripts (`/continue-build`, `/continue-post-owner-build`) — these ARE real Claude Code skills in the slash-command sense but are workflow orchestration scripts, not product capability wrappers.

---

## Q2 — Which proposed items are actual Claude Code skills?

| Item | Classification | Reason |
|------|---------------|--------|
| `/continue-build` | **actual_claude_code_workflow_skill** | Slash-command script in `.claude/commands/`; drives autonomous execution loop |
| `/continue-post-owner-build` | **actual_claude_code_workflow_skill** | Slash-command script; drives Owner Mode build + DB verification loop |
| Phase 6 audit playbooks | **audit_playbook** | Stored as `.claude/*.md` flat files; not slash commands |
| CI test architecture contract | **policy_checklist** | `.claude/ci_test_architecture_contract.json` — machine-readable gate contract |
| Governance baseline | **policy_checklist** | `.claude/governance-baseline.json` — idempotency/security baseline state |
| Phase planning docs (`execution_state.json`, roadmaps) | **policy_checklist** | State tracking, not workflow automation |
| Owner Mode readiness rules | **policy_checklist** | `.claude/OWNER_MODE_REAL_WORLD_READINESS_RULES.md` |
| Tier B gate decision | **policy_checklist** | `.claude/TIER_B_GATE_DECISION.md` |

---

## Q3 — Which are only hardening/checklist prompts?

All of the following are **policy or checklist** documents, not Claude Code skills:
- `A2_FAKE_TEST_INVENTORY.md`
- `PHASE5_COMPLETION.md`, `PHASE6_PART1_STATUS.md`
- `PHASE_A_ARCHITECTURE_GUIDE.md`
- `ci_test_architecture_contract.json`
- `governance-baseline.json`
- `go_live_operator_pack_audit.json`
- `pilot_readiness_pack_audit.json`
- `build_and_test_root_cause_audit.json`
- All `R30_*` json files (reconciliation/audit data)

---

## Q4 — Which are product-side business capabilities wrongly named as skills?

None of the files in `.claude/` are named as skills. However, several entries in the execution roadmaps (`execution.md`, `execution_post_owner_mode.md`) describe "modules" and "phases" that are product capabilities (Owner Mode M01-M15, B01-B26), not Claude Code workflow automation.

These should NOT be called Claude Code skills:
- M01-M15 (Owner Mode product modules)
- B01-B26 (post-owner-mode product modules)
- Phase AI-1 through AI-17 (LLM integration product phases)

---

## Q5 — Which should be created under `.claude/skills/`?

**Recommended new skills to create:**

| Skill name | Type | Purpose |
|------------|------|---------|
| `phase-audit` | workflow skill | Run a hostile A-L format audit of a new phase |
| `security-review` | workflow skill | Run security baseline check against changed routes |
| `idempotency-check` | workflow skill | Scan routes for missing idempotency pattern |
| `pr-lifecycle` | workflow skill | Create PR, watch CI, classify failures, merge |

These do not exist yet. The session-level skills currently available (from Claude Code's global registry) cover most of these, but none are committed to the repo's `.claude/skills/`.

---

## Q6 — Which should NOT be called Claude skills?

- Owner Mode product modules (M01-M15) — product capabilities, not skills
- Business simulation profiles — domain logic, not automation
- CI contract JSON files — machine state, not skills
- Audit playbooks in `.claude/*.md` — documentation, not executable workflows

---

## Evidence

```bash
ls /home/user/OPsIq/.claude/commands/
# continue-build.md
# continue-post-owner-build.md

find /home/user/OPsIq/.claude -type d
# /home/user/OPsIq/.claude
# /home/user/OPsIq/.claude/commands
# (no skills/, agents/, hooks/)
```

**Confirmed: No `.claude/skills/`, `.claude/agents/`, or `.claude/hooks/` exist.**
