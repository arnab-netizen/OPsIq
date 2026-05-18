# R1 Protected Runtime Failure Inventory

**Date**: 2026-05-18  
**Phase**: R1-PROTECTED-RUNTIME-PROOF PHASE A

---

## FAILURE SUMMARY

**Protected Routes Tested**: 3  
**Protected Routes Failing**: 3 (100%)  
**Common Error**: `Invalid input value: invalid input syntax for type uuid: "system"`

---

## EXACT FAILURE DETAILS

### Failure #1: GET /api/engagements (with valid session cookie)

**HTTP Status**: 500 Internal Server Error  
**Error Code**: PrismaClientKnownRequestError

**Error Message**:
```
Invalid `prisma.session.findUnique()` invocation:
Invalid input value: invalid input syntax for type uuid: "system"
```

**Stack Location**: `prisma.session.findUnique()` call  
**Duration**: 9ms  

**Server Logs**:
```json
{
  "level": "ERROR",
  "message": "Handler failed",
  "error": {
    "name": "PrismaClientKnownRequestError",
    "message": "Invalid input value: invalid input syntax for type uuid: \"system\""
  }
}
```

---

### Failure #2: POST /api/auth/logout (with valid session)

**HTTP Status**: 500 Internal Server Error  
**Error Code**: Same PrismaClientKnownRequestError

**Error Message**: 
```
Invalid `prisma.session.findUnique()` invocation:
Invalid input value: invalid input syntax for type uuid: "system"
```

**Implication**: Cannot logout if session retrieval fails

---

### Failure #3: GET /api/actions (with valid session)

**HTTP Status**: 500 Internal Server Error  
**Error Code**: Same PrismaClientKnownRequestError

**Pattern**: All protected routes fail with identical error

---

## ROOT CAUSE ANALYSIS

### What's Happening

1. Login succeeds ✓ (audit event "user.logged_in" recorded)
2. Session cookie sent by client
3. Protected route handler tries to retrieve session
4. **ERROR**: Attempts `prisma.session.findUnique()` with UUID = "system"
5. Database rejects "system" as invalid UUID format
6. Request fails with 500

### The "system" Value

The string "system" is appearing where a UUID should be (session token).

**Possible Sources**:
- Session extraction defaults to "system"
- Session token not extracted from request
- Default workspace ID ("system") being used as session ID
- Cookie not being parsed correctly

---

## SESSION RESOLUTION ISSUE

### Current Behavior

```
Request arrives → Extract session token → ??? 
                                          ↓
                                    "system" (wrong!)
                                          ↓
                                    Prisma query fails
```

### Expected Behavior

```
Request arrives → Extract session token → <UUID from cookie>
                                             ↓
                                        Prisma query succeeds
                                             ↓
                                        Session found or 401
```

---

## CATEGORIZATION

**Error Type**: AUTH_CONTEXT  
**Subcategory**: SESSION_PROPAGATION  
**Severity**: BLOCKING (all protected routes fail)  
**Blast Radius**: All authenticated product flows

---

## AUDIT TRAIL

Login IS working:
```json
{
  "level": "INFO",
  "message": "Audit event emitted with hash chain",
  "context": {
    "eventName": "user.logged_in",
    "auditEventId": "883b37d0-fc56-4c62-a67f-5daee7019a73",
    "hashChainLinked": true
  }
}
```

But session retrieval after login fails.

---

## PHASE A CONCLUSION

**Root Cause Identified**: Session token not being extracted from request properly, resulting in "system" being passed to Prisma as session UUID.

**Next Action**: PHASE B - Classify and PHASE C - Minimal surgical fix to session extraction logic.

**Status**: BLOCKING - NO authenticated product flows operational until fixed
