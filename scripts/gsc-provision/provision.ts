/**
 * Dedicated, narrowly scoped provisioning of the `opsiq_gsc_ingestion` Postgres role and its GitHub
 * environment-secret ciphertext. Runs ONLY inside .github/workflows/provision-gsc-ingestion-credential.yml
 * (environment: production-operator). It is NOT a general SQL runner: it accepts no SQL from any input.
 *
 * Credential rules (see docs/opsiq/ci/GSC_INGESTION_CREDENTIAL_PROVISIONING.md):
 *  - the role password is generated here, in memory, with a CSPRNG, and exists only in this process;
 *  - it is never printed, never an argument, never written in plaintext, never in an error message;
 *  - the only credential-derived output is the libsodium sealed-box ciphertext, encrypted to the PINNED
 *    `gsc-ingestion` environment public key below (there is NO key input and any override is refused), written to a
 *    0600 file under RUNNER_TEMP; stdout carries fixed status tokens only.
 *
 * State machine (recorded in the database as the role's comment, `GSCPROV1 {json}`):
 *   (absent) --CREATE--> PROVISIONED(NOLOGIN) --ACTIVATE--> ACTIVATED(LOGIN) --DEACTIVATE--> DEACTIVATED(NOLOGIN)
 *   DEACTIVATED/PROVISIONED(NOLOGIN) --RECOVER_NOLOGIN--> PROVISIONED(gen+1)   (RECOVER refuses any LOGIN role)
 * ACTIVATE is mechanically bound to the CREATE/RECOVER run id, the exact commit, the pinned key digest and the
 * sealed artifact digest; LOGIN is enabled and audited inside ONE transaction and committed only if the audit passes.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

export const ROLE = "opsiq_gsc_ingestion";
export const EXPECTED = Object.freeze({
  endpointId: "ep-empty-sky-ay1e6c27",
  projectId: "patient-lake-61323111",
  branchId: "br-purple-boat-ayjn6zl6",
  database: "neondb",
});

/**
 * Authoritative `gsc-ingestion` environment public key, fetched via GitHub's "get an environment public key" API
 * (through the approved Composio connection) and pinned here. The public key is not secret. A rotation REQUIRES a
 * reviewed change to this constant (and its digest): see the runbook. Nothing at run time may supply a key.
 */
export interface PinnedKey {
  keyId: string;
  publicKey: string;
  sha256: string;
}
export const PINNED_KEY: PinnedKey = Object.freeze({
  keyId: "3380204578043523366",
  publicKey: "HsJa4DyZdtuAROPfT/3RG6HzIMcrqrBZ8zjRNMkbogE=",
  sha256: "ea04e999911d9003e9447af6060be84b09be3c0413854ee41a7d4a105e378d70",
});

export const MODES = ["DRY_RUN", "CREATE", "RECOVER_NOLOGIN", "ACTIVATE", "DEACTIVATE"] as const;
export type Mode = (typeof MODES)[number];
export const CONFIRM: Record<Exclude<Mode, "DRY_RUN">, string> = {
  CREATE: "CREATE GSC INGESTION ROLE",
  RECOVER_NOLOGIN: "RECOVER GSC INGESTION ROLE",
  ACTIVATE: "ACTIVATE GSC INGESTION ROLE",
  DEACTIVATE: "DEACTIVATE GSC INGESTION ROLE",
};

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
export const pinDigest = (k: { keyId: string; publicKey: string }) => sha256Hex(`${k.keyId}\n${k.publicKey}`);

/** Violations in a pinned key (format and self-consistent digest). Empty = usable. */
export function pinnedKeyViolations(k: Partial<PinnedKey> | undefined): string[] {
  const v: string[] = [];
  if (!k || typeof k.keyId !== "string" || typeof k.publicKey !== "string" || typeof k.sha256 !== "string") return ["pinned_key_missing"];
  if (!/^[0-9]{1,32}$/.test(k.keyId)) v.push("pinned_key_id_format");
  let ok = false;
  try {
    ok = /^[A-Za-z0-9+/]{43}=$/.test(k.publicKey) && Buffer.from(k.publicKey, "base64").length === 32;
  } catch {
    ok = false;
  }
  if (!ok) v.push("pinned_public_key_format");
  if (!v.length && pinDigest({ keyId: k.keyId, publicKey: k.publicKey }) !== k.sha256) v.push("pinned_key_digest_mismatch");
  return v;
}

