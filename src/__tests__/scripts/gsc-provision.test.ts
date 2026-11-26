// @vitest-environment node
/**
 * Decision-logic tests for scripts/gsc-provision/provision.ts. The database is a scripted fake with a small transaction
 * model (BEGIN/ROLLBACK/COMMIT) so every failure path can be injected deterministically. Real-PostgreSQL behaviour
 * (non-superuser operator, TLS, creator-membership, process kill) is proved by the synthetic harness recorded in the PR.
 */
import { describe, expect, it } from "vitest";
import sodium from "libsodium-wrappers";
import {
  CONFIRM,
  EXPECTED,
  PINNED_KEY,
  buildConnectionUrl,
  createPgClient,
  evaluateAudit,
  formatState,
  generatePassword,
  identityViolations,
  main,
  parseState,
  pinDigest,
  pinnedKeyViolations,
  recipientOverrideViolations,
  sanitizeError,
  sealForGithub,
  sha256Hex,
  validateInputs,
  type AuditRow,
  type Db,
  type ProvState,
} from "../../../scripts/gsc-provision/provision";

const SHA = "a".repeat(40);
const RUN = "4242";
const base = { mode: "CREATE", confirm: CONFIRM.CREATE, expectedSha: SHA, headSha: SHA, expectedRunId: "", expectedArtifactSha: "", runId: RUN };

describe("input validation (fail-closed)", () => {
  it("accepts a correct CREATE and a DRY_RUN without phrase", () => {
    expect(validateInputs(base)).toEqual([]);
    expect(validateInputs({ ...base, mode: "DRY_RUN", confirm: "", runId: "" })).toEqual([]);
  });
  it.each([
    [{ mode: "BOGUS" }, "mode_invalid"],
    [{ confirm: "create gsc ingestion role" }, "confirm_phrase"],
    [{ confirm: CONFIRM.ACTIVATE }, "confirm_phrase"],
    [{ expectedSha: "HEAD" }, "expected_sha_format"],
    [{ headSha: "b".repeat(40) }, "sha_mismatch"],
    [{ runId: "" }, "github_run_id_missing"],
    [{ mode: "ACTIVATE", confirm: CONFIRM.ACTIVATE, expectedRunId: "x", expectedArtifactSha: "a".repeat(64) }, "expected_run_id_format"],
    [{ mode: "ACTIVATE", confirm: CONFIRM.ACTIVATE, expectedRunId: RUN, expectedArtifactSha: "zz" }, "expected_artifact_sha_format"],
    [{ mode: "DEACTIVATE", confirm: CONFIRM.CREATE }, "confirm_phrase"],
  ])("refuses %j with %s", (patch, token) => expect(validateInputs({ ...base, ...(patch as object) })).toContain(token));
});

