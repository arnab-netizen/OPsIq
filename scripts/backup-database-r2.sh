#!/usr/bin/env bash
#
# Private, client-side-encrypted Production database backup -> Cloudflare R2.
#
# Replaces GitHub Actions artifact storage as the backup target. GitHub holds NO database-backup
# payload from this script: the only things this script ever writes outside its own secure temp
# directory are stdout/stderr log lines, and the only thing it ever uploads anywhere is the
# encrypted object, its checksum, and a non-sensitive manifest -- to a private R2 bucket, never to
# a GitHub artifact, release, repository file, or log.
#
# ORDER IS THE SAFETY INVARIANT (never reorder):
#   1. QBO backup policy gate   (scripts/backup-qbo-gate.sh, from #642 -- called unmodified, not amended here)
#   2. target/environment safety (DATABASE_URL shape, AGE_RECIPIENT shape, R2 config presence/shape)
#   3. pg_dump | gzip | age     (streamed; no plaintext SQL and no unencrypted gzip ever touches disk)
#   4. SHA-256 over the FINAL ENCRYPTED object
#   5. private R2 upload (encrypted backup, checksum, manifest)
#   6. post-upload HEAD verification (size + existence only -- never downloads to verify)
#   7. cleanup (EXIT trap; runs even on failure or cancellation, not just on success)
#
# "Uncertain = block" applies at every stage: any missing/malformed input, any pipeline-stage
# failure, any upload failure, or any post-upload verification mismatch aborts BEFORE the next
# stage, via `set -euo pipefail` plus explicit checks. Nothing here ever uploads first and decides
# QBO/safety afterward.
#
# Required env:
#   DATABASE_URL          direct (non-pooler) Production Postgres connection string
#   AGE_RECIPIENT         age public recipient (age1...); NOT secret -- the decrypt key is not here
#   R2_ENDPOINT           https://<account-id>.r2.cloudflarestorage.com (default R2 jurisdiction
#                          only -- see R2_ENDPOINT_POLICY in docs/opsiq/product/R2_BACKUP_RUNBOOK.md)
#   R2_BUCKET             private R2 bucket name (this script does not create or configure it)
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   R2 Object Read & Write token, scoped to R2_BUCKET only
# Optional env:
#   PRODUCTION_QBO_ENABLED   passed through to backup-qbo-gate.sh unchanged
#   R2_OBJECT_PREFIX         default "backups/"
#   AWS_DEFAULT_REGION       default "auto" (R2 has no real regions; the AWS SDK/CLI still requires one)
#   GITHUB_SHA               recorded in the manifest if present; never required
#   GITHUB_RUN_ID            used as the object-name uniqueness suffix when present; never required
#
# Usage: ./backup-database-r2.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
R2_OBJECT_PREFIX="${R2_OBJECT_PREFIX:-backups/}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"

TIMESTAMP=$(date -u +%Y-%m-%d_%H-%M-%S)
# UNIQUENESS SUFFIX: a second-granularity timestamp alone collides if two runs start in the same
# second (two concurrent manual workflow_dispatch invocations, or a retry racing the original run).
# GITHUB_RUN_ID is GitHub's own non-secret per-run identifier -- not a credential, host, username,
# or any customer data -- and is unique per workflow run. Outside CI, fall back to a random hex
# suffix. Neither path ever derives this value from DATABASE_URL, QBO data, or any secret.
UNIQUE_SUFFIX="${GITHUB_RUN_ID:-}"
# GITHUB_RUN_ID is documented by GitHub as always a positive integer; every other externally-
# influenced value in this script is validated before use, so this one is too, even though it is
# only ever folded into a quoted object-name string (never shell-interpreted) and the operational
# risk of an unvalidated value is low.
if [ -n "$UNIQUE_SUFFIX" ] && ! [[ "$UNIQUE_SUFFIX" =~ ^[0-9]+$ ]]; then
  echo "ERROR: GITHUB_RUN_ID does not look like a GitHub run id (expected a positive integer)" >&2
  exit 1
fi
if [ -z "$UNIQUE_SUFFIX" ]; then
  UNIQUE_SUFFIX="$(od -An -N8 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n')"
fi
if [ -z "$UNIQUE_SUFFIX" ]; then
  echo "ERROR: could not generate a uniqueness suffix for the backup object name" >&2
  exit 1
fi
OBJECT_NAME="opsiq_backup_${TIMESTAMP}_${UNIQUE_SUFFIX}.sql.gz.age"
CHECKSUM_NAME="${OBJECT_NAME}.sha256"
MANIFEST_NAME="opsiq_backup_${TIMESTAMP}_${UNIQUE_SUFFIX}.manifest.json"