/** Substitution defence: no environment variable may supply or override the recipient key. */
export function recipientOverrideViolations(env: NodeJS.ProcessEnv): string[] {
  return ["GSC_ENV_PUBLIC_KEY", "GSC_ENV_KEY_ID", "GSC_PUBLIC_KEY", "GSC_KEY_ID"].some((k) => env[k] !== undefined && env[k] !== "")
    ? ["recipient_key_override_refused"]
    : [];
}

export interface InputCheck {
  mode: string;
  confirm: string;
  expectedSha: string;
  headSha: string;
  expectedRunId: string;
  expectedArtifactSha: string;
  runId: string;
}

/** Pure input validation. Returns violation tokens (empty = OK). */
export function validateInputs(i: InputCheck): string[] {
  const v: string[] = [];
  const known = (MODES as readonly string[]).includes(i.mode);
  if (!known) v.push("mode_invalid");
  if (!/^[0-9a-f]{40}$/.test(i.expectedSha)) v.push("expected_sha_format");
  if (!/^[0-9a-f]{40}$/.test(i.headSha) || i.headSha !== i.expectedSha) v.push("sha_mismatch");
  if (known && i.mode !== "DRY_RUN") {
    if (i.confirm !== CONFIRM[i.mode as Exclude<Mode, "DRY_RUN">]) v.push("confirm_phrase");
    if (!/^[0-9]{1,20}$/.test(i.runId)) v.push("github_run_id_missing");
  }
  if (i.mode === "ACTIVATE") {
    if (!/^[0-9]{1,20}$/.test(i.expectedRunId)) v.push("expected_run_id_format");
    if (!/^[0-9a-f]{64}$/.test(i.expectedArtifactSha)) v.push("expected_artifact_sha_format");
  }
  return v;
}

export function generatePassword(): string {
  return randomBytes(32).toString("base64url"); // 256 bits, URL-safe alphabet [A-Za-z0-9_-]
}

export function buildConnectionUrl(host: string, password: string): string {
  if (!/^[a-z0-9.-]+$/i.test(host) || host.includes("-pooler")) throw new Error("host_invalid");
  if (!/^[A-Za-z0-9_-]{20,}$/.test(password)) throw new Error("password_shape");
  return `postgresql://${ROLE}:${password}@${host}/${EXPECTED.database}?sslmode=require`;
}

type Sodium = {
  ready: Promise<void>;
  crypto_box_seal(m: Uint8Array, pk: Uint8Array): Uint8Array;
  from_base64(s: string, v: number): Uint8Array;
  from_string(s: string): Uint8Array;
  to_base64(b: Uint8Array, v: number): string;
  base64_variants: { ORIGINAL: number };
};

/** GitHub's documented format: libsodium crypto_box_seal to the environment public key (base64). */
export async function sealForGithub(plaintext: string, publicKeyB64: string, sodiumLib?: Sodium): Promise<string> {
  const sodium = sodiumLib ?? ((await import("libsodium-wrappers")) as unknown as { default: Sodium }).default;
  await sodium.ready;
  const key = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
  const sealed = sodium.crypto_box_seal(sodium.from_string(plaintext), key);
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}

// ---- provisioning state (role comment) ----
export interface ProvState {
  gen: number;
  run: string;
  sha: string;
  key: string; // first 16 hex of the pinned-key digest
  art: string; // sealed artifact sha256, or "PENDING" until sealed
  state: "PROVISIONED" | "ACTIVATED" | "DEACTIVATED";
  act?: string; // activation run id
}
const STATE_PREFIX = "GSCPROV1 ";
export const formatState = (s: ProvState) => STATE_PREFIX + JSON.stringify(s);
export function parseState(comment: string | null | undefined): ProvState | null {
  if (typeof comment !== "string" || !comment.startsWith(STATE_PREFIX)) return null;
  try {
    const s = JSON.parse(comment.slice(STATE_PREFIX.length)) as ProvState;
    const ok =
      Number.isInteger(s.gen) && s.gen >= 1 && /^[0-9]{1,20}$/.test(s.run) && /^[0-9a-f]{40}$/.test(s.sha) && /^[0-9a-f]{16}$/.test(s.key) &&
      (s.art === "PENDING" || /^[0-9a-f]{64}$/.test(s.art)) && ["PROVISIONED", "ACTIVATED", "DEACTIVATED"].includes(s.state);
    return ok ? s : null;
  } catch {
    return null;
  }
}

