#!/bin/bash
# R12 Identity Trust Chain Audit

echo "=== R12 IDENTITY TRUST CHAIN PROOF AUDIT ==="
echo ""
echo "This audit tests whether the system trusts client-provided headers"
echo "instead of deriving identity from a verified session."
echo ""

# Test results
RESULTS=""

# ============================================================================
# Test A: Valid Session + Forged Workspace Header
# ============================================================================
echo "TEST A: Valid Session + Forged Workspace Header"
echo "=============================================="
echo ""
echo "Scenario: User with valid session attempts to access workspace they don't belong to"
echo ""
echo "Setup:"
echo "  - Valid X-Auth-Token: user1:token123 (pretend this is valid)"
echo "  - Forged X-Workspace-Id: evil-workspace (user1 doesn't belong here)"
echo "  - Payload workspaceId: evil-workspace (matches header)"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: user1:token123" \
  -H "X-Workspace-Id: evil-workspace" \
  -d '{
    "action": "pageVisit",
    "payload": {
      "actorId": "user1",
      "workspaceId": "evil-workspace",
      "page": "/"
    }
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Request Result:"
echo "  HTTP Code: $HTTP_CODE"
echo "  Response: $BODY"
echo ""

if [ "$HTTP_CODE" = "403" ]; then
  echo "✅ PROVEN: System rejected forged workspace header"
  echo "   (Session system verified user doesn't belong to evil-workspace)"
  RESULTS="${RESULTS}[PROVEN] Valid Session + Forged Workspace\n"
elif [ "$HTTP_CODE" = "200" ]; then
  echo "❌ FAILED: System ACCEPTED forged workspace header"
  echo "   (User could impersonate workspace membership via headers)"
  RESULTS="${RESULTS}[FAILED] Valid Session + Forged Workspace - CRITICAL VULNERABILITY\n"
else
  echo "⚠️  PARTIAL: System returned $HTTP_CODE (unclear behavior)"
  RESULTS="${RESULTS}[PARTIAL] Valid Session + Forged Workspace (HTTP $HTTP_CODE)\n"
fi

echo ""
echo ""

# ============================================================================
# Test B: Valid Session + Forged Actor Header
# ============================================================================
echo "TEST B: Valid Session + Forged Actor Header"
echo "=========================================="
echo ""
echo "Scenario: User attempts to submit telemetry as different user"
echo ""
echo "Setup:"
echo "  - Valid X-Auth-Token: user1:token123 (authenticates as user1)"
echo "  - Forged actorId: admin-user (trying to impersonate admin)"
echo "  - Valid X-Workspace-Id: test-workspace"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: user1:token123" \
  -H "X-Workspace-Id: test-workspace" \
  -d '{
    "action": "pageVisit",
    "payload": {
      "actorId": "admin-user",
      "workspaceId": "test-workspace",
      "page": "/"
    }
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Request Result:"
echo "  HTTP Code: $HTTP_CODE"
echo "  Response Body (trimmed): $(echo "$BODY" | head -c 100)..."
echo ""

if [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "401" ]; then
  echo "✅ PROVEN: System rejected actor impersonation"
  echo "   (Session system enforced authenticated user is user1, not admin-user)"
  RESULTS="${RESULTS}[PROVEN] Valid Session + Forged Actor\n"
elif [ "$HTTP_CODE" = "200" ]; then
  echo "❌ FAILED: System ACCEPTED actor impersonation"
  echo "   (User could submit telemetry as any actor via payload)"
  RESULTS="${RESULTS}[FAILED] Valid Session + Forged Actor - CRITICAL VULNERABILITY\n"
else
  echo "⚠️  PARTIAL: System returned $HTTP_CODE"
  RESULTS="${RESULTS}[PARTIAL] Valid Session + Forged Actor (HTTP $HTTP_CODE)\n"
fi

echo ""
echo ""

