# AUTH 401 ROOT CAUSE ANALYSIS

## Executive Summary

**Probable Classification: B. SIGNUP SUCCEEDS BUT LOGIN BROKEN**

Evidence suggests the preview deployment may have a database connectivity issue, not a code defect.

---

## TASK 1 — Exact Login Route

**Route:** `/api/auth/login` (src/app/api/auth/login/route.ts)

**Entry Point:**
```typescript
export const POST = async (request: NextRequest) => {
  // Parse credentials
  const { email, password } = await parseRequestBody(request, loginSchema);
  
  // Rate limit
  requireRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT);
  
  // Initialize DB
  await getDbInstance();
  
  // Lookup user
  const user = await db.user.findUnique({ where: { email } });
  
  // Validate conditions
  if (!user || !user.isActive || !user.hashedPassword) {
    throw new UnauthorizedError("Invalid email or password");
  }
  
  // Verify password
  const passwordValid = await bcrypt.compare(password, user.hashedPassword);
  if (!passwordValid) {
    throw new UnauthorizedError("Invalid email or password");
  }
  
  // Create session and set cookie
  // Return 200 with user info
};
```

---

## TASK 2 — Exact Conditions That Return 401

### Condition A: User Validation Failed (Line 62-70)
```typescript
if (!user || !user.isActive || !user.hashedPassword) {
  throw new UnauthorizedError("Invalid email or password");
  // Returns HTTP 401
}
```

**This triggers if ANY of:**
1. `!user` — User not found in database
2. `!user.isActive` — User exists but isActive = false
3. `!user.hashedPassword` — User exists but no password hash stored

### Condition B: Password Mismatch (Line 87-96)
```typescript
const passwordValid = await bcrypt.compare(password, user.hashedPassword);
if (!passwordValid) {
  throw new UnauthorizedError("Invalid email or password");
  // Returns HTTP 401
}
```