export interface AuditRow {
  role_exists: number;
  can_login: boolean;
  is_superuser: boolean;
  can_create_role: boolean;
  can_create_db: boolean;
  can_replicate: boolean;
  bypasses_rls: boolean;
  conn_limit: number;
  memberships: number;
  set_role_grants: number;
  unexpected_members_of_role: number;
  operator_can_administer: boolean;
  owned_objects: number;
  db_connect: boolean;
  db_create: boolean;
  schema_usage: boolean;
  schemas_with_create: number;
  target_found: number;
  t_select: boolean;
  t_insert: boolean;
  t_update: boolean;
  t_extra: boolean;
  other_table_access: number;
  other_column_access: number;
  sequence_access: number;
  secdef_executable: number;
  role_settings: string;
}

/** Pure evaluation of the effective-privilege audit row. Empty array = isolation verified. */
export function evaluateAudit(r: AuditRow, expectLogin: boolean): string[] {
  const v: string[] = [];
  if (r.role_exists !== 1) return ["role_missing"];
  if (r.can_login !== expectLogin) v.push(expectLogin ? "login_not_enabled" : "login_enabled_unexpectedly");
  if (r.is_superuser || r.can_create_role || r.can_create_db || r.can_replicate || r.bypasses_rls) v.push("elevated_attribute");
  if (r.conn_limit !== 2) v.push("connection_limit");
  if (r.memberships !== 0) v.push("role_membership");
  if (r.set_role_grants !== 0) v.push("set_role_grant");
  if (r.unexpected_members_of_role !== 0) v.push("unexpected_role_member");
  if (!r.operator_can_administer) v.push("operator_cannot_administer");
  if (r.owned_objects !== 0) v.push("owns_objects");
  if (!r.db_connect) v.push("no_connect");
  if (r.db_create) v.push("database_create");
  if (!r.schema_usage) v.push("no_schema_usage");
  if (r.schemas_with_create !== 0) v.push("schema_create");
  if (r.target_found !== 1) v.push("target_missing");
  if (!r.t_select || !r.t_insert || !r.t_update) v.push("target_privileges_missing");
  if (r.t_extra) v.push("target_extra_privileges");
  if (r.other_table_access !== 0) v.push("other_table_access");
  if (r.other_column_access !== 0) v.push("other_column_access");
  if (r.sequence_access !== 0) v.push("sequence_access");
  if (r.secdef_executable !== 0) v.push("security_definer_executable");
  if (!/(^|;)idle_in_transaction_session_timeout=60s(;|$)/.test(r.role_settings)) v.push("idle_timeout");
  return v;
}

/** Never returns a driver/server message (it can echo a statement or a host). */
export function sanitizeError(e: unknown): string {
  const code = typeof (e as { code?: unknown })?.code === "string" ? (e as { code: string }).code : "";
  return /^[A-Za-z0-9_]{1,16}$/.test(code) ? `code=${code}` : "code=none";
}

export function identityViolations(row: Record<string, unknown>): string[] {
  const v: string[] = [];
  if (row.endpoint_id !== EXPECTED.endpointId) v.push("endpoint_mismatch");
  if (row.project_id !== EXPECTED.projectId) v.push("project_mismatch");
  if (row.branch_id !== EXPECTED.branchId) v.push("branch_mismatch");
  if (row.db !== EXPECTED.database) v.push("database_mismatch");
  return v;
}

// ---- runtime ----
export interface Db {
  connect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  escapeLiteral(s: string): string;
  end(): Promise<void>;
}
export interface Deps {
  newClient: (cfg: ConstructorParameters<typeof Client>[0]) => Db;
  pin: PinnedKey;
  auditSql: () => string;
  password: () => string;
  writeSealed: (file: string, content: string) => void;
  out: (line: string) => void;
}
/**
 * pg emits an 'error' EVENT (not a query rejection) when the server drops an idle/terminated connection; unhandled, it crashes the
 * process with a raw error object. The failing query still rejects, so swallowing the event loses nothing and keeps all output sanitized.
 */
