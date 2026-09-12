# Owner Manual-Use Runbook (PASS 44)

**Date:** 2026-07-07 · Practical, short. No marketing. For **one owner** using OpsIQ manually, with no live
integrations and no autonomous actions.

## 1. Log in
Go to **`/login`**, enter your email + password, submit. (New account: **`/signup`** creates your account +
workspace, then onboarding.) A developer sets up the deployment first (see restrictions R2).

## 2. Select / create your workspace
Your workspace is created at signup — you land in it automatically. (There is no workspace switcher; one
business context per login.)

## 3. Enter your first business data
- Create your business: on any owner page (e.g. Finance) use **"+ New business"**.
- Enter operating data via **`/owner/intake`** (Data Intake): choose **Manual form** or paste/CSV, pick the
  target domain, add notes, preview, confirm.
- Add finance/cash snapshots via the per-domain **"Add snapshot"** forms.
- See §4 for **what NOT to enter**.

## 4. What NOT to enter
No customer PII (names/emails/phones/addresses), no full staff personal data, no bank passwords, no raw
contracts, no unredacted invoices, no private customer messages unless redacted, no sensitive personal data.
Use placeholders (CUSTOMER_001, STAFF_A, VENDOR_A). See `OWNER_DATA_ENTRY_GUIDE.md`.

## 5. Open the cockpit
Click **"Owner Cockpit"** in the sidebar (or go to **`/owner/cockpit`**).

## 6. Read the top action
The cockpit shows **one top priority action** with **why it's first** (≤3 bullets), the **required owner
decision**, the **evidence required**, and the **reassessment** condition. If there's nothing to do it shows an
honest empty state — nothing is invented.

## 7. Approve / delegate / start a task
Use the labelled buttons under **"What you can safely do"**. Owner-only actions say **"Owner approval required —
cannot be automated"**. Reason/evidence actions open a **labelled inline form** (never a browser pop-up).

## 8. Submit evidence
For a correction/completion, open the action and enter your **evidence reference(s)** (photo id, order note id,
report id — not the file contents). Evidence is **required** before a task can complete.

## 9. Complete a task
Complete only after evidence is entered. Completing a correction **opens a reassessment** (did the fix work?).

## 10. Request reassessment
Use **"Request reassessment"** to re-open a decision at any time.

## 11. Handle missing data
If OpsIQ asks for missing data (e.g. cash position, defect rate, margin), it means it will **not** guess. Enter
the real figure via intake/snapshots, then re-check the cockpit.

## 12. Handle a blocked / unsafe action
If the cockpit says an action is **blocked** (e.g. growth before stabilization, discount before margin known,
tender auto-submit), that is intentional. OpsIQ never contacts customers, submits tenders, spends, discounts, or
contracts on its own. Do the real-world step yourself, manually, if you decide to.

## 13. Record the real-world outcome
After you do the real work, record what happened by submitting evidence and/or requesting reassessment. Keep an
honest note of the actual result — OpsIQ does not fabricate outcomes.

## 14. When to stop and ask for a fix
Stop and report to a developer if any `OWNER_STOP_CONDITIONS.md` condition appears (fake money/ROI, an unsafe
action button, fabricated data, PII on screen, a wrong severe top action, completion without evidence, a
crash on a core path, or a step you can't understand).

## What OpsIQ is NOT allowed to do
Contact anyone; submit a tender; move money; spend; discount; change a contract; alter payroll; take any
staff/legal/disciplinary action; fetch live internet data; act autonomously. It **routes, gates, and verifies**;
**you** decide and **you** implement.
