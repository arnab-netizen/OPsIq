# Privacy Request Runbook

This is the manual handling process for `PrivacyRequest` rows created by
`POST /api/privacy-requests` (see `src/app/api/privacy-requests/route.ts`).
There is no admin UI and no automated fulfillment for any request type in
this repository today. Every request is triaged and fulfilled by hand by an
authorized engineer or support staff member following the steps below.

**Fulfillment is not instant and not automatic.** Filing a request records
it; a human still has to act on it. Say this plainly to anyone who asks how
long it takes — do not imply same-day or automatic deletion/export anywhere
this runbook's process is described.

## 1. Finding open requests

Query the `privacy_requests` table directly (read replica or primary,
read-only query):

```sql
SELECT * FROM privacy_requests WHERE status = 'OPEN' ORDER BY created_at ASC;
```

Columns you'll use:

- `id` — the row's primary key, use it in the `WHERE id = '...'` update below.
- `request_type` — `ACCESS` | `DELETION` | `CORRECTION`.
- `user_id` — set if the submitted email matched an existing account at
  filing time; `NULL` if it didn't (the person may have mistyped the email,
  used an email no longer on the account, or the account was already
  deleted). A `NULL` `user_id` does not mean the request should be ignored —
  it means you should try to identify the account yourself (search `users`
  by the submitted `email`, check support history, etc.) before concluding
  there is nothing to act on.
- `email` — the email address the requester typed. This is the identity you
  verify against before doing anything with the account (see step 2).
- `detail` — free-text context the requester supplied. Read it — for
  `CORRECTION` requests in particular, it's usually where they describe
  exactly what's wrong.
- `status` — `OPEN` | `IN_PROGRESS` | `FULFILLED` | `REJECTED`.
- `handled_by`, `handled_at` — set these yourself when you close the
  request (step 4).

## 2. Verify identity before acting on any account

Because this endpoint is intentionally public and enumeration-resistant
(anyone can submit a request for any email address), **never** act on an
account based solely on a submitted `PrivacyRequest` row. Before doing
anything in steps 3a/3b/3c below:

1. Confirm the requester actually controls the account email — reply to the
   `email` on the row (not any other address they may separately give you)
   and require them to respond from that inbox, or otherwise complete
   whatever identity check your support process uses for account-sensitive
   requests.
2. Only after identity is confirmed, move the row to `IN_PROGRESS` and
   proceed.

```sql
UPDATE privacy_requests SET status = 'IN_PROGRESS' WHERE id = '<request-id>';
```

If identity cannot be confirmed (no response, inconsistent answers, etc.),
set `status = 'REJECTED'` (step 4) and note why in your own support system —
`PrivacyRequest` has no separate rejection-reason column, so record the
reason wherever your team already tracks support decisions.

## 3. Handling by request type

### 3a. ACCESS (export a copy of the user's data)

1. Identify the user's `User.id` (via `privacy_requests.user_id` if set, or
   by looking up `users` by the confirmed email).
2. Manually query and export the user's own data and the data of any
   `Workspace` they belong to as an owner/member — at minimum: `User`,
   `WorkspaceMembership`, `Workspace`, and business records scoped to that
   workspace (e.g. `Engagement`, `KPI`, owner-mode business records, etc. —
   whatever this account actually has). Use `prisma/schema.prisma` to find
   every model with a `userId`/`workspaceId` foreign key back to this
   account so nothing relevant is missed.
3. Assemble the export (JSON or CSV, whatever your support tooling
   produces) and send it to the **confirmed** email address from step 2 —
   never to an address supplied elsewhere in the request.
4. Mark `FULFILLED` (step 4).

### 3b. DELETION (delete the user's account and workspace data)

There is **no safe automated cascade-deletion system** in this codebase.
This is deliberate — building one is out of scope for this change and would
be its own carefully-reviewed effort, not something to improvise under a
single privacy request. Deletion here is a **careful, manual, ops-run
operation performed by an authorized engineer**, not a self-service action
and not something this runbook automates.

Before running anything destructive:

1. Re-read the relevant `onDelete` behavior in `prisma/schema.prisma` for
   every model that references `User.id` or `Workspace.id`. The schema mixes
   `Cascade`, `Restrict`, and `SetNull` across ~170 foreign keys — many
   relations are `Restrict`, meaning a naive `DELETE FROM users WHERE id =
   ...` will simply fail with a foreign-key violation until dependent rows
   are handled first, in the correct order. Do not assume cascade behavior
   you have not just re-verified in the schema for this specific account's
   data footprint.
2. Take a database snapshot/backup immediately before running anything (see
   `docs/BACKUP_AND_RESTORE_GUIDE.md` / `docs/BACKUP_RESTORE_PROCEDURE.md`
   for this repo's existing backup process) so a mistake in a hand-written
   deletion script is recoverable.
3. Write (or reuse a previously-reviewed) a scoped deletion script or set of
   direct SQL statements that walks the dependency graph for this
   account/workspace in the correct order, tested first against a
   non-production copy of the data if at all possible.
4. Run it, and independently confirm afterward (a follow-up `SELECT`) that
   the account and its workspace data are actually gone — do not rely on
   "the script exited 0" as confirmation.
5. Preserve the `audit_log` (`AuditEvent`) entries related to the account
   rather than deleting them — this repository's hard rule against
   modifying or deleting audit rows applies here too; a privacy deletion
   request is not an exception. If a genuine legal erasure obligation
   requires removing audit rows referencing the person, that is a distinct,
   separately-authorized decision — do not fold it into routine `DELETION`
   handling.
6. Only after independent confirmation, mark the request `FULFILLED`
   (step 4).

This will take real time (this is explicitly not "click a button and it's
gone") — communicate a realistic timeline to the requester rather than
implying immediacy.

### 3c. CORRECTION (fix a specific incorrect field)

1. Read `detail` on the row for exactly what the requester says is wrong.
   If it's ambiguous, use the confirmed email from step 2 to ask a
   clarifying question before changing anything.
2. Locate the specific incorrect field on the specific record (usually on
   `User` or a workspace/business record they own) and update it directly
   (an authorized engineer running a scoped, reviewed `UPDATE`, or via
   whatever internal tooling already exists for that field — do not build
   new write paths just for this).
3. Mark `FULFILLED` (step 4).

## 4. Closing the request

Whichever path above you took, close the row explicitly:

```sql
UPDATE privacy_requests
SET status = 'FULFILLED', handled_by = '<your identifier>', handled_at = now()
WHERE id = '<request-id>';
```

Use `'REJECTED'` instead of `'FULFILLED'` if identity could not be verified
(step 2) or the request was otherwise not actioned. `handled_by` should be
something that identifies the human who did the work (an email, username,
or employee ID — whatever your team already uses in similar manual runbooks
in this repo) so there is a durable record of who handled it, independent
of the `AuditEvent` emitted at filing time (`PRIVACY_REQUEST_CREATED`),
which only records that the request was *made*, not how it was resolved.