export function createPgClient(cfg: ConstructorParameters<typeof Client>[0]): Db {
  const c = new Client(cfg);
  c.on("error", () => undefined);
  return c as unknown as Db;
}
const defaultDeps = (): Deps => ({
  newClient: createPgClient,
  pin: PINNED_KEY,
  auditSql: () => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "audit.sql"), "utf8"),
  password: generatePassword,
  writeSealed: (file, content) => writeFileSync(file, content, { mode: 0o600 }),
  out: (line) => void process.stdout.write(line + "\n"),
});

/** Exit codes: 0 verified success; 1 refused/failed (state verified or unchanged); 2 refused input; 3 UNCERTAIN state, run DRY_RUN. */
export async function main(env: NodeJS.ProcessEnv = process.env, overrides: Partial<Deps> = {}): Promise<number> {
  const d: Deps = { ...defaultDeps(), ...overrides };
  const out = d.out;
  const mode = env.GSC_MODE ?? "";
  const runId = env.GITHUB_RUN_ID ?? "";
  const refusals = [
    ...validateInputs({
      mode,
      confirm: env.GSC_CONFIRM ?? "",
      expectedSha: env.GSC_EXPECTED_SHA ?? "",
      headSha: env.GSC_HEAD_SHA ?? "",
      expectedRunId: env.GSC_EXPECTED_RUN_ID ?? "",
      expectedArtifactSha: env.GSC_EXPECTED_ARTIFACT_SHA ?? "",
      runId,
    }),
    ...recipientOverrideViolations(env),
    ...pinnedKeyViolations(d.pin),
  ];
  if (refusals.length) {
    out(`PROVISION=REFUSED reason=${refusals.join(",")}`);
    return 2;
  }
  const headSha = env.GSC_HEAD_SHA as string;
  const keyTag = pinDigest(d.pin).slice(0, 16);

  const rawUrl = env.DATABASE_URL ?? "";
  delete env.DATABASE_URL;
  const expectedHost = (env.GSC_EXPECTED_HOST ?? "").toLowerCase();
  let host = "";
  let cfg: ConstructorParameters<typeof Client>[0];
  try {
    const u = new URL(rawUrl);
    host = u.hostname.toLowerCase();
    if (!/^postgres(ql)?:$/.test(u.protocol) || host !== expectedHost || host.includes("-pooler")) {
      out("PROVISION=REFUSED reason=database_host_gate");
      return 2;
    }
    cfg = {
      host,
      port: u.port ? Number(u.port) : 5432,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ""),
      ssl: { rejectUnauthorized: true, servername: host },
      statement_timeout: 30_000,
      query_timeout: 35_000,
      connectionTimeoutMillis: 15_000,
    };
  } catch {
    out("PROVISION=REFUSED reason=database_url_invalid");
    return 2;
  }

  const client = d.newClient(cfg);
  let stage = "connect";
  let password = "";
  let inTxn = false;
  let commitSent = false;
  try {
    await client.connect();
    stage = "identity";
    const id = (
      await client.query(
        "SELECT current_setting('neon.endpoint_id', true) AS endpoint_id, current_setting('neon.project_id', true) AS project_id, " +
          "current_setting('neon.branch_id', true) AS branch_id, current_database() AS db",
      )
    ).rows[0];
    const idv = identityViolations(id);
    out(`PRODUCTION_IDENTITY=${idv.length ? "FAIL " + idv.join(",") : "PASS"}`);
    if (idv.length) return 1;
    if (mode === "DRY_RUN") await client.query("SET default_transaction_read_only = on");

    stage = "capability";
    const cap = (
      await client.query(
        "SELECT r.rolcreaterole OR r.rolsuper AS can_create, pg_has_role(current_user, t.relowner, 'USAGE') AS owns_target, " +
          "(SELECT count(*) FROM pg_roles WHERE rolname = $1)::int AS role_exists, " +
          "(SELECT rolcanlogin FROM pg_roles WHERE rolname = $1) AS role_login, " +
          "(SELECT shobj_description(oid, 'pg_authid') FROM pg_roles WHERE rolname = $1) AS role_comment " +
          "FROM pg_roles r, pg_class t WHERE r.rolname = current_user AND t.oid = to_regclass('public.search_console_metrics')",
        [ROLE],
      )
    ).rows[0];
    out(`OPERATOR_CAN_CREATE_ROLE=${cap?.can_create === true}`);
    out(`OPERATOR_OWNS_TARGET=${cap?.owns_target === true}`);
    if (!cap || cap.can_create !== true || cap.owns_target !== true) {
      out("DRY_RUN_RESULT=UNKNOWN_STATE reason=operator_capability");
      return 1;
    }
    const exists = cap.role_exists === 1;
    const isLogin = cap.role_login === true;
    const rec = parseState(cap.role_comment as string | null);
    out(`ROLE_EXISTS=${exists}`);
    const audit = async (c: Db, expectLogin: boolean) => evaluateAudit((await c.query(d.auditSql())).rows[0] as unknown as AuditRow, expectLogin);
    const fmt = (v: string[]) => (v.length ? "FAIL " + v.join(",") : "PASS");

    stage = "lock";
    const lock = (await client.query("SELECT pg_try_advisory_lock(hashtext('opsiq_production_role_operations')) AS got")).rows[0];
    if (lock?.got !== true) {
      out("PROVISION=REFUSED reason=role_operation_in_progress");
      return 1;
    }

    // ---------- DRY_RUN: classify; exit 0 only when the intended next step is safe ----------
    if (mode === "DRY_RUN") {
      if (!exists) {
        out("DRY_RUN_RESULT=CREATE_READY");
        return 0;
      }
      stage = "audit";
      const v = await audit(client, isLogin);
      out(`ROLE_AUDIT=${fmt(v)}`);
      if (v.length) {
        out("DRY_RUN_RESULT=UNEXPECTED_PRIVILEGES");
        return 1;
      }
      if (!rec) {
        out("DRY_RUN_RESULT=UNKNOWN_STATE reason=no_valid_provisioning_record");
        return 1;
      }
      out(`PROVISION_STATE=${rec.state} GEN=${rec.gen} ARTIFACT_SEALED=${rec.art !== "PENDING"}`);
      if (!isLogin && rec.state === "PROVISIONED" && rec.art !== "PENDING") out("DRY_RUN_RESULT=ACTIVATE_READY");
      else if (!isLogin && (rec.state === "DEACTIVATED" || (rec.state === "PROVISIONED" && rec.art === "PENDING"))) out("DRY_RUN_RESULT=RECOVER_CANDIDATE");
      else if (isLogin && rec.state === "ACTIVATED") out("DRY_RUN_RESULT=HEALTHY_ACTIVE");
      else {
        out("DRY_RUN_RESULT=UNKNOWN_STATE reason=login_and_record_disagree");
        return 1;
      }
      return 0;
    }

    // ---------- DEACTIVATE ----------
    if (mode === "DEACTIVATE") {
      if (!exists || !isLogin || !rec) {
        out("PROVISION=REFUSED reason=deactivate_requires_active_recorded_role");
        return 1;
      }
      stage = "deactivate";
      inTxn = true;
      await client.query("BEGIN");
      await client.query(`ALTER ROLE ${ROLE} NOLOGIN`);
      await client.query(`COMMENT ON ROLE ${ROLE} IS ${client.escapeLiteral(formatState({ ...rec, state: "DEACTIVATED" }))}`);
      commitSent = true;
      await client.query("COMMIT");
      inTxn = false;
      out("ROLE_LOGIN_ENABLED=false");
      out("PROVISION=DEACTIVATED");
      return 0;
    }

    // ---------- ACTIVATE: bound to the CREATE/RECOVER run; audit inside the same transaction ----------
    if (mode === "ACTIVATE") {
      const bad: string[] = [];
      if (!exists) bad.push("role_absent");
      if (exists && isLogin) bad.push("already_login");
      if (!rec) bad.push("no_valid_provisioning_record");
      if (rec) {
        if (rec.state !== "PROVISIONED") bad.push("state_not_provisioned");
        if (rec.run !== env.GSC_EXPECTED_RUN_ID) bad.push("run_id_mismatch");
        if (rec.art !== env.GSC_EXPECTED_ARTIFACT_SHA) bad.push("artifact_sha_mismatch_or_stale");
        if (rec.sha !== headSha) bad.push("commit_mismatch");
        if (rec.key !== keyTag) bad.push("pinned_key_mismatch");
      }
      if (bad.length) {
        out(`PROVISION=REFUSED reason=${bad.join(",")}`);
        return 1;
      }
      const next = formatState({ ...(rec as ProvState), state: "ACTIVATED", act: runId });
      stage = "pre_audit";
      const pre = await audit(client, false);
      if (pre.length) {
        out(`ROLE_AUDIT=FAIL ${pre.join(",")}`);
        return 1;
      }
      stage = "begin";
      inTxn = true;
      await client.query("BEGIN");
      stage = "alter_login";
      await client.query(`ALTER ROLE ${ROLE} LOGIN`);
      await client.query(`COMMENT ON ROLE ${ROLE} IS ${client.escapeLiteral(next)}`);
      stage = "post_audit";
      const post = await audit(client, true);
      if (post.length) {
        await client.query("ROLLBACK");
        inTxn = false;
        out(`ROLE_AUDIT=FAIL ${post.join(",")} ROLE_STATE=NOLOGIN_ROLLED_BACK`);
        return 1;
      }
      stage = "commit";
      commitSent = true;
      await client.query("COMMIT");
      inTxn = false;
      out("ROLE_AUDIT=PASS");
      out("ROLE_LOGIN_ENABLED=true");
      out("PROVISION=ACTIVATED");
      return 0;
    }

    // ---------- CREATE / RECOVER_NOLOGIN ----------
    if (mode === "CREATE" && exists) {
      out("PROVISION=REFUSED reason=role_already_exists");
      return 1;
    }
    if (mode === "RECOVER_NOLOGIN") {
      const bad: string[] = [];
      if (!exists) bad.push("role_absent");
      if (exists && isLogin) bad.push("role_is_login_use_deactivate_first");
      if (!rec) bad.push("no_valid_provisioning_record");
      if (rec && rec.state === "ACTIVATED") bad.push("state_activated");
      if (bad.length) {
        out(`PROVISION=REFUSED reason=${bad.join(",")}`);
        return 1;
      }
      stage = "pre_audit";
      const pre = await audit(client, false);
      if (pre.length) {
        out(`ROLE_AUDIT=FAIL ${pre.join(",")}`);
        return 1; // never reset the credential of a role that is not in the expected state
      }
    }
    const gen = mode === "RECOVER_NOLOGIN" && rec ? rec.gen + 1 : 1;
    const base: ProvState = { gen, run: runId, sha: headSha, key: keyTag, art: "PENDING", state: "PROVISIONED" };
    password = d.password();
    const lit = client.escapeLiteral(password);
    stage = "role";
    if (mode === "CREATE") {
      await client.query(
        `CREATE ROLE ${ROLE} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT CONNECTION LIMIT 2 PASSWORD ${lit}`,
      );
      stage = "grants";
      await client.query(`GRANT CONNECT ON DATABASE ${EXPECTED.database} TO ${ROLE}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE ON TABLE public.search_console_metrics TO ${ROLE}`);
      await client.query(`ALTER ROLE ${ROLE} SET idle_in_transaction_session_timeout = '60s'`);
    } else {
      await client.query(`ALTER ROLE ${ROLE} PASSWORD ${lit}`);
    }
    stage = "record";
    await client.query(`COMMENT ON ROLE ${ROLE} IS ${client.escapeLiteral(formatState(base))}`);
    stage = "audit";
    const v = await audit(client, false);
    out(`ROLE_AUDIT=${fmt(v)}`);
    if (v.length) {
      out("ROLE_STATE=NOLOGIN_LEFT_IN_PLACE ARTIFACT=NOT_WRITTEN");
      return 1;
    }
    stage = "seal";
    const sealedValue = await sealForGithub(buildConnectionUrl(host, password), d.pin.publicKey);
    const artSha = sha256Hex(sealedValue);
    const target = path.resolve(env.GSC_SEALED_OUT ?? "");
    const tmp = path.resolve(env.RUNNER_TEMP ?? "/nonexistent");
    if (!target.startsWith(tmp + path.sep)) throw new Error("sealed_out_path");
    d.writeSealed(
      target,
      JSON.stringify({ schema: "GSCPROV1", run_id: runId, sha: headSha, gen, key_id: d.pin.keyId, key_sha256: pinDigest(d.pin), sealed_sha256: artSha, encrypted_value: sealedValue }),
    );
    stage = "record_artifact";
    await client.query(`COMMENT ON ROLE ${ROLE} IS ${client.escapeLiteral(formatState({ ...base, art: artSha }))}`);
    out(`PROVISION_RUN_ID=${runId}`);
    out(`PROVISION_GEN=${gen}`);
    out(`PINNED_KEY_ID=${d.pin.keyId}`);
    out(`PINNED_KEY_SHA256=${pinDigest(d.pin)}`);
    out(`SEALED_ARTIFACT_SHA256=${artSha}`);
    out("SEALED_CREDENTIAL_WRITTEN=true");
    out("ROLE_LOGIN_ENABLED=false");
    out("PROVISION=CREATED_NOLOGIN");
    return 0;
  } catch (e) {
    out(`PROVISION=FAILED stage=${stage} ${sanitizeError(e)}`);
    if (inTxn) {
      try {
        await client.query("ROLLBACK"); // best effort; a dropped connection already aborts the transaction server-side
      } catch {
        /* connection gone */
      }
    }
    if (mode === "ACTIVATE" || mode === "DEACTIVATE") return reconcile(d, cfg!, mode, commitSent, out);
    return 1;
  } finally {
    password = "";
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

/**
 * After a failure during ACTIVATE/DEACTIVATE, never guess: read the authoritative role state over a FRESH connection.
 * A failure before COMMIT leaves the transaction uncommitted (Postgres aborts it), so the state is the pre-transaction one;
 * a failure at/after COMMIT is genuinely uncertain until observed. If the state cannot be observed the outcome is UNCERTAIN (exit 3).
 */
async function reconcile(d: Deps, cfg: ConstructorParameters<typeof Client>[0], mode: Mode, commitSent: boolean, out: (l: string) => void): Promise<number> {
  const fresh = d.newClient(cfg);
  try {
    await fresh.connect();
    await fresh.query("SET default_transaction_read_only = on");
    const r = (
      await fresh.query("SELECT rolcanlogin AS login, shobj_description(oid, 'pg_authid') AS c FROM pg_roles WHERE rolname = $1", [ROLE])
    ).rows[0];
    if (!r) {
      out("ROLE_STATE_OBSERVED=ABSENT");
      return 1;
    }
    const observed = r.login === true ? "LOGIN" : "NOLOGIN";
    const rec = parseState(r.c as string | null);
    out(`ROLE_STATE_OBSERVED=${observed} RECORD_STATE=${rec?.state ?? "NONE"} COMMIT_ATTEMPTED=${commitSent}`);
    if (mode === "ACTIVATE" && observed === "LOGIN") {
      const v = evaluateAudit((await fresh.query(d.auditSql())).rows[0] as unknown as AuditRow, true);
      out(`ROLE_AUDIT=${v.length ? "FAIL " + v.join(",") : "PASS"}`);
      if (!v.length && rec?.state === "ACTIVATED") {
        out("ACTIVATE=UNCERTAIN_RESOLVED_ACTIVE_VERIFIED");
        return 0;
      }
      out("ACTIVATE=UNCERTAIN_LOGIN_UNVERIFIED RUN_DEACTIVATE");
      return 3;
    }
    if (mode === "DEACTIVATE") {
      out(observed === "NOLOGIN" ? "DEACTIVATE=RESOLVED_NOLOGIN_VERIFIED" : "DEACTIVATE=FAILED_STILL_LOGIN");
      return observed === "NOLOGIN" ? 0 : 1;
    }
    out("ACTIVATE=RESOLVED_NOLOGIN_VERIFIED");
    return 1;
  } catch {
    out("ROLE_STATE_OBSERVED=UNKNOWN ACTIVATE=UNCERTAIN_STATE_UNVERIFIED RUN_DRY_RUN");
    return 3;
  } finally {
    try {
      await fresh.end();
    } catch {
      /* ignore */
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  // Last resort: never let a raw error object reach the (public) log. The state is unknown, so the outcome is explicitly UNCERTAIN.
  const last = (e: unknown) => {
    process.stdout.write(`PROVISION=FAILED stage=uncaught ${sanitizeError(e)} STATE=UNCERTAIN RUN_DRY_RUN\n`);
    process.exit(3);
  };
  process.on("uncaughtException", last);
  process.on("unhandledRejection", last);
  main().then((c) => process.exit(c));
}