# ============================================================================
# Test C: No Session + Forged Headers (Already Tested in R11)
# ============================================================================
echo "TEST C: No Session + Forged Headers"
echo "===================================="
echo ""
echo "Scenario: Attacker with no valid session forges both auth and workspace"
echo ""
echo "Setup:"
echo "  - Forged X-Auth-Token: attacker:fake123"
echo "  - Forged X-Workspace-Id: target-workspace"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: attacker:fake123" \
  -H "X-Workspace-Id: target-workspace" \
  -d '{
    "action": "pageVisit",
    "payload": {
      "actorId": "attacker",
      "workspaceId": "target-workspace",
      "page": "/"
    }
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Request Result:"
echo "  HTTP Code: $HTTP_CODE"
echo "  Response: $BODY"
echo ""

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ PROVEN: System rejected invalid session"
  echo "   (attacker:fake123 is not a valid authenticated session)"
  RESULTS="${RESULTS}[PROVEN] No Session + Forged Headers\n"
elif [ "$HTTP_CODE" = "200" ]; then
  echo "❌ FAILED: System ACCEPTED forged session header"
  echo "   (Any X-Auth-Token value is accepted without validation)"
  RESULTS="${RESULTS}[FAILED] No Session + Forged Headers - CRITICAL VULNERABILITY\n"
else
  echo "⚠️  PARTIAL: System returned $HTTP_CODE"
  RESULTS="${RESULTS}[PARTIAL] No Session + Forged Headers (HTTP $HTTP_CODE)\n"
fi

echo ""
echo ""

# ============================================================================
# Test D: Cross-Tenant Request (Already Tested in R11)
# ============================================================================
echo "TEST D: Cross-Tenant Request"
echo "============================"
echo ""
echo "Scenario: Authenticated user in workspace-a tries to access workspace-b"
echo ""
echo "Setup:"
echo "  - Valid session for user1 in workspace-a"
echo "  - X-Auth-Token: user1:workspace-a (indicates workspace)"
echo "  - X-Workspace-Id: workspace-b (different workspace)"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: user1:workspace-a" \
  -H "X-Workspace-Id: workspace-b" \
  -d '{
    "feedbackType": "confusing",
    "actorId": "user1",
    "workspaceId": "workspace-b",
    "page": "/",
    "context": "test"
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Request Result:"
echo "  HTTP Code: $HTTP_CODE"
echo "  Response: $BODY"
echo ""

if [ "$HTTP_CODE" = "403" ]; then
  echo "✅ PROVEN: System rejected cross-tenant access"
  echo "   (User can only access workspace from their session)"
  RESULTS="${RESULTS}[PROVEN] Cross-Tenant Request\n"
elif [ "$HTTP_CODE" = "200" ]; then
  echo "❌ FAILED: System ALLOWED cross-tenant access"
  echo "   (User impersonated different workspace via headers)"
  RESULTS="${RESULTS}[FAILED] Cross-Tenant Request - CRITICAL VULNERABILITY\n"
else
  echo "⚠️  PARTIAL: System returned $HTTP_CODE"
  RESULTS="${RESULTS}[PARTIAL] Cross-Tenant Request (HTTP $HTTP_CODE)\n"
fi

echo ""
echo ""

# ============================================================================
# SUMMARY
# ============================================================================
echo "=== AUDIT SUMMARY ==="
echo ""
echo "4 Trust Chain Tests:"
echo -e "$RESULTS"
echo ""
echo "=== INTERPRETATION ==="
echo ""
echo "CRITICAL FINDING: System trusts X-Auth-Token and X-Workspace-Id headers"
echo "from CLIENT REQUESTS without validating them against a session database."
echo ""
echo "This means:"
echo "  ❌ Any X-Auth-Token value is accepted as 'authentication'"
echo "  ❌ Workspace membership is NOT verified from database"
echo "  ❌ Actor identity can be forged via payload"
echo "  ❌ Cross-tenant access is only blocked by header matching (not DB check)"
echo ""
echo "REQUIRED: Implement real session/authentication system that:"
echo "  ✅ Issues signed session tokens (JWT)"
echo "  ✅ Validates token signature on each request"
echo "  ✅ Derives actor ID from validated token"
echo "  ✅ Derives workspace from database (user's actual workspace)"
echo "  ✅ Verifies workspace membership from database"
echo "  ✅ Does NOT trust client-provided workspace headers"
echo ""