describe("recipient-key provenance (the key is pinned and can never be supplied)", () => {
  it("the pinned key is internally consistent and equals the authoritative key fetched through the Composio connection on 2026-11-26", () => {
    expect(pinnedKeyViolations(PINNED_KEY)).toEqual([]);
    // Rotation checkpoint: changing the key REQUIRES editing these literals (and the constant) in a reviewed change.
    expect(PINNED_KEY.keyId).toBe("3380204578043523366");
    expect(PINNED_KEY.publicKey).toBe("HsJa4DyZdtuAROPfT/3RG6HzIMcrqrBZ8zjRNMkbogE=");
    expect(PINNED_KEY.sha256).toBe(pinDigest(PINNED_KEY));
  });
  it("rejects a wrong but valid public key under the pinned digest", async () => {
    await sodium.ready;
    const other = sodium.to_base64(sodium.crypto_box_keypair().publicKey, sodium.base64_variants.ORIGINAL);
    expect(pinnedKeyViolations({ ...PINNED_KEY, publicKey: other })).toEqual(["pinned_key_digest_mismatch"]);
  });
  it("rejects the correct key under an incorrect key id", () => {
    expect(pinnedKeyViolations({ ...PINNED_KEY, keyId: "3380204578043523367" })).toEqual(["pinned_key_digest_mismatch"]);
  });
  it("a rotated key is accepted ONLY when key, id and digest are updated together (the reviewed-change path)", async () => {
    await sodium.ready;
    const rotated = { keyId: "999", publicKey: sodium.to_base64(sodium.crypto_box_keypair().publicKey, sodium.base64_variants.ORIGINAL) };
    expect(pinnedKeyViolations({ ...rotated, sha256: PINNED_KEY.sha256 })).toEqual(["pinned_key_digest_mismatch"]);
    expect(pinnedKeyViolations({ ...rotated, sha256: pinDigest(rotated) })).toEqual([]);
  });
  it.each([
    [{ ...PINNED_KEY, publicKey: "AAAA" }, "pinned_public_key_format"],
    [{ ...PINNED_KEY, publicKey: "" }, "pinned_public_key_format"],
    [{ ...PINNED_KEY, keyId: "abc" }, "pinned_key_id_format"],
    [{ ...PINNED_KEY, keyId: "" }, "pinned_key_id_format"],
  ])("rejects a malformed key %j", (k, token) => expect(pinnedKeyViolations(k)).toContain(token));
  it("rejects a missing key", () => {
    expect(pinnedKeyViolations(undefined)).toEqual(["pinned_key_missing"]);
    expect(pinnedKeyViolations({ keyId: "1" })).toEqual(["pinned_key_missing"]);
  });
  it.each(["GSC_ENV_PUBLIC_KEY", "GSC_ENV_KEY_ID", "GSC_PUBLIC_KEY", "GSC_KEY_ID"])("a substitution attempt via %s is refused before any database contact", async (name) => {
    expect(recipientOverrideViolations({ [name]: "x" })).toEqual(["recipient_key_override_refused"]);
    const f = fixture({});
    const env = { ...f.env("CREATE"), [name]: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=" };
    const code = await main(env, f.deps());
    expect(code).toBe(2);
    expect(f.lines.join("\n")).toContain("recipient_key_override_refused");
    expect(f.clients).toBe(0);
  });
  it("a tampered pin inside main() refuses before password generation or any connection", async () => {
    const f = fixture({});
    const code = await main(f.env("CREATE"), { ...f.deps(), pin: { ...PINNED_KEY, keyId: "1" } });
    expect(code).toBe(2);
    expect(f.lines.join("\n")).toContain("pinned_key_digest_mismatch");
    expect(f.clients).toBe(0);
    expect(f.passwordCalls).toBe(0);
  });
});

describe("password, URL and sealing", () => {
  it("generates a distinct 256-bit URL-safe password each time", () => {
    const a = generatePassword();
    expect(a).not.toEqual(generatePassword());
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("builds only a direct TLS URL for the dedicated role", () => {
    expect(buildConnectionUrl("ep-empty-sky-ay1e6c27.c-5.us-east-2.aws.neon.tech", generatePassword())).toMatch(/^postgresql:\/\/opsiq_gsc_ingestion:[A-Za-z0-9_-]{43}@ep-empty-sky-ay1e6c27\.c-5\.us-east-2\.aws\.neon\.tech\/neondb\?sslmode=require$/);
    expect(() => buildConnectionUrl("x-pooler.example", generatePassword())).toThrow("host_invalid");
    expect(() => buildConnectionUrl("h.example", "short")).toThrow("password_shape");
  });
  it("sealed-box round trip with a synthetic key", async () => {
    await sodium.ready;
    const kp = sodium.crypto_box_keypair();
    const pub = sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL);
    const url = buildConnectionUrl("h.example", generatePassword());
    const sealed = await sealForGithub(url, pub, sodium as never);
    expect(new TextDecoder().decode(sodium.crypto_box_seal_open(sodium.from_base64(sealed, sodium.base64_variants.ORIGINAL), kp.publicKey, kp.privateKey))).toBe(url);
  });
});

const clean: AuditRow = {
  role_exists: 1, can_login: false, is_superuser: false, can_create_role: false, can_create_db: false, can_replicate: false, bypasses_rls: false,
  conn_limit: 2, memberships: 0, set_role_grants: 0, unexpected_members_of_role: 0, operator_can_administer: true, owned_objects: 0, db_connect: true,
  db_create: false, schema_usage: true, schemas_with_create: 0, target_found: 1, t_select: true, t_insert: true, t_update: true, t_extra: false,
  other_table_access: 0, other_column_access: 0, sequence_access: 0, secdef_executable: 0, role_settings: "idle_in_transaction_session_timeout=60s",
};
describe("evaluateAudit (effective-privilege isolation)", () => {
  it("passes the exact intended state before and after activation", () => {
    expect(evaluateAudit(clean, false)).toEqual([]);
    expect(evaluateAudit({ ...clean, can_login: true }, true)).toEqual([]);
  });
  it.each<[Partial<AuditRow>, string]>([
    [{ can_login: true }, "login_enabled_unexpectedly"], [{ is_superuser: true }, "elevated_attribute"], [{ bypasses_rls: true }, "elevated_attribute"],
    [{ conn_limit: 5 }, "connection_limit"], [{ memberships: 1 }, "role_membership"], [{ set_role_grants: 1 }, "set_role_grant"],
    [{ unexpected_members_of_role: 1 }, "unexpected_role_member"], [{ operator_can_administer: false }, "operator_cannot_administer"],
    [{ owned_objects: 1 }, "owns_objects"], [{ db_create: true }, "database_create"], [{ schemas_with_create: 1 }, "schema_create"],
    [{ t_update: false }, "target_privileges_missing"], [{ t_extra: true }, "target_extra_privileges"], [{ other_table_access: 1 }, "other_table_access"],
    [{ other_column_access: 1 }, "other_column_access"], [{ sequence_access: 1 }, "sequence_access"], [{ secdef_executable: 1 }, "security_definer_executable"],
    [{ role_settings: "" }, "idle_timeout"],
  ])("rejects %j as %s", (patch, token) => expect(evaluateAudit({ ...clean, ...patch }, false)).toContain(token));
  it("a missing role is never audited as OK; activation fails closed when login is off", () => {
    expect(evaluateAudit({ ...clean, role_exists: 0 }, false)).toEqual(["role_missing"]);
    expect(evaluateAudit(clean, true)).toContain("login_not_enabled");
  });
});

describe("pg client factory", () => {
  it("handles the 'error' event so a server-terminated connection cannot crash the process with a raw error", () => {
    const c = createPgClient({ host: "127.0.0.1", port: 1 }) as unknown as { listenerCount(e: string): number };
    expect(c.listenerCount("error")).toBeGreaterThan(0);
  });
});

describe("state record", () => {
  const s: ProvState = { gen: 1, run: RUN, sha: SHA, key: pinDigest(PINNED_KEY).slice(0, 16), art: "PENDING", state: "PROVISIONED" };
  it("round-trips and rejects anything malformed", () => {
    expect(parseState(formatState(s))).toEqual(s);
    for (const bad of [null, "", "GSCPROV1 {", "GSCPROV1 {}", formatState({ ...s, sha: "x" }), formatState({ ...s, art: "nope" }), "hello " + JSON.stringify(s)]) expect(parseState(bad as string)).toBeNull();
  });
});

describe("identity and error sanitisation", () => {
  it("accepts only the exact production identity", () => {
    expect(identityViolations({ endpoint_id: EXPECTED.endpointId, project_id: EXPECTED.projectId, branch_id: EXPECTED.branchId, db: EXPECTED.database })).toEqual([]);
    expect(identityViolations({ endpoint_id: null, project_id: null, branch_id: null, db: "neondb" })).toEqual(["endpoint_mismatch", "project_mismatch", "branch_mismatch"]);
  });
  it("never returns a message, host or statement from an error", () => {
    expect(sanitizeError(Object.assign(new Error("CREATE ROLE x PASSWORD 'secret' at host ep-x"), { code: "42501" }))).toBe("code=42501");
    expect(sanitizeError(new Error("secret"))).toBe("code=none");
  });
});

// ------------------------------------------------------------------ scripted database
interface Role { exists: boolean; login: boolean; comment: string | null }
type Row = Record<string, unknown>;
interface FixtureOpts {
  role?: Partial<Role>;
  audit?: Partial<AuditRow>;
  failOn?: RegExp; // throw (with a code) when a statement matching this runs on the MAIN connection
  failAfterOn?: RegExp; // execute the statement for real, then throw (interrupted response)
  freshFails?: boolean; // the reconcile connection cannot connect
  freshAudit?: Partial<AuditRow>;
}
const PIN_TAG = pinDigest(PINNED_KEY).slice(0, 16);
function fixture(o: FixtureOpts, pin = PINNED_KEY) {
  const st: Role = { exists: false, login: false, comment: null, ...o.role };
  const log: string[] = [];
  const lines: string[] = [];
  const files: Record<string, string> = {};
  let snapshot: Role | null = null;
  let clients = 0;
  let passwordCalls = 0;
  const PW = "SyntheticPasswordForTestsOnly_0123456789ABCDE";
  const auditRow = (extra: Partial<AuditRow> = {}): Row => ({ ...clean, role_exists: st.exists ? 1 : 0, can_login: st.login, ...o.audit, ...extra });
  const handler = (isFresh: boolean) => async (sql: string): Promise<{ rows: Row[] }> => {
    log.push(`${isFresh ? "F:" : "M:"}${sql.replace(/PASSWORD '[^']*'/, "PASSWORD '<redacted-in-fake>'")}`);
    const failMatch = !isFresh && o.failOn && o.failOn.test(sql);
    if (failMatch) throw Object.assign(new Error("injected failure with secret-looking text " + PW), { code: "57P01" });
    const apply = () => {
      if (/^BEGIN/.test(sql)) snapshot = { ...st };
      else if (/^ROLLBACK/.test(sql)) { if (snapshot) Object.assign(st, snapshot); snapshot = null; }
      else if (/^COMMIT/.test(sql)) snapshot = null;
      else if (/^CREATE ROLE/.test(sql)) { st.exists = true; st.login = false; }
      else if (/ALTER ROLE \S+ LOGIN$/.test(sql)) st.login = true;
      else if (/ALTER ROLE \S+ NOLOGIN$/.test(sql)) st.login = false;
      else if (/^COMMENT ON ROLE/.test(sql)) st.comment = /IS '(.*)'$/.exec(sql)?.[1] ?? null;
    };
    let result: { rows: Row[] };
    if (/current_setting\('neon\.endpoint_id'/.test(sql)) result = { rows: [{ endpoint_id: EXPECTED.endpointId, project_id: EXPECTED.projectId, branch_id: EXPECTED.branchId, db: EXPECTED.database }] };
    else if (/AS can_create/.test(sql)) result = { rows: [{ can_create: true, owns_target: true, role_exists: st.exists ? 1 : 0, role_login: st.exists ? st.login : null, role_comment: st.comment }] };
    else if (/pg_try_advisory_lock/.test(sql)) result = { rows: [{ got: true }] };
    else if (/AS rolcanlogin|rolcanlogin AS login/.test(sql)) result = { rows: st.exists ? [{ login: st.login, c: st.comment }] : [] };
    else if (/^AUDIT$/.test(sql.trim())) result = { rows: [auditRow(isFresh ? o.freshAudit : {})] };
    else { apply(); result = { rows: [] }; }
    if (!isFresh && o.failAfterOn && o.failAfterOn.test(sql)) throw Object.assign(new Error("connection reset"), { code: "08006" });
    return result;
  };
  const mk = (isFresh: boolean): Db => ({
    connect: async () => { if (isFresh && o.freshFails) throw Object.assign(new Error("no route"), { code: "ECONNREFUSED" }); },
    query: handler(isFresh),
    escapeLiteral: (s: string) => `'${s.replace(/'/g, "''")}'`,
    end: async () => undefined,
  });
  const deps = () => ({
    newClient: () => { clients += 1; return mk(clients > 1); },
    pin,
    auditSql: () => "AUDIT",
    password: () => { passwordCalls += 1; return PW; },
    writeSealed: (f: string, c: string) => { files[f] = c; },
    out: (l: string) => void lines.push(l),
  });
  const env = (mode: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
    DATABASE_URL: "postgresql://op:pw@ep-test.example.neon.tech/neondb", GSC_EXPECTED_HOST: "ep-test.example.neon.tech",
    GSC_MODE: mode, GSC_CONFIRM: mode === "DRY_RUN" ? "" : CONFIRM[mode as keyof typeof CONFIRM], GSC_EXPECTED_SHA: SHA, GSC_HEAD_SHA: SHA,
    GITHUB_RUN_ID: RUN, RUNNER_TEMP: "/tmp/runner", GSC_SEALED_OUT: "/tmp/runner/sealed.json", ...extra,
  });
  return { st, log, lines, files, deps, env, PW, get clients() { return clients; }, get passwordCalls() { return passwordCalls; } };
}
const art = "b".repeat(64);
const prov = (over: Partial<ProvState> = {}): string => formatState({ gen: 1, run: RUN, sha: SHA, key: PIN_TAG, art, state: "PROVISIONED", ...over });
const activateEnv = (f: ReturnType<typeof fixture>, over: Record<string, string> = {}) => f.env("ACTIVATE", { GSC_EXPECTED_RUN_ID: RUN, GSC_EXPECTED_ARTIFACT_SHA: art, GITHUB_RUN_ID: "9000", ...over });
const text = (f: ReturnType<typeof fixture>) => f.lines.join("\n");
const mainTxn = (f: ReturnType<typeof fixture>) => f.log.filter((l) => l.startsWith("M:")).map((l) => l.slice(2));

describe("DRY_RUN fails closed and never mutates", () => {
  const cases: Array<[string, FixtureOpts, number, string]> = [
    ["role absent -> creation-ready", {}, 0, "CREATE_READY"],
    ["NOLOGIN provisioned + sealed -> activate-ready", { role: { exists: true, login: false, comment: prov() } }, 0, "ACTIVATE_READY"],
    ["NOLOGIN, artifact still PENDING -> recovery candidate", { role: { exists: true, login: false, comment: prov({ art: "PENDING" }) } }, 0, "RECOVER_CANDIDATE"],
    ["NOLOGIN deactivated -> recovery candidate", { role: { exists: true, login: false, comment: prov({ state: "DEACTIVATED" }) } }, 0, "RECOVER_CANDIDATE"],
    ["healthy active role", { role: { exists: true, login: true, comment: prov({ state: "ACTIVATED" }) }, audit: {} }, 0, "HEALTHY_ACTIVE"],
    ["existing role with unexpected privileges -> failure", { role: { exists: true, login: false, comment: prov() }, audit: { other_table_access: 1 } }, 1, "UNEXPECTED_PRIVILEGES"],
    ["active role that is over-privileged -> failure", { role: { exists: true, login: true, comment: prov({ state: "ACTIVATED" }) }, audit: { memberships: 1 } }, 1, "UNEXPECTED_PRIVILEGES"],
    ["existing role without a provisioning record -> unknown", { role: { exists: true, login: false, comment: null } }, 1, "UNKNOWN_STATE"],
    ["LOGIN role whose record says PROVISIONED -> unknown", { role: { exists: true, login: true, comment: prov() } }, 1, "UNKNOWN_STATE"],
  ];
  it.each(cases)("%s", async (_n, o, code, token) => {
    const f = fixture(o);
    expect(await main(f.env("DRY_RUN"), f.deps())).toBe(code);
    expect(text(f)).toContain(token);
    expect(mainTxn(f).some((s) => /^(CREATE|ALTER ROLE|GRANT|COMMENT|BEGIN|COMMIT)/.test(s))).toBe(false);
    expect(mainTxn(f)).toContain("SET default_transaction_read_only = on");
  });
});

describe("CREATE / RECOVER_NOLOGIN", () => {
  it("CREATE makes a NOLOGIN role, records the state, seals to the pinned key and never prints the password", async () => {
    await sodium.ready;
    const kp = sodium.crypto_box_keypair();
    const pub = sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL);
    const pin = { keyId: "777", publicKey: pub, sha256: pinDigest({ keyId: "777", publicKey: pub }) };
    const f = fixture({}, pin);
    expect(await main(f.env("CREATE"), f.deps())).toBe(0);
    expect(f.st).toMatchObject({ exists: true, login: false });
    const rec = parseState(f.st.comment)!;
    const file = JSON.parse(f.files["/tmp/runner/sealed.json"]);
    expect(rec).toMatchObject({ gen: 1, run: RUN, sha: SHA, state: "PROVISIONED", art: file.sealed_sha256 });
    expect(file).toMatchObject({ run_id: RUN, sha: SHA, key_id: "777", key_sha256: pin.sha256, gen: 1 });
    expect(file.sealed_sha256).toBe(sha256Hex(file.encrypted_value));
    expect(text(f)).toContain(`SEALED_ARTIFACT_SHA256=${file.sealed_sha256}`);
    const opened = new TextDecoder().decode(sodium.crypto_box_seal_open(sodium.from_base64(file.encrypted_value, sodium.base64_variants.ORIGINAL), kp.publicKey, kp.privateKey));
    expect(opened).toContain(f.PW);
    const everything = text(f) + JSON.stringify(f.files) + f.log.join("\n");
    expect(everything).not.toContain(f.PW);
  });
  it("CREATE refuses when the role already exists and never generates a password", async () => {
    const f = fixture({ role: { exists: true, login: false, comment: prov() } });
    expect(await main(f.env("CREATE"), f.deps())).toBe(1);
    expect(text(f)).toContain("role_already_exists");
    expect(f.passwordCalls).toBe(0);
  });
  it("a failed seal leaves the role NOLOGIN with a PENDING artifact (recovery candidate), and the error text carries no secret", async () => {
    const f = fixture({});
    const env = f.env("CREATE", { GSC_SEALED_OUT: "/etc/escape.json" });
    expect(await main(env, f.deps())).toBe(1);
    expect(f.st.login).toBe(false);
    expect(parseState(f.st.comment)?.art).toBe("PENDING");
    expect(text(f)).toContain("PROVISION=FAILED stage=seal");
    expect(text(f)).not.toContain(f.PW);
  });
  it("RECOVER_NOLOGIN rotates the generation and invalidates the earlier artifact", async () => {
    const f = fixture({ role: { exists: true, login: false, comment: prov() } });
    expect(await main(f.env("RECOVER_NOLOGIN", { GITHUB_RUN_ID: "5000" }), f.deps())).toBe(0);
    const rec = parseState(f.st.comment)!;
    expect(rec).toMatchObject({ gen: 2, run: "5000", state: "PROVISIONED" });
    expect(rec.art).not.toBe(art);
    // stale-artifact rejection: ACTIVATE with the OLD run id and artifact digest is now refused
    const g = fixture({ role: { exists: true, login: false, comment: f.st.comment } });
    expect(await main(activateEnv(g), g.deps())).toBe(1);
    expect(text(g)).toMatch(/run_id_mismatch,artifact_sha_mismatch_or_stale/);
    expect(g.st.login).toBe(false);
  });
  it.each<[string, Partial<Role>, FixtureOpts["audit"], string]>([
    ["a LOGIN role (a healthy credential is never reset blindly)", { exists: true, login: true, comment: prov({ state: "ACTIVATED" }) }, {}, "role_is_login_use_deactivate_first"],
    ["an absent role", { exists: false }, {}, "role_absent"],
    ["a role without a valid record", { exists: true, login: false, comment: null }, {}, "no_valid_provisioning_record"],
    ["an over-privileged NOLOGIN role (credential not reset)", { exists: true, login: false, comment: prov() }, { other_table_access: 1 }, "other_table_access"],
  ])("RECOVER_NOLOGIN refuses %s", async (_n, role, audit, token) => {
    const f = fixture({ role, audit });
    expect(await main(f.env("RECOVER_NOLOGIN"), f.deps())).toBe(1);
    expect(text(f)).toContain(token);
    expect(f.passwordCalls).toBe(0);
    expect(mainTxn(f).some((s) => /PASSWORD/.test(s))).toBe(false);
  });
});

describe("ACTIVATE state transition (bound to run, artifact, commit and key)", () => {
  const ok = () => fixture({ role: { exists: true, login: false, comment: prov() } });
  it("activates when every binding matches, in ONE transaction with the audit before COMMIT", async () => {
    const f = ok();
    expect(await main(activateEnv(f), f.deps())).toBe(0);
    expect(f.st.login).toBe(true);
    expect(parseState(f.st.comment)).toMatchObject({ state: "ACTIVATED", act: "9000" });
    const s = mainTxn(f);
    const begin = s.indexOf("BEGIN");
    const alter = s.findIndex((x) => /ALTER ROLE \S+ LOGIN$/.test(x));
    const post = s.indexOf("AUDIT", alter);
    const commit = s.indexOf("COMMIT");
    expect(begin).toBeGreaterThan(-1);
    expect(alter).toBeGreaterThan(begin);
    expect(post).toBeGreaterThan(alter);
    expect(commit).toBeGreaterThan(post);
  });
  it.each<[string, Record<string, string>, Partial<Role>, string]>([
    ["wrong run id", { GSC_EXPECTED_RUN_ID: "1" }, {}, "run_id_mismatch"],
    ["stale or wrong artifact digest", { GSC_EXPECTED_ARTIFACT_SHA: "c".repeat(64) }, {}, "artifact_sha_mismatch_or_stale"],
    ["different commit than the CREATE run", { GSC_EXPECTED_SHA: "d".repeat(40), GSC_HEAD_SHA: "d".repeat(40) }, {}, "commit_mismatch"],
    ["pinned key changed since CREATE", {}, { comment: prov({ key: "0".repeat(16) }) }, "pinned_key_mismatch"],
    ["artifact still pending", {}, { comment: prov({ art: "PENDING" }) }, "artifact_sha_mismatch_or_stale"],
    ["already active", {}, { login: true, comment: prov({ state: "ACTIVATED" }) }, "already_login"],
    ["no record", {}, { comment: null }, "no_valid_provisioning_record"],
  ])("refuses %s without touching the role", async (_n, env, role, token) => {
    const f = fixture({ role: { exists: true, login: false, comment: prov(), ...role } });
    expect(await main(activateEnv(f, env), f.deps())).toBe(1);
    expect(text(f)).toContain(token);
    expect(mainTxn(f).some((s) => /^(BEGIN|COMMIT|ALTER ROLE|COMMENT)/.test(s))).toBe(false);
  });
  it("an audit violation BEFORE activation leaves the role NOLOGIN and never begins a transaction", async () => {
    const f = fixture({ role: { exists: true, login: false, comment: prov() }, audit: { sequence_access: 1 } });
    expect(await main(activateEnv(f), f.deps())).toBe(1);
    expect(f.st.login).toBe(false);
    expect(mainTxn(f)).not.toContain("BEGIN");
  });
  it("an audit violation AFTER ALTER ... LOGIN rolls back; COMMIT is never sent", async () => {
    const f = ok();
    let audits = 0;
    const deps = f.deps();
    const base = deps.newClient;
    deps.newClient = (cfg: unknown) => {
      const c = base(cfg as never);
      const q = c.query.bind(c);
      c.query = async (sql: string, p?: unknown[]) => {
        const r = await q(sql, p);
        if (sql === "AUDIT" && (audits += 1) === 2) r.rows[0] = { ...r.rows[0], other_column_access: 1 };
        return r;
      };
      return c;
    };
    expect(await main(activateEnv(f), deps)).toBe(1);
    expect(f.st.login).toBe(false);
    expect(mainTxn(f)).toContain("ROLLBACK");
    expect(mainTxn(f)).not.toContain("COMMIT");
    expect(text(f)).toContain("NOLOGIN_ROLLED_BACK");
  });
  it("failure at ALTER ROLE ... LOGIN: rollback attempted, no COMMIT, role observed NOLOGIN over a fresh connection", async () => {
    const f = fixture({ role: { exists: true, login: false, comment: prov() }, failOn: /ALTER ROLE \S+ LOGIN$/ });
    expect(await main(activateEnv(f), f.deps())).toBe(1);
    expect(f.st.login).toBe(false);
    expect(mainTxn(f)).toContain("ROLLBACK");
    expect(mainTxn(f)).not.toContain("COMMIT");
    expect(text(f)).toContain("ROLE_STATE_OBSERVED=NOLOGIN");
    expect(text(f)).toContain("ACTIVATE=RESOLVED_NOLOGIN_VERIFIED");
  });
  it("an exception during the post-activation audit triggers rollback and reconciliation (not a silent LOGIN)", async () => {
    const f = ok();
    const deps = f.deps();
    const base = deps.newClient;
    let n = 0;
    deps.newClient = (cfg: unknown) => {
      const c = base(cfg as never);
      const q = c.query.bind(c);
      const mine = (n += 1) === 1;
      let audits = 0;
      c.query = async (sql: string, p?: unknown[]) => {
        if (mine && sql === "AUDIT" && (audits += 1) === 2) throw Object.assign(new Error("audit timeout"), { code: "57014" });
        return q(sql, p);
      };
      return c;
    };
    expect(await main(activateEnv(f), deps)).toBe(1);
    expect(f.st.login).toBe(false);
    expect(mainTxn(f)).toContain("ROLLBACK");
    expect(text(f)).toContain("ROLE_STATE_OBSERVED=NOLOGIN");
  });
  it("COMMIT interrupted, role observed ACTIVE with a passing audit and ACTIVATED record: verified active (exit 0), never assumed", async () => {
    const f = fixture({ role: { exists: true, login: false, comment: prov() }, failAfterOn: /^COMMIT/ });
    expect(await main(activateEnv(f), f.deps())).toBe(0);
    expect(text(f)).toContain("COMMIT_ATTEMPTED=true");
    expect(text(f)).toContain("ACTIVATE=UNCERTAIN_RESOLVED_ACTIVE_VERIFIED");
  });
  it("COMMIT interrupted and the transaction did not commit: observed NOLOGIN (exit 1)", async () => {
    const f = fixture({ role: { exists: true, login: false, comment: prov() }, failOn: /^COMMIT/ });
    expect(await main(activateEnv(f), f.deps())).toBe(1);
    expect(f.st.login).toBe(false);
    expect(text(f)).toContain("ACTIVATE=RESOLVED_NOLOGIN_VERIFIED");
  });
  it("COMMIT interrupted and the state cannot be re-read: explicit UNCERTAIN outcome (exit 3), not reported as safe", async () => {
    const f = fixture({ role: { exists: true, login: false, comment: prov() }, failAfterOn: /^COMMIT/, freshFails: true });
    expect(await main(activateEnv(f), f.deps())).toBe(3);
    expect(text(f)).toContain("ACTIVATE=UNCERTAIN_STATE_UNVERIFIED");
    expect(text(f)).not.toMatch(/NOLOGIN_VERIFIED|ACTIVE_VERIFIED/);
  });
  it("COMMIT interrupted, observed LOGIN but the fresh audit fails: UNCERTAIN, instructs DEACTIVATE (exit 3)", async () => {
    const f = fixture({ role: { exists: true, login: false, comment: prov() }, failAfterOn: /^COMMIT/, freshAudit: { other_table_access: 2 } });
    expect(await main(activateEnv(f), f.deps())).toBe(3);
    expect(text(f)).toContain("RUN_DEACTIVATE");
  });
});

describe("DEACTIVATE (explicit compensating step)", () => {
  it("moves an active recorded role to NOLOGIN/DEACTIVATED in one transaction", async () => {
    const f = fixture({ role: { exists: true, login: true, comment: prov({ state: "ACTIVATED" }) } });
    expect(await main(f.env("DEACTIVATE"), f.deps())).toBe(0);
    expect(f.st.login).toBe(false);
    expect(parseState(f.st.comment)?.state).toBe("DEACTIVATED");
  });
  it("refuses a role that is not an active recorded role", async () => {
    const f = fixture({ role: { exists: true, login: false, comment: prov() } });
    expect(await main(f.env("DEACTIVATE"), f.deps())).toBe(1);
  });
});