# --- LOCAL FILE HYGIENE: secure temp dir, EXIT trap cleanup. Runner teardown is not relied on as
# the only cleanup mechanism -- this removes everything itself, on success, on failure, and on
# workflow cancellation (bash runs EXIT traps on SIGTERM-induced exit too). ---
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/opsiq-backup-r2.XXXXXX")"
chmod 700 "$WORKDIR"
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

ENCRYPTED_FILE="$WORKDIR/$OBJECT_NAME"
CHECKSUM_FILE="$WORKDIR/$CHECKSUM_NAME"
MANIFEST_FILE="$WORKDIR/$MANIFEST_NAME"
PG_DUMP_STDERR="$WORKDIR/pg_dump.stderr"

echo "Workdir: $WORKDIR (mode 700, removed on exit)"

# --- 1. QBO backup policy gate: FIRST. Nothing below this runs unless the gate allows it. ---
# Same `if <cmd-substitution>; then ... else ...; fi` shape fixed in backup-database.sh for the
# identical set-e pitfall: a plain `VAR=$(cmd)` assignment that fails would abort this script at
# that line under `set -e`, before the reason is ever printed. Making the assignment the `if`
# condition is exempt from `set -e` and this is deliberately a direct copy of that fix.
if GATE_OUT=$(bash "$SCRIPT_DIR/backup-qbo-gate.sh" 2>&1); then
  GATE_RC=0
else
  GATE_RC=$?
fi
echo "$GATE_OUT"
if [ "$GATE_RC" -ne 0 ]; then
  echo "ERROR: backup refused by the QBO backup gate" >&2
  exit 1
fi

# --- 2. target/environment safety ---
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set" >&2
  exit 1
fi
if echo "$DATABASE_URL" | grep -qE 'REPLACE_|PLACEHOLDER|your_neon_url|example\.com'; then
  echo "ERROR: DATABASE_URL contains a placeholder value - secret not properly configured" >&2
  exit 1
fi
# pg_dump against a pooled connection is unreliable for large dumps (Neon's own guidance; mirrors
# the identical gate in backup-database.sh and db-verification.yml for the same reason).
if echo "$DATABASE_URL" | grep -q -- '-pooler'; then
  echo "ERROR: DATABASE_URL appears to be a pooled connection (hostname contains '-pooler'). Use the direct (non-pooler) endpoint for pg_dump." >&2
  exit 1
fi

if [ -z "${AGE_RECIPIENT:-}" ]; then
  echo "ERROR: AGE_RECIPIENT not set -- refusing to produce a backup with no encryption recipient" >&2
  exit 1
fi
if ! [[ "$AGE_RECIPIENT" =~ ^age1[a-z0-9]{20,}$ ]]; then
  echo "ERROR: AGE_RECIPIENT does not look like an age public recipient (expected 'age1...')" >&2
  exit 1
fi

for v in R2_ENDPOINT R2_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  if [ -z "${!v:-}" ]; then
    echo "ERROR: $v not set" >&2
    exit 1
  fi
