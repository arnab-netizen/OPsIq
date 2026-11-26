/**
 * Dedicated, narrowly scoped provisioning of the `opsiq_gsc_ingestion` Postgres role and its GitHub
 * environment-secret ciphertext. Runs ONLY inside .github/workflows/provision-gsc-ingestion-credential.yml
 * (environment: production-operator). It is NOT a general SQL runner: it accepts no SQL from any input.
 *
 * Credential rules (see docs/opsiq/ci/GSC_INGESTION_CREDENTIAL_PROVISIONING.md):
 *  - the role password is generated here, in memory, with a CSPRNG, and exists only in this process;
 *  - it is never printed, never an argument, never written in plaintext, never in an error message;
 *  - the only credential-derived output is the libsodium sealed-box ciphertext (to the exact GitHub
 *    environment public key) written to a 0600 file under RUNNER_TEMP;
 *  - stdout carries fixed status tokens only.
 *
 * Staged activation: CREATE makes the role NOLOGIN; only ACTIVATE (a separate, separately approved run, after
 * the encrypted secret has been stored and its metadata verified) enables LOGIN. A failed transfer therefore
 * never leaves a usable login.
 */
import { randomBytes } from "node:crypto";
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
export const MODES = ["DRY_RUN", "CREATE", "RECOVER_NOLOGIN", "ACTIVATE"] as const;
export type Mode = (typeof MODES)[number];
export const CONFIRM: Record<Exclude<Mode, "DRY_RUN">, string> = {
  CREATE: "CREATE GSC INGESTION ROLE",
  RECOVER_NOLOGIN: "RECOVER GSC INGESTION ROLE",
  ACTIVATE: "ACTIVATE GSC INGESTION ROLE",
};

export interface InputCheck {
  mode: string;
  confirm: string;
  expectedSha: string;
  headSha: string;
  keyId: string;
  publicKey: string;
}

