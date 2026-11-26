// @vitest-environment node
/**
 * Pure-logic tests for scripts/gsc-provision/provision.ts (no database, no network). The database behaviour
 * (CREATE/RECOVER/ACTIVATE, injected-privilege rejection, connection limit, failed-transfer recovery, TLS, role
 * absent/present, no plaintext output) is proved against a throwaway TLS PostgreSQL by the synthetic harness
 * recorded in the PR description; these tests pin the decision logic so it cannot silently change.
 */
import { describe, expect, it } from "vitest";
import sodium from "libsodium-wrappers";
import {
  CONFIRM,
  EXPECTED,
  buildConnectionUrl,
  evaluateAudit,
  generatePassword,
  identityViolations,
  sanitizeError,
  sealForGithub,
  validateInputs,
  type AuditRow,
} from "../../../scripts/gsc-provision/provision";

const SHA = "a".repeat(40);
const PK = "HsJa4DyZdtuAROPfT/3RG6HzIMcrqrBZ8zjRNMkbogE=";
const base = { mode: "CREATE", confirm: CONFIRM.CREATE, expectedSha: SHA, headSha: SHA, keyId: "3380204578043523366", publicKey: PK };

describe("validateInputs (fail-closed)", () => {
  it("accepts a correct CREATE", () => expect(validateInputs(base)).toEqual([]));
  it("DRY_RUN needs no confirm phrase or key but still needs the exact SHA", () => {
    expect(validateInputs({ ...base, mode: "DRY_RUN", confirm: "", keyId: "", publicKey: "" })).toEqual([]);
    expect(validateInputs({ ...base, mode: "DRY_RUN", headSha: "b".repeat(40) })).toContain("sha_mismatch");
  });
  it.each([
    [{ mode: "BOGUS" }, "mode_invalid"],
    [{ confirm: "create gsc ingestion role" }, "confirm_phrase"],
    [{ confirm: CONFIRM.ACTIVATE }, "confirm_phrase"],
    [{ expectedSha: "HEAD" }, "expected_sha_format"],
    [{ headSha: "b".repeat(40) }, "sha_mismatch"],
    [{ keyId: "abc" }, "key_id_format"],
    [{ publicKey: "AAAA" }, "public_key_format"],
    [{ mode: "RECOVER_NOLOGIN", confirm: CONFIRM.CREATE }, "confirm_phrase"],
    [{ mode: "ACTIVATE", confirm: CONFIRM.CREATE }, "confirm_phrase"],
  ])("refuses %j with %s", (patch, token) => expect(validateInputs({ ...base, ...(patch as object) })).toContain(token));
});

describe("password, URL and sealing", () => {
  it("generates a distinct 256-bit URL-safe password each time", () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("builds only a direct (non-pooler) TLS URL for the dedicated role and database", () => {
    const url = buildConnectionUrl("ep-empty-sky-ay1e6c27.c-5.us-east-2.aws.neon.tech", generatePassword());
    expect(url).toMatch(/^postgresql:\/\/opsiq_gsc_ingestion:[A-Za-z0-9_-]{43}@ep-empty-sky-ay1e6c27\.c-5\.us-east-2\.aws\.neon\.tech\/neondb\?sslmode=require$/);
    expect(() => buildConnectionUrl("ep-empty-sky-ay1e6c27-pooler.c-5.us-east-2.aws.neon.tech", generatePassword())).toThrow("host_invalid");
    expect(() => buildConnectionUrl("h/evil", generatePassword())).toThrow("host_invalid");
    expect(() => buildConnectionUrl("h.example", "short")).toThrow("password_shape");
  });
  it("sealed-box round trip with a synthetic key: ciphertext decrypts to the URL and never contains it", async () => {
    await sodium.ready;
    const kp = sodium.crypto_box_keypair();
    const pub = sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL);
    const pw = generatePassword();
    const url = buildConnectionUrl("h.example", pw);
    const sealed = await sealForGithub(url, pub, sodium as never);
    expect(sealed).not.toContain(pw);
    const opened = sodium.crypto_box_seal_open(sodium.from_base64(sealed, sodium.base64_variants.ORIGINAL), kp.publicKey, kp.privateKey);
    expect(new TextDecoder().decode(opened)).toBe(url);
  });
});

const clean: AuditRow = {
  role_exists: 1, can_login: false, is_superuser: false, can_create_role: false, can_create_db: false, can_replicate: false,
  bypasses_rls: false, conn_limit: 2, memberships: 0, set_role_grants: 0, members_of_role: 0, owned_objects: 0, db_connect: true,
  db_create: false, schema_usage: true, schemas_with_create: 0, target_found: 1, t_select: true, t_insert: true, t_update: true,
  t_extra: false, other_table_access: 0, other_column_access: 0, sequence_access: 0, secdef_executable: 0,
  role_settings: "idle_in_transaction_session_timeout=60s",
};
describe("evaluateAudit (effective-privilege isolation)", () => {
  it("passes the exact intended state before and after activation", () => {
    expect(evaluateAudit(clean, false)).toEqual([]);
    expect(evaluateAudit({ ...clean, can_login: true }, true)).toEqual([]);
  });
  it.each<[Partial<AuditRow>, string]>([
    [{ can_login: true }, "login_enabled_unexpectedly"],
    [{ is_superuser: true }, "elevated_attribute"],
    [{ bypasses_rls: true }, "elevated_attribute"],
    [{ conn_limit: 5 }, "connection_limit"],
    [{ conn_limit: -1 }, "connection_limit"],
    [{ memberships: 1 }, "role_membership"],
    [{ set_role_grants: 1 }, "set_role_grant"],
    [{ owned_objects: 1 }, "owns_objects"],
    [{ db_create: true }, "database_create"],
    [{ schemas_with_create: 1 }, "schema_create"],
    [{ t_update: false }, "target_privileges_missing"],
    [{ t_extra: true }, "target_extra_privileges"],
    [{ other_table_access: 1 }, "other_table_access"],
    [{ other_column_access: 1 }, "other_column_access"],
    [{ sequence_access: 1 }, "sequence_access"],
    [{ secdef_executable: 1 }, "security_definer_executable"],
    [{ role_settings: "" }, "idle_timeout"],
    [{ role_settings: "idle_in_transaction_session_timeout=0" }, "idle_timeout"],
  ])("rejects %j as %s", (patch, token) => expect(evaluateAudit({ ...clean, ...patch }, false)).toContain(token));
  it("a missing role is never audited as OK", () => expect(evaluateAudit({ ...clean, role_exists: 0 }, false)).toEqual(["role_missing"]));
  it("activation fails closed when login is not enabled", () => expect(evaluateAudit(clean, true)).toContain("login_not_enabled"));
});

describe("identity and error sanitisation", () => {
  it("accepts only the exact production identity", () => {
    expect(identityViolations({ endpoint_id: EXPECTED.endpointId, project_id: EXPECTED.projectId, branch_id: EXPECTED.branchId, db: EXPECTED.database })).toEqual([]);
    expect(identityViolations({ endpoint_id: null, project_id: null, branch_id: null, db: "neondb" })).toEqual(["endpoint_mismatch", "project_mismatch", "branch_mismatch"]);
  });
  it("never returns a message, host or statement from an error", () => {
    const e = Object.assign(new Error('CREATE ROLE x PASSWORD \'secret\' failed at host ep-x'), { code: "42501" });
    expect(sanitizeError(e)).toBe("code=42501");
    expect(sanitizeError(new Error("secret"))).toBe("code=none");
    expect(sanitizeError(Object.assign(new Error("x"), { code: "bad code!" }))).toBe("code=none");
  });
});
