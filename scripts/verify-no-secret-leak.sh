#!/usr/bin/env bash
#
# Fails closed if any configured needle (the production acceptance password,
# and/or any session-token value from a token log) appears inside a captured
# evidence file -- including inside a .zip trace archive's contents, not just
# its filename.
#
# Extracted from .github/workflows/production-owner-acceptance.yml (run
# #32509563234's leak-scan step) so it can be exercised directly against
# synthetic fixtures in scripts/__tests__/verify-no-secret-leak.test.mjs,
# independent of a real CI run. This scanner is defense-in-depth: the
# primary control is that the production acceptance suite never captures
# credential-bearing page/network state in the first place (playwright
# .production.config.ts sets trace/screenshot to 'off'; see
# tests/production/helpers/evidence.ts).
#
# Usage: verify-no-secret-leak.sh [evidence-dir] [session-token-file]
#   evidence-dir       default: production-test-results
#   session-token-file default: /tmp/.opsiq-acceptance-session-tokens
# Env:
#   LEAK_CHECK_PASSWORD  optional additional needle (the acceptance password)
#
# Exit 0: no needle found (or no needles configured -- see warning).
# Exit 1: at least one needle found in captured evidence.
set -uo pipefail

EVIDENCE_DIR="${1:-production-test-results}"
TOKEN_FILE="${2:-/tmp/.opsiq-acceptance-session-tokens}"

FOUND=0
NEEDLES=()
[ -n "${LEAK_CHECK_PASSWORD:-}" ] && NEEDLES+=("$LEAK_CHECK_PASSWORD")

if [ -f "$TOKEN_FILE" ]; then
  while IFS= read -r TOKEN; do
    [ -n "$TOKEN" ] && NEEDLES+=("$TOKEN")
  done < "$TOKEN_FILE"
fi

if [ "${#NEEDLES[@]}" -eq 0 ]; then
  echo "::warning::verify-no-secret-leak: no needles configured (no password, no session tokens) -- scan is vacuous this run."
fi

if [ -d "$EVIDENCE_DIR" ]; then
  while IFS= read -r -d '' f; do
    for NEEDLE in "${NEEDLES[@]}"; do
      [ -z "$NEEDLE" ] && continue
      case "$f" in
        *.zip)
          if unzip -p "$f" 2>/dev/null | grep -qF -- "$NEEDLE"; then
            echo "::error::Sensitive value found inside trace archive: $f"
            FOUND=1
          fi
          ;;
        *)
          if grep -qF -- "$NEEDLE" "$f" 2>/dev/null; then
            echo "::error::Sensitive value found inside artifact: $f"
            FOUND=1
          fi
          ;;
      esac
    done
  done < <(find "$EVIDENCE_DIR" -type f \( -name "*.zip" -o -name "*.png" -o -name "*.webm" -o -name "*.json" -o -name "*.html" \) -print0)
fi

if [ "$FOUND" == "1" ]; then
  echo "::error::Credential or session-token leak detected in captured evidence. Failing closed."
  exit 1
fi

echo "No credential/session-token leakage detected in captured evidence."
exit 0
