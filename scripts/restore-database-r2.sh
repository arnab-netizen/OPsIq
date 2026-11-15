#!/usr/bin/env bash
#
# Restore rehearsal: R2 encrypted object -> download -> checksum verification -> age decrypt ->
# restore-database.sh -> DISPOSABLE PostgreSQL only.
#
# NEVER PRODUCTION: this script never inspects, parses, or authorizes a restore target itself.
# It hands the decrypted dump to the EXISTING, unmodified scripts/restore-database.sh, whose own
# assert-restore-target.mjs preflight refuses anything but a proven local-loopback (or an approved
# staging) target -- production, unknown, or missing is REFUSED on the target alone, before
# DATABASE_URL is even inspected. This script does not duplicate or weaken that check.
#
# Order: download (encrypted object + checksum) -> checksum verification (of the ciphertext, as
# downloaded) -> age decrypt -> hand off to restore-database.sh (gzip integrity, completion
# marker, restore, table/row verification). Any stage failing aborts before the next one runs.
#
# Required env:
#   R2_ENDPOINT, R2_BUCKET            same shape as backup-database-r2.sh
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   an R2 READ credential (never the writer's RW token)
#   AGE_IDENTITY_FILE                 path to the age private identity file; NEVER committed, NEVER
#                                      present in the ordinary backup-write workflow -- this script
#                                      must only ever run under a separate, protected recovery
#                                      environment (see docs/opsiq/product/R2_BACKUP_RUNBOOK.md)
#   OPSIQ_DB_TARGET, DATABASE_URL     passed through unchanged to restore-database.sh; must already
#                                      satisfy ITS target-safety rules (local-loopback for a rehearsal)
# Optional env:
#   R2_OBJECT_PREFIX                  default "backups/"
#
# Usage: ./restore-database-r2.sh <encrypted-object-name, e.g. opsiq_backup_2026-10-28_03-00-00.sql.gz.age>
set -euo pipefail

# Portable SHA-256 (GNU coreutils `sha256sum` on Linux/CI; `shasum -a 256` on macOS, where a
# MacBook is the expected local-restore machine).
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
R2_OBJECT_PREFIX="${R2_OBJECT_PREFIX:-backups/}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"

OBJECT_NAME="${1:-}"
if [ -z "$OBJECT_NAME" ]; then
  echo "ERROR: no object name given. Usage: $0 <encrypted-object-name>" >&2
  exit 1
fi
# The object name becomes a filename and a remote key: forbid traversal/separators so a malicious
# or malformed value cannot escape the intended prefix or the local workdir.
if [[ "$OBJECT_NAME" == */* ]] || [[ "$OBJECT_NAME" == *..* ]] || [[ "$OBJECT_NAME" != *.sql.gz.age ]]; then
  echo "ERROR: object name '$OBJECT_NAME' is not a plain '*.sql.gz.age' filename -- refusing" >&2
  exit 1
fi

# KEY CUSTODY (F-PRIVATE-KEY-CUSTODY): the age PRIVATE identity never exists in GitHub, so decryption
# is refused on any GitHub Actions runner. Decrypt-and-restore is a controlled LOCAL operation on
# an operator workstation (or a disposable local container), against a loopback database only.
# (GitHub may only verify CIPHERTEXT -- see .github/workflows/restore-rehearsal-r2.yml.)
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  echo "ERROR: refusing to decrypt a backup on a GitHub Actions runner -- the age private identity must never be present in GitHub. Run this locally (see docs/opsiq/product/R2_BACKUP_RUNBOOK.md, 'Local restore')." >&2
  exit 1
fi

# LOCAL SOURCE SEAM (F-LOCAL-RESTORE-PROOF): RESTORE_SOURCE_DIR points at a directory that already
# holds the encrypted object and its .sha256 (e.g. downloaded by the operator, or written by
# backup-database-r2.sh with BACKUP_LOCAL_ONLY_DIR). No R2 credential or aws CLI is then needed.
# Only permitted for OPSIQ_DB_TARGET=local; restore-database.sh still enforces its own target gate.
RESTORE_SOURCE_DIR="${RESTORE_SOURCE_DIR:-}"
if [ -n "$RESTORE_SOURCE_DIR" ]; then
  if [ "${OPSIQ_DB_TARGET:-}" != "local" ]; then
    echo "ERROR: RESTORE_SOURCE_DIR is only permitted with OPSIQ_DB_TARGET=local" >&2
    exit 1
  fi
  if [ ! -f "$RESTORE_SOURCE_DIR/$OBJECT_NAME" ] || [ ! -f "$RESTORE_SOURCE_DIR/${OBJECT_NAME}.sha256" ]; then
    echo "ERROR: RESTORE_SOURCE_DIR does not contain the encrypted object and its .sha256" >&2
    exit 1
  fi
  REQUIRED_VARS="AGE_IDENTITY_FILE"
else
  REQUIRED_VARS="R2_ENDPOINT R2_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AGE_IDENTITY_FILE"
fi
for v in $REQUIRED_VARS; do
  if [ -z "${!v:-}" ]; then
    echo "ERROR: $v not set" >&2
    exit 1
  fi
done
if [ ! -f "$AGE_IDENTITY_FILE" ]; then
  echo "ERROR: AGE_IDENTITY_FILE '$AGE_IDENTITY_FILE' does not exist" >&2
  exit 1
fi
if [ -z "$RESTORE_SOURCE_DIR" ]; then
  if ! [[ "$R2_ENDPOINT" =~ ^https://[a-z0-9]+\.r2\.cloudflarestorage\.com/?$ ]]; then
    echo "ERROR: R2_ENDPOINT does not look like a Cloudflare R2 account endpoint" >&2
    exit 1
  fi
  R2_ENDPOINT="${R2_ENDPOINT%/}"
fi

if ! command -v age >/dev/null 2>&1; then
  echo "ERROR: age not found on PATH" >&2
  exit 1
fi
if [ -z "$RESTORE_SOURCE_DIR" ] && ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI not found on PATH" >&2
  exit 1
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/opsiq-restore-r2.XXXXXX")"
chmod 700 "$WORKDIR"
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

ENCRYPTED_FILE="$WORKDIR/$OBJECT_NAME"
CHECKSUM_FILE="$WORKDIR/${OBJECT_NAME}.sha256"
DECRYPTED_FILE="$WORKDIR/${OBJECT_NAME%.age}"

DOWNLOAD_KEY_BACKUP="${R2_OBJECT_PREFIX}${OBJECT_NAME}"
DOWNLOAD_KEY_CHECKSUM="${R2_OBJECT_PREFIX}${OBJECT_NAME}.sha256"

# --- 1. Download: encrypted object + its checksum sidecar (or copy from the local source dir) ---
if [ -n "$RESTORE_SOURCE_DIR" ]; then
  cp "$RESTORE_SOURCE_DIR/$OBJECT_NAME" "$ENCRYPTED_FILE"
  cp "$RESTORE_SOURCE_DIR/${OBJECT_NAME}.sha256" "$CHECKSUM_FILE"
  echo "Using local source directory (no R2 access)"
elif ! aws s3 cp "s3://${R2_BUCKET}/${DOWNLOAD_KEY_BACKUP}" "$ENCRYPTED_FILE" \
  --endpoint-url "$R2_ENDPOINT" --only-show-errors; then
  echo "ERROR: download of encrypted backup failed (s3://${R2_BUCKET}/${DOWNLOAD_KEY_BACKUP})" >&2
  exit 1
fi
if [ -z "$RESTORE_SOURCE_DIR" ]; then
  if ! aws s3 cp "s3://${R2_BUCKET}/${DOWNLOAD_KEY_CHECKSUM}" "$CHECKSUM_FILE" \
    --endpoint-url "$R2_ENDPOINT" --only-show-errors; then
    echo "ERROR: download of checksum sidecar failed (s3://${R2_BUCKET}/${DOWNLOAD_KEY_CHECKSUM})" >&2
    exit 1
  fi
  echo "Downloaded encrypted object and checksum from s3://${R2_BUCKET}/${R2_OBJECT_PREFIX}"
fi

# --- 2. Checksum verification of the ciphertext AS DOWNLOADED, before any decryption is attempted ---
EXPECTED_CHECKSUM=$(cat "$CHECKSUM_FILE" | tr -d '[:space:]')
ACTUAL_CHECKSUM=$(sha256_of "$ENCRYPTED_FILE")
if [ -z "$EXPECTED_CHECKSUM" ] || [ "$EXPECTED_CHECKSUM" != "$ACTUAL_CHECKSUM" ]; then
  echo "ERROR: checksum mismatch on downloaded encrypted object. expected='$EXPECTED_CHECKSUM' actual='$ACTUAL_CHECKSUM'" >&2
  exit 1
fi
echo "Checksum verified: $ACTUAL_CHECKSUM"

# --- 3. age decrypt. Fails closed on a wrong/absent identity, corrupted ciphertext, or any other
# age error -- age itself returns non-zero and this script never treats that as success. ---
if age -d -i "$AGE_IDENTITY_FILE" -o "$DECRYPTED_FILE" "$ENCRYPTED_FILE" 2> "$WORKDIR/age.stderr"; then
  :
else
  echo "ERROR: age decryption failed (wrong/absent identity, or corrupted ciphertext)" >&2
  cat "$WORKDIR/age.stderr" >&2 || true
  exit 1
fi
if [ ! -s "$DECRYPTED_FILE" ]; then
  echo "ERROR: decrypted file is empty or missing" >&2
  exit 1
fi
echo "Decrypted successfully: $DECRYPTED_FILE"

# --- 4. Hand off to the existing, unmodified restore-database.sh. Its own target-safety preflight
# (assert-restore-target.mjs) is the single authoritative check; this script relies on it rather
# than re-implementing or weakening it. Its own gzip-integrity, completion-marker, restore, and
# table/row verification all run here too. No second argument is passed: this script already
# verified the ciphertext's checksum above, which is the equivalent (and, since it covers the
# exact bytes retrieved from R2, the more meaningful) integrity proof for this path. ---
echo "Handing off to scripts/restore-database.sh (target-safety enforced there, unchanged)..."
bash "$SCRIPT_DIR/restore-database.sh" "$DECRYPTED_FILE"

# --- 5. QUARANTINE (F-ERASURE-RECONCILIATION): a restored database predates every erasure completed
# after this backup was taken, so it must NOT be served -- or promoted over anything -- until those
# erasures are reconciled against the independent erasure ledger. This script never promotes a
# restore; the only thing it prints is that the restored copy is quarantined, and the one command
# that can lift the quarantine decision. ---
echo "RESTORE_SERVICEABLE=NO_UNTIL_ERASURE_RECONCILED"
echo "NEXT: ERASURE_LEDGER_SIGNING_KEY=... RESTORED_DATABASE_URL=<loopback url of this restore> npx tsx scripts/privacy/verify-erasure-ledger.ts --ledger-dir <local copy of erasure-ledger/> --backup-timestamp <manifest timestamp_utc> [--reconciled-event-ids id,id]   (exit 0 only when RESTORE_PROMOTION=PROMOTABLE)"