**This triggers if:**
- bcrypt.compare() returns false (password doesn't match hash)

---

## TASK 3 — Signup and Login Use Same Database

**Evidence:**

Both import from same source:
```typescript
// login/route.ts line 2
import { db } from "@/lib/db";

// signup/route.ts line 2
import { db } from "@/lib/db";
```

**Database Instance:**

The `db` object is a lazy-loading Proxy (src/lib/db.ts:112-142):
```typescript
export const db = new Proxy({} as any, {
  get(target, prop) {
    if (globalForPrisma.prisma) {
      return Reflect.get(globalForPrisma.prisma, prop);  // Fast path
    }
    if (!globalForPrisma.prismaPromise) {
      globalForPrisma.prismaPromise = getDb();  // Initialize once
    }
    // Return deferred method that waits for initialization
    return new Proxy({} as any, { ... });
  }
});
```

**Single Initialization:**

`getDb()` (line 83-95) creates ONE Prisma client instance:
```typescript
async function getDb() {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;  // Reuse if exists
  }
  if (globalForPrisma.prismaPromise) {
    return globalForPrisma.prismaPromise;  // Wait if initializing
  }
  globalForPrisma.prismaPromise = createPrismaClient();
  globalForPrisma.prisma = await globalForPrisma.prismaPromise;
  return globalForPrisma.prisma;  // Return singleton
}
```

**Conclusion:**
✅ Both signup and login query the EXACT SAME database instance
✅ They use the SAME Prisma client
✅ No database mismatch at code level

---

## TASK 4 — Preview Deployment DB Configuration

**Database Connection:**

The database URL is determined by ONE environment variable:
```typescript
// src/lib/db.ts line 23
const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
```

**For Preview Deployment:**

There are three possible scenarios:

### Scenario 1: Preview Points to Production DB
```
PREVIEW DATABASE_URL = production-db-url
├─ Signup: Writes to production user table
├─ Login: Reads from production user table
└─ Status: Should work (same DB)
```

### Scenario 2: Preview Points to Staging/Preview DB
```
PREVIEW DATABASE_URL = staging-db-url
├─ Signup: Writes to staging user table
├─ Login: Reads from staging user table
└─ Status: Should work (same DB)
```

### Scenario 3: Database Connection Failure
```
PREVIEW DATABASE_URL = valid-url-but-db-unreachable
├─ Signup: May fail at db.user.create() (returned error but hidden)
├─ Login: Fails at db.user.findUnique() (user not found in DB)
└─ Status: Returns 401 "Invalid email or password"
```

**Most Likely: Scenario 3**

If the preview deployment database is unreachable:
- Signup might fail silently (error handling hides DB errors)
- Login would fail because `db.user.findUnique()` returns null
- User sees HTTP 401 "Invalid email or password"
- But the real issue is DB connectivity, not code

---

## TASK 5 — Required Environment Variables for Auth

**Minimal Auth Requirements:**

1. **DATABASE_URL** (REQUIRED)
   - Format: `postgresql://user:password@host:port/database?sslmode=require`
   - Used by: Both signup and login for all database operations
   - If missing: Both routes fail at `getDbInstance()` with error

2. **NODE_ENV** (OPTIONAL but affects cookie security)
   - Values: development | staging | production
   - Used in signup/login line 126/141:
     ```typescript
     secure: process.env.NODE_ENV === "production"
     ```
   - If missing: Defaults to undefined, cookies not sent over HTTPS

3. **SESSION_EXPIRY_HOURS** (OPTIONAL)
   - Default: 24 hours (hardcoded in src/services/auth.ts:13)
   - If set: Not read by login/signup (hardcoded value used)

**No Additional Secrets Required:**
- ✅ No AUTH_SECRET needed for signup/login
- ✅ No STRIPE keys needed for signup/login
- ✅ No API keys needed for basic auth flow

**Only DATABASE_URL is critical.**

---

## TASK 6 — All Branches That Return 401

**Exactly 2 branches return HTTP 401:**

### Branch 1: Line 192-196
```typescript
if (error instanceof UnauthorizedError) {
  return Response.json({
    error: "Invalid email or password",
    classification: "invalid_credentials"
  }, { status: 401 });
}
```

UnauthorizedError is thrown from:
- Line 69: `!user || !user.isActive || !user.hashedPassword`
- Line 95: `!passwordValid`

### Branch 2: All other errors
```typescript
return Response.json({
  error: "Login failed",
  classification,
  stage
}, { status: 500 });  // NOT 401, returns 500
```

**Summary:**
```
HTTP 401 is ONLY returned when:
  ✓ User not found
  ✓ User inactive
  ✓ User has no password hash
  ✓ Password doesn't match bcrypt hash

HTTP 401 is NOT returned for:
  ✗ Database connection errors (returns 500)
  ✗ Rate limit exceeded (thrown by requireRateLimit)
  ✗ Validation errors (returns 400)
  ✗ Session creation failures (returns 500)
```

---

## TASK 7 — Expected Password Verification Path

**Password Flow:**

### Signup (line 43):
```typescript
const hashedPassword = await bcrypt.hash(password, 10);

const user = await db.user.create({
  data: {
    id: userId,
    email,
    hashedPassword,  // ← Stored in DB
    isActive: true,
    updatedAt: now,
  },
});
```

**Result:** User stored with bcrypt-hashed password

### Login (line 84-85):
```typescript
const passwordValid = await bcrypt.compare(password, user.hashedPassword);

if (!passwordValid) {
  throw new UnauthorizedError("Invalid email or password");
}
```

**Flow:**
1. Fetch user from DB by email
2. Get `user.hashedPassword` from DB row
3. Call `bcrypt.compare(plaintext, hash)`
4. bcrypt compares and returns true/false
5. If false, throw 401

**Expected:** If signup used the same password plaintext, `bcrypt.compare()` should return true

---

## TASK 8 — Can Newly Created Signup Accounts Login Immediately?

**YES — They SHOULD be able to login immediately.**

**Evidence:**

### Signup Creates User With:
```typescript
const user = await db.user.create({
  data: {
    id: userId,
    email,                    // ✓ Set
    hashedPassword,           // ✓ Set (bcrypt hashed)
    isActive: true,           // ✓ Set to true
    updatedAt: now,
  },
});
```

### Login Requires:
```typescript
if (!user || !user.isActive || !user.hashedPassword) {
  throw new UnauthorizedError(...);  // 401
}
```

**Check:**
- `!user`? NO — user was just created
- `!user.isActive`? NO — explicitly set to true
- `!user.hashedPassword`? NO — explicitly set with bcrypt.hash()

### Password Verification:
```typescript
const passwordValid = await bcrypt.compare(password, user.hashedPassword);
```

**Check:**
- Same password plaintext used in signup and login? YES
- bcrypt.compare() should return true? YES

**Conclusion:**
✅ A newly created signup account SHOULD login immediately
✅ No code barrier to immediate login
✅ If login fails with 401, it's either:
   - User not actually created (DB error during signup)
   - Database not accessible during login
   - Password plaintext different between signup and login (user error)

---

## ROOT CAUSE CLASSIFICATION

### Analysis of Evidence

**Question A: User entered invalid credentials?**
- Possible if user typed wrong password
- But would need signup to succeed first
- Can be verified in Vercel logs (look for "invalid_password" event)

**Question B: Signup succeeds but login broken?**
- ✅ LIKELY — If database is unreachable on login only
- If signup bypassed DB errors, login would fail with "user not found"
- Vercel logs would show NULL database connection error

**Question C: Preview DB mismatch?**
- ✗ UNLIKELY — Code uses same DB instance for both
- Database determined by single environment variable
- No environment-specific logic that would create mismatch

**Question D: Auth configuration defect?**
- ✗ NO — Login/signup code is simple and correct
- Only requirement is DATABASE_URL
- Password hashing matches expected bcrypt flow

**Question E: Unknown—need runtime evidence?**
- ✓ CORRECT IF: Cannot access Vercel logs or signup response

---

## Most Probable Root Cause

### **Classification: B. SIGNUP SUCCEEDS BUT LOGIN BROKEN**

**Mechanism:**

1. User signs up
   - Browser submits POST /api/auth/signup
   - Signup creates user in database
   - Returns HTTP 201 ✓
   - Browser redirected to dashboard

2. User logs out (or session expires)
   - Browser has no valid session cookie

3. User tries to login
   - Browser submits POST /api/auth/login
   - Route calls `await db.user.findUnique({ where: { email } })`
   - **Database unreachable or query fails**
   - Result: `user = null`
   - Condition check: `if (!user)` → TRUE
   - Throws UnauthorizedError
   - Returns HTTP 401 "Invalid email or password"

**Why This Appears as "401 Invalid Credentials":**
- The error message is intentionally vague (security)
- Both "user not found" and "wrong password" return same error
- Hides whether the user exists or password was wrong

**How to Verify:**
- Check Vercel logs for user signup success response
- Check Vercel logs for login database query error
- Look for error traces mentioning Prisma or database connection

---

## Required Evidence to Confirm

To move from "B. Likely" to "B. Confirmed", check:

1. **Signup Success Log**
   - Vercel logs should show: `[SIGNUP] POST /api/auth/signup` → HTTP 201
   - Should see: "USER_CREATED" audit event
   - Should show user ID created

2. **Login Failure Log**
   - Vercel logs should show: `[LOGIN] POST /api/auth/login` → HTTP 401
   - Should see: `[LOGIN] USER_LOOKUP_OK { found: false }`
   - Should see: `[LOGIN] USER_VALIDATION_FAILED`

3. **Database Connection**
   - Check if preview DATABASE_URL environment variable is set
   - Try to connect to the database manually
   - Verify network accessibility from preview deployment region

4. **Session Cookie**
   - After signup, check if `opsiq_session` cookie is set
   - Check if cookie is accessible to login request (same domain)

---

## Next Steps

1. **Immediate:** Check Vercel logs for signup/login stages
2. **Database:** Verify DATABASE_URL is correct and reachable from preview
3. **Manual Test:** Create account, immediately logout, try to login
4. **Logs:** Search for "USER_LOOKUP_OK", "USER_VALIDATION_FAILED", database errors

If logs show "found: false" in login, the root cause is: **User not created in database during signup**, likely due to database connectivity or constraint violation.