done
if ! [[ "$R2_BUCKET" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
  echo "ERROR: R2_BUCKET does not look like a valid bucket name" >&2
  exit 1
fi
if ! [[ "$R2_ENDPOINT" =~ ^https://[a-z0-9]+\.r2\.cloudflarestorage\.com/?$ ]]; then
  echo "ERROR: R2_ENDPOINT does not look like a Cloudflare R2 account endpoint" >&2
  exit 1
fi
R2_ENDPOINT="${R2_ENDPOINT%/}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found on PATH" >&2
  exit 1
fi
if ! command -v age >/dev/null 2>&1; then
  echo "ERROR: age not found on PATH" >&2
  exit 1
fi
if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI not found on PATH" >&2
  exit 1
fi

PG_DUMP_VERSION="$(pg_dump --version)"
echo "Using: $PG_DUMP_VERSION"

# --- 3. pg_dump | gzip | age, streamed. No plaintext SQL and no unencrypted gzip ever touch disk;
# only the final, already-encrypted bytes are written, directly to $ENCRYPTED_FILE. ---
START_TIME=$(date +%s)
if pg_dump \
  "$DATABASE_URL" \
  --verbose \
  --format=plain \
  --no-owner \
  --no-acl \
  --blobs \
  2> "$PG_DUMP_STDERR" \
  | gzip -9 \
  | age -r "$AGE_RECIPIENT" \
  > "$ENCRYPTED_FILE"; then
  # ROOT-CAUSE: $PIPESTATUS is overwritten by bash after EVERY pipeline it runs -- including a
  # trivial single-command one. Reading it on a line AFTER this if/else (once per branch, as
  # originally written) would have read the status of `PIPE_OK=1`/`PIPE_OK=0` itself, not of the
  # pg_dump|gzip|age pipeline above. Captured here, as the first statement in each branch, before
  # anything else runs. Confirmed directly: without this fix, PIPE_STATUSES has exactly ONE
  # element here (from the trivial assignment) instead of three, and `${PIPE_STATUSES[1]}` is an
  # unbound-variable error under `set -u`.
  PIPE_STATUSES=("${PIPESTATUS[@]}")
  PIPE_OK=1
else
  PIPE_STATUSES=("${PIPESTATUS[@]}")
  PIPE_OK=0
fi
if [ "$PIPE_OK" -ne 1 ] || [ "${PIPE_STATUSES[0]}" -ne 0 ] || [ "${PIPE_STATUSES[1]}" -ne 0 ] || [ "${PIPE_STATUSES[2]}" -ne 0 ]; then
  echo "ERROR: backup pipeline failed (pg_dump=${PIPE_STATUSES[0]:-?} gzip=${PIPE_STATUSES[1]:-?} age=${PIPE_STATUSES[2]:-?})" >&2
  echo "--- last 40 lines of pg_dump stderr (never contains DATABASE_URL or credentials) ---" >&2
  tail -n 40 "$PG_DUMP_STDERR" >&2 || true
  exit 1
fi
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

ENCRYPTED_SIZE=$(wc -c < "$ENCRYPTED_FILE" | tr -d ' ')
if [ "$ENCRYPTED_SIZE" -eq 0 ]; then
  echo "ERROR: encrypted backup file is empty; refusing to upload" >&2
  exit 1
fi
echo "Backup pipeline completed in ${DURATION}s, encrypted size ${ENCRYPTED_SIZE} bytes"

# --- 4. SHA-256 over the FINAL ENCRYPTED object only ---
CHECKSUM=$(sha256sum "$ENCRYPTED_FILE" | awk '{print $1}')
echo "$CHECKSUM" > "$CHECKSUM_FILE"
echo "Checksum (of the encrypted object): $CHECKSUM"

# --- Non-sensitive manifest. Never contains a database URL, password, token, or customer data. ---
cat > "$MANIFEST_FILE" <<EOF
{
  "backup_format_version": "1",
  "timestamp_utc": "$(date -u -d "@$START_TIME" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r "$START_TIME" +%Y-%m-%dT%H:%M:%SZ)",
  "source_commit_sha": "${GITHUB_SHA:-unknown}",
  "postgres_client_version": "$PG_DUMP_VERSION",
  "encrypted_object_name": "$OBJECT_NAME",
  "encrypted_object_size_bytes": $ENCRYPTED_SIZE,
  "sha256": "$CHECKSUM"
}
EOF
echo "Manifest:"
cat "$MANIFEST_FILE"

# --- 5. Private R2 upload (S3-compatible API), CREATE-ONCE. Credentials are read by the aws CLI
# from the AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY environment only -- never placed on the
# command line, never printed. Endpoint and bucket are always explicit.
#
# CREATE-ONCE MECHANISM: `aws s3api put-object --if-none-match '*'` is a Cloudflare-confirmed,
# officially supported S3-compatible conditional-write primitive -- not an invented header. Per
# Cloudflare's own S3-compatibility documentation, conditional headers on PutObject (If-Match,
# If-None-Match, If-Modified-Since, If-Unmodified-Since) "are evaluated atomically against the
# committed bucket state, as part of the same write that commits the object," and when multiple
# clients concurrently PutObject the same previously-absent key with `If-None-Match: *`, "at most
# one write succeeds and the others fail with 412 PreconditionFailed." This gives true
# create-once/overwrite-proof semantics: a second write to an already-existing key is rejected by
# R2 itself, atomically, not by a racy read-then-write check in this script.
#
# TRADEOFF (see Section 17 / MULTIPART_BACKUP_SAFE in the final audit): `s3api put-object` is a
# single, non-multipart PUT, capped by R2 at 5 GiB per object (Cloudflare's documented single-PUT
# limit). The higher-level `aws s3 cp` used previously auto-switches to multipart for large files,
# but multipart uploads cannot carry the same simple, Cloudflare-confirmed If-None-Match semantics
# used here, so switching back to `aws s3 cp` would silently drop create-once protection for large
# backups. This script deliberately keeps create-once protection and accepts that an
# encrypted backup exceeding 5 GiB fails closed (a non-zero aws exit under `set -e`) rather than
# uploading without overwrite protection. Do not reintroduce `aws s3 cp` here to "fix" that without
# an explicit, owner-reviewed design change for multipart + conditional writes.
upload_create_once() {
  local local_file="$1"
  local key="$2"
  local stderr_file="$WORKDIR/put-object-stderr-$$-${RANDOM}.log"
  if ! aws s3api put-object \
    --endpoint-url "$R2_ENDPOINT" \
    --bucket "$R2_BUCKET" \
    --key "$key" \
    --body "$local_file" \
    --if-none-match '*' \
    >/dev/null 2>"$stderr_file"; then
    # Match the actual AWS/S3-compatible error code text only (AWS CLI's real stderr for this
    # case already contains the literal string "PreconditionFailed") -- a bare "412" substring
    # was previously also matched and is too loose: an unrelated failure (AccessDenied, a request
    # ID, a timestamp) could coincidentally contain "412" and be misreported as a create-once
    # violation instead of surfacing its real cause.
    if grep -qi 'PreconditionFailed' "$stderr_file"; then
      echo "ERROR: object already exists at s3://${R2_BUCKET}/${key} -- refusing to overwrite (create-once violated)" >&2
    else
      echo "ERROR: upload failed for s3://${R2_BUCKET}/${key}" >&2
      cat "$stderr_file" >&2 || true
    fi
    return 1
  fi
  return 0
}

UPLOAD_KEY_BACKUP="${R2_OBJECT_PREFIX}${OBJECT_NAME}"
UPLOAD_KEY_CHECKSUM="${R2_OBJECT_PREFIX}${CHECKSUM_NAME}"
UPLOAD_KEY_MANIFEST="${R2_OBJECT_PREFIX}${MANIFEST_NAME}"

upload_create_once "$ENCRYPTED_FILE" "$UPLOAD_KEY_BACKUP"
upload_create_once "$CHECKSUM_FILE" "$UPLOAD_KEY_CHECKSUM"
upload_create_once "$MANIFEST_FILE" "$UPLOAD_KEY_MANIFEST"
echo "Uploaded encrypted backup, checksum, and manifest to s3://${R2_BUCKET}/${R2_OBJECT_PREFIX} (create-once)"

# --- 6. Post-upload verification via HEAD only, for ALL THREE objects (backup, checksum, AND
# manifest -- the manifest was previously never verified after upload). Never downloads the object
# to "verify" it; that would recreate exactly the readable-payload-in-transit risk this design
# avoids. ---
HEAD_JSON=$(aws s3api head-object --endpoint-url "$R2_ENDPOINT" --bucket "$R2_BUCKET" --key "$UPLOAD_KEY_BACKUP")
REMOTE_SIZE=$(echo "$HEAD_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{console.log(JSON.parse(d).ContentLength)}catch{console.log("")}})')
if [ -z "$REMOTE_SIZE" ] || [ "$REMOTE_SIZE" != "$ENCRYPTED_SIZE" ]; then
  echo "ERROR: post-upload verification failed -- remote object size '$REMOTE_SIZE' does not match local encrypted size '$ENCRYPTED_SIZE'" >&2
  exit 1
fi
if ! aws s3api head-object --endpoint-url "$R2_ENDPOINT" --bucket "$R2_BUCKET" --key "$UPLOAD_KEY_CHECKSUM" >/dev/null; then
  echo "ERROR: post-upload verification failed -- checksum object not found at s3://${R2_BUCKET}/${UPLOAD_KEY_CHECKSUM}" >&2
  exit 1
fi
MANIFEST_SIZE=$(wc -c < "$MANIFEST_FILE" | tr -d ' ')
MANIFEST_HEAD_JSON=$(aws s3api head-object --endpoint-url "$R2_ENDPOINT" --bucket "$R2_BUCKET" --key "$UPLOAD_KEY_MANIFEST")
REMOTE_MANIFEST_SIZE=$(echo "$MANIFEST_HEAD_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{console.log(JSON.parse(d).ContentLength)}catch{console.log("")}})')
if [ -z "$REMOTE_MANIFEST_SIZE" ] || [ "$REMOTE_MANIFEST_SIZE" != "$MANIFEST_SIZE" ]; then
  echo "ERROR: post-upload verification failed -- remote manifest size '$REMOTE_MANIFEST_SIZE' does not match local manifest size '$MANIFEST_SIZE'" >&2
  exit 1
fi
echo "POST_UPLOAD_VERIFICATION=PASS (backup size $REMOTE_SIZE bytes, manifest size $REMOTE_MANIFEST_SIZE bytes, checksum object present -- all three verified)"
echo "BACKUP_COMPLETE object=${UPLOAD_KEY_BACKUP} size=${ENCRYPTED_SIZE} sha256=${CHECKSUM}"
