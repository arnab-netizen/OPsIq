# Unified Critical/High + Owner-Hardening Remediation Plan

**Branch:** `claude/unified-critical-high-owner-hardening-remediation`
**Base:** `claude/critical-governance-spine-remediation` tip = `origin/main` 98762ba (linear) + audit artifacts + 10 proven fixes.
**Reconciled from:** `claude/owner-mode-hardening-commercial-gap-closure` (01baa60), unmerged.
**DB:** local PostgreSQL 16 (opsiq_test, 99 migrations); env Neon URL unreachable (non-HTTPS egress blocked). CI's own postgres blocking lane is authoritative.

## Method
Reconcile true latest-main state FIRST (see RECONCILIATION_REPORT.md); preserve proven fixes; verify each hardening claim from source before trusting; cherry-pick additive fixes, reimplement conflicting ones cleanly; every closure backed by a DB-backed test that fails-before/passes-after. No closure from a report claim alone. No CRITICAL/HIGH deferred as low-risk.

## Order & status: see EVIDENCE_LEDGER.json + REMEDIATION_LEDGER.md.
