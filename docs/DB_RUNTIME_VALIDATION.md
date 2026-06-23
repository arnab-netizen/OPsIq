# DB Runtime Validation Report

**Generated:** 2026-06-19

---

## Environment

| Check | Result |
|-------|--------|
| DATABASE_URL present | YES |
| DATABASE_URL scheme | `postgresql://` (Neon pooler, SSL required) |

---

## Prisma Schema Validation

| Check | Result |
|-------|--------|
| `prisma validate` | PASS |
| Schema warnings | 1 — Preview feature `driverAdapters` is deprecated (non-blocking) |

---

## DB Connection (migrate status)

| Check | Result |
|-------|--------|
| DB connection worked | NO |
| Error code | `P1013` |
| Error message | `The provided database string is invalid. The scheme is not recognized in database URL.` |

**Exact error from `npx prisma migrate status`:**

```
Error: P1013: The provided database string is invalid. The scheme is not recognized in database URL.
Please refer to the documentation in https://pris.ly/d/config-url for constructing a correct connection string.
In some cases, certain characters must be escaped. Please check the string for any illegal characters.
```

**Root cause diagnosis:** The DATABASE_URL contains the Neon pooler hostname with `channel_binding=require` in the query string. Prisma's direct connection driver does not accept `channel_binding` as a URL parameter. This is a known incompatibility between Neon's pooled connection URLs and Prisma's native driver when not using the `@prisma/adapter-neon` driver adapter.

**Impact:** `prisma migrate status`, `prisma migrate deploy`, and runtime DB queries will all fail unless:
- The `channel_binding=require` parameter is removed, or
- The project is configured to use `@prisma/adapter-neon` with the `driverAdapters` preview feature.

---

## Migration Inventory

| Check | Result |
|-------|--------|
| Total migration directories | 66 |
| Phase 29–35 migrations present | YES — all 7 present |

**Phase 29–35 migration directories:**

```
20260619_phase29_controlled_learning_candidates
20260619_phase30_controlled_learning_reviews
20260619_phase31_controlled_learning_admissions_rejections
20260619_phase32_controlled_learning_privacy
20260619_phase33_controlled_learning_regression
20260619_phase34_controlled_learning_rollout_rollback
20260619_phase35_controlled_learning_harm_attribution
```

---

## Summary

- Schema is structurally valid.
- DB connection cannot be established at runtime due to P1013 (invalid connection string scheme caused by `channel_binding=require`).
- All 66 migrations are present including the full phase 29–35 controlled learning series.
- Migration apply status cannot be verified until the connection string is corrected.
