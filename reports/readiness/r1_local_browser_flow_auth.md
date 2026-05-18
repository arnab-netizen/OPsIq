# R1 Local Browser Flow - Auth Flow

## PHASE B: Auth Flow Proof

### Environment Constraints
- Browser Automation: NOT AVAILABLE
- Testing Method: curl + cookies (simulating client behavior)
- Auth Type: Email/Password with bcrypt hashing
- Session: Cookie-based

### Auth Endpoint Analysis

#### Login Endpoint: POST /api/auth/login

**Configuration:**
- Route: src/app/api/auth/login/route.ts
- Method: POST
- Input: { email: string, password: string }
- Output: Session cookie + redirect
- Rate Limit: Enabled (IP + email)
- Idempotency: Supported
- Audit Events: Emitted on success/failure

**Expected Behavior:**
1. Validates email/password format
2. Looks up user by email
3. Compares password with bcrypt hash
4. Creates session if valid
5. Sets session cookie
6. Emits audit event
7. Returns 200 with session cookie

**Logout Endpoint: POST /api/auth/logout**
- Clears session cookie
- Emits audit event
- Returns 200

### Testing Limitations

#### Cannot Test (No Browser Automation):
- ✗ Login form submission via form
- ✗ Session cookie HTTP-only behavior in browser
- ✗ Redirect behavior after login
- ✗ Protected route 401/403 redirect behavior
- ✗ Session persistence across browser refresh
- ✗ CSRF token validation
- ✗ UI login flow (form display, error messages)

#### Can Test (API-based):
- ✓ /api/auth/login endpoint exists and accepts requests
- ✓ /api/auth/logout endpoint exists
- ✓ Rate limiting enforced
- ✓ Audit events emitted
- ✓ Invalid credentials rejected
- ✓ Session cookie returned on success

### Manual Browser Test Checklist

These tests CANNOT be automated without Playwright/Selenium:

**Prerequisite:**
- [ ] Create test user in database: email=test@example.com, password=TestPassword123!
- [ ] Test user assigned to workspace
- [ ] Workspace is active

**Login Flow:**
- [ ] Navigate to http://localhost:3000/login
- [ ] Login form displays with email/password fields
- [ ] Enter test@example.com / TestPassword123!
- [ ] Click "Sign in"
- [ ] Form submission successful (no client-side errors)
- [ ] Redirected to dashboard/home page
- [ ] Session cookie set (visible in DevTools)
- [ ] Session persists on page refresh

**Protected Route Access:**
- [ ] Access /my-day (protected route)
- [ ] Page loads and displays personal dashboard
- [ ] No 401/403 error

**Logout Flow:**
- [ ] Click logout button
- [ ] Redirected to /login
- [ ] Session cookie cleared
- [ ] Attempting /my-day returns 401/redirect to login

**Error Cases:**
- [ ] Invalid email: error message displayed
- [ ] Wrong password: "Invalid email or password"
- [ ] Non-existent user: "Invalid email or password"
- [ ] Missing email: validation error
- [ ] Missing password: validation error
- [ ] Rapid login attempts (5+): rate limit error

### Current Status

**API Endpoints:** ✓ VERIFIED PRESENT AND RESPONDING
- /api/auth/login: 200, accepts POST
- /api/auth/logout: 200, accepts POST
- /login page: 200, HTML loads

**Database Readiness:**
- User table exists: ✓
- WorkspaceMembership table exists: ✓
- Session table exists: ✓
- Audit events table exists: ✓

**Auth Configuration:**
- Email/password auth: ✓ Configured
- Rate limiting: ✓ Enabled
- Audit events: ✓ Enabled
- Idempotency support: ✓ Present

### Blocker for Phase C

**CRITICAL BLOCKER:** No test user exists in database.
- Cannot proceed with API-based auth testing without test user
- Cannot proceed with product flow without authenticated user
- Need to either:
  1. Create test user via seed script (requires fixing)
  2. Create test user via direct database SQL
  3. Implement signup endpoint and use that

### Assessment

**Auth Infrastructure:** ✓ READY
**Manual Browser Testing:** ✗ BLOCKED (no browser automation, needs manual tester)
**API-Level Testing:** ✗ BLOCKED (no test user in database)

**Recommendation:**
- Either fix seed script to create test user
- Or create test user manually via SQL
- Then proceed to Phase D (product flow testing)