/** Pure input validation. Returns violation tokens (empty = OK). */
export function validateInputs(i: InputCheck): string[] {
  const v: string[] = [];
  if (!(MODES as readonly string[]).includes(i.mode)) v.push("mode_invalid");
  if (!/^[0-9a-f]{40}$/.test(i.expectedSha)) v.push("expected_sha_format");
  if (!/^[0-9a-f]{40}$/.test(i.headSha) || i.headSha !== i.expectedSha) v.push("sha_mismatch");
  if (i.mode !== "DRY_RUN" && (MODES as readonly string[]).includes(i.mode)) {
    if (i.confirm !== CONFIRM[i.mode as Exclude<Mode, "DRY_RUN">]) v.push("confirm_phrase");
  }
  if (i.mode === "CREATE" || i.mode === "RECOVER_NOLOGIN") {
    if (!/^[0-9]{1,32}$/.test(i.keyId)) v.push("key_id_format");
    let ok = false;
    try {
      ok = /^[A-Za-z0-9+/]{43}=$/.test(i.publicKey) && Buffer.from(i.publicKey, "base64").length === 32;
    } catch {
      ok = false;
    }
    if (!ok) v.push("public_key_format");
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
  members_of_role: number;
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
  if (r.members_of_role !== 0) v.push("role_has_members");
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

const out = (line: string) => process.stdout.write(line + "\n");

export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const mode = env.GSC_MODE ?? "";
  const inputViolations = validateInputs({
    mode,
    confirm: env.GSC_CONFIRM ?? "",
    expectedSha: env.GSC_EXPECTED_SHA ?? "",
    headSha: env.GSC_HEAD_SHA ?? "",
    keyId: env.GSC_ENV_KEY_ID ?? "",
    publicKey: env.GSC_ENV_PUBLIC_KEY ?? "",
  });
  if (inputViolations.length) {
    out(`PROVISION=REFUSED reason=${inputViolations.join(",")}`);
    return 2;
  }

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

  const client = new Client(cfg);
  let stage = "connect";
  let password = "";
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

    stage = "capability";
    const cap = (
      await client.query(
        "SELECT r.rolcreaterole OR r.rolsuper AS can_create, pg_has_role(current_user, t.relowner, 'USAGE') AS owns_target, " +
          "(SELECT count(*) FROM pg_roles WHERE rolname = $1)::int AS role_exists, " +
          "(SELECT rolcanlogin FROM pg_roles WHERE rolname = $1) AS role_login " +
          "FROM pg_roles r, pg_class t WHERE r.rolname = current_user AND t.oid = to_regclass('public.search_console_metrics')",
        [ROLE],
      )
    ).rows[0];
    out(`OPERATOR_CAN_CREATE_ROLE=${cap?.can_create === true}`);
    out(`OPERATOR_OWNS_TARGET=${cap?.owns_target === true}`);
    out(`ROLE_EXISTS=${cap?.role_exists === 1}`);
    if (!cap || cap.can_create !== true || cap.owns_target !== true) return 1;
    const exists = cap.role_exists === 1;
    const audit = async (expectLogin: boolean) => {
      const sql = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "audit.sql"), "utf8");
      return evaluateAudit((await client.query(sql)).rows[0] as AuditRow, expectLogin);
    };

    if (mode === "DRY_RUN") {
      if (exists) {
        const v = await audit(cap.role_login === true);
        out(`ROLE_AUDIT=${v.length ? "FAIL " + v.join(",") : "PASS"}`);
      }
      out("PROVISION=DRY_RUN_OK");
      return 0;
    }

    stage = "lock";
    await client.query("SELECT pg_advisory_lock(hashtext('opsiq_production_role_operations'))");

    if (mode === "ACTIVATE") {
      if (!exists) {
        out("PROVISION=REFUSED reason=role_absent");
        return 1;
      }
      stage = "pre_audit";
      const pre = await audit(false);
      if (pre.length) {
        out(`ROLE_AUDIT=FAIL ${pre.join(",")}`);
        return 1;
      }
      stage = "activate";
      await client.query(`ALTER ROLE ${ROLE} LOGIN`);
      stage = "post_audit";
      const post = await audit(true);
      if (post.length) {
        await client.query(`ALTER ROLE ${ROLE} NOLOGIN`);
        out(`ROLE_AUDIT=FAIL ${post.join(",")} ROLE_RESTORED_NOLOGIN=true`);
        return 1;
      }
      out("ROLE_AUDIT=PASS");
      out("ROLE_LOGIN_ENABLED=true");
      out("PROVISION=ACTIVATED");
      return 0;
    }

    // CREATE / RECOVER_NOLOGIN
    if (mode === "CREATE" && exists) {
      out("PROVISION=REFUSED reason=role_already_exists");
      return 1;
    }
    if (mode === "RECOVER_NOLOGIN" && (!exists || cap.role_login === true)) {
      out("PROVISION=REFUSED reason=recover_requires_existing_nologin_role");
      return 1;
    }
    password = generatePassword();
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
    stage = "audit";
    const v = await audit(false);
    out(`ROLE_AUDIT=${v.length ? "FAIL " + v.join(",") : "PASS"}`);
    if (v.length) {
      out("ROLE_STATE=NOLOGIN_LEFT_IN_PLACE");
      return 1;
    }
    stage = "seal";
    const sealed = await sealForGithub(buildConnectionUrl(host, password), env.GSC_ENV_PUBLIC_KEY ?? "");
    const target = path.resolve(env.GSC_SEALED_OUT ?? "");
    const tmp = path.resolve(env.RUNNER_TEMP ?? "/nonexistent");
    if (!target.startsWith(tmp + path.sep)) throw new Error("sealed_out_path");
    writeFileSync(target, JSON.stringify({ key_id: env.GSC_ENV_KEY_ID, run_id: env.GITHUB_RUN_ID ?? "", sha: env.GSC_HEAD_SHA, encrypted_value: sealed }), { mode: 0o600 });
    out("SEALED_CREDENTIAL_WRITTEN=true");
    out("ROLE_LOGIN_ENABLED=false");
    out("PROVISION=CREATED_NOLOGIN");
    return 0;
  } catch (e) {
    out(`PROVISION=FAILED stage=${stage} ${sanitizeError(e)}`);
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

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then((c) => process.exit(c));
}
