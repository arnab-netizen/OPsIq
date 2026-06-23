# Owner Trust Audit — Phase G

**Date:** 2026-06-23  
**Verdict:** 5 fixed, 3 accepted/documented

---

## Findings

### FIXED — OT-001 (MEDIUM): "No risks detected" implied safety when no diagnosis run
**File:** `src/app/(authenticated)/owner/home/page.tsx`  
**Fix:** Changed to "No risks from diagnosed domains — run a domain diagnosis to surface risks."

### FIXED — OT-002 (MEDIUM): "No opportunities detected" same false-negative problem
**Fix:** Changed to "No opportunities from diagnosed domains — run a domain diagnosis to surface opportunities."

### FIXED — OT-003 (MEDIUM): Business health score without data-confidence caveat
**File:** `src/app/(authenticated)/owner/home/page.tsx`  
**Fix:** Added `confidence XX/100` badge adjacent to health score when `s.dataConfidenceScore` is present.

### FIXED — OT-004 (LOW): "No open actions — keep verifying outcomes" implied success
**Fix:** Changed to "No open actions from diagnosed domains — run a diagnosis in each domain to see required actions."

### FIXED — OT-005 (LOW): Finance page recommended action missing evidenceRationale
**File:** `src/app/(authenticated)/owner/finance/page.tsx`  
**Fix:** Added `evidenceRationale` and `evidence[]` display to the recommended action card, matching the command center.

### FIXED — OT-008 (LOW): "No financial issues detected" ambiguous on zero findings
**File:** `src/app/(authenticated)/owner/finance/page.tsx`  
**Fix:** Changed to "No findings generated — this may indicate missing input data rather than a healthy business. Check data confidence above."

### ACCEPTED — OT-006 (HIGH): Action priority shown without confidence qualifier
Action priority/impact scores are numbers derived from the full scoring model. Adding a confidence badge per action requires schema changes to how actions are stored. Mitigated: the command center shows `dataConfidenceScore` prominently; the home page now shows it on the health badge. Full per-action confidence display is a future enhancement.

### ACCEPTED — OT-007 (LOW): `growthOpportunityScore` always styled "default"
The score reflects opportunity size across wired domains. A hardcoded "default" variant is conservative rather than misleading. The score value is still shown numerically. Accepted as low-priority.

---

## Gate Status

- `npx tsc --noEmit`: PASS
- Simulation tests (54/54): PASS
- Misleading empty states: ELIMINATED for home page and finance page

**PHASE_G_OWNER_TRUST: PASS**
